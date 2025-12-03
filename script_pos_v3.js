const supabaseUrl = "https://vhurelhciwirynuqpnjt.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZodXJlbGhjaXdpcnludXFwbmp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzOTg2NDMsImV4cCI6MjA2NTk3NDY0M30.g6-dnlvk3-svrzvw0Ce9vcSdXn3l9pQVocr_hQDAJIU";
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

let products = [];
let cart = [];
let transactions = [];
let lastTransaction = null;
let currentCategory = 'all';

let isLoggedIn = false;
let currentAdmin = null;
let currentReceiptPhoneNumber = null;

// Variabel untuk state cleanup
let timeInterval = null;
let orderBadgeInterval = null; 
let productSubscription = null;
let orderSubscription = null;

// Fungsi untuk reset tombol login ke keadaan semula
function resetLoginButton() {
    const loginButton = document.getElementById('loginButton');
    const loginButtonText = document.getElementById('loginButtonText');
    const loginSpinner = document.getElementById('loginSpinner');

    if (loginButton) {
        loginButton.disabled = false;
    }
    if (loginButtonText) {
        loginButtonText.textContent = 'Login';
    }
    if (loginSpinner) {
        loginSpinner.classList.add('hidden');
    }
}

// Fungsi untuk cek status login
async function checkLoginStatus() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
            console.error('Error checking session:', error);
            return;
        }

        if (session && session.user) {
            // Cek apakah email ada di tabel admin_role dengan status active dan role cashier
            const { data: adminData, error: adminError } = await supabase
                .from('admin_role')
                .select('email, name, status, role')
                .eq('email', session.user.email)
                .eq('status', 'active')
                .eq('role', 'cashier')
                .single();

            if (adminError || !adminData) {
                console.error('User not authorized:', adminError);
                await supabase.auth.signOut();
                return;
            }

            isLoggedIn = true;
            currentAdmin = adminData;
            document.getElementById('loginModal').classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
            document.getElementById('userName').textContent = adminData.name || session.user.email;

            initializeApp(); 
        } 
    } catch (error) {
        console.error('Error in checkLoginStatus:', error);
    }
}

function showLoginModal() {
    document.getElementById('loginModal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

// Fungsi untuk login dengan Supabase Auth
async function login(email, password) {
    try {
        document.getElementById('emailError').style.display = 'none';
        document.getElementById('passwordError').style.display = 'none';

        // 1. Login dengan Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (authError) {
            console.error('Auth login error:', authError);
            document.getElementById('emailError').textContent = 'Email atau password salah';
            document.getElementById('emailError').style.display = 'block';
            document.getElementById('passwordError').style.display = 'block';
            return false;
        }

        // 2. Verifikasi email sudah terdaftar di Supabase Auth
        if (!authData.user || !authData.user.email_confirmed_at) {
            console.error('Email not confirmed or user not found');
            document.getElementById('emailError').textContent = 'Email belum terverifikasi';
            document.getElementById('emailError').style.display = 'block';
            document.getElementById('passwordError').style.display = 'block';
            await supabase.auth.signOut();
            return false;
        }

        // 3. Cek apakah email ada di tabel admin_role dengan status active dan role cashier
        const { data: adminData, error: adminError } = await supabase
            .from('admin_role')
            .select('email, name, status, role')
            .eq('email', authData.user.email)
            .eq('status', 'active')
            .eq('role', 'cashier')
            .single();

        if (adminError || !adminData) {
            console.error('User not authorized - Not in admin_role or not cashier:', adminError);
            document.getElementById('emailError').textContent = 'Anda tidak memiliki akses kasir';
            document.getElementById('emailError').style.display = 'block';
            document.getElementById('passwordError').style.display = 'block';
            await supabase.auth.signOut();
            return false;
        }

        // 4. Login berhasil - BARU SAAT INI TUTUP MODAL
        isLoggedIn = true;
        currentAdmin = adminData;
        document.getElementById('loginModal').classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
        document.getElementById('userName').textContent = adminData.name || authData.user.email;
        showNotification(`Login berhasil! Selamat datang ${adminData.name || authData.user.email}`, 'success');

        initializeApp();
        return true;

    } catch (error) {
        console.error('Login error:', error);
        document.getElementById('emailError').textContent = 'Terjadi kesalahan saat login';
        document.getElementById('emailError').style.display = 'block';
        document.getElementById('passwordError').style.display = 'block';
        
        // Pastikan logout jika ada error
        await supabase.auth.signOut().catch(() => {});
        return false;
    }
}

// Fungsi untuk cek status login
async function checkLoginStatus() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
            console.error('Error checking session:', error);
            // Tampilkan modal login
            showLoginModal();
            return;
        }

        if (session && session.user) {
            // Cek apakah email ada di tabel admin_role dengan status active dan role cashier
            const { data: adminData, error: adminError } = await supabase
                .from('admin_role')
                .select('email, name, status, role')
                .eq('email', session.user.email)
                .eq('status', 'active')
                .eq('role', 'cashier')
                .single();

            if (adminError || !adminData) {
                console.error('User not authorized:', adminError);
                await supabase.auth.signOut();
                // Tampilkan modal login
                showLoginModal();
                return;
            }

            // Login valid - tutup modal dan inisialisasi app
            isLoggedIn = true;
            currentAdmin = adminData;
            document.getElementById('loginModal').classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
            document.getElementById('userName').textContent = adminData.name || session.user.email;

            initializeApp(); 
        } else {
            // Tidak ada session - tampilkan modal login
            showLoginModal();
        }
    } catch (error) {
        console.error('Error in checkLoginStatus:', error);
        // Tampilkan modal login
        showLoginModal();
    }
}

// Fungsi untuk logout
async function logout() {
    try {
        const logoutBtn = document.getElementById('logoutBtn');
        const logoutText = document.getElementById('logoutText');
        const logoutSpinner = document.getElementById('logoutSpinner');

        logoutBtn.style.pointerEvents = 'auto';
        logoutText.textContent = 'Logout';
        logoutSpinner.classList.add('hidden');

        await supabase.auth.signOut();
        isLoggedIn = false;
        currentAdmin = null;

        // Cleanup intervals and subscriptions
        if (timeInterval) { clearInterval(timeInterval); timeInterval = null; }
        if (orderBadgeInterval) { clearInterval(orderBadgeInterval); orderBadgeInterval = null; }
        if (productSubscription) { 
            try { 
                await supabase.removeChannel(productSubscription); 
            } catch (e) {
                console.warn('Error removing product subscription:', e);
            }
            productSubscription = null; 
        }
        if (orderSubscription) { 
            try { 
                await supabase.removeChannel(orderSubscription); 
            } catch (e) {
                console.warn('Error removing order subscription:', e);
            }
            orderSubscription = null; 
        }

        // Reset data
        cart = [];
        transactions = [];
        lastTransaction = null;

        // Update UI
        renderCart(); 
        document.getElementById('profileMenu').classList.add('hidden');
        resetLoginButton();
        
        const userNameEl = document.getElementById('userName');
        if(userNameEl) userNameEl.textContent = 'Guest';

        showNotification('Anda telah logout', 'info');
        renderProducts();
        
        // Tampilkan modal login setelah logout
        setTimeout(() => {
            showLoginModal();
        }, 300);

    } catch (error) {
        console.error('Logout error:', error);
        resetLoginButton();
        showNotification('Gagal logout', 'error');
    }
}

