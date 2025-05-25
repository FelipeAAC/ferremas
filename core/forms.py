from django import forms

class ProductImageUploadForm(forms.Form):
    id_producto = forms.IntegerField(widget=forms.HiddenInput(), required=False)
    imagen = forms.ImageField(label="Seleccionar Imagen del Producto")