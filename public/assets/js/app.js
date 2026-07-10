// public/assets/js/app.js
document.addEventListener('DOMContentLoaded', () => {
    const sessionToken = localStorage.getItem('nova_session_token');
    if (!sessionToken) return; // Exit if unauthorized (handled by auth.js)

    // Dark Mode Toggle Initial Setup
    const bodyEl = document.body;
    const savedTheme = localStorage.getItem('theme');
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeToggleIcon = document.getElementById('themeToggleIcon');
    
    if (savedTheme === 'dark') {
        bodyEl.classList.add('dark-mode');
        if (themeToggleIcon) {
            themeToggleIcon.className = 'fa-solid fa-sun fs-5';
        }
    }

    // Global states
    let availableServices = [];
    let currentOrderId = null;
    let pollInterval = null;
    let countdownInterval = null;
    let countdownSeconds = 300;

    // Cached logs for instant currency switching
    let lastHistoryData = [];
    let lastDepositData = [];
    let lastProfileData = null;
    let activeChatTicketId = null;
    let chatInterval = null;

    // Currency exchange configuration (Base currency is USD)
    const exchangeRates = {
        PKR: { rate: 278.50, symbol: '₨ ' },
        USD: { rate: 1.0, symbol: '$' },
        INR: { rate: 83.40, symbol: '₹ ' },
        BDT: { rate: 117.20, symbol: '৳ ' },
        NPR: { rate: 133.50, symbol: 'रू ' },
        RUB: { rate: 88.30, symbol: '₽ ' }
    };

    // DOM Elements: Navigation / Layout
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
    const paneTitle = document.getElementById('paneTitle');
    const alertContainer = document.getElementById('alertContainer');
    const userNameLabel = document.getElementById('userNameLabel');
    const userEmailLabel = document.getElementById('userEmailLabel');
    const avatarLetter = document.getElementById('avatarLetter');

    // DOM Elements: Header balance & currency
    const balanceAmount = document.getElementById('balanceAmount');
    const refreshBalanceBtn = document.getElementById('refreshBalanceBtn');
    const currencySelector = document.getElementById('currencySelector');

    // DOM Elements: Activation panel
    const countrySelect = document.getElementById('countrySelect');
    const serviceSelect = document.getElementById('serviceSelect');
    const priceDisplay = document.getElementById('priceDisplay');
    const buyNumberBtn = document.getElementById('buyNumberBtn');
    const numberDisplay = document.getElementById('numberDisplay');
    const orderIdDisplay = document.getElementById('orderIdDisplay');
    const orderStatusBadge = document.getElementById('orderStatusBadge');
    const otpCodeDisplay = document.getElementById('otpCodeDisplay');
    const copyOtpBtn = document.getElementById('copyOtpBtn');
    const endActivationBtn = document.getElementById('endActivationBtn');
    const smsStatusContainer = document.getElementById('smsStatusContainer');
    const waitingStatusText = document.getElementById('waitingStatusText');
    const waitingSpinner = document.getElementById('waitingSpinner');

    function setOtpDisplayValue(value) {
        if (!value || value === '------' || value === 'Not Received') {
            otpCodeDisplay.textContent = '------';
            otpCodeDisplay.style.fontSize = '';
            otpCodeDisplay.style.letterSpacing = '4px';
        } else {
            otpCodeDisplay.textContent = value;
            if (value.length > 8) {
                otpCodeDisplay.style.fontSize = '1.15rem';
                otpCodeDisplay.style.letterSpacing = 'normal';
                otpCodeDisplay.classList.remove('display-4');
                otpCodeDisplay.classList.add('fs-5');
            } else {
                otpCodeDisplay.style.fontSize = '';
                otpCodeDisplay.style.letterSpacing = '4px';
                otpCodeDisplay.classList.add('display-4');
                otpCodeDisplay.classList.remove('fs-5');
            }
        }
    }



    // DOM Elements: Services list
    const servicesTableBody = document.getElementById('servicesTableBody');
    const servicesSearch = document.getElementById('servicesSearch');

    // DOM Elements: History logs
    const orderHistoryTableBody = document.getElementById('orderHistoryTableBody');

    // DOM Elements: Deposits panel
    const depositMethod = document.getElementById('depositMethod');
    const paymentInstructions = document.getElementById('paymentInstructions');
    const instructionsDetails = document.getElementById('instructionsDetails');
    const depositAmount = document.getElementById('depositAmount');
    const depositTxId = document.getElementById('depositTxId');
    const depositScreenshot = document.getElementById('depositScreenshot');
    const submitDepositBtn = document.getElementById('submitDepositBtn');
    const depositHistoryTableBody = document.getElementById('depositHistoryTableBody');
    const depositProofFile = document.getElementById('depositProofFile');
    const depositProofPreviewContainer = document.getElementById('depositProofPreviewContainer');
    const depositProofFileName = document.getElementById('depositProofFileName');
    const depositProofPreviewImg = document.getElementById('depositProofPreviewImg');

    // DOM Elements: Reseller API
    const apiKeyDisplay = document.getElementById('apiKeyDisplay');
    const rotateApiKeyBtn = document.getElementById('rotateApiKeyBtn');
    const apiDocBalanceUrl = document.getElementById('apiDocBalanceUrl');
    const apiDocBuyUrl = document.getElementById('apiDocBuyUrl');
    const apiDocMsgUrl = document.getElementById('apiDocMsgUrl');

    // DOM Elements: Support Tickets
    const createTicketForm = document.getElementById('createTicketForm');
    const ticketsTableBody = document.getElementById('ticketsTableBody');
    const ticketListCard = document.getElementById('ticketListCard');
    const ticketChatCard = document.getElementById('ticketChatCard');
    const closeChatBtn = document.getElementById('closeChatBtn');
    const chatTicketTitle = document.getElementById('chatTicketTitle');
    const chatTicketStatus = document.getElementById('chatTicketStatus');
    const chatMessages = document.getElementById('chatMessages');
    const chatInputForm = document.getElementById('chatInputForm');
    const chatInputMessage = document.getElementById('chatInputMessage');

    // DOM Elements: Account settings
    const settingsNameInput = document.getElementById('settingsNameInput');
    const settingsProfileForm = document.getElementById('settingsProfileForm');
    const settingsPassword = document.getElementById('settingsPassword');
    const settingsPasswordConfirm = document.getElementById('settingsPasswordConfirm');
    const settingsPasswordForm = document.getElementById('settingsPasswordForm');

    // Payment Guidelines Config
    let activeDepositMethods = [];

    // Initialize View
    init();

    function init() {
        loadProfile();
        loadServices();
        loadHistory();
        loadDeposits();
        loadTickets();
        loadWhatsappSupport();
        setupEventListeners();
    }

    function setupEventListeners() {
        // Toggle sidebar drawer on mobile/tablet
        const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
        const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
        const sidebarEl = document.querySelector('.sidebar');
        
        let backdrop = document.querySelector('.sidebar-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.className = 'sidebar-backdrop';
            document.body.appendChild(backdrop);
        }

        const closeSidebarFn = () => {
            if (sidebarEl) sidebarEl.classList.remove('open');
            if (backdrop) backdrop.classList.remove('show');
        };

        if (sidebarToggleBtn && sidebarEl) {
            sidebarToggleBtn.addEventListener('click', () => {
                sidebarEl.classList.add('open');
                backdrop.classList.add('show');
            });
        }

        if (sidebarCloseBtn) {
            sidebarCloseBtn.addEventListener('click', closeSidebarFn);
        }

        if (backdrop) {
            backdrop.addEventListener('click', closeSidebarFn);
        }

        // Sidebar Navigation click router
        sidebarLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                sidebarLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');

                const targetPane = link.getAttribute('data-pane');
                
                // Keep mobile bottom nav selection in sync
                const correspondingMobileLink = document.querySelector(`.mobile-nav-link[data-pane="${targetPane}"]`);
                if (correspondingMobileLink) {
                    mobileNavLinks.forEach(l => l.classList.remove('active'));
                    correspondingMobileLink.classList.add('active');
                }

                // Hide all panes, show target
                document.querySelectorAll('.pane-content').forEach(pane => {
                    pane.classList.remove('active');
                });
                document.getElementById(`pane-${targetPane}`).classList.add('active');

                // Update Header Pane Title Text
                paneTitle.textContent = link.textContent.trim();
                alertContainer.innerHTML = ''; // Clear alerts on switch

                // Close sidebar drawer on mobile after link selection
                if (window.innerWidth <= 1023) {
                    closeSidebarFn();
                }
            });
        });

        // Refresh balance button trigger
        refreshBalanceBtn.addEventListener('click', () => {
            const icon = refreshBalanceBtn.querySelector('i');
            icon.classList.add('fa-spin');
            loadProfile(() => {
                setTimeout(() => icon.classList.remove('fa-spin'), 600);
            });
        });

        // Currency selection changes
        currencySelector.addEventListener('change', () => {
            const selectedCurrency = currencySelector.value;
            authFetch('/api/user/currency', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currency: selectedCurrency })
            });

            renderProfileDetails();
            handleCountryChange();
            renderServicesTable();
            renderHistoryTable();
            renderDepositsTable();
        });

        // Dropdowns activation form triggers
        countrySelect.addEventListener('change', handleCountryChange);
        serviceSelect.addEventListener('change', updatePriceDisplay);

        // Core purchase actions triggers
        buyNumberBtn.addEventListener('click', handleBuyNumber);
        copyOtpBtn.addEventListener('click', handleCopyOtp);
        endActivationBtn.addEventListener('click', handleEndActivation);
        numberDisplay.addEventListener('click', handleCopyNumber);

        // Services search filter
        servicesSearch.addEventListener('input', renderServicesTable);

        // Click delegation listener for "Order" button on each service row
        servicesTableBody.addEventListener('click', (e) => {
            const btn = e.target.closest('.order-now-btn');
            if (btn) {
                const code = btn.getAttribute('data-code');
                const groupId = btn.getAttribute('data-group');
                
                // 1. Switch to OTP activation pane in the sidebar
                const otpLink = document.querySelector('.sidebar-link[data-pane="otp"]');
                if (otpLink) {
                    sidebarLinks.forEach(l => l.classList.remove('active'));
                    otpLink.classList.add('active');
                    paneTitle.textContent = otpLink.textContent.trim();
                }
                document.querySelectorAll('.pane-content').forEach(p => p.classList.remove('active'));
                document.getElementById('pane-otp').classList.add('active');
                
                // 2. Select Category Group
                countrySelect.value = groupId;
                
                // 3. Trigger change on group selector to rebuild services option list
                handleCountryChange();
                
                // 4. Select App Service
                serviceSelect.value = code;
                
                // 5. Update display pricing details
                updatePriceDisplay();
                
                // 6. Smooth scroll to top of OTP booking section
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });

        // Click delegation listener for Order History Table
        orderHistoryTableBody.addEventListener('click', (e) => {
            const fetchBtn = e.target.closest('.btn-fetch-otp');
            const viewMsgBtn = e.target.closest('.btn-view-msg');

            if (fetchBtn) {
                const orderId = fetchBtn.getAttribute('data-order-id');
                fetchBtn.disabled = true;
                const origHtml = fetchBtn.innerHTML;
                fetchBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Fetching...';

                authFetch('/api/buy/fetch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ order_id: orderId })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        const o = data.order;
                        currentOrderId = o.order_id;
                        
                        let formattedNumber = o.number;
                        if (formattedNumber && !formattedNumber.startsWith('+')) {
                            formattedNumber = '+' + formattedNumber;
                        }
                        numberDisplay.textContent = formattedNumber;
                        numberDisplay.style.cursor = 'pointer';
                        
                        orderIdDisplay.textContent = o.order_id;
                        orderStatusBadge.textContent = 'Not Received';
                        orderStatusBadge.className = 'badge-custom badge-pending';

                        setOtpDisplayValue('------');
                        copyOtpBtn.disabled = true;
                        endActivationBtn.style.display = 'block';
                        smsStatusContainer.className = 'sms-status-container glow-pending';

                        waitingSpinner.classList.remove('d-none');
                        waitingStatusText.textContent = `Waiting for SMS (Expires in ${window.otpExpiryMinutes || 5}:00)...`;

                        // Switch active pane to otp
                        document.querySelectorAll('.pane-content').forEach(pane => pane.classList.remove('active'));
                        document.getElementById('pane-otp').classList.add('active');
                        document.querySelectorAll('.sidebar-link, .mobile-nav-link').forEach(l => {
                            if (l.getAttribute('data-pane') === 'otp') {
                                l.classList.add('active');
                            } else {
                                l.classList.remove('active');
                            }
                        });
                        const paneTitle = document.getElementById('paneTitle');
                        if (paneTitle) paneTitle.textContent = 'Get SMS Activation';

                        // Close sidebar drawer on mobile after redirection
                        if (window.innerWidth <= 1023 && typeof closeSidebarFn === 'function') {
                            closeSidebarFn();
                        }

                        showAlert('Order reactivated successfully!', 'success');
                        
                        loadProfile();
                        loadHistory();
                        startPolling(o.order_id);
                    } else {
                        showAlert(data.message || 'Failed to fetch order.', 'danger');
                    }
                })
                .catch(err => {
                    showAlert('Error fetching order: ' + err.message, 'danger');
                })
                .finally(() => {
                    fetchBtn.disabled = false;
                    fetchBtn.innerHTML = origHtml;
                });
            }

            if (viewMsgBtn) {
                const rawMsg = viewMsgBtn.getAttribute('data-msg');
                const decodedMsg = decodeURIComponent(rawMsg);
                
                const modalBody = document.getElementById('modalMessageBody');
                if (modalBody) {
                    modalBody.textContent = decodedMsg;
                }

                const modalEl = document.getElementById('viewMessageModal');
                if (modalEl) {
                    const modal = new bootstrap.Modal(modalEl);
                    modal.show();

                    // Handle copying modal message to clipboard
                    const copyBtn = document.getElementById('copyModalMessageBtn');
                    if (copyBtn) {
                        // Clear existing listeners
                        const newCopyBtn = copyBtn.cloneNode(true);
                        copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);

                        newCopyBtn.addEventListener('click', () => {
                            navigator.clipboard.writeText(decodedMsg)
                                .then(() => {
                                    const origText = newCopyBtn.innerHTML;
                                    newCopyBtn.innerHTML = '<i class="fa-solid fa-check me-2"></i>Copied!';
                                    setTimeout(() => {
                                        newCopyBtn.innerHTML = origText;
                                    }, 2000);
                                })
                                .catch(() => {
                                    alert('Failed to copy text.');
                                });
                        });
                    }
                }
            }
        });

        // Deposit Guidelines changes
        depositMethod.addEventListener('change', () => {
            const selectedVal = depositMethod.value;
            const method = activeDepositMethods.find(m => m.method_name === selectedVal);
            if (method) {
                updateDepositInstructions(method);
            } else {
                paymentInstructions.classList.add('d-none');
            }
        });

        if (depositProofFile) {
            depositProofFile.addEventListener('change', () => {
                const file = depositProofFile.files[0];
                if (!file) {
                    depositProofPreviewContainer.classList.add('d-none');
                    return;
                }

                if (file.size > 5 * 1024 * 1024) {
                    showAlert('File is too large. Max size allowed is 5 MB.', 'warning');
                    depositProofFile.value = '';
                    depositProofPreviewContainer.classList.add('d-none');
                    return;
                }

                const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
                if (!allowedTypes.includes(file.type)) {
                    showAlert('Invalid file type. Only JPG, JPEG, PNG, and WEBP formats are allowed.', 'warning');
                    depositProofFile.value = '';
                    depositProofPreviewContainer.classList.add('d-none');
                    return;
                }

                depositProofFileName.textContent = file.name;
                const reader = new FileReader();
                reader.onload = (e) => {
                    depositProofPreviewImg.src = e.target.result;
                    depositProofPreviewContainer.classList.remove('d-none');
                };
                reader.readAsDataURL(file);
            });
        }

        depositHistoryTableBody.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-view-proof');
            if (btn) {
                const path = btn.getAttribute('data-path');
                viewProofScreenshot(path);
            }
        });

        submitDepositBtn.addEventListener('click', handleDepositSubmit);

        // Developer API actions trigger
        rotateApiKeyBtn.addEventListener('click', handleRotateApiKey);

        // Support Tickets triggers
        createTicketForm.addEventListener('submit', handleCreateTicket);
        closeChatBtn.addEventListener('click', () => {
            if (chatInterval) clearInterval(chatInterval);
            chatInterval = null;
            ticketChatCard.classList.add('d-none');
            ticketListCard.classList.remove('d-none');
        });
        chatInputForm.addEventListener('submit', handleSendChatMessage);

        // Password Show/Hide Toggle in Settings
        document.querySelectorAll('.toggle-pass-settings').forEach(icon => {
            icon.addEventListener('click', () => {
                const targetId = icon.getAttribute('data-target');
                const field = document.getElementById(targetId);
                const isPassword = field.getAttribute('type') === 'password';
                field.setAttribute('type', isPassword ? 'text' : 'password');
                icon.classList.toggle('fa-eye');
                icon.classList.toggle('fa-eye-slash');
            });
        });

        // Account Profile Settings changes
        settingsProfileForm.addEventListener('submit', handleSaveProfileName);
        settingsPasswordForm.addEventListener('submit', handleSavePassword);

        // Theme Toggle Click Handler
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', () => {
                const isDark = bodyEl.classList.toggle('dark-mode');
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
                if (themeToggleIcon) {
                    themeToggleIcon.className = isDark ? 'fa-solid fa-sun fs-5' : 'fa-solid fa-moon fs-5';
                }
                showToast(isDark ? 'Dark Mode Enabled' : 'Light Mode Enabled', 'info');
            });
        }

        // Mobile Bottom Navigation Click Router
        mobileNavLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                mobileNavLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');

                const targetPane = link.getAttribute('data-pane');
                
                // Keep sidebar selection in sync if exists
                const correspondingSidebarLink = document.querySelector(`.sidebar-link[data-pane="${targetPane}"]`);
                if (correspondingSidebarLink) {
                    sidebarLinks.forEach(l => l.classList.remove('active'));
                    correspondingSidebarLink.classList.add('active');
                }

                // Hide all panes, show target
                document.querySelectorAll('.pane-content').forEach(pane => {
                    pane.classList.remove('active');
                });
                document.getElementById(`pane-${targetPane}`).classList.add('active');

                // Update Header Pane Title Text
                paneTitle.textContent = link.textContent.trim();
                alertContainer.innerHTML = ''; // Clear alerts on switch
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });
    }

    function showToast(message, type = 'danger') {
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast-custom ${type}`;
        
        let iconClass = 'fa-circle-check';
        if (type === 'danger') iconClass = 'fa-circle-xmark';
        else if (type === 'warning') iconClass = 'fa-triangle-exclamation';
        else if (type === 'info') iconClass = 'fa-circle-info';

        toast.innerHTML = `
            <div class="toast-custom-content">
                <span class="toast-custom-icon"><i class="fa-solid ${iconClass}"></i></span>
                <span>${message}</span>
            </div>
            <button class="toast-custom-close"><i class="fa-solid fa-xmark"></i></button>
        `;

        toastContainer.appendChild(toast);

        // Force reflow and show
        setTimeout(() => toast.classList.add('show'), 50);

        const closeBtn = toast.querySelector('.toast-custom-close');
        const dismissToast = () => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        };

        if (closeBtn) {
            closeBtn.addEventListener('click', dismissToast);
        }

        // Auto dismiss after 4.5 seconds
        setTimeout(dismissToast, 4500);
    }

    function showAlert(message, type = 'danger') {
        showToast(message, type);
    }

    // Auth fetch request helper
    function authFetch(url, options = {}) {
        options.headers = options.headers || {};
        options.headers['Authorization'] = 'Bearer ' + sessionToken;
        return fetch(url, options);
    }

    function formatPrice(usdAmount) {
        const currentCurr = currencySelector.value || 'PKR';
        const details = exchangeRates[currentCurr];
        const converted = usdAmount * details.rate;
        return `${details.symbol}${converted.toFixed(2)}`;
    }

    /**
     * Profile retrieve and load
     */
    let hasSubscribedRealtime = false;

    function setupGlobalRealtime() {
        if (hasSubscribedRealtime || !lastProfileData || !lastProfileData.id) return;
        initSupabaseClient().then(client => {
            if (!client) return;
            hasSubscribedRealtime = true;

            // 1. Deposits Realtime listener
            client
                .channel(`public:deposits:user_id=eq.${lastProfileData.id}`)
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'deposits',
                    filter: `user_id=eq.${lastProfileData.id}`
                }, (payload) => {
                    loadDeposits();
                    loadProfile(); // Refresh balance
                    if (payload.new && payload.new.status) {
                        showToast(`Deposit request is ${payload.new.status}!`, payload.new.status === 'APPROVED' ? 'success' : 'danger');
                    }
                })
                .subscribe();

            // 2. Tickets Realtime listener
            client
                .channel(`public:tickets:user_id=eq.${lastProfileData.id}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'tickets',
                    filter: `user_id=eq.${lastProfileData.id}`
                }, (payload) => {
                    loadTickets();
                    if (payload.eventType === 'UPDATE' && payload.new && payload.new.status) {
                        showToast(`Support Ticket status updated to ${payload.new.status}`, 'info');
                    }
                })
                .subscribe();
        });
    }

    function loadProfile(callback = null) {
        authFetch('/api/user/profile')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    lastProfileData = data.profile;
                    renderProfileDetails();
                    if (lastProfileData && lastProfileData.id) {
                        setupGlobalRealtime();
                    }
                } else {
                    showAlert(data.message, 'danger');
                }
                if (callback) callback();
            })
            .catch(error => {
                showAlert('Failed to connect to profile: ' + error.message, 'danger');
                if (callback) callback();
            });
    }

    function updateDepositFormCurrencyLabels() {
        const depositAmountLabel = document.getElementById('depositAmountLabel');
        const depositAmountInput = document.getElementById('depositAmount');
        if (depositAmountLabel && depositAmountInput) {
            const selectedCurrency = currencySelector.value || 'PKR';
            const pkrRate = exchangeRates['PKR'].rate;
            const selectedRate = exchangeRates[selectedCurrency].rate;
            const symbol = exchangeRates[selectedCurrency].symbol;
            
            const minDepositVal = 50.0 * (selectedRate / pkrRate);
            
            depositAmountLabel.innerHTML = `Amount (${selectedCurrency}) <span class="text-danger small ms-1">(Min: ${symbol}${minDepositVal.toFixed(2)})</span>`;
            depositAmountInput.placeholder = `Min ${symbol}${minDepositVal.toFixed(2)} or more`;
        }
    }

    function renderProfileDetails() {
        if (!lastProfileData) return;

        // Apply saved currency preference on load
        if (lastProfileData.currency && currencySelector.value !== lastProfileData.currency) {
            currencySelector.value = lastProfileData.currency;
        }

        updateDepositFormCurrencyLabels();

        // Render Balance card (stored in database as PKR, formatPrice expects USD base)
        balanceAmount.textContent = formatPrice(parseFloat(lastProfileData.balance || 0) / 278.50);

        // Render Total Spent card (stored in database as PKR)
        const spendAmount = document.getElementById('spendAmount');
        if (spendAmount) {
            spendAmount.textContent = formatPrice(parseFloat(lastProfileData.spend || 0) / 278.50);
        }

        // Sidebar user details info
        const displayName = lastProfileData.name || 'User Name';
        userNameLabel.textContent = displayName;
        userEmailLabel.textContent = lastProfileData.email;
        avatarLetter.textContent = displayName.charAt(0).toUpperCase();

        // Populate forms fields
        settingsNameInput.value = lastProfileData.name || '';

        // API Key display
        if (lastProfileData.api_key) {
            apiKeyDisplay.textContent = lastProfileData.api_key;
            apiKeyDisplay.className = 'fs-4 fw-bold font-monospace text-primary mt-1';
            
            const host = window.location.origin;
            apiDocBalanceUrl.textContent = `${host}/api/v1/info?key=${lastProfileData.api_key}`;
            apiDocBuyUrl.textContent = `${host}/api/v1/get?key=${lastProfileData.api_key}&id=PRODUCT_ID`;
            apiDocMsgUrl.textContent = `${host}/api/v1/msg?key=${lastProfileData.api_key}&id=PRODUCT_ID&number=PHONE_NUMBER`;
        } else {
            apiKeyDisplay.textContent = 'None Generated';
            apiKeyDisplay.className = 'fs-4 fw-bold text-muted mt-1';
            apiDocBalanceUrl.textContent = 'Please generate an API key first.';
            apiDocBuyUrl.textContent = 'Please generate an API key first.';
            apiDocMsgUrl.textContent = 'Please generate an API key first.';
        }
    }

    /**
     * Services configuration lists
     */
    function loadServices() {
        authFetch('/api/services')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    // Save dynamic OTP timeout config
                    window.otpExpiryMinutes = data.otp_expiry_minutes || 5;
                    const timeoutLimitBadge = document.getElementById('timeoutLimitBadge');
                    if (timeoutLimitBadge) {
                        timeoutLimitBadge.textContent = `Timeout: ${window.otpExpiryMinutes} mins`;
                    }

                    // Populate Group Selectors
                    countrySelect.innerHTML = '<option value="" selected disabled>Select Category/Group</option>';
                    data.countries.forEach(country => {
                        const opt = document.createElement('option');
                        opt.value = country.code;
                        opt.textContent = `${country.flag} ${country.name}`;
                        countrySelect.appendChild(opt);
                    });

                    availableServices = data.services;
                    renderServicesTable();
                    restoreActiveOrderIfAny();
                } else {
                    showAlert(data.message, 'danger');
                }
            });
    }

    function renderServicesTable() {
        servicesTableBody.innerHTML = '';
        const searchVal = servicesSearch.value.trim().toLowerCase();

        const filtered = availableServices.filter(s => {
            return s.name.toLowerCase().includes(searchVal);
        });

        if (filtered.length === 0) {
            servicesTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No service apps found matching search.</td></tr>`;
            return;
        }

        filtered.forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${s.name}</strong></td>
                <td><span class="badge bg-secondary">Group ${s.group_id}</span></td>
                <td><code>${s.code}</code></td>
                <td><strong class="text-primary">${formatPrice(s.price)}</strong></td>
                <td><span class="badge bg-success">${s.stock} Numbers</span></td>
                <td class="text-end">
                    <button class="btn btn-sm btn-primary px-3 rounded-pill fw-bold order-now-btn" data-code="${s.code}" data-group="${s.group_id}">
                        <i class="fa-solid fa-cart-shopping me-1"></i>Order
                    </button>
                </td>
            `;
            servicesTableBody.appendChild(tr);
        });
    }

    function handleCountryChange() {
        const selectedGroup = countrySelect.value;
        serviceSelect.innerHTML = '<option value="" selected disabled>Select Service</option>';
        priceDisplay.classList.add('d-none');

        const filtered = availableServices.filter(s => s.group_id === selectedGroup);
        filtered.forEach(service => {
            const opt = document.createElement('option');
            opt.value = service.code;
            opt.textContent = `${service.name} (Stock: ${service.stock}) - ${formatPrice(service.price)}`;
            serviceSelect.appendChild(opt);
        });
    }

    function updatePriceDisplay() {
        const code = serviceSelect.value;
        const selected = availableServices.find(s => s.code === code);
        if (selected) {
            priceDisplay.textContent = `Price: ${formatPrice(selected.price)}`;
            priceDisplay.classList.remove('d-none');
        } else {
            priceDisplay.classList.add('d-none');
        }
    }

    /**
     * Purchase Actions: API Order Buy
     */
    function handleBuyNumber() {
        const country = countrySelect.value;
        const service = serviceSelect.value;

        if (!country || !service) {
            showAlert('Please select category and service values.', 'warning');
            return;
        }

        buyNumberBtn.disabled = true;
        buyNumberBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Ordering...';

        authFetch('/api/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ country, service })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                currentOrderId = data.order_id;
                
                let formattedNumber = data.number;
                if (formattedNumber && !formattedNumber.startsWith('+')) {
                    formattedNumber = '+' + formattedNumber;
                }
                numberDisplay.textContent = formattedNumber;
                numberDisplay.style.cursor = 'pointer';
                
                orderIdDisplay.textContent = data.order_id;
                orderStatusBadge.textContent = 'Not Received';
                orderStatusBadge.className = 'badge-custom badge-pending';

                setOtpDisplayValue('------');
                copyOtpBtn.disabled = true;
                endActivationBtn.style.display = 'block';
                smsStatusContainer.className = 'sms-status-container glow-pending';

                waitingSpinner.classList.remove('d-none');
                waitingStatusText.textContent = `Waiting for SMS (Expires in ${window.otpExpiryMinutes || 5}:00)...`;

                loadProfile();
                loadHistory();
                startPolling(data.order_id);
            } else {
                showAlert(data.message, 'danger');
            }
            buyNumberBtn.disabled = false;
            buyNumberBtn.innerHTML = '<i class="fa-solid fa-cart-shopping me-2"></i>Buy Number';
        })
        .catch(err => {
            showAlert(err.message, 'danger');
            buyNumberBtn.disabled = false;
            buyNumberBtn.innerHTML = '<i class="fa-solid fa-cart-shopping me-2"></i>Buy Number';
        });
    }



    function startPolling(orderId, startSeconds) {
        stopIntervals();
        countdownSeconds = startSeconds !== undefined ? startSeconds : (window.otpExpiryMinutes || 5) * 60;

        pollSmsStatus(orderId);

        pollInterval = setInterval(() => {
            pollSmsStatus(orderId);
        }, 2000);

        countdownInterval = setInterval(() => {
            countdownSeconds--;
            if (countdownSeconds <= 0) {
                handleExpiration();
            } else {
                const min = Math.floor(countdownSeconds / 60);
                const sec = countdownSeconds % 60;
                waitingStatusText.textContent = `Waiting for SMS (Expires in ${min}:${sec < 10 ? '0' : ''}${sec})...`;
            }
        }, 1000);
    }

    function pollSmsStatus(orderId) {
        authFetch(`/api/sms?order_id=${encodeURIComponent(orderId)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    if (data.otp && data.otp !== '------' && data.otp !== 'Not Received') {
                        setOtpDisplayValue(data.otp);
                        copyOtpBtn.disabled = false;
                        waitingStatusText.textContent = 'OTP received! Checking for subsequent messages...';
                        loadHistory();
                    }

                    if (data.status === 'COMPLETED') {
                        stopIntervals();
                        orderStatusBadge.textContent = 'Done';
                        orderStatusBadge.className = 'badge-custom badge-completed';
                        
                        smsStatusContainer.className = 'sms-status-container glow-success';
                        waitingSpinner.classList.add('d-none');
                        waitingStatusText.textContent = 'Activation complete.';
                        endActivationBtn.style.display = 'none';
                        
                        loadProfile();
                        loadHistory();
                    } else if (data.status === 'EXPIRED') {
                        handleExpiration();
                    }
                }
            });
    }

    function handleExpiration() {
        stopIntervals();
        orderStatusBadge.textContent = 'Pending';
        orderStatusBadge.className = 'badge-custom badge-pending';
        smsStatusContainer.className = 'sms-status-container';
        waitingSpinner.classList.add('d-none');
        waitingStatusText.textContent = 'Timer expired. Order is pending.';
        endActivationBtn.style.display = 'none';
        loadProfile();
        loadHistory();
    }

    function stopIntervals() {
        if (pollInterval) clearInterval(pollInterval);
        if (countdownInterval) clearInterval(countdownInterval);
        pollInterval = null;
        countdownInterval = null;
    }

    let hasAttemptedRestore = false;
    function restoreActiveOrderIfAny() {
        if (hasAttemptedRestore) return;
        if (!lastHistoryData || lastHistoryData.length === 0) return;
        if (window.otpExpiryMinutes === undefined) return;

        hasAttemptedRestore = true;
        const latestOrder = lastHistoryData[0];
        if (latestOrder && latestOrder.status === 'PENDING') {
            const elapsedMs = Date.now() - new Date(latestOrder.created_at).getTime();
            const expiryMs = (window.otpExpiryMinutes || 4) * 60 * 1000;
            if (elapsedMs < expiryMs) {
                currentOrderId = latestOrder.order_id;
                
                let formattedNumber = latestOrder.number;
                if (formattedNumber && !formattedNumber.startsWith('+')) {
                    formattedNumber = '+' + formattedNumber;
                }
                numberDisplay.textContent = formattedNumber;
                numberDisplay.style.cursor = 'pointer';
                
                orderIdDisplay.textContent = latestOrder.order_id;
                orderStatusBadge.textContent = 'Not Received';
                orderStatusBadge.className = 'badge-custom badge-pending';

                setOtpDisplayValue(latestOrder.otp && latestOrder.otp !== 'Not Received' && latestOrder.otp !== '------' ? latestOrder.otp : '------');
                copyOtpBtn.disabled = !(latestOrder.otp && latestOrder.otp !== 'Not Received' && latestOrder.otp !== '------');
                endActivationBtn.style.display = 'block';
                smsStatusContainer.className = 'sms-status-container glow-pending';

                waitingSpinner.classList.remove('d-none');
                
                const remainingSeconds = Math.floor((expiryMs - elapsedMs) / 1000);
                startPolling(latestOrder.order_id, remainingSeconds);
            }
        }
    }

    function handleCopyOtp() {
        const text = otpCodeDisplay.textContent.trim();
        if (text && text !== '------') {
            navigator.clipboard.writeText(text).then(() => {
                const orig = copyOtpBtn.innerHTML;
                copyOtpBtn.innerHTML = '<i class="fa-solid fa-check me-2"></i>Copied!';
                setTimeout(() => copyOtpBtn.innerHTML = orig, 1500);
            });
        }
    }

    function handleCopyNumber() {
        const text = numberDisplay.textContent.trim();
        if (text && text !== 'No active order' && text !== 'Ordering...') {
            navigator.clipboard.writeText(text).then(() => {
                showAlert('Phone number copied to clipboard!', 'success');
            });
        }
    }

    function handleEndActivation() {
        if (!currentOrderId) return;
        
        endActivationBtn.disabled = true;
        endActivationBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Ending...';

        authFetch('/api/buy/end', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: currentOrderId })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                stopIntervals();
                
                orderStatusBadge.textContent = data.status === 'COMPLETED' ? 'Done' : 'Pending';
                orderStatusBadge.className = `badge-custom badge-${data.status === 'COMPLETED' ? 'completed' : 'pending'}`;
                smsStatusContainer.className = 'sms-status-container';
                
                waitingSpinner.classList.add('d-none');
                waitingStatusText.textContent = data.status === 'COMPLETED' ? 'Activation complete.' : 'Activation stopped.';
                
                if (data.otp && data.otp !== 'Not Received') {
                    setOtpDisplayValue(data.otp);
                    copyOtpBtn.disabled = false;
                } else {
                    setOtpDisplayValue('------');
                    copyOtpBtn.disabled = true;
                }

                endActivationBtn.style.display = 'none';

                showAlert('Activation successfully finalized.', 'success');
                loadProfile();
                loadHistory();
            } else {
                showAlert(data.message, 'danger');
            }
            endActivationBtn.disabled = false;
            endActivationBtn.innerHTML = '<i class="fa-solid fa-circle-stop me-2"></i>End Activation';
        })
        .catch(err => {
            showAlert(err.message, 'danger');
            endActivationBtn.disabled = false;
            endActivationBtn.innerHTML = '<i class="fa-solid fa-circle-stop me-2"></i>End Activation';
        });
    }

    /**
     * History Logs & Tables Renderers
     */
    function loadHistory() {
        authFetch('/api/history')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    lastHistoryData = data.orders;
                    renderHistoryTable();
                    restoreActiveOrderIfAny();
                }
            });
    }

    function renderHistoryTable() {
        orderHistoryTableBody.innerHTML = '';
        if (lastHistoryData.length === 0) {
            orderHistoryTableBody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No orders found.</td></tr>`;
            return;
        }
        lastHistoryData.forEach(o => {
            const tr = document.createElement('tr');
            const sc = o.status === 'COMPLETED' ? 'badge-completed' : (o.status === 'PENDING' ? 'badge-pending' : (o.status === 'REFUNDED' ? 'badge-expired' : 'badge-expired'));
            let statusText = o.status;
            if (o.status === 'PENDING') statusText = 'Pending';
            else if (o.status === 'COMPLETED') statusText = 'Done';
            else if (o.status === 'REFUNDED') statusText = 'Refunded';
            else if (o.status === 'EXPIRED') statusText = 'Expired';

            // OTP cell logic
            const hasMsg = o.full_message && o.full_message.trim().length > 0;
            const otpCodeMarkup = hasMsg 
                ? `<code class="fs-6 fw-bold text-success">${o.otp || '------'}</code>` 
                : `<span class="text-muted small">Waiting...</span>`;

            // Message cell logic
            const messageMarkup = hasMsg
                ? `<button class="btn btn-sm btn-success px-3 py-1 btn-view-msg" data-msg="${encodeURIComponent(o.full_message)}"><i class="fa-solid fa-circle-check me-1"></i>Received</button>`
                : `<button class="btn btn-sm btn-secondary opacity-75 px-3 py-1" disabled><i class="fa-regular fa-circle-question me-1"></i>Not Received</button>`;

            // Action cell logic
            const actionMarkup = o.status === 'PENDING'
                ? `<button class="btn btn-sm btn-primary px-3 py-1 btn-fetch-otp" data-order-id="${o.order_id}"><i class="fa-solid fa-rotate-right me-1"></i>Fetch OTP</button>`
                : `<button class="btn btn-sm btn-outline-secondary px-3 py-1" disabled>${o.status === 'REFUNDED' ? 'Refunded' : 'No Action'}</button>`;

            tr.innerHTML = `
                <td><code>${o.order_id}</code></td>
                <td>${o.service}</td>
                <td><strong>${o.number}</strong></td>
                <td>${formatPrice(parseFloat(o.price) / 278.50)}</td>
                <td>${otpCodeMarkup}</td>
                <td>${messageMarkup}</td>
                <td class="small text-secondary">${o.formatted_time}</td>
                <td><span class="badge-custom ${sc}">${statusText}</span></td>
                <td>${actionMarkup}</td>
            `;
            orderHistoryTableBody.appendChild(tr);
        });
    }

    /**
     * Loading user Deposits
     */
    function loadDeposits() {
        authFetch('/api/deposit/history')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    lastDepositData = data.deposits;
                    renderDepositsTable();
                }
            });
        
        loadDepositMethods();
    }

    function loadDepositMethods() {
        authFetch('/api/deposit/methods')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    activeDepositMethods = data.methods;
                    renderDepositMethodsDropdown();
                }
            });
    }

    function renderDepositMethodsDropdown() {
        if (!depositMethod) return;
        depositMethod.innerHTML = '<option value="" selected disabled>Select Wallet / Bank</option>';
        activeDepositMethods.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.method_name;
            opt.textContent = m.method_name;
            depositMethod.appendChild(opt);
        });

        if (activeDepositMethods.length === 1) {
            depositMethod.value = activeDepositMethods[0].method_name;
            updateDepositInstructions(activeDepositMethods[0]);
        } else {
            paymentInstructions.classList.add('d-none');
        }
    }

    function updateDepositInstructions(method) {
        if (!instructionsDetails) return;
        let html = `
            <div class="mb-2"><strong>Bank Name:</strong> ${method.bank_name}</div>
            <div class="mb-2"><strong>Account Title:</strong> ${method.account_title}</div>
            <div class="mb-2 d-flex flex-wrap align-items-center">
                <strong class="me-1">Account Number:</strong> 
                <span class="font-monospace fw-bold text-dark px-2 py-1 rounded bg-light border" id="depositAccNum" style="font-size: 0.95rem;">${method.account_number}</span>
                <button class="btn btn-sm btn-outline-primary ms-2 px-2 py-1 d-inline-flex align-items-center" onclick="copyDepositAccountNumber()" title="Copy Account Number" style="border-radius: 8px; font-size: 0.75rem; font-weight: 500;">
                    <i class="fa-regular fa-copy me-1"></i>Copy
                </button>
            </div>
        `;
        if (method.instructions) {
            html += `<div class="mt-2 pt-2 border-top small text-secondary" style="white-space: pre-wrap;"><strong>Instructions:</strong><br>${method.instructions}</div>`;
        }
        instructionsDetails.innerHTML = html;
        paymentInstructions.classList.remove('d-none');
    }

    window.copyDepositAccountNumber = function() {
        const accSpan = document.getElementById('depositAccNum');
        if (!accSpan) return;
        const text = accSpan.textContent.trim();
        
        navigator.clipboard.writeText(text)
            .then(() => {
                const btn = document.querySelector('button[onclick="copyDepositAccountNumber()"]');
                if (btn) {
                    const originalHTML = btn.innerHTML;
                    btn.innerHTML = '<i class="fa-solid fa-circle-check text-success me-1"></i>Copied!';
                    btn.classList.remove('btn-outline-primary');
                    btn.classList.add('btn-success', 'text-white');
                    setTimeout(() => {
                        btn.innerHTML = originalHTML;
                        btn.classList.add('btn-outline-primary');
                        btn.classList.remove('btn-success', 'text-white');
                    }, 2000);
                }
            })
            .catch(err => {
                console.error('Failed to copy account number:', err);
            });
    };

    function renderDepositsTable() {
        depositHistoryTableBody.innerHTML = '';
        if (lastDepositData.length === 0) {
            depositHistoryTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No deposits made yet.</td></tr>`;
            return;
        }
        lastDepositData.forEach(d => {
            const tr = document.createElement('tr');
            const bc = d.status === 'APPROVED' ? 'bg-success' : (d.status === 'PENDING' ? 'bg-warning text-dark' : 'bg-danger');
            
            const depCurrency = d.currency || 'USD';
            const details = exchangeRates[depCurrency] || { symbol: '$' };
            const formattedAmount = `${details.symbol}${parseFloat(d.amount).toFixed(2)}`;

            const proofPath = d.proof_image || d.screenshot_url;
            let proofHtml = '<span class="text-muted small">No Proof</span>';
            if (proofPath && proofPath.trim() !== '') {
                proofHtml = `
                    <span class="text-success small fw-semibold">
                        <i class="fa-solid fa-circle-check me-1"></i>Proof Attached
                    </span>
                    <button class="btn btn-sm btn-outline-primary ms-2 btn-view-proof" data-path="${proofPath}" style="padding: 1px 6px; font-size: 0.75rem; border-radius: 6px;">
                        <i class="fa-solid fa-eye me-1"></i>Preview
                    </button>
                `;
            }

            tr.innerHTML = `
                <td><code>${d.tx_id}</code></td>
                <td>${d.method}</td>
                <td class="text-nowrap"><strong>${formattedAmount}</strong></td>
                <td>${proofHtml}</td>
                <td class="small text-secondary text-nowrap">${new Date(d.created_at).toLocaleString()}</td>
                <td><span class="badge ${bc}">${d.status}</span></td>
            `;
            depositHistoryTableBody.appendChild(tr);
        });
    }

    function viewProofScreenshot(path) {
        if (!path) return;
        authFetch(`/api/deposit/signed-url?path=${encodeURIComponent(path)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const modal = new bootstrap.Modal(document.getElementById('viewProofModal'));
                    document.getElementById('modalProofImg').src = data.signedUrl;
                    modal.show();
                } else {
                    showAlert(data.message, 'danger');
                }
            })
            .catch(err => {
                showAlert('Failed to retrieve secure proof screenshot: ' + err.message, 'danger');
            });
    }

    async function handleDepositSubmit() {
        const method = depositMethod.value;
        const amount = parseFloat(depositAmount.value);
        const tx_id = depositTxId.value.trim();
        const screenshot_url = depositScreenshot.value.trim();
        const currency = currencySelector.value || 'PKR';
        const file = depositProofFile ? depositProofFile.files[0] : null;

        if (!method || isNaN(amount) || amount <= 0 || !tx_id) {
            showAlert('Please select method, enter valid amount, and type TxID.', 'warning');
            return;
        }

        const pkrRate = exchangeRates['PKR'].rate;
        const selectedRate = exchangeRates[currency].rate;
        const symbol = exchangeRates[currency].symbol;
        const minDepositVal = 50.0 * (selectedRate / pkrRate);

        if (amount < minDepositVal) {
            showAlert(`Minimum deposit amount is ${symbol}${minDepositVal.toFixed(2)}.`, 'warning');
            return;
        }

        submitDepositBtn.disabled = true;
        submitDepositBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sending...';

        let proof_image = null;

        if (file) {
            // Upload to server-side upload endpoint
            try {
                const formData = new FormData();
                formData.append('file', file);

                const uploadRes = await authFetch('/api/deposit/upload', {
                    method: 'POST',
                    body: formData
                }).then(res => res.json());

                if (!uploadRes.success) {
                    throw new Error('Supabase Storage Upload failed: ' + uploadRes.message);
                }

                proof_image = uploadRes.filePath;
            } catch (err) {
                showAlert(err.message, 'danger');
                submitDepositBtn.disabled = false;
                submitDepositBtn.innerHTML = '<i class="fa-solid fa-upload me-2"></i>Submit Deposit Request';
                return;
            }
        }

        authFetch('/api/deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method,
                amount,
                tx_id,
                currency,
                proof_image,
                payment_note: screenshot_url
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showAlert('Deposit request submitted successfully!', 'success');
                depositAmount.value = '';
                depositTxId.value = '';
                depositScreenshot.value = '';
                if (depositProofFile) depositProofFile.value = '';
                if (depositProofPreviewContainer) depositProofPreviewContainer.classList.add('d-none');
                loadDeposits();
            } else {
                showAlert(data.message, 'danger');
            }
            submitDepositBtn.disabled = false;
            submitDepositBtn.innerHTML = '<i class="fa-solid fa-upload me-2"></i>Submit Deposit Request';
        });
    }

    /**
     * API Key rotations
     */
    function handleRotateApiKey() {
        rotateApiKeyBtn.disabled = true;
        rotateApiKeyBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Rotating...';

        authFetch('/api/user/rotate-key', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    if (lastProfileData) lastProfileData.api_key = data.api_key;
                    renderProfileDetails();
                    showAlert('Developer API Key rotated!', 'success');
                } else {
                    showAlert(data.message, 'danger');
                }
                rotateApiKeyBtn.disabled = false;
                rotateApiKeyBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate me-2"></i>Generate / Rotate Key';
            });
    }

    /**
     * Support Tickets Handlers
     */
    function loadTickets() {
        authFetch('/api/tickets')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    ticketsTableBody.innerHTML = '';
                    if (data.tickets.length === 0) {
                        ticketsTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No support tickets found.</td></tr>`;
                        return;
                    }
                    data.tickets.forEach(t => {
                        const tr = document.createElement('tr');
                        const statusClass = t.status === 'OPEN' ? 'bg-success' : 'bg-secondary';
                        tr.innerHTML = `
                            <td><strong>${t.title}</strong></td>
                            <td>${t.category}</td>
                            <td><span class="badge ${statusClass}">${t.status}</span></td>
                            <td class="small text-secondary">${new Date(t.created_at).toLocaleDateString()}</td>
                            <td class="text-end">
                                <button class="btn btn-sm btn-outline-primary px-3 py-1" onclick="openTicketChat('${t.id}', '${t.title.replace(/'/g, "\\'")}', '${t.status}')">
                                    <i class="fa-solid fa-comments me-1"></i>Chat
                                </button>
                            </td>
                        `;
                        ticketsTableBody.appendChild(tr);
                    });
                }
            });
    }

    async function handleCreateTicket(e) {
        e.preventDefault();
        const title = document.getElementById('ticketTitle').value.trim();
        const category = document.getElementById('ticketCategory').value;
        const message = document.getElementById('ticketMessage').value.trim();
        const fileInput = document.getElementById('ticketProofInput');

        const submitBtn = document.getElementById('submitTicketBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sending...';

        let proof_image = null;

        if (fileInput && fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            if (file.size > 5 * 1024 * 1024) {
                showAlert('Screenshot is too large. Max size allowed is 5 MB.', 'danger');
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane me-2"></i>Send Support Ticket';
                return;
            }
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
            if (!allowedTypes.includes(file.type)) {
                showAlert('Invalid file type. Only JPG, JPEG, PNG, and WEBP formats are allowed.', 'danger');
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane me-2"></i>Send Support Ticket';
                return;
            }

            const formData = new FormData();
            formData.append('file', file);

            try {
                const uploadRes = await authFetch('/api/tickets/upload', {
                    method: 'POST',
                    body: formData
                }).then(r => r.json());

                if (uploadRes.success) {
                    proof_image = uploadRes.filePath;
                    showAlert('Image uploaded successfully.', 'success');
                } else {
                    showAlert('Image upload failed: ' + uploadRes.message, 'danger');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane me-2"></i>Send Support Ticket';
                    return;
                }
            } catch (err) {
                showAlert('Image upload connection error: ' + err.message, 'danger');
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane me-2"></i>Send Support Ticket';
                return;
            }
        }

        authFetch('/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, category, message, proof_image })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showAlert('Support ticket created successfully!', 'success');
                document.getElementById('ticketTitle').value = '';
                document.getElementById('ticketMessage').value = '';
                if (fileInput) fileInput.value = '';
                loadTickets();
            } else {
                showAlert(data.message, 'danger');
            }
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane me-2"></i>Send Support Ticket';
        });
    }

    let realtimeChannel = null;
    let supabaseClient = null;

    async function initSupabaseClient() {
        if (supabaseClient) return supabaseClient;
        try {
            const configRes = await fetch('/api/auth/config');
            const config = await configRes.json();
            if (config.supabaseUrl && config.supabaseKey) {
                supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseKey);
            }
        } catch (e) {
            console.error('Realtime init error:', e);
        }
        return supabaseClient;
    }

    window.openTicketChat = function(ticketId, ticketTitle, ticketStatus) {
        activeChatTicketId = ticketId;
        chatTicketTitle.textContent = ticketTitle;
        chatTicketStatus.textContent = ticketStatus;
        chatTicketStatus.className = `badge ${ticketStatus === 'OPEN' ? 'bg-success' : 'bg-secondary'}`;

        const closedMsgEl = document.getElementById('closedTicketMessage');
        if (ticketStatus === 'CLOSED') {
            chatInputMessage.disabled = true;
            document.getElementById('chatInputSubmitBtn').disabled = true;
            closedMsgEl.classList.remove('d-none');
        } else {
            chatInputMessage.disabled = false;
            document.getElementById('chatInputSubmitBtn').disabled = false;
            closedMsgEl.classList.add('d-none');
        }

        ticketListCard.classList.add('d-none');
        ticketChatCard.classList.remove('d-none');

        loadChatMessages(ticketId);

        // Auto-poll fallback (as backup or mock mode)
        if (chatInterval) clearInterval(chatInterval);
        chatInterval = setInterval(() => {
            loadChatMessages(ticketId);
        }, 4000);

        // Set up Supabase Realtime channel listener
        initSupabaseClient().then(client => {
            if (!client) return;
            
            // Disable backup polling if Realtime is functional
            if (chatInterval) {
                clearInterval(chatInterval);
                chatInterval = null;
            }

            if (realtimeChannel) {
                client.removeChannel(realtimeChannel);
            }
            realtimeChannel = client
                .channel(`public:ticket_messages:ticket_id=eq.${ticketId}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'ticket_messages',
                    filter: `ticket_id=eq.${ticketId}`
                }, (payload) => {
                    loadChatMessages(ticketId);
                    showToast('New message received!', 'info');
                })
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'tickets',
                    filter: `id=eq.${ticketId}`
                }, (payload) => {
                    if (payload.new && payload.new.status) {
                        chatTicketStatus.textContent = payload.new.status;
                        chatTicketStatus.className = `badge ${payload.new.status === 'OPEN' ? 'bg-success' : 'bg-secondary'}`;
                        if (payload.new.status === 'CLOSED') {
                            chatInputMessage.disabled = true;
                            document.getElementById('chatInputSubmitBtn').disabled = true;
                            closedMsgEl.classList.remove('d-none');
                        }
                        showToast(`Ticket status is now ${payload.new.status}`, 'info');
                    }
                })
                .subscribe();
        });
    };

    window.viewTicketProof = function(path) {
        if (!path) return;
        authFetch(`/api/tickets/signed-url?path=${encodeURIComponent(path)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const modal = new bootstrap.Modal(document.getElementById('viewProofModal'));
                    document.getElementById('viewProofModalLabel').textContent = "Ticket Attachment Preview";
                    document.getElementById('modalProofImg').src = data.signedUrl;
                    modal.show();
                } else {
                    showAlert('Error loading image preview: ' + data.message, 'danger');
                }
            });
    };

    function loadChatMessages(ticketId) {
        authFetch(`/api/tickets/${ticketId}/messages`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    chatMessages.innerHTML = '';

                    // Check status sync
                    if (data.status) {
                        chatTicketStatus.textContent = data.status;
                        chatTicketStatus.className = `badge ${data.status === 'OPEN' ? 'bg-success' : 'bg-secondary'}`;
                        const closedMsgEl = document.getElementById('closedTicketMessage');
                        if (data.status === 'CLOSED') {
                            chatInputMessage.disabled = true;
                            document.getElementById('chatInputSubmitBtn').disabled = true;
                            closedMsgEl.classList.remove('d-none');
                        } else {
                            chatInputMessage.disabled = false;
                            document.getElementById('chatInputSubmitBtn').disabled = false;
                            closedMsgEl.classList.add('d-none');
                        }
                    }

                    // Display attachment proof at top of messages container if exists
                    if (data.proof_image) {
                        const attachmentDiv = document.createElement('div');
                        attachmentDiv.className = 'p-3 mb-3 border rounded bg-white';
                        attachmentDiv.innerHTML = `
                            <div class="small text-secondary fw-semibold mb-2"><i class="fa-solid fa-paperclip me-1"></i>Ticket Attachment:</div>
                            <button class="btn btn-sm btn-outline-primary d-inline-flex align-items-center" onclick="viewTicketProof('${data.proof_image}')" style="border-radius: 8px;">
                                <i class="fa-solid fa-eye me-1"></i>Preview Screenshot
                            </button>
                        `;
                        chatMessages.appendChild(attachmentDiv);
                    }

                    data.messages.forEach(m => {
                        const div = document.createElement('div');
                        const isSelf = m.sender_id === lastProfileData.id;
                        div.className = `chat-bubble ${isSelf ? 'sent' : 'received'}`;
                        div.innerHTML = `
                            <div class="small fw-semibold opacity-75 mb-1" style="font-size: 0.75rem;">${isSelf ? 'You' : m.sender_email}</div>
                            <div>${m.message}</div>
                            <div class="text-end small opacity-50 mt-1" style="font-size: 0.65rem;">${new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                        `;
                        chatMessages.appendChild(div);
                    });
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            });
    }

    function handleSendChatMessage(e) {
        e.preventDefault();
        const message = chatInputMessage.value.trim();
        if (!message || !activeChatTicketId) return;

        chatInputMessage.value = '';

        authFetch(`/api/tickets/${activeChatTicketId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                loadChatMessages(activeChatTicketId);
            } else {
                showAlert(data.message, 'danger');
            }
        });
    }

    /**
     * Account Profile & Security Settings Handlers
     */
    function handleSaveProfileName(e) {
        e.preventDefault();
        const newName = settingsNameInput.value.trim();

        const btn = document.getElementById('saveProfileBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

        authFetch('/api/user/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                if (lastProfileData) lastProfileData.name = newName;
                renderProfileDetails();
                showAlert('Full Name updated successfully!', 'success');
            } else {
                showAlert(data.message, 'danger');
            }
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-check me-2"></i>Save Full Name';
        });
    }

    async function handleSavePassword(e) {
        e.preventDefault();
        const p1 = settingsPassword.value;
        const p2 = settingsPasswordConfirm.value;

        if (p1 !== p2) {
            showAlert('Confirm password matching failed.', 'warning');
            return;
        }

        const btn = document.getElementById('savePasswordBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

        // 1. Fetch config to construct client
        try {
            const configRes = await fetch('/api/auth/config');
            const config = await configRes.json();
            const supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseKey);

            // 2. Perform direct password change client-side
            const { error } = await supabaseClient.auth.updateUser({ password: p1 });

            if (error) {
                showAlert(error.message, 'danger');
            } else {
                showAlert('Your account password was updated successfully!', 'success');
                settingsPassword.value = '';
                settingsPasswordConfirm.value = '';
            }
        } catch (err) {
            showAlert('Communication error: ' + err.message, 'danger');
        }

        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-shield-halved me-2"></i>Update Password';
    }

    function loadWhatsappSupport() {
        authFetch('/api/user/whatsapp')
            .then(res => res.json())
            .then(data => {
                const btn = document.getElementById('whatsapp-floating-btn');
                if (!btn) return;
                if (data.success && data.is_enabled && data.whatsapp_number) {
                    const encodedMsg = encodeURIComponent(data.default_message || '');
                    btn.href = `https://wa.me/${data.whatsapp_number}?text=${encodedMsg}`;
                    btn.classList.remove('d-none');
                } else {
                    btn.classList.add('d-none');
                }
            })
            .catch(err => {
                console.error('Failed to load WhatsApp support configuration:', err);
                const btn = document.getElementById('whatsapp-floating-btn');
                if (btn) btn.classList.add('d-none');
            });
    }
});