// Inisialisasi aplikasi setelah login
async function initializeApp() {
    try {
        updateTime();
        if (timeInterval) clearInterval(timeInterval);
        timeInterval = setInterval(updateTime, 1000);

        await loadProducts(); 
        await subscribeProducts(); 

        if (orderBadgeInterval) {
            clearInterval(orderBadgeInterval);
            orderBadgeInterval = null;
        }
        await subscribeToOrders();
        
        renderProducts(); 

    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

// Event listener untuk form login
document.getElementById('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const loginButton = document.getElementById('loginButton');
    const loginButtonText = document.getElementById('loginButtonText');
    const loginSpinner = document.getElementById('loginSpinner');

    loginButton.disabled = true;
    loginButtonText.textContent = 'Memproses...';
    loginSpinner.classList.remove('hidden');

    document.getElementById('emailError').style.display = 'none';
    document.getElementById('passwordError').style.display = 'none';

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const success = await login(email, password);

    if (!success) {
        // Reset tombol login tapi JANGAN tutup modal
        resetLoginButton();
        // Pastikan modal tetap terbuka dengan memanggil showLoginModal jika diperlukan
        if (document.getElementById('loginModal').classList.contains('hidden')) {
            showLoginModal();
        }
    }
    // Jika success = true, modal sudah ditutup di fungsi login()
});

document.getElementById('logoutBtn').addEventListener('click', function (e) {
    e.preventDefault();
    const logoutBtn = document.getElementById('logoutBtn');
    const logoutText = document.getElementById('logoutText');
    const logoutSpinner = document.getElementById('logoutSpinner');
    logoutBtn.style.pointerEvents = 'none';
    logoutText.textContent = 'Logging out...';
    logoutSpinner.classList.remove('hidden');
    setTimeout(() => { logout(); }, 1000);
});

supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
        document.getElementById('loginModal').classList.add('hidden');
    }
});

// Load produk saat DOMContentLoaded tanpa perlu login
document.addEventListener('DOMContentLoaded', function () {
    loadProducts();
    checkLoginStatus();
    setupEventListeners(); 
    setupQrisMobileListeners();
});

// Ambil produk dari Supabase (PUBLIC)
async function loadProducts() {
    const { data, error } = await supabase
        .from("product_list")
        .select("id, name, price, image, stock, metode, category");

    if (error) {
        console.error("Gagal ambil produk:", error.message);
        return;
    }

    products = data || [];
    sortProducts();
    renderProducts();
}

async function subscribeProducts() {
    if (!isLoggedIn) return; 

    if (productSubscription) {
        try { await supabase.removeChannel(productSubscription); } 
        catch (error) { console.warn("Error removing old channel: ", error); }
        productSubscription = null;
    }

    productSubscription = supabase
        .channel("public:product_list")
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "product_list" },
            (payload) => {
                if (payload.eventType === "INSERT") {
                    products.push(payload.new);
                } else if (payload.eventType === "UPDATE") {
                    products = products.map(p => p.id === payload.new.id ? payload.new : p);
                } else if (payload.eventType === "DELETE") {
                    products = products.filter(p => p.id !== payload.old.id);
                }
                sortProducts();
                renderProducts();
            }
        )
        .subscribe((status, error) => {
            if (status === 'CHANNEL_ERROR' || error) {
                console.error('Realtime subscription error:', error);
            }
        });
}

async function subscribeToOrders() {
    if (!isLoggedIn) return;

    if (orderSubscription) {
        try { await supabase.removeChannel(orderSubscription); } 
        catch (error) { console.warn("Error removing old order channel: ", error); }
        orderSubscription = null;
    }

    orderSubscription = supabase
        .channel('public:orders-pos')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'orders' },
            (payload) => {
                console.log('🔔 Realtime: New order detected!', payload.new);
                updateOnlineOrdersBadge();
            }
        )
        .subscribe((status, error) => {
            if (status === 'SUBSCRIBED') {
                updateOnlineOrdersBadge();
            }
            if (status === 'CHANNEL_ERROR' || error) {
                if (!orderBadgeInterval) {
                    updateOnlineOrdersBadge();
                    orderBadgeInterval = setInterval(updateOnlineOrdersBadge, 5000);
                }
            }
        });
}

function sortProducts() {
    const categoryOrder = ["makanan", "minuman", "printing", "atk"];
    const orderMap = categoryOrder.reduce((m, c, i) => (m[c] = i, m), {});

    products.sort((a, b) => {
        const catA = (a.category || "").toLowerCase();
        const catB = (b.category || "").toLowerCase();
        const idxA = Object.prototype.hasOwnProperty.call(orderMap, catA) ? orderMap[catA] : categoryOrder.length;
        const idxB = Object.prototype.hasOwnProperty.call(orderMap, catB) ? orderMap[catB] : categoryOrder.length;
        if (idxA !== idxB) return idxA - idxB;
        return (a.name || "").localeCompare(b.name || "", "id-ID", { sensitivity: "base" });
    });
}

function addDenomination(amount) {
    const cashInput = document.getElementById('cashAmount');
    const currentValue = parseInt(cashInput.value) || 0;
    cashInput.value = currentValue + amount;
    const event = new Event('input', { bubbles: true });
    cashInput.dispatchEvent(event);
}

