from django.urls import path
from . import views

app_name = 'core'

urlpatterns = [
    path('', views.index_view, name='index'),
    path('productos/', views.productos, name='productos'),
    path('perfil/', views.perfil_view, name='perfil'),
    path('login/', views.login_view, name='login'),
    path('registro/', views.registro_view, name='registro'),
    path('carrito/', views.carrito_view, name='carrito'),
    path('realizar_compra/', views.realizar_compra_view, name='realizar_compra'),
    
    # URLs para el proceso de pago
    path('procesar-pago/', views.procesar_pago_view, name='procesar_pago'),
    path('paypal-capture-order/', views.paypal_capture_order_view, name='paypal_capture_order'), # <--- ESTA ES LA URL CLAVE QUE FALTA
    path('compra-exitosa/<str:numero_orden>/', views.compra_exitosa_view, name='compra_exitosa_with_order'),
    # Si tienes una página de éxito genérica sin número de orden (aunque tu vista actual espera uno)
    # path('compra-exitosa/', views.compra_exitosa_view, name='compra_exitosa_generic'),

    # URLs para empleados/administración
    path('empleado/realizar_compra/', views.empleado_realizar_compra_view, name='empleado_realizar_compra'),
    path('admin-api-crud/', views.admin_api_crud_view, name='admin_api_crud'),
    path('bodeguero/pedidos/', views.bodeguero_pedidos_view, name='bodeguero_pedidos'),
    path('upload-image/<int:id_producto_api>/', views.upload_product_image, name='upload_product_image'),
]