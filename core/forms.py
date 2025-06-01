from django import forms

class ProductImageUploadForm(forms.Form):
    id_producto = forms.IntegerField(widget=forms.HiddenInput(), required=False)
    imagen = forms.ImageField(label="Seleccionar Imagen del Producto")

class PaymentProcessingForm(forms.Form):
    paymentMethod = forms.CharField(required=False) # Podría ser un ChoiceField si tienes métodos fijos
    paypal_order_id = forms.CharField(required=False)
    
    firstName = forms.CharField(max_length=100, required=False)
    lastName = forms.CharField(max_length=100, required=False) # Asumiendo que podrías quererlo
    address = forms.CharField(max_length=255, required=False)

    def clean(self):
        cleaned_data = super().clean()
        payment_method = cleaned_data.get('paymentMethod')
        paypal_order_id = cleaned_data.get('paypal_order_id')
        first_name = cleaned_data.get('firstName')

        if payment_method == 'paypal' and not paypal_order_id:
            self.add_error('paypal_order_id', 'Se requiere el ID de la orden de PayPal para este método de pago.')
        
        if payment_method and payment_method != 'paypal':
            if not first_name: # Ejemplo de validación
                 self.add_error('firstName', 'El nombre es requerido para este método de pago.')
        
        if not payment_method and paypal_order_id:
            cleaned_data['paymentMethod'] = 'paypal' # Lo establecemos para que la vista lo tenga

        return cleaned_data