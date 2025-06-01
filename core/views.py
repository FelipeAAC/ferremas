from django.shortcuts import render, redirect
from django.conf import settings
from django.core.files.storage import FileSystemStorage
from .forms import ProductImageUploadForm
import requests
import logging
import os
import time
from django.contrib.auth.decorators import login_required, user_passes_test
from django.http import JsonResponse
from django.urls import reverse
import json
from django.contrib.auth import authenticate, login
from django.views.decorators.csrf import csrf_exempt
from django.middleware.csrf import get_token


logger = logging.getLogger(__name__)

API_CRUD_BASE_URL = "http://127.0.0.1:8001"
API_AUTH_BASE_URL = "http://127.0.0.1:8002"

@csrf_exempt
def paypal_capture_order_view(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            paypal_order_id = data.get('orderID')
            cart = data.get('cart', [])

            if not paypal_order_id:
                logger.warning("Intento de captura de PayPal sin orderID.")
                return JsonResponse({'success': False, 'error': 'No se proporcionó orderID de PayPal.'}, status=400)

            logger.info(f"Recibido orderID de PayPal: {paypal_order_id} para captura.")

            access_token = get_paypal_access_token()
            if not access_token:
                logger.error("Fallo crítico: No se pudo obtener token de acceso de PayPal para capturar orden.")
                return JsonResponse({'success': False, 'error': 'Error de autenticación con PayPal. No se pudo procesar el pago.'}, status=500)

            capture_response = capture_paypal_order(paypal_order_id, access_token)
            logger.info(f"Respuesta de captura de PayPal para {paypal_order_id}: {json.dumps(capture_response)}")

            if capture_response and capture_response.get('status') == 'COMPLETED':
                logger.info(f"Pago COMPLETO para orden PayPal {paypal_order_id}.")

                # --- CREAR PEDIDO EN FASTAPI ---
                total_pedido = float(
                    capture_response.get('purchase_units', [{}])[0]
                    .get('payments', {}).get('captures', [{}])[0]
                    .get('amount', {}).get('value', 0)
                )
                id_cliente = request.user.id if request.user.is_authenticated else None

                pedido_payload = {
                    "id_cliente": id_cliente,
                    "total_pedido": total_pedido,
                    "detalles": [
                        {
                            "id_producto": item.get("id"),
                            "cantidad": item.get("quantity"),
                            "precio_unitario_venta": item.get("price"),
                            "subtotal": item.get("price") * item.get("quantity")
                        } for item in cart
                    ]
                }

                try:
                    api_response = requests.post(
                        f"{API_CRUD_BASE_URL}/pedidopost",
                        json=pedido_payload,
                        timeout=10
                    )
                    api_response.raise_for_status()
                    pedido_data = api_response.json()
                    ferremas_order_id = pedido_data.get("id_pedido", f"FM-PP-{int(time.time())}")
                except Exception as e:
                    logger.error(f"Error al crear pedido en FastAPI: {e}")
                    return JsonResponse({'success': False, 'error': 'Pago capturado, pero error al registrar el pedido. Contacta soporte.'}, status=500)

                # Guardar información relevante en la sesión para la página de éxito
                request.session['paypal_order_details'] = {
                    'paypal_id': capture_response.get('id'),
                    'status': capture_response.get('status'),
                    'amount': capture_response.get('purchase_units', [{}])[0].get('payments', {}).get('captures', [{}])[0].get('amount', {}),
                    'payer_email': capture_response.get('payer', {}).get('email_address'),
                    'payer_name': f"{capture_response.get('payer', {}).get('name', {}).get('given_name', '')} {capture_response.get('payer', {}).get('name', {}).get('surname', '')}".strip(),
                    'ferremas_order_id': ferremas_order_id
                }

                success_url = reverse('core:compra_exitosa_with_order', kwargs={'numero_orden': ferremas_order_id})
                return JsonResponse({'success': True, 'message': 'Pago capturado y pedido registrado.', 'redirect_url': success_url})

            else:
                error_message = "Error al procesar el pago con PayPal."
                if capture_response:
                    if 'error_description' in capture_response:
                        error_message = capture_response['error_description']
                    elif 'message' in capture_response:
                        error_message = capture_response['message']
                    elif 'details' in capture_response and isinstance(capture_response['details'], list):
                        error_message = "; ".join([f"{err.get('issue','')} - {err.get('description','')}" for err in capture_response['details']])

                logger.error(f"Fallo al capturar orden de PayPal {paypal_order_id} o estado no completado. Respuesta: {capture_response}")
                return JsonResponse({'success': False, 'error': f"PayPal: {error_message}"}, status=400)

        except json.JSONDecodeError:
            logger.error("Error al decodificar JSON de la petición POST para paypal_capture_order_view.")
            return JsonResponse({'success': False, 'error': 'Petición malformada.'}, status=400)
        except Exception as e:
            logger.exception("Excepción inesperada en paypal_capture_order_view.")
            return JsonResponse({'success': False, 'error': f'Error interno del servidor al procesar pago.'}, status=500)

    logger.warning(f"Método {request.method} no permitido para paypal_capture_order_view.")
    return JsonResponse({'success': False, 'error': 'Método no permitido.'}, status=405)

def is_admin_user(user):
    return user.is_authenticated and user.is_staff

def is_bodeguero_user(user):
    return user.is_authenticated and user.groups.filter(name='Bodegueros').exists()

def is_empleado_user(user):
    return user.is_authenticated and user.groups.filter(name='EmpleadosVentas').exists()

def perfil_view(request):
    context = {
        'page_title': 'Mi Perfil',
        'api_auth_url_js': API_AUTH_BASE_URL,
        'api_crud_url_js': API_CRUD_BASE_URL,
        'MEDIA_URL': settings.MEDIA_URL
    }
    return render(request, 'core/perfil.html', context)

def registro_view(request):
    context = {
        'page_title': 'Registro de Usuario',
        'api_auth_url_js': API_AUTH_BASE_URL
    }
    return render(request, 'core/registro.html', context)

def login_view(request):
    context = {
        'page_title': 'Iniciar Sesión',
        'api_auth_url_js': API_AUTH_BASE_URL
    }
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            next_url = request.GET.get('next') or 'core:index'
            return redirect(next_url)
        else:
            context['error'] = "Usuario o contraseña incorrectos"
    return render(request, 'core/login.html', context)

def index_view(request):
    context = {
        'page_title': 'Bienvenido a Ferremas',
        'welcome_message': 'Tu ferretería online de confianza.',
        'api_auth_url_js': API_AUTH_BASE_URL,
        'api_crud_url_js': API_CRUD_BASE_URL
    }
    return render(request, 'core/index.html', context)

def productos(request):
    structured_categories_list = []
    api_error_message = None

    try:
        response_categorias = requests.get(f"{API_CRUD_BASE_URL}/categoriasget")
        response_categorias.raise_for_status()
        api_categorias_raw = response_categorias.json()

        response_productos = requests.get(f"{API_CRUD_BASE_URL}/productosget")
        response_productos.raise_for_status()
        api_productos_raw = response_productos.json()
        
        categories_with_products = {}

        for cat_data in api_categorias_raw:
            categories_with_products[cat_data['id_categoria']] = {
                'id': str(cat_data['id_categoria']),
                'name': cat_data['descripcion'],
                'products': []
            }

        for prod_data in api_productos_raw:
            categoria_id = prod_data.get('id_categoria')
            if categoria_id in categories_with_products:
                categories_with_products[categoria_id]['products'].append({
                    'id': prod_data.get('id_producto'),
                    'name': prod_data.get('nombre', 'Producto sin nombre'),
                    'price': prod_data.get('precio', 0.0),
                    'imagen_url': prod_data.get('imagen_url'),
                    'marca': prod_data.get('marca'),
                    'descripcion_detallada': prod_data.get('descripcion_detallada'),
                    'id_categoria': prod_data.get('id_categoria')
                })
            else:
                product_name = prod_data.get('nombre', f"ID {prod_data.get('id_producto', 'Desconocido')}")
                logger.warning(f"Producto '{product_name}' con id_categoria {categoria_id} no encontrado en categorías cargadas o id_categoria es nulo.")

        structured_categories_list = list(categories_with_products.values())

    except requests.exceptions.ConnectionError as e:
        logger.error(f"Error de conexión al API CRUD: {e}")
        api_error_message = "No se pudo conectar al servicio de productos. Inténtalo más tarde."
    except requests.exceptions.HTTPError as e:
        logger.error(f"Error HTTP del API CRUD: {e.response.status_code} - {e.response.text}")
        error_detail = "Error al obtener datos de la API."
        try:
            error_detail = e.response.json().get('detail', error_detail)
        except requests.exceptions.JSONDecodeError:
            error_detail = e.response.text if e.response.text else error_detail
        api_error_message = f"Error ({e.response.status_code}): {error_detail}"
    except Exception as e:
        logger.error(f"Error inesperado al procesar datos de productos: {e}", exc_info=True)
        api_error_message = "Ocurrió un error inesperado al cargar los productos."

    context = {
        'page_title': 'Catálogo de Productos',
        'categories_list': structured_categories_list,
        'api_error_message': api_error_message,
        'api_auth_url_js': API_AUTH_BASE_URL,
        'api_crud_url_js': API_CRUD_BASE_URL,
        'MEDIA_URL': settings.MEDIA_URL
    }
    return render(request, 'core/productos.html', context)

def get_paypal_access_token():
    """
    Obtiene un token de acceso de PayPal.
    """
    auth = (settings.PAYPAL_CLIENT_ID, settings.PAYPAL_CLIENT_SECRET)
    data = {'grant_type': 'client_credentials'}
    headers = {'Accept': 'application/json', 'Accept-Language': 'en_US'}
    
    try:
        response = requests.post(
            f"{settings.PAYPAL_API_BASE_URL}/v1/oauth2/token",
            auth=auth,
            data=data,
            headers=headers,
            timeout=10 # Añadir timeout
        )
        response.raise_for_status()
        token_data = response.json()
        logger.info("Token de acceso de PayPal obtenido exitosamente.")
        return token_data.get('access_token')
    except requests.exceptions.RequestException as e:
        logger.error(f"Error al obtener token de PayPal: {e}")
        if hasattr(e, 'response') and e.response is not None:
            logger.error(f"Respuesta de PayPal (token): {e.response.status_code} - {e.response.text}")
        return None

def capture_paypal_order(order_id, access_token):
    """
    Captura una orden de PayPal usando el Order ID.
    """
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {access_token}',
        'PayPal-Request-Id': f'capture-{order_id}-{int(time.time())}' # Para idempotencia
    }
    capture_url = f"{settings.PAYPAL_API_BASE_URL}/v2/checkout/orders/{order_id}/capture"
    
    try:
        response = requests.post(capture_url, headers=headers, json={}, timeout=20) # Añadir timeout
        response.raise_for_status()
        logger.info(f"Orden PayPal {order_id} capturada exitosamente.")
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"Error al capturar orden de PayPal {order_id}: {e}")
        if hasattr(e, 'response') and e.response is not None:
            logger.error(f"Respuesta de PayPal (captura): {e.response.status_code} - {e.response.text}")
            try:
                return e.response.json()
            except json.JSONDecodeError:
                return {'error_description': e.response.text, 'paypal_status_code': e.response.status_code} # Nombre de error más genérico
        return {'error_description': str(e)} # Nombre de error más genérico

