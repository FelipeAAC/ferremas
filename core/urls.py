from django.urls import path
from . import views

app_name = 'core'
urlpatterns = [
    path('', views.index_view, name='index'),
    path('productos/', views.productos, name='productos'),
    path('producto/<int:id_producto_api>/subir_imagen/', views.upload_product_image, name='upload_product_image'),
    path('login/', views.login_view, name='login'),
    path('registro/', views.registro_view, name='registro'),
    path('carrito/', views.carrito_view, name='carrito'),
    path('realizar_compra/', views.realizar_compra_view, name='realizar_compra'),
    path('procesar_pago/', views.procesar_pago_view, name='procesar_pago'), # Para el POST del formulario de compra
    path('compra_exitosa/', views.compra_exitosa_view, name='compra_exitosa'),
    path('compra_exitosa/<str:numero_orden>/', views.compra_exitosa_view, name='compra_exitosa_with_order'),
]