function animateProductToCart(productElement, productName) {
    const productRect = productElement.getBoundingClientRect();
    const cartBtn = document.getElementById('cartBtn');
    const cartRect = cartBtn.getBoundingClientRect();

    const animationElement = document.createElement('div');
    animationElement.className = 'product-animation';
    animationElement.innerHTML = '<i class="fas fa-plus"></i>';
    animationElement.style.left = (productRect.left + productRect.width / 2 - 15) + 'px';
    animationElement.style.top = (productRect.top + productRect.height / 2 - 15) + 'px';

    document.body.appendChild(animationElement);

    requestAnimationFrame(() => {
        animationElement.style.left = (cartRect.left + cartRect.width / 2 - 15) + 'px';
        animationElement.style.top = (cartRect.top + cartRect.height / 2 - 15) + 'px';
        animationElement.style.transform = 'scale(0.5)';
        animationElement.style.opacity = '0.5';
    });

    setTimeout(() => {
        document.body.removeChild(animationElement);
    }, 1200);
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

function renderProducts() {
    try {
        const filteredProducts = currentCategory === 'all'
            ? products
            : products.filter(p => p.category === currentCategory);

        const preloadPromises = filteredProducts.map(product => {
            const key = product.image;
            if (!key) return Promise.resolve();
            return fetch(key)
                .then(res => {
                    if (!res.ok) throw new Error('Network response not ok');
                    return res.blob();
                })
                .then(blob => URL.createObjectURL(blob))
                .catch(err => console.warn('Gagal preload gambar', key, err));
        });

        Promise.all(preloadPromises)
            .then(() => renderFilteredProducts(filteredProducts))
            .catch(err => {
                renderFilteredProducts(filteredProducts); 
            });

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
      </div>
    `;
        return;
    }

    grid.innerHTML = filteredProducts.map(product => {
        const isOutOfStock = product.stock <= 0;

        return `
      <div class="product-card ${isOutOfStock ? 'pointer-events-none' : ''}"
           ${!isOutOfStock ? `onclick="addToCartWithAnimation(${product.id}, this)"` : ''}>
        <div class="product-image-wrapper">
          <img src="${product.image}" alt="${product.name}" class="product-image-fixed" loading="lazy">
        </div>
        <div class="product-content">
          <h3 class="product-name">${product.name}</h3>
          <p class="product-price">Rp ${product.price.toLocaleString('id-ID')}</p>
          <p class="product-stock ${isOutOfStock ? 'text-red-600 font-semibold' : ''}">
            ${isOutOfStock ? 'Stok Kosong' : `Stok: ${product.stock}`}
          </p>
        </div>
      </div>
    `;
    }).join('');
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const icon = document.getElementById('notificationIcon');
    const messageEl = document.getElementById('notificationMessage');
    if (!notification || !icon || !messageEl) return;

    if (type === 'success') {
        icon.innerHTML = '<i class="fas fa-check-circle text-green-500 text-sm"></i>';
    } else if (type === 'error') {
        icon.innerHTML = '<i class="fas fa-exclamation-circle text-red-500 text-sm"></i>';
    } else {
        icon.innerHTML = '<i class="fas fa-info-circle text-blue-500 text-sm"></i>';
    }
    messageEl.textContent = message;
    notification.classList.remove('hidden');
    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.classList.add('hidden');
        }, 300);
    }, 3000);
}

let listenersInitialized = false;

function handleDocumentClick(e) {
    const profileMenu = document.getElementById('profileMenu');
    const profileBtn = document.getElementById('profileBtn');
    const profileContainer = document.querySelector('.profile-menu-container');

    if (profileMenu && profileBtn && profileContainer && !profileContainer.contains(e.target)) {
        profileMenu.classList.add('hidden');
    }

    const onlineOrdersMenu = document.getElementById('onlineOrdersMenu');
    const onlineOrdersBtn = document.getElementById('onlineOrdersBtn');
    if (onlineOrdersMenu && onlineOrdersBtn && !onlineOrdersMenu.contains(e.target) && !onlineOrdersBtn.contains(e.target)) {
        onlineOrdersMenu.classList.remove('show');
        setTimeout(() => { onlineOrdersMenu.classList.add('hidden'); }, 300);
    }

    const cartModal = document.getElementById('cartModal');
    const cartBtn = document.getElementById('cartBtn');
    if (cartModal && cartBtn && !cartModal.contains(e.target) && !cartBtn.contains(e.target)) {
        cartModal.classList.remove('show');
    }

    const searchInfo = document.getElementById('searchInfo');
    if (searchInfo) {
        searchInfo.classList.add('hidden');
    }
}

function setupEventListeners() {
    if (listenersInitialized) return;

    document.getElementById('cartBtn').addEventListener('click', function (e) {
        if (!isLoggedIn) {
            showLoginModal();
            return;
        }
        e.stopPropagation();
        const modal = document.getElementById('cartModal');
        modal.classList.add('show');
    });

    document.getElementById('closeCartModal').addEventListener('click', function (e) {
        e.stopPropagation();
        document.getElementById('cartModal').classList.remove('show');
    });

    document.getElementById('profileBtn').addEventListener('click', function (e) {
        if (!isLoggedIn) {
            showLoginModal();
            return;
        }
        e.stopPropagation();
        document.getElementById('profileMenu').classList.toggle('hidden');
    });

    document.getElementById('onlineOrdersBtn').addEventListener('click', function (e) {
        if (!isLoggedIn) {
            showLoginModal();
            return;
        }
        e.stopPropagation();
        const menu = document.getElementById('onlineOrdersMenu');
        menu.classList.remove('hidden');
        menu.classList.add('show');
        renderOnlineOrders();
    });

    document.getElementById('closeNotificationMobile').addEventListener('click', function (e) {
        e.stopPropagation();
        const menu = document.getElementById('onlineOrdersMenu');
        menu.classList.remove('show');
        setTimeout(() => { menu.classList.add('hidden'); }, 300);
    });

    document.getElementById('mobileCloseButton').addEventListener('click', function (e) {
        e.stopPropagation();
        const menu = document.getElementById('onlineOrdersMenu');
        menu.classList.remove('show');
        setTimeout(() => { menu.classList.add('hidden'); }, 300);
    });

    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', function () {
            const tabId = this.dataset.tab;
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(tabId + 'Tab').classList.add('active');
            if (tabId === 'history') renderTransactionHistory();
        });
    });

    document.removeEventListener('click', handleDocumentClick);
    document.addEventListener('click', handleDocumentClick);

    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentCategory = this.dataset.category;
            document.getElementById('searchProduct').value = '';
            document.getElementById('clearSearch').classList.add('hidden');
            document.getElementById('searchInfo').classList.add('hidden');
            renderProducts();

            if (window.innerWidth <= 768) {
                const tooltip = document.getElementById('categoryTooltipMobile');
                tooltip.textContent = this.dataset.tooltip;
                tooltip.classList.add('show');
                setTimeout(() => { tooltip.classList.remove('show'); }, 2000);
            }
        });
    });

    const filterToggle = document.getElementById('filterToggle');
    if (filterToggle) {
        filterToggle.addEventListener('click', function () {
            document.getElementById('categoryFilter').classList.toggle('hidden');
            this.classList.toggle('active');
        });
    }

    document.getElementById('filterToggleMobile').addEventListener('click', function () {
        document.getElementById('categoryFilter').classList.toggle('hidden');
        this.classList.toggle('active');
    });

    document.getElementById('searchProduct').addEventListener('input', function () {
        const searchTerm = this.value.toLowerCase().trim();
        const clearBtn = document.getElementById('clearSearch');
        const searchInfo = document.getElementById('searchInfo');
        const searchResultText = document.getElementById('searchResultText');

        if (searchTerm) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
            searchInfo.classList.add('hidden');
            renderProducts(); 
            return;
        }

        let filteredProducts = products.filter(p =>
            p.name.toLowerCase().includes(searchTerm)
        );

        searchInfo.classList.remove('hidden');
        searchResultText.textContent = `Ditemukan ${filteredProducts.length} produk untuk "${this.value}"`;
        renderFilteredProducts(filteredProducts);
    });

    document.getElementById('clearSearch').addEventListener('click', function () {
        document.getElementById('searchProduct').value = '';
        this.classList.add('hidden');
        document.getElementById('searchInfo').classList.add('hidden');
        renderProducts(); 
    });

    document.getElementById('clearSearchResults').addEventListener('click', function (e) {
        e.stopPropagation();
        document.getElementById('searchProduct').value = '';
        document.getElementById('clearSearch').classList.add('hidden');
        document.getElementById('searchInfo').classList.add('hidden');
        renderProducts(); 
    });

    document.getElementById('clearCart').addEventListener('click', function () {
        if (confirm('Yakin ingin mengosongkan keranjang?')) {
            cart = [];
            renderCart();
            showNotification('Keranjang berhasil dikosongkan', 'success');
        }
    });

    document.getElementById('paymentMethod').addEventListener('change', function () {
        const cashPayment = document.getElementById('cashPayment');
        const qrisPayment = document.getElementById('qrisPayment');
        if (this.value === 'cash') {
            cashPayment.style.display = 'block';
            qrisPayment.classList.add('hidden');
        } else if (this.value === 'qris') {
            cashPayment.style.display = 'none';
            qrisPayment.classList.remove('hidden');
        }
        updatePaymentButton();
    });

    document.getElementById('proofUpload').addEventListener('change', function (e) {
        const file = e.target.files[0];
        const uploadText = document.getElementById('uploadText');
        const uploadPreview = document.getElementById('uploadPreview');

        if (file) {
            uploadText.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Memproses...';
            uploadPreview.classList.add('hidden'); 

            const reader = new FileReader();
            reader.onload = function (e) {
                const previewImage = document.getElementById('previewImage');
                previewImage.src = e.target.result;
                previewImage.style.height = '12rem'; 
                previewImage.style.objectFit = 'contain';

                document.getElementById('fileName').textContent = file.name;
                uploadPreview.classList.remove('hidden'); 

                uploadText.innerHTML = '<i class="fas fa-cloud-upload-alt mr-1"></i> Ganti file';
                updatePaymentButton();
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('cashAmount').addEventListener('input', function () {
        const total = calculateTotal();
        const cashAmount = parseFloat(this.value) || 0;
        const changeDiv = document.getElementById('change');
        if (cashAmount >= total && total > 0) {
            const change = cashAmount - total;
            changeDiv.textContent = `Kembalian: Rp ${change.toLocaleString('id-ID')}`;
            changeDiv.classList.remove('hidden');
        } else {
            changeDiv.classList.add('hidden');
        }
        updatePaymentButton();
    });

    document.getElementById('processPayment').addEventListener('click', processPayment);

    document.getElementById('closeReceipt').addEventListener('click', function () {
        document.getElementById('receiptModal').classList.add('hidden');
    });

    document.getElementById('printReceipt').addEventListener('click', function () {
        printReceipt();
    });

    document.getElementById('downloadReceipt').addEventListener('click', function () {
        downloadReceiptImage();
    });

    document.getElementById('whatsappReceipt').addEventListener('click', function () {
        shareReceiptToWhatsApp();
    });

    document.getElementById('searchHistory').addEventListener('input', function () {
        renderTransactionHistory(this.value);
    });

    document.getElementById('searchOrders').addEventListener('input', function () {
        renderOnlineOrders(this.value);
    });

    document.getElementById('cancelProcessOrder').addEventListener('click', function () {
        document.getElementById('onlineOrderConfirmModal').classList.add('hidden');
        document.getElementById('onlineOrderConfirmModal').classList.remove('flex');
        showNotification('Pemrosesan pesanan dibatalkan', 'info');
    });

    document.getElementById('closeQrisPreview').addEventListener('click', function () {
        document.getElementById('qrisPreviewModal').classList.add('hidden');
        document.getElementById('qrisPreviewModal').classList.remove('flex');
    });

    document.getElementById("qrisProofImage").onclick = function () {
        const full = document.getElementById("qrisFullscreen");
        const img = document.getElementById("qrisFullscreenImg");
        img.src = this.src;
        full.style.display = "flex";
    };

    document.getElementById("qrisPreviewImage").onclick = function () {
        const full = document.getElementById("qrisFullscreen");
        const img = document.getElementById("qrisFullscreenImg");
        img.src = this.src;
        full.style.display = "flex";
    };

    document.getElementById("qrisFullscreen").onclick = function () {
        this.style.display = "none";
    };

    listenersInitialized = true; 
}

function addToCart(productId) {
    if (!isLoggedIn) {
        showLoginModal();
        return;
    }

    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (product.stock <= 0) {
        showNotification('Stok produk ini habis', 'error');
        return;
    }

    const existingItem = cart.find(item => item.id === productId);

    if (existingItem) {
        if (existingItem.quantity >= product.stock) {
            showNotification('Jumlah melebihi stok tersedia', 'error');
            return;
        }
        existingItem.quantity += 1;
    } else {
        cart.push({ ...product, quantity: 1 });
    }

    renderCart();
}

function addToCartWithAnimation(productId, element) {
    if (!isLoggedIn) {
        showLoginModal();
        return;
    }

    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (product.stock <= 0) {
        showNotification('Stok produk ini habis', 'error');
        return;
    }

    const existingItem = cart.find(i => i.id === productId);
    if (existingItem && existingItem.quantity >= product.stock) {
        showNotification('Jumlah melebihi stok tersedia', 'error');
        return;
    }

    element.classList.add('clicked');
    setTimeout(() => element.classList.remove('clicked'), 300);
    animateProductToCart(element, product.name || 'Produk');

    addToCart(productId);
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    renderCart();
}

function updateQuantity(productId, change) {
    const item = cart.find(i => i.id === productId);
    const product = products.find(p => p.id === productId);
    if (!item || !product) return;

    const newQty = item.quantity + change;

    if (newQty > product.stock) {
        showNotification('Jumlah melebihi stok tersedia', 'error');
        return;
    }

    if (newQty <= 0) {
        removeFromCart(productId);
        return;
    }

    item.quantity = newQty;
    renderCart();
}

function togglePaymentControls(disabled) {
    const paymentSection = document.querySelector('.payment-section');
    if (paymentSection) {
        paymentSection.style.opacity = disabled ? '0.6' : '1';
        paymentSection.style.pointerEvents = disabled ? 'none' : 'auto';
    }
}

function renderCart() {
    const cartItems = document.getElementById('cartItems');
    const cartBadge = document.getElementById('cartBadge');
    if (!cartItems || !cartBadge) return;

    const totalItems = cart.reduce((total, item) => total + item.quantity, 0);

    if (totalItems > 0) {
        cartBadge.textContent = totalItems;
        cartBadge.classList.remove('hidden');
    } else {
        cartBadge.classList.add('hidden');
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
                        <button onclick="event.stopPropagation(); updateQuantity(${item.id}, -1)" class="bg-red-500 text-white w-5 h-5 rounded text-xs hover:bg-red-600 transition-colors">-</button>
                        <span class="text-xs font-semibold w-6 text-center text-gray-800">${item.quantity}</span>
                        <button onclick="event.stopPropagation(); updateQuantity(${item.id}, 1)" class="bg-green-500 text-white w-5 h-5 rounded text-xs hover:green-600 transition-colors">+</button>
                    </div>
                </div>
                <div class="flex items-center justify-between mt-2">
                    <span class="text-xs text-gray-600">Subtotal</span>
                    <span class="text-xs font-semibold text-gray-800">Rp ${(item.price * item.quantity).toLocaleString('id-ID')}</span>
                </div>
            </div>
        `).join('');
    }

    togglePaymentControls(cart.length === 0);
    updateTotals();
    updatePaymentButton();
}

