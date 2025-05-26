from django.shortcuts import render, redirect
from django.conf import settings
from django.core.files.storage import FileSystemStorage
from .forms import ProductImageUploadForm
import requests
import logging
import os
import time


logger = logging.getLogger(__name__)

API_CRUD_BASE_URL = "http://127.0.0.1:8001"
API_AUTH_BASE_URL = "http://127.0.0.1:8002"
API_PAGO_BASE_URL = "http://127.0.0.1:8003"

def index_view(request):
    """
    Vista para la página de inicio.
    """
    context = {
        'page_title': 'Bienvenido a Ferremas',
        'welcome_message': 'Tu ferretería online de confianza.'
    }
    return render(request, 'core/index.html', context)

def productos(request):
    """
    Vista para la página de listado de productos.
    Obtiene datos de categorías y productos desde la API FastAPI CRUD.
    """
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
                    'id': prod_data['id_producto'],
                    'name': prod_data.get('nombre', 'Producto sin nombre'),
                    'price': prod_data.get('precio', 0.0),
                    'imagen_url': prod_data.get('imagen_url') 
                })
            else:
                product_name = prod_data.get('nombre', f"ID {prod_data.get('id_producto', 'Desconocido')}")
                logger.warning(f"Producto '{product_name}' con id_categoria {categoria_id} no encontrado en categorías cargadas o id_categoria es nulo.")

        structured_categories_list = list(categories_with_products.values())

    except requests.exceptions.ConnectionError as e:
        logger.error(f"Error de conexión al intentar alcanzar la API CRUD en {API_CRUD_BASE_URL}: {e}")
        api_error_message = f"No se pudo conectar a la API de datos en {API_CRUD_BASE_URL}. Por favor, asegúrate de que el servicio API esté corriendo en esa dirección y sea accesible."
    except requests.exceptions.HTTPError as e:
        logger.error(f"Error HTTP de la API CRUD: {e.response.status_code} - {e.response.text}")
        error_detail = "Error desconocido del servidor API."
        try:
            error_detail = e.response.json().get('detail', error_detail)
        except requests.exceptions.JSONDecodeError:
            error_detail = e.response.text if e.response.text else error_detail
        api_error_message = f"Error al obtener datos de la API ({e.response.status_code}). Detalles: {error_detail}"
    except requests.exceptions.RequestException as e:
        logger.error(f"Error general de requests al conectar con la API CRUD: {e}")
        api_error_message = "Ocurrió un error de red al intentar cargar los datos de los productos."
    except Exception as e:
        logger.error(f"Error inesperado al procesar datos de la API: {type(e).__name__} - {e}", exc_info=True)
        api_error_message = "Ocurrió un error inesperado al procesar los datos de los productos."

    context = {
        'page_title': 'Catálogo de Productos',
        'categories_list': structured_categories_list,
        'api_error_message': api_error_message
    }
    return render(request, 'core/productos.html', context) #


def upload_product_image(request, id_producto_api):
    
    upload_form_template = 'core/upload_image_form.html' #

    if request.method == 'POST':
        form = ProductImageUploadForm(request.POST, request.FILES, initial={'id_producto': id_producto_api}) #
        if form.is_valid():
            imagen_file = form.cleaned_data['imagen']
            
            upload_subdir = 'productos_imagenes'
            full_upload_dir = os.path.join(settings.MEDIA_ROOT, upload_subdir)
            
            if not os.path.exists(full_upload_dir):
                os.makedirs(full_upload_dir)

            fs = FileSystemStorage(location=full_upload_dir)
            
            timestamp = int(time.time())
            original_filename = imagen_file.name
            filename_base, file_extension = os.path.splitext(original_filename)
            sane_filename_base = "".join(c if c.isalnum() else "_" for c in filename_base[:30])
            if not file_extension:
                file_extension = '.jpg' # Default extension if none found
            
            unique_filename = f"producto_{id_producto_api}_{sane_filename_base}_{timestamp}{file_extension}"
            
            filename_saved_on_disk = fs.save(unique_filename, imagen_file)
            
            imagen_path_for_db = os.path.join(upload_subdir, filename_saved_on_disk).replace("\\", "/")

            api_update_url = f"{API_CRUD_BASE_URL}/productospatch/{id_producto_api}" 
            payload = {
                "imagen_url": imagen_path_for_db
            }
            
            logger.info(f"Intentando actualizar imagen para producto ID {id_producto_api} en API: {api_update_url} con payload: {payload}")

            try:
                response = requests.patch(api_update_url, json=payload)
                response.raise_for_status() 
                logger.info(f"API respondió con {response.status_code} para la actualización de imagen del producto ID {id_producto_api}")
                return redirect('core:productos')
            except requests.exceptions.RequestException as e:
                logger.error(f"Error al llamar a la API para actualizar imagen del producto ID {id_producto_api}: {e}")
                if fs.exists(filename_saved_on_disk): # Cleanup uploaded file if API call fails
                    fs.delete(filename_saved_on_disk)
                form.add_error(None, f"Error al actualizar la imagen en la API: {e}. El archivo local no se ha conservado.")
            except Exception as e_general: # Catch any other unexpected errors
                logger.error(f"Error general al actualizar imagen del producto ID {id_producto_api} en API: {e_general}")
                if fs.exists(filename_saved_on_disk): # Cleanup
                    fs.delete(filename_saved_on_disk)
                form.add_error(None, f"Ocurrió un error inesperado: {e_general}. El archivo local no se ha conservado.")
    else:
        form = ProductImageUploadForm(initial={'id_producto': id_producto_api}) #
        
    return render(request, upload_form_template, {'form': form, 'id_producto': id_producto_api})

