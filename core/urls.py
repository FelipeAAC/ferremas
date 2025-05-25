from django.urls import path
from . import views

app_name = 'core'
urlpatterns = [
    path('', views.index_view, name='index'),
    path('productos/', views.productos, name='productos'),
    path('producto/<int:id_producto_api>/subir_imagen/', views.upload_product_image, name='upload_product_image'),
]