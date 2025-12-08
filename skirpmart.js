const supabaseUrl = "https://vhurelhciwirynuqpnjt.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZodXJlbGhjaXdpcnludXFwbmp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzOTg2NDMsImV4cCI6MjA2NTk3NDY0M30.g6-dnlvk3-svrzvw0Ce9vcSdXn3l9pQVocr_hQDAJIU";
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true },
});

let products = [];
let cart = [];
let currentCategory = "all";
let currentSearch = "";
let deliveryOption = "pickup";
let deliveryFee = 0;
let paymentMethod = "tunai";
let currentUser = null;
let userProfile = null;
let isCheckoutInProgress = false;

// --- PERBAIKAN STUCK SPINNER ---
let originalLogoutHtml = '<i class="fas fa-sign-out-alt w-4 h-4 mr-2 opacity-70"></i> Logout';
// --- AKHIR PERBAIKAN ---

// Realtime channels references
let ordersChannel = null;
let customerChannel = null;
let productsChannel = null;
let authSubscription = null;

// Variabel untuk konfirmasi cancel
let orderToCancel = null;

// ==============================
// FUNGSI UNTUK MODAL KONFIRMASI CANCEL YANG BARU
// ==============================
function showCancelConfirmModal(ordersNumber) {
    orderToCancel = ordersNumber;
    const modal = document.getElementById('cancelConfirmModal');
    const orderIdDisplay = document.getElementById('cancelOrderIdDisplay');
    
    // Tampilkan nomor pesanan yang akan dibatalkan
    if (orderIdDisplay) {
        orderIdDisplay.textContent = ordersNumber || 'Nomor Pesanan Tidak Diketahui';
    }
    
    if (modal) {
        modal.classList.add('open');
    }
}

// Fungsi untuk menutup modal konfirmasi cancel
function closeCancelConfirmModal() {
    orderToCancel = null;
    const modal = document.getElementById('cancelConfirmModal');
    
    if (modal) {
        modal.classList.remove('open');
    }
}

// Setup event listeners untuk modal cancel yang baru
function setupCancelModalListeners() {
    const confirmCancelBtn = document.getElementById('confirmCancelBtn');
    const cancelCancelBtn = document.getElementById('cancelCancelBtn');
    const cancelConfirmOverlay = document.getElementById('cancelConfirmOverlay');
    
    if (confirmCancelBtn) {
        confirmCancelBtn.addEventListener('click', async () => {
            if (orderToCancel) {
                // Tampilkan loading state
                const originalText = confirmCancelBtn.innerHTML;
                confirmCancelBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Memproses...';
                confirmCancelBtn.disabled = true;
                cancelCancelBtn.disabled = true;
                
                await processCancelOrder(orderToCancel);
                closeCancelConfirmModal();
                
                // Reset button state
                setTimeout(() => {
                    confirmCancelBtn.innerHTML = originalText;
                    confirmCancelBtn.disabled = false;
                    cancelCancelBtn.disabled = false;
                }, 500);
            }
        });
    }
    
    if (cancelCancelBtn) {
        cancelCancelBtn.addEventListener('click', () => {
            closeCancelConfirmModal();
        });
    }
    
    if (cancelConfirmOverlay) {
        cancelConfirmOverlay.addEventListener('click', () => {
            closeCancelConfirmModal();
        });
    }
}

/* ----- Badge UI ----- */
function updateBadge(count) {
    try {
        const historyBadge = document.getElementById("historyBadge");
        if (!historyBadge) return;
        if (count && Number(count) > 0) {
            historyBadge.textContent = String(count);
            historyBadge.style.display = "flex";
        } else {
            historyBadge.textContent = "";
            historyBadge.style.display = "none";
        }
        console.log("[badge] updated =>", count);
    } catch (err) {
        console.error("[badge] update error", err);
    }
}

// [REF: RPC v2_get_history_badge]
async function loadHistoryBadge() {
    try {
        if (!currentUser?.email) return;
        
        // Menggunakan RPC menggantikan query langsung
        const { data, error } = await supabase.rpc('v2_get_history_badge', { 
            p_email: currentUser.email 
        });

        if (error) {
            console.warn("[loadHistoryBadge] error", error);
            return;
        }
        updateBadge(data ?? 0);
    } catch (err) {
        console.error("[loadHistoryBadge] exception", err);
    }
}

/* ----- Reset badge on click history ----- */
document.addEventListener("DOMContentLoaded", () => {
    const historyBtn = document.getElementById("historyBtn");
    if (historyBtn) {
        historyBtn.addEventListener("click", async () => {
            if (!currentUser?.email) return;

            // [REF: RPC v2_reset_history_badge]
            const { error } = await supabase.rpc('v2_reset_history_badge', {
                p_email: currentUser.email
            });

            if (error) {
                console.error("[reset badge] error", error);
                return;
            }
            updateBadge(null);
            console.log("[reset badge] done");
        });
    }
});

/* ----- Sound & fallback ----- */
const RING_URL = "https://cdn.jsdelivr.net/gh/junago15/Asset-aksara@main/mart.mp3";
let notifSound = null;

function ensureNotifSoundReady() {
    if (!notifSound) {
        notifSound = new Audio(RING_URL);
        notifSound.volume = 0.9;
    }
}

let isSoundPlaying = false;

function playNotifSoundWithFallback(title = "Aksara-Mart", body = "Pesanan selesai") {
    try {
        if (isSoundPlaying) {
            console.log("[sound] skipped: masih bermain");
            return;
        }
        isSoundPlaying = true;
        setTimeout(() => (isSoundPlaying = false), 2000);

        localStorage.setItem("aksara_notif_trigger", Date.now().toString());

        ensureNotifSoundReady();

        notifSound.currentTime = 0;
        notifSound
            .play()
            .then(() => console.log("[sound] played successfully"))
            .catch((err) => {
                console.warn("[sound] play blocked:", err);

                if (typeof showNotification === "function") {
                    showNotification(body, "success");
                }

                if ("Notification" in window) {
                    if (Notification.permission === "granted") {
                        new Notification(title, { body });
                    } else if (Notification.permission !== "denied") {
                        Notification.requestPermission()
                            .then((p) => {
                                if (p === "granted") new Notification(title, { body });
                            })
                            .catch((e) => console.warn("[Notification.requestPermission]", e));
                    }
                }
            });
    } catch (err) {
        console.error("[playNotifSoundWithFallback]", err);
    }
}

window.addEventListener("storage", (event) => {
    if (event.key === "aksara_notif_trigger") {
        console.log("[multi-tab] notif dari tab lain, skip suara");
        if (typeof showNotification === "function") {
            showNotification("Pesananmu selesai!", "success");
        }
    }
});

function unlockAudioOnFirstGesture() {
    function unlock() {
        try {
            ensureNotifSoundReady();
            notifSound.play().then(() => {
                notifSound.pause();
                notifSound.currentTime = 0;
                console.log("[sound] unlocked by gesture");
            }).catch(e => console.log("[sound] unlock play blocked", e));
        } catch (e) {
            console.warn("[sound] unlock error", e);
        } finally {
            document.removeEventListener("click", unlock);
            document.removeEventListener("keydown", unlock);
        }
    }
    document.addEventListener("click", unlock);
    document.addEventListener("keydown", unlock);
}
unlockAudioOnFirstGesture();

/* ----- Products realtime listener ----- */
function setupProductsChannel() {
    try {
        if (productsChannel) {
            return;
        }

        productsChannel = supabase.channel("products-channel");

        productsChannel.on(
            "postgres_changes",
            { event: "*", schema: "public", table: "product_list" },
            async (payload) => {
                console.log("[products] realtime update:", payload);
                try {
                    await fetchProductsFromSupabase();
                } catch (err) {
                    console.error("[products handler] error", err);
                }
            }
        );

        productsChannel.subscribe().then((status) => {
            console.log("[productsChannel subscribe] status:", status);
        }).catch(e => console.warn("[productsChannel subscribe] catch:", e));

    } catch (err) {
        console.error("[setupProductsChannel] error", err);
    }
}

