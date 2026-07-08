// public/assets/js/app.js
document.addEventListener('DOMContentLoaded', () => {
    const sessionToken = localStorage.getItem('nova_session_token');
    if (!sessionToken) return; // Exit if unauthorized (handled by auth.js)

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
    const smsStatusContainer = document.getElementById('smsStatusContainer');
    const waitingStatusText = document.getElementById('waitingStatusText');
    const waitingSpinner = document.getElementById('waitingSpinner');



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
    const paymentAccounts = {
        'Easypaisa': '<strong>Easypaisa Account:</strong><br>Number: 0314-5551234<br>Name: Zain Ali',
        'Jazzcash': '<strong>Jazzcash Account:</strong><br>Number: 0300-9876543<br>Name: Zain Ali',
        'Zindagi': '<strong>Zindagi App Wallet:</strong><br>Number: 0321-7654321<br>Name: Zain Ali',
        'Bank': '<strong>Bank Account (PKR):</strong><br>Bank: Bank Alfalah<br>Account Number: 5502-9018-2012-9812<br>Title: Zain Ali'
    };

    // Initialize View
    init();

    function init() {
        loadProfile();
        loadServices();
        loadHistory();
        loadDeposits();
        loadTickets();
        setupEventListeners();
    }

    function setupEventListeners() {
        // Sidebar Navigation click router
        sidebarLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                sidebarLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');

                const targetPane = link.getAttribute('data-pane');
                
                // Hide all panes, show target
                document.querySelectorAll('.pane-content').forEach(pane => {
                    pane.classList.remove('active');
                });
                document.getElementById(`pane-${targetPane}`).classList.add('active');

                // Update Header Pane Title Text
                paneTitle.textContent = link.textContent.trim();
                alertContainer.innerHTML = ''; // Clear alerts on switch
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

        // Services search filter
        servicesSearch.addEventListener('input', renderServicesTable);

        // Deposit Guidelines changes
        depositMethod.addEventListener('change', () => {
            const method = depositMethod.value;
            if (paymentAccounts[method]) {
                instructionsDetails.innerHTML = paymentAccounts[method];
                paymentInstructions.classList.remove('d-none');
            } else {
                paymentInstructions.classList.add('d-none');
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
    }

    function showAlert(message, type = 'danger') {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div class="alert alert-${type} alert-dismissible fade show" role="alert">
                <div><i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'} me-2"></i>${message}</div>
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;
        alertContainer.innerHTML = '';
        alertContainer.appendChild(wrapper);
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
    function loadProfile(callback = null) {
        authFetch('/api/user/profile')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    lastProfileData = data.profile;
                    renderProfileDetails();
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

    function renderProfileDetails() {
        if (!lastProfileData) return;

        // Apply saved currency preference on load
        if (lastProfileData.currency && currencySelector.value !== lastProfileData.currency) {
            currencySelector.value = lastProfileData.currency;
        }

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
            servicesTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No service apps found matching search.</td></tr>`;
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
                numberDisplay.textContent = data.number;
                orderIdDisplay.textContent = data.order_id;
                orderStatusBadge.textContent = 'PENDING';
                orderStatusBadge.className = 'badge-custom badge-pending';

                otpCodeDisplay.textContent = '------';
                copyOtpBtn.disabled = true;
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



    function startPolling(orderId) {
        stopIntervals();
        countdownSeconds = (window.otpExpiryMinutes || 5) * 60;

        pollInterval = setInterval(() => {
            pollSmsStatus(orderId);
        }, 5000);

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
                    if (data.status === 'COMPLETED') {
                        stopIntervals();
                        orderStatusBadge.textContent = 'COMPLETED';
                        orderStatusBadge.className = 'badge-custom badge-success';
                        
                        otpCodeDisplay.textContent = data.otp;
                        copyOtpBtn.disabled = false;
                        
                        smsStatusContainer.className = 'sms-status-container glow-success';
                        waitingSpinner.classList.add('d-none');
                        waitingStatusText.textContent = 'Verification code successfully received!';
                        
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
        orderStatusBadge.textContent = 'EXPIRED';
        orderStatusBadge.className = 'badge-custom badge-expired';
        smsStatusContainer.className = 'sms-status-container';
        waitingSpinner.classList.add('d-none');
        waitingStatusText.textContent = 'Operation expired.';
        loadHistory();
    }

    function stopIntervals() {
        if (pollInterval) clearInterval(pollInterval);
        if (countdownInterval) clearInterval(countdownInterval);
        pollInterval = null;
        countdownInterval = null;
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
                }
            });
    }

    function renderHistoryTable() {
        orderHistoryTableBody.innerHTML = '';
        if (lastHistoryData.length === 0) {
            orderHistoryTableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No orders found.</td></tr>`;
            return;
        }
        lastHistoryData.forEach(o => {
            const tr = document.createElement('tr');
            const sc = o.status === 'COMPLETED' ? 'badge-success' : (o.status === 'PENDING' ? 'badge-pending' : 'badge-expired');
            tr.innerHTML = `
                <td><code>${o.order_id}</code></td>
                <td>${o.service}</td>
                <td><strong>${o.number}</strong></td>
                <td>${formatPrice(parseFloat(o.price))}</td>
                <td><code class="fs-6">${o.otp || '------'}</code></td>
                <td class="small text-secondary">${o.formatted_time}</td>
                <td><span class="badge-custom ${sc}">${o.status}</span></td>
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
    }

    function renderDepositsTable() {
        depositHistoryTableBody.innerHTML = '';
        if (lastDepositData.length === 0) {
            depositHistoryTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">No deposits made yet.</td></tr>`;
            return;
        }
        lastDepositData.forEach(d => {
            const tr = document.createElement('tr');
            const bc = d.status === 'APPROVED' ? 'bg-success' : (d.status === 'PENDING' ? 'bg-warning text-dark' : 'bg-danger');
            tr.innerHTML = `
                <td><code>${d.tx_id}</code></td>
                <td>${d.method}</td>
                <td><strong>${formatPrice(parseFloat(d.amount))}</strong></td>
                <td class="small text-secondary">${new Date(d.created_at).toLocaleString()}</td>
                <td><span class="badge ${bc}">${d.status}</span></td>
            `;
            depositHistoryTableBody.appendChild(tr);
        });
    }

    function handleDepositSubmit() {
        const method = depositMethod.value;
        const amount = parseFloat(depositAmount.value);
        const tx_id = depositTxId.value.trim();
        const screenshot_url = depositScreenshot.value.trim();

        if (!method || isNaN(amount) || amount <= 0 || !tx_id) {
            showAlert('Please select method, enter valid amount, and type TxID.', 'warning');
            return;
        }

        submitDepositBtn.disabled = true;
        submitDepositBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sending...';

        authFetch('/api/deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method, amount, tx_id, screenshot_url })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showAlert('Deposit request submitted successfully!', 'success');
                depositAmount.value = '';
                depositTxId.value = '';
                depositScreenshot.value = '';
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

    function handleCreateTicket(e) {
        e.preventDefault();
        const title = document.getElementById('ticketTitle').value.trim();
        const category = document.getElementById('ticketCategory').value;
        const message = document.getElementById('ticketMessage').value.trim();

        const submitBtn = document.getElementById('submitTicketBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sending...';

        authFetch('/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, category, message })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showAlert('Support ticket created successfully!', 'success');
                document.getElementById('ticketTitle').value = '';
                document.getElementById('ticketMessage').value = '';
                loadTickets();
            } else {
                showAlert(data.message, 'danger');
            }
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane me-2"></i>Send Support Ticket';
        });
    }

    window.openTicketChat = function(ticketId, ticketTitle, ticketStatus) {
        activeChatTicketId = ticketId;
        chatTicketTitle.textContent = ticketTitle;
        chatTicketStatus.textContent = ticketStatus;
        chatTicketStatus.className = `badge ${ticketStatus === 'OPEN' ? 'bg-success' : 'bg-secondary'}`;

        ticketListCard.classList.add('d-none');
        ticketChatCard.classList.remove('d-none');

        loadChatMessages(ticketId);

        // Auto-poll ticket chat every 4 seconds
        if (chatInterval) clearInterval(chatInterval);
        chatInterval = setInterval(() => {
            loadChatMessages(ticketId);
        }, 4000);
    };

    function loadChatMessages(ticketId) {
        authFetch(`/api/tickets/${ticketId}/messages`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    chatMessages.innerHTML = '';
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
});
