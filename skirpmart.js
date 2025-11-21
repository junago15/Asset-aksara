/* ===== Perbaikan realtime + badge + ringtone + product list (gantikan blok lama) ===== */

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
    // Variabel untuk menyimpan HTML asli tombol logout
    let originalLogoutHtml = '<i class="fas fa-sign-out-alt w-4 h-4 mr-2 opacity-70"></i> Logout'; // Fallback
    // --- AKHIR PERBAIKAN ---

    // Realtime channels references (so bisa unsubscribe)
    let ordersChannel = null;
    let customerChannel = null;
    let productsChannel = null;
    let authSubscription = null;

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

    async function loadHistoryBadge() {
        try {
            if (!currentUser?.email) return;
            const { data, error } = await supabase
                .from("customers_data")
                .select("history_badge")
                .eq("email", currentUser.email)
                .single();
            if (error) {
                console.warn("[loadHistoryBadge] error", error);
                return;
            }
            updateBadge(data?.history_badge ?? 0);
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
                const { error } = await supabase
                    .from("customers_data")
                    .update({ history_badge: null })
                    .eq("email", currentUser.email);
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
            // do not autoplay here
        }
    }


    // ===== Perbaikan: play notif sound dengan anti-bentrok multi-tab =====
let isSoundPlaying = false;