function updateTotals() {
    const total = calculateTotal();
    document.getElementById('total').textContent = `Rp ${total.toLocaleString('id-ID')}`;
}

function calculateTotal() {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

function updatePaymentButton() {
    const paymentBtn = document.getElementById('processPayment');
    if (!paymentBtn) return;

    const paymentMethod = document.getElementById('paymentMethod').value;
    const total = calculateTotal();

    if (cart.length === 0) {
        paymentBtn.disabled = true;
        return;
    }

    if (paymentMethod === 'cash') {
        const cashAmount = parseFloat(document.getElementById('cashAmount').value) || 0;
        paymentBtn.disabled = cashAmount < total;
    } else if (paymentMethod === 'qris') {
        const hasProof = document.getElementById('proofUpload').files.length > 0;
        paymentBtn.disabled = !hasProof;
    } else {
        paymentBtn.disabled = false;
    }
}

function pad(n, width = 2) {
    return n.toString().padStart(width, '0');
}

function formatJakartaISOStringWithMs(date) {
    const Y = date.getUTCFullYear();
    const M = pad(date.getUTCMonth() + 1);
    const D = pad(date.getUTCDate());
    const hh = pad(date.getUTCHours());
    const mm = pad(date.getUTCMinutes());
    const ss = pad(date.getUTCSeconds());
    const ms = (date.getUTCMilliseconds()).toString().padStart(3, '0');
    return `${Y}-${M}-${D} ${hh}:${mm}:${ss}.${ms}`;
}

async function processPayment() {
    const paymentBtn = document.getElementById('processPayment');
    const originalBtnHTML = paymentBtn.innerHTML;

    paymentBtn.disabled = true;
    paymentBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-1"></i> Memproses...`;

    await new Promise(resolve => setTimeout(resolve, 500));

    try {
        if (!isLoggedIn) {
            showLoginModal();
            throw new Error('Not logged in'); 
        }

        const paymentMethod = document.getElementById('paymentMethod').value;
        const total = calculateTotal();
        const cashAmount = parseFloat(document.getElementById('cashAmount').value) || 0;
        const change = cashAmount - total;
        const itemsForReceipt = [...cart]; 

        let qrisUrl = null;

        if (paymentMethod === 'qris') {
            const fileInput = document.getElementById('proofUpload');
            const file = fileInput.files[0];
            if (!file) {
                showNotification('Silakan unggah bukti QRIS terlebih dahulu', 'error');
                throw new Error('No QRIS proof uploaded');
            }

            try {
                const now = Date.now();
                const random3Digit = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                const tempName = `qris_offline_${now}${random3Digit}.webp`;

                const compressedWebp = await new Promise((resolve) => {
                    const img = new Image();
                    const reader = new FileReader();
                    reader.onload = (e) => (img.src = e.target.result);
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const maxWidth = 800;
                        const scale = Math.min(maxWidth / img.width, 1);
                        canvas.width = Math.round(img.width * scale);
                        canvas.height = Math.round(img.height * scale);
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.8);
                    };
                    reader.readAsDataURL(file);
                });

                const { error: uploadError } = await supabase.storage
                    .from('Qris_image')
                    .upload(tempName, compressedWebp, {
                        contentType: 'image/webp',
                        upsert: true
                    });
                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage.from('Qris_image').getPublicUrl(tempName);
                qrisUrl = urlData?.publicUrl;
                if (!qrisUrl) throw new Error('Failed to get public URL for QRIS');
                console.log('✅ QRIS (offline) uploaded to:', qrisUrl);

            } catch (err) {
                console.error('❌ Upload QRIS gagal:', err);
                showNotification('Gagal upload bukti QRIS', 'error');
                throw err;
            }
        }

        const transactionPayload = {
            items: itemsForReceipt,
            total: total,
            paymentMethod: paymentMethod === 'cash' ? 'tunai' : 'qris',
            cashierName: currentAdmin.name,
            cashierEmail: currentAdmin.email,
            qrisUrl: qrisUrl
        };

        console.log('🔄 Memanggil RPC create_offline_order...');
        const { data: newOrdersNumber, error: rpcError } = await supabase.rpc(
            'create_offline_order',
            { transaction_data: transactionPayload }
        );

        if (rpcError || !newOrdersNumber) {
            console.error('❌ RPC Error (create_offline_order):', rpcError);
            showNotification('Gagal menyimpan transaksi (RPC Error)', 'error');
            throw new Error(rpcError?.message || 'RPC returned null');
        }

        console.log('✅ Transaksi offline berhasil dibuat:', newOrdersNumber);

        const nowJakarta = new Date(Date.now() + 7 * 60 * 60 * 1000);
        const tanggalJakarta = formatJakartaISOStringWithMs(nowJakarta);

        lastTransaction = {
            items: itemsForReceipt,
            total,
            paymentMethod,
            cashAmount,
            change,
            receiptNumber: 'TRX' + newOrdersNumber.slice(-11),
            date: tanggalJakarta,
            ordersNumber: newOrdersNumber,
            qrisUrl: qrisUrl
        };

        transactions.push(lastTransaction);

        generateReceipt(paymentMethod, total, tanggalJakarta, itemsForReceipt);

        document.getElementById('receiptModal').classList.remove('hidden');
        document.getElementById('receiptModal').classList.add('flex');

        cart = [];
        renderCart();
        document.getElementById('cashAmount').value = '';
        document.getElementById('change').classList.add('hidden');
        document.getElementById('proofUpload').value = '';
        document.getElementById('uploadPreview').classList.add('hidden');
        document.getElementById('uploadText').textContent = 'Pilih file gambar';
        document.getElementById('cartModal').classList.remove('show');

        showNotification('Pembayaran berhasil diproses!', 'success');

    } catch (error) {
        console.error("Error during payment processing:", error.message);
    } finally {
        paymentBtn.disabled = false;
        paymentBtn.innerHTML = originalBtnHTML;
        updatePaymentButton();
    }
}

