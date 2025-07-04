from django.urls import path
from . import views

app_name = 'core'

urlpatterns = [
    path('', views.index_view, name='index'),
    path('productos/', views.productos, name='productos'),
    path('upload_image/<str:id_producto_api>/', views.upload_product_image, name='upload_product_image'),
    path('login/', views.login_view, name='login'),
    path('registro/', views.registro_view, name='registro'),
    path('carrito/', views.carrito_view, name='carrito'),
    path('realizar_compra/', views.realizar_compra_view, name='realizar_compra'),
    path('procesar_pago/', views.procesar_pago_view, name='procesar_pago'),
    path('compra_exitosa/', views.compra_exitosa_view, name='compra_exitosa_default'),
    path('compra_exitosa/<str:numero_orden>/', views.compra_exitosa_view, name='compra_exitosa_with_order'),
    path('perfil/', views.perfil_view, name='perfil'),
    path('admin-api-crud/', views.admin_api_crud_view, name='admin_api_crud'),
    path('bodega/', views.bodeguero_pedidos_view, name='bodeguero_pedidos'),
    path('registrar-venta/', views.empleado_realizar_compra_view, name='empleado_realizar_compra'),
    path('activar-cuenta/', views.activar_cuenta_view, name='activar_cuenta'),
    path('contador/', views.contador_pedidos_view, name='contador_pedidos'),
]