const API_AUTH_BASE_URL = typeof API_AUTH_URL_FROM_DJANGO !== 'undefined' && API_AUTH_URL_FROM_DJANGO
                            ? API_AUTH_URL_FROM_DJANGO
                            : "http://127.0.0.1:8002";

const API_CRUD_BASE_URL = "http://127.0.0.1:8001";

document.addEventListener("DOMContentLoaded", function () {
    const userGreetingElement = document.getElementById('user-greeting');
    const loginLink = document.getElementById('login-link');
    const registerLink = document.getElementById('register-link');
    const logoutLink = document.getElementById('logout-link');
    const profileLink = document.getElementById('profile-link');

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
            if (response.ok) {
                const userData = await response.json();
                if (userGreetingElement) {
                    userGreetingElement.textContent = `Hola, ${userData.p_nombre || userData.correo}!`;
                }

                if (window.location.pathname.includes('/perfil/')) {
                    const profileWelcome = document.getElementById('profile-welcome-name');
                    if(profileWelcome) profileWelcome.textContent = userData.p_nombre || 'Usuario';

                    document.getElementById('profile-p_nombre').textContent = userData.p_nombre || 'No especificado';
                    document.getElementById('profile-s_nombre').textContent = userData.s_nombre || '';
                    document.getElementById('profile-p_apellido').textContent = userData.p_apellido || 'No especificado';
                    document.getElementById('profile-s_apellido').textContent = userData.s_apellido || '';
                    document.getElementById('profile-correo').textContent = userData.correo || 'No especificado';
                    document.getElementById('profile-telefono').textContent = userData.telefono || 'No especificado';
                    document.getElementById('profile-activo').textContent = userData.activo === 'S' ? 'Sí' : 'No';
                }
            } else {
                console.warn("Token inválido/expirado al obtener perfil. Deslogueando.");
                logoutUser();
            }
        } catch (error) {
            console.error('Error al obtener perfil:', error);
            if (window.location.pathname.includes('/perfil/')) {
                const profileDetailsContainer = document.getElementById('profile-details-container');
                if(profileDetailsContainer) {
                    profileDetailsContainer.innerHTML = '<p class="text-danger text-center">Error al cargar los datos del perfil. Inténtalo de nuevo más tarde o inicia sesión nuevamente.</p>';
                }
            }
        }
    }

    if (logoutLink) {
        logoutLink.addEventListener('click', function(event) {
            event.preventDefault();
            logoutUser();
        });
    }

    function logoutUser() {
        localStorage.removeItem('access_token');
        localStorage.removeItem('token_type');
        updateAuthUI();
        if (window.location.pathname !== "/" && !window.location.pathname.includes('/login/')) {
             window.location.href = '/';
        } else if (window.location.pathname.includes('/login/')) {
        }
         else {
            window.location.reload();
        }
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
                apiMessageDiv.innerHTML =
                '<div class="alert alert-danger" role="alert">Las contraseñas no coinciden.</div>';
                return;
            }

            try {
                const response = await fetch(`${API_AUTH_BASE_URL}/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    p_nombre: p_nombre,
                    s_nombre: s_nombre || null,
                    p_apellido: p_apellido,
                    s_apellido: s_apellido || null,
                    correo: correo,
                    telefono: telefono || null,
                    clave: clave,
                }),
                });
                const data = await response.json();
                if (response.ok) {
                apiMessageDiv.innerHTML =
                    '<div class="alert alert-success" role="alert">¡Registro exitoso! Redirigiendo a la página de inicio de sesión...</div>';
                setTimeout(() => { window.location.href = "/login/"; }, 2000);
                } else {
                const errorMessage = data.detail || "Error desconocido al registrar el usuario.";
                apiMessageDiv.innerHTML = `<div class="alert alert-danger" role="alert">${errorMessage}</div>`;
                }
            } catch (error) {
                console.error("Error al conectar con la API de registro:", error);
                apiMessageDiv.innerHTML =
                '<div class="alert alert-danger" role="alert">No se pudo conectar con el servidor de autenticación. Inténtalo de nuevo más tarde.</div>';
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
                    apiMessageDiv.innerHTML =
                        '<div class="alert alert-success" role="alert">¡Inicio de sesión exitoso! Redirigiendo...</div>';
                    updateAuthUI();

                    const redirectTo = localStorage.getItem('redirect_to_after_login');
                    if (redirectTo) {
                        localStorage.removeItem('redirect_to_after_login');
                        setTimeout(() => { window.location.href = redirectTo; }, 1000);
                    } else {
                        setTimeout(() => { window.location.href = "/"; }, 1000);
                    }
                } else {
                    const errorMessage = data.detail || "Error desconocido al iniciar sesión.";
                    apiMessageDiv.innerHTML = `<div class="alert alert-danger" role="alert">${errorMessage}</div>`;
                }
            } catch (error) {
                console.error("Error al conectar con la API de login:", error);
                apiMessageDiv.innerHTML =
                '<div class="alert alert-danger" role="alert">No se pudo conectar con el servidor de autenticación. Inténtalo de nuevo más tarde.</div>';
            }
        });
    }

    function getCart() {
        const cart = localStorage.getItem("shoppingCart");
        return cart ? JSON.parse(cart) : [];
    }

    function saveCart(cart) {
        localStorage.setItem("shoppingCart", JSON.stringify(cart));
        updateCartCount();
        renderCartPreview();
    }

    function addToCart(product) {
        let cart = getCart();
        const existingItem = cart.find((item) => item.id === product.id);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({ ...product, quantity: 1 });
        }
        saveCart(cart);
        const toastContainer = document.getElementById('toast-container');
        if (toastContainer) {
            const toastHTML = `
                <div class="toast align-items-center text-white bg-success border-0 fade show" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="3000">
                    <div class="d-flex">
                        <div class="toast-body">
                            "${product.name}" añadido al carrito.
                        </div>
                        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                    </div>
                </div>`;
            toastContainer.innerHTML = toastHTML;
            setTimeout(() => {
                toastContainer.innerHTML = ''; 
            }, 3000);
        } else {
             alert(`"${product.name}" ha sido añadido al carrito.`);
        }
    }

    function removeFromCart(productId) {
        let cart = getCart();
        cart = cart.filter((item) => item.id !== productId);
        saveCart(cart);
        if (window.location.pathname.includes("/carrito")) {
            renderCartPage();
        }
    }

    function updateCartItemQuantity(productId, newQuantity) {
        let cart = getCart();
        const item = cart.find((item) => item.id === productId);
        if (item) {
            const quantity = parseInt(newQuantity);
            if (quantity > 0) {
                item.quantity = quantity;
            } else {
                cart = cart.filter((i) => i.id !== productId);
            }
        }
        saveCart(cart);
        if (window.location.pathname.includes("/carrito")) {
            renderCartPage();
        }
    }

    function renderCartPage() {
        const cartItemsContainer = document.getElementById("cart-items");
        const cartSubtotalSpan = document.getElementById("cart-subtotal");
        const cartTotalSpan = document.getElementById("cart-total");
        const cart = getCart();
        let subtotal = 0;

        if (!cartItemsContainer || !cartSubtotalSpan || !cartTotalSpan) return;
        cartItemsContainer.innerHTML = "";

        if (cart.length === 0) {
            cartItemsContainer.innerHTML = '<tr><td colspan="6" class="text-center py-4">Tu carrito está vacío.</td></tr>';
            cartSubtotalSpan.textContent = "$0.00";
            cartTotalSpan.textContent = "$0.00";
            return;
        }

        cart.forEach((item) => {
            const itemTotal = item.price * item.quantity;
            subtotal += itemTotal;
            const row = document.createElement("tr");
            row.innerHTML = `
                <td><img src="${item.image || "/static/core/images/placeholder.png"}" alt="${item.name}" class="img-fluid cart-item-image"></td>
                <td>${item.name}</td>
                <td>$${item.price.toFixed(2)}</td>
                <td><input type="number" class="form-control cart-quantity-input" value="${item.quantity}" min="1" data-product-id="${item.id}"></td>
                <td>$${itemTotal.toFixed(2)}</td>
                <td><button class="btn btn-danger btn-sm remove-from-cart-btn" data-product-id="${item.id}"><i class="fas fa-trash"></i></button></td>
            `;
            cartItemsContainer.appendChild(row);
        });

        cartSubtotalSpan.textContent = `$${subtotal.toFixed(2)}`;
        cartTotalSpan.textContent = `$${subtotal.toFixed(2)}`;

        document.querySelectorAll(".remove-from-cart-btn").forEach((button) => {
            button.addEventListener("click", function () {
                removeFromCart(this.dataset.productId);
            });
        });
        document.querySelectorAll(".cart-quantity-input").forEach((input) => {
            input.addEventListener("change", function () {
                updateCartItemQuantity(this.dataset.productId, this.value);
            });
        });
    }

    function updateCartCount() {
        const cartCountBadge = document.getElementById("cart-count-badge");
        if (cartCountBadge) {
            const cart = getCart();
            const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
            cartCountBadge.textContent = totalItems;
            cartCountBadge.style.display = totalItems > 0 ? "inline-block" : "none";
        }
    }

    function renderCartPreview() {
        const cartPreviewItemsList = document.getElementById("cart-preview-items");
        const cartPreviewEmptyMessage = document.getElementById("cart-preview-empty");
        const cartPreviewSubtotalSpan = document.getElementById("cart-preview-subtotal");
        const cartPreviewTotalSpan = document.getElementById("cart-preview-total");

        if (!cartPreviewItemsList || !cartPreviewEmptyMessage || !cartPreviewSubtotalSpan) return;
        
        const cart = getCart();
        let subtotal = 0;
        cartPreviewItemsList.innerHTML = "";

        if (cart.length === 0) {
            cartPreviewEmptyMessage.style.display = "block";
            cartPreviewSubtotalSpan.textContent = "$0.00";
            if (cartPreviewTotalSpan) cartPreviewTotalSpan.textContent = "$0.00";
            return;
        }
        cartPreviewEmptyMessage.style.display = "none";

        cart.forEach((item) => {
            const itemTotal = item.price * item.quantity;
            subtotal += itemTotal;
            const li = document.createElement("li");
            li.classList.add("mb-2", "cart-preview-item");
            li.innerHTML = `
                <div class="d-flex align-items-center">
                    <img src="${item.image || "/static/core/images/placeholder.png"}" alt="${item.name}" class="me-2 rounded" style="width: 50px; height: 50px; object-fit: cover;">
                    <div class="flex-grow-1">
                        <h6 class="mb-0 small">${item.name}</h6>
                        <small class="text-muted">${item.quantity} x $${item.price.toFixed(2)}</small>
                    </div>
                    <button class="btn btn-sm btn-outline-danger ms-2 remove-from-cart-preview-btn" data-product-id="${item.id}"><i class="fas fa-trash"></i></button>
                </div>`;
            cartPreviewItemsList.appendChild(li);
        });

        cartPreviewSubtotalSpan.textContent = `$${subtotal.toFixed(2)}`;
        if (cartPreviewTotalSpan) cartPreviewTotalSpan.textContent = `$${subtotal.toFixed(2)}`;

        document.querySelectorAll(".remove-from-cart-preview-btn").forEach((button) => {
            button.addEventListener("click", function (e) {
                e.stopPropagation();
                removeFromCart(this.dataset.productId);
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
            addToCart(product);
        });
    });

    updateCartCount();
    renderCartPreview();

    if (window.location.pathname.includes("/carrito/")) {
        renderCartPage();
        const clearCartBtn = document.getElementById("clear-cart-btn");
        if (clearCartBtn) {
            clearCartBtn.addEventListener("click", function () {
                if (confirm("¿Estás seguro de que quieres vaciar todo el carrito?")) {
                    localStorage.removeItem("shoppingCart");
                    renderCartPage();
                    updateCartCount();
                    renderCartPreview();
                }
            });
        }

        const checkoutBtn = document.getElementById("checkout-btn");
        if (checkoutBtn) {
            checkoutBtn.addEventListener("click", function () {
                const cart = getCart();
                if (cart.length === 0) {
                    alert("Tu carrito está vacío. Añade productos antes de proceder al pago.");
                    return;
                }
                const token = localStorage.getItem('access_token');
                if (!token) {
                    alert('Debes iniciar sesión para proceder al pago.');
                    localStorage.setItem('redirect_to_after_login', '/realizar_compra/'); 
                    window.location.href = '/login/';
                    return;
                }
                window.location.href = '/realizar_compra/'; 
            });
        }
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

});