// Struk untuk transaksi kasir (OFFLINE)
function generateReceipt(paymentMethod, total, tanggalJakartaStr, items) {
    const cashAmount = parseFloat(document.getElementById('cashAmount').value) || 0;
    const change = cashAmount - total;

    const rawDelivery = lastTransaction.delivery_option || lastTransaction.order_by || 'Ambil Sendiri';
    const deliveryOption = (() => {
        const parts = rawDelivery.split(',').map(p => p.trim()).filter(Boolean);
        const unique = [...new Set(parts.map(p => p.toLowerCase()))];
        return parts.find(p => p.toLowerCase() === unique[0]) || 'Ambil Sendiri';
    })();

    currentReceiptPhoneNumber = null;

    const receiptContent = document.getElementById('receiptContent');
    receiptContent.innerHTML = `
    <div class="text-center mb-3">
        <h4 class="font-bold text-md">AKSARA-MART</h4>
        <p class="text-xs">Jalan Keputih Tegal No 54, Surabaya</p>
        <p class="text-xs">Telp: 0888-1343-038</p>
    </div>

    <div class="border-t border-b border-dashed py-2 mb-2">
        <div class="flex justify-between text-xs">
            <span>Tanggal:</span>
            <span>${tanggalJakartaStr} WIB</span>
        </div>
        <div class="flex justify-between text-xs">
            <span>No. Order:</span>
            <span>${lastTransaction.ordersNumber}</span>
        </div>
        <div class="flex justify-between text-xs">
            <span>Pengiriman:</span>
            <span>${deliveryOption}</span>
        </div>
    </div>

    <div class="space-y-1 mb-2">
        ${items.map(item => `
            <div class="flex justify-between text-xs">
                <div class="flex-1">
                    <div>${item.name}</div>
                    <div class="text-gray-500">${item.quantity} x Rp ${item.price.toLocaleString('id-ID')}</div>
                </div>
                <div>Rp ${(item.price * item.quantity).toLocaleString('id-ID')}</div>
            </div>
        `).join('')}
    </div>

    <div class="border-t border-dashed pt-2">
        <div class="flex justify-between font-bold text-sm">
            <span>Total:</span>
            <span>Rp ${total.toLocaleString('id-ID')}</span>
        </div>
        <div class="flex justify-between text-xs mt-1">
            <span>Pembayaran:</span>
            <span>${paymentMethod === 'cash' ? 'Tunai' : 'QRIS'}</span>
        </div>
        ${paymentMethod === 'cash' ? `
        <div class="flex justify-between text-xs mt-1">
            <span>Bayar:</span>
            <span>Rp ${cashAmount.toLocaleString('id-ID')}</span>
        </div>
        <div class="flex justify-between text-xs mt-1">
            <span>Kembalian:</span>
            <span>Rp ${change.toLocaleString('id-ID')}</span>
        </div>` : `
        <div class="text-center text-green-600 text-xs mt-2">
            <i class="fas fa-qrcode mr-1"></i>Bukti QRIS telah terverifikasi
        </div>`}
    </div>

    <div class="text-center mt-3 text-xs">
        <p>Terima kasih sudah belanja <br> di Aksara-Mart 🙏😊.</p>
    </div>
  `;
}

function printReceipt() {
    const printContent = document.getElementById('receiptContent').innerHTML;

    const printWindow = window.open('', '_blank', 'width=300,height=600');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Cetak Struk</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                @media print {
                    body {
                        font-family: 'Courier New', monospace;
                        font-size: 12px;
                        width: 80mm;
                        margin: 0;
                        padding: 5px;
                        color: black;
                        background: white;
                    }
                    .text-center { text-align: center; }
                    .font-bold { font-weight: bold; }
                    .text-xs { font-size: 11px; }
                    .text-sm { font-size: 12px; }
                    .text-md { font-size: 14px; }
                    .flex { display: flex; }
                    .justify-between { justify-content: space-between; }
                    .flex-1 { flex: 1; }
                    .mb-2 { margin-bottom: 0.5rem; }
                    .mb-3 { margin-bottom: 0.75rem; }
                    .mt-1 { margin-top: 0.25rem; }
                    .mt-3 { margin-top: 0.75rem; }
                    .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
                    .border-t { border-top: 1px solid #000; }
                    .border-b { border-bottom: 1px solid #000; }
                    .border-dashed { border-style: dashed; }
                    .space-y-1 > * + * { margin-top: 0.25rem; }
                    .space-y-1 > * + * { margin-top: 0.25rem; }
                    
                    .no-print {
                        display: none;
                    }
                }
                
                body {
                    font-family: Arial, sans-serif;
                    padding: 20px;
                }
                .print-button {
                    background-color: #4CAF50;
                    color: white;
                    padding: 10px 15px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    margin: 10px 0;
                }
            </style>
        </head>
        <body>
            <button class="print-button no-print" onclick="window.print()">Cetak Struk</button>
            ${printContent}
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() {
                        window.close();
                    }, 500);
                };
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function downloadReceiptImage() {
    const originalRececept = document.getElementById('receiptContent');

    const originalMaxHeight = originalRececept.style.maxHeight;
    const originalOverflow = originalRececept.style.overflow;

    originalRececept.style.maxHeight = 'none';
    originalRececept.style.overflow = 'visible';

    html2canvas(originalRececept, {
        scale: 2,
        width: originalRececept.scrollWidth,
        height: originalRececept.scrollHeight,
        windowWidth: originalRececept.scrollWidth,
        windowHeight: originalRececept.scrollHeight,
        useCORS: true,
        backgroundColor: '#ffffff'
    }).then(canvas => {
        originalRececept.style.maxHeight = originalMaxHeight;
        originalRececept.style.overflow = originalOverflow;

        const link = document.createElement('a');
        link.download = 'struk-pembelian-' + new Date().getTime() + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    }).catch(error => {
        console.error('Error generating receipt image:', error);
        originalRececept.style.maxHeight = originalMaxHeight;
        originalRececept.style.overflow = originalOverflow;
    });
}

function shareReceiptToWhatsApp() {
    const message = "Terima kasih sudah berbelanja di Aksara-Mart. 🙏😊";
    const encodedMessage = encodeURIComponent(message);

    if (currentReceiptPhoneNumber) {
        let cleanPhone = currentReceiptPhoneNumber.replace(/\D/g, '');

        if (cleanPhone.startsWith('0')) {
            cleanPhone = '62' + cleanPhone.substring(1);
        }

        if (cleanPhone.length > 8) {
            window.open(`https://wa.me/${cleanPhone}?text=${encodedMessage}`, '_blank');
        } else {
            console.warn('Nomor telepon tidak valid, fallback ke pemilih kontak:', currentReceiptPhoneNumber);
            window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
        }
    } else {
        window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
    }
}

async function getOrderItems(ordersNumber) {
    try {
        const { data, error } = await supabase
            .from('order_items')
            .select('*')
            .eq('orders_number', ordersNumber);

        if (error) {
            console.error('Error fetching order items:', error);
            return null;
        }
        return data;
    } catch (error) {
        console.error('Error in getOrderItems:', error);
        return null;
    }
}

async function getOrder(ordersNumber) {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('orders_number', ordersNumber)
            .single();

        if (error) {
            console.error('❌ Error fetching order:', error);
            return null;
        }
        return data;
    } catch (error) {
        console.error('❌ Error in getOrder:', error);
        return null;
    }
}