function setupOrdersChannel() {
    try {
        if (ordersChannel) return;

        ordersChannel = supabase.channel("orders-channel");

        ordersChannel.on(
            "postgres_changes",
            { event: "*", schema: "public", table: "orders" },
            async (payload) => {
                console.log("[orders] payload:", payload);
                try {
                    fetchOrderHistory().catch(e => console.warn("[fetchOrderHistory] failed", e));

                    const newRow = payload?.new ?? null;
                    if (!newRow) return;

                    const newStatus = (newRow.status ?? "").toString().toLowerCase().trim();
                    const targetEmail = newRow.email_customers ?? null;
                    const completedStatuses = ["completed", "finish", "selesai", "done", "finished", "complete"];

                    if (!targetEmail) return;

                    if (completedStatuses.some(s => newStatus.includes(s))) {
                        if (currentUser?.email && currentUser.email === targetEmail) {
                            await loadHistoryBadge().catch(e => console.warn("[loadHistoryBadge] failed", e));
                            playNotifSoundWithFallback("Aksara-Mart", "Pesananmu selesai!");
                        }
                    }
                } catch (err) {
                    console.error("[orders handler] error", err);
                }
            }
        );

        ordersChannel.subscribe().then((status) => {
            console.log("[ordersChannel subscribe] status:", status);
        });
    } catch (err) {
        console.error("[setupOrdersChannel] error", err);
    }
}

function subscribeCustomerRow(email) {
    try {
        if (customerChannel) {
            try { customerChannel.unsubscribe(); } catch (e) { console.warn("[customerChannel] unsubscribe error", e); }
            customerChannel = null;
        }
        if (!email) return;

        customerChannel = supabase.channel("customer-badge-" + email);

        customerChannel.on(
            "postgres_changes",
            { event: "*", schema: "public", table: "customers_data", filter: `email=eq.${email}` },
            payload => {
                console.log("[customers_data] payload for", email, payload);
                loadHistoryBadge().catch(e => console.warn("[loadHistoryBadge] failed", e));
            }
        );

        customerChannel.subscribe().then(status => {
            console.log("[customerChannel subscribe] status:", status);
            loadHistoryBadge().catch(e => console.warn("[loadHistoryBadge] initial failed", e));
        }).catch(e => console.warn("[customerChannel subscribe] err", e));
    } catch (err) {
        console.error("[subscribeCustomerRow] error", err);
    }
}

async function checkAuthStateAndInit() {
    try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session ?? null;
        if (session) {
            currentUser = session.user;
            console.log("[auth] session found:", currentUser?.email);
            await fetchUserProfile().catch(e => console.warn("[fetchUserProfile] failed", e));
            updateUIAfterLogin && updateUIAfterLogin();
            loadHistoryBadge().catch(() => { });
            subscribeCustomerRow(currentUser.email);
        } else {
            console.log("[auth] no session");
            updateUIAfterLogout(); 
        }

        setupOrdersChannel();
        setupProductsChannel();

        if (!authSubscription) {
            const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
                console.log("[auth.onAuthStateChange]", event);
                if (session?.user) {
                    currentUser = session.user;
                    fetchUserProfile().catch(e => console.warn("[fetchUserProfile] failed", e));
                    updateUIAfterLogin && updateUIAfterLogin();
                    subscribeCustomerRow(currentUser.email);
                    loadHistoryBadge().catch(() => { });
                } else {
                    updateUIAfterLogout();
                }
            });
            authSubscription = listener;
        }
    } catch (err) {
        console.error("[checkAuthStateAndInit] error", err);
    }
}

checkAuthStateAndInit();

function cleanupRealtime() {
    try {
        if (ordersChannel) ordersChannel.unsubscribe().catch(() => { });
        if (customerChannel) customerChannel.unsubscribe().catch(() => { });
        if (productsChannel) productsChannel.unsubscribe().catch(() => { });
        if (authSubscription?.subscription) authSubscription.subscription.unsubscribe();
    } catch (e) { console.warn("[cleanupRealtime] ", e); }
}

function updateTime() {
    try {
        const now = new Date();
        const timeElement = document.getElementById('currentTime');
        if (timeElement) {
            timeElement.textContent = now.toLocaleString('id-ID');
        }
    } catch (error) {
        console.error('Error updating time:', error);
    }
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const icon = document.getElementById('notificationIcon');
    const messageEl = document.getElementById('notificationMessage');

    notification.classList.remove('hidden');

    if (type === 'success') {
        icon.innerHTML = '<i class="fas fa-check-circle text-green-500 text-sm"></i>';
        notification.querySelector('div').classList.add('border-green-500');
        notification.querySelector('div').classList.remove('border-red-500', 'border-blue-500');
    } else if (type === 'error') {
        icon.innerHTML = '<i class="fas fa-exclamation-circle text-red-500 text-sm"></i>';
        notification.querySelector('div').classList.add('border-red-500');
        notification.querySelector('div').classList.remove('border-green-500', 'border-blue-500');
    } else {
        icon.innerHTML = '<i class="fas fa-info-circle text-blue-500 text-sm"></i>';
        notification.querySelector('div').classList.add('border-blue-500');
        notification.querySelector('div').classList.remove('border-green-500', 'border-red-500');
    }
    messageEl.textContent = message;
    notification.classList.remove('translate-x-full');
    notification.classList.add('translate-x-0');
    setTimeout(() => {
        notification.classList.remove('translate-x-0');
        notification.classList.add('translate-x-full');
        setTimeout(() => {
            notification.classList.add('hidden');
        }, 300);
    }, 3000);
}

function showButtonSpinner(buttonId, spinnerId, buttonTextId) {
    document.getElementById(buttonTextId).classList.add('hidden');
    document.getElementById(spinnerId).classList.remove('hidden');
    document.getElementById(buttonId).disabled = true;
}

function hideButtonSpinner(buttonId, spinnerId, buttonTextId) {
    document.getElementById(buttonTextId).classList.remove('hidden');
    document.getElementById(spinnerId).classList.add('hidden');
    document.getElementById(buttonId).disabled = false;
}

function setupScrollButton() {
    const scrollButton = document.getElementById('scrollToTop');

    window.addEventListener('scroll', function () {
        if (window.pageYOffset > 300) {
            scrollButton.classList.add('show');
        } else {
            scrollButton.classList.remove('show');
        }
    });

    scrollButton.addEventListener('click', function () {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

async function checkAuthState() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session) {
            currentUser = session.user;
            await fetchUserProfile();
            updateUIAfterLogin();
            await loadHistoryBadge();
        } else {
            updateUIAfterLogout();
        }
    } catch (error) {
        console.error('Error checking auth state:', error);
    }
}

function validatePassword() {
    const password = document.getElementById('registerPassword').value;
    const submitBtn = document.getElementById('registerSubmitBtn');
    const passwordRules = document.getElementById('passwordRules');

    const hasMinLength = password.length >= 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    updateRuleIndicator('rule-length', hasMinLength);
    updateRuleIndicator('rule-uppercase', hasUppercase);
    updateRuleIndicator('rule-lowercase', hasLowercase);
    updateRuleIndicator('rule-symbol', hasSymbol);

    const isValid = hasMinLength && hasUppercase && hasLowercase && hasSymbol;
    submitBtn.disabled = !isValid;

    if (password && !isValid) {
        passwordRules.classList.add('show');
    } else {
        passwordRules.classList.remove('show');
    }

    return isValid;
}

function updateRuleIndicator(ruleId, isValid) {
    const ruleElement = document.getElementById(ruleId);
    const icon = ruleElement.querySelector('i');

    if (isValid) {
        ruleElement.classList.add('rule-valid');
        ruleElement.classList.remove('rule-invalid');
        icon.classList.add('fa-check-circle');
        icon.classList.remove('fa-circle', 'fa-times-circle');
    } else {
        ruleElement.classList.remove('rule-valid');
        ruleElement.classList.add('rule-invalid');
        icon.classList.add('fa-times-circle');
        icon.classList.remove('fa-circle', 'fa-check-circle');
    }
}

function switchAuthTab(tabName) {
    document.querySelectorAll('.auth-tab').forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    document.querySelectorAll('.auth-form').forEach(form => {
        if (form.id === tabName + 'Form') {
            form.classList.add('active');
        } else {
            form.classList.remove('active');
        }
    });

    document.getElementById('authModalTitle').textContent =
        tabName === 'login' ? 'Login ke Aksara-Mart' : 'Daftar Akun Baru';
}

