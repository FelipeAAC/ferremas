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
    const submitOrderButton = document.getElementById('submit-order-button');
    const checkoutAlertContainer = document.getElementById('checkout-alert-container');
    const paypalButtonDOMContainer = document.getElementById('paypal-button-container');
    const orderTotalElement = document.getElementById('checkout-total');
    const currencySymbolElement = document.getElementById('checkout-currency-symbol');

    let PAYPAL_CURRENCY_CODE = 'USD';

    function showCheckoutAlert(message, type = 'danger') {
        if (checkoutAlertContainer) {
            checkoutAlertContainer.innerHTML = `
                <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                    ${message}
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>`;
        }
    }

    function getOrderAmountDetails() {
        let amountValue = '0.01'; 
        let currencyCode = 'USD';

        if (currencySymbolElement && currencySymbolElement.textContent) {
            const pageCurrency = currencySymbolElement.textContent.trim().toUpperCase();
            if (['USD', 'CLP', 'EUR'].includes(pageCurrency)) {
                determinedCurrencyCode = pageCurrency;
            }
        }

        PAYPAL_CURRENCY_CODE = determinedCurrencyCode;

        if (orderTotalElement && orderTotalElement.textContent) {
            let rawTotalText = orderTotalElement.textContent;
            let cleanedTotal;
            if (PAYPAL_CURRENCY_CODE === 'CLP') {
                cleanedTotal = rawTotalText.replace(/[$.CLP\s]/g, '');
                let parsedVal = parseInt(cleanedTotal, 10);
                if (!isNaN(parsedVal) && parsedVal > 0) {
                    amountValue = String(parsedVal);
                }
            } else {
                cleanedTotal = rawTotalText.replace(/[^\d,.]/g, '');
                if (cleanedTotal.includes(',')) {
                    if (cleanedTotal.lastIndexOf(',') > cleanedTotal.lastIndexOf('.')) {
                        cleanedTotal = cleanedTotal.replace(/\./g, '').replace(',', '.');
                    } else {
                        cleanedTotal = cleanedTotal.replace(/,/g, '');
                    }
                }
                let parsedVal = parseFloat(cleanedTotal);
                if (!isNaN(parsedVal) && parsedVal > 0) {
                    amountValue = parsedVal.toFixed(2);
                }
            }
        }

        if (parseFloat(amountValue) <= 0) {
            console.warn(`Parsed order total is zero or invalid for ${PAYPAL_CURRENCY_CODE}. Using fallback for PayPal.`);
            showCheckoutAlert(`El total del pedido es inválido (${amountValue} ${PAYPAL_CURRENCY_CODE}). Contacte a soporte.`, 'warning');
            amountValue = (PAYPAL_CURRENCY_CODE === 'CLP') ? '1' : '0.01';
        }

        console.log("PayPal Amount Details:", { value: amountValue, currency: PAYPAL_CURRENCY_CODE });
        return { value: amountValue, currency: PAYPAL_CURRENCY_CODE };
    }

    function initPayPalButton() {
        if (!paypalButtonDOMContainer || typeof paypal === 'undefined') {
            console.error('PayPal SDK not loaded or button container not found.');
            showCheckoutAlert('Error al cargar la opción de pago PayPal. Intente recargar la página.', 'danger');
            return;
        }

        paypalButtonDOMContainer.innerHTML = '';
        if (checkoutAlertContainer && checkoutAlertContainer.querySelector('.alert-info.paypal-loading')) {
            checkoutAlertContainer.innerHTML = '';
        }
        const loadingAlert = document.createElement('div');
        loadingAlert.className = 'alert alert-info paypal-loading';
        loadingAlert.textContent = 'Cargando botones de PayPal...';
        if (checkoutAlertContainer) checkoutAlertContainer.appendChild(loadingAlert);


        const amountDetails = getOrderAmountDetails();
        if (parseFloat(amountDetails.value) <= 0) {
            console.error("Order amount for PayPal is zero or negative. Cannot render buttons.");
            showCheckoutAlert(`El total del pedido es inválido. No se pueden mostrar los botones de PayPal.`, 'danger');
            paypalButtonDOMContainer.innerHTML = '<p class="text-danger text-center">Error: El total del pedido es inválido.</p>';
            if (checkoutAlertContainer && loadingAlert.parentNode === checkoutAlertContainer) checkoutAlertContainer.removeChild(loadingAlert);
            return;
        }

        try {
            paypal.Buttons({
                createOrder: function (data, actions) {
                    console.log("Creating PayPal order with:", amountDetails);
                    return actions.order.create({
                        purchase_units: [{
                            amount: {
                                value: amountDetails.value,
                                currency_code: amountDetails.currency
                            },
                            description: "Compra en Ferremas"
                        }]
                    });
                },
                onApprove: function (data, actions) {
                    console.log("PayPal onApprove data:", data);
                    if (submitOrderButton) submitOrderButton.disabled = true;
                    paypalButtonDOMContainer.innerHTML = '<p class="text-center my-3"><i class="fas fa-spinner fa-spin me-2"></i>Procesando tu pago, por favor espera...</p>';

                    return actions.order.capture().then(function (details) {
                        console.log('PayPal Capture Details:', details);

                        if (checkoutForm) {
                            let paypalOrderIDInput = checkoutForm.querySelector('input[name="paypal_order_id"]');
                            if (!paypalOrderIDInput) {
                                paypalOrderIDInput = document.createElement('input');
                                paypalOrderIDInput.type = 'hidden';
                                paypalOrderIDInput.name = 'paypal_order_id';
                                checkoutForm.appendChild(paypalOrderIDInput);
                            }
                            paypalOrderIDInput.value = details.id;

                            let paymentMethodNameInput = checkoutForm.querySelector('input[name="payment_method_name"]');
                            if (!paymentMethodNameInput) {
                                paymentMethodNameInput = document.createElement('input');
                                paymentMethodNameInput.type = 'hidden';
                                paymentMethodNameInput.name = 'payment_method_name';
                                checkoutForm.appendChild(paymentMethodNameInput);
                            }
                            paymentMethodNameInput.value = 'paypal';

                            const paypalRadio = document.getElementById('paypal');
                            if (paypalRadio) paypalRadio.checked = true;

                            showCheckoutAlert('¡Pago con PayPal aprobado! Finalizando tu pedido...', 'success');

                            alert("Pago con PayPal aprobado (Cliente): " + details.id + "\nIMPORTANTE: Se requiere verificación en SERVIDOR.");
                        } else {
                            showCheckoutAlert('Error: No se encontró el formulario de checkout para enviar datos de PayPal.', 'danger');
                        }
                    }).catch(err => {
                        console.error('Error capturing PayPal order:', err);
                        showCheckoutAlert('Ocurrió un error al capturar tu pago con PayPal. Inténtalo de nuevo.', 'danger');
                        if (submitOrderButton) submitOrderButton.disabled = false;
                        paypalButtonDOMContainer.innerHTML = '';
                        initPayPalButton();
                    });
                },
                onError: function (err) {
                    console.error('Error en el flujo de PayPal SDK:', err);
                    showCheckoutAlert('Hubo un error con PayPal. Por favor, revisa los detalles o intenta con otro método de pago.', 'danger');
                    if (submitOrderButton) submitOrderButton.disabled = false;
                    paypalButtonDOMContainer.innerHTML = '';
                },
                onCancel: function (data) {
                    console.log('Pago con PayPal cancelado por el usuario:', data);
                    showCheckoutAlert('Has cancelado el proceso de pago con PayPal.', 'info');
                    if (submitOrderButton) submitOrderButton.disabled = false;
                },
                style: {
                    layout: 'vertical',
                    color: 'gold',
                    shape: 'rect',
                    label: 'paypal',
                    height: 40
                }
            }).render(paypalButtonDOMContainer).then(() => {
                if (checkoutAlertContainer && loadingAlert.parentNode === checkoutAlertContainer) {
                    checkoutAlertContainer.removeChild(loadingAlert);
                }
                console.log("PayPal Buttons rendered.");
            }).catch(err => {
                console.error('Error al renderizar botones de PayPal:', err);
                if (paypalButtonDOMContainer) {
                    paypalButtonDOMContainer.innerHTML = '<p class="text-danger text-center">Error al cargar botones de PayPal.</p>';
                }
                showCheckoutAlert('No se pudieron cargar los botones de PayPal. Por favor, recarga la página o selecciona otro método.', 'warning');
                if (checkoutAlertContainer && loadingAlert.parentNode === checkoutAlertContainer) checkoutAlertContainer.removeChild(loadingAlert);
            });
        } catch (error) {
            console.error("Error general iniciando PayPal Buttons:", error);
            if (paypalButtonDOMContainer) {
                paypalButtonDOMContainer.innerHTML = '<p class="text-danger text-center">Error crítico al iniciar PayPal.</p>';
            }
            showCheckoutAlert('Ocurrió un error inesperado con la configuración de PayPal.', 'danger');
            if (checkoutAlertContainer && loadingAlert.parentNode === checkoutAlertContainer) checkoutAlertContainer.removeChild(loadingAlert);
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
                const profileIdCliente = document.getElementById("profile-id_cliente");
                const profilePNombre = document.getElementById("profile-p_nombre");
                const profileSNombre = document.getElementById("profile-s_nombre");
                const profilePApellido = document.getElementById("profile-p_apellido");
                const profileSApellido = document.getElementById("profile-s_apellido");
                const profileCorreo = document.getElementById("profile-correo");
                const profileTelefono = document.getElementById("profile-telefono");

                if (profileWelcome) profileWelcome.textContent = userData.p_nombre || "Usuario";
                if (profileIdCliente) profileIdCliente.textContent = userData.id_cliente || 'N/A';
                if (profilePNombre) profilePNombre.value = userData.p_nombre || "";
                if (profileSNombre) profileSNombre.value = userData.s_nombre || "";
                if (profilePApellido) profilePApellido.value = userData.p_apellido || "";
                if (profileSApellido) profileSApellido.value = userData.s_apellido || "";
                if (profileCorreo) profileCorreo.value = userData.correo || "";
                if (profileTelefono) profileTelefono.value = userData.telefono || "";

                if (userData.id_cliente) {
                    fetchUserOrders(userData.id_cliente);
                } else {
                    const pedidosEnCursoContainer = document.getElementById('pedidos-en-curso-container');
                    const historialPedidosContainer = document.getElementById('historial-pedidos-container');
                    if (pedidosEnCursoContainer) pedidosEnCursoContainer.innerHTML = '<p class="text-muted">No se pudo cargar el ID del cliente.</p>';
                    if (historialPedidosContainer) historialPedidosContainer.innerHTML = '<p class="text-muted">No se pudo cargar el ID del cliente.</p>';
                }
            }
        } catch (error) {
            console.error('Error crítico al obtener perfil o procesar datos:', error);
            if (window.location.pathname.includes("/perfil/")) {
                const profileDetailsContainer = document.getElementById("profile-details-container");
                if (profileDetailsContainer) {
                    profileDetailsContainer.innerHTML = '<p class="text-danger text-center">Error al cargar los datos del perfil.</p>';
                }
            }
        }
    }

    async function fetchUserOrders(idCliente) {
        const pedidosEnCursoContainer = document.getElementById('pedidos-en-curso-container');
        const historialPedidosContainer = document.getElementById('historial-pedidos-container');
        const noPedidosEnCursoMsg = document.getElementById('no-pedidos-en-curso');
        const noHistorialPedidosMsg = document.getElementById('no-historial-pedidos');

        if (!pedidosEnCursoContainer || !historialPedidosContainer || !noPedidosEnCursoMsg || !noHistorialPedidosMsg) {
            return;
        }

        noPedidosEnCursoMsg.style.display = 'none';
        noHistorialPedidosMsg.style.display = 'none';
        pedidosEnCursoContainer.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary" role="status"></div><p>Cargando...</p></div>';
        historialPedidosContainer.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary" role="status"></div><p>Cargando...</p></div>';

        try {
            const effectiveCrudUrl = API_CRUD_BASE_URL;
            const url = `${effectiveCrudUrl}/clientes/${idCliente}/pedidos`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
                    'Content-Type': 'application/json'
                }
            });

            const responseText = await response.text();

            if (!response.ok) {
                let errorDetail = "Error desconocido.";
                try { const errorData = JSON.parse(responseText); errorDetail = errorData.detail || errorDetail; }
                catch (e) { errorDetail = responseText || errorDetail; }
                throw new Error(`Error ${response.status}: ${errorDetail}`);
            }

            const pedidos = JSON.parse(responseText);

            pedidosEnCursoContainer.innerHTML = '';
            historialPedidosContainer.innerHTML = '';
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
                const fechaPedidoFormateada = pedido.fecha_pedido ? new Date(pedido.fecha_pedido).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';
                const totalPedidoFormateado = (parseFloat(pedido.total_pedido) || 0).toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });
                const estadoDescripcion = pedido.estado_descripcion || 'Desconocido';

                const detallesHTML = pedido.detalles && pedido.detalles.length > 0 ?
                    pedido.detalles.map(detalle => {
                        let imagenSrc = '/static/core/images/placeholder.png';
                        if (detalle.imagen_url) {
                            imagenSrc = detalle.imagen_url.startsWith('http') ? detalle.imagen_url : ((typeof MEDIA_URL !== 'undefined' ? MEDIA_URL : '/media/') + detalle.imagen_url);
                        }
                        return `
                        <li class="list-group-item d-flex justify-content-between align-items-center py-2 px-0 border-bottom">
                            <div class="d-flex align-items-center">
                                <img src="${imagenSrc}" alt="${detalle.nombre_producto || 'Producto'}" class="order-summary-img me-2" onerror="this.onerror=null;this.src='/static/core/images/placeholder.png';">
                                <div>
                                    <small class="fw-semibold d-block text-truncate" style="max-width: 200px;" title="${detalle.nombre_producto || ''}">${detalle.nombre_producto || 'N/A'}</small>
                                    <small class="text-muted">Cant: ${detalle.cantidad} x $${(parseFloat(detalle.precio_unitario_venta) || 0).toLocaleString('es-CL')}</small>
                                </div>
                            </div>
                            <small class="text-muted fw-semibold">$${(parseFloat(detalle.subtotal) || 0).toLocaleString('es-CL')}</small>
                        </li>`;
                    }).join('') : '<li class="list-group-item px-0 text-muted small">No hay detalles.</li>';

                const pedidoCardHTML = `
                    <div class="card order-card shadow-sm mb-3">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <div>
                                <strong class="me-2">Pedido #${pedido.id_pedido}</strong>
                                <small class="text-muted">Fecha: ${fechaPedidoFormateada}</small>
                            </div>
                            <span class="badge bg-${esPedidoEnCurso ? 'info text-dark' : 'success'}">${estadoDescripcion}</span>
                        </div>
                        <div class="card-body">
                            <ul class="list-group list-group-flush mb-2">${detallesHTML}</ul>
                            <div class="text-end fw-bold mt-2 fs-5">Total: ${totalPedidoFormateado}</div>
                        </div>
                    </div>`;

                if (esPedidoEnCurso) {
                    if (pedidosEnCursoContainer) pedidosEnCursoContainer.innerHTML += pedidoCardHTML;
                    hayPedidosEnCurso = true;
                } else {
                    if (historialPedidosContainer) historialPedidosContainer.innerHTML += pedidoCardHTML;
                    hayPedidosEnHistorial = true;
                }
            });

            if (hayPedidosEnCurso) { if (noPedidosEnCursoMsg) noPedidosEnCursoMsg.style.display = 'none'; }
            else { if (noPedidosEnCursoMsg) noPedidosEnCursoMsg.style.display = 'block'; }

            if (hayPedidosEnHistorial) { if (noHistorialPedidosMsg) noHistorialPedidosMsg.style.display = 'none'; }
            else { if (noHistorialPedidosMsg) noHistorialPedidosMsg.style.display = 'block'; }

        } catch (error) {
            console.error("Error al procesar pedidos:", error);
            const errorMsg = `<div class="alert alert-warning">Error al cargar pedidos: ${error.message || 'Desconocido.'}</div>`;
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
            apiMessageDiv.innerHTML = "";
            const p_nombre = document.getElementById("p_nombre").value;
            const s_nombre = document.getElementById("s_nombre").value;
            const p_apellido = document.getElementById("p_apellido").value;
            const s_apellido = document.getElementById("s_apellido").value;
            const correo = document.getElementById("correo").value;
            const telefono = document.getElementById("telefono").value;
            const clave = document.getElementById("clave").value;
            const clave2 = document.getElementById("clave2").value;

            if (clave !== clave2) {
                apiMessageDiv.innerHTML = '<div class="alert alert-danger" role="alert">Las contraseñas no coinciden.</div>';
                return;
            }
            try {
                const response = await fetch(`${API_AUTH_BASE_URL}/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ p_nombre, s_nombre: s_nombre || null, p_apellido, s_apellido: s_apellido || null, correo, telefono: telefono || null, clave }),
                });
                const data = await response.json();
                if (response.ok) {
                    apiMessageDiv.innerHTML = '<div class="alert alert-success" role="alert">¡Registro exitoso! Redirigiendo...</div>';
                    setTimeout(() => { window.location.href = "/login/"; }, 2000);
                } else {
                    const errorMessage = data.detail || "Error desconocido al registrar.";
                    apiMessageDiv.innerHTML = `<div class="alert alert-danger" role="alert">${errorMessage}</div>`;
                }
            } catch (error) {
                console.error("Error API registro:", error);
                apiMessageDiv.innerHTML = '<div class="alert alert-danger" role="alert">No se pudo conectar al servidor.</div>';
            }
        });
    }

    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const apiMessageDiv = document.getElementById("api-message");
            apiMessageDiv.innerHTML = "";
            const username = document.getElementById("username").value;
            const password = document.getElementById("password").value;
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
                    const errorMessage = data.detail || "Error desconocido.";
                    apiMessageDiv.innerHTML = `<div class="alert alert-danger" role="alert">${errorMessage}</div>`;
                }
            } catch (error) {
                console.error("Error API login:", error);
                apiMessageDiv.innerHTML = '<div class="alert alert-danger" role="alert">No se pudo conectar.</div>';
            }
        });
    }

    function getCart() { return JSON.parse(localStorage.getItem("shoppingCart")) || []; }
    function saveCart(cart) {
        localStorage.setItem("shoppingCart", JSON.stringify(cart));
        updateCartCount();
        renderCartPreview();
        if (window.location.pathname.includes("/carrito/")) renderCartPage();
        if (window.location.pathname.includes("/realizar_compra/")) renderCheckoutSummary();
    }
    function addToCart(product) {
        let cart = getCart();
        const existingItem = cart.find(item => String(item.id) === String(product.id));
        if (existingItem) { existingItem.quantity = (parseInt(existingItem.quantity) || 0) + 1; }
        else { cart.push({ ...product, quantity: 1 }); }
        saveCart(cart);
        showToast(`"${product.name}" añadido al carrito.`);
    }
    function removeFromCart(productId) {
        let cart = getCart();
        cart = cart.filter(item => String(item.id) !== String(productId));
        saveCart(cart);
    }
    function updateCartItemQuantity(productId, newQuantity) {
        let cart = getCart();
        const item = cart.find(item => String(item.id) === String(productId));
        if (item) {
            const quantity = parseInt(newQuantity);
            if (quantity > 0) item.quantity = quantity;
            else cart = cart.filter(i => String(i.id) !== String(productId));
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

        if (!cartItemsContainer || !cartSubtotalSpan || !cartTotalSpan) return;

        const cart = getCart();
        let subtotal = 0;
        cartItemsContainer.innerHTML = "";

        if (cart.length === 0) {
            if (cartEmptyMessagePage) cartEmptyMessagePage.style.display = "block";
            else cartItemsContainer.innerHTML = '<tr><td colspan="6" class="text-center py-4">Carrito vacío.</td></tr>';
            if (cartSummaryFooter) cartSummaryFooter.style.display = "none";
            if (cartActionsButtons) cartActionsButtons.style.display = "none";
            cartSubtotalSpan.textContent = "$0";
            cartTotalSpan.textContent = "$0";
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
            row.innerHTML = `
                <td><img src="${item.image || '/static/core/images/placeholder.png'}" alt="${item.name}" class="img-fluid" style="width: 60px; height: 60px; object-fit: cover;"></td>
                <td>${item.name}</td>
                <td class="text-end">$${itemPrice.toLocaleString('es-CL')}</td>
                <td class="text-center">
                    <input type="number" class="form-control form-control-sm mx-auto cart-quantity-input" value="${itemQuantity}" min="1" data-product-id="${item.id}" style="width: 70px;">
                </td>
                <td class="text-end">$${itemTotal.toLocaleString('es-CL')}</td>
                <td class="text-center">
                    <button class="btn btn-danger btn-sm remove-from-cart-btn" data-product-id="${item.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
                </td>
            `;
            cartItemsContainer.appendChild(row);
        });

        cartSubtotalSpan.textContent = `$${subtotal.toLocaleString('es-CL')}`;
        cartTotalSpan.textContent = `$${subtotal.toLocaleString('es-CL')}`;

        document.querySelectorAll(".remove-from-cart-btn").forEach((button) => {
            button.addEventListener("click", function () { removeFromCart(this.dataset.productId); });
        });
        document.querySelectorAll(".cart-quantity-input").forEach((input) => {
            input.addEventListener("change", function () { updateCartItemQuantity(this.dataset.productId, this.value); });
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
            li.classList.add("cart-preview-item", "mb-2");
            li.dataset.itemId = item.id;

            li.innerHTML = `
                <div class="d-flex align-items-center">
                    <img src="${item.image || '/static/core/images/placeholder.png'}" alt="${item.name}" class="me-2 rounded" style="width: 40px; height: 40px; object-fit: cover;">
                    <div class="flex-grow-1">
                        <h6 class="mb-0 small item-name text-truncate" style="max-width: 130px;" title="${item.name}">${item.name}</h6>
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="text-muted item-quantity-price">
                                <span class="item-quantity">${itemQuantity}</span> x $${itemPrice.toLocaleString('es-CL')}
                            </small>
                            <small class="text-muted fw-bold item-subtotal" style="font-size: 0.8em;">$${itemSubtotal.toLocaleString('es-CL')}</small>
                        </div>
                    </div>
                    <div class="ms-auto text-nowrap">
                        <button class="btn btn-sm btn-outline-secondary cart-preview-decrease p-1" data-product-id="${item.id}" title="Disminuir" type="button" style="line-height: 1;"><i class="fas fa-minus"></i></button>
                        <button class="btn btn-sm btn-outline-secondary cart-preview-increase p-1" data-product-id="${item.id}" title="Aumentar" type="button" style="line-height: 1;"><i class="fas fa-plus"></i></button>
                        <button class="btn btn-sm btn-outline-danger cart-preview-remove ms-1 p-1" data-product-id="${item.id}" title="Eliminar" type="button" style="line-height: 1;"><i class="fas fa-trash-alt"></i></button>
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
                console.error("Datos producto incompletos:", this.dataset);
                showToast("Error: Datos del producto incompletos.", true);
                return;
            }
            addToCart(product);
        });
    });
    function showToast(message, isError = false) {
        const toastContainer = document.getElementById('toast-container');
        if (toastContainer) {
            const toastId = 'toast-' + Date.now();
            const toastBg = isError ? 'bg-danger' : 'bg-success';
            const toastLiveExample = document.createElement('div');
            toastLiveExample.classList.add('toast', 'align-items-center', 'text-white', toastBg, 'border-0');
            toastLiveExample.id = toastId;
            toastLiveExample.setAttribute('role', 'alert');
            toastLiveExample.setAttribute('aria-live', 'assertive');
            toastLiveExample.setAttribute('aria-atomic', 'true');
            toastLiveExample.innerHTML = `
                <div class="d-flex">
                    <div class="toast-body">${message}</div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>`;
            toastContainer.appendChild(toastLiveExample);
            const toast = new bootstrap.Toast(toastLiveExample, { delay: 3000 });
            toast.show();
            toastLiveExample.addEventListener('hidden.bs.toast', function () { toastLiveExample.remove(); });
        } else {
            alert(message);
        }
    }
    function handleCheckout() {
        const cart = getCart();
        if (cart.length === 0) {
            showToast("Tu carrito está vacío.", true);
            return;
        }
        const token = localStorage.getItem('access_token');
        if (!token) {
            showToast("Debes iniciar sesión para proceder al pago.", true);
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
        const checkoutFormSubmitButton = document.getElementById('submit-order-button');

        if (!summaryList || !itemCountBadge || !subtotalSpan || !totalSpan || !emptyMessage || !totalsSummary) {
            return;
        }

        const cart = getCart();
        summaryList.innerHTML = '';
        let currentSubtotal = 0;
        let itemCount = 0;

        if (cart.length === 0) {
            emptyMessage.style.display = 'block';
            totalsSummary.style.display = 'none';
            itemCountBadge.textContent = '0';
            if (checkoutFormSubmitButton) checkoutFormSubmitButton.classList.add('disabled');
            if (window.location.pathname.includes("/realizar_compra/")) {
                showToast("Carrito vacío. Redirigiendo a productos...", true);
                setTimeout(() => { window.location.href = "/productos/"; }, 3000);
            }
            return;
        }

        emptyMessage.style.display = 'none';
        totalsSummary.style.display = 'block';
        if (checkoutFormSubmitButton) checkoutFormSubmitButton.classList.remove('disabled');

        cart.forEach(item => {
            const itemPrice = parseFloat(item.price) || 0;
            const itemQuantity = parseInt(item.quantity) || 0;
            const itemTotal = itemPrice * itemQuantity;
            currentSubtotal += itemTotal;
            itemCount++;

            const listItem = document.createElement('li');
            listItem.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'lh-sm');
            listItem.innerHTML = `
                <div>
                    <h6 class="my-0 text-truncate" style="max-width: 200px;" title="${item.name}">${item.name}</h6>
                    <small class="text-muted">Cantidad: ${itemQuantity}</small>
                </div>
                <span class="text-muted">$${itemTotal.toLocaleString('es-CL')}</span>
            `;
            summaryList.appendChild(listItem);
        });

        itemCountBadge.textContent = itemCount.toString();
        subtotalSpan.textContent = `$${currentSubtotal.toLocaleString('es-CL')}`;

        const shippingCost = 4990;
        if (shippingSpan) shippingSpan.textContent = `$${shippingCost.toLocaleString('es-CL')}`;
        totalSpan.textContent = `$${(currentSubtotal + shippingCost).toLocaleString('es-CL')}`;
    }

    const passwordToggleButtons = document.querySelectorAll('.password-toggle-btn');
    passwordToggleButtons.forEach(button => {
        button.addEventListener('click', function () {
            const parentContainer = this.closest('.position-relative');
            if (!parentContainer) return;

            const currentPasswordInput = parentContainer.querySelector('input.form-control-password-toggle');
            if (!currentPasswordInput) return;

            const passwordIcon = this.querySelector('i');

            if (currentPasswordInput && passwordIcon) {
                const type = currentPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                currentPasswordInput.setAttribute('type', type);

                if (type === 'password') {
                    passwordIcon.classList.remove('fa-eye-slash');
                    passwordIcon.classList.add('fa-eye');
                } else {
                    passwordIcon.classList.remove('fa-eye');
                    passwordIcon.classList.add('fa-eye-slash');
                }
            }
        });
    });

    if (paymentMethodRadios.length > 0) {
        paymentMethodRadios.forEach(radio => {
            radio.addEventListener('change', function () {
                paymentDetailsSections.forEach(detail => {
                    detail.classList.remove('active');
                });

                if (paypalButtonDOMContainer &&
                    document.getElementById('payment-details-paypal') &&
                    !document.getElementById('payment-details-paypal').classList.contains('active')) {
                    paypalButtonDOMContainer.innerHTML = '';
                }

                const selectedMethod = this.value;
                const detailElement = document.getElementById(`payment-details-${selectedMethod}`);
                if (detailElement) {
                    detailElement.classList.add('active');
                    if (selectedMethod === 'paypal') {
                        initPayPalButton();
                    }
                }
                if (submitOrderButton) {
                    submitOrderButton.style.display = (selectedMethod === 'paypal') ? 'none' : 'block';
                    submitOrderButton.disabled = false;
                }
            });
        });

        const initiallySelectedMethodRadio = document.querySelector('input[name="paymentMethod"]:checked');
        if (initiallySelectedMethodRadio) {
            initiallySelectedMethodRadio.dispatchEvent(new Event('change'));
        } else if (paymentMethodRadios.length > 0 && submitOrderButton) {
            const isPayPalDefault = (paymentMethodRadios[0].value === 'paypal' && paymentMethodRadios[0].checked);
            submitOrderButton.style.display = isPayPalDefault ? 'none' : 'block';
            if (!isPayPalDefault) paymentMethodRadios[0].checked = true;
            paymentMethodRadios[0].dispatchEvent(new Event('change'));
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
                if (confirm("¿Vaciar carrito?")) {
                    localStorage.removeItem("shoppingCart");
                    renderCartPage();
                }
            });
        }
    }
    if (window.location.pathname.includes("/realizar_compra/")) {
        renderCheckoutSummary();
    }

    var forms = document.querySelectorAll('.needs-validation');
    Array.prototype.slice.call(forms)
        .forEach(function (form) {
            form.addEventListener('submit', function (event) {
                const selectedPaymentMethod = document.querySelector('input[name="paymentMethod"]:checked');
                if (selectedPaymentMethod && selectedPaymentMethod.value === 'paypal') {
                    event.preventDefault();
                    event.stopPropagation();
                    showCheckoutAlert("Para pagar con PayPal, por favor usa los botones de PayPal.", "info");
                    return;
                }

                if (!form.checkValidity()) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                form.classList.add('was-validated');
            }, false);
        });
});