async function getAllTransactionHistory() {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('order_date', { ascending: false });

        if (error) {
            console.error('Error fetching transaction history:', error);
            return [];
        }
        return data || [];
    } catch (error) {
        console.error('Error in getAllTransactionHistory:', error);
        return [];
    }
}

async function processOrderConfirmation(order) {
    try {
        console.log('🔄 Memulai proses order via RPC:', order.orders_number);

        const { data: success, error: rpcError } = await supabase.rpc(
            'confirm_online_order',
            {
                order_num: order.orders_number,
                admin_email: currentAdmin.email
            }
        );

        if (rpcError || !success) {
            console.error('❌ RPC Error (confirm_online_order):', rpcError);
            throw new Error(rpcError?.message || 'RPC returned false');
        }

        console.log('✅ RPC confirm_online_order SUKSES');

        showNotification(`Pesanan ${order.orders_number} berhasil diproses!`, 'success');

        await updateOnlineOrdersBadge(); 
        renderOnlineOrders(); 

        const onlineOrdersMenu = document.getElementById('onlineOrdersMenu');
        if (onlineOrdersMenu) {
            onlineOrdersMenu.classList.remove('show');
            setTimeout(() => {
                onlineOrdersMenu.classList.add('hidden');
            }, 300);
        }

        return true; 

    } catch (error) {
        console.error('❌ Error dalam processOrderConfirmation:', error);
        showNotification('Gagal memproses pesanan: ' + error.message, 'error');
        return false; 
    }
}

async function getOnlineOrders() {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('order_by', 'online')
            .order('order_date', { ascending: false });

        if (error) {
            console.error('❌ Error fetching online orders:', error);
            return [];
        }
        return data || [];
    } catch (error) {
        console.error('❌ Error in getOnlineOrders:', error);
        return [];
    }
}

function playNotificationSound() {
    const sound = document.getElementById('notificationSound');
    if (!sound) return;

    sound.muted = false;
    sound.currentTime = 0;
    sound.play().catch(err => {
        console.warn("Browser blokir audio sampai ada klik user", err);
    });
}