def login_view(request):
    context = {'error_message': None}
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        if username == "test" and password == "test":
            request.session['user_info'] = {'username': username, 'first_name': 'Usuario'}
            return redirect('core:index')
        else:
            context['error_message'] = "Credenciales de demostración incorrectas (usa test/test)."

    return render(request, 'core/login.html', context)

def registro_view(request):
    context = {'error_message': None, 'success_message': None}
    if request.method == 'POST':
        nombre = request.POST.get('nombre')
        apellidos = request.POST.get('apellidos')
        email = request.POST.get('email')
        password = request.POST.get('password')
        password_confirm = request.POST.get('password_confirm')
        terminos = request.POST.get('terminos')

        if password != password_confirm:
            context['error_message'] = "Las contraseñas no coinciden."
        elif not terminos:
            context['error_message'] = "Debes aceptar los términos y condiciones."
        else:
            logger.info(f"Intento de registro: {nombre} {apellidos}, {email}")
            context['success_message'] = f"¡Registro simulado exitoso para {nombre}! Ahora puedes iniciar sesión."
    return render(request, 'core/registro.html', context)

def carrito_view(request):
    items_del_carrito_ejemplo = [
        {'id': 1, 'nombre': 'Taladro Percutor Inalámbrico 20V', 'sku': 'TLDR-001', 'cantidad': 1, 'precio_unitario': 59990, 'imagen_url': 'productos_imagenes/taladro.jpg'},
        {'id': 2, 'nombre': 'Set de Brocas Titanio (15 piezas)', 'sku': 'BROCA-SET-15', 'cantidad': 2, 'precio_unitario': 22950, 'imagen_url': 'productos_imagenes/brocas.jpg'},
        {'id': 3, 'nombre': 'Huaipe Industrial (Rollo 5kg)', 'sku': 'HUAIPE-005', 'cantidad': 1, 'precio_unitario': 19990, 'imagen_url': 'productos_imagenes/huaipe.jpg'},
    ]
    
    total_carrito_ejemplo = sum(item['cantidad'] * item['precio_unitario'] for item in items_del_carrito_ejemplo)
    
    context = {
        'page_title': 'Tu Carrito de Compras',
        'items_carrito': items_del_carrito_ejemplo, # Reemplazar con la lógica real
        'total_carrito': total_carrito_ejemplo, # Reemplazar con la lógica real
        'costo_despacho': 4990, # Podría ser dinámico
    }
    if not items_del_carrito_ejemplo: # Si el carrito está vacío
        context['items_en_carrito'] = False
    else:
        context['items_en_carrito'] = True
    if request.method == 'POST':
        action = request.POST.get('action')
        item_id = request.POST.get('item_id')

        if action == 'update_quantity' and item_id:
            new_quantity = int(request.POST.get('quantity', 1))
            logger.info(f"Actualizar cantidad para item {item_id} a {new_quantity}")
            return redirect('core:carrito') 

        if action == 'remove_item' and item_id:
            logger.info(f"Eliminar item {item_id}")
            return redirect('core:carrito')
            
    return render(request, 'core/carrito.html', context)

def realizar_compra_view(request):
    items_del_carrito_ejemplo = [
        {'id': 1, 'nombre': 'Taladro Percutor Inalámbrico 20V', 'cantidad': 1, 'precio_total': 59990},
        {'id': 2, 'nombre': 'Set de Brocas Titanio (15 piezas)', 'cantidad': 2, 'precio_total': 45900},
        {'id': 3, 'nombre': 'Huaipe Industrial (Rollo 5kg)', 'cantidad': 1, 'precio_total': 19990},
    ]
    subtotal_ejemplo = sum(item['precio_total'] for item in items_del_carrito_ejemplo)
    descuento_ejemplo = 5000 # Simulado
    costo_despacho_ejemplo = 4990
    total_final_ejemplo = subtotal_ejemplo - descuento_ejemplo + costo_despacho_ejemplo

    context = {
        'page_title': 'Finalizar Compra',
        'items_resumen': items_del_carrito_ejemplo,
        'subtotal': subtotal_ejemplo,
        'descuento': descuento_ejemplo,
        'costo_despacho': costo_despacho_ejemplo,
        'total_final': total_final_ejemplo,
    }
    return render(request, 'core/realizar_compra.html', context)

def procesar_pago_view(request):
    if request.method == 'POST':
        nombre = request.POST.get('firstName')
        direccion = request.POST.get('address')
        logger.info(f"Procesando pago para: {nombre} en {direccion}")
        numero_orden_simulado = f"FM-{int(time.time())}"
        return redirect('core:compra_exitosa_with_order', numero_orden=numero_orden_simulado)


    return redirect('core:realizar_compra')

def compra_exitosa_view(request, numero_orden=None): # Modificado para aceptar numero_orden
    context = {
        'page_title': '¡Compra Exitosa!',
        'numero_orden': numero_orden if numero_orden else "Desconocido",
        'user': request.session.get('user_info') # Para el saludo personalizado
    }
    return render(request, 'core/compra_exitosa.html', context)