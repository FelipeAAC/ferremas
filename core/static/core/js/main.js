document.addEventListener('DOMContentLoaded', function () {
    const API_AUTH_BASE_URL = (typeof API_AUTH_URL_FROM_DJANGO !== "undefined" && API_AUTH_URL_FROM_DJANGO) ? API_AUTH_URL_FROM_DJANGO : "http://127.0.0.1:8002";
    const API_CRUD_BASE_URL = (typeof API_CRUD_URL_FROM_DJANGO !== 'undefined' && API_CRUD_URL_FROM_DJANGO) ? API_CRUD_URL_FROM_DJANGO : "http://127.0.0.1:8001";

    const userGreetingElement = document.getElementById('user-greeting');
    const loginLink = document.getElementById('login-link');
    const registerLink = document.getElementById('register-link');
    const logoutLink = document.getElementById('logout-link');
    const profileLink = document.getElementById('profile-link');
    const cartCountBadge = document.getElementById('cart-count-badge');

    const paymentMethodRadios = document.querySelectorAll('input[name="paymentMethod"]');
    const paymentDetailsSections = document.querySelectorAll('.payment-details');
    const checkoutForm = document.getElementById('checkout-form');
    
    const checkoutAlertContainer = document.getElementById('checkout-alert-container');
    const orderTotalElement = document.getElementById('checkout-total');
    const currencySymbolElement = document.getElementById('checkout-currency-symbol');
    
    const paypalButtonDOMContainer = document.getElementById('paypal-button-container');
    const paypalButtonDOMContainerEmpleado = document.getElementById('paypal-button-container-empleado');
    
    const currentPaypalContainer = (typeof IS_EMPLOYEE_PAGE !== 'undefined' && IS_EMPLOYEE_PAGE) ? paypalButtonDOMContainerEmpleado : paypalButtonDOMContainer;

    const submitOrderButton = document.getElementById('submit-order-button');
    const submitOrderButtonEmpleado = document.getElementById('submit-order-button-empleado');
    
    const currentSubmitButton = (typeof IS_EMPLOYEE_PAGE !== 'undefined' && IS_EMPLOYEE_PAGE) ? submitOrderButtonEmpleado : submitOrderButton;

    let PAYPAL_TARGET_CURRENCY = 'CLP';

    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    function showCheckoutAlert(message, type = 'danger', isPermanent = false) {
        if (checkoutAlertContainer) {
            const alertId = `checkout-alert-${Date.now()}`;
            if (!isPermanent) {
                const existingAlert = checkoutAlertContainer.querySelector('.alert:not([data-is-permanent="true"])');
                if (existingAlert) {
                    const bsExistingAlert = typeof bootstrap !== 'undefined' ? bootstrap.Alert.getOrCreateInstance(existingAlert) : null;
                    if (bsExistingAlert) bsExistingAlert.close();
                }
            } else {
                 checkoutAlertContainer.innerHTML = '';
            }

            const alertDiv = document.createElement('div');
            alertDiv.id = alertId;
            alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
            alertDiv.setAttribute('role', 'alert');
            if (isPermanent) alertDiv.setAttribute('data-is-permanent', 'true');
            alertDiv.innerHTML = `
                ${escapeHtml(message)}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            `;
            checkoutAlertContainer.appendChild(alertDiv);

            if (!isPermanent) {
                setTimeout(() => {
                    const activeAlert = document.getElementById(alertId);
                    if (activeAlert && activeAlert.parentElement) {
                        const bsAlert = typeof bootstrap !== 'undefined' ? bootstrap.Alert.getOrCreateInstance(activeAlert) : null;
                        if (bsAlert) bsAlert.close();
                        else if (activeAlert.parentElement) activeAlert.parentElement.removeChild(activeAlert);
                    }
                }, 7000);
            }
        } else {
            console.warn("checkoutAlertContainer no encontrado. Mensaje:", message, "Tipo:", type);
        }
    }
    
    function getOrderAmountDetails() {
        let rawAmountString = '100'; 
        let pageDisplayCurrency = 'CLP'; 
        
        if (currencySymbolElement && currencySymbolElement.textContent) {
            const symbol = currencySymbolElement.textContent.trim().toUpperCase();
            if (['USD', 'EUR', 'CLP'].includes(symbol)) {
                pageDisplayCurrency = symbol;
            }
        }
        console.log("Moneda detectada en la página para PayPal:", pageDisplayCurrency);
        
        if (orderTotalElement && orderTotalElement.textContent) {
            rawAmountString = orderTotalElement.textContent;
        }

        let numericAmount = 0;

        if (pageDisplayCurrency === 'CLP') {
            let cleanedTotal = rawAmountString.replace(/[$.CLP\s]/g, '');
            numericAmount = parseInt(cleanedTotal, 10);
        } else if (pageDisplayCurrency === 'USD') {
            let cleanedTotal = rawAmountString.replace(/[^\d.]/g, ''); 
            numericAmount = parseFloat(cleanedTotal);
            const usdToClpRate = 950;
            numericAmount = Math.round(numericAmount * usdToClpRate);
            console.warn(`Advertencia: Monto USD (${parseFloat(cleanedTotal).toFixed(2)}) convertido a CLP (${numericAmount}) usando tasa de prueba ${usdToClpRate}.`);
        } else if (pageDisplayCurrency === 'EUR') {
            let cleanedTotal = rawAmountString.replace(/[^\d.]/g, '');
            numericAmount = parseFloat(cleanedTotal);
            const eurToClpRate = 1030;
            numericAmount = Math.round(numericAmount * eurToClpRate);
            console.warn(`Advertencia: Monto EUR (${parseFloat(cleanedTotal).toFixed(2)}) convertido a CLP (${numericAmount}) usando tasa de prueba ${eurToClpRate}.`);
        }

        if (isNaN(numericAmount) || numericAmount <= 0) {
            showCheckoutAlert(`El total del pedido (${rawAmountString} ${pageDisplayCurrency}) es inválido. Se usará un valor mínimo para PayPal.`, 'warning');
            numericAmount = 100;
        }
        
        const finalAmountForPaypal = String(Math.round(numericAmount)); 
        console.log("PayPal Amount Details (to be sent):", { value: finalAmountForPaypal, currency_code: PAYPAL_TARGET_CURRENCY });
        return { value: finalAmountForPaypal, currency_code: PAYPAL_TARGET_CURRENCY };
    }

    function initPayPalButton() {
        const paypalContainerToUse = currentPaypalContainer;

        if (typeof PAYPAL_CLIENT_ID === 'undefined' || !PAYPAL_CLIENT_ID) {
            console.error('PayPal Client ID no definido.');
            if (paypalContainerToUse) paypalContainerToUse.innerHTML = '<p class="text-danger text-center small py-3">Error de configuración de PayPal (ID Cliente).</p>';
            showCheckoutAlert('Error de configuración de PayPal. Por favor, contacta a soporte.', 'danger', true);
            return;
        }
        if (!paypalContainerToUse) {
            console.error('Contenedor de botones PayPal no encontrado para el contexto actual.');
            return;
        }
        if (typeof paypal === 'undefined') {
            console.error('SDK de PayPal no cargado.');
            paypalContainerToUse.innerHTML = '<p class="text-danger text-center py-3">Error al cargar SDK de PayPal. Recargue la página.</p>';
            showCheckoutAlert('Error al cargar la opción de pago PayPal. Intente recargar la página o seleccione otro método.', 'danger', true);
            return;
        }

        paypalContainerToUse.innerHTML = ''; 
        const loadingMsg = document.createElement('p');
        loadingMsg.className = 'text-center text-muted small py-2';
        loadingMsg.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Cargando botones de PayPal...';
        paypalContainerToUse.appendChild(loadingMsg);

        const amountDetails = getOrderAmountDetails();

        if (parseFloat(amountDetails.value) <= 0 || amountDetails.currency_code !== PAYPAL_TARGET_CURRENCY) {
            const errorMsg = amountDetails.currency_code !== PAYPAL_TARGET_CURRENCY 
                ? `Error de configuración de moneda para PayPal (se esperaba ${PAYPAL_TARGET_CURRENCY}, se obtuvo ${amountDetails.currency_code}).`
                : `El total del pedido es inválido (${amountDetails.value} ${amountDetails.currency_code}).`;
            console.error(errorMsg + " No se pueden renderizar los botones de PayPal.");
            if (paypalContainerToUse) paypalContainerToUse.innerHTML = `<p class="text-danger text-center py-3">${escapeHtml(errorMsg)}</p>`;
            showCheckoutAlert(errorMsg + " No se pueden mostrar los botones de PayPal.", 'danger', true);
            return;
        }
        
        try {
            paypal.Buttons({
                style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal', height: 40 },
                createOrder: function (data, actions) {
                    console.log("Creando orden de PayPal con:", amountDetails);
                    if (checkoutForm && !checkoutForm.checkValidity()) {
                        showCheckoutAlert('Por favor, completa todos los campos requeridos en el formulario antes de proceder con PayPal.', 'warning', false);
                        checkoutForm.classList.add('was-validated');
                        return Promise.reject(new Error("Formulario de pago inválido"));
                    }
                    return actions.order.create({
                        purchase_units: [{
                            amount: {
                                value: amountDetails.value,
                                currency_code: amountDetails.currency_code
                            },
                            description: "Compra en Ferremas"
                        }],
                        application_context: {
                            brand_name: 'Ferremas',
                            shipping_preference: 'SET_PROVIDED_ADDRESS',
                        }
                    });
                },
                onApprove: async function (data, actions) {
                    const orderID = data.orderID;
                    console.log("Pago de PayPal aprobado. PayPal OrderID:", orderID, "PayerID:", data.payerID);

                    if (currentSubmitButton) currentSubmitButton.disabled = true;
                    if (paypalContainerToUse) paypalContainerToUse.innerHTML = '<p class="text-center my-3"><i class="fas fa-spinner fa-spin me-2"></i>Procesando tu pago, por favor espera...</p>';
                    showCheckoutAlert('Procesando tu pago con PayPal...', 'info', true);

                    if (checkoutForm) {
                        let paypalOrderIDInput = checkoutForm.querySelector('input[name="paypal_order_id"]');
                        if (!paypalOrderIDInput) {
                            paypalOrderIDInput = document.createElement('input');
                            paypalOrderIDInput.type = 'hidden';
                            paypalOrderIDInput.name = 'paypal_order_id';
                            checkoutForm.appendChild(paypalOrderIDInput);
                        }
                        paypalOrderIDInput.value = orderID;

                        let paymentMethodNameInput = checkoutForm.querySelector('input[name="payment_method_name"]');
                        if (!paymentMethodNameInput) {
                            paymentMethodNameInput = document.createElement('input');
                            paymentMethodNameInput.type = 'hidden';
                            paymentMethodNameInput.name = 'payment_method_name';
                            checkoutForm.appendChild(paymentMethodNameInput);
                        }
                        const paymentMethodValue = (typeof IS_EMPLOYEE_PAGE !== 'undefined' && IS_EMPLOYEE_PAGE) ? 'paypal_empleado' : 'paypal';
                        paymentMethodNameInput.value = paymentMethodValue;
                        
                        const paypalRadio = document.getElementById(paymentMethodValue);
                        if (paypalRadio) paypalRadio.checked = true;
                    }
                    try {
                        if (typeof CSRF_TOKEN === 'undefined' || typeof PAYPAL_CAPTURE_URL_DJANGO === 'undefined') {
                            throw new Error("CSRF_TOKEN or PAYPAL_CAPTURE_URL_DJANGO is not defined.");
                        }

                        const formData = checkoutForm ? new FormData(checkoutForm) : new FormData();
                        formData.append('orderID', orderID);
                        formData.append('payment_method_name', (typeof IS_EMPLOYEE_PAGE !== 'undefined' && IS_EMPLOYEE_PAGE) ? 'paypal_empleado' : 'paypal');


                        console.log("Enviando datos para captura/procesamiento del pedido:", Object.fromEntries(formData));

                        const response = await fetch(PAYPAL_CAPTURE_URL_DJANGO, {
                            method: 'POST',
                            headers: {
                                'X-CSRFToken': CSRF_TOKEN
                            },
                            body: formData
                        });
                
                        const responseData = await response.json();
                
                        if (responseData.success || response.ok) {
                            showCheckoutAlert('¡Pago con PayPal aprobado y procesado! Redirigiendo...', 'success', true);
                            localStorage.removeItem('shoppingCart'); 
                            if (typeof updateCartCount === 'function') updateCartCount();
                            if (typeof renderCartPreview === 'function') renderCartPreview();
                            
                            if (responseData.redirect_url) {
                                window.location.href = responseData.redirect_url;
                            } else {
                                console.error('Redirect URL not provided by server.');
                                showCheckoutAlert('Pedido procesado, pero hubo un problema con la redirección. Contacta a soporte.', 'warning', true);
                                if (paypalContainerToUse) paypalContainerToUse.innerHTML = `<p class="text-success text-center py-3">Pago procesado. Error de redirección. ID: ${orderID}</p>`;
                            }
                        } else {
                            const errorDetail = responseData.error || responseData.message || responseData.detail || `Error del servidor: ${response.status}`;
                            console.error('Error en la captura/procesamiento por el servidor:', errorDetail);
                            showCheckoutAlert(`Error al procesar el pago: ${escapeHtml(errorDetail)}. Contacta a soporte con PayPal Order ID: ${orderID}.`, 'danger', true);
                            if (currentSubmitButton) currentSubmitButton.disabled = false;
                            initPayPalButton(); 
                        }
                    } catch (error) {
                        console.error('Error en fetch para capturar/procesar orden:', error);
                        showCheckoutAlert(`Ocurrió un error de comunicación al finalizar tu pago. Inténtalo de nuevo o contacta a soporte con PayPal Order ID: ${orderID}. Error: ${escapeHtml(error.message)}`, 'danger', true);
                        if (currentSubmitButton) currentSubmitButton.disabled = false;
                        initPayPalButton();
                    }
                },
                onError: function (err) {
                    console.error('Error general en el flujo de PayPal SDK:', err);
                    let userMessage = 'Hubo un error con PayPal. Por favor, revisa los detalles de tu cuenta PayPal, intenta con otro método de pago o recarga la página.';
                    if (err && typeof err.message === 'string' && err.message.includes("Formulario de pago inválido")) {
                        userMessage = 'Por favor, completa todos los campos requeridos en el formulario antes de proceder con PayPal.';
                    } else if (err && typeof err.message === 'string') {
                         userMessage = `Error de PayPal: ${escapeHtml(err.message)}. Intenta de nuevo o contacta a soporte.`;
                    }
                    showCheckoutAlert(userMessage, 'danger', true);
                    if (currentSubmitButton) currentSubmitButton.disabled = false;
                    if (paypalContainerToUse && !userMessage.includes("Formulario de pago inválido")) {
                         paypalContainerToUse.innerHTML = `<p class="text-danger text-center py-3">Error con PayPal. Intenta recargar o selecciona otro método.</p>`;
                    } else if (paypalContainerToUse) {
                        const amountDetailsCheck = getOrderAmountDetails();
                        if (parseFloat(amountDetailsCheck.value) <= 0 || amountDetailsCheck.currency_code !== PAYPAL_TARGET_CURRENCY) {
                        } else {
                        }
                    }
                },
                onCancel: function (data) {
                    console.log('Pago con PayPal cancelado por el usuario. Datos:', data);
                    showCheckoutAlert('Has cancelado el proceso de pago con PayPal. Puedes seleccionar otro método o reintentar.', 'info');
                    if (currentSubmitButton) currentSubmitButton.disabled = false;
                    if (paypalContainerToUse && paypalContainerToUse.querySelector('.fa-spinner')) {
                        initPayPalButton();
                    }
                }
            }).render(paypalContainerToUse).then(() => {
                if (paypalContainerToUse.contains(loadingMsg)) {
                    paypalContainerToUse.removeChild(loadingMsg);
                }
                console.log("Botones de PayPal renderizados.");
            }).catch(renderErr => {
                console.error('Error al renderizar botones de PayPal:', renderErr);
                if (paypalContainerToUse) paypalContainerToUse.innerHTML = '<p class="text-danger text-center small py-3">Error crítico al cargar los botones de PayPal. Por favor, recarga la página o selecciona otro método.</p>';
                showCheckoutAlert('No se pudieron cargar los botones de PayPal. Por favor, recarga la página o selecciona otro método de pago.', 'danger', true);
            });
        } catch(error) {
            console.error("Error general iniciando PayPal Buttons:", error);
            if (paypalContainerToUse) {
                paypalContainerToUse.innerHTML = '<p class="text-danger text-center py-3">Error crítico al iniciar PayPal. Recarga la página.</p>';
            }
            showCheckoutAlert('Ocurrió un error inesperado con la configuración de PayPal. Intenta recargar.', 'danger', true);
        }
    }

    function logoutUser() {
        localStorage.removeItem('access_token');
        localStorage.removeItem('token_type');
        localStorage.removeItem('shoppingCart'); 
        updateAuthUI();
        renderCartPreview(); 
        updateCartCount();   

        if (window.location.pathname !== "/" && !window.location.pathname.includes('/login/')) {
            window.location.href = '/'; 
        } else if (window.location.pathname.includes('/login/')) {
        } else {
            window.location.reload(); 
        }
    }

    function updateAuthUI() {
        const token = localStorage.getItem('access_token');
        if (token) {
            if (loginLink) loginLink.style.display = 'none';
            if (registerLink) registerLink.style.display = 'none';
            if (logoutLink) logoutLink.style.display = 'inline';
            if (profileLink) profileLink.style.display = 'inline';
            fetchUserProfile(token); 
        } else {
            if (userGreetingElement) userGreetingElement.textContent = '';
            if (loginLink) loginLink.style.display = 'inline';
            if (registerLink) registerLink.style.display = 'inline';
            if (logoutLink) logoutLink.style.display = 'none';
            if (profileLink) profileLink.style.display = 'none';
        }
    }

    async function fetchUserProfile(token) {
        try {
            const response = await fetch(`${API_AUTH_BASE_URL}/users/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                console.warn(`Error al obtener perfil: ${response.status}. Deslogueando.`);
                logoutUser(); 
                return;
            }

            const userData = await response.json();
            if (userGreetingElement) {
                userGreetingElement.textContent = `Hola, ${userData.p_nombre || userData.correo}!`;
            }
            
            if (window.location.pathname.includes("/perfil/")) {
                const profileWelcome = document.getElementById("profile-welcome-name");
                if (profileWelcome) profileWelcome.textContent = userData.p_nombre || "Usuario";
                if (userData.id_cliente) {
                    fetchUserOrders(userData.id_cliente);
                }
            }
             if (window.location.pathname.includes("/realizar_compra/") || (typeof IS_EMPLOYEE_PAGE !== 'undefined' && IS_EMPLOYEE_PAGE) ) {
                if (document.getElementById('firstName')) document.getElementById('firstName').value = userData.p_nombre || '';
                if (document.getElementById('lastName')) document.getElementById('lastName').value = userData.p_apellido || '';
                if (document.getElementById('email')) document.getElementById('email').value = userData.correo || '';
            }
        } catch (error) {
            console.error('Error crítico al obtener perfil o procesar datos:', error);
        }
    }

    async function fetchUserOrders(idCliente) {
        const pedidosEnCursoContainer = document.getElementById('pedidos-en-curso-container');
        const historialPedidosContainer = document.getElementById('historial-pedidos-container');
        const noPedidosEnCursoMsg = document.getElementById('no-pedidos-en-curso');
        const noHistorialPedidosMsg = document.getElementById('no-historial-pedidos');

        if (!pedidosEnCursoContainer || !historialPedidosContainer || !noPedidosEnCursoMsg || !noHistorialPedidosMsg) {
            console.warn("Elementos DOM для заказов не найдены на странице профиля.");
            return;
        }

        noPedidosEnCursoMsg.style.display = 'none';
        noHistorialPedidosMsg.style.display = 'none';
        if(pedidosEnCursoContainer) pedidosEnCursoContainer.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary" role="status"></div><p>Cargando pedidos en curso...</p></div>';
        if(historialPedidosContainer) historialPedidosContainer.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary" role="status"></div><p>Cargando historial de pedidos...</p></div>';

        try {
            const effectiveCrudUrl = API_CRUD_BASE_URL;
            const url = `${effectiveCrudUrl}/clientes/${idCliente}/pedidos/`;
            const token = localStorage.getItem('access_token');
            if (!token) {
                 throw new Error("Token de autenticación no encontrado para obtener pedidos.");
            }
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const responseText = await response.text();

            if (!response.ok) {
                let errorDetail = "Error desconocido al obtener pedidos.";
                try { 
                    const errorData = JSON.parse(responseText);
                    errorDetail = errorData.detail || errorData.message || errorDetail; 
                } catch (e) { 
                    errorDetail = responseText || `Error ${response.status}: ${response.statusText}`;
                }
                throw new Error(errorDetail);
            }

            const pedidos = JSON.parse(responseText);

            if(pedidosEnCursoContainer) pedidosEnCursoContainer.innerHTML = '';
            if(historialPedidosContainer) historialPedidosContainer.innerHTML = '';
            let hayPedidosEnCurso = false;
            let hayPedidosEnHistorial = false;

            if (!pedidos || pedidos.length === 0) {
                if (noPedidosEnCursoMsg) noPedidosEnCursoMsg.style.display = 'block';
                if (noHistorialPedidosMsg) noHistorialPedidosMsg.style.display = 'block';
                return;
            }

            const estadosEnCursoIDs = [1, 2, 3, 4];

            pedidos.forEach(pedido => {
                const esPedidoEnCurso = estadosEnCursoIDs.includes(pedido.id_estado_pedido);
                const fechaPedidoFormateada = pedido.fecha_pedido ? new Date(pedido.fecha_pedido).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
                const totalPedidoFormateado = (parseFloat(pedido.total_pedido) || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });
                const estadoDescripcion = pedido.estado_descripcion || 'Desconocido';

                const detallesHTML = pedido.detalles && pedido.detalles.length > 0 ?
                    pedido.detalles.map(detalle => {
                        let imagenSrc = '/static/core/images/placeholder.png';
                        if (detalle.imagen_url) {
                            imagenSrc = detalle.imagen_url.startsWith('http') ? detalle.imagen_url : ((typeof MEDIA_URL !== 'undefined' ? MEDIA_URL : '/media/') + detalle.imagen_url.replace(/^\/?media\//, ''));
                        }
                        return `
                        <li class="list-group-item d-flex justify-content-between align-items-center py-2 px-0 border-bottom">
                            <div class="d-flex align-items-center">
                                <img src="${escapeHtml(imagenSrc)}" alt="${escapeHtml(detalle.nombre_producto || 'Producto')}" class="order-summary-img me-2 rounded" style="width: 50px; height: 50px; object-fit: cover;" onerror="this.onerror=null;this.src='/static/core/images/placeholder.png';">
                                <div>
                                    <small class="fw-semibold d-block text-truncate" style="max-width: 200px;" title="${escapeHtml(detalle.nombre_producto || '')}">${escapeHtml(detalle.nombre_producto || 'N/A')}</small>
                                    <small class="text-muted">Cant: ${detalle.cantidad} x $${(parseFloat(detalle.precio_unitario_venta) || 0).toLocaleString('es-CL')}</small>
                                </div>
                            </div>
                            <small class="text-muted fw-semibold">$${(parseFloat(detalle.subtotal) || 0).toLocaleString('es-CL')}</small>
                        </li>`;
                    }).join('') : '<li class="list-group-item px-0 text-muted small">No hay detalles disponibles para este pedido.</li>';

                const pedidoCardHTML = `
                    <div class="card order-card shadow-sm mb-3">
                        <div class="card-header bg-light d-flex justify-content-between align-items-center flex-wrap">
                            <div>
                                <strong class="me-2">Pedido #${pedido.id_pedido}</strong>
                                <small class="text-muted d-block d-sm-inline">Fecha: ${fechaPedidoFormateada}</small>
                            </div>
                            <span class="badge bg-${esPedidoEnCurso ? 'info text-dark' : 'success'} mt-1 mt-sm-0">${escapeHtml(estadoDescripcion)}</span>
                        </div>
                        <div class="card-body">
                            <h6 class="card-subtitle mb-2 text-muted small">Detalles del pedido:</h6>
                            <ul class="list-group list-group-flush mb-2">${detallesHTML}</ul>
                            <div class="text-end fw-bold mt-2 fs-5">Total: ${totalPedidoFormateado}</div>
                        </div>
                    </div>`;

                if (esPedidoEnCurso) {
                    if (pedidosEnCursoContainer) pedidosEnCursoContainer.insertAdjacentHTML('beforeend', pedidoCardHTML);
                    hayPedidosEnCurso = true;
                } else {
                    if (historialPedidosContainer) historialPedidosContainer.insertAdjacentHTML('beforeend', pedidoCardHTML);
                    hayPedidosEnHistorial = true;
                }
            });

            if (hayPedidosEnCurso) { if (noPedidosEnCursoMsg) noPedidosEnCursoMsg.style.display = 'none'; }
            else { if (noPedidosEnCursoMsg) noPedidosEnCursoMsg.style.display = 'block'; }

            if (hayPedidosEnHistorial) { if (noHistorialPedidosMsg) noHistorialPedidosMsg.style.display = 'none'; }
            else { if (noHistorialPedidosMsg) noHistorialPedidosMsg.style.display = 'block'; }

        } catch (error) {
            console.error("Error al procesar pedidos:", error);
            const errorMsg = `<div class="alert alert-warning">Error al cargar pedidos: ${escapeHtml(error.message || 'Desconocido.')} Por favor, recarga la página o intenta más tarde.</div>`;
            if (pedidosEnCursoContainer) pedidosEnCursoContainer.innerHTML = errorMsg;
            if (historialPedidosContainer) historialPedidosContainer.innerHTML = errorMsg;
            if (noPedidosEnCursoMsg) noPedidosEnCursoMsg.style.display = 'none';
            if (noHistorialPedidosMsg) noHistorialPedidosMsg.style.display = 'none';
        }
    }

    if (logoutLink) {
        logoutLink.addEventListener('click', function (event) {
            event.preventDefault();
            logoutUser();
        });
    }

    const registerForm = document.getElementById("registerForm");
    if (registerForm) {
        registerForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const apiMessageDiv = document.getElementById("api-message");
            if(!apiMessageDiv) return;
            apiMessageDiv.innerHTML = "";
            const p_nombre = document.getElementById("p_nombre") ? document.getElementById("p_nombre").value : "";
            const s_nombre = document.getElementById("s_nombre") ? document.getElementById("s_nombre").value : "";
            const p_apellido = document.getElementById("p_apellido") ? document.getElementById("p_apellido").value : "";
            const s_apellido = document.getElementById("s_apellido") ? document.getElementById("s_apellido").value : "";
            const correo = document.getElementById("correo") ? document.getElementById("correo").value : "";
            const telefono = document.getElementById("telefono") ? document.getElementById("telefono").value : "";
            const clave = document.getElementById("clave") ? document.getElementById("clave").value : "";
            const clave2 = document.getElementById("clave2") ? document.getElementById("clave2").value : "";

            if (clave !== clave2) {
                apiMessageDiv.innerHTML = '<div class="alert alert-danger" role="alert">Las contraseñas no coinciden.</div>';
                return;
            }
            try {
                const response = await fetch(`${API_AUTH_BASE_URL}/register/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        p_nombre, 
                        s_nombre: s_nombre || null, 
                        p_apellido, 
                        s_apellido: s_apellido || null, 
                        correo, 
                        telefono: telefono || null, 
                        clave 
                    }),
                });
                const data = await response.json();
                if (response.ok) {
                    apiMessageDiv.innerHTML = `<div class="alert alert-success" role="alert">¡Registro exitoso! ${data.message || ''} Redirigiendo al login...</div>`;
                    setTimeout(() => { window.location.href = "/login/"; }, 2500);
                } else {
                    const errorMessage = data.detail || (data.correo ? `Correo: ${data.correo.join(', ')}` : "Error desconocido al registrar.");
                    apiMessageDiv.innerHTML = `<div class="alert alert-danger" role="alert">${escapeHtml(errorMessage)}</div>`;
                }
            } catch (error) {
                console.error("Error API registro:", error);
                apiMessageDiv.innerHTML = '<div class="alert alert-danger" role="alert">No se pudo conectar al servidor de registro. Intenta más tarde.</div>';
            }
        });
    }

    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const apiMessageDiv = document.getElementById("api-message");
            if(!apiMessageDiv) return;
            apiMessageDiv.innerHTML = "";
            const username = document.getElementById("username") ? document.getElementById("username").value : "";
            const password = document.getElementById("password") ? document.getElementById("password").value : "";
            const formData = new URLSearchParams();
            formData.append("username", username);
            formData.append("password", password);
            try {
                const response = await fetch(`${API_AUTH_BASE_URL}/token`, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: formData.toString(),
                });
                const data = await response.json();
                if (response.ok) {
                    localStorage.setItem("access_token", data.access_token);
                    localStorage.setItem("token_type", data.token_type);
                    apiMessageDiv.innerHTML = '<div class="alert alert-success" role="alert">¡Éxito! Redirigiendo...</div>';
                    updateAuthUI();
                    const redirectTo = localStorage.getItem("redirect_to_after_login");
                    if (redirectTo) {
                        localStorage.removeItem("redirect_to_after_login");
                        setTimeout(() => { window.location.href = redirectTo; }, 1000);
                    } else {
                        setTimeout(() => { window.location.href = "/"; }, 1000);
                    }
                } else {
                    const errorMessage = data.detail || "Credenciales incorrectas o error desconocido.";
                    apiMessageDiv.innerHTML = `<div class="alert alert-danger" role="alert">${escapeHtml(errorMessage)}</div>`;
                }
            } catch (error) {
                console.error("Error API login:", error);
                apiMessageDiv.innerHTML = '<div class="alert alert-danger" role="alert">No se pudo conectar al servidor de autenticación. Intenta más tarde.</div>';
            }
        });
    }
    
    function getCart() { return JSON.parse(localStorage.getItem("shoppingCart")) || []; }

    function saveCart(cart) {
        localStorage.setItem("shoppingCart", JSON.stringify(cart));
        updateCartCount();
        renderCartPreview();
        if (window.location.pathname.includes("/carrito/")) renderCartPage();
        if (window.location.pathname.includes("/realizar_compra/") || (typeof IS_EMPLOYEE_PAGE !== 'undefined' && IS_EMPLOYEE_PAGE)) {
            renderCheckoutSummary();
            const activePaypalRadioId = (typeof IS_EMPLOYEE_PAGE !== 'undefined' && IS_EMPLOYEE_PAGE) ? 'paypal_empleado' : 'paypal';
            const paypalRadio = document.getElementById(activePaypalRadioId);
            const paypalDetailsActive = document.getElementById(`payment-details-${activePaypalRadioId}`)?.classList.contains('active');

            if (paypalRadio && paypalRadio.checked && paypalDetailsActive) {
                 console.log("Cart saved, re-initializing PayPal button due to potential total change.");
                 initPayPalButton();
            }
        }
    }
    function addToCart(product) {
        let cart = getCart();
        const existingItem = cart.find(item => String(item.id) === String(product.id));
        if (existingItem) {
            existingItem.quantity = (parseInt(existingItem.quantity) || 0) + 1;
        } else {
            cart.push({ ...product, quantity: 1 });
        }
        saveCart(cart);
        showToast(`"${escapeHtml(product.name)}" añadido al carrito.`, 'success');
    }

    function removeFromCart(productId) {
        let cart = getCart();
        const productName = cart.find(item => String(item.id) === String(productId))?.name || "Producto";
        cart = cart.filter(item => String(item.id) !== String(productId));
        saveCart(cart);
        showToast(`"${escapeHtml(productName)}" eliminado del carrito.`, 'info');
    }

    function updateCartItemQuantity(productId, newQuantity) {
        let cart = getCart();
        const item = cart.find(item => String(item.id) === String(productId));
        if (item) {
            const quantity = parseInt(newQuantity);
            if (quantity > 0) {
                item.quantity = quantity;
                 showToast(`Cantidad de "${escapeHtml(item.name)}" actualizada a ${quantity}.`, 'info');
            } else { 
                cart = cart.filter(i => String(i.id) !== String(productId));
                 showToast(`"${escapeHtml(item.name)}" eliminado del carrito (cantidad cero).`, 'info');
            }
        }
        saveCart(cart);
    }

    function renderCartPage() {
        const cartItemsContainer = document.getElementById("cart-items");
        const cartSubtotalSpan = document.getElementById("cart-subtotal");
        const cartTotalSpan = document.getElementById("cart-total");
        const cartSummaryFooter = document.getElementById("cart-summary-footer");
        const cartEmptyMessagePage = document.getElementById("cart-empty-message-page");
        const cartActionsButtons = document.getElementById("cart-actions-buttons");
        const checkoutBtnCartPage = document.getElementById('checkout-btn');

        if (!cartItemsContainer || !cartSubtotalSpan || !cartTotalSpan) {
            console.warn("Elementos DOM de la página de carrito no encontrados.");
            return;
        }

        const cart = getCart();
        let subtotal = 0;
        if(cartItemsContainer) cartItemsContainer.innerHTML = "";

        if (cart.length === 0) {
            if (cartEmptyMessagePage) cartEmptyMessagePage.style.display = "block";
            else if (cartItemsContainer) cartItemsContainer.innerHTML = '<tr><td colspan="6" class="text-center py-4">Tu carrito de compras está vacío.</td></tr>';
            
            if (cartSummaryFooter) cartSummaryFooter.style.display = "none";
            if (cartActionsButtons) cartActionsButtons.style.display = "none";
            if(cartSubtotalSpan) cartSubtotalSpan.textContent = "$0";
            if(cartTotalSpan) cartTotalSpan.textContent = "$0";
            if (checkoutBtnCartPage) checkoutBtnCartPage.classList.add("disabled");
            return;
        }

        if (cartEmptyMessagePage) cartEmptyMessagePage.style.display = "none";
        if (cartSummaryFooter) cartSummaryFooter.style.display = "table-footer-group";
        if (cartActionsButtons) cartActionsButtons.style.display = "block";
        if (checkoutBtnCartPage) checkoutBtnCartPage.classList.remove("disabled");

        cart.forEach((item) => {
            const itemPrice = parseFloat(item.price) || 0;
            const itemQuantity = parseInt(item.quantity) || 0;
            const itemTotal = itemPrice * itemQuantity;
            subtotal += itemTotal;
            const row = document.createElement("tr");
            row.classList.add('cart-item-row');
            row.innerHTML = `
                <td class="align-middle">
                    <img src="${escapeHtml(item.image || '/static/core/images/placeholder.png')}" alt="${escapeHtml(item.name)}" 
                         class="img-fluid rounded" style="width: 60px; height: 60px; object-fit: cover;"
                         onerror="this.onerror=null;this.src='/static/core/images/placeholder.png';">
                </td>
                <td class="align-middle item-name-col" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</td>
                <td class="text-end align-middle item-price-col">$${itemPrice.toLocaleString('es-CL')}</td>
                <td class="text-center align-middle item-quantity-col">
                    <input type="number" class="form-control form-control-sm mx-auto cart-quantity-input text-center" 
                           value="${itemQuantity}" min="1" max="99" data-product-id="${item.id}" 
                           style="width: 70px;" aria-label="Cantidad para ${escapeHtml(item.name)}">
                </td>
                <td class="text-end align-middle item-total-col fw-semibold">$${itemTotal.toLocaleString('es-CL')}</td>
                <td class="text-center align-middle item-actions-col">
                    <button class="btn btn-outline-danger btn-sm remove-from-cart-btn" data-product-id="${item.id}" title="Eliminar ${escapeHtml(item.name)}">
                        <i class="fas fa-trash"></i> <span class="d-none d-md-inline">Eliminar</span>
                    </button>
                </td>
            `;
            if (cartItemsContainer) cartItemsContainer.appendChild(row);
        });

        if(cartSubtotalSpan) cartSubtotalSpan.textContent = `$${subtotal.toLocaleString('es-CL')}`;
        if(cartTotalSpan) cartTotalSpan.textContent = `$${subtotal.toLocaleString('es-CL')}`;

        document.querySelectorAll(".remove-from-cart-btn").forEach((button) => {
            button.addEventListener("click", function () { removeFromCart(this.dataset.productId); });
        });
        document.querySelectorAll(".cart-quantity-input").forEach((input) => {
            input.addEventListener("change", function () { 
                const newQuantity = parseInt(this.value);
                if (isNaN(newQuantity) || newQuantity < 1) {
                    const item = getCart().find(p => String(p.id) === String(this.dataset.productId));
                    this.value = item ? item.quantity : 1;
                    showToast("Cantidad inválida.", "warning");
                    return;
                }
                updateCartItemQuantity(this.dataset.productId, newQuantity); 
            });
             input.addEventListener("input", function() {
                if (parseInt(this.value) > 99) this.value = 99;
            });
        });
    }

    function updateCartCount() {
        if (cartCountBadge) {
            const cart = getCart();
            const totalItems = cart.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
            cartCountBadge.textContent = totalItems;
            cartCountBadge.style.display = totalItems > 0 ? "inline-block" : "none";
        }
    }
    function renderCartPreview() {
        const currentCartPreviewItemsListEl = document.getElementById('cart-preview-items-scrollable');
        const currentCartPreviewEmptyMessageEl = document.getElementById('cart-preview-empty');
        const currentCartPreviewSubtotalSpanEl = document.getElementById('cart-preview-subtotal');
        const currentCartPreviewSummaryEl = document.getElementById('cart-preview-summary');

        if (!currentCartPreviewItemsListEl || !currentCartPreviewEmptyMessageEl || !currentCartPreviewSubtotalSpanEl || !currentCartPreviewSummaryEl) {
            return;
        }

        const cart = getCart();
        let subtotal = 0;
        currentCartPreviewItemsListEl.innerHTML = "";

        if (cart.length === 0) {
            currentCartPreviewEmptyMessageEl.style.display = "block";
            currentCartPreviewSummaryEl.style.display = "none";
            currentCartPreviewSubtotalSpanEl.textContent = "$0";
            return;
        }

        currentCartPreviewEmptyMessageEl.style.display = "none";
        currentCartPreviewSummaryEl.style.display = "block";

        cart.forEach((item) => {
            const itemPrice = parseFloat(item.price) || 0;
            const itemQuantity = parseInt(item.quantity) || 0;
            const itemSubtotal = itemPrice * itemQuantity;
            subtotal += itemSubtotal;
            const li = document.createElement("li");
            li.classList.add("cart-preview-item", "mb-2", "list-group-item", "p-0", "border-0"); 
            li.dataset.itemId = item.id;

            li.innerHTML = `
                <div class="d-flex align-items-center">
                    <img src="${escapeHtml(item.image || '/static/core/images/placeholder.png')}" alt="${escapeHtml(item.name)}" 
                         class="me-2 rounded flex-shrink-0" style="width: 45px; height: 45px; object-fit: cover;"
                         onerror="this.onerror=null;this.src='/static/core/images/placeholder.png';">
                    <div class="flex-grow-1 overflow-hidden">
                        <h6 class="mb-0 small item-name text-truncate" style="max-width: 130px;" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h6>
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="text-muted item-quantity-price">
                                <span class="item-quantity">${itemQuantity}</span> x $${itemPrice.toLocaleString('es-CL')}
                            </small>
                            <small class="text-muted fw-bold item-subtotal ms-1" style="font-size: 0.8em;">$${itemSubtotal.toLocaleString('es-CL')}</small>
                        </div>
                    </div>
                    <div class="ms-auto text-nowrap ps-1 d-flex align-items-center">
                        <button class="btn btn-sm btn-outline-secondary cart-preview-decrease p-1" data-product-id="${item.id}" title="Disminuir cantidad de ${escapeHtml(item.name)}" type="button" style="line-height: 1; height: 24px; width: 24px;"><i class="fas fa-minus"></i></button>
                        <span class="mx-1 item-quantity-display" style="font-size: 0.85em; min-width:18px; text-align:center;">${itemQuantity}</span>
                        <button class="btn btn-sm btn-outline-secondary cart-preview-increase p-1" data-product-id="${item.id}" title="Aumentar cantidad de ${escapeHtml(item.name)}" type="button" style="line-height: 1; height: 24px; width: 24px;"><i class="fas fa-plus"></i></button>
                        <button class="btn btn-sm btn-outline-danger cart-preview-remove ms-2 p-1" data-product-id="${item.id}" title="Eliminar ${escapeHtml(item.name)} del carrito" type="button" style="line-height: 1; height: 24px; width: 24px;"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>`;
            currentCartPreviewItemsListEl.appendChild(li);
        });

        currentCartPreviewSubtotalSpanEl.textContent = `$${subtotal.toLocaleString('es-CL')}`;

        document.querySelectorAll(".cart-preview-remove").forEach((button) => {
            button.addEventListener("click", function (e) { e.stopPropagation(); removeFromCart(this.dataset.productId); });
        });
        document.querySelectorAll(".cart-preview-increase").forEach((button) => {
            button.addEventListener("click", function (e) {
                e.stopPropagation();
                const productId = this.dataset.productId;
                const item = getCart().find(p => String(p.id) === String(productId));
                if (item) updateCartItemQuantity(productId, (parseInt(item.quantity) || 0) + 1);
            });
        });
        document.querySelectorAll(".cart-preview-decrease").forEach((button) => {
            button.addEventListener("click", function (e) {
                e.stopPropagation();
                const productId = this.dataset.productId;
                const item = getCart().find(p => String(p.id) === String(productId));
                if (item) updateCartItemQuantity(productId, (parseInt(item.quantity) || 0) - 1);
            });
        });
    }

    document.querySelectorAll(".add-to-cart-btn").forEach((button) => {
        button.addEventListener("click", function () {
            const product = {
                id: this.dataset.productId,
                name: this.dataset.productName,
                price: parseFloat(this.dataset.productPrice),
                image: this.dataset.productImage || null,
            };
            if (!product.id || !product.name || isNaN(product.price)) {
                console.error("Datos del producto incompletos o inválidos:", this.dataset);
                showToast("Error: Datos del producto incompletos para añadir al carrito.", 'danger');
                return;
            }
            addToCart(product);
        });
    });

    function showToast(message, type = 'success') { 
        const toastContainer = document.querySelector('.toast-container.position-fixed.bottom-0.end-0.p-3');
        if (toastContainer) {
            const toastId = 'toast-' + Date.now();
            let toastBgClass = `bg-${type}`;
            let textWhiteClass = (type === 'light' || type === 'warning' || type === 'info') ? '' : 'text-white';
            if (type === 'danger' || type === 'success' || type === 'primary' || type === 'dark') {
                 textWhiteClass = 'text-white';
            }

            const toastElement = document.createElement('div');
            toastElement.classList.add('toast', toastBgClass, textWhiteClass, 'border-0', 'shadow-lg');
            toastElement.id = toastId;
            toastElement.setAttribute('role', 'alert');
            toastElement.setAttribute('aria-live', 'assertive');
            toastElement.setAttribute('aria-atomic', 'true');
            toastElement.innerHTML = `
                <div class="d-flex">
                    <div class="toast-body flex-grow-1">${message}</div>
                    <button type="button" class="btn-close ${textWhiteClass ? 'btn-close-white' : ''} me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>`;
            
            while (toastContainer.children.length >= 5) {
                toastContainer.removeChild(toastContainer.firstChild);
            }

            toastContainer.appendChild(toastElement);

            if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
                const toast = new bootstrap.Toast(toastElement, { delay: 4000, autohide: true });
                toast.show();
                toastElement.addEventListener('hidden.bs.toast', function () {
                    if (toastElement.parentElement) {
                         toastElement.remove();
                    }
                });
            } else {
                console.log(`Toast (${type}): ${message}`);
                setTimeout(() => {
                    if (toastElement.parentElement) toastElement.remove();
                }, 4000);
            }
        } else {
            console.log(`Toast fallback (${type}): ${message} (Toast container not found)`);
            alert(`${type.toUpperCase()}: ${message}`);
        }
    }

    function handleCheckout() {
        const cart = getCart();
        if (cart.length === 0) {
            showToast("Tu carrito está vacío. Añade productos antes de proceder al pago.", 'warning');
            return;
        }
        const token = localStorage.getItem('access_token');
        if (!token) {
            showToast("Debes iniciar sesión para proceder al pago.", 'info');
            localStorage.setItem('redirect_to_after_login', '/realizar_compra/');
            window.location.href = '/login/'; 
            return;
        }
        window.location.href = '/realizar_compra/'; 
    }

    const goToCheckoutBtnPreview = document.getElementById('go-to-checkout-btn-preview');
    if (goToCheckoutBtnPreview) {
        goToCheckoutBtnPreview.addEventListener('click', function (e) { e.preventDefault(); handleCheckout(); });
    }

    const checkoutBtnCartPage = document.getElementById('checkout-btn'); 
    if (checkoutBtnCartPage) {
        checkoutBtnCartPage.addEventListener('click', function (e) { e.preventDefault(); handleCheckout(); });
    }

    function renderCheckoutSummary() {
        const summaryList = document.getElementById('checkout-cart-summary');
        const emptyMessage = document.getElementById('checkout-cart-empty');
        const totalsSummary = document.getElementById('checkout-totals-summary');
        const itemCountBadge = document.getElementById('checkout-item-count');
        const subtotalSpan = document.getElementById('checkout-subtotal');
        const shippingSpan = document.getElementById('checkout-shipping');
        const totalSpan = document.getElementById('checkout-total');

        if (!summaryList || !itemCountBadge || !subtotalSpan || !totalSpan || !emptyMessage || !totalsSummary) {
            console.warn("Algunos elementos del resumen de checkout no fueron encontrados en el DOM.");
            return;
        }

        const cart = getCart();
        if(summaryList) summaryList.innerHTML = ''; 
        let currentSubtotal = 0;

        if (cart.length === 0) {
            if(emptyMessage) emptyMessage.style.display = 'block';
            if(totalsSummary) totalsSummary.style.display = 'none';
            if(itemCountBadge) itemCountBadge.textContent = '0';
            if (currentSubmitButton) currentSubmitButton.classList.add('disabled');
            
            if (window.location.pathname.includes("/realizar_compra/") || (typeof IS_EMPLOYEE_PAGE !== 'undefined' && IS_EMPLOYEE_PAGE)) {
                showToast("Tu carrito está vacío. Serás redirigido a la página de productos.", 'warning');
                setTimeout(() => { 
                    if (typeof PRODUCTOS_URL !== 'undefined') {
                        window.location.href = PRODUCTOS_URL; 
                    } else {
                        window.location.href = "/productos/";
                    }
                }, 3000);
            }
            return;
        }

        if(emptyMessage) emptyMessage.style.display = 'none';
        if(totalsSummary) totalsSummary.style.display = 'block';
        if (currentSubmitButton) currentSubmitButton.classList.remove('disabled');

        cart.forEach(item => {
            const itemPrice = parseFloat(item.price) || 0;
            const itemQuantity = parseInt(item.quantity) || 0;
            const itemTotal = itemPrice * itemQuantity;
            currentSubtotal += itemTotal;

            const listItem = document.createElement('li');
            listItem.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'lh-sm', 'py-2', 'px-0');
            listItem.innerHTML = `
                <div>
                    <h6 class="my-0 text-truncate" style="max-width: 180px; font-size: 0.9rem;" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h6>
                    <small class="text-muted">Cantidad: ${itemQuantity}</small>
                </div>
                <span class="text-muted fw-semibold" style="font-size: 0.9rem;">$${itemTotal.toLocaleString('es-CL')}</span>
            `;
            if(summaryList) summaryList.appendChild(listItem);
        });

        if(itemCountBadge) itemCountBadge.textContent = cart.length.toString();
        if(subtotalSpan) subtotalSpan.textContent = `$${currentSubtotal.toLocaleString('es-CL')}`;
        
        const shippingCost = (currentSubtotal > 0 && currentSubtotal < 50000) ? 4990 : 0;
        if (shippingSpan) {
            shippingSpan.textContent = shippingCost === 0 ? 'Gratis' : `$${shippingCost.toLocaleString('es-CL')}`;
            if (shippingCost === 0 && currentSubtotal > 0) {
                 const shippingParent = shippingSpan.closest('li');
                 if(shippingParent && shippingParent.querySelector('.text-success')) {
                 } else if (shippingParent) {
                    const freeShippingText = document.createElement('small');
                    freeShippingText.className = 'text-success d-block';
                    freeShippingText.textContent = currentSubtotal >= 50000 ? 'Envío gratuito aplicado' : '';
                    if(currentSubtotal >= 50000) shippingParent.appendChild(freeShippingText);
                 }
            } else {
                 const shippingParent = shippingSpan.closest('li');
                 const freeText = shippingParent ? shippingParent.querySelector('.text-success.d-block') : null;
                 if(freeText) freeText.remove();
            }
        }
        
        const finalTotal = currentSubtotal + shippingCost;
        if(totalSpan) totalSpan.textContent = `$${finalTotal.toLocaleString('es-CL')}`;
    }

    const passwordToggleButtons = document.querySelectorAll('.password-toggle-btn');
    passwordToggleButtons.forEach(button => {
        button.addEventListener('click', function () {
            const parentContainer = this.closest('.input-group') || this.closest('.position-relative');
            if (!parentContainer) {
                 console.warn("Не найден родительский контейнер для кнопки переключения пароля.");
                 return;
            }

            const currentPasswordInput = parentContainer.querySelector('input.form-control-password-toggle, input[type="password"], input[type="text"]');
            if (!currentPasswordInput) {
                 console.warn("Не найдено поле ввода пароля рядом с кнопкой.");
                 return;
            }

            const passwordIcon = this.querySelector('i');

            if (passwordIcon) {
                const type = currentPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                currentPasswordInput.setAttribute('type', type);

                if (type === 'password') {
                    passwordIcon.classList.remove('fa-eye-slash');
                    passwordIcon.classList.add('fa-eye');
                    this.setAttribute('aria-label', 'Mostrar contraseña');
                } else {
                    passwordIcon.classList.remove('fa-eye');
                    passwordIcon.classList.add('fa-eye-slash');
                     this.setAttribute('aria-label', 'Ocultar contraseña');
                }
            }
        });
    });

    if (paymentMethodRadios.length > 0) {
        paymentMethodRadios.forEach(radio => {
            radio.addEventListener('change', function () {
                paymentDetailsSections.forEach(detail => {
                    detail.classList.remove('active'); 
                    detail.classList.add('d-none');
                });
                
                const selectedMethod = this.value;
                const detailElement = document.getElementById(`payment-details-${selectedMethod}`);
                
                if (detailElement) {
                    detailElement.classList.add('active');
                    detailElement.classList.remove('d-none');
                }

                if (currentSubmitButton) {
                    const isPaypalSelected = (selectedMethod === 'paypal' && (!IS_EMPLOYEE_PAGE || typeof IS_EMPLOYEE_PAGE === 'undefined')) || 
                                             (selectedMethod === 'paypal_empleado' && IS_EMPLOYEE_PAGE);

                    if (isPaypalSelected) {
                        currentSubmitButton.style.display = 'none';
                        if (currentPaypalContainer) {
                            currentPaypalContainer.innerHTML = '';
                            initPayPalButton();
                        }
                    } else {
                        currentSubmitButton.style.display = 'block';
                        currentSubmitButton.disabled = false;
                        if (currentPaypalContainer) {
                            currentPaypalContainer.innerHTML = '';
                        }
                    }
                } else {
                     console.warn("currentSubmitButton не определен. Невозможно управлять его видимостью.");
                }
            });
        });
        
        const initiallySelectedMethodRadio = document.querySelector('input[name="paymentMethod"]:checked');
        if (initiallySelectedMethodRadio) {
            initiallySelectedMethodRadio.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (paymentMethodRadios.length > 0) {
            console.log("Ни один метод оплаты не выбран по умолчанию.");
            if (currentSubmitButton && (!document.getElementById('paypal') || !document.getElementById('paypal').checked) && (!document.getElementById('paypal_empleado') || !document.getElementById('paypal_empleado').checked)) {
                 currentSubmitButton.style.display = 'block';
            } else if (currentSubmitButton) {
                 currentSubmitButton.style.display = 'none';
            }
        }
    }


    if (window.location.pathname.includes('/compra_exitosa/')) {
        localStorage.removeItem('shoppingCart'); 
        updateCartCount();
        renderCartPreview();
    }

    if (localStorage.getItem('redirect_to_after_login') && localStorage.getItem('access_token')) {
        if (window.location.pathname.toLowerCase().includes('/login/')) {
            const redirectTo = localStorage.getItem('redirect_to_after_login');
            localStorage.removeItem('redirect_to_after_login');
            showToast(`Login exitoso. Redirigiendo a ${redirectTo}...`, 'success');
            window.location.href = redirectTo;
        }
    } else if (localStorage.getItem('redirect_to_after_login') && !localStorage.getItem('access_token')) {
        if (!window.location.pathname.toLowerCase().includes('/login/')) {
            localStorage.removeItem('redirect_to_after_login');
        }
    }

    if (window.location.pathname.includes('/perfil/')) {
        const token = localStorage.getItem('access_token');
        if (!token) {
            showToast("Debes iniciar sesión para ver tu perfil.", "info");
            localStorage.setItem('redirect_to_after_login', '/perfil/');
            window.location.href = '/login/'; 
        }
    }

    updateAuthUI(); 
    updateCartCount();   
    renderCartPreview(); 

    if (window.location.pathname.includes("/carrito/")) {
        renderCartPage(); 
        const clearCartBtn = document.getElementById("clear-cart-btn");
        if (clearCartBtn) {
            clearCartBtn.addEventListener("click", function () {
                const confirmModalElement = document.getElementById('confirmClearCartModal');
                if (confirmModalElement && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                    const confirmModal = new bootstrap.Modal(confirmModalElement);
                    const confirmClearCartButton = document.getElementById('confirmClearCartButton');
                    
                    if (confirmClearCartButton) {
                        const newConfirmButton = confirmClearCartButton.cloneNode(true);
                        confirmClearCartButton.parentNode.replaceChild(newConfirmButton, confirmClearCartButton);
                        
                        newConfirmButton.addEventListener('click', function() {
                            localStorage.removeItem("shoppingCart");
                            renderCartPage(); 
                            updateCartCount();
                            renderCartPreview();
                            showToast("Carrito vaciado exitosamente.", 'info');
                            confirmModal.hide();
                        });
                    }
                    confirmModal.show();
                } else {
                     if (confirm("¿Estás seguro de que quieres vaciar tu carrito de compras? Esta acción no se puede deshacer.")) { 
                        localStorage.removeItem("shoppingCart");
                        renderCartPage();
                        updateCartCount();
                        renderCartPreview();
                        showToast("Carrito vaciado.", 'info');
                    }
                }
            });
        }
    }

    if (window.location.pathname.includes("/realizar_compra/") || (typeof IS_EMPLOYEE_PAGE !== 'undefined' && IS_EMPLOYEE_PAGE)) {
        renderCheckoutSummary(); 
        if(checkoutForm) {
            checkoutForm.addEventListener('submit', async function (event) {
                event.preventDefault();
                event.stopPropagation();

                const selectedPaymentMethodRadio = document.querySelector('input[name="paymentMethod"]:checked');
                
                if (selectedPaymentMethodRadio && 
                   ((selectedPaymentMethodRadio.value === 'paypal' && (!IS_EMPLOYEE_PAGE || typeof IS_EMPLOYEE_PAGE === 'undefined')) || 
                    (selectedPaymentMethodRadio.value === 'paypal_empleado' && IS_EMPLOYEE_PAGE))) {
                    showCheckoutAlert("Para pagar con PayPal, por favor usa los botones de PayPal provistos en la sección de PayPal.", "info");
                    return; 
                }
                
                if (!checkoutForm.checkValidity()) {
                    showCheckoutAlert("Por favor, completa todos los campos requeridos correctamente.", "warning");
                    checkoutForm.classList.add('was-validated');
                    return;
                }
                
                if(currentSubmitButton) {
                    currentSubmitButton.disabled = true;
                    currentSubmitButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Procesando pedido...';
                }
                
                console.log("Formulario enviado para método de pago no PayPal:", selectedPaymentMethodRadio ? selectedPaymentMethodRadio.value : "N/A");
                try {
                    if (typeof PROCESAR_PAGO_URL === 'undefined' || typeof CSRF_TOKEN === 'undefined') {
                        throw new Error("PROCESAR_PAGO_URL or CSRF_TOKEN is not defined for non-PayPal submission.");
                    }
                    const formData = new FormData(checkoutForm);
                    if (!formData.has('payment_method_name') && selectedPaymentMethodRadio) {
                        formData.append('payment_method_name', selectedPaymentMethodRadio.value);
                    }

                    console.log("Enviando datos a PROCESAR_PAGO_URL:", Object.fromEntries(formData));

                    const response = await fetch(PROCESAR_PAGO_URL, {
                        method: 'POST',
                        headers: {
                            'X-CSRFToken': CSRF_TOKEN,
                        },
                        body: formData
                    });

                    const responseData = await response.json();

                    if (responseData.success || response.ok) {
                        showCheckoutAlert('¡Pedido realizado con éxito! Redirigiendo...', 'success', true);
                        localStorage.removeItem('shoppingCart');
                        updateCartCount();
                        renderCartPreview();
                        if (responseData.redirect_url) {
                            window.location.href = responseData.redirect_url;
                        } else {
                             console.error("URL для редиректа не предоставлен сервером после успешной обработки заказа (не PayPal).");
                             showCheckoutAlert('Pedido procesado, pero hubo un problema con la redirección. Contacta a soporte.', 'warning', true);
                        }
                    } else {
                        const errorDetail = responseData.error || responseData.message || responseData.detail || `Error del servidor: ${response.status}`;
                        console.error('Error del servidor al procesar pedido (no PayPal):', errorDetail);
                        showCheckoutAlert(`Error al procesar tu pedido: ${escapeHtml(errorDetail)}. Por favor, intenta de nuevo.`, 'danger', true);
                        if (currentSubmitButton) {
                            currentSubmitButton.disabled = false;
                            currentSubmitButton.innerHTML = 'Realizar Pedido';
                        }
                    }
                } catch (error) {
                    console.error('Error en fetch para PROCESAR_PAGO_URL:', error);
                    showCheckoutAlert(`Ocurrió un error de comunicación al procesar tu pedido: ${escapeHtml(error.message)}. Por favor, intenta de nuevo.`, 'danger', true);
                    if (currentSubmitButton) {
                        currentSubmitButton.disabled = false;
                        currentSubmitButton.innerHTML = 'Realizar Pedido';
                    }
                }
            }, false);
        }
    }
});