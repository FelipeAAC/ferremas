from django.shortcuts import render, redirect
from django.conf import settings
from django.core.files.storage import FileSystemStorage
from .forms import ProductImageUploadForm
import requests
import logging
import os
import time
from django.contrib.auth.decorators import login_required
import json

logger = logging.getLogger(__name__)

API_CRUD_BASE_URL = "http://127.0.0.1:8001"
API_AUTH_BASE_URL = "http://127.0.0.1:8002"

def perfil_view(request):
    context = {
        'page_title': 'Mi Perfil',
        'api_auth_url_js': API_AUTH_BASE_URL,
        'api_crud_url_js': API_CRUD_BASE_URL
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
    return render(request, 'core/login.html', context)

def index_view(request):
    context = {
        'page_title': 'Bienvenido a Ferremas',
        'welcome_message': 'Tu ferretería online de confianza.'
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

def upload_product_image(request, id_producto_api):
    upload_form_template = 'core/upload_image_form.html' 

    if request.method == 'POST':
        form = ProductImageUploadForm(request.POST, request.FILES, initial={'id_producto': id_producto_api})
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
        form = ProductImageUploadForm(initial={'id_producto': id_producto_api})
        
    return render(request, upload_form_template, {'form': form, 'id_producto': id_producto_api})

def carrito_view(request):
    context = {
        'page_title': 'Tu Carrito de Compras',
        'api_auth_url_js': API_AUTH_BASE_URL
    }
    return render(request, 'core/carrito.html', context)

def realizar_compra_view(request):
    context = {
        'page_title': 'Finalizar Compra',
    }
    # Asume que 'core/realizar_compra.html' es la plantilla genérica.
    return render(request, 'core/realizar_compra.html', context)

def procesar_pago_view(request):
    if request.method == 'POST':
        nombre = request.POST.get('firstName')
        direccion = request.POST.get('address')
        logger.info(f"Procesando pago para: {nombre} en {direccion}")
        numero_orden_simulado = f"FM-{int(time.time())}"
        # Redirige a la página de éxito con el número de orden.
        return redirect('core:compra_exitosa_with_order', numero_orden=numero_orden_simulado)
    # Si no es POST, redirige de vuelta a la página de compra.
    return redirect('core:realizar_compra')

def compra_exitosa_view(request, numero_orden=None):
    context = {
        'page_title': '¡Compra Exitosa!',
        'numero_orden': numero_orden if numero_orden else "Desconocido",
        'user': request.session.get('user_info'),
        'api_auth_url_js': API_AUTH_BASE_URL
    }
    return render(request, 'core/compra_exitosa.html', context)

def admin_api_crud_view(request):
    """
    Prepara y sirve la página de administración del API CRUD.
    Esta vista compila la metadata de todas las entidades de la API FastAPI
    para que el frontend (admin.js) pueda generar dinámicamente
    los formularios y realizar las llamadas a la API.
    """
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
    'api_entities_json': json.dumps(api_entities_list),
    'api_entities': api_entities_list,
    'API_CRUD_BASE_URL_for_js': API_CRUD_BASE_URL
    }
    return render(request, 'core/admin_api_crud_index.html', context)