async function updateOnlineOrdersBadge() {
    if (!isLoggedIn) return;

    const badge = document.getElementById('onlineOrdersBadge');
    if (!badge) return;

    try {
        const onlineOrders = await getOnlineOrders();
        const pendingOrders = onlineOrders.filter(order => order.status === 'pending').length;
        const previousCount = parseInt(badge.textContent) || 0;

        if (pendingOrders > 0) {
            badge.textContent = pendingOrders;
            badge.classList.remove('hidden');
            if (pendingOrders > previousCount) {
                playNotificationSound();
            }
        } else {
            badge.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error updating online orders badge:', error);
    }
}

async function renderOnlineOrders(searchTerm = '') {
    if (!isLoggedIn) return;

    const ordersList = document.getElementById('onlineOrdersList');
    if (!ordersList) return;

    try {
        const onlineOrders = await getOnlineOrders();

        let filteredOrders = onlineOrders.filter(order => order.status === 'pending');

        if (searchTerm) {
            const searchTermLower = searchTerm.toLowerCase();
            filteredOrders = filteredOrders.filter(order =>
                order.orders_number.toLowerCase().includes(searchTermLower) ||
                (order.customers_name && order.customers_name.toLowerCase().includes(searchTermLower)) ||
                (order.product_list && order.product_list.toLowerCase().includes(searchTermLower))
            );
        }

        if (filteredOrders.length === 0) {
            ordersList.innerHTML = `
                <div class="no-orders-message">
                    <i class="fas fa-check-circle text-xl mb-2 text-green-500"></i>
                    <p>Belum ada pesanan baru</p>
                    <p class="text-xs mt-1 text-gray-500">Semua pesanan telah diproses</p>
                    ${searchTerm ? `<p class="text-xs mt-1">Untuk pencarian "${searchTerm}"</p>` : ''}
                </div>
            `;
            return;
        }

        ordersList.innerHTML = filteredOrders.map(order => {
            const customerName = order.customers_name || 'Pelanggan';
            const orderDate = new Date(order.order_date).toLocaleString('id-ID');
            const paymentMethod = order.payment_methode === 'qris' ? 'QRIS' : 'Tunai';

            return `
                <div class="order-item" data-order-id="${order.orders_number}">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="order-number">${order.orders_number} • ${order.order_by} 
                                <span class="order-status status-pending">
                                    Pending
                                </span>
                            </div>
                            <div class="order-date">${orderDate}</div>
                            <div class="order-items">${order.product_list}</div>
                            <div class="font-semibold text-sm mt-1">Total: Rp ${order.subtotal.toLocaleString('id-ID')}</div>
                            <div class="text-xs text-gray-600 mt-1">Pelanggan: ${customerName}</div>
                            <div class="text-xs text-gray-600">Pembayaran: ${paymentMethod}</div>
                        </div>
                    </div>
                    <button class="process-order-btn" onclick="event.stopPropagation(); processOnlineOrder('${order.orders_number}')">
                        Proses Pesanan
                    </button>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error rendering online orders:', error);
        ordersList.innerHTML = `
            <div class="no-orders-message">
                <i class="fas fa-exclamation-triangle text-xl mb-2"></i>
                <p>Gagal memuat data pesanan online</p>
            </div>
        `;
    }
}

async function processOnlineOrder(ordersNumber) {
    if (!isLoggedIn) {
        showLoginModal();
        return;
    }

    try {
        const { data: order, error } = await supabase
            .from('orders')
            .select('*')
            .eq('orders_number', ordersNumber)
            .single();

        if (error || !order) {
            console.error('❌ Pesanan tidak ditemukan:', error);
            showNotification('Pesanan tidak ditemukan', 'error');
            return;
        }
        await showOrderConfirmationModal(order);

    } catch (error) {
        console.error('❌ Error in processOnlineOrder:', error);
        showNotification('Terjadi kesalahan saat memproses pesanan', 'error');
    }
}

let currentProcessingOrder = null;

async function showOrderConfirmationModal(order) {
    currentProcessingOrder = order;

    const modal = document.getElementById('onlineOrderConfirmModal');
    const confirmMessage = document.getElementById('confirmMessage');
    const qrisProofSection = document.getElementById('qrisProofSection');
    const qrisProofImage = document.getElementById('qrisProofImage');

    confirmMessage.textContent = `Proses pesanan ${order.orders_number}?`;

    if (order.payment_methode === 'qris' && order.qris_reference) {
        qrisProofSection.classList.remove('hidden');
        qrisProofImage.src = order.qris_reference;
        qrisProofImage.alt = `Bukti QRIS - ${order.orders_number}`;
        qrisProofImage.style.cursor = 'pointer';
        qrisProofImage.title = 'Klik untuk melihat gambar lebih besar';

        qrisProofImage.onclick = (e) => {
            e.stopPropagation();
            if (window.innerWidth <= 768) {
                showQrisMobilePreview(order.qris_reference);
            } else {
                showQrisPreviewModal(order);
            }
        };
    } else {
        qrisProofSection.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    return new Promise((resolve) => {
        const confirmBtn = document.getElementById('confirmProcessOrder');
        const cancelBtn = document.getElementById('cancelProcessOrder');

        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

        const cleanup = () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        };

        const confirmHandler = async () => {
            const originalHTML = newConfirmBtn.innerHTML;
            newConfirmBtn.disabled = true;
            newConfirmBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Memproses...`;

            try {
                const success = await processOrderConfirmation(order); 

                cleanup(); 

                if (success) {
                    await viewTransactionReceiptFromDB(order.orders_number);
                }
            } catch (err) {
                console.error('❌ Gagal memproses pesanan:', err);
                showNotification('Gagal memproses pesanan', 'error');
                cleanup(); 
            } finally {
                newConfirmBtn.disabled = false;
                newConfirmBtn.innerHTML = originalHTML;
            }
        };

        const cancelHandler = () => {
            cleanup();
            showNotification('Pemrosesan pesanan dibatalkan', 'info');
        };

        newConfirmBtn.addEventListener('click', confirmHandler);
        newCancelBtn.addEventListener('click', cancelHandler);
    });
}

function showQrisPreviewModal(order) {
    if (window.innerWidth <= 768) {
        showQrisMobilePreview(order.qris_reference);
        return;
    }

    const previewModal = document.getElementById('qrisPreviewModal');
    const previewImage = document.getElementById('qrisPreviewImage');
    const orderNumberElement = document.getElementById('qrisOrderNumber');

    orderNumberElement.textContent = order.orders_number;
    previewImage.src = order.qris_reference;

    previewModal.classList.remove('hidden');
    previewModal.classList.add('flex');

    const closeBtn = document.getElementById('closeQrisPreview');
    const confirmBtn = document.getElementById('confirmFromQrisPreview');

    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    const cleanup = () => {
        previewModal.classList.add('hidden');
        previewModal.classList.remove('flex');
    };

    const closeHandler = () => {
        cleanup();
        showOrderConfirmationModal(order);
    };

    const confirmHandler = async () => {
        cleanup();
        const originalHTML = newConfirmBtn.innerHTML;
        newConfirmBtn.disabled = true;
        newConfirmBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Memproses...`;

        try {
            const success = await processOrderConfirmation(order); 

            if (success) {
                await viewTransactionReceiptFromDB(order.orders_number);
            }
        } catch (err) {
            console.error('❌ Gagal memproses pesanan dari preview:', err);
            showNotification('Gagal memproses pesanan', 'error');
        } finally {
            newConfirmBtn.disabled = false;
            newConfirmBtn.innerHTML = originalHTML;
        }
    };

    newCloseBtn.addEventListener('click', closeHandler);
    newConfirmBtn.addEventListener('click', confirmHandler);
}

async function viewOnlineOrderReceipt(ordersNumber) {
    if (!isLoggedIn) {
        showLoginModal();
        return;
    }
    try {
        await viewTransactionReceiptFromDB(ordersNumber);
    } catch (error) {
        console.error('Error viewing online order receipt:', error);
        showNotification('Gagal memuat struk pesanan', 'error');
    }
}

async function renderTransactionHistory(searchTerm = '') {
    if (!isLoggedIn) return;

    const historyList = document.getElementById('transactionHistoryList');
    historyList.innerHTML = `
    <div class="text-center py-4 text-gray-400 animate-pulse">
      <i class="fas fa-spinner fa-spin text-lg"></i> Memuat riwayat transaksi...
    </div>
  `;

    try {
        const { data: transactionHistory, error } = await supabase
            .from('orders')
            .select('*')
            .order('order_date', { ascending: false })
            .limit(500);

        if (error) throw error;

        let filteredTransactions = transactionHistory || [];

        if (searchTerm) {
            const searchTermLower = searchTerm.toLowerCase();
            filteredTransactions = filteredTransactions.filter(transaction =>
                (transaction.orders_number && transaction.orders_number.toLowerCase().includes(searchTermLower)) ||
                (transaction.order_date && transaction.order_date.toLowerCase().includes(searchTermLower)) ||
                (transaction.product_list && transaction.product_list.toLowerCase().includes(searchTermLower)) ||
                (transaction.customers_name && transaction.customers_name.toLowerCase().includes(searchTermLower))
            );
        }

        if (filteredTransactions.length === 0) {
            historyList.innerHTML = `
        <div class="text-center py-8 text-gray-500">
          <i class="fas fa-receipt text-3xl mb-3"></i>
          <p class="text-sm">Tidak ada riwayat transaksi</p>
          ${searchTerm ? `<p class="text-xs text-gray-400">Untuk pencarian "${searchTerm}"</p>` : ''}
        </div>
      `;
            return;
        }

        historyList.innerHTML = filteredTransactions.map(transaction => `
      <div class="transaction-history-item hover:bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2 transition"
           onclick="event.stopPropagation(); handleViewReceipt('${transaction.orders_number}')">

        <div class="flex justify-between items-start">
          <div class="flex-1">
            <div class="font-semibold text-sm text-gray-800">${transaction.orders_number}</div>

            <div class="text-xs text-gray-600">${new Date(transaction.order_date).toLocaleString('id-ID')}</div>

            <div class="text-xs text-blue-600 font-medium mt-0.5">
              ${transaction.customers_name ? transaction.customers_name : '-'}
            </div>

            <div class="text-xs text-gray-700 mt-1 line-clamp-2">
              ${transaction.product_list || ''}
            </div>
          </div>

          <div class="text-right">
            <div class="font-bold text-sm text-gray-800">Rp ${transaction.subtotal?.toLocaleString('id-ID') || 0}</div>
            <div class="text-xs text-gray-600 mt-0.5">
              ${transaction.payment_methode === 'tunai' ? 'Tunai' : 'QRIS'}
            </div>
          </div>
        </div>

        <button class="process-order-btn mt-2 py-1.5 rounded-md text-white text-xs font-medium transition"
                style="background-color: #3B82F6;"
                onclick="event.stopPropagation(); handleViewReceipt('${transaction.orders_number}')">
          Lihat Nota
        </button>
      </div>
    `).join('');

    } catch (error) {
        console.error('Gagal memuat riwayat transaksi:', error);
        historyList.innerHTML = `
      <div class="text-center py-8 text-red-500">
        <i class="fas fa-triangle-exclamation text-2xl mb-2"></i>
        <p class="text-sm">Terjadi kesalahan saat memuat riwayat transaksi.</p>
      </div>
    `;
    }
}

async function handleViewReceipt(ordersNumber) {
    const onlineOrdersMenu = document.getElementById('onlineOrdersMenu');
    if (onlineOrdersMenu && onlineOrdersMenu.classList.contains('show')) {
        onlineOrdersMenu.classList.remove('show');
        setTimeout(() => {
            onlineOrdersMenu.classList.add('hidden');
        }, 300);
    }
    await viewTransactionReceiptFromDB(ordersNumber);
}

async function viewTransactionReceiptFromDB(ordersNumber) {
    if (!isLoggedIn) {
        showLoginModal();
        return;
    }

    const order = await getOrder(ordersNumber);
    const orderItems = await getOrderItems(ordersNumber);

    if (!order || !orderItems) {
        showNotification('Gagal mengambil data transaksi', 'error');
        return;
    }

    let deliveryFee = 0;
    try {
        if (order.email_customers) {
            console.log('🚚 Fetching delivery fee via RPC...');
            const { data: feeData, error: feeError } = await supabase.rpc('delivery_fee', {
                email_input: order.email_customers, 
                order_id_input: ordersNumber 
            });

            if (!feeError && feeData !== null) {
                deliveryFee = parseFloat(feeData);
                console.log('✅ Delivery Fee:', deliveryFee);
            } else {
                if (order.delivery_fee) {
                    deliveryFee = parseFloat(order.delivery_fee);
                }
                if (feeError) console.warn('RPC delivery_fee warning:', feeError);
            }
        }
    } catch (err) {
        console.error('Error fetching delivery fee:', err);
    }

    generateReceiptFromDB(order, orderItems, deliveryFee);

    document.getElementById('receiptModal').classList.remove('hidden');
    document.getElementById('receiptModal').classList.add('flex');
}

function generateReceiptFromDB(order, orderItems, deliveryFee = 0) {
    const receiptContent = document.getElementById('receiptContent');
    const subtotal = order.subtotal;
    const paymentMethod = order.payment_methode;
    
    const grandTotal = subtotal + deliveryFee;
    
    const cashAmount = paymentMethod === 'tunai' ? grandTotal : 0; 
    
    const orderDate = new Date(order.order_date);
    const formattedDate = orderDate.toLocaleString('id-ID');

    const customerName = order.customers_name || '';
    const role = orderItems[0]?.role || '';
    
    const telpNumber = orderItems[0]?.telp_number || null;
    currentReceiptPhoneNumber = telpNumber;

    const notes = order.note || orderItems[0]?.notes?.trim() || '';

    const deliveryList = [order.delivery_option, ...orderItems.map(i => i.delivery_option)]
        .filter(v => v && v.trim() !== '');

    const deliveryOption = (() => {
        if (deliveryList.length === 0) return 'Ambil Sendiri';
        const seen = new Set();
        const unique = [];
        for (const d of deliveryList) {
            const clean = d.trim();
            const key = clean.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(clean);
            }
        }
        return unique.length ? unique[0] : 'Ambil Sendiri';
    })();

    const isDelivered = deliveryOption.toLowerCase().includes('diantar');
    
    const rawPlace = orderItems[0]?.place;
    const place = (isDelivered && rawPlace) ? rawPlace : '';

    receiptContent.innerHTML = `
    <div class="text-center mb-3">
      <h4 class="font-bold text-md">AKSARA-MART</h4>
      <p class="text-xs">Jalan Keputih Tegal No 54, Surabaya</p>
      <p class="text-xs">Telp: 0888-1343-038</p>
    </div>

    <div class="border-t border-b border-dashed py-2 mb-2">
      <div class="flex justify-between text-xs">
        <span>Tanggal:</span>
        <span>${formattedDate}</span>
      </div>
      <div class="flex justify-between text-xs">
        <span>No. Order:</span>
        <span>${order.orders_number}</span>
      </div>

      ${customerName ? `
      <div class="flex justify-between text-xs">
        <span>Pelanggan:</span>
        <span>${customerName}${role ? ' - ' + role : ''}</span>
      </div>` : ''}

      ${place ? `
      <div class="flex justify-between text-xs">
        <span>Tempat:</span>
        <span>${place}</span>
      </div>` : ''}

      ${notes ? `
      <div class="flex justify-between text-xs">
        <span>Catatan:</span>
        <span>${notes}</span>
      </div>` : ''}

      ${deliveryOption ? `
      <div class="flex justify-between text-xs">
        <span>Pengiriman:</span>
        <span>${deliveryOption}</span>
      </div>` : ''}
    </div>

    <div class="space-y-1 mb-2">
      ${orderItems.map(item => `
        <div class="flex justify-between text-xs">
          <div class="flex-1">
            <div>${item.product_name}</div>
            <div class="text-gray-500">${item.quantity} x Rp ${item.price.toLocaleString('id-ID')}</div>
          </div>
          <div>Rp ${(item.price * item.quantity).toLocaleString('id-ID')}</div>
        </div>
      `).join('')}
    </div>

    <div class="border-t border-dashed pt-2">
      <div class="flex justify-between font-bold text-xs mb-1">
        <span>Subtotal:</span>
        <span>Rp ${subtotal.toLocaleString('id-ID')}</span>
      </div>

      ${(isDelivered || deliveryFee > 0) ? `
      <div class="flex justify-between text-xs mb-1">
        <span>Biaya Pengiriman:</span>
        <span>Rp ${deliveryFee.toLocaleString('id-ID')}</span>
      </div>` : ''}

      <div class="flex justify-between font-bold text-sm mt-1 border-t border-dashed pt-1">
        <span>Total:</span>
        <span>Rp ${grandTotal.toLocaleString('id-ID')}</span>
      </div>

      <div class="flex justify-between text-xs mt-1">
        <span>Pembayaran:</span>
        <span>${paymentMethod === 'tunai' ? 'Tunai' : 'QRIS'}</span>
      </div>

      ${paymentMethod === 'tunai' ? `
      <div class="flex justify-between text-xs mt-1">
        <span>Bayar:</span>
        <span>Rp ${cashAmount.toLocaleString('id-ID')}</span>
      </div>` : `
      <div class="text-center text-green-600 text-xs mt-2">
        <i class="fas fa-qrcode mr-1"></i>Bukti QRIS telah terverifikasi 
      </div>`}
    </div>

    <div class="text-center mt-3 text-xs">
      <p>Terima kasih sudah belanja <br> di Aksara-Mart 🙏😊.</p>
    </div>
  `;
}

function showQrisMobilePreview(imageSrc) {
    const modal = document.getElementById('qrisMobilePreviewModal');
    const image = document.getElementById('qrisMobilePreviewImage');

    if (!modal || !image) {
        console.error('Modal QRIS mobile tidak ditemukan');
        return;
    }

    image.src = imageSrc;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeQrisMobilePreview() {
    const modal = document.getElementById('qrisMobilePreviewModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    document.body.style.overflow = 'auto';
}

function setupQrisMobileListeners() {
    const closeBtn = document.getElementById('closeQrisMobilePreview');
    const modal = document.getElementById('qrisMobilePreviewModal');

    if (closeBtn) {
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

        newCloseBtn.addEventListener('click', closeQrisMobilePreview);
        newCloseBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            closeQrisMobilePreview();
        });
    }

    if (modal) {
        modal.addEventListener('click', function (e) {
            if (e.target === this) {
                closeQrisMobilePreview();
            }
        });
    }
}

if ('serviceWorker' in navigator) {
    const swCode = `
    self.addEventListener("install", e => {
      e.waitUntil(
        caches.open("aksara-cache").then(cache => {
          return cache.addAll(["./"]);
        })
      );
    });
    self.addEventListener("fetch", e => {
      e.respondWith(
        caches.match(e.request).then(resp => {
          return resp || fetch(e.request);
        })
      );
    });
  `;
    const blob = new Blob([swCode], { type: 'application/javascript' });
    const swUrl = URL.createObjectURL(blob);
    navigator.serviceWorker.register(swUrl)
        .then(reg => console.log("Service Worker registered:", reg))
        .catch(err => console.error("SW registration failed:", err));
}

function showQrisFullscreen(imageSrc) {
    const fullscreenModal = document.getElementById('qrisFullscreenModal');
    const fullscreenImage = document.getElementById('qrisFullscreenImage');

    fullscreenImage.src = imageSrc;
    fullscreenModal.classList.remove('hidden');
    fullscreenModal.style.display = 'flex';
}

function closeQrisFullscreen() {
    const fullscreenModal = document.getElementById('qrisFullscreenModal');
    fullscreenModal.classList.add('hidden');
    fullscreenModal.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', function () {
    const closeBtn = document.getElementById('closeQrisFullscreen');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeQrisFullscreen);
    }

    const qrisProofImg = document.getElementById('qrisProofImage');
    if (qrisProofImg) {
        qrisProofImg.onclick = function () {
            const full = document.getElementById("qrisFullscreen");
            const img = document.getElementById("qrisFullscreenImg");
            img.src = this.src;
            full.style.display = "flex";
        };
    }

    const qrisPreviewImg = document.getElementById("qrisPreviewImage");
    if (qrisPreviewImg) {
        qrisPreviewImg.onclick = function () {
            const full = document.getElementById("qrisFullscreen");
            const img = document.getElementById("qrisFullscreenImg");
            img.src = this.src;
            full.style.display = "flex";
        };
    }
});

window.addEventListener('scroll', () => {
    const glass = document.querySelector('.sticky-search-section .glass-effect');
    if (!glass) return;
    const blur = 28 + Math.min(window.scrollY / 25, 12);
    const alpha = 0.03 + Math.min(window.scrollY / 2000, 0.05);
    glass.style.backdropFilter = `blur(${blur}px) saturate(200%)`;
    glass.style.background = `rgba(255, 255, 255, ${alpha})`;
});

function enableNotificationSound() {
    const sound = document.getElementById("notificationSound");
    if (!sound) return;

    sound.volume = 1.0;
    sound.play().then(() => {
        sound.pause();
        sound.currentTime = 0;
        console.log("🔊 Notification sound unlocked and ready.");
        document.removeEventListener("click", enableNotificationSound);
        document.removeEventListener("touchstart", enableNotificationSound);
    }).catch(() => { });
}

document.addEventListener("click", enableNotificationSound);
document.addEventListener("touchstart", enableNotificationSound);