@csrf_exempt # Para producción, envía el token CSRF desde JS en las cabeceras.
def paypal_capture_order_view(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            paypal_order_id = data.get('orderID')
            
            if not paypal_order_id:
                logger.warning("Intento de captura de PayPal sin orderID.")
                return JsonResponse({'success': False, 'error': 'No se proporcionó orderID de PayPal.'}, status=400)

            logger.info(f"Recibido orderID de PayPal: {paypal_order_id} para captura.")

            access_token = get_paypal_access_token()
            if not access_token:
                logger.error("Fallo crítico: No se pudo obtener token de acceso de PayPal para capturar orden.")
                return JsonResponse({'success': False, 'error': 'Error de autenticación con PayPal. No se pudo procesar el pago.'}, status=500)

            capture_response = capture_paypal_order(paypal_order_id, access_token)
            
            logger.info(f"Respuesta de captura de PayPal para {paypal_order_id}: {json.dumps(capture_response)}")

            if capture_response and capture_response.get('status') == 'COMPLETED':
                logger.info(f"Pago COMPLETO para orden PayPal {paypal_order_id}.")
                
                ferremas_order_id = f"FM-PP-{int(time.time())}" # Simulación
                
                # Guardar información relevante en la sesión para la página de éxito
                # Esta información es para mostrar al usuario, no para la lógica de negocio crítica.
                request.session['paypal_order_details'] = {
                    'paypal_id': capture_response.get('id'),
                    'status': capture_response.get('status'),
                    'amount': capture_response.get('purchase_units', [{}])[0].get('payments', {}).get('captures', [{}])[0].get('amount', {}),
                    'payer_email': capture_response.get('payer', {}).get('email_address'),
                    'payer_name': f"{capture_response.get('payer', {}).get('name', {}).get('given_name', '')} {capture_response.get('payer', {}).get('name', {}).get('surname', '')}".strip(),
                    'ferremas_order_id': ferremas_order_id
                }
                
                success_url = reverse('core:compra_exitosa_with_order', kwargs={'numero_orden': ferremas_order_id})
                return JsonResponse({'success': True, 'message': 'Pago capturado exitosamente.', 'redirect_url': success_url})
            
            else:
                error_message = "Error al procesar el pago con PayPal."
                if capture_response:
                    if 'error_description' in capture_response: # Usar el campo que definimos
                        error_message = capture_response['error_description']
                    elif 'message' in capture_response: # Algunos errores de PayPal vienen en 'message'
                        error_message = capture_response['message']
                    elif 'details' in capture_response and isinstance(capture_response['details'], list):
                         error_message = "; ".join([f"{err.get('issue','')} - {err.get('description','')}" for err in capture_response['details']])


                logger.error(f"Fallo al capturar orden de PayPal {paypal_order_id} o estado no completado. Respuesta: {capture_response}")
                return JsonResponse({'success': False, 'error': f"PayPal: {error_message}"}, status=400)

        except json.JSONDecodeError:
            logger.error("Error al decodificar JSON de la petición POST para paypal_capture_order_view.")
            return JsonResponse({'success': False, 'error': 'Petición malformada.'}, status=400)
        except Exception as e:
            logger.exception("Excepción inesperada en paypal_capture_order_view.")
            return JsonResponse({'success': False, 'error': f'Error interno del servidor al procesar pago.'}, status=500)
            
    logger.warning(f"Método {request.method} no permitido para paypal_capture_order_view.")
    return JsonResponse({'success': False, 'error': 'Método no permitido.'}, status=405)

# --- Vistas de Páginas ---
def realizar_compra_view(request):
    context = {
        'page_title': 'Finalizar Compra',
        'paypal_client_id': settings.PAYPAL_CLIENT_ID,
        'api_auth_url_js': settings.API_AUTH_BASE_URL,
        'csrf_token': get_token(request), # Pasar token CSRF
        'MEDIA_URL': settings.MEDIA_URL, # Para imágenes en resumen de carrito si es necesario
    }
    return render(request, 'core/realizar_compra.html', context)

def empleado_realizar_compra_view(request):
    context = {
        'page_title': 'Registrar Venta (Empleado)',
        'api_crud_url_js': settings.API_CRUD_BASE_URL,
        'api_auth_url_js': settings.API_AUTH_BASE_URL,
        'paypal_client_id': settings.PAYPAL_CLIENT_ID,
        'MEDIA_URL': settings.MEDIA_URL,
        'is_employee_checkout': True,
        'csrf_token': get_token(request), # Pasar token CSRF
    }
    return render(request, 'core/empleado_realizar_compra.html', context)

def compra_exitosa_view(request, numero_orden=None):
    order_details_from_session = request.session.pop('paypal_order_details', None)
    if not order_details_from_session:
        order_details_from_session = request.session.pop('order_details', {})

    context = {
        'page_title': '¡Compra Exitosa!',
        'numero_orden': numero_orden or order_details_from_session.get('ferremas_order_id', "Desconocido"),
        'user_info': request.session.get('user_info'), 
        'paypal_info': order_details_from_session if 'paypal_id' in order_details_from_session else None,
        'generic_order_info': order_details_from_session if 'paypal_id' not in order_details_from_session else None,
        'api_auth_url_js': settings.API_AUTH_BASE_URL
    }
    return render(request, 'core/compra_exitosa.html', context)

@login_required
def upload_product_image(request, id_producto_api):
    upload_form_template = 'core/upload_image_form.html' 

    if request.method == 'POST':
        form = ProductImageUploadForm(request.POST, request.FILES, initial={'id_producto': id_producto_api})
        if form.is_valid():
            imagen_file = form.cleaned_data['imagen']
            
            upload_subdir = 'productos_imagenes'
            full_upload_dir = os.path.join(settings.MEDIA_ROOT, upload_subdir)
            
            if not os.path.exists(full_upload_dir):
                os.makedirs(full_upload_dir, exist_ok=True)

            fs = FileSystemStorage(location=full_upload_dir)
            
            timestamp = int(time.time())
            original_filename = imagen_file.name
            filename_base, file_extension = os.path.splitext(original_filename)
            sane_filename_base = "".join(c if c.isalnum() else "_" for c in filename_base[:30])
            if not file_extension:
                file_extension = '.jpg' 
            
            unique_filename = f"producto_{id_producto_api}_{sane_filename_base}_{timestamp}{file_extension}"
            
            filename_saved_on_disk = fs.save(unique_filename, imagen_file)
            
            imagen_path_for_db = os.path.join(upload_subdir, filename_saved_on_disk).replace("\\", "/")

            api_update_url = f"{API_CRUD_BASE_URL}/productospatch/{id_producto_api}" 
            payload = { "imagen_url": imagen_path_for_db }
            
            logger.info(f"Intentando actualizar imagen para producto ID {id_producto_api} en API: {api_update_url} con payload: {payload}")

            try:
                response = requests.patch(api_update_url, json=payload)
                response.raise_for_status() 
                logger.info(f"API respondió con {response.status_code} para la actualización de imagen del producto ID {id_producto_api}")
                return redirect('core:productos')
            except requests.exceptions.RequestException as e:
                logger.error(f"Error al llamar a la API para actualizar imagen del producto ID {id_producto_api}: {e}")
                if fs.exists(filename_saved_on_disk): 
                    fs.delete(filename_saved_on_disk)
                form.add_error(None, f"Error al actualizar la imagen en la API: {e}. El archivo local no se ha conservado.")
            except Exception as e_general: 
                logger.error(f"Error general al actualizar imagen del producto ID {id_producto_api} en API: {e_general}", exc_info=True)
                if fs.exists(filename_saved_on_disk): 
                    fs.delete(filename_saved_on_disk)
                form.add_error(None, f"Ocurrió un error inesperado: {e_general}. El archivo local no se ha conservado.")
    else:
        form = ProductImageUploadForm(initial={'id_producto': id_producto_api})
        
    return render(request, upload_form_template, {'form': form, 'id_producto': id_producto_api, 'page_title': f'Subir Imagen para Producto {id_producto_api}'})

@login_required
def carrito_view(request):
    context = {
        'page_title': 'Tu Carrito de Compras',
        'api_auth_url_js': API_AUTH_BASE_URL,
        'api_crud_url_js': API_CRUD_BASE_URL
    }
    return render(request, 'core/carrito.html', context)

@login_required
def realizar_compra_view(request):
    context = {
        'page_title': 'Finalizar Compra',
        'api_auth_url_js': API_AUTH_BASE_URL,
        'api_crud_url_js': API_CRUD_BASE_URL,
        'MEDIA_URL': settings.MEDIA_URL
    }
    return render(request, 'core/realizar_compra.html', context)

@login_required
def procesar_pago_view(request):
    if request.method == 'POST':
        payment_method = request.POST.get('paymentMethod')
        paypal_order_id = request.POST.get('paypal_order_id')

        logger.info(f"Procesando pago. Método: {payment_method}, PayPal Order ID: {paypal_order_id}, Datos POST: {request.POST}")

        if paypal_order_id and (payment_method == 'paypal' or not payment_method):
            logger.info(f"Simulando verificación de PayPal para Order ID: {paypal_order_id}")
            simulated_paypal_verification_success = True

            if simulated_paypal_verification_success:
                nombre_cliente = request.POST.get('firstName', 'N/A')
                numero_orden_interno = f"FM-PP-{int(time.time())}" 
                logger.info(f"Pedido (simulado) creado para {nombre_cliente} con PayPal. Orden interna: {numero_orden_interno}")
                
                url_exitosa = reverse('core:compra_exitosa_with_order', kwargs={'numero_orden': numero_orden_interno})
                return JsonResponse({'success': True, 'redirect_url': url_exitosa, 'message': 'Pedido con PayPal procesado exitosamente (simulado).'})
            else:
                logger.error(f"Simulación de fallo en verificación de PayPal para Order ID: {paypal_order_id}")
                return JsonResponse({'success': False, 'message': 'Error al verificar el pago con PayPal (simulado).'}, status=400)

        elif payment_method and payment_method != 'paypal':
            nombre = request.POST.get('firstName')
            direccion = request.POST.get('address')
            logger.info(f"Procesando pago (No PayPal) para: {nombre} en {direccion}. Método: {payment_method}")
            
            numero_orden_interno = f"FM-{payment_method.upper().replace('_','-')}-{int(time.time())}"
            logger.info(f"Pedido creado para {nombre}. Orden interna: {numero_orden_interno}, Método: {payment_method}")

            return redirect('core:compra_exitosa_with_order', numero_orden=numero_orden_interno)
        else:
            logger.warning("Intento de procesar pago sin método de pago válido o sin ID de orden PayPal.")
            if request.headers.get('x-requested-with') == 'XMLHttpRequest':
                return JsonResponse({'success': False, 'message': 'Método de pago no especificado o inválido.'}, status=400)
            return redirect('core:realizar_compra')

    logger.warning(f"Intento de acceso a procesar_pago_view con método {request.method} no permitido.")
    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
         return JsonResponse({'success': False, 'message': 'Método no permitido.'}, status=405)
    return redirect('core:realizar_compra')

@login_required
def compra_exitosa_view(request, numero_orden=None):
    context = {
        'page_title': '¡Compra Exitosa!',
        'numero_orden': numero_orden if numero_orden else "Desconocido",
        'api_auth_url_js': API_AUTH_BASE_URL,
        'api_crud_url_js': API_CRUD_BASE_URL
    }
    return render(request, 'core/compra_exitosa.html', context)

@login_required
def admin_api_crud_view(request):
    api_entities_list = [
        {
            "name": "Ciudad",
            "id_field_path_param_name": "id_ciudad",
            "endpoints": {
                "getAll": {"method": "GET", "path_segment": "ciudadget"},
                "getById": {"method": "GET", "path_segment": "ciudadgetid"},
                "create": {
                    "method": "POST", "path_segment": "ciudadpost",
                    "payload_fields": [
                        {"name": "id_ciudad", "label": "ID Ciudad", "type": "number", "required": True},
                        {"name": "descripcion", "label": "Descripción", "type": "text", "required": True},
                    ]
                },
                "update": {
                    "method": "PUT", "path_segment": "ciudadputid",
                    "payload_fields": [
                        {"name": "descripcion", "label": "Descripción", "type": "text", "required": True},
                    ]
                },
                "patch": {
                    "method": "PATCH", "path_segment": "ciudadpatch",
                    "payload_fields": [
                        {"name": "descripcion", "label": "Descripción", "type": "text", "required": False},
                    ]
                },
                "delete": {"method": "DELETE", "path_segment": "ciudaddelete"}
            }
        },
        {
            "name": "Cargo",
            "id_field_path_param_name": "id_cargo_param",
            "endpoints": {
                "getAll": {"method": "GET", "path_segment": "cargoget"},
                "getById": {"method": "GET", "path_segment": "cargogetid"},
                "create": {
                    "method": "POST", "path_segment": "cargopost",
                    "payload_fields": [
                        {"name": "id_cargo", "label": "ID Cargo", "type": "number", "required": True},
                        {"name": "descripcion", "label": "Descripción", "type": "text", "required": True},
                    ]
                },
                "update": {
                    "method": "PUT", "path_segment": "cargoputid",
                    "payload_fields": [
                        {"name": "descripcion", "label": "Descripción", "type": "text", "required": True},
                    ]
                },
                "patch": {
                    "method": "PATCH", "path_segment": "cargopatch",
                    "payload_fields": [
                        {"name": "descripcion", "label": "Descripción", "type": "text", "required": False},
                    ]
                },
                "delete": {"method": "DELETE", "path_segment": "cargodelete"}
            }
        },
        {
            "name": "Categoría",
            "id_field_path_param_name": "id_categoria_param",
            "endpoints": {
                "getAll": {"method": "GET", "path_segment": "categoriasget"},
                "getById": {"method": "GET", "path_segment": "categoriasgetid"},
                "create": {
                    "method": "POST", "path_segment": "categoriaspost",
                    "payload_fields": [
                        {"name": "id_categoria", "label": "ID Categoría", "type": "number", "required": True},
                        {"name": "descripcion", "label": "Descripción", "type": "text", "required": True},
                    ]
                },
                "update": {
                    "method": "PUT", "path_segment": "categoriasputid",
                    "payload_fields": [
                        {"name": "descripcion", "label": "Descripción", "type": "text", "required": True},
                    ]
                },
                "patch": {
                    "method": "PATCH", "path_segment": "categoriaspatch",
                    "payload_fields": [
                        {"name": "descripcion", "label": "Descripción", "type": "text", "required": False},
                    ]
                },
                "delete": {"method": "DELETE", "path_segment": "categoriasdelete"}
            }
        },
        {
            "name": "Estado Pedido",
            "id_field_path_param_name": "id_estado_pedido_param",
            "endpoints": {
                "getAll": {"method": "GET", "path_segment": "estados_pedidoget"},
                "getById": {"method": "GET", "path_segment": "estados_pedidogetid"},
                "create": {
                    "method": "POST", "path_segment": "estados_pedidopost",
                    "payload_fields": [
                        {"name": "id_estado_pedido", "label": "ID Estado Pedido", "type": "number", "required": True},
                        {"name": "descripcion", "label": "Descripción", "type": "text", "required": True},
                    ]
                },
                "update": {
                    "method": "PUT", "path_segment": "estados_pedidoputid",
                    "payload_fields": [
                        {"name": "descripcion", "label": "Descripción", "type": "text", "required": True},
                    ]
                },
                "patch": {
                    "method": "PATCH", "path_segment": "estados_pedidopatch",
                    "payload_fields": [
                        {"name": "descripcion", "label": "Descripción", "type": "text", "required": False},
                    ]
                },
                "delete": {"method": "DELETE", "path_segment": "estados_pedidodelete"}
            }
        },
        {
            "name": "Tipo Transacción",
            "id_field_path_param_name": "id_tipo_transaccion_param",
            "endpoints": {
                "getAll": {"method": "GET", "path_segment": "tipos_transaccionget"},
                "getById": {"method": "GET", "path_segment": "tipos_transacciongetid"},
                "create": {
                    "method": "POST", "path_segment": "tipos_transaccionpost",
                    "payload_fields": [
                        {"name": "id_tipo_transaccion", "label": "ID Tipo Transacción", "type": "number", "required": True},
                        {"name": "descripcion", "label": "Descripción", "type": "text", "required": True},
                    ]
                },
                "update": {
                    "method": "PUT", "path_segment": "tipos_transaccionputid",
                    "payload_fields": [
                        {"name": "descripcion", "label": "Descripción", "type": "text", "required": True},
                    ]
                },
                "patch": {
                    "method": "PATCH", "path_segment": "tipos_transaccionpatch",
                    "payload_fields": [
                        {"name": "descripcion", "label": "Descripción", "type": "text", "required": False},
                    ]
                },
                "delete": {"method": "DELETE", "path_segment": "tipos_transacciondelete"}
            }
        },
        {
            "name": "Sucursal",
            "id_field_path_param_name": "id_sucursal_param",
            "endpoints": {
                "getAll": {"method": "GET", "path_segment": "sucursalget"},
                "getById": {"method": "GET", "path_segment": "sucursalgetid"},
                "create": {
                    "method": "POST", "path_segment": "sucursalpost",
                    "payload_fields": [
                        {"name": "id_sucursal", "label": "ID Sucursal", "type": "number", "required": True},
                        {"name": "nombre_sucursal", "label": "Nombre Sucursal", "type": "text", "required": True},
                        {"name": "id_ciudad", "label": "ID Ciudad", "type": "number", "required": True},
                        {"name": "direccion", "label": "Dirección", "type": "text", "required": False},
                    ]
                },
                "update": {
                    "method": "PUT", "path_segment": "sucursalputid",
                    "payload_fields": [
                        {"name": "nombre_sucursal", "label": "Nombre Sucursal", "type": "text", "required": True},
                        {"name": "id_ciudad", "label": "ID Ciudad", "type": "number", "required": True},
                        {"name": "direccion", "label": "Dirección", "type": "text", "required": False},
                    ]
                },
                "patch": {
                    "method": "PATCH", "path_segment": "sucursalpatch",
                    "payload_fields": [
                        {"name": "nombre_sucursal", "label": "Nombre Sucursal", "type": "text", "required": False},
                        {"name": "direccion", "label": "Dirección", "type": "text", "required": False},
                        {"name": "id_ciudad", "label": "ID Ciudad", "type": "number", "required": False},
                    ]
                },
                "delete": {"method": "DELETE", "path_segment": "sucursaldelete"}
            }
        },
        {
            "name": "Empleado",
            "id_field_path_param_name": "id_empleado_param",
            "endpoints": {
                "getAll": {"method": "GET", "path_segment": "empleadoget"},
                "getById": {"method": "GET", "path_segment": "empleadogetid"},
                "create": {
                    "method": "POST", "path_segment": "empleadopost",
                    "payload_fields": [
                        {"name": "id_empleado", "label": "ID Empleado", "type": "number", "required": True},
                        {"name": "rut", "label": "RUT", "type": "text", "required": True},
                        {"name": "p_nombre", "label": "Primer Nombre", "type": "text", "required": True},
                        {"name": "s_nombre", "label": "Segundo Nombre", "type": "text", "required": False},
                        {"name": "p_apellido", "label": "Primer Apellido", "type": "text", "required": True},
                        {"name": "s_apellido", "label": "Segundo Apellido", "type": "text", "required": False},
                        {"name": "correo", "label": "Correo", "type": "email", "required": True},
                        {"name": "telefono", "label": "Teléfono", "type": "tel", "required": False},
                        {"name": "salario", "label": "Salario", "type": "number", "required": True, "step": "0.01"},
                        {"name": "clave_hash", "label": "Clave", "type": "password", "required": True},
                        {"name": "id_cargo", "label": "ID Cargo", "type": "number", "required": False},
                        {"name": "id_sucursal", "label": "ID Sucursal", "type": "number", "required": False},
                        {"name": "activo", "label": "Activo", "type": "select", "options": ["S", "N"], "default": "S", "required": True},
                    ]
                },
                "update": {
                    "method": "PUT", "path_segment": "empleadoputid",
                    "payload_fields": [
                        {"name": "rut", "label": "RUT", "type": "text", "required": True},
                        {"name": "p_nombre", "label": "Primer Nombre", "type": "text", "required": True},
                        {"name": "p_apellido", "label": "Primer Apellido", "type": "text", "required": True},
                        {"name": "correo", "label": "Correo", "type": "email", "required": True},
                        {"name": "salario", "label": "Salario", "type": "number", "required": True, "step": "0.01"},
                        {"name": "clave_hash", "label": "Clave", "type": "password", "required": True},
                        {"name": "activo", "label": "Activo", "type": "select", "options": ["S", "N"], "required": True},
                        {"name": "s_nombre", "label": "Segundo Nombre", "type": "text", "required": False},
                        {"name": "s_apellido", "label": "Segundo Apellido", "type": "text", "required": False},
                        {"name": "telefono", "label": "Teléfono", "type": "tel", "required": False},
                        {"name": "id_cargo", "label": "ID Cargo", "type": "number", "required": False},
                        {"name": "id_sucursal", "label": "ID Sucursal", "type": "number", "required": False},
                    ]
                },
                "patch": {
                    "method": "PATCH", "path_segment": "empleadopatch",
                    "payload_fields": [
                        {"name": "rut", "label": "RUT", "type": "text", "required": False},
                        {"name": "p_nombre", "label": "Primer Nombre", "type": "text", "required": False},
                        {"name": "s_nombre", "label": "Segundo Nombre", "type": "text", "required": False},
                        {"name": "p_apellido", "label": "Primer Apellido", "type": "text", "required": False},
                        {"name": "s_apellido", "label": "Segundo Apellido", "type": "text", "required": False},
                        {"name": "correo", "label": "Correo", "type": "email", "required": False},
                        {"name": "telefono", "label": "Teléfono", "type": "tel", "required": False},
                        {"name": "salario", "label": "Salario", "type": "number", "required": False, "step": "0.01"},
                        {"name": "id_cargo", "label": "ID Cargo", "type": "number", "required": False},
                        {"name": "id_sucursal", "label": "ID Sucursal", "type": "number", "required": False},
                        {"name": "clave_hash", "label": "Clave", "type": "password", "required": False},
                        {"name": "activo", "label": "Activo", "type": "select", "options": ["S", "N"], "required": False},
                    ]
                },
                "delete": {"method": "DELETE", "path_segment": "empleadodelete"}
            }
        },
        {
            "name": "Cliente",
            "id_field_path_param_name": "id_cliente_param",
            "endpoints": {
                "getAll": {"method": "GET", "path_segment": "clientes"},
                "getById": {"method": "GET", "path_segment": "clientes"},
                "create": {
                    "method": "POST", "path_segment": "clientes",
                    "payload_fields": [
                        {"name": "id_cliente", "label": "ID Cliente", "type": "number", "required": True},
                        {"name": "p_nombre", "label": "Primer Nombre", "type": "text", "required": True},
                        {"name": "p_apellido", "label": "Primer Apellido", "type": "text", "required": True},
                        {"name": "correo", "label": "Correo", "type": "email", "required": True},
                        {"name": "clave_hash", "label": "Clave", "type": "password", "required": True},
                        {"name": "s_nombre", "label": "Segundo Nombre", "type": "text", "required": False},
                        {"name": "s_apellido", "label": "Segundo Apellido", "type": "text", "required": False},
                        {"name": "telefono", "label": "Teléfono", "type": "tel", "required": False},
                        {"name": "activo", "label": "Activo", "type": "select", "options": ["S", "N"], "default": "S", "required": True},
                    ]
                },
                "update": {
                    "method": "PUT", "path_segment": "clientes",
                    "payload_fields": [
                        {"name": "p_nombre", "label": "Primer Nombre", "type": "text", "required": True},
                        {"name": "p_apellido", "label": "Primer Apellido", "type": "text", "required": True},
                        {"name": "correo", "label": "Correo", "type": "email", "required": True},
                        {"name": "clave_hash", "label": "Clave", "type": "password", "required": True},
                        {"name": "activo", "label": "Activo", "type": "select", "options": ["S", "N"], "required": True},
                        {"name": "s_nombre", "label": "Segundo Nombre", "type": "text", "required": False},
                        {"name": "s_apellido", "label": "Segundo Apellido", "type": "text", "required": False},
                        {"name": "telefono", "label": "Teléfono", "type": "tel", "required": False},
                    ]
                },
                "patch": {
                    "method": "PATCH", "path_segment": "clientes",
                    "payload_fields": [
                        {"name": "p_nombre", "label": "Primer Nombre", "type": "text", "required": False},
                        {"name": "s_nombre", "label": "Segundo Nombre", "type": "text", "required": False},
                        {"name": "p_apellido", "label": "Primer Apellido", "type": "text", "required": False},
                        {"name": "s_apellido", "label": "Segundo Apellido", "type": "text", "required": False},
                        {"name": "correo", "label": "Correo", "type": "email", "required": False},
                        {"name": "telefono", "label": "Teléfono", "type": "tel", "required": False},
                        {"name": "clave_hash", "label": "Clave", "type": "password", "required": False},
                        {"name": "activo", "label": "Activo", "type": "select", "options": ["S", "N"], "required": False},
                    ]
                },
                "delete": {"method": "DELETE", "path_segment": "clientes"}
            }
        },
        {
            "name": "Productos",
            "id_field_path_param_name": "id_producto_param",
            "endpoints": {
                "getAll": {"method": "GET", "path_segment": "productosget"},
                "getById": {"method": "GET", "path_segment": "productosgetid"},
                "create": {
                    "method": "POST", "path_segment": "productospost",
                    "payload_fields": [
                        {"name": "id_producto", "label": "ID Producto", "type": "number", "required": True},
                        {"name": "nombre", "label": "Nombre", "type": "text", "required": True},
                        {"name": "precio", "label": "Precio", "type": "number", "required": True, "step": "0.01"},
                        {"name": "marca", "label": "Marca", "type": "text", "required": False},
                        {"name": "descripcion_detallada", "label": "Descripción Detallada", "type": "textarea", "required": False},
                        {"name": "id_categoria", "label": "ID Categoría", "type": "number", "required": False},
                        {"name": "imagen_url", "label": "URL Imagen", "type": "url", "required": False},
                    ]
                },
                "update": {
                    "method": "PUT", "path_segment": "productosputid",
                    "payload_fields": [
                        {"name": "nombre", "label": "Nombre", "type": "text", "required": True},
                        {"name": "precio", "label": "Precio", "type": "number", "required": True, "step": "0.01"},
                        {"name": "marca", "label": "Marca", "type": "text", "required": False},
                        {"name": "descripcion_detallada", "label": "Descripción Detallada", "type": "textarea", "required": False},
                        {"name": "id_categoria", "label": "ID Categoría", "type": "number", "required": False},
                        {"name": "imagen_url", "label": "URL Imagen", "type": "url", "required": False},
                    ]
                },
                "patch": {
                    "method": "PATCH", "path_segment": "productospatch",
                    "payload_fields": [
                        {"name": "nombre", "label": "Nombre", "type": "text", "required": False},
                        {"name": "marca", "label": "Marca", "type": "text", "required": False},
                        {"name": "descripcion_detallada", "label": "Descripción Detallada", "type": "textarea", "required": False},
                        {"name": "precio", "label": "Precio", "type": "number", "required": False, "step": "0.01"},
                        {"name": "id_categoria", "label": "ID Categoría", "type": "number", "required": False},
                        {"name": "imagen_url", "label": "URL Imagen", "type": "url", "required": False},
                    ]
                },
                "delete": {"method": "DELETE", "path_segment": "productosdelete"}
            }
        },
        {
            "name": "Stock Sucursal",
            "id_field_path_param_name": "id_stock_sucursal_param",
            "endpoints": {
                "getAll": {"method": "GET", "path_segment": "stock_sucursalget"},
                "getById": {"method": "GET", "path_segment": "stock_sucursalgetid"},
                "create": {
                    "method": "POST", "path_segment": "stock_sucursalpost",
                    "payload_fields": [
                        {"name": "id_stock_sucursal", "label": "ID Stock Sucursal", "type": "number", "required": True},
                        {"name": "id_producto", "label": "ID Producto", "type": "number", "required": True},
                        {"name": "id_sucursal", "label": "ID Sucursal", "type": "number", "required": True},
                        {"name": "cantidad", "label": "Cantidad", "type": "number", "required": True},
                        {"name": "ubicacion_bodega", "label": "Ubicación Bodega", "type": "text", "required": False},
                    ]
                },
                "update": {
                    "method": "PUT", "path_segment": "stock_sucursalputid",
                    "payload_fields": [
                        {"name": "id_producto", "label": "ID Producto", "type": "number", "required": True},
                        {"name": "id_sucursal", "label": "ID Sucursal", "type": "number", "required": True},
                        {"name": "cantidad", "label": "Cantidad", "type": "number", "required": True},
                        {"name": "ubicacion_bodega", "label": "Ubicación Bodega", "type": "text", "required": False},
                    ]
                },
                "patch": {
                    "method": "PATCH", "path_segment": "stock_sucursalpatch",
                    "payload_fields": [
                        {"name": "id_producto", "label": "ID Producto", "type": "number", "required": False},
                        {"name": "id_sucursal", "label": "ID Sucursal", "type": "number", "required": False},
                        {"name": "cantidad", "label": "Cantidad", "type": "number", "required": False},
                        {"name": "ubicacion_bodega", "label": "Ubicación Bodega", "type": "text", "required": False},
                    ]
                },
                "delete": {"method": "DELETE", "path_segment": "stock_sucursaldelete"}
            }
        },
        {
            "name": "Log Actividad Inventario",
            "id_field_path_param_name": "id_log_param",
            "endpoints": {
                "getAll": {"method": "GET", "path_segment": "log_actividad_inventarioget"},
                "getById": {"method": "GET", "path_segment": "log_actividad_inventariogetid"},
                "create": {
                    "method": "POST", "path_segment": "log_actividad_inventariopost",
                    "payload_fields": [
                        {"name": "id_log", "label": "ID Log", "type": "number", "required": True},
                        {"name": "tipo_actividad", "label": "Tipo Actividad", "type": "text", "required": True},
                        {"name": "id_producto", "label": "ID Producto", "type": "number", "required": False},
                        {"name": "id_sucursal", "label": "ID Sucursal", "type": "number", "required": False},
                        {"name": "cantidad_afectada", "label": "Cantidad Afectada", "type": "number", "required": False},
                        {"name": "stock_anterior", "label": "Stock Anterior", "type": "number", "required": False},
                        {"name": "stock_nuevo", "label": "Stock Nuevo", "type": "number", "required": False},
                        {"name": "fecha_actividad", "label": "Fecha Actividad (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "id_empleado_responsable", "label": "ID Empleado Responsable", "type": "number", "required": False},
                        {"name": "notas", "label": "Notas", "type": "textarea", "required": False},
                    ]
                },
                "update": {
                    "method": "PUT", "path_segment": "log_actividad_inventarioputid",
                    "payload_fields": [
                        {"name": "tipo_actividad", "label": "Tipo Actividad", "type": "text", "required": True},
                        {"name": "id_producto", "label": "ID Producto", "type": "number", "required": False},
                        {"name": "id_sucursal", "label": "ID Sucursal", "type": "number", "required": False},
                        {"name": "cantidad_afectada", "label": "Cantidad Afectada", "type": "number", "required": False},
                        {"name": "stock_anterior", "label": "Stock Anterior", "type": "number", "required": False},
                        {"name": "stock_nuevo", "label": "Stock Nuevo", "type": "number", "required": False},
                        {"name": "fecha_actividad", "label": "Fecha Actividad (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "id_empleado_responsable", "label": "ID Empleado Responsable", "type": "number", "required": False},
                        {"name": "notas", "label": "Notas", "type": "textarea", "required": False},
                    ]
                },
                "patch": {
                    "method": "PATCH", "path_segment": "log_actividad_inventariopatch",
                    "payload_fields": [
                        {"name": "tipo_actividad", "label": "Tipo Actividad", "type": "text", "required": False},
                        {"name": "id_producto", "label": "ID Producto", "type": "number", "required": False},
                        {"name": "id_sucursal", "label": "ID Sucursal", "type": "number", "required": False},
                        {"name": "cantidad_afectada", "label": "Cantidad Afectada", "type": "number", "required": False},
                        {"name": "stock_anterior", "label": "Stock Anterior", "type": "number", "required": False},
                        {"name": "stock_nuevo", "label": "Stock Nuevo", "type": "number", "required": False},
                        {"name": "fecha_actividad", "label": "Fecha Actividad (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "id_empleado_responsable", "label": "ID Empleado Responsable", "type": "number", "required": False},
                        {"name": "notas", "label": "Notas", "type": "textarea", "required": False},
                    ]
                },
                "delete": {"method": "DELETE", "path_segment": "log_actividad_inventariodelete"}
            }
        },
        {
            "name": "Pedidos",
            "id_field_path_param_name": "id_pedido_param",
            "endpoints": {
                "getAll": {"method": "GET", "path_segment": "pedidoget"},
                "getById": {"method": "GET", "path_segment": "pedidogetid"},
                "create": {
                    "method": "POST", "path_segment": "pedidopost",
                    "payload_fields": [
                        {"name": "id_pedido", "label": "ID Pedido", "type": "number", "required": True},
                        {"name": "id_estado_pedido", "label": "ID Estado Pedido", "type": "number", "required": True},
                        {"name": "fecha_pedido_str", "label": "Fecha Pedido (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "id_cliente", "label": "ID Cliente", "type": "number", "required": False},
                        {"name": "id_empleado_vendedor", "label": "ID Empleado Vendedor", "type": "number", "required": False},
                        {"name": "id_sucursal_origen", "label": "ID Sucursal Origen", "type": "number", "required": False},
                        {"name": "total_pedido", "label": "Total Pedido", "type": "number", "default": 0.0, "required": True, "step": "0.01"},
                    ]
                },
                "update": {
                    "method": "PUT", "path_segment": "pedidoputid",
                    "payload_fields": [
                        {"name": "id_estado_pedido", "label": "ID Estado Pedido", "type": "number", "required": True},
                        {"name": "fecha_pedido_str", "label": "Fecha Pedido (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "id_cliente", "label": "ID Cliente", "type": "number", "required": False},
                        {"name": "id_empleado_vendedor", "label": "ID Empleado Vendedor", "type": "number", "required": False},
                        {"name": "id_sucursal_origen", "label": "ID Sucursal Origen", "type": "number", "required": False},
                        {"name": "total_pedido", "label": "Total Pedido", "type": "number", "required": False, "step": "0.01"},
                    ]
                },
                "patch": {
                    "method": "PATCH", "path_segment": "pedidopatch",
                    "payload_fields": [
                        {"name": "fecha_pedido_str", "label": "Fecha Pedido (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "id_cliente", "label": "ID Cliente", "type": "number", "required": False},
                        {"name": "id_empleado_vendedor", "label": "ID Empleado Vendedor", "type": "number", "required": False},
                        {"name": "id_sucursal_origen", "label": "ID Sucursal Origen", "type": "number", "required": False},
                        {"name": "id_estado_pedido", "label": "ID Estado Pedido", "type": "number", "required": False},
                        {"name": "total_pedido", "label": "Total Pedido", "type": "number", "required": False, "step": "0.01"},
                    ]
                },
                "delete": {"method": "DELETE", "path_segment": "pedidodelete"}
            }
        },
        {
            "name": "Detalle Pedido",
            "id_field_path_param_name": "id_detalle_pedido_param",
            "endpoints": {
                "getAll": {"method": "GET", "path_segment": "detalle_pedidoget"},
                "getById": {"method": "GET", "path_segment": "detalle_pedidogetid"},
                "create": {
                    "method": "POST", "path_segment": "detalle_pedidopost",
                    "payload_fields": [
                        {"name": "id_detalle_pedido", "label": "ID Detalle Pedido", "type": "number", "required": True},
                        {"name": "id_pedido", "label": "ID Pedido", "type": "number", "required": True},
                        {"name": "id_producto", "label": "ID Producto", "type": "number", "required": True},
                        {"name": "cantidad", "label": "Cantidad", "type": "number", "required": True},
                        {"name": "precio_unitario_venta", "label": "Precio Unitario Venta", "type": "number", "required": True, "step": "0.01"},
                        {"name": "subtotal", "label": "Subtotal", "type": "number", "required": True, "step": "0.01"},
                    ]
                },
                "update": {
                    "method": "PUT", "path_segment": "detalle_pedidoputid",
                    "payload_fields": [
                        {"name": "id_pedido", "label": "ID Pedido", "type": "number", "required": True},
                        {"name": "id_producto", "label": "ID Producto", "type": "number", "required": True},
                        {"name": "cantidad", "label": "Cantidad", "type": "number", "required": True},
                        {"name": "precio_unitario_venta", "label": "Precio Unitario Venta", "type": "number", "required": True, "step": "0.01"},
                        {"name": "subtotal", "label": "Subtotal", "type": "number", "required": True, "step": "0.01"},
                    ]
                },
                "patch": {
                    "method": "PATCH", "path_segment": "detalle_pedidopatch",
                    "payload_fields": [
                        {"name": "id_pedido", "label": "ID Pedido", "type": "number", "required": False},
                        {"name": "id_producto", "label": "ID Producto", "type": "number", "required": False},
                        {"name": "cantidad", "label": "Cantidad", "type": "number", "required": False},
                        {"name": "precio_unitario_venta", "label": "Precio Unitario Venta", "type": "number", "required": False, "step": "0.01"},
                        {"name": "subtotal", "label": "Subtotal", "type": "number", "required": False, "step": "0.01"},
                    ]
                },
                "delete": {"method": "DELETE", "path_segment": "detalle_pedidodelete"}
            }
        },
        {
            "name": "Factura",
            "id_field_path_param_name": "id_factura_param",
            "endpoints": {
                "getAll": {"method": "GET", "path_segment": "facturaget"},
                "getById": {"method": "GET", "path_segment": "facturagetid"},
                "create": {
                    "method": "POST", "path_segment": "facturapost",
                    "payload_fields": [
                        {"name": "id_factura", "label": "ID Factura", "type": "number", "required": True},
                        {"name": "numero_factura", "label": "Número Factura", "type": "text", "required": True},
                        {"name": "id_pedido", "label": "ID Pedido", "type": "number", "required": True},
                        {"name": "total_neto", "label": "Total Neto", "type": "number", "required": True, "step": "0.01"},
                        {"name": "iva", "label": "IVA", "type": "number", "required": True, "step": "0.01"},
                        {"name": "total_con_iva", "label": "Total con IVA", "type": "number", "required": True, "step": "0.01"},
                        {"name": "fecha_emision_str", "label": "Fecha Emisión (YYYY-MM-DD)", "type": "date", "required": False},
                    ]
                },
                "update": {
                    "method": "PUT", "path_segment": "facturaputid",
                    "payload_fields": [
                        {"name": "numero_factura", "label": "Número Factura", "type": "text", "required": True},
                        {"name": "id_pedido", "label": "ID Pedido", "type": "number", "required": True},
                        {"name": "total_neto", "label": "Total Neto", "type": "number", "required": True, "step": "0.01"},
                        {"name": "iva", "label": "IVA", "type": "number", "required": True, "step": "0.01"},
                        {"name": "total_con_iva", "label": "Total con IVA", "type": "number", "required": True, "step": "0.01"},
                        {"name": "fecha_emision_str", "label": "Fecha Emisión (YYYY-MM-DD)", "type": "date", "required": False},
                    ]
                },
                "patch": {
                    "method": "PATCH", "path_segment": "facturapatch",
                    "payload_fields": [
                        {"name": "numero_factura", "label": "Número Factura", "type": "text", "required": False},
                        {"name": "id_pedido", "label": "ID Pedido", "type": "number", "required": False},
                        {"name": "fecha_emision_str", "label": "Fecha Emisión (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "total_neto", "label": "Total Neto", "type": "number", "required": False, "step": "0.01"},
                        {"name": "iva", "label": "IVA", "type": "number", "required": False, "step": "0.01"},
                        {"name": "total_con_iva", "label": "Total con IVA", "type": "number", "required": False, "step": "0.01"},
                    ]
                },
                "delete": {"method": "DELETE", "path_segment": "facturadelete"}
            }
        },
        {
            "name": "Transacción",
            "id_field_path_param_name": "id_transaccion_param",
            "endpoints": {
                "getAll": {"method": "GET", "path_segment": "transaccionget"},
                "getById": {"method": "GET", "path_segment": "transacciongetid"},
                "create": {
                    "method": "POST", "path_segment": "transaccionpost",
                    "payload_fields": [
                        {"name": "id_transaccion", "label": "ID Transacción", "type": "number", "required": True},
                        {"name": "id_factura", "label": "ID Factura", "type": "number", "required": True},
                        {"name": "id_tipo_transaccion", "label": "ID Tipo Transacción", "type": "number", "required": True},
                        {"name": "monto_pagado", "label": "Monto Pagado", "type": "number", "required": True, "step": "0.01"},
                        {"name": "fecha_transaccion_str", "label": "Fecha Transacción (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "referencia_pago", "label": "Referencia Pago", "type": "text", "required": False},
                        {"name": "id_empleado_cajero", "label": "ID Empleado Cajero", "type": "number", "required": False},
                    ]
                },
                "update": {
                    "method": "PUT", "path_segment": "transaccionputid",
                    "payload_fields": [
                        {"name": "id_factura", "label": "ID Factura", "type": "number", "required": True},
                        {"name": "id_tipo_transaccion", "label": "ID Tipo Transacción", "type": "number", "required": True},
                        {"name": "monto_pagado", "label": "Monto Pagado", "type": "number", "required": True, "step": "0.01"},
                        {"name": "fecha_transaccion_str", "label": "Fecha Transacción (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "referencia_pago", "label": "Referencia Pago", "type": "text", "required": False},
                        {"name": "id_empleado_cajero", "label": "ID Empleado Cajero", "type": "number", "required": False},
                    ]
                },
                "patch": {
                    "method": "PATCH", "path_segment": "transaccionpatch",
                    "payload_fields": [
                        {"name": "id_factura", "label": "ID Factura", "type": "number", "required": False},
                        {"name": "id_tipo_transaccion", "label": "ID Tipo Transacción", "type": "number", "required": False},
                        {"name": "monto_pagado", "label": "Monto Pagado", "type": "number", "required": False, "step": "0.01"},
                        {"name": "fecha_transaccion_str", "label": "Fecha Transacción (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "referencia_pago", "label": "Referencia Pago", "type": "text", "required": False},
                        {"name": "id_empleado_cajero", "label": "ID Empleado Cajero", "type": "number", "required": False},
                    ]
                },
                "delete": {"method": "DELETE", "path_segment": "transacciondelete"}
            }
        },
        {
            "name": "Reporte Venta",
            "id_field_path_param_name": "id_reporte_ventas_param",
            "endpoints": {
                "getAll": {"method": "GET", "path_segment": "reporte_ventasget"},
                "getById": {"method": "GET", "path_segment": "reporte_ventasgetid"},
                "create": {
                    "method": "POST", "path_segment": "reporte_ventaspost",
                    "payload_fields": [
                        {"name": "id_reporte_ventas", "label": "ID Reporte Ventas", "type": "number", "required": True},
                        {"name": "fecha_generacion_str", "label": "Fecha Generación (YYYY-MM-DD)", "type": "date", "required": True},
                        {"name": "total_ventas_calculado", "label": "Total Ventas Calculado", "type": "number", "required": True, "step": "0.01"},
                        {"name": "periodo_inicio_str", "label": "Periodo Inicio (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "periodo_fin_str", "label": "Periodo Fin (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "id_sucursal", "label": "ID Sucursal", "type": "number", "required": False},
                    ]
                },
                "update": {
                    "method": "PUT", "path_segment": "reporte_ventasputid",
                    "payload_fields": [
                        {"name": "fecha_generacion_str", "label": "Fecha Generación (YYYY-MM-DD)", "type": "date", "required": True},
                        {"name": "total_ventas_calculado", "label": "Total Ventas Calculado", "type": "number", "required": True, "step": "0.01"},
                        {"name": "periodo_inicio_str", "label": "Periodo Inicio (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "periodo_fin_str", "label": "Periodo Fin (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "id_sucursal", "label": "ID Sucursal", "type": "number", "required": False},
                    ]
                },
                "patch": {
                    "method": "PATCH", "path_segment": "reporte_ventaspatch",
                    "payload_fields": [
                        {"name": "fecha_generacion_str", "label": "Fecha Generación (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "periodo_inicio_str", "label": "Periodo Inicio (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "periodo_fin_str", "label": "Periodo Fin (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "total_ventas_calculado", "label": "Total Ventas Calculado", "type": "number", "required": False, "step": "0.01"},
                        {"name": "id_sucursal", "label": "ID Sucursal", "type": "number", "required": False},
                    ]
                },
                "delete": {"method": "DELETE", "path_segment": "reporte_ventasdelete"}
            }
        },
        {
            "name": "Reporte Desempeño",
            "id_field_path_param_name": "id_reporte_desempenio_param",
            "endpoints": {
                "getAll": {"method": "GET", "path_segment": "reporte_desempenioget"},
                "getById": {"method": "GET", "path_segment": "reporte_desempeniogetid"},
                "create": {
                    "method": "POST", "path_segment": "reporte_desempeniopost",
                    "payload_fields": [
                        {"name": "id_reporte_desempenio", "label": "ID Reporte Desempeño", "type": "number", "required": True},
                        {"name": "id_empleado", "label": "ID Empleado", "type": "number", "required": True},
                        {"name": "fecha_generacion_str", "label": "Fecha Generación (YYYY-MM-DD)", "type": "date", "required": True},
                        {"name": "periodo_evaluacion_inicio_str", "label": "Periodo Evaluación Inicio (YYYY-MM-DD)", "type": "date", "required": True},
                        {"name": "periodo_evaluacion_fin_str", "label": "Periodo Evaluación Fin (YYYY-MM-DD)", "type": "date", "required": True},
                        {"name": "datos_evaluacion", "label": "Datos Evaluación", "type": "textarea", "required": True},
                    ]
                },
                "update": {
                    "method": "PUT", "path_segment": "reporte_desempenioputid",
                    "payload_fields": [
                        {"name": "id_empleado", "label": "ID Empleado", "type": "number", "required": True},
                        {"name": "fecha_generacion_str", "label": "Fecha Generación (YYYY-MM-DD)", "type": "date", "required": True},
                        {"name": "periodo_evaluacion_inicio_str", "label": "Periodo Evaluación Inicio (YYYY-MM-DD)", "type": "date", "required": True},
                        {"name": "periodo_evaluacion_fin_str", "label": "Periodo Evaluación Fin (YYYY-MM-DD)", "type": "date", "required": True},
                        {"name": "datos_evaluacion", "label": "Datos Evaluación", "type": "textarea", "required": True},
                    ]
                },
                "patch": {
                    "method": "PATCH", "path_segment": "reporte_desempeniopatch",
                    "payload_fields": [
                        {"name": "id_empleado", "label": "ID Empleado", "type": "number", "required": False},
                        {"name": "fecha_generacion_str", "label": "Fecha Generación (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "periodo_evaluacion_inicio_str", "label": "Periodo Evaluación Inicio (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "periodo_evaluacion_fin_str", "label": "Periodo Evaluación Fin (YYYY-MM-DD)", "type": "date", "required": False},
                        {"name": "datos_evaluacion", "label": "Datos Evaluación", "type": "textarea", "required": False},
                    ]
                },
                "delete": {"method": "DELETE", "path_segment": "reporte_desempeniodelete"}
            }
        },
    ]
    context = {
        'page_title': 'Administración API CRUD',
        'api_entities_json': json.dumps(api_entities_list),
        'api_entities': api_entities_list,
        'API_CRUD_BASE_URL_for_js': API_CRUD_BASE_URL
    }
    return render(request, 'core/admin_api_crud_index.html', context)

@login_required
def bodeguero_pedidos_view(request):
    pedidos_enriquecidos = []
    todos_los_estados_raw = []
    bodeguero_estados_permitidos = []
    api_error_message = None
    ids_estados_permitidos_bodeguero = [1, 2, 3, 4, 5] 

    try:
        response_estados = requests.get(f"{API_CRUD_BASE_URL}/estados_pedidoget")
        response_estados.raise_for_status()
        todos_los_estados_raw = response_estados.json()
        mapa_estados = {estado['id_estado_pedido']: estado['descripcion'] for estado in todos_los_estados_raw}

        for estado in todos_los_estados_raw:
            if estado['id_estado_pedido'] in ids_estados_permitidos_bodeguero:
                bodeguero_estados_permitidos.append(estado)
        
        bodeguero_estados_permitidos.sort(key=lambda x: x['id_estado_pedido'])

        response_clientes = requests.get(f"{API_CRUD_BASE_URL}/clientes")
        response_clientes.raise_for_status()
        clientes_raw = response_clientes.json()
        mapa_clientes = {cliente['id_cliente']: f"{cliente.get('p_nombre','')} {cliente.get('p_apellido','')}".strip() for cliente in clientes_raw}

        response_empleados = requests.get(f"{API_CRUD_BASE_URL}/empleadoget")
        response_empleados.raise_for_status()
        empleados_raw = response_empleados.json()
        mapa_empleados = {emp['id_empleado']: f"{emp.get('p_nombre','')} {emp.get('p_apellido','')}".strip() for emp in empleados_raw}
        
        response_sucursales = requests.get(f"{API_CRUD_BASE_URL}/sucursalget")
        response_sucursales.raise_for_status()
        sucursales_raw = response_sucursales.json()
        mapa_sucursales = {suc['id_sucursal']: suc.get('nombre_sucursal', '') for suc in sucursales_raw}

        response_pedidos = requests.get(f"{API_CRUD_BASE_URL}/pedidoget")
        response_pedidos.raise_for_status()
        pedidos_raw = response_pedidos.json()

        for pedido in pedidos_raw:
            pedido_enriquecido = pedido.copy()
            pedido_enriquecido['estado_descripcion'] = mapa_estados.get(pedido.get('id_estado_pedido'), 'Desconocido')
            pedido_enriquecido['cliente_nombre'] = mapa_clientes.get(pedido.get('id_cliente'), f"ID: {pedido.get('id_cliente', 'N/A')}")
            pedido_enriquecido['empleado_nombre'] = mapa_empleados.get(pedido.get('id_empleado_vendedor'), f"ID: {pedido.get('id_empleado_vendedor', 'N/A')}")
            pedido_enriquecido['sucursal_nombre'] = mapa_sucursales.get(pedido.get('id_sucursal_origen'), f"ID: {pedido.get('id_sucursal_origen', 'N/A')}")
            pedidos_enriquecidos.append(pedido_enriquecido)
            
    except requests.exceptions.ConnectionError as e:
        logger.error(f"Error de conexión al API CRUD (Bodeguero): {e}")
        api_error_message = "No se pudo conectar al servicio de pedidos. Inténtalo más tarde."
    except requests.exceptions.HTTPError as e:
        logger.error(f"Error HTTP del API CRUD (Bodeguero): {e.response.status_code} - {e.response.text}")
        error_detail = "Error al obtener datos de la API."
        try:
            error_detail = e.response.json().get('detail', error_detail)
        except requests.exceptions.JSONDecodeError:
            error_detail = e.response.text if e.response.text else error_detail
        api_error_message = f"Error ({e.response.status_code}) al cargar datos para bodeguero: {error_detail}"
    except Exception as e:
        logger.error(f"Error inesperado en vista bodeguero: {e}", exc_info=True)
        api_error_message = "Ocurrió un error inesperado al preparar la página del bodeguero."

    context = {
        'page_title': 'Gestión de Pedidos (Bodega)',
        'pedidos': pedidos_enriquecidos,
        'todos_los_estados': todos_los_estados_raw,
        'bodeguero_estados_permitidos': bodeguero_estados_permitidos,
        'api_error_message': api_error_message,
        'API_CRUD_BASE_URL_for_js': API_CRUD_BASE_URL
    }
    return render(request, 'core/bodeguero_pedidos.html', context)

@login_required
def empleado_realizar_compra_view(request):
    context = {
        'page_title': 'Registrar Venta (Empleado)',
        'api_crud_url_js': API_CRUD_BASE_URL,
        'api_auth_url_js': API_AUTH_BASE_URL,
        'MEDIA_URL': settings.MEDIA_URL,
        'is_employee_checkout': True
    }
    return render(request, 'core/empleado_realizar_compra.html', context)