function openAuthModal(defaultTab = 'login') {
    switchAuthTab(defaultTab);
    document.getElementById('authModal').classList.add('open');
    document.getElementById('authOverlay').classList.add('open');
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('open');
    document.getElementById('authOverlay').classList.remove('open');
}

function showVerificationModal() {
    document.getElementById('verificationModal').classList.add('open');
    document.getElementById('verificationOverlay').classList.add('open');

    let timeLeft = 60;
    const countdownEl = document.getElementById('verificationCountdown');
    countdownEl.textContent = `Segera verifikasi email dalam ${timeLeft} detik`;

    const timer = setInterval(() => {
        timeLeft--;
        countdownEl.textContent = `Segera verifikasi email dalam ${timeLeft} detik`;

        if (timeLeft <= 0) {
            clearInterval(timer);
            closeVerificationModal();
            openAuthModal('login');
        }
    }, 1000);
}

function closeVerificationModal() {
    document.getElementById('verificationModal').classList.remove('open');
    document.getElementById('verificationOverlay').classList.remove('open');
}

// [REF: RPC v2_get_products]
async function fetchProductsFromSupabase() {
    try {
        document.getElementById('productsGrid').innerHTML = `
        <div class="col-span-full text-center py-8">
            <i class="fas fa-spinner fa-spin text-2xl text-purple-600 mb-3"></i>
            <p class="text-gray-600 text-sm">Memuat produk...</p>
        </div>
    `;

        // GANTI: Menggunakan RPC v2_get_products
        const { data, error } = await supabase.rpc('v2_get_products');

        if (error) {
            throw error;
        }

        products = data.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            category: item.category,
            barcode: item.barcode,
            image: item.image,
            stock: item.stock
        }));

        // Sorting tetap di JS untuk kemudahan kustomisasi kategori
        const categoryPriority = {
            "makanan": 1,
            "minuman": 2,
            "jasa printing": 3,
            "atk": 4
        };

        const getCategoryWeight = (cat) => {
            const c = (cat || "").toLowerCase().trim();
            return categoryPriority[c] || 99;
        };

        products.sort((a, b) => {
            const weightA = getCategoryWeight(a.category);
            const weightB = getCategoryWeight(b.category);

            if (weightA !== weightB) {
                return weightA - weightB;
            }

            const nameA = (a.name || "").toLowerCase();
            const nameB = (b.name || "").toLowerCase();

            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
            return 0;
        });

        renderProducts();

    } catch (error) {
        console.error(error);
    }
}

function renderProducts() {
    try {
        let filteredProducts = products;

        if (currentSearch && currentSearch.trim() !== '') {
            const keyword = currentSearch.toLowerCase();
            filteredProducts = products.filter(p =>
                p.name.toLowerCase().includes(keyword) ||
                (p.category && p.category.toLowerCase().includes(keyword))
            );
        } else if (currentCategory !== 'all') {
            filteredProducts = products.filter(p => p.category === currentCategory);
        }

        renderFilteredProducts(filteredProducts);
    } catch (error) {
        console.error('Error rendering products:', error);
    }
}

function renderFilteredProducts(filteredProducts) {
    const grid = document.getElementById('productsGrid');

    if (filteredProducts.length === 0) {
        grid.innerHTML = `
        <div class="col-span-full text-center py-8">
            <i class="fas fa-search text-3xl text-gray-400 mb-3"></i>
            <p class="text-gray-600 text-sm">Tidak ada produk ditemukan</p>
            <p class="text-gray-500 text-xs">Coba kata kunci lain atau pilih kategori berbeda</p>
        </div>
    `;
        return;
    }

    grid.innerHTML = filteredProducts.map(product => {
        return `
<div class="product-card" data-product-id="${product.id}">
<div class="product-image-wrapper">
    <img src="${product.image}" alt="${product.name}" class="product-image-fixed">
</div>
<div class="product-content">
    <h3 class="product-name">${product.name}</h3>
    <p class="product-price">Rp ${product.price.toLocaleString('id-ID')}</p>
    <p class="product-stock ${product.stock === 0 ? 'text-red-600 font-semibold' : 'text-gray-600'}">
        ${product.stock === 0 ? 'Stok Kosong' : `Stok: ${product.stock}`}
    </p>
</div>
</div>
`;
    }).join('');
}

function createFloatingItem(startX, startY, productId) {
    const cartBtn = document.getElementById('cartBtn');
    const cartBtnRect = cartBtn.getBoundingClientRect();
    const endX = cartBtnRect.left + cartBtnRect.width / 2;
    const endY = cartBtnRect.top + cartBtnRect.height / 2;

    const floatingItem = document.createElement('div');
    floatingItem.className = 'floating-item';
    floatingItem.innerHTML = '<i class="fas fa-plus"></i>';
    floatingItem.style.setProperty('--tx', `${endX - startX}px`);
    floatingItem.style.setProperty('--ty', `${endY - startY}px`);
    floatingItem.style.left = `${startX}px`;
    floatingItem.style.top = `${startY}px`;

    document.body.appendChild(floatingItem);

    setTimeout(() => {
        document.body.removeChild(floatingItem);
    }, 1000);
}

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = cart.find(item => item.id === productId);
    const currentQty = existingItem ? existingItem.quantity : 0;

    const availableStock = (product.stock === null || product.stock === undefined) ? Infinity : Number(product.stock);

    if (currentQty + 1 > availableStock) {
        showNotification(`Stok tidak mencukupi. Tersisa ${availableStock} item.`, 'error');
        return;
    }

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ ...product, quantity: 1 });
    }

    renderCart();
}

function addToCartWithAnimation(productId, element) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = cart.find(i => i.id === productId);
    const currentQty = existingItem ? existingItem.quantity : 0;
    const availableStock = (product.stock === null || product.stock === undefined) ? Infinity : Number(product.stock);

    if (availableStock <= 0) {
        showNotification('Stok habis, tidak bisa ditambahkan ke keranjang', 'error');
        return;
    }

    if (currentQty + 1 > availableStock) {
        showNotification(`Stok tidak mencukupi. Tersisa ${availableStock} item.`, 'error');
        return;
    }

    if (!currentUser) {
        showNotification('Silakan login terlebih dahulu', 'error');
        openAuthModal('login');
        return;
    }

    if (!isProfileComplete()) {
        showNotification('Lengkapi profil Anda sebelum menambah ke keranjang', 'error');
        openProfileModal();
        return;
    }

    const rect = element.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;

    element.classList.add('clicked');
    setTimeout(() => element.classList.remove('clicked'), 600);

    createFloatingItem(startX, startY, productId);

    addToCart(productId);
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    renderCart();
}

function updateQuantity(productId, change) {
    const item = cart.find(item => item.id === productId);
    if (!item) return;

    const product = products.find(p => p.id === productId) || item;
    const availableStock = (product.stock === null || product.stock === undefined) ? Infinity : Number(product.stock);

    if (change > 0 && item.quantity + change > availableStock) {
        showNotification(`Tidak bisa menambah. Stok tersisa ${availableStock} item.`, 'error');
        return;
    }

    item.quantity += change;

    if (item.quantity <= 0) {
        removeFromCart(productId);
    } else {
        renderCart();
    }
}