function playNotifSoundWithFallback(title = "Aksara-Mart", body = "Pesanan selesai") {
    try {
        // 🔒 Cegah suara dimainkan ganda dalam waktu singkat
        if (isSoundPlaying) {
            console.log("[sound] skipped: masih bermain");
            return;
        }
        isSoundPlaying = true;
        setTimeout(() => (isSoundPlaying = false), 2000); // reset flag setelah 2 detik

        // 🚀 Broadcast ke tab lain supaya tahu ada notifikasi
        localStorage.setItem("aksara_notif_trigger", Date.now().toString());

        ensureNotifSoundReady();

        // Mainkan suara
        notifSound.currentTime = 0;
        notifSound
            .play()
            .then(() => console.log("[sound] played successfully"))
            .catch((err) => {
                console.warn("[sound] play blocked:", err);

                // 🔔 Fallback visual
                if (typeof showNotification === "function") {
                    showNotification(body, "success");
                }

                // 💻 Fallback notifikasi desktop
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


    // Listener supaya tab lain skip play suara
    window.addEventListener("storage", (event) => {
        if (event.key === "aksara_notif_trigger") {
            console.log("[multi-tab] notif dari tab lain, skip suara");
            // ✅ di sini bisa tambahin visual fallback saja biar user tetap tahu
            if (typeof showNotification === "function") {
                showNotification("Pesananmu selesai!", "success");
            }
        }
    });

    // Unlock audio by first user gesture (call once)
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


    /* ----- Products realtime listener (NEW) ----- */
    function setupProductsChannel() {
        try {
            if (productsChannel) {
                // already created
                return;
            }

            productsChannel = supabase.channel("products-channel");

            productsChannel.on(
                "postgres_changes",
                { event: "*", schema: "public", table: "product_list" },
                async (payload) => {
                    console.log("[products] realtime update:", payload);
                    try {
                        // Refresh products list tanpa notifikasi
                        await fetchProductsFromSupabase();
                    } catch (err) {
                        console.error("[products handler] error", err);
                    }
                }
            );

            // subscribe
            productsChannel.subscribe().then((status) => {
                console.log("[productsChannel subscribe] status:", status);
            }).catch(e => console.warn("[productsChannel subscribe] catch:", e));

        } catch (err) {
            console.error("[setupProductsChannel] error", err);
        }
    }

    // ----- Orders realtime listener (fix: tanpa increment di frontend) -----
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
                        // refresh order history UI
                        fetchOrderHistory().catch(e => console.warn("[fetchOrderHistory] failed", e));

                        const newRow = payload?.new ?? null;
                        if (!newRow) return;

                        const newStatus = (newRow.status ?? "").toString().toLowerCase().trim();
                        const targetEmail = newRow.email_customers ?? null;
                        const completedStatuses = ["completed", "finish", "selesai", "done", "finished", "complete"];

                        if (!targetEmail) return;

                        // ✅ cukup load badge tanpa increment manual
                        if (completedStatuses.some(s => newStatus.includes(s))) {
                            if (currentUser?.email && currentUser.email === targetEmail) {
                                // sync badge dari DB
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

    /* ----- Subscribe ke customers_data khusus user untuk realtime badge update ----- */
    function subscribeCustomerRow(email) {
        try {
            // unsubscribe previous
            if (customerChannel) {
                try { customerChannel.unsubscribe(); } catch (e) { console.warn("[customerChannel] unsubscribe error", e); }
                customerChannel = null;
            }
            if (!email) return;

            // create channel filtered by email
            customerChannel = supabase.channel("customer-badge-" + email);

            // filter query must be "email=eq.<value>" (no quotes)
            customerChannel.on(
                "postgres_changes",
                { event: "*", schema: "public", table: "customers_data", filter: `email=eq.${email}` },
                payload => {
                    console.log("[customers_data] payload for", email, payload);
                    // whenever row change -> reload badge
                    loadHistoryBadge().catch(e => console.warn("[loadHistoryBadge] failed", e));
                }
            );

            customerChannel.subscribe().then(status => {
                console.log("[customerChannel subscribe] status:", status);
                // initial load
                loadHistoryBadge().catch(e => console.warn("[loadHistoryBadge] initial failed", e));
            }).catch(e => console.warn("[customerChannel subscribe] err", e));
        } catch (err) {
            console.error("[subscribeCustomerRow] error", err);
        }
    }

    /* ----- Auth state handling ----- */
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
                // Panggil fungsi cleanup UI logout jika tidak ada sesi
                updateUIAfterLogout(); 
            }

            // ensure global orders channel exists
            setupOrdersChannel();

            // ensure global products channel exists (NEW)
            setupProductsChannel();

            // attach auth state listener once
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
                        // logged out
                        // Panggil fungsi cleanup UI yang sudah terpusat
                        updateUIAfterLogout();
                    }
                });
                authSubscription = listener;
            }
        } catch (err)
        {
            console.error("[checkAuthStateAndInit] error", err);
        }
    }

    // start it
    checkAuthStateAndInit();

    /* ----- small helper: safe unsubscribe all (dev) ----- */
    function cleanupRealtime() {
        try {
            if (ordersChannel) ordersChannel.unsubscribe().catch(() => { });
            if (customerChannel) customerChannel.unsubscribe().catch(() => { });
            if (productsChannel) productsChannel.unsubscribe().catch(() => { });
            if (authSubscription?.subscription) authSubscription.subscription.unsubscribe();
        } catch (e) { console.warn("[cleanupRealtime] ", e); }
    }
    /* ===== End of block ===== */
    
    // Fungsi untuk memperbarui waktu
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

    // Fungsi untuk menampilkan notifikasi
    function showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        const icon = document.getElementById('notificationIcon');
        const messageEl = document.getElementById('notificationMessage');

        // Show notification first
        notification.classList.remove('hidden');

        // Set icon and color based on type
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
        // Show notification with animation
        notification.classList.remove('translate-x-full');
        notification.classList.add('translate-x-0');
        // Hide after 3 seconds
        setTimeout(() => {
            notification.classList.remove('translate-x-0');
            notification.classList.add('translate-x-full');
            // Hide completely after animation
            setTimeout(() => {
                notification.classList.add('hidden');
            }, 300);
        }, 3000);
    }

    // Fungsi untuk menampilkan spinner pada tombol
    function showButtonSpinner(buttonId, spinnerId, buttonTextId) {
        document.getElementById(buttonTextId).classList.add('hidden');
        document.getElementById(spinnerId).classList.remove('hidden');
        document.getElementById(buttonId).disabled = true;
    }

    // Fungsi untuk menyembunyikan spinner pada tombol
    function hideButtonSpinner(buttonId, spinnerId, buttonTextId) {
        document.getElementById(buttonTextId).classList.remove('hidden');
        document.getElementById(spinnerId).classList.add('hidden');
        document.getElementById(buttonId).disabled = false;
    }

    // Setup scroll button functionality
    function setupScrollButton() {
        const scrollButton = document.getElementById('scrollToTop');

        // Show/hide scroll button based on scroll position
        window.addEventListener('scroll', function () {
            if (window.pageYOffset > 300) {
                scrollButton.classList.add('show');
            } else {
                scrollButton.classList.remove('show');
            }
        });

        // Scroll to top when button is clicked
        scrollButton.addEventListener('click', function () {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
    
    // Fungsi untuk mengecek status autentikasi - DIPERBAIKI
    async function checkAuthState() {
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) throw error;

            if (session) {
                currentUser = session.user;
                await fetchUserProfile();
                updateUIAfterLogin();

                // ✅ Sync badge dengan DB (panggil fungsi baru)
                await loadHistoryBadge();
            } else {
                // User not logged in
                // Panggil fungsi cleanup UI yang terpusat
                updateUIAfterLogout();
            }
        } catch (error) {
            console.error('Error checking auth state:', error);
        }
    }

    // Fungsi untuk validasi password
    function validatePassword() {
        const password = document.getElementById('registerPassword').value;
        const submitBtn = document.getElementById('registerSubmitBtn');
        const passwordRules = document.getElementById('passwordRules');

        // Password rules
        const hasMinLength = password.length >= 8;
        const hasUppercase = /[A-Z]/.test(password);
        const hasLowercase = /[a-z]/.test(password);
        const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

        // Update rule indicators
        updateRuleIndicator('rule-length', hasMinLength);
        updateRuleIndicator('rule-uppercase', hasUppercase);
        updateRuleIndicator('rule-lowercase', hasLowercase);
        updateRuleIndicator('rule-symbol', hasSymbol);

        // Enable submit button only if all rules are met
        const isValid = hasMinLength && hasUppercase && hasLowercase && hasSymbol;
        submitBtn.disabled = !isValid;

        // Show password rules only if password is not empty and not valid
        if (password && !isValid) {
            passwordRules.classList.add('show');
        } else {
            passwordRules.classList.remove('show');
        }

        return isValid;
    }

    // Update the visual indicator for a password rule
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

    // Fungsi untuk mengganti tab autentikasi
    function switchAuthTab(tabName) {
        // Update tab UI
        document.querySelectorAll('.auth-tab').forEach(tab => {
            if (tab.dataset.tab === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Update form UI
        document.querySelectorAll('.auth-form').forEach(form => {
            if (form.id === tabName + 'Form') {
                form.classList.add('active');
            } else {
                form.classList.remove('active');
            }
        });

        // Update modal title
        document.getElementById('authModalTitle').textContent =
            tabName === 'login' ? 'Login ke Aksara-Mart' : 'Daftar Akun Baru';
    }

    // Fungsi untuk membuka modal autentikasi
    function openAuthModal(defaultTab = 'login') {
        switchAuthTab(defaultTab);
        document.getElementById('authModal').classList.add('open');
        document.getElementById('authOverlay').classList.add('open');
    }

    // Fungsi untuk menutup modal autentikasi
    function closeAuthModal() {
        document.getElementById('authModal').classList.remove('open');
        document.getElementById('authOverlay').classList.remove('open');
    }

    // Tampilkan modal verifikasi email dengan countdown
    function showVerificationModal() {
        document.getElementById('verificationModal').classList.add('open');
        document.getElementById('verificationOverlay').classList.add('open');

        let timeLeft = 60; // bisa 60 juga kalau mau
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

    // Tutup modal verifikasi email
    function closeVerificationModal() {
        document.getElementById('verificationModal').classList.remove('open');
        document.getElementById('verificationOverlay').classList.remove('open');
    }

    // Fungsi untuk mengambil data produk dari Supabase (DENGAN SORTING BARU)
    async function fetchProductsFromSupabase() {
        try {
            // Menampilkan indikator loading
            document.getElementById('productsGrid').innerHTML = `
            <div class="col-span-full text-center py-8">
                <i class="fas fa-spinner fa-spin text-2xl text-purple-600 mb-3"></i>
                <p class="text-gray-600 text-sm">Memuat produk...</p>
            </div>
        `;

            // Mengambil data dari tabel product_list (tanpa order SQL, kita sort di JS)
            const { data, error } = await supabase
                .from('product_list')
                .select('*');


            if (error) {
                throw error;
            }

            // Memetakan data dari Supabase ke format yang diharapkan
            products = data.map(item => ({
                id: item.id,
                name: item.name,
                price: item.price,
                category: item.category,
                barcode: item.barcode,
                image: item.image,
                stock: item.stock
            }));

            // === LOGIKA SORTING CUSTOM (Kategori -> Nama A-Z) ===
            
            // 1. Definisikan bobot/urutan kategori
            const categoryPriority = {
                "makanan": 1,
                "minuman": 2,
                "jasa printing": 3,
                "atk": 4
            };

            // Fungsi helper untuk mendapatkan bobot
            const getCategoryWeight = (cat) => {
                // pastikan lowercase dan trim spasi
                const c = (cat || "").toLowerCase().trim();
                // jika tidak ada di list, kasih angka besar (biar di bawah)
                return categoryPriority[c] || 99; 
            };

            // 2. Lakukan sorting
            products.sort((a, b) => {
                const weightA = getCategoryWeight(a.category);
                const weightB = getCategoryWeight(b.category);

                // a. Cek Kategori dulu
                if (weightA !== weightB) {
                    return weightA - weightB; // Urutkan berdasarkan bobot (kecil ke besar)
                }

                // b. Jika kategori sama (bobot sama), urutkan Nama (A-Z)
                const nameA = (a.name || "").toLowerCase();
                const nameB = (b.name || "").toLowerCase();

                if (nameA < nameB) return -1;
                if (nameA > nameB) return 1;
                return 0;
            });
            // === AKHIR LOGIKA SORTING ===

            // Merender produk setelah data berhasil diambil dan diurutkan
            renderProducts();

        } catch (error) {
            console.error(error);
        }
    }

    function renderProducts() {
        try {
            let filteredProducts = products;

            // Jika ada pencarian, abaikan filter kategori
            if (currentSearch && currentSearch.trim() !== '') {
                const keyword = currentSearch.toLowerCase();
                filteredProducts = products.filter(p =>
                    p.name.toLowerCase().includes(keyword) ||
                    (p.category && p.category.toLowerCase().includes(keyword))
                );
            } else if (currentCategory !== 'all') {
                // Kalau tidak ada pencarian, baru pakai filter kategori
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

    // ANIMASI BARU: Animasi item mengambang ke keranjang
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

    // Tambah ke keranjang dengan cek stok
    function addToCart(productId) {
        const product = products.find(p => p.id === productId);
        if (!product) return;

        const existingItem = cart.find(item => item.id === productId);
        const currentQty = existingItem ? existingItem.quantity : 0;

        // Hitung stok tersedia
        const availableStock = (product.stock === null || product.stock === undefined) ? Infinity : Number(product.stock);

        // Cek stok cukup
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

    // Tambah ke keranjang dengan animasi + cek stok
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

        // Posisi animasi
        const rect = element.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;

        element.classList.add('clicked');
        setTimeout(() => element.classList.remove('clicked'), 600);

        createFloatingItem(startX, startY, productId);

        addToCart(productId);
    }

    // Hapus dari keranjang
    function removeFromCart(productId) {
        cart = cart.filter(item => item.id !== productId);
        renderCart();
    }

    // Update kuantitas item dengan cek stok
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
    
    // ANIMASI BARU: Tampilkan modal sukses
    function showSuccessModal(message) {
        document.getElementById('successMessage').textContent = message;
        document.getElementById('successModal').classList.add('open');
        document.getElementById('successOverlay').classList.add('open');
    }

    // ANIMASI BARU: Tutup modal sukses
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

        // Reset proof upload
        document.getElementById('proofUpload').value = '';
        document.getElementById('proofPreview').style.display = 'none';
        document.getElementById('confirmQris').disabled = true;

        // --- PERUBAHAN DIMULAI ---
        // Reset label text
        const proofLabel = document.querySelector('.proof-upload-label');
        if (proofLabel) {
            proofLabel.textContent = 'Upload Bukti Pembayaran';
        }
        // --- PERUBAHAN SELESAI ---
    }
    // ✅ Tambahkan ini di bawahnya
    document.getElementById("cancelQris").addEventListener("click", closeQrisModal);

    const proofInput = document.getElementById('proofUpload');
    const confirmBtn = document.getElementById('confirmQris');
    const previewImg = document.getElementById('previewImage');
    const previewBox = document.getElementById('proofPreview');

    // --- PERUBAHAN DIMULAI ---
    const proofLabel = document.querySelector('.proof-upload-label'); // Ambil label
    const removeProofBtn = document.getElementById('removeProof'); // Ambil tombol hapus

    // Sembunyikan tombol "Hapus" seperti yang diminta
    if (removeProofBtn) {
        removeProofBtn.style.display = 'none';
    }
    // --- PERUBAHAN SELESAI ---


    if (proofInput) {
        proofInput.addEventListener('change', function () {
            if (this.files && this.files.length > 0) {
                
                // --- PERUBAHAN DIMULAI ---
                // Ubah teks label
                if (proofLabel) {
                    proofLabel.textContent = 'Ubah File Bukti';
                }
                // --- PERUBAHAN SELESAI ---

                // tampilkan preview gambar
                const file = this.files[0];
                const reader = new FileReader();
                reader.onload = function (e) {
                    previewImg.src = e.target.result;
                    previewBox.style.display = 'block';
                };
                reader.readAsDataURL(file);

                // aktifkan tombol konfirmasi
                confirmBtn.disabled = false;
            } else {

                // --- PERUBAHAN DIMULAI ---
                // Kembalikan teks label
                if (proofLabel) {
                    proofLabel.textContent = 'Upload Bukti Pembayaran';
                }
                // --- PERUBAHAN SELESAI ---

                // sembunyikan preview dan nonaktifkan tombol
                previewBox.style.display = 'none';
                confirmBtn.disabled = true;
            }
        });
    }

    // Fungsi untuk mengambil profil pengguna
    async function fetchUserProfile() {
        try {
            if (!currentUser) return;

            // Check if user exists in customers_data table
            const { data: customerData, error: customerError } = await supabase
                .from('customers_data')
                .select('*')
                .eq('email', currentUser.email)
                .single();

            if (customerError) {
                // Jika profil tidak ditemukan, buat profil default
                if (customerError.code === 'PGRST116') {
                    userProfile = null;
                    showNotification('Silakan lengkapi profil Anda', 'info');
                } else {
                    throw customerError;
                }
            } else {
                userProfile = customerData;
            }
        } catch (error) {
            console.error('Error fetching user profile:', error);
            showNotification('Gagal memuat profil pengguna', 'error');
        }
    }

    // --- PERBAIKAN STUCK SPINNER ---
    // Fungsi untuk memperbarui UI setelah login
    function updateUIAfterLogin() {
        document.getElementById('profileText').textContent = 'Profil';
        document.getElementById('editProfileBtn').classList.remove('hidden');
        
        // Temukan tombol logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.classList.remove('hidden'); // 1. Tampilkan
            
            // 2. PAKSA RESET state-nya, siapa tahu nyangkut dari logout sebelumnya
            logoutBtn.innerHTML = originalLogoutHtml; 
            logoutBtn.disabled = false;
        }

        if (userProfile) {
            // Isi form profil jika data sudah ada
            document.getElementById('profileName').value = userProfile.name || '';
            document.getElementById('profileEmail').value = currentUser.email;
            document.getElementById('profilePhone').value = userProfile.telp_number || '';
            document.getElementById('profileRole').value = userProfile.role || 'siswa';

            // Tentukan nilai untuk place berdasarkan role
            if (userProfile.role === 'guru') {
                document.getElementById('profileOffice').value = userProfile.place || '';
            } else {
                document.getElementById('profileClass').value = userProfile.place || '';
            }

            // Tampilkan field yang sesuai dengan peran
            toggleRoleFields(userProfile.role || 'siswa');
        } else {
            // Isi dengan data default
            document.getElementById('profileName').value = '';
            document.getElementById('profileEmail').value = currentUser.email;
            document.getElementById('profilePhone').value = '';
            document.getElementById('profileRole').value = 'siswa';
            document.getElementById('profileOffice').value = '';
            document.getElementById('profileClass').value = '';

            // Tampilkan field yang sesuai dengan peran default
            toggleRoleFields('siswa');
        }
    }
    // --- AKHIR PERBAIKAN ---
    
    // --- PERBAIKAN STUCK SPINNER ---
    // Fungsi untuk memperbarui UI setelah logout
    function updateUIAfterLogout() {
        console.log("[auth] updating UI for logout");
        currentUser = null;
        userProfile = null;
        updateBadge(null); // Sembunyikan badge

        // Reset teks tombol profil
        const profileText = document.getElementById('profileText');
        if (profileText) {
            profileText.textContent = 'Login';
        }

        // Sembunyikan tombol edit profil
        const editProfileBtn = document.getElementById('editProfileBtn');
        if (editProfileBtn) {
            editProfileBtn.classList.add('hidden');
        }
        
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.classList.add('hidden'); // 1. Sembunyikan
            
            // 2. PAKSA RESET state-nya agar bersih saat login lagi
            logoutBtn.innerHTML = originalLogoutHtml;
            logoutBtn.disabled = false;
        }

        // Sembunyikan menu dropdown profil
        const profileMenu = document.getElementById('profileMenu');
        if (profileMenu) {
            profileMenu.classList.add('hidden');
        }
        
        // Hentikan langganan channel customer (jika ada)
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
    // --- AKHIR PERBAIKAN ---


    // Fungsi untuk menampilkan/menyembunyikan field berdasarkan peran
    function toggleRoleFields(role) {
        if (role === 'guru') {
            document.getElementById('profileOfficeField').classList.remove('hidden');
            document.getElementById('profileClassField').classList.add('hidden');
        } else {
            document.getElementById('profileOfficeField').classList.add('hidden');
            document.getElementById('profileClassField').classList.remove('hidden');
        }
    }

    // Fungsi untuk validasi profil lengkap
    function isProfileComplete() {
        if (!userProfile) return false;

        const requiredFields = ['name', 'role', 'place'];
        for (const field of requiredFields) {
            if (!userProfile[field]) return false;
        }

        return true;
    }

    // Fungsi untuk membuka modal profil
    function openProfileModal() {
        if (!currentUser) {
            openAuthModal('login');
            return;
        }

        document.getElementById('profileModal').classList.add('open');
        document.getElementById('profileOverlay').classList.add('open');
    }

    // Fungsi untuk menutup modal profil
    function closeProfileModal() {
        document.getElementById('profileModal').classList.remove('open');
        document.getElementById('profileOverlay').classList.remove('open');
    }

    // Event submit form edit profil
    document.getElementById("profileForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentUser) {
            showNotification("Anda harus login dulu", "error");
            return;
        }

        const updates = {
            name: document.getElementById("profileName").value,
            telp_number: document.getElementById("profilePhone").value,
            role: document.getElementById("profileRole").value,
            place: document.getElementById("profileRole").value === "guru"
                ? document.getElementById("profileOffice").value
                : document.getElementById("profileClass").value,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from("customers_data")
            .update(updates)
            .eq("id_user", currentUser.id); // ✅ pakai uid

        if (error) {
            console.error("Update profile error:", error);
            showNotification("Gagal update profil: " + error.message, "error");
        } else {
            showNotification("Profil berhasil diperbarui!", "success");
            closeProfileModal();
            await fetchUserProfile();
        }
    });


// ==============================
// 🔄 Ambil dan tampilkan riwayat pesanan (maks 30 terakhir)
// ==============================
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

        // ⏳ Loading state
        historyList.innerHTML = `
            <div class="text-center py-8">
                <i class="fas fa-spinner fa-spin text-2xl text-purple-600 mb-3"></i>
                <p class="text-gray-600 text-sm">Memuat riwayat...</p>
            </div>
        `;

        // 🧭 Ambil maksimal 30 transaksi terbaru dari Supabase
        const { data: orders, error } = await supabase
            .from('orders')
            .select('*')
            .eq('email_customers', currentUser.email)
            .order('order_date', { ascending: false })
            .limit(30); // ✅ hanya ambil 30 transaksi terakhir

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

        // ✅ Tampilkan hasil
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

// ==============================
// 🧾 Render daftar riwayat pesanan
// ==============================
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
        // 📅 Format tanggal dan waktu
        const rawDate = order.order_date || order.created_at || null;
        const orderDate = rawDate ? new Date(rawDate) : null;
        const formattedDate = orderDate
            ? orderDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
            : '-';
        const formattedTime = orderDate
            ? orderDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            : '';

        // 🎨 Warna status
        let statusColor = 'bg-gray-100 text-gray-800';
        let statusText = order.status || 'Tidak diketahui';

        const status = (order.status || '').toLowerCase();
        if (['selesai', 'completed', 'done', 'finish'].includes(status)) {
            statusColor = 'bg-green-100 text-green-800';
            statusText = 'Selesai';
        } else if (['pending', 'diproses', 'process', 'processing'].includes(status)) {
            statusColor = 'bg-yellow-100 text-yellow-800';
            statusText = 'Diproses';
        } else if (['dibatalkan', 'cancelled', 'batal', 'canceled'].includes(status)) {
            statusColor = 'bg-red-100 text-red-800';
            statusText = 'Dibatalkan';
        }

        // 💰 Hitung total
        const subtotal = Number(order.subtotal || 0);
        const deliveryFee = Number(order.delivery_fee || 0);
        const total = subtotal + deliveryFee;

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
                </div>
            </div>
        `;
    }).join('');
}

    function closeHistoryModal() {
        document.getElementById('historyModal').classList.remove('open');
        document.getElementById('historyOverlay').classList.remove('open');
    }

    // PERBAIKAN: Fungsi untuk mendapatkan waktu Jakarta
    function getJakartaTimestamp() {
        const now = new Date();
        // Jakarta is UTC+7
        const jakartaTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
        return jakartaTime.toISOString();
    }

    // PERBAIKAN: Fungsi untuk generate nomor pesanan unik (string)
    function generateOrderNumber() {
        const timestamp = Date.now().toString();
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return 'ORD-' + timestamp + random;
    }


    // Fungsi util: kompres image jadi webp <=70 KB
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

                    // Resize ke lebar max 800px biar tidak terlalu besar
                    const maxWidth = 800;
                    let { width, height } = img;
                    if (width > maxWidth) {
                        height = (height * maxWidth) / width;
                        width = maxWidth;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    // Kompresi berulang sampai <= maxSizeKB
                    let outputQuality = quality;
                    function tryCompress() {
                        canvas.toBlob(
                            (blob) => {
                                if (!blob) return reject("Gagal kompres gambar");
                                if (blob.size / 1024 <= maxSizeKB || outputQuality <= 0.3) {
                                    // selesai
                                    const compressedFile = new File(
                                        [blob],
                                        file.name.replace(/\.[^/.]+$/, "") + ".webp",
                                        { type: "image/webp" }
                                    );
                                    resolve(compressedFile);
                                } else {
                                    // turunkan kualitas lalu ulangi
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

    // =========================================================================
    // FUNGSI processCheckout DIMODIFIKASI UNTUK MENGGUNAKAN RPC
    // =========================================================================
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

        // Set flag untuk mencegah duplikasi
        isCheckoutInProgress = true;

        // Tampilkan loading state
        const checkoutBtn = document.getElementById('checkoutBtn');
        const originalText = checkoutBtn ? checkoutBtn.innerHTML : '';
        if (checkoutBtn) {
            checkoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';
            checkoutBtn.disabled = true;
        }

        try {
            // 1. Siapkan payload untuk Supabase Function
            // (Mengirim data mentah, membiarkan backend menghitung/memvalidasi)
            const rpcPayload = {
                cart_items: cart, // Array keranjang
                user_id_in: currentUser.id,
                profile_data_in: userProfile, // Objek profil
                payment_method_in: paymentMethod,
                delivery_option_in: deliveryOption,
                delivery_note_in: deliveryNote
            };

            // 2. Panggil Supabase Function 'v2_create_order'
            console.log("Memanggil RPC v2_create_order...");
            const { data: orderResult, error: rpcError } = await supabase.rpc(
                'v2_create_order',
                rpcPayload
            );

            // 3. Tangani Error dari RPC
            if (rpcError) {
                // Cek jika error-nya adalah dari stock check
                if (rpcError.message.includes('Stok tidak cukup')) {
                    throw new Error(rpcError.message.split('ERROR: ').pop()); // Ambil pesan error stok
                }
                throw new Error(`Gagal membuat pesanan (RPC): ${rpcError.message}`);
            }
            if (!orderResult) {
                throw new Error('Gagal membuat pesanan (RPC): Tidak ada data dikembalikan');
            }
            
            console.log("RPC v2_create_order berhasil:", orderResult);

            // 4. Tampilkan modal sukses HANYA JIKA BUKAN QRIS (cth: Tunai)
            if (paymentMethod !== 'qris') {
                let message = `Pesanan #${orderResult.order_number} berhasil diproses!`;
                if (deliveryOption === 'delivery') {
                    message += ' (Diantar - Biaya Rp 1.000)';
                } else {
                    message += ' (Ambil Sendiri)';
                }
                message += ` Metode pembayaran: Tunai.`;
                
                showSuccessModal(message); // Tampilkan modal sukses HANYA untuk tunai
            }
            
            // 5. Reset cart dan muat ulang produk (berlaku untuk tunai maupun qris)
            cart = [];
            renderCart();
            fetchProductsFromSupabase(); // Muat ulang produk untuk menampilkan stok terbaru

            // 6. Kembalikan HASIL ORDER (objek)
            return orderResult; // orderResult adalah JSONB dari RPC

        } catch (error) {
            console.error('Checkout error:', error);

            let errorMessage = error.message || 'Checkout gagal. Silakan coba lagi.';
            // Hapus prefix error yang mungkin muncul
            if (errorMessage.includes('Error creating order:')) {
                errorMessage = errorMessage.split('Error creating order:').pop().trim();
            }
            if (errorMessage.includes('VMError:')) {
                errorMessage = errorMessage.split('VMError:').pop().trim();
            }
            
            showNotification(errorMessage, 'error');
            return false; // Mengembalikan 'false' jika gagal

        } finally {
            // 7. Restore button state dan reset flag
            if (checkoutBtn) {
                checkoutBtn.innerHTML = originalText;
                checkoutBtn.disabled = cart.length === 0;
            }
            isCheckoutInProgress = false;
        }
    }
    // =========================================================================
    // AKHIR DARI MODIFIKASI processCheckout
    // =========================================================================


    // Fungsi untuk mendapatkan format produk list
    function getProductListString(cart) {
        return cart.map(item => item.name).join(', ');
    }


    function setupEventListeners() {
        // safe helper: get element by id (return null-safe)
        const $ = (id) => document.getElementById(id);

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

        // Close profile menu when clicking outside
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

                // Find the submit button & spinner/text inside form
                const submitBtn = loginForm.querySelector('button[type="submit"]');
                const btnText = $('loginButtonText');
                const btnSpinner = $('loginSpinner');

                // Show spinner
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

                    // Pengecekan profil dipindah ke onAuthStateChange atau updateUIAfterLogin
                    // if (!userProfile || !isProfileComplete()) {
                    //     setTimeout(openProfileModal, 1000);
                    // }

                    // ensure spinner visible at least 1s
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

        // REGISTER
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

                    // create default customer profile (ignore error but log)
                    const { error: profileError } = await supabase
                        .from('customers_data')
                        .insert([{ name: fullName, email, telp_number: '', role: 'siswa', place: '' }]);

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

        
        // --- PERBAIKAN STUCK SPINNER ---
        // Logout
        const logoutBtn = $('logoutBtn');
        if (logoutBtn) {
            
            // 1. Simpan HTML asli tombol ke variabel global saat setup
            originalLogoutHtml = logoutBtn.innerHTML; 

            logoutBtn.addEventListener('click', async function (e) {
                e.preventDefault();
                
                let success = false; // Flag untuk melacak sukses
                
                try {
                    // 2. Tampilkan status loading
                    logoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging out...';
                    logoutBtn.disabled = true;

                    // 3. Panggil signOut
                    const { error } = await supabase.auth.signOut();
                    if (error) throw error;

                    // 4. Sukses
                    showNotification('Anda telah logout', 'success');
                    success = true; 
                    // onAuthStateChange akan dipanggil untuk membersihkan UI
                    // (termasuk me-reset tombol ini via updateUIAfterLogout)

                } catch (error) {
                    // 5. Tangani error
                    showNotification('Logout gagal: ' + (error.message || ''), 'error');
                    console.error("[logout] error:", error);
                    
                } finally {
                    // 6. Hanya reset tombol JIKA GAGAL.
                    // Jika sukses, onAuthStateChange (via updateUIAfterLogout)
                    // yang akan mengurusnya.
                    if (!success) {
                        logoutBtn.innerHTML = originalLogoutHtml;
                        logoutBtn.disabled = false;
                    }
                }
            });
        }
        // --- AKHIR PERBAIKAN ---


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

        // Save profile form
        const profileForm = $('profileForm');
        if (profileForm) {
            profileForm.addEventListener('submit', async function (e) {
                e.preventDefault();

                const submitBtn = profileForm.querySelector('button[type="submit"]');
                const btnText = $('saveProfileButtonText');
                const btnSpinner = $('saveProfileSpinner');

                if (btnText) btnText.classList.add('hidden');
                if (btnSpinner) btnSpinner.classList.remove('hidden');
                if (submitBtn) submitBtn.disabled = true;

                const start = Date.now();

                try {
                    const fullName = $('profileName').value;
                    const phone = $('profilePhone').value;
                    const role = $('profileRole').value;
                    const office = $('profileOffice').value;
                    const classRoom = $('profileClass').value;

                    const profileData = {
                        name: fullName,
                        email: currentUser.email,
                        telp_number: phone,
                        role: role,
                        place: role === 'guru' ? office : classRoom
                    };

                    const { data, error } = await supabase
                        .from('customers_data')
                        .upsert(profileData, { onConflict: 'email' })
                        .select()
                        .single();

                    if (error) throw error;

                    userProfile = data;

                    // update UI form values
                    $('profileName').value = userProfile.name || '';
                    $('profileEmail').value = userProfile.email || '';
                    $('profilePhone').value = userProfile.telp_number || '';
                    $('profileRole').value = userProfile.role || 'siswa';
                    if (userProfile.role === 'guru') {
                        $('profileOffice').value = userProfile.place || '';
                        toggleRoleFields('guru');
                    } else {
                        $('profileClass').value = userProfile.place || '';
                        toggleRoleFields('siswa');
                    }

                    showNotification('Profil berhasil diperbarui', 'success');

                    const elapsed = Date.now() - start;
                    const remaining = 1000 - elapsed;
                    setTimeout(() => {
                        if (btnText) btnText.classList.remove('hidden');
                        if (btnSpinner) btnSpinner.classList.add('hidden');
                        if (submitBtn) submitBtn.disabled = false;
                        closeProfileModal();
                    }, remaining > 0 ? remaining : 0);
                } catch (error) {
                    showNotification('Gagal menyimpan profil: ' + (error.message || ''), 'error');

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

        // Role selection change
        $('profileRole')?.addEventListener('change', function () {
            toggleRoleFields(this.value);
        });

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

            // ✅ Tunai
            if (paymentMethod === 'tunai') {
                // Panggil processCheckout. Fungsi ini akan membuat order,
                // mengosongkan cart, dan menampilkan modal sukses (centang hijau).
                await processCheckout('tunai', deliveryOption, deliveryNote);
                closeDeliveryModal();
                return;
            }

            // ✅ QRIS
            if (paymentMethod === 'qris') {
                // Untuk QRIS, kita HANYA buka modal QRIS.
                // Pembuatan pesanan akan ditangani oleh tombol 'confirmQris' nanti.
                $('qrisTotal').textContent = `Rp ${total.toLocaleString('id-ID')}`;
                $('qrisModal')?.classList.add('open');
                $('qrisOverlay')?.classList.add('open');
                closeDeliveryModal();
                return;
            }
        });

        // ✅ Tombol Batal pada modal pengiriman
        $('cancelDelivery')?.addEventListener('click', function () {
            closeDeliveryModal();
        });


        // =========================================================================
        // LISTENER confirmQrisBtn DIMODIFIKASI UNTUK MENGGUNAKAN RPC
        // =========================================================================
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
                    // ----------------------------------------------------
                    // TAHAP 1: Buat Pesanan (Call processCheckout -> RPC v2_create_order)
                    // ----------------------------------------------------
                    const deliveryNote = $('deliveryNote') ? $('deliveryNote').value : '';
                    
                    const orderResult = await processCheckout('qris', deliveryOption, deliveryNote);
                    
                    if (!orderResult || !orderResult.order_id) {
                        throw new Error('Gagal membuat pesanan. Silakan coba lagi.');
                    }

                    // Hasil dari RPC
                    orderId = orderResult.order_id;
                    orderNumber = orderResult.order_number;
                    
                    console.log('Order Number dari RPC:', orderNumber);
                    
                    // ----------------------------------------------------
                    // TAHAP 2: Upload Bukti Pembayaran
                    // ----------------------------------------------------
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

                    // ----------------------------------------------------
                    // TAHAP 3: Update Referensi di Tabel Order (Call RPC v2_confirm_qris_payment)
                    // ----------------------------------------------------
                    const { data: publicUrlData } = await supabase.storage
                        .from('Qris_image')
                        .getPublicUrl(fileName);

                    const qrisUrl = publicUrlData?.publicUrl || null;
                    if (!qrisUrl) throw new Error('Gagal mendapatkan URL publik file');

                    // Panggil RPC kedua untuk konfirmasi
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

                    // ----------------------------------------------------
                    // TAHAP 4: Selesai (Tutup Modal QRIS & Tampilkan Modal Sukses)
                    // ----------------------------------------------------
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
                    // Reset kondisi tombol dan input
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
        // =========================================================================
        // AKHIR DARI MODIFIKASI confirmQrisBtn
        // =========================================================================


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
        // --- Desktop Search ---
        const searchInput = document.getElementById('searchProduct');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
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
            this.classList.add('hidden');
            document.getElementById('searchInfo')?.classList.add('hidden');
            renderProducts();
        });

        // --- Mobile Search ---
        const searchInputMobile = document.getElementById('searchProductMobile');
        if (searchInputMobile) {
            searchInputMobile.addEventListener('input', function () {
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
            this.classList.add('hidden');
            document.getElementById('searchInfo')?.classList.add('hidden');
            renderProducts();
        });

        // --- Reset Button (clear all results) ---
        document.getElementById('clearSearchResults')?.addEventListener('click', function () {
            const inputDesktop = document.getElementById('searchProduct');
            const inputMobile = document.getElementById('searchProductMobile');

            if (inputDesktop) inputDesktop.value = '';
            if (inputMobile) inputMobile.value = '';

            document.getElementById('clearSearch')?.classList.add('hidden');
            document.getElementById('clearSearchMobile')?.classList.add('hidden');
            document.getElementById('searchInfo')?.classList.add('hidden');
            renderProducts();
        });


        // Download QRIS button
        $('downloadQrisBtn')?.addEventListener('click', function () {
            showNotification('QR Code berhasil didownload', 'success');
        });

        // Password toggles (safe)
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

            // checkAuthState() sudah tidak diperlukan di sini karena
            // checkAuthStateAndInit() sudah dipanggil di top-level.
            // checkAuthState(); 

            // Mengambil data produk dari Supabase
            fetchProductsFromSupabase();
            setupEventListeners();
            setupScrollButton();

            // Event delegation untuk produk yang di-render secara dinamis
            document.getElementById('productsGrid').addEventListener('click', function (e) {
                const productCard = e.target.closest('.product-card');
                if (productCard) {
                    const productId = parseInt(productCard.dataset.productId);
                    if (productId) {
                        addToCartWithAnimation(productId, productCard);
                    }
                }
            });
        } catch (error) {
            console.error('Error initializing app:', error);
        }
    });
