if (typeof API_CRUD_URL_FROM_DJANGO === 'undefined') {
    console.error("empleado.js: API_CRUD_URL_FROM_DJANGO no está definida. Asegúrate de que esté en el HTML.");
} else if (typeof IS_EMPLOYEE_CHECKOUT === 'undefined' || !IS_EMPLOYEE_CHECKOUT) {
} else {
    document.addEventListener('DOMContentLoaded', function() {
        const clientSearchInput = document.getElementById('clientSearchInput');
        const clientSearchResultsContainer = document.getElementById('clientSearchResults');
        const clientListUl = document.getElementById('clientList');
        const toggleNewClientFormBtn = document.getElementById('toggleNewClientFormBtn');
        const newClientFormContainer = document.getElementById('newClientFormContainer');
        const saveNewClientBtn = document.getElementById('saveNewClientBtn');
        const formNewClient = document.getElementById('formNewClient');

        const selectedClientInfoDiv = document.getElementById('selectedClientInfo');
        const selectedClientIdDisplay = document.getElementById('selectedClientIdDisplay'); // Para mostrar el ID
        const selectedClientNameSpan = document.getElementById('selectedClientName');
        const selectedClientEmailSpan = document.getElementById('selectedClientEmail');
        
        const hiddenSelectedClientIdInput = document.getElementById('hiddenSelectedClientId');

        const checkoutFormEmpleado = document.getElementById('checkout-form-empleado');
        const submitOrderButtonEmpleado = document.getElementById('submit-order-button-empleado');

        const clientFirstNameInput = document.getElementById('firstName');
        const clientLastNameInput = document.getElementById('lastName');
        const clientEmailInput = document.getElementById('email');
        const clientAddressInput = document.getElementById('address');

        let searchTimeout;

        function escapeHtmlJS(unsafe) {
            if (unsafe === null || typeof unsafe === 'undefined') return '';
            return String(unsafe).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        }

        function showCheckoutAlert(message, type = 'info', duration = 7000) {
            const alertContainer = document.getElementById('checkout-alert-container');
            if (!alertContainer) {
                console.warn("Contenedor de alertas 'checkout-alert-container' no encontrado.");
                return;
            }
            const alertId = `alert-${Date.now()}`;
            const escapedMessage = escapeHtmlJS(message);
            const alertHtml = `<div id="${alertId}" class="alert alert-${type} alert-dismissible fade show" role="alert">${escapedMessage}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>`;
            alertContainer.innerHTML = alertHtml;
            
            if (duration > 0) {
                setTimeout(() => {
                    const activeAlert = document.getElementById(alertId);
                    if (activeAlert) {
                        const bsAlert = bootstrap.Alert.getOrCreateInstance(activeAlert);
                        if (bsAlert) bsAlert.close();
                    }
                }, duration);
            }
        }

        if (clientSearchInput) {
            clientSearchInput.addEventListener('input', function() {
                clearTimeout(searchTimeout);
                const query = this.value.trim();
                if (query.length < 2) {
                    if(clientSearchResultsContainer) clientSearchResultsContainer.style.display = 'none';
                    if(clientListUl) clientListUl.innerHTML = '';
                    return;
                }
                searchTimeout = setTimeout(async () => {
                    if(clientListUl) clientListUl.innerHTML = '<li class="list-group-item text-muted small">Buscando clientes...</li>';
                    if(clientSearchResultsContainer) clientSearchResultsContainer.style.display = 'block';
                    try {
                        const response = await fetch(`${API_CRUD_URL_FROM_DJANGO}/clientes`); 
                        
                        if (!response.ok) {
                            const errorData = await response.json().catch(() => ({detail: "Error de red o respuesta no JSON."}));
                            throw new Error(errorData.detail || `Error ${response.status} al buscar clientes.`);
                        }
                        let allClients = await response.json();
                        let filteredClients = [];

                        if (allClients && Array.isArray(allClients) && query) {
                             filteredClients = allClients.filter(client => 
                                (client.p_nombre && client.p_nombre.toLowerCase().includes(query.toLowerCase())) ||
                                (client.p_apellido && client.p_apellido.toLowerCase().includes(query.toLowerCase())) ||
                                (client.correo && client.correo.toLowerCase().includes(query.toLowerCase())) ||
                                (client.id_cliente && String(client.id_cliente).includes(query)) // Buscar también por ID
                            );
                        }
                        
                        if(clientListUl) clientListUl.innerHTML = '';
                        if (filteredClients.length > 0) {
                            filteredClients.forEach(client => {
                                const li = document.createElement('li');
                                li.classList.add('list-group-item', 'list-group-item-action', 'py-2', 'px-3', 'small');
                                li.innerHTML = `
                                    <strong>${escapeHtmlJS(client.p_nombre || '')} ${escapeHtmlJS(client.p_apellido || '')}</strong> (ID: ${client.id_cliente})<br>
                                    <small class="text-muted">${escapeHtmlJS(client.correo || 'N/A')}</small>
                                `;
                                li.dataset.clientId = client.id_cliente;
                                li.dataset.clientPNombre = client.p_nombre || '';
                                li.dataset.clientPApellido = client.p_apellido || '';
                                li.dataset.clientCorreo = client.correo || '';
                                
                                li.addEventListener('click', function() {
                                    selectClient(this.dataset);
                                    if(clientSearchResultsContainer) clientSearchResultsContainer.style.display = 'none';
                                    clientSearchInput.value = `${this.dataset.clientPNombre} ${this.dataset.clientPApellido}`;
                                });
                                clientListUl.appendChild(li);
                            });
                        } else {
                            if(clientListUl) clientListUl.innerHTML = '<li class="list-group-item text-muted small">No se encontraron clientes con ese criterio.</li>';
                        }
                        if(clientSearchResultsContainer) clientSearchResultsContainer.style.display = 'block';
                    } catch (error) {
                        console.error("Error buscando clientes:", error);
                        if(clientListUl) clientListUl.innerHTML = `<li class="list-group-item text-danger small">Error al buscar: ${escapeHtmlJS(error.message)}</li>`;
                        if(clientSearchResultsContainer) clientSearchResultsContainer.style.display = 'block';
                    }
                }, 600); // Debounce
            });
        }

        if (toggleNewClientFormBtn) {
            toggleNewClientFormBtn.addEventListener('click', () => {
                const isHidden = newClientFormContainer.style.display === 'none' || newClientFormContainer.style.display === '';
                newClientFormContainer.style.display = isHidden ? 'block' : 'none';
                if (isHidden) { // Si se va a mostrar el formulario de nuevo cliente
                    deselectClient(); // Limpiar cualquier cliente previamente seleccionado
                    if (formNewClient) {
                        formNewClient.reset(); // Limpiar campos del formulario
                        formNewClient.classList.remove('was-validated'); // Quitar estilos de validación
                    }
                    if (clientSearchInput) clientSearchInput.value = ''; // Limpiar búsqueda
                    if (clientSearchResultsContainer) clientSearchResultsContainer.style.display = 'none';
                    const idClienteField = document.getElementById('newClientId');
                    if (idClienteField) idClienteField.focus(); // Poner foco en el primer campo
                }
            });
        }

        function selectClient(clientData) {
            if(selectedClientIdDisplay) selectedClientIdDisplay.textContent = clientData.clientId;
            if(selectedClientNameSpan) selectedClientNameSpan.textContent = `${clientData.clientPNombre} ${clientData.clientPApellido}`;
            if(selectedClientEmailSpan) selectedClientEmailSpan.textContent = clientData.clientCorreo;
            if(hiddenSelectedClientIdInput) hiddenSelectedClientIdInput.value = clientData.clientId;
            if(selectedClientInfoDiv) selectedClientInfoDiv.style.display = 'block';
            if(newClientFormContainer) newClientFormContainer.style.display = 'none'; // Ocultar form de nuevo cliente

            if(clientFirstNameInput) clientFirstNameInput.value = clientData.clientPNombre || '';
            if(clientLastNameInput) clientLastNameInput.value = clientData.clientPApellido || '';
            if(clientEmailInput) clientEmailInput.value = clientData.clientCorreo || '';
        }

        function deselectClient() {
            if(selectedClientIdDisplay) selectedClientIdDisplay.textContent = '';
            if(selectedClientNameSpan) selectedClientNameSpan.textContent = '';
            if(selectedClientEmailSpan) selectedClientEmailSpan.textContent = '';
            if(hiddenSelectedClientIdInput) hiddenSelectedClientIdInput.value = '';
            if(selectedClientInfoDiv) selectedClientInfoDiv.style.display = 'none';
            
            if(clientFirstNameInput) clientFirstNameInput.value = '';
            if(clientLastNameInput) clientLastNameInput.value = '';
            if(clientEmailInput) clientEmailInput.value = '';
            if(clientAddressInput) clientAddressInput.value = '';
        }

        if (saveNewClientBtn && formNewClient) {
            saveNewClientBtn.addEventListener('click', async () => {
                if (!formNewClient.checkValidity()) {
                    formNewClient.classList.add('was-validated');
                    showCheckoutAlert('Por favor, complete todos los campos obligatorios (*) para el nuevo cliente.', 'warning');
                    const firstInvalid = formNewClient.querySelector(':invalid');
                    if (firstInvalid) firstInvalid.focus();
                    return;
                }
                formNewClient.classList.add('was-validated');

                const newClientData = {
                    id_cliente: parseInt(document.getElementById('newClientId').value.trim()),
                    p_nombre: document.getElementById('newClientPNombre').value.trim(),
                    s_nombre: document.getElementById('newClientSNombre').value.trim() || null,
                    p_apellido: document.getElementById('newClientPApellido').value.trim(),
                    s_apellido: document.getElementById('newClientSApellido').value.trim() || null,
                    correo: document.getElementById('newClientCorreo').value.trim(),
                    telefono: document.getElementById('newClientTelefono').value.trim() || null,
                    clave_hash: document.getElementById('newClientClave').value, // API espera 'clave_hash'
                    activo: 'S'
                };
                
                const originalBtnText = saveNewClientBtn.innerHTML;
                saveNewClientBtn.disabled = true;
                saveNewClientBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Guardando...';

                try {
                    const response = await fetch(`${API_CRUD_URL_FROM_DJANGO}/clientes`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams(newClientData)
                    });
                    const result = await response.json();
                    
                    if (!response.ok) {
                         throw new Error(result.detail || result.Mensaje || result.message || `Error ${response.status} al crear cliente.`);
                    }
                    showCheckoutAlert(`Cliente '${escapeHtmlJS(result.p_nombre)} ${escapeHtmlJS(result.p_apellido)}' (ID: ${result.id_cliente}) creado con éxito. Por favor, búsquelo y selecciónelo para la venta.`, 'success');
                    formNewClient.reset();
                    formNewClient.classList.remove('was-validated');
                    if (newClientFormContainer) newClientFormContainer.style.display = 'none';
                    if (clientSearchInput) clientSearchInput.focus();
                } catch (error) {
                    console.error("Error al crear cliente:", error);
                    showCheckoutAlert(`Error al crear cliente: ${escapeHtmlJS(error.message)}`, 'danger');
                } finally {
                    saveNewClientBtn.disabled = false;
                    saveNewClientBtn.innerHTML = '<i class="fas fa-save me-1"></i> Guardar Nuevo Cliente';
                }
            });
        }
        
        const paymentMethodOptions = document.querySelectorAll('.payment-method-option input[name="paymentMethod"]');
        const paymentDetailsDivs = document.querySelectorAll('.payment-details');
        const mainSubmitButtonEmpleado = document.getElementById('submit-order-button-empleado');
        const paypalContainerEmpleado = document.getElementById('paypal-button-container-empleado');

        if (paymentMethodOptions && paymentMethodOptions.length > 0) {
            paymentMethodOptions.forEach(radio => {
                radio.addEventListener('change', function() {
                    if(paymentDetailsDivs) paymentDetailsDivs.forEach(div => div.classList.remove('active'));
                    const selectedMethod = this.value;
                    const detailDiv = document.getElementById(`payment-details-${selectedMethod}`);
                    if (detailDiv) detailDiv.classList.add('active');

                    if (selectedMethod === 'paypal_empleado' && paypalContainerEmpleado) {
                        if(mainSubmitButtonEmpleado) mainSubmitButtonEmpleado.style.display = 'none';
                        renderPayPalButtonsEmpleado();
                    } else {
                        if(mainSubmitButtonEmpleado) mainSubmitButtonEmpleado.style.display = 'block';
                        if(paypalContainerEmpleado) paypalContainerEmpleado.innerHTML = '';
                    }
                });
            });
            const checkedPaymentMethod = document.querySelector('input[name="paymentMethod"]:checked');
            if (!checkedPaymentMethod) {
                paymentMethodOptions[0].checked = true;
                paymentMethodOptions[0].dispatchEvent(new Event('change'));
            } else {
                 checkedPaymentMethod.dispatchEvent(new Event('change')); // Forzar actualización de UI para el ya chequeado
            }
        }

        function renderPayPalButtonsEmpleado() {
            if (typeof paypal === 'undefined' || !paypal.Buttons || !paypalContainerEmpleado) {
                console.error('SDK de PayPal no cargado o contenedor no encontrado.');
                showCheckoutAlert('Error al cargar opciones de PayPal. Asegúrese de que el SDK de PayPal esté incluido en la página.', 'danger');
                return;
            }
            paypalContainerEmpleado.innerHTML = ''; 
            try {
                paypal.Buttons({
                    createOrder: function(data, actions) {
                        const totalElement = document.getElementById('checkout-total');
                        let totalAmount = '1.00'; 
                        if (totalElement && totalElement.textContent) {
                             totalAmount = totalElement.textContent.replace('$', '').replace(/\./g, '').replace(',', '.') || '1.00';
                        }
                        if (parseFloat(totalAmount) <= 0) {
                            showCheckoutAlert('El total del pedido para PayPal debe ser mayor a cero.', 'warning');
                            throw new Error("Invalid amount for PayPal order");
                        }
                        return actions.order.create({
                            purchase_units: [{ amount: { value: parseFloat(totalAmount).toFixed(2), currency_code: 'USD' }}] // OJO: USD
                        });
                    },
                    onApprove: function(data, actions) {
                        return actions.order.capture().then(function(details) {
                            showCheckoutAlert(`Pago con PayPal completado. Transacción ID: ${details.id}. Registrando venta...`, 'success');
                            if (checkoutFormEmpleado) {
                                if (!hiddenSelectedClientIdInput || !hiddenSelectedClientIdInput.value) {
                                    showCheckoutAlert('CRÍTICO: No hay cliente seleccionado. El pedido no se puede atribuir. Seleccione un cliente y reintente el pago si es necesario.', 'danger');
                                    if(mainSubmitButtonEmpleado) mainSubmitButtonEmpleado.style.display = 'block';
                                    if(paypalContainerEmpleado) renderPayPalButtonsEmpleado(); // Re-render PayPal buttons
                                    return; 
                                }
                                const paypalInput = document.createElement('input');
                                paypalInput.type = 'hidden';
                                paypalInput.name = 'paypal_transaction_id';
                                paypalInput.value = details.id;
                                checkoutFormEmpleado.appendChild(paypalInput);
                                
                                checkoutFormEmpleado.action = "{% url 'core:procesar_pago' %}"; 
                                checkoutFormEmpleado.submit();
                            }
                        });
                    },
                    onError: function(err) {
                        console.error('Error de PayPal SDK:', err);
                        showCheckoutAlert('Ocurrió un error con el pago de PayPal. Por favor, intente de nuevo o elija otro método.', 'danger');
                    }
                }).render('#paypal-button-container-empleado');
            } catch (error) {
                 console.error('Error al renderizar botones de PayPal:', error);
                 if(paypalContainerEmpleado) paypalContainerEmpleado.innerHTML = '<p class="text-danger text-center">Error al cargar botones de PayPal.</p>';
            }
        }

        if (submitOrderButtonEmpleado && checkoutFormEmpleado) {
            submitOrderButtonEmpleado.addEventListener('click', function(event) {
                event.preventDefault(); 
                if (!hiddenSelectedClientIdInput || !hiddenSelectedClientIdInput.value) {
                    showCheckoutAlert('Por favor, busque y seleccione un cliente o cree uno nuevo antes de continuar.', 'warning');
                    const clientSection = document.querySelector('.client-management-section');
                    if (clientSection) clientSection.scrollIntoView({ behavior: 'smooth' });
                    return;
                }
                if (!checkoutFormEmpleado.checkValidity()) {
                    checkoutFormEmpleado.classList.add('was-validated');
                    const firstInvalidField = checkoutFormEmpleado.querySelector(':invalid');
                    if(firstInvalidField) firstInvalidField.focus();
                    return;
                }
                const selectedPaymentMethodRadio = document.querySelector('input[name="paymentMethod"]:checked');
                if (selectedPaymentMethodRadio && selectedPaymentMethodRadio.value !== 'paypal_empleado') {
                    checkoutFormEmpleado.action = "{% url 'core:procesar_pago' %}"; 
                    checkoutFormEmpleado.submit();
                } else if (!selectedPaymentMethodRadio) {
                     showCheckoutAlert('Por favor, seleccione un método de pago.', 'warning');
                } else if (selectedPaymentMethodRadio && selectedPaymentMethodRadio.value === 'paypal_empleado') {
                    showCheckoutAlert('Para pagar con PayPal, por favor usa los botones de PayPal que aparecen debajo de la opción.', 'info');
                }
            });
        }

        function updateCheckoutPageSummary() {
            const cart = JSON.parse(localStorage.getItem('ferremasCart')) || []; // Asume que el carrito se llama 'ferremasCart'
            const summaryContainer = document.getElementById('checkout-cart-summary');
            const emptyCartMsg = document.getElementById('checkout-cart-empty');
            const totalsSummary = document.getElementById('checkout-totals-summary');
            const itemCountBadge = document.getElementById('checkout-item-count');
            const subtotalEl = document.getElementById('checkout-subtotal');
            const shippingEl = document.getElementById('checkout-shipping');
            const totalEl = document.getElementById('checkout-total');

            if (!summaryContainer || !emptyCartMsg || !totalsSummary || !itemCountBadge || !subtotalEl || !shippingEl || !totalEl) {
                console.error("Faltan elementos del DOM para el resumen del checkout en empleado.js.");
                return;
            }

            summaryContainer.innerHTML = ''; // Limpiar
            let currentSubtotal = 0;
            let totalQuantity = 0;

            if (cart.length === 0) {
                emptyCartMsg.style.display = 'block'; // Mostrar mensaje de carrito vacío
                summaryContainer.appendChild(emptyCartMsg);
                totalsSummary.style.display = 'none';
                itemCountBadge.textContent = '0';
                if (submitOrderButtonEmpleado) submitOrderButtonEmpleado.classList.add('disabled');
            } else {
                emptyCartMsg.style.display = 'none';
                totalsSummary.style.display = 'block';
                if (submitOrderButtonEmpleado) submitOrderButtonEmpleado.classList.remove('disabled');

                cart.forEach(item => {
                    const itemPrice = parseFloat(item.price) || 0;
                    const itemQuantity = parseInt(item.quantity) || 0;
                    const itemTotal = itemPrice * itemQuantity;
                    currentSubtotal += itemTotal;
                    totalQuantity += itemQuantity;

                    const listItem = document.createElement('li');
                    listItem.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'lh-sm', 'py-2', 'px-3');
                    listItem.innerHTML = `
                        <div class="me-2">
                            <h6 class="my-0 small text-truncate" style="max-width: 180px;" title="${escapeHtmlJS(item.name)}">${escapeHtmlJS(item.name)}</h6>
                            <small class="text-muted">Cant: ${itemQuantity}</small>
                        </div>
                        <span class="text-muted small">$${(itemTotal).toLocaleString('es-CL')}</span>
                    `;
                    summaryContainer.appendChild(listItem);
                });
                
                const shippingCost = 4990; // Podría ser dinámico en el futuro
                const finalTotal = currentSubtotal + shippingCost;

                subtotalEl.textContent = `$${currentSubtotal.toLocaleString('es-CL')}`;
                shippingEl.textContent = `$${shippingCost.toLocaleString('es-CL')}`;
                totalEl.textContent = `$${finalTotal.toLocaleString('es-CL')}`;
                itemCountBadge.textContent = totalQuantity; // Mostrar cantidad total de items
            }
        }

        updateCheckoutPageSummary();

        document.body.addEventListener('cartUpdatedGlobal', function() {
            updateCheckoutPageSummary();
        });
    });
}