function renderCart() {
    const cartItems = document.getElementById('cartItems');
    const cartBadge = document.getElementById('cartBadge');
    const checkoutBtn = document.getElementById('checkoutBtn');
    const totalItems = cart.reduce((total, item) => total + item.quantity, 0);

    if (totalItems > 0) {
        cartBadge.textContent = totalItems;
        cartBadge.classList.remove('hidden');
        checkoutBtn.disabled = false;
    } else {
        cartBadge.classList.add('hidden');
        checkoutBtn.disabled = true;
    }

    if (cart.length === 0) {
        cartItems.innerHTML = `
        <div class="text-center text-gray-500 py-6">
            <i class="fas fa-shopping-cart text-2xl mb-2"></i>
            <p class="text-sm">Keranjang masih kosong</p>
        </div>
    `;
    } else {
        cartItems.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="flex items-center justify-between">
                <div class="flex-1">
                    <h4 class="cart-item-name">${item.name}</h4>
                    <p class="cart-item-price">Rp ${item.price.toLocaleString('id-ID')}</p>
                </div>
                <div class="flex items-center space-x-1">
                    <button onclick="updateQuantity(${item.id}, -1)" class="bg-red-500 text-white w-5 h-5 rounded text-xs hover:bg-red-600 transition-colors">-</button>
                    <span class="text-xs font-semibold w-6 text-center text-gray-800">${item.quantity}</span>
                    <button onclick="updateQuantity(${item.id}, 1)" class="bg-green-500 text-white w-5 h-5 rounded text-xs hover:bg-green-600 transition-colors">+</button>
                </div>
            </div>
        </div>
    `).join('');
    }

    updateTotals();
}

function updateTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = subtotal + deliveryFee;
    document.getElementById('total').textContent = `Rp ${total.toLocaleString('id-ID')}`;
}

function closeCartModal() {
    document.getElementById('cartModal').classList.remove('open');
    document.getElementById('cartOverlay').classList.remove('open');
}

function showSuccessModal(message) {
    document.getElementById('successMessage').textContent = message;
    document.getElementById('successModal').classList.add('open');
    document.getElementById('successOverlay').classList.add('open');
}

function closeSuccessModal() {
    document.getElementById('successModal').classList.remove('open');
    document.getElementById('successOverlay').classList.remove('open');
}

function closeDeliveryModal() {
    document.getElementById('deliveryModal').classList.remove('open');
    document.getElementById('deliveryOverlay').classList.remove('open');
}

function closeQrisModal() {
    document.getElementById('qrisModal').classList.remove('open');
    document.getElementById('qrisOverlay').classList.remove('open');

    document.getElementById('proofUpload').value = '';
    document.getElementById('proofPreview').style.display = 'none';
    document.getElementById('confirmQris').disabled = true;

    const proofLabel = document.querySelector('.proof-upload-label');
    if (proofLabel) {
        proofLabel.textContent = 'Upload Bukti Pembayaran';
    }
}

document.getElementById("cancelQris")?.addEventListener("click", closeQrisModal);

const proofInput = document.getElementById('proofUpload');
const confirmBtn = document.getElementById('confirmQris');
const previewImg = document.getElementById('previewImage');
const previewBox = document.getElementById('proofPreview');
const proofLabel = document.querySelector('.proof-upload-label');
const removeProofBtn = document.getElementById('removeProof');

if (removeProofBtn) {
    removeProofBtn.style.display = 'none';
}

if (proofInput) {
    proofInput.addEventListener('change', function () {
        if (this.files && this.files.length > 0) {
            if (proofLabel) {
                proofLabel.textContent = 'Ubah File Bukti';
            }

            const file = this.files[0];
            const reader = new FileReader();
            reader.onload = function (e) {
                previewImg.src = e.target.result;
                previewBox.style.display = 'block';
            };
            reader.readAsDataURL(file);

            confirmBtn.disabled = false;
        } else {
            if (proofLabel) {
                proofLabel.textContent = 'Upload Bukti Pembayaran';
            }

            previewBox.style.display = 'none';
            confirmBtn.disabled = true;
        }
    });
}

// [REF: RPC v2_get_customer_profile] - PERBAIKAN
async function fetchUserProfile() {
    try {
        if (!currentUser) return;

        console.log('Fetching profile for:', currentUser.email);
        
        // GANTI: Menggunakan RPC v2_get_customer_profile
        const { data: customerData, error: customerError } = await supabase
            .rpc('v2_get_customer_profile', { p_email: currentUser.email });

        if (customerError) {
            console.error('Error fetching profile:', customerError);
            
            // Jika tidak ada profil, set null
            if (customerError.code === 'PGRST116' || customerError.message?.includes('No profile found')) {
                userProfile = null;
                console.log('Profil belum ada, akan dibuat saat update pertama');
            } else {
                throw customerError;
            }
        } else {
            // RPC mengembalikan array, ambil elemen pertama
            userProfile = Array.isArray(customerData) ? customerData[0] : customerData;
            console.log('Profile loaded:', userProfile);
        }
    } catch (error) {
        console.error('Error fetching user profile:', error);
        // Jangan tampilkan notifikasi error di sini agar tidak mengganggu UX
    }
}
function updateUIAfterLogin() {
    console.log('updateUIAfterLogin called');
    
    const profileText = document.getElementById('profileText');
    const editProfileBtn = document.getElementById('editProfileBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (profileText) {
        profileText.textContent = 'Profil';
    }
    
    if (editProfileBtn) {
        editProfileBtn.classList.remove('hidden');
    }
    
    if (logoutBtn) {
        logoutBtn.classList.remove('hidden');
        logoutBtn.innerHTML = originalLogoutHtml; 
        logoutBtn.disabled = false;
    }
    
    // Update field di modal profil (jika ada)
    if (userProfile) {
        console.log('Updating profile fields with:', userProfile);
        const profileName = document.getElementById('profileName');
        const profileEmail = document.getElementById('profileEmail');
        const profilePhone = document.getElementById('profilePhone');
        const profileRole = document.getElementById('profileRole');
        const profileOffice = document.getElementById('profileOffice');
        const profileClass = document.getElementById('profileClass');
        
        if (profileName) profileName.value = userProfile.name || '';
        if (profileEmail) profileEmail.value = currentUser.email;
        if (profilePhone) profilePhone.value = userProfile.telp_number || '';
        if (profileRole) profileRole.value = userProfile.role || 'siswa';
        
        if (userProfile.role === 'guru') {
            if (profileOffice) profileOffice.value = userProfile.place || '';
        } else {
            if (profileClass) profileClass.value = userProfile.place || '';
        }
        
        toggleRoleFields(userProfile.role || 'siswa');
    } else {
        console.log('No user profile, setting defaults');
        // Isi dengan data default jika profil belum ada
        const profileName = document.getElementById('profileName');
        const profileEmail = document.getElementById('profileEmail');
        const profilePhone = document.getElementById('profilePhone');
        const profileRole = document.getElementById('profileRole');
        
        if (profileName) profileName.value = '';
        if (profileEmail) profileEmail.value = currentUser.email;
        if (profilePhone) profilePhone.value = '';
        if (profileRole) profileRole.value = 'siswa';
        
        toggleRoleFields('siswa');
    }
}

function updateUIAfterLogout() {
    console.log("[auth] updating UI for logout");
    currentUser = null;
    userProfile = null;
    updateBadge(null);

    const profileText = document.getElementById('profileText');
    if (profileText) {
        profileText.textContent = 'Login';
    }

    const editProfileBtn = document.getElementById('editProfileBtn');
    if (editProfileBtn) {
        editProfileBtn.classList.add('hidden');
    }
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.classList.add('hidden');
        logoutBtn.innerHTML = originalLogoutHtml;
        logoutBtn.disabled = false;
    }

    const profileMenu = document.getElementById('profileMenu');
    if (profileMenu) {
        profileMenu.classList.add('hidden');
    }
    
    if (customerChannel) {
        try { 
            customerChannel.unsubscribe(); 
            console.log("[customerChannel] unsubscribed on logout");
        } catch (e) { 
            console.warn("[customerChannel] unsub err", e); 
        }
        customerChannel = null;
    }
}

function toggleRoleFields(role) {
    console.log('Toggling role fields for:', role);
    
    const officeField = document.getElementById('profileOfficeField');
    const classField = document.getElementById('profileClassField');
    
    if (role === 'guru') {
        if (officeField) officeField.classList.remove('hidden');
        if (classField) classField.classList.add('hidden');
    } else {
        if (officeField) officeField.classList.add('hidden');
        if (classField) classField.classList.remove('hidden');
    }
}

function isProfileComplete() {
    if (!userProfile) return false;

    const requiredFields = ['name', 'role', 'place'];
    for (const field of requiredFields) {
        if (!userProfile[field]) return false;
    }

    return true;
}

function openProfileModal() {
    if (!currentUser) {
        openAuthModal('login');
        return;
    }

    console.log('Opening profile modal, userProfile:', userProfile);
    
    // Refresh data profil sebelum membuka modal
    fetchUserProfile().then(() => {
        // Setelah data diambil, isi field
        if (userProfile) {
            document.getElementById('profileName').value = userProfile.name || '';
            document.getElementById('profileEmail').value = currentUser.email;
            document.getElementById('profilePhone').value = userProfile.telp_number || '';
            document.getElementById('profileRole').value = userProfile.role || 'siswa';

            if (userProfile.role === 'guru') {
                document.getElementById('profileOffice').value = userProfile.place || '';
            } else {
                document.getElementById('profileClass').value = userProfile.place || '';
            }

            toggleRoleFields(userProfile.role || 'siswa');
        } else {
            // Jika profil belum ada, isi dengan default
            document.getElementById('profileName').value = '';
            document.getElementById('profileEmail').value = currentUser.email;
            document.getElementById('profilePhone').value = '';
            document.getElementById('profileRole').value = 'siswa';
            document.getElementById('profileOffice').value = '';
            document.getElementById('profileClass').value = '';

            toggleRoleFields('siswa');
        }
    }).catch(error => {
        console.error('Error loading profile for modal:', error);
    });

    document.getElementById('profileModal').classList.add('open');
    document.getElementById('profileOverlay').classList.add('open');
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.remove('open');
    document.getElementById('profileOverlay').classList.remove('open');
}

// [REF: RPC v2_upsert_customer_profile] - PERBAIKAN (tanpa id_user)
async function saveProfile(event) {
    event.preventDefault();
    
    if (!currentUser) {
        showNotification("Anda harus login dulu", "error");
        return;
    }

    console.log('Saving profile...');
    
    // Tampilkan loading state
    const submitBtn = document.querySelector("#profileForm button[type='submit']");
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    submitBtn.disabled = true;

    try {
        // Ambil nilai dari form
        const name = document.getElementById("profileName").value;
        const phone = document.getElementById("profilePhone").value;
        const role = document.getElementById("profileRole").value;
        const place = role === "guru" 
            ? document.getElementById("profileOffice").value 
            : document.getElementById("profileClass").value;

        console.log('Profile data to save:', {
            p_name: name,
            p_email: currentUser.email,
            p_telp: phone,
            p_role: role,
            p_place: place
        });

        // GANTI: Menggunakan RPC v2_upsert_customer_profile TANPA p_user_id
        const { data, error } = await supabase.rpc('v2_upsert_customer_profile', {
            p_name: name,
            p_email: currentUser.email,
            p_telp: phone,
            p_role: role,
            p_place: place
            // HAPUS: p_user_id: currentUser.id (karena kolom tidak ada)
        });

        if (error) {
            console.error("Update profile error:", error);
            showNotification("Gagal update profil: " + error.message, "error");
            return;
        }

        console.log('Profile saved successfully:', data);
        
        // Refresh profil user
        await fetchUserProfile();
        
        showNotification("Profil berhasil diperbarui!", "success");
        
        // Tunggu sebentar sebelum menutup modal
        setTimeout(() => {
            closeProfileModal();
        }, 300);

    } catch (error) {
        console.error("Update profile exception:", error);
        showNotification("Terjadi kesalahan saat update profil: " + error.message, "error");
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}
// Attach event listener untuk form profile
document.addEventListener('DOMContentLoaded', function() {
    const profileForm = document.getElementById("profileForm");
    if (profileForm) {
        // Hapus event listener lama jika ada
        profileForm.removeEventListener("submit", saveProfile);
        // Tambah event listener baru
        profileForm.addEventListener("submit", saveProfile);
        console.log('Profile form event listener attached');
    }
});

// [REF: RPC v2_get_order_history]
async function fetchOrderHistory() {
    const historyList = document.getElementById('historyList');

    try {
        if (!currentUser) {
            historyList.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-exclamation-circle text-2xl text-red-500 mb-3"></i>
                    <p class="text-gray-600 text-sm">Silakan login untuk melihat riwayat</p>
                </div>
            `;
            return;
        }

        historyList.innerHTML = `
            <div class="text-center py-8">
                <i class="fas fa-spinner fa-spin text-2xl text-purple-600 mb-3"></i>
                <p class="text-gray-600 text-sm">Memuat riwayat...</p>
            </div>
        `;

        // GANTI: Menggunakan RPC v2_get_order_history
        const { data: orders, error } = await supabase
            .rpc('v2_get_order_history', { p_email: currentUser.email });

        if (error) throw error;

        if (!orders || orders.length === 0) {
            historyList.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-shopping-bag text-3xl text-gray-400 mb-3"></i>
                    <p class="text-gray-600 text-sm">Belum ada riwayat pembelian</p>
                </div>
            `;
            return;
        }

        renderOrderHistory(orders);
    } catch (error) {
        console.error('Error fetching order history:', error);
        historyList.innerHTML = `
            <div class="text-center py-8">
                <i class="fas fa-exclamation-triangle text-2xl text-red-500 mb-3"></i>
                <p class="text-gray-600 text-sm">Gagal memuat riwayat pesanan</p>
                <button onclick="fetchOrderHistory()" class="mt-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-xs">
                    <i class="fas fa-refresh mr-1"></i> Coba Lagi
                </button>
            </div>
        `;
        showNotification('Gagal memuat riwayat pesanan', 'error');
    }
}

function renderOrderHistory(orders) {
    const historyList = document.getElementById('historyList');

    if (!orders || orders.length === 0) {
        historyList.innerHTML = `
            <div class="text-center py-8">
                <i class="fas fa-shopping-bag text-3xl text-gray-400 mb-3"></i>
                <p class="text-gray-600 text-sm">Belum ada riwayat pembelian</p>
                <p class="text-gray-500 text-xs">Mulai berbelanja untuk melihat riwayat di sini</p>
            </div>
        `;
        return;
    }

    historyList.innerHTML = orders.map(order => {
        const rawDate = order.order_date || order.created_at || null;
        const orderDate = rawDate ? new Date(rawDate) : null;
        const formattedDate = orderDate
            ? orderDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
            : '-';
        const formattedTime = orderDate
            ? orderDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            : '';

        let statusColor = 'bg-gray-100 text-gray-800';
        let statusText = order.status || 'Tidak diketahui';

        const status = (order.status || '').toLowerCase();
        if (['selesai', 'completed', 'done', 'finish'].includes(status)) {
            statusColor = 'bg-green-100 text-green-800';
            statusText = 'Selesai';
        } else if (['pending', 'diproses', 'process', 'processing'].includes(status)) {
            statusColor = 'bg-yellow-100 text-yellow-800';
            statusText = 'Diproses';
        } else if (['rejected', 'ditolak'].includes(status)) {
            statusColor = 'bg-red-100 text-red-800';
            statusText = 'Ditolak';
        } else if (['canceled', 'dibatalkan', 'batal'].includes(status)) {
            statusColor = 'bg-orange-100 text-orange-800';
            statusText = 'Dibatalkan';
        }

        const subtotal = Number(order.subtotal || 0);
        const deliveryFee = Number(order.delivery_fee || 0);
        const total = subtotal + deliveryFee;

let cancelButton = '';
if (['pending', 'diproses', 'process', 'processing'].includes(status) && order.orders_number) {
    cancelButton = `
        <div class="mt-2">
            <button onclick="cancelOrder('${order.orders_number}')" class="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs rounded-lg font-medium transition-colors inline-flex items-center">
                <i class="fas fa-times-circle mr-1"></i> Batalkan Pesanan
            </button>
        </div>
    `;
}

        return `
            <div class="history-item border-b border-gray-200 py-4">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <p class="font-medium text-sm">${order.orders_number || 'Tanpa Nomor'}</p>
                        <p class="text-xs text-gray-500">${formattedDate}${formattedTime ? ', ' + formattedTime : ''}</p>
                    </div>
                    <span class="${statusColor} text-xs font-medium px-2.5 py-0.5 rounded">${statusText}</span>
                </div>
                <div class="text-sm">
                    <p class="mb-1">${order.product_list || 'Tidak ada detail produk'}</p>
                    <div class="flex justify-between items-center mt-2">
                        <span class="text-gray-600">${order.payment_methode === 'qris' ? 'QRIS' : 'Tunai'}</span>
                        <span class="font-semibold">Rp ${total.toLocaleString('id-ID')}</span>
                    </div>
                    ${cancelButton}
                </div>
            </div>
        `;
    }).join('');
}

// ==============================
// ❌ FUNGSI cancelOrder
// ==============================
function cancelOrder(ordersNumber) {
    if (!ordersNumber) {
        alert("orders_number tidak valid");
        return;
    }
    
    // Tampilkan modal konfirmasi yang baru
    showCancelConfirmModal(ordersNumber);
}

// ==============================
// FUNGSI processCancelOrder (REFACTORED TO RPC)
// ==============================
async function processCancelOrder(ordersNumber) {
    try {
        console.log("Membatalkan pesanan via RPC:", ordersNumber);

        // GANTI: Menggunakan RPC v2_cancel_order
        // Ini menggantikan logika looping manual di sisi client yang berbahaya
        const { data, error } = await supabase.rpc('v2_cancel_order', {
            p_order_number: ordersNumber
        });

        if (error) throw error;

        // Cek hasil dari RPC (karena return JSONB)
        if (data && data.success) {
            showNotification(data.message, "success");
            
            // Refresh riwayat pembelian
            setTimeout(() => {
                fetchOrderHistory();
            }, 500);
        } else {
            showNotification(data?.message || "Gagal membatalkan pesanan", "error");
        }

    } catch (err) {
        console.error(err);
        showNotification("Terjadi kesalahan: " + err.message, "error");
    }
}


function closeHistoryModal() {
    document.getElementById('historyModal').classList.remove('open');
    document.getElementById('historyOverlay').classList.remove('open');
}

function getJakartaTimestamp() {
    const now = new Date();
    const jakartaTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    return jakartaTime.toISOString();
}

function generateOrderNumber() {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return 'ORD-' + timestamp + random;
}

async function compressImage(file, maxSizeKB = 70, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onload = () => {
            const img = new Image();
            img.src = reader.result;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");

                const maxWidth = 800;
                let { width, height } = img;
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                let outputQuality = quality;
                function tryCompress() {
                    canvas.toBlob(
                        (blob) => {
                            if (!blob) return reject("Gagal kompres gambar");
                            if (blob.size / 1024 <= maxSizeKB || outputQuality <= 0.3) {
                                const compressedFile = new File(
                                    [blob],
                                    file.name.replace(/\.[^/.]+$/, "") + ".webp",
                                    { type: "image/webp" }
                                );
                                resolve(compressedFile);
                            } else {
                                outputQuality -= 0.1;
                                tryCompress();
                            }
                        },
                        "image/webp",
                        outputQuality
                    );
                }
                tryCompress();
            };
        };
        reader.onerror = (err) => reject(err);
    });
}

// Checkout (Menggunakan Existing RPC v2_create_order - SESUAI INSTRUKSI)
async function processCheckout(paymentMethod, deliveryOption, deliveryNote) {
    if (isCheckoutInProgress) {
        console.log('Checkout sudah dalam proses, abaikan klik berulang');
        return false;
    }

    if (!currentUser) {
        showNotification('Silakan login terlebih dahulu', 'error');
        openAuthModal('login');
        return false;
    }

    if (!isProfileComplete()) {
        showNotification('Lengkapi profil Anda sebelum melakukan transaksi', 'error');
        openProfileModal();
        return false;
    }

    if (cart.length === 0) {
        showNotification('Keranjang belanja kosong', 'error');
        return false;
    }

    isCheckoutInProgress = true;

    const checkoutBtn = document.getElementById('checkoutBtn');
    const originalText = checkoutBtn ? checkoutBtn.innerHTML : '';
    if (checkoutBtn) {
        checkoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';
        checkoutBtn.disabled = true;
    }

    try {
        const rpcPayload = {
            cart_items: cart,
            user_id_in: currentUser.id,
            profile_data_in: userProfile,
            payment_method_in: paymentMethod,
            delivery_option_in: deliveryOption,
            delivery_note_in: deliveryNote
        };

        console.log("Memanggil RPC v2_create_order...");
        const { data: orderResult, error: rpcError } = await supabase.rpc(
            'v2_create_order',
            rpcPayload
        );

        if (rpcError) {
            if (rpcError.message.includes('Stok tidak cukup')) {
                throw new Error(rpcError.message.split('ERROR: ').pop());
            }
            throw new Error(`Gagal membuat pesanan (RPC): ${rpcError.message}`);
        }
        if (!orderResult) {
            throw new Error('Gagal membuat pesanan (RPC): Tidak ada data dikembalikan');
        }
        
        console.log("RPC v2_create_order berhasil:", orderResult);

        if (paymentMethod !== 'qris') {
            let message = `Pesanan #${orderResult.order_number} berhasil diproses!`;
            if (deliveryOption === 'delivery') {
                message += ' (Diantar - Biaya Rp 1.000)';
            } else {
                message += ' (Ambil Sendiri)';
            }
            message += ` Metode pembayaran: Tunai.`;
            
            showSuccessModal(message);
        }
        
        cart = [];
        renderCart();
        fetchProductsFromSupabase();

        return orderResult;

    } catch (error) {
        console.error('Checkout error:', error);

        let errorMessage = error.message || 'Checkout gagal. Silakan coba lagi.';
        if (errorMessage.includes('Error creating order:')) {
            errorMessage = errorMessage.split('Error creating order:').pop().trim();
        }
        if (errorMessage.includes('VMError:')) {
            errorMessage = errorMessage.split('VMError:').pop().trim();
        }
        
        showNotification(errorMessage, 'error');
        return false;

    } finally {
        if (checkoutBtn) {
            checkoutBtn.innerHTML = originalText;
            checkoutBtn.disabled = cart.length === 0;
        }
        isCheckoutInProgress = false;
    }
}

function getProductListString(cart) {
    return cart.map(item => item.name).join(', ');
}

function setupEventListeners() {
    const $ = (id) => document.getElementById(id);

    // Setup event listeners untuk modal cancel yang baru
    setupCancelModalListeners();

    // Profile menu toggle
    const profileBtn = $('profileBtn');
    if (profileBtn) {
        profileBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (currentUser) {
                const menu = $('profileMenu');
                if (menu) menu.classList.toggle('hidden');
            } else {
                openAuthModal('login');
            }
        });
    }

    document.addEventListener('click', function (e) {
        const profileMenu = $('profileMenu');
        const profileBtnEl = $('profileBtn');
        if (profileMenu && profileBtnEl && !profileMenu.contains(e.target) && !profileBtnEl.contains(e.target)) {
            profileMenu.classList.add('hidden');
            const si = $('searchInfo');
            if (si) si.classList.add('hidden');
        }
    });

    // LOGIN
    const loginForm = $('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const email = $('loginEmail').value;
            const password = $('loginPassword').value;
            const loginErrorEl = $('loginError');

            if (loginErrorEl) {
                loginErrorEl.classList.add('hidden');
                loginErrorEl.textContent = '';
            }

            const submitBtn = loginForm.querySelector('button[type="submit"]');
            const btnText = $('loginButtonText');
            const btnSpinner = $('loginSpinner');

            if (btnText) btnText.classList.add('hidden');
            if (btnSpinner) btnSpinner.classList.remove('hidden');
            if (submitBtn) submitBtn.disabled = true;
            const start = Date.now();

            try {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });

                if (error) throw error;

                showNotification('Login berhasil!', 'success');

                const elapsed = Date.now() - start;
                const remaining = 1000 - elapsed;
                setTimeout(() => {
                    if (btnText) btnText.classList.remove('hidden');
                    if (btnSpinner) btnSpinner.classList.add('hidden');
                    if (submitBtn) submitBtn.disabled = false;
                    closeAuthModal();
                }, remaining > 0 ? remaining : 0);

            } catch (error) {
                let errorMessage = "Login gagal, silakan coba lagi.";
                if (error.message && error.message.includes("Invalid login credentials")) {
                    errorMessage = "Email atau password salah.";
                } else if (error.message && error.message.includes("Network error")) {
                    errorMessage = "Tidak bisa terhubung ke server, coba lagi nanti.";
                }

                showNotification(errorMessage, 'error');

                if (loginErrorEl) {
                    loginErrorEl.textContent = errorMessage;
                    loginErrorEl.classList.remove('hidden');
                }

                const elapsed = Date.now() - start;
                const remaining = 1000 - elapsed;
                setTimeout(() => {
                    if (btnText) btnText.classList.remove('hidden');
                    if (btnSpinner) btnSpinner.classList.add('hidden');
                    if (submitBtn) submitBtn.disabled = false;
                }, remaining > 0 ? remaining : 0);
            }
        });
    }

    // REGISTER (Using RPC for profile creation)
    const registerForm = $('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            if (!validatePassword()) {
                const pr = $('passwordRules');
                if (pr) pr.classList.add('show');
                showNotification('Password tidak memenuhi persyaratan keamanan', 'error');
                return;
            }

            const email = $('registerEmail').value;
            const password = $('registerPassword').value;
            const fullName = $('registerName').value;
            const registerErrorEl = $('registerError');

            if (registerErrorEl) {
                registerErrorEl.classList.add('hidden');
                registerErrorEl.textContent = '';
            }

            const submitBtn = registerForm.querySelector('button[type="submit"]');
            const btnText = $('registerButtonText');
            const btnSpinner = $('registerSpinner');

            if (btnText) btnText.classList.add('hidden');
            if (btnSpinner) btnSpinner.classList.remove('hidden');
            if (submitBtn) submitBtn.disabled = true;

            try {
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: { full_name: fullName }
                    }
                });

                if (error) throw error;

                // GANTI: Menggunakan RPC v2_create_customer_profile
                // Untuk konsistensi penggunaan RPC
                const { error: profileError } = await supabase.rpc('v2_create_customer_profile', {
                    p_name: fullName,
                    p_email: email,
                    p_telp: '',
                    p_role: 'siswa',
                    p_place: ''
                });

                if (profileError) {
                    console.error('Error creating customer profile:', profileError);
                    showNotification('Pendaftaran berhasil tetapi gagal membuat profil.', 'warning');
                }

                showVerificationModal();
                closeAuthModal();
            } catch (error) {
                let errorMessage = "Pendaftaran gagal. Silakan coba lagi.";
                if (error.message && error.message.includes("duplicate key")) {
                    errorMessage = "Email sudah terdaftar.";
                } else if (error.message && error.message.includes("Network error")) {
                    errorMessage = "Tidak bisa terhubung ke server, coba lagi nanti.";
                }

                showNotification(errorMessage, 'error');

                if (registerErrorEl) {
                    registerErrorEl.textContent = errorMessage;
                    registerErrorEl.classList.remove('hidden');
                }
            } finally {
                if (btnText) btnText.classList.remove('hidden');
                if (btnSpinner) btnSpinner.classList.add('hidden');
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    // Close verification modal
    const closeVerification = $('closeVerification');
    if (closeVerification) closeVerification.addEventListener('click', function () {
        closeVerificationModal();
        openAuthModal('login');
    });
    const verificationOverlay = $('verificationOverlay');
    if (verificationOverlay) verificationOverlay.addEventListener('click', function () {
        closeVerificationModal();
        openAuthModal('login');
    });

    // Auth tab switching
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            const tabName = this.dataset.tab;
            switchAuthTab(tabName);
        });
    });

    // Cancel auth buttons / overlay
    const cancelAuth = $('cancelAuth');
    if (cancelAuth) cancelAuth.addEventListener('click', closeAuthModal);
    const cancelRegister = $('cancelRegister');
    if (cancelRegister) cancelRegister.addEventListener('click', closeAuthModal);
    const authOverlay = $('authOverlay');
    if (authOverlay) authOverlay.addEventListener('click', closeAuthModal);

    // Logout
    const logoutBtn = $('logoutBtn');
    if (logoutBtn) {
        originalLogoutHtml = logoutBtn.innerHTML;

        logoutBtn.addEventListener('click', async function (e) {
            e.preventDefault();
            
            let success = false;
            
            try {
                logoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging out...';
                logoutBtn.disabled = true;

                const { error } = await supabase.auth.signOut();
                if (error) throw error;

                showNotification('Anda telah logout', 'success');
                success = true;

            } catch (error) {
                showNotification('Logout gagal: ' + (error.message || ''), 'error');
                console.error("[logout] error:", error);
                
            } finally {
                if (!success) {
                    logoutBtn.innerHTML = originalLogoutHtml;
                    logoutBtn.disabled = false;
                }
            }
        });
    }

    // Cart modal toggle
    const cartBtn = $('cartBtn');
    if (cartBtn) {
        cartBtn.addEventListener('click', function () {
            if (!currentUser) {
                showNotification('Silakan login terlebih dahulu', 'error');
                openAuthModal('login');
                return;
            }
            if (!isProfileComplete()) {
                showNotification('Lengkapi profil Anda sebelum melakukan transaksi', 'error');
                openProfileModal();
                return;
            }
            $('cartModal')?.classList.add('open');
            $('cartOverlay')?.classList.add('open');
        });
    }

    $('closeCart')?.addEventListener('click', closeCartModal);
    $('cartOverlay')?.addEventListener('click', closeCartModal);

    // Edit profile
    $('editProfileBtn')?.addEventListener('click', function (e) {
        e.preventDefault();
        $('profileMenu')?.classList.add('hidden');
        openProfileModal();
    });

    $('cancelEditProfile')?.addEventListener('click', closeProfileModal);
    $('profileOverlay')?.addEventListener('click', closeProfileModal);

    // Role selection change
    const profileRoleSelect = $('profileRole');
    if (profileRoleSelect) {
        profileRoleSelect.addEventListener('change', function () {
            toggleRoleFields(this.value);
        });
    }

    // Payment method selection
    $('paymentSelect')?.addEventListener('change', function () {
        paymentMethod = this.value;
    });

    // Checkout button (open delivery options)
    $('checkoutBtn')?.addEventListener('click', function () {
        if (!currentUser) {
            showNotification('Silakan login terlebih dahulu', 'error');
            openAuthModal('login');
            return;
        }
        if (!isProfileComplete()) {
            showNotification('Lengkapi profil Anda sebelum melakukan transaksi', 'error');
            openProfileModal();
            return;
        }

        closeCartModal();
        $('deliveryModal')?.classList.add('open');
        $('deliveryOverlay')?.classList.add('open');
    });

    // Delivery options click handling
    document.querySelectorAll('.delivery-option').forEach(option => {
        option.addEventListener('click', function () {
            document.querySelectorAll('.delivery-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            const radio = this.querySelector('input[type="radio"]');
            if (radio) {
                radio.checked = true;
                deliveryOption = radio.value;
            }
        });
    });

    // Confirm Delivery (Tunai / QRIS) + Tombol Batal
    $('confirmDelivery')?.addEventListener('click', async function () {
        const deliveryNote = $('deliveryNote') ? $('deliveryNote').value : '';
        deliveryFee = (deliveryOption === 'delivery') ? 1000 : 0;

        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const total = subtotal + deliveryFee;

        if (paymentMethod === 'tunai') {
            await processCheckout('tunai', deliveryOption, deliveryNote);
            closeDeliveryModal();
            return;
        }

        if (paymentMethod === 'qris') {
            $('qrisTotal').textContent = `Rp ${total.toLocaleString('id-ID')}`;
            $('qrisModal')?.classList.add('open');
            $('qrisOverlay')?.classList.add('open');
            closeDeliveryModal();
            return;
        }
    });

    $('cancelDelivery')?.addEventListener('click', function () {
        closeDeliveryModal();
    });

    // Confirm QRIS payment
    const confirmQrisBtn = $('confirmQris');
    if (confirmQrisBtn) {
        confirmQrisBtn.addEventListener('click', async function () {
            const confirmBtn = this;
            const originalText = "Konfirmasi Pembayaran";
            const proofInput = $('proofUpload');

            if (!proofInput || !proofInput.files || proofInput.files.length === 0) {
                showNotification('Silakan upload bukti pembayaran terlebih dahulu', 'error');
                return;
            }

            confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';
            confirmBtn.disabled = true;

            let orderId = null;
            let orderNumber = null;

            try {
                const deliveryNote = $('deliveryNote') ? $('deliveryNote').value : '';
                
                const orderResult = await processCheckout('qris', deliveryOption, deliveryNote);
                
                if (!orderResult || !orderResult.order_id) {
                    throw new Error('Gagal membuat pesanan. Silakan coba lagi.');
                }

                orderId = orderResult.order_id;
                orderNumber = orderResult.order_number;
                
                console.log('Order Number dari RPC:', orderNumber);
                
                const file = proofInput.files[0];
                const compressedFile = await compressImage(file, 70);

                const fileName = `qris_${orderNumber.replace('ORD-', '')}.webp`;
                console.log('Nama file yang akan diupload:', fileName);

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('Qris_image')
                    .upload(fileName, compressedFile, { cacheControl: '3600', upsert: true });

                if (uploadError) {
                    console.error('Upload error:', uploadError);
                    throw new Error('Gagal mengunggah bukti pembayaran: ' + uploadError.message);
                }

                const { data: publicUrlData } = await supabase.storage
                    .from('Qris_image')
                    .getPublicUrl(fileName);

                const qrisUrl = publicUrlData?.publicUrl || null;
                if (!qrisUrl) throw new Error('Gagal mendapatkan URL publik file');

                const { error: rpcError } = await supabase.rpc(
                    'v2_confirm_qris_payment',
                    {
                        order_id_to_update: orderId,
                        qris_public_url: qrisUrl
                    }
                );

                if (rpcError) {
                    console.error('Update order (RPC) error:', rpcError);
                    throw new Error('Gagal memperbarui referensi QRIS (RPC): ' + rpcError.message);
                }

                closeQrisModal();

                let successMessage = `Pesanan #${orderNumber} berhasil dibuat! Bukti pembayaran telah diunggah dan sedang menunggu verifikasi.`;
                showSuccessModal(successMessage);

            } catch (err) {
                console.error('QRIS checkout/upload error:', err);
                showNotification('Gagal proses QRIS: ' + (err.message || 'Error tidak diketahui'), 'error');
                
                if (orderId) {
                    showNotification('Pesanan dibuat, tapi upload bukti gagal. Hubungi admin.', 'error');
                    closeQrisModal();
                }

            } finally {
                confirmBtn.innerHTML = originalText;
                
                if (proofInput) proofInput.value = '';
                const previewBox = $('proofPreview');
                if (previewBox) previewBox.style.display = 'none';
                
                const proofLabel = document.querySelector('.proof-upload-label');
                if (proofLabel) {
                    proofLabel.textContent = 'Upload Bukti Pembayaran';
                }

                confirmBtn.disabled = true;
            }
        });
    }

    // Success modal close
    $('closeSuccess')?.addEventListener('click', closeSuccessModal);
    $('successOverlay')?.addEventListener('click', closeSuccessModal);

    // History modal
    $('historyBtn')?.addEventListener('click', function () {
        if (!currentUser) {
            showNotification('Silakan login terlebih dahulu', 'error');
            openAuthModal('login');
            return;
        }
        $('historyModal')?.classList.add('open');
        $('historyOverlay')?.classList.add('open');
        fetchOrderHistory();
    });
    $('closeHistory')?.addEventListener('click', closeHistoryModal);
    $('historyOverlay')?.addEventListener('click', closeHistoryModal);

    // Category buttons
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentCategory = this.dataset.category;
            const sp = $('searchProduct');
            if (sp) sp.value = '';
            $('clearSearch')?.classList.add('hidden');
            renderProducts();

            if (window.innerWidth <= 768) {
                const tooltip = $('categoryTooltipMobile');
                if (tooltip) {
                    tooltip.textContent = this.dataset.tooltip;
                    tooltip.classList.add('show');
                    setTimeout(() => tooltip.classList.remove('show'), 1000);
                }
            }
        });
    });
    // Filter toggles
    $('filterToggleDesktop')?.addEventListener('click', function () {
        $('categoryFilter')?.classList.toggle('hidden');
        this.classList.toggle('active');
    });

    $('filterToggleMobile')?.addEventListener('click', function () {
        $('categoryFilter')?.classList.toggle('hidden');
        this.classList.toggle('active');
    });

    // Search
    const searchInput = document.getElementById('searchProduct');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            currentSearch = this.value; // Store for consistency
            const searchTerm = this.value.toLowerCase().trim();
            const clearBtn = document.getElementById('clearSearch');
            const searchInfo = document.getElementById('searchInfo');
            const searchResultText = document.getElementById('searchResultText');

            if (searchTerm) clearBtn?.classList.remove('hidden');
            else clearBtn?.classList.add('hidden');

            if (!searchTerm) {
                searchInfo?.classList.add('hidden');
                renderProducts();
                return;
            }

            const filteredProducts = products.filter(p =>
                p.name.toLowerCase().includes(searchTerm) ||
                (p.category && p.category.toLowerCase().includes(searchTerm))
            );

            searchInfo?.classList.remove('hidden');
            if (searchResultText) {
                searchResultText.textContent =
                    `Ditemukan ${filteredProducts.length} produk untuk "${this.value}"`;
            }
            renderFilteredProducts(filteredProducts);
        });
    }

    document.getElementById('clearSearch')?.addEventListener('click', function () {
        document.getElementById('searchProduct').value = '';
        currentSearch = '';
        this.classList.add('hidden');
        document.getElementById('searchInfo')?.classList.add('hidden');
        renderProducts();
    });

    const searchInputMobile = document.getElementById('searchProductMobile');
    if (searchInputMobile) {
        searchInputMobile.addEventListener('input', function () {
            currentSearch = this.value; // Store for consistency
            const searchTerm = this.value.toLowerCase().trim();
            const clearBtn = document.getElementById('clearSearchMobile');
            const searchInfo = document.getElementById('searchInfo');
            const searchResultText = document.getElementById('searchResultText');

            if (searchTerm) clearBtn?.classList.remove('hidden');
            else clearBtn?.classList.add('hidden');

            if (!searchTerm) {
                searchInfo?.classList.add('hidden');
                renderProducts();
                return;
            }

            const filteredProducts = products.filter(p =>
                p.name.toLowerCase().includes(searchTerm) ||
                (p.category && p.category.toLowerCase().includes(searchTerm))
            );

            searchInfo?.classList.remove('hidden');
            if (searchResultText) {
                searchResultText.textContent =
                    `Ditemukan ${filteredProducts.length} produk untuk "${this.value}"`;
            }
            renderFilteredProducts(filteredProducts);
        });
    }

    document.getElementById('clearSearchMobile')?.addEventListener('click', function () {
        document.getElementById('searchProductMobile').value = '';
        currentSearch = '';
        this.classList.add('hidden');
        document.getElementById('searchInfo')?.classList.add('hidden');
        renderProducts();
    });

    document.getElementById('clearSearchResults')?.addEventListener('click', function () {
        const inputDesktop = document.getElementById('searchProduct');
        const inputMobile = document.getElementById('searchProductMobile');

        if (inputDesktop) inputDesktop.value = '';
        if (inputMobile) inputMobile.value = '';
        currentSearch = '';

        document.getElementById('clearSearch')?.classList.add('hidden');
        document.getElementById('clearSearchMobile')?.classList.add('hidden');
        document.getElementById('searchInfo')?.classList.add('hidden');
        renderProducts();
    });

    // Download QRIS button
    $('downloadQrisBtn')?.addEventListener('click', function () {
        showNotification('QR Code berhasil didownload', 'success');
    });

    // Password toggles
    const toggleLoginPassword = $('toggleLoginPassword');
    const loginPassword = $('loginPassword');
    if (toggleLoginPassword && loginPassword) {
        toggleLoginPassword.addEventListener('click', function () {
            const type = loginPassword.getAttribute('type') === 'password' ? 'text' : 'password';
            loginPassword.setAttribute('type', type);
            this.querySelector('i')?.classList.toggle('fa-eye');
            this.querySelector('i')?.classList.toggle('fa-eye-slash');
        });
    }

    const toggleRegisterPassword = $('toggleRegisterPassword');
    const registerPassword = $('registerPassword');
    if (toggleRegisterPassword && registerPassword) {
        toggleRegisterPassword.addEventListener('click', function () {
            const type = registerPassword.getAttribute('type') === 'password' ? 'text' : 'password';
            registerPassword.setAttribute('type', type);
            this.querySelector('i')?.classList.toggle('fa-eye');
            this.querySelector('i')?.classList.toggle('fa-eye-slash');
        });
        registerPassword.addEventListener('input', validatePassword);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', function () {
    try {
        updateTime();
        setInterval(updateTime, 1000);

        fetchProductsFromSupabase();
        setupEventListeners();
        setupScrollButton();

        document.getElementById('productsGrid').addEventListener('click', function (e) {
            const productCard = e.target.closest('.product-card');
            if (productCard) {
                const productId = parseInt(productCard.dataset.productId);
                if (productId) {
                    addToCartWithAnimation(productId, productCard);
                }
            }
        });
        
        console.log('App initialized successfully');
    } catch (error) {
        console.error('Error initializing app:', error);
    }
});
