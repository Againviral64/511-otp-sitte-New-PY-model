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
    let availableGroups = [];
    let currentOrderId = null;
    let pollInterval = null;
    let countdownInterval = null;
    let countdownSeconds = 300;

    // Cached logs for instant currency switching
    let lastHistoryData = [];
    let lastDepositData = [];
    let lastProfileData = null;
    let hasSubscribedRealtime = false;
    let activeChatTicketId = null;
    let chatInterval = null;

    // Currency exchange configuration (Base currency is USD)
    const exchangeRates = {
        PKR: { rate: 278.50, symbol: 'Rs ' },
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
    const copyTrackingLinkBtn = document.getElementById('copyTrackingLinkBtn');
    const endActivationBtn = document.getElementById('endActivationBtn');
    const smsStatusContainer = document.getElementById('smsStatusContainer');
    const waitingStatusText = document.getElementById('waitingStatusText');
    const waitingSpinner = document.getElementById('waitingSpinner');

    let currentTrackingKey = null;

    let currentLatestOtp = null; // Global variable to store the latest OTP
    let lastSmsCount = -1; // Track message count for chime notification

    function playChimeNotification() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            
            const playTone = (freq, startTime, duration) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, startTime);
                gain.gain.setValueAtTime(0.2, startTime);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(startTime);
                osc.stop(startTime + duration);
            };
            
            const now = ctx.currentTime;
            playTone(880, now, 0.35); // A5 chime note
            playTone(1046.50, now + 0.1, 0.45); // C6 chime note
        } catch (e) {
            console.warn('Web Audio chime sound failed:', e);
        }
    }

    function setOtpDisplayValue(messagesOrText, isHighlighted = false) {
        // Clear any custom styles
        otpCodeDisplay.style.fontSize = '';
        otpCodeDisplay.style.letterSpacing = '';
        otpCodeDisplay.style.borderColor = '';
        otpCodeDisplay.style.color = '';
        otpCodeDisplay.style.backgroundColor = '';
        otpCodeDisplay.style.boxShadow = '';
        otpCodeDisplay.style.display = 'flex';
        otpCodeDisplay.style.flexDirection = 'column';
        otpCodeDisplay.style.alignItems = 'stretch';
        otpCodeDisplay.classList.remove('display-4', 'fs-6');
        otpCodeDisplay.innerHTML = '';
        
        // Handle empty/loading state
        if (!messagesOrText || messagesOrText === '------' || messagesOrText === 'Not Received' || (Array.isArray(messagesOrText) && messagesOrText.length === 0)) {
            otpCodeDisplay.textContent = '------';
            otpCodeDisplay.style.letterSpacing = '4px';
            otpCodeDisplay.style.display = 'flex';
            otpCodeDisplay.style.flexDirection = 'row';
            otpCodeDisplay.style.alignItems = 'center';
            otpCodeDisplay.style.justifyContent = 'center';
            otpCodeDisplay.classList.add('display-4');
            currentLatestOtp = null;
            return;
        }

        // Normalize to array of message objects or strings
        let messages = [];
        if (Array.isArray(messagesOrText)) {
            messages = messagesOrText;
        } else {
            messages = [{ text: messagesOrText }];
        }

        // Store the latest OTP from the last message in the array
        const latestMsg = messages[messages.length - 1];
        const latestMsgText = typeof latestMsg === 'object' ? latestMsg.text : latestMsg;
        const otpMatch = latestMsgText ? latestMsgText.match(/\b\d{4,8}\b/) : null;
        currentLatestOtp = (typeof latestMsg === 'object' && latestMsg.otp) ? latestMsg.otp : (otpMatch ? otpMatch[0] : null);

        // Render messages: recent on TOP, older below (loop in reverse)
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const msgText = typeof msg === 'object' ? msg.text : msg;
            const absoluteIdx = i + 1;
            
            const msgCard = document.createElement('div');
            msgCard.className = 'p-3 rounded border text-start mb-3 shadow-sm d-flex flex-column';
            
            // Highlight the latest message (which is index length - 1)
            if (i === messages.length - 1 && isHighlighted) {
                msgCard.style.borderColor = '#10b981';
                msgCard.style.backgroundColor = '#f0fdf4';
                msgCard.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.08)';
            } else {
                msgCard.style.borderColor = '#e2e8f0';
                msgCard.style.backgroundColor = '#ffffff';
            }

            // Card Header
            const cardHeader = document.createElement('div');
            cardHeader.className = 'd-flex justify-content-between align-items-center mb-2 pb-2 border-bottom';
            cardHeader.style.borderColor = '#f1f5f9';

            // Index label
            const label = document.createElement('span');
            label.className = 'px-2 py-0.5 rounded fw-bold text-uppercase';
            label.style.fontSize = '0.7rem';
            label.style.letterSpacing = '0.5px';
            if (i === messages.length - 1) {
                label.style.backgroundColor = '#d1fae5';
                label.style.color = '#065f46';
                label.textContent = `Message ${absoluteIdx} (Latest)`;
            } else {
                label.style.backgroundColor = '#f1f5f9';
                label.style.color = '#475569';
                label.textContent = `Message ${absoluteIdx}`;
            }
            cardHeader.appendChild(label);

            // Copy button on top right of card
            const otpCodeMatch = msgText.match(/\b\d{4,8}\b/);
            const msgOtp = (typeof msg === 'object' && msg.otp) ? msg.otp : (otpCodeMatch ? otpCodeMatch[0] : null);
            const copyText = msgOtp || msgText;

            const copyBtn = document.createElement('button');
            copyBtn.className = 'btn btn-sm btn-primary px-2.5 py-0.5 d-flex align-items-center gap-1';
            copyBtn.style.borderRadius = '4px';
            copyBtn.style.fontSize = '0.72rem';
            copyBtn.style.fontWeight = '600';
            copyBtn.style.backgroundColor = '#2563eb';
            copyBtn.style.borderColor = '#2563eb';
            copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy';
            
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(copyText).then(() => {
                    const origHtml = copyBtn.innerHTML;
                    copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                    copyBtn.style.backgroundColor = '#10b981';
                    copyBtn.style.borderColor = '#10b981';
                    setTimeout(() => {
                        copyBtn.innerHTML = origHtml;
                        copyBtn.style.backgroundColor = '#2563eb';
                        copyBtn.style.borderColor = '#2563eb';
                    }, 1500);
                });
            });
            cardHeader.appendChild(copyBtn);

            msgCard.appendChild(cardHeader);

            // Card Content text
            const contentText = document.createElement('div');
            contentText.className = 'font-monospace text-wrap';
            contentText.style.fontSize = '0.85rem';
            contentText.style.lineHeight = '1.4';
            contentText.style.whiteSpace = 'pre-wrap';
            contentText.style.wordBreak = 'break-all';
            contentText.style.color = '#1e293b';
            contentText.textContent = msgText;

            msgCard.appendChild(contentText);
            otpCodeDisplay.appendChild(msgCard);
        }
    }

    function parseMessagesFromString(text) {
        if (!text) return [];
        
        // Regex to match "Message #1:", "Message #2:", "Message 1:", "Message 2:" etc.
        const regex = /Message\s*#?\d+:/gi;
        const matches = [...text.matchAll(regex)];
        
        if (matches.length === 0) {
            return [{ text: text }];
        }
        
        const messages = [];
        for (let i = 0; i < matches.length; i++) {
            const startIdx = matches[i].index + matches[i][0].length;
            const endIdx = (i + 1 < matches.length) ? matches[i+1].index : text.length;
            const msgContent = text.substring(startIdx, endIdx).trim();
            if (msgContent) {
                messages.push({ text: msgContent });
            }
        }
        return messages;
    }

    function renderModalMessageCards(messages, number = '') {
        const modalBody = document.getElementById('modalMessageBody');
        if (!modalBody) return;
        
        modalBody.style.backgroundColor = 'transparent';
        modalBody.style.border = 'none';
        modalBody.style.padding = '0';
        modalBody.innerHTML = ''; // Clear previous text

        // 1. Render Number Header at the top
        if (number) {
            let formattedNumber = number;
            if (!formattedNumber.startsWith('+')) {
                formattedNumber = '+' + formattedNumber;
            }
            const numberHeader = document.createElement('div');
            numberHeader.className = 'p-3 mb-3 border rounded text-center shadow-sm';
            numberHeader.style.backgroundColor = '#f8fafc';
            numberHeader.style.borderColor = '#3b82f6'; // Match primary theme
            numberHeader.innerHTML = `
                <span class="text-secondary small font-monospace d-block text-uppercase fw-bold mb-1" style="letter-spacing: 1px; font-size: 0.7rem;">Active Phone Number</span>
                <strong class="fs-5 text-dark" style="letter-spacing: 0.5px;">${formattedNumber}</strong>
            `;
            modalBody.appendChild(numberHeader);
        }

        if (!messages || messages.length === 0) {
            const noMsg = document.createElement('div');
            noMsg.className = 'text-center py-4 text-muted border rounded bg-white';
            noMsg.textContent = 'No messages found.';
            modalBody.appendChild(noMsg);
            return;
        }

        // 2. Create Scroll Container for messages
        const scrollContainer = document.createElement('div');
        scrollContainer.style.maxHeight = '420px';
        scrollContainer.style.overflowY = 'auto';
        scrollContainer.style.scrollbarWidth = 'thin';
        scrollContainer.style.paddingRight = '5px';

        // Limit to 10 messages max (keep the last 10)
        let messagesToRender = messages;
        if (messages.length > 10) {
            messagesToRender = messages.slice(-10);
        }

        // Render messages: newest (last in array) at TOP, oldest (first in array) at BOTTOM
        for (let idx = messagesToRender.length - 1; idx >= 0; idx--) {
            const m = messagesToRender[idx];
            // Calculate absolute message index relative to total list
            const absoluteIdx = messages.length - (messagesToRender.length - 1 - idx);
            const msgText = typeof m === 'object' ? m.text : m;

            const messageCard = document.createElement('div');
            messageCard.className = 'p-3 mb-3 border rounded shadow-sm bg-white text-dark d-flex flex-column';
            
            // Highlight newest message on top with blue/indigo border and subtle background tint
            if (idx === messagesToRender.length - 1) {
                messageCard.style.borderColor = '#3b82f6';
                messageCard.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.08)';
                messageCard.style.backgroundColor = '#f8fafc';
            } else {
                messageCard.style.borderColor = '#e2e8f0';
            }

            // 1. Card Header (Flex row to keep layout clean and prevent overlap)
            const cardHeader = document.createElement('div');
            cardHeader.className = 'd-flex justify-content-between align-items-center mb-2 pb-2 border-bottom';
            cardHeader.style.borderColor = '#f1f5f9';

            // Message index label
            const label = document.createElement('span');
            label.className = 'px-2 py-0.5 rounded fw-bold text-uppercase';
            label.style.fontSize = '0.7rem';
            label.style.letterSpacing = '0.5px';
            
            if (idx === messagesToRender.length - 1) {
                label.style.backgroundColor = '#dbeafe';
                label.style.color = '#1e40af';
                label.textContent = `Message ${absoluteIdx} (Latest)`;
            } else {
                label.style.backgroundColor = '#f1f5f9';
                label.style.color = '#475569';
                label.textContent = `Message ${absoluteIdx}`;
            }
            cardHeader.appendChild(label);

            const copyBtn = document.createElement('button');
            copyBtn.className = 'btn btn-sm btn-primary px-2.5 py-0.5 d-flex align-items-center gap-1';
            copyBtn.style.borderRadius = '4px';
            copyBtn.style.fontSize = '0.72rem';
            copyBtn.style.fontWeight = '600';
            copyBtn.style.backgroundColor = '#2563eb';
            copyBtn.style.borderColor = '#2563eb';
            
            // Extract OTP or copy full message
            const otpMatch = msgText ? msgText.match(/\b\d{4,8}\b/) : null;
            const otpText = otpMatch ? otpMatch[0] : msgText;

            copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy';
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(otpText).then(() => {
                    const orig = copyBtn.innerHTML;
                    copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                    copyBtn.style.backgroundColor = '#10b981';
                    copyBtn.style.borderColor = '#10b981';
                    setTimeout(() => {
                        copyBtn.innerHTML = orig;
                        copyBtn.style.backgroundColor = '#2563eb';
                        copyBtn.style.borderColor = '#2563eb';
                    }, 1500);
                });
            });

            cardHeader.appendChild(copyBtn);
            messageCard.appendChild(cardHeader);

            // 2. Card Body (Message text)
            const contentText = document.createElement('div');
            contentText.className = 'font-monospace text-wrap my-1 text-start';
            contentText.style.fontSize = '0.875rem';
            contentText.style.lineHeight = '1.5';
            contentText.style.whiteSpace = 'pre-wrap';
            contentText.style.wordBreak = 'break-all';
            contentText.style.color = '#1e293b';
            contentText.textContent = msgText;
            messageCard.appendChild(contentText);

            scrollContainer.appendChild(messageCard);
        }
        
        modalBody.appendChild(scrollContainer);
    }

    function showHistoryMessagesModal(orderId, fallbackMsg, number = '') {
        if (!orderId) {
            renderModalMessageCards(parseMessagesFromString(fallbackMsg), number);
            showViewMessageModal();
            return;
        }

        // Show loading spinner in modal body first
        const modalBody = document.getElementById('modalMessageBody');
        if (modalBody) {
            modalBody.style.backgroundColor = 'transparent';
            modalBody.style.border = 'none';
            modalBody.style.padding = '0';
            modalBody.innerHTML = `
                <div class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
            `;
        }
        
        // Hide modal footer copy button
        const copyFooterBtn = document.getElementById('copyModalMessageBtn');
        if (copyFooterBtn) copyFooterBtn.style.display = 'none';

        // Hide the modal footer entirely (removes Close button at bottom)
        const modalFooter = document.querySelector('#viewMessageModal .modal-footer');
        if (modalFooter) {
            modalFooter.style.display = 'none';
        }

        // Show the modal
        showViewMessageModal();

        // Fetch from API
        authFetch(`/api/sms?order_id=${encodeURIComponent(orderId)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success && data.sms_messages && data.sms_messages.length > 0) {
                    renderModalMessageCards(data.sms_messages, number);
                } else {
                    renderModalMessageCards(parseMessagesFromString(fallbackMsg), number);
                }
            })
            .catch(err => {
                renderModalMessageCards(parseMessagesFromString(fallbackMsg), number);
            });
    }

    function showViewMessageModal() {
        const modalEl = document.getElementById('viewMessageModal');
        if (modalEl) {
            let modalObj = bootstrap.Modal.getInstance(modalEl);
            if (!modalObj) {
                modalObj = new bootstrap.Modal(modalEl);
            }
            modalObj.show();
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
        // Real-time search filter for History Log
        const historySearchInput = document.getElementById('historySearchInput');
        if (historySearchInput) {
            historySearchInput.addEventListener('input', () => {
                const query = historySearchInput.value.toLowerCase().trim();
                if (!query) {
                    renderHistoryTable(lastHistoryData);
                    return;
                }
                const filtered = lastHistoryData.filter(o => {
                    const orderId = String(o.order_id || '').toLowerCase();
                    const service = String(o.service || '').toLowerCase();
                    const number = String(o.number || '').toLowerCase();
                    const statusText = String(o.status || '').toLowerCase();
                    const trackingKey = String(o.tracking_key || '').toLowerCase();
                    const otp = String(o.otp || '').toLowerCase();
                    
                    return orderId.includes(query) || 
                           service.includes(query) || 
                           number.includes(query) || 
                           statusText.includes(query) || 
                           trackingKey.includes(query) ||
                           otp.includes(query);
                });
                renderHistoryTable(filtered);
            });
        }

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

        const bulkCountrySelect = document.getElementById('bulkCountrySelect');
        const bulkServiceSelect = document.getElementById('bulkServiceSelect');
        const bulkOrderQuantity = document.getElementById('bulkOrderQuantity');
        const buyBulkBtn = document.getElementById('buyBulkBtn');
        const copyBulkOutputBtn = document.getElementById('copyBulkOutputBtn');

        if (bulkCountrySelect) {
            bulkCountrySelect.addEventListener('change', handleBulkCountryChange);
        }
        if (bulkServiceSelect) {
            bulkServiceSelect.addEventListener('change', updateBulkPriceDisplay);
        }
        if (bulkOrderQuantity) {
            bulkOrderQuantity.addEventListener('input', updateBulkPriceDisplay);
        }
        if (buyBulkBtn) {
            buyBulkBtn.addEventListener('click', handleBuyBulkOrders);
        }
        if (copyBulkOutputBtn) {
            copyBulkOutputBtn.addEventListener('click', handleCopyBulkOutput);
        }

        // Core purchase actions triggers
        buyNumberBtn.addEventListener('click', handleBuyNumber);
        copyOtpBtn.addEventListener('click', handleCopyOtp);

        if (copyTrackingLinkBtn) {
            copyTrackingLinkBtn.addEventListener('click', () => {
                if (!currentTrackingKey) return;
                const link = getTrackingUrl(currentTrackingKey);
                navigator.clipboard.writeText(link)
                    .then(() => {
                        showAlert('Tracking URL copied to clipboard!', 'success');
                    })
                    .catch(() => {
                        showAlert('Failed to copy tracking link.', 'danger');
                    });
            });
        }
        if (endActivationBtn) {
            endActivationBtn.addEventListener('click', handleEndActivation);
        }
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
            const historyFetchBtn = e.target.closest('.btn-history-fetch');
            const copyLinkBtn = e.target.closest('.btn-copy-link');

            if (copyLinkBtn) {
                const link = copyLinkBtn.getAttribute('data-link');
                navigator.clipboard.writeText(link).then(() => {
                    const orig = copyLinkBtn.innerHTML;
                    copyLinkBtn.innerHTML = '<i class="fa-solid fa-check text-success"></i>';
                    setTimeout(() => {
                        copyLinkBtn.innerHTML = orig;
                    }, 1500);
                });
            }

            if (historyFetchBtn) {
                const orderId = historyFetchBtn.getAttribute('data-order-id');
                const number = historyFetchBtn.getAttribute('data-number') || '';
                historyFetchBtn.disabled = true;
                const origHtml = historyFetchBtn.innerHTML;
                historyFetchBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>...';
                
                showHistoryMessagesModal(orderId, "", number);
                
                setTimeout(() => {
                    historyFetchBtn.disabled = false;
                    historyFetchBtn.innerHTML = origHtml;
                }, 1000);
            }

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
                        currentTrackingKey = o.tracking_key;
                        
                        if (copyTrackingLinkBtn && currentTrackingKey) {
                            copyTrackingLinkBtn.style.display = 'block';
                        }
                        
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
                        if (endActivationBtn) {
                            endActivationBtn.style.display = 'block';
                        }
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
                const orderId = viewMsgBtn.getAttribute('data-order-id');
                const number = viewMsgBtn.getAttribute('data-number') || '';
                
                showHistoryMessagesModal(orderId, decodedMsg, number);
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

        // Clear error highlights when user starts fixing
        depositAmount.addEventListener('input', () => { depositAmount.style.border = ''; });
        if (depositProofFile) {
            depositProofFile.addEventListener('change', () => { depositProofFile.style.border = ''; });
        }

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

    function getTrackingUrl(trackingKey) {
        if (!trackingKey) return '';
        let domain = window.trackingDomain || 'access.novatixdigi.online';
        domain = String(domain).trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
        return `https://${domain}/${trackingKey}`;
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
                    // Save dynamic OTP timeout & tracking domain config
                    window.otpExpiryMinutes = data.otp_expiry_minutes || 5;
                    if (data.tracking_domain) {
                        window.trackingDomain = data.tracking_domain;
                    }
                    const timeoutLimitBadge = document.getElementById('timeoutLimitBadge');
                    if (timeoutLimitBadge) {
                        timeoutLimitBadge.textContent = `Timeout: ${window.otpExpiryMinutes} mins`;
                    }

                    // Populate Group Selectors
                    countrySelect.innerHTML = '<option value="" selected disabled>Select Category/Group</option>';
                    const bulkCountrySelect = document.getElementById('bulkCountrySelect');
                    if (bulkCountrySelect) {
                        bulkCountrySelect.innerHTML = '<option value="" selected disabled>Select Category/Group</option>';
                    }
                    data.countries.forEach(country => {
                        const opt = document.createElement('option');
                        opt.value = country.code;
                        opt.textContent = `${country.flag} ${country.name}`;
                        countrySelect.appendChild(opt);
                        
                        if (bulkCountrySelect) {
                            const bulkOpt = opt.cloneNode(true);
                            bulkCountrySelect.appendChild(bulkOpt);
                        }
                    });

                    availableGroups = data.countries;
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
            const groupMatch = availableGroups.find(g => g.code === s.group_id);
            const groupName = groupMatch ? `${groupMatch.flag || '🌐'} ${groupMatch.name}` : `Group ${s.group_id}`;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${s.name}</strong></td>
                <td><span class="badge bg-secondary">${groupName}</span></td>
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
        if (copyTrackingLinkBtn) copyTrackingLinkBtn.style.display = 'none';
        currentTrackingKey = null;

        authFetch('/api/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ country, service })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                currentOrderId = data.order_id;
                currentTrackingKey = data.tracking_key;
                
                if (copyTrackingLinkBtn && currentTrackingKey) {
                    copyTrackingLinkBtn.style.display = 'block';
                }
                
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
                if (endActivationBtn) {
                    endActivationBtn.style.display = 'block';
                }
                smsStatusContainer.className = 'sms-status-container glow-pending';

                waitingSpinner.classList.remove('d-none');
                waitingStatusText.textContent = `Waiting for SMS (Expires in ${window.otpExpiryMinutes || 5}:00)...`;

                loadProfile();
                loadHistory();
                startPolling(data.order_id);
            } else {
                showAlert(data.message, 'danger');
                buyNumberBtn.disabled = false;
                buyNumberBtn.innerHTML = '<i class="fa-solid fa-cart-shopping me-2"></i>Buy Number';
            }
        })
        .catch(err => {
            showAlert(err.message, 'danger');
            buyNumberBtn.disabled = false;
            buyNumberBtn.innerHTML = '<i class="fa-solid fa-cart-shopping me-2"></i>Buy Number';
        });
    }

    function handleBulkCountryChange() {
        const bulkCountrySelect = document.getElementById('bulkCountrySelect');
        const bulkServiceSelect = document.getElementById('bulkServiceSelect');
        const bulkPriceDisplay = document.getElementById('bulkPriceDisplay');
        if (!bulkCountrySelect || !bulkServiceSelect) return;

        const selectedGroup = bulkCountrySelect.value;
        bulkServiceSelect.innerHTML = '<option value="" selected disabled>Select Service</option>';
        if (bulkPriceDisplay) bulkPriceDisplay.classList.add('d-none');

        const filtered = availableServices.filter(s => s.group_id === selectedGroup);
        filtered.forEach(service => {
            const opt = document.createElement('option');
            opt.value = service.code;
            opt.textContent = `${service.name} (Stock: ${service.stock}) - ${formatPrice(service.price)}`;
            bulkServiceSelect.appendChild(opt);
        });
    }

    function updateBulkPriceDisplay() {
        const bulkServiceSelect = document.getElementById('bulkServiceSelect');
        const bulkOrderQuantity = document.getElementById('bulkOrderQuantity');
        const bulkPriceDisplay = document.getElementById('bulkPriceDisplay');
        if (!bulkServiceSelect || !bulkOrderQuantity || !bulkPriceDisplay) return;

        const code = bulkServiceSelect.value;
        const qty = parseInt(bulkOrderQuantity.value) || 0;
        const selected = availableServices.find(s => s.code === code);
        if (selected && qty > 0) {
            const total = selected.price * qty * 278.50;
            bulkPriceDisplay.textContent = `Total Amount: Rs ${total.toFixed(2)}`;
            bulkPriceDisplay.classList.remove('d-none');
        } else {
            bulkPriceDisplay.classList.add('d-none');
        }
    }

    function handleCopyBulkOutput() {
        const bulkOutputDisplay = document.getElementById('bulkOutputDisplay');
        const copyBulkOutputBtn = document.getElementById('copyBulkOutputBtn');
        if (!bulkOutputDisplay || !copyBulkOutputBtn) return;

        const text = bulkOutputDisplay.value;
        if (!text) return;

        navigator.clipboard.writeText(text).then(() => {
            const orig = copyBulkOutputBtn.innerHTML;
            copyBulkOutputBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
            copyBulkOutputBtn.className = 'btn btn-success w-100 py-2.5 d-flex align-items-center justify-content-center gap-2';
            setTimeout(() => {
                copyBulkOutputBtn.innerHTML = orig;
                copyBulkOutputBtn.className = 'btn btn-primary w-100 py-2.5 d-flex align-items-center justify-content-center gap-2';
            }, 1500);
        });
    }

    async function handleBuyBulkOrders() {
        const bulkCountrySelect = document.getElementById('bulkCountrySelect');
        const bulkServiceSelect = document.getElementById('bulkServiceSelect');
        const bulkOrderQuantity = document.getElementById('bulkOrderQuantity');
        const buyBulkBtn = document.getElementById('buyBulkBtn');
        const bulkOutputCard = document.getElementById('bulkOutputCard');
        const bulkProgressWrapper = document.getElementById('bulkProgressWrapper');
        const bulkProgressText = document.getElementById('bulkProgressText');
        const bulkProgressPercent = document.getElementById('bulkProgressPercent');
        const bulkProgressBar = document.getElementById('bulkProgressBar');
        const bulkOutputDisplay = document.getElementById('bulkOutputDisplay');
        const copyBulkOutputBtn = document.getElementById('copyBulkOutputBtn');

        if (!bulkCountrySelect || !bulkServiceSelect || !bulkOrderQuantity || !buyBulkBtn) return;

        const country = bulkCountrySelect.value;
        const service = bulkServiceSelect.value;
        const qty = parseInt(bulkOrderQuantity.value);

        if (!country || !service || isNaN(qty) || qty < 1 || qty > 100) {
            showAlert('Please select group, service, and set quantity between 1 and 100.', 'warning');
            return;
        }

        const selected = availableServices.find(s => s.code === service);
        if (!selected) {
            showAlert('Service app is unavailable.', 'danger');
            return;
        }

        const pricePKR = selected.price * 278.50;
        const totalCostPKR = pricePKR * qty;
        const userBalance = parseFloat(lastProfileData ? lastProfileData.balance : 0);

        if (userBalance < totalCostPKR) {
            showAlert('Insufficient balance. Please deposit funds.', 'danger');
            return;
        }

        if (bulkOutputCard) bulkOutputCard.classList.remove('d-none');
        if (bulkProgressWrapper) bulkProgressWrapper.classList.remove('d-none');
        if (bulkOutputDisplay) bulkOutputDisplay.value = '';
        if (copyBulkOutputBtn) copyBulkOutputBtn.disabled = true;

        buyBulkBtn.disabled = true;
        buyBulkBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing...';

        let successfulCount = 0;
        const purchasedOrders = []; // {order_id, number, tracking_key}

        // Phase 1: Purchase one by one via /api/buy (each call saves to Supabase)
        for (let i = 0; i < qty; i++) {
            if (bulkProgressText) bulkProgressText.textContent = `Booking number ${i + 1} of ${qty}...`;
            const pct = Math.round(((i) / qty) * 100);
            if (bulkProgressPercent) bulkProgressPercent.textContent = `${pct}%`;
            if (bulkProgressBar) {
                bulkProgressBar.style.width = `${pct}%`;
                bulkProgressBar.setAttribute('aria-valuenow', pct);
            }

            try {
                const res = await authFetch('/api/buy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ country, service, is_bulk: true })
                });
                const data = await res.json();

                if (data.success) {
                    successfulCount++;
                    let numStr = data.number;
                    if (numStr && !numStr.startsWith('+')) {
                        numStr = '+' + numStr;
                    }
                    purchasedOrders.push({
                        order_id: data.order_id,
                        number: numStr,
                        tracking_key: data.tracking_key || null
                    });

                    // Show number immediately (tracking link resolves later)
                    updateBulkOutput(purchasedOrders, bulkOutputDisplay);
                } else {
                    if (data.error_type === 'LOW_BALANCE') {
                        showAlert('Insufficient balance to continue bulk orders.', 'danger');
                        break;
                    }
                    // Show error inline but continue
                    purchasedOrders.push({
                        order_id: null,
                        number: `[Order ${i + 1} Failed: ${data.message || 'Gateway Error'}]`,
                        tracking_key: null,
                        failed: true
                    });
                    updateBulkOutput(purchasedOrders, bulkOutputDisplay);
                }
            } catch (err) {
                purchasedOrders.push({
                    order_id: null,
                    number: `[Order ${i + 1} Failed: Connection Error]`,
                    tracking_key: null,
                    failed: true
                });
                updateBulkOutput(purchasedOrders, bulkOutputDisplay);
            }

            // Small delay between purchases
            if (i < qty - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        // Phase 1 complete
        const failedCount = qty - successfulCount;
        if (bulkProgressText) bulkProgressText.textContent = `Purchased: ${successfulCount} booked, ${failedCount} failed. Resolving tracking links...`;
        if (bulkProgressPercent) bulkProgressPercent.textContent = '100%';
        if (bulkProgressBar) {
            bulkProgressBar.style.width = '100%';
            bulkProgressBar.setAttribute('aria-valuenow', 100);
        }

        // Phase 2: Poll for tracking keys from Python poller
        const ordersNeedingTracking = purchasedOrders.filter(o => o.order_id && !o.tracking_key && !o.failed);
        if (ordersNeedingTracking.length > 0) {
            await pollBulkTrackingKeys(ordersNeedingTracking, purchasedOrders, bulkOutputDisplay, bulkProgressText);
        }

        // Final state
        if (bulkProgressText) bulkProgressText.textContent = `Completed: ${successfulCount} booked, ${failedCount} failed.`;
        if (bulkProgressBar) bulkProgressBar.classList.remove('progress-bar-animated');

        buyBulkBtn.disabled = false;
        buyBulkBtn.innerHTML = '<i class="fa-solid fa-cart-shopping me-2"></i>Place Bulk Order';

        if (successfulCount > 0 && copyBulkOutputBtn) {
            copyBulkOutputBtn.disabled = false;
        }

        loadProfile();
        loadHistory();
    }

    /**
     * Update the bulk output textarea with current order data.
     */
    function updateBulkOutput(orders, outputDisplay) {
        if (!outputDisplay) return;
        const lines = [];
        orders.forEach(o => {
            if (o.failed) {
                lines.push(o.number); // error message string
            } else {
                const tk = o.tracking_key;
                if (tk) {
                    lines.push(`${o.number}\n${getTrackingUrl(tk)}`);
                    lines.push('');
                } else {
                    lines.push(`${o.number}\nTracking link: resolving...`);
                }
            }
        });
        outputDisplay.value = lines.join('\n\n');
        outputDisplay.scrollTop = outputDisplay.scrollHeight;
    }

    /**
     * Poll for tracking keys assigned by Python poller or database.
     * Checks /api/sms for each order every 2 seconds, up to 5 attempts (10 seconds max).
     */
    async function pollBulkTrackingKeys(pendingOrders, allOrders, outputDisplay, progressText) {
        let retries = 0;
        const maxRetries = 5;

        while (pendingOrders.length > 0 && retries < maxRetries) {
            retries++;
            if (progressText) progressText.textContent = `Resolving tracking links... (attempt ${retries}/${maxRetries}, ${pendingOrders.length} pending)`;

            await new Promise(resolve => setTimeout(resolve, 2000));

            const stillPending = [];
            for (const po of pendingOrders) {
                try {
                    const res = await authFetch(`/api/sms?order_id=${encodeURIComponent(po.order_id)}`);
                    const smsData = await res.json();
                    if (smsData.success && smsData.tracking_key) {
                        po.tracking_key = smsData.tracking_key;
                    } else {
                        stillPending.push(po);
                    }
                } catch (e) {
                    stillPending.push(po);
                }
            }

            // Update output with any newly resolved tracking keys
            updateBulkOutput(allOrders, outputDisplay);

            pendingOrders.length = 0;
            if (stillPending.length > 0) {
                pendingOrders.push(...stillPending);
            }
        }

        // Fallback for any orders that could not resolve a tracking key from backend
        if (pendingOrders.length > 0) {
            pendingOrders.forEach(po => {
                if (!po.tracking_key && po.order_id) {
                    po.tracking_key = po.order_id;
                }
            });
            updateBulkOutput(allOrders, outputDisplay);
        }
    }

    function startPolling(orderId, startSeconds) {
        stopIntervals();
        lastSmsCount = startSeconds !== undefined ? -1 : 0; // -1 for restored orders, 0 for new orders
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
                const prefix = (orderStatusBadge && orderStatusBadge.textContent === 'Done') 
                    ? 'SMS received! Checking for subsequent messages' 
                    : 'Waiting for SMS';
                waitingStatusText.textContent = `${prefix} (Expires in ${min}:${sec < 10 ? '0' : ''}${sec})...`;
            }
        }, 1000);
    }

    function pollSmsStatus(orderId) {
        authFetch(`/api/sms?order_id=${encodeURIComponent(orderId)}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    if (data.tracking_key) {
                        currentTrackingKey = data.tracking_key;
                        if (copyTrackingLinkBtn) copyTrackingLinkBtn.style.display = 'block';
                    }

                    const msgCount = (data.sms_messages && Array.isArray(data.sms_messages)) ? data.sms_messages.length : 0;
                    if (lastSmsCount === -1) {
                        lastSmsCount = msgCount;
                    } else if (msgCount > lastSmsCount) {
                        playChimeNotification();
                        lastSmsCount = msgCount;
                    }

                    if (msgCount > 0) {
                        setOtpDisplayValue(data.sms_messages, true);
                        copyOtpBtn.disabled = false;
                        
                        const min = Math.floor(countdownSeconds / 60);
                        const sec = countdownSeconds % 60;
                        waitingStatusText.textContent = `SMS received! Checking for subsequent messages (Expires in ${min}:${sec < 10 ? '0' : ''}${sec})...`;
                        
                        loadHistory();
                    }

                    if (data.status === 'COMPLETED') {
                        // DO NOT STOP INTERVALS! Keep polling so subsequent SMS are fetched.
                        orderStatusBadge.textContent = 'Done';
                        orderStatusBadge.className = 'badge-custom badge-completed';
                        
                        smsStatusContainer.className = 'sms-status-container glow-success';
                        waitingSpinner.classList.remove('d-none'); // Keep spinner spinning
                        
                        if (endActivationBtn) {
                            endActivationBtn.style.display = 'block'; // Keep stop button visible
                        }
                        
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
        if (endActivationBtn) {
            endActivationBtn.style.display = 'none';
        }
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
        const hasEnded = sessionStorage.getItem('ended_order_' + latestOrder.order_id) === 'true';

        if (latestOrder && (latestOrder.status === 'PENDING' || latestOrder.status === 'COMPLETED') && !hasEnded) {
            const elapsedMs = Date.now() - new Date(latestOrder.created_at).getTime();
            const expiryMs = (window.otpExpiryMinutes || 4) * 60 * 1000;
            if (elapsedMs < expiryMs) {
                currentOrderId = latestOrder.order_id;
                currentTrackingKey = latestOrder.tracking_key;
                
                let formattedNumber = latestOrder.number;
                if (formattedNumber && !formattedNumber.startsWith('+')) {
                    formattedNumber = '+' + formattedNumber;
                }
                numberDisplay.textContent = formattedNumber;
                numberDisplay.style.cursor = 'pointer';
                
                orderIdDisplay.textContent = latestOrder.order_id;
                
                if (latestOrder.status === 'COMPLETED') {
                    orderStatusBadge.textContent = 'Done';
                    orderStatusBadge.className = 'badge-custom badge-completed';
                    smsStatusContainer.className = 'sms-status-container glow-success';
                } else {
                    orderStatusBadge.textContent = 'Not Received';
                    orderStatusBadge.className = 'badge-custom badge-pending';
                    smsStatusContainer.className = 'sms-status-container glow-pending';
                }

                // Re-compile legacy columns or sms_messages JSONB to restore most recent message
                const restoredMsgs = [];
                for (let i = 1; i <= 10; i++) {
                    const msgVal = latestOrder[`message_${i}`];
                    if (msgVal) restoredMsgs.push(msgVal);
                }
                if (restoredMsgs.length === 0 && Array.isArray(latestOrder.sms_messages)) {
                    restoredMsgs.push(...latestOrder.sms_messages.map(m => m.text));
                }

                if (restoredMsgs.length > 0) {
                    setOtpDisplayValue(restoredMsgs, true);
                    copyOtpBtn.disabled = false;
                } else {
                    setOtpDisplayValue('------');
                    copyOtpBtn.disabled = true;
                }

                if (copyTrackingLinkBtn && currentTrackingKey) {
                    copyTrackingLinkBtn.style.display = 'block';
                }

                if (endActivationBtn) {
                    endActivationBtn.style.display = 'block';
                }

                waitingSpinner.classList.remove('d-none');
                
                const remainingSeconds = Math.floor((expiryMs - elapsedMs) / 1000);
                startPolling(latestOrder.order_id, remainingSeconds);
            }
        }
    }

    function handleCopyOtp() {
        const text = currentLatestOtp || otpCodeDisplay.textContent.trim();
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
        
         if (endActivationBtn) {
             endActivationBtn.disabled = true;
             endActivationBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Ending...';
         }
 
         authFetch('/api/buy/end', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ order_id: currentOrderId })
         })
         .then(res => res.json())
         .then(data => {
             if (data.success) {
                 stopIntervals();
                 sessionStorage.setItem('ended_order_' + currentOrderId, 'true');
                 
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
 
                 if (endActivationBtn) {
                     endActivationBtn.style.display = 'none';
                 }
 
                 showAlert('Activation successfully finalized.', 'success');
                 loadProfile();
                 loadHistory();
             } else {
                 showAlert(data.message, 'danger');
             }
             if (endActivationBtn) {
                 endActivationBtn.disabled = false;
                 endActivationBtn.innerHTML = '<i class="fa-solid fa-circle-stop me-2"></i>End Activation';
             }
         })
         .catch(err => {
             showAlert(err.message, 'danger');
             if (endActivationBtn) {
                 endActivationBtn.disabled = false;
                 endActivationBtn.innerHTML = '<i class="fa-solid fa-circle-stop me-2"></i>End Activation';
             }
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
                    
                    const searchInput = document.getElementById('historySearchInput');
                    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
                    if (query) {
                        const filtered = lastHistoryData.filter(o => {
                            const orderId = String(o.order_id || '').toLowerCase();
                            const service = String(o.service || '').toLowerCase();
                            const number = String(o.number || '').toLowerCase();
                            const statusText = String(o.status || '').toLowerCase();
                            const trackingKey = String(o.tracking_key || '').toLowerCase();
                            const otp = String(o.otp || '').toLowerCase();
                            
                            return orderId.includes(query) || 
                                   service.includes(query) || 
                                   number.includes(query) || 
                                   statusText.includes(query) || 
                                   trackingKey.includes(query) ||
                                   otp.includes(query);
                        });
                        renderHistoryTable(filtered);
                    } else {
                        renderHistoryTable();
                    }
                    restoreActiveOrderIfAny();
                }
            });
    }

    function renderHistoryTable(dataToRender = lastHistoryData) {
        orderHistoryTableBody.innerHTML = '';
        if (dataToRender.length === 0) {
            orderHistoryTableBody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No orders found.</td></tr>`;
            return;
        }
        dataToRender.forEach(o => {
            const tr = document.createElement('tr');
            
            // Messages count cell logic
            let msgCount = 0;
            for (let i = 1; i <= 10; i++) {
                if (o[`message_${i}`]) {
                    msgCount++;
                }
            }
            if (o.sms_messages && Array.isArray(o.sms_messages) && o.sms_messages.length > msgCount) {
                msgCount = o.sms_messages.length;
            }
            if (msgCount === 0 && o.otp && o.otp !== '------' && o.otp !== 'Not Received' && o.otp !== 'Waiting...') {
                msgCount = 1;
            }
            const msgCountMarkup = `<span class="fw-semibold badge ${msgCount > 0 ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-secondary-subtle text-secondary border'}" style="font-size: 0.82rem; padding: 4px 10px; border-radius: 6px;">${msgCount}</span>`;

            // Determine dynamic status: if any message received, status is COMPLETED ("Done")
            let currentStatus = o.status;
            if (msgCount > 0 && currentStatus !== 'REFUNDED') {
                currentStatus = 'COMPLETED';
            }

            const sc = currentStatus === 'COMPLETED' ? 'badge-completed' : (currentStatus === 'PENDING' ? 'badge-pending' : (currentStatus === 'REFUNDED' ? 'badge-expired' : 'badge-expired'));
            let statusText = currentStatus;
            if (currentStatus === 'PENDING') statusText = 'Pending';
            else if (currentStatus === 'COMPLETED') statusText = 'Done';
            else if (currentStatus === 'REFUNDED') statusText = 'Refunded';
            else if (currentStatus === 'EXPIRED') statusText = 'Expired';

            // Message cell logic
            const hasMsg = o.full_message && o.full_message.trim().length > 0;
            const messageMarkup = hasMsg
                ? `<button class="btn btn-sm btn-success px-3 py-1 btn-view-msg" data-order-id="${o.order_id}" data-number="${o.number}" data-msg="${encodeURIComponent(o.full_message)}"><i class="fa-solid fa-circle-check me-1"></i>Received</button>`
                : `<button class="btn btn-sm btn-secondary opacity-75 px-3 py-1" disabled><i class="fa-regular fa-circle-question me-1"></i>Not Received</button>`;

            // Action cell logic
            const actionMarkup = currentStatus === 'PENDING'
                ? `<button class="btn btn-sm btn-primary px-3 py-1 btn-fetch-otp" data-order-id="${o.order_id}"><i class="fa-solid fa-rotate-right me-1"></i>Fetch OTP</button>`
                : `<button class="btn btn-sm btn-primary px-3 py-1 btn-history-fetch" data-order-id="${o.order_id}" data-number="${o.number}"><i class="fa-solid fa-envelope me-1"></i>Fetch</button>`;

            const bulkBadge = o.is_bulk ? `<span class="badge bg-secondary-subtle text-secondary border ms-1" style="font-size: 0.65rem; padding: 2px 4px;">Bulk</span>` : '';
            const trackingLink = getTrackingUrl(o.tracking_key);
            const copyLinkMarkup = o.tracking_key 
                ? `<button class="btn btn-sm btn-copy-link border-0" data-link="${trackingLink}" title="Copy tracking link" style="background-color: var(--primary-light); color: var(--primary); font-size: 0.72rem; padding: 2px 8px; border-radius: 6px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; margin-left: 6px; vertical-align: middle; cursor: pointer; text-decoration: none;"><i class="fa-solid fa-link"></i>Copy Link</button>`
                : '';

            tr.innerHTML = `
                <td><div class="d-flex align-items-center justify-content-end justify-content-lg-start gap-1 flex-wrap"><code class="font-monospace text-secondary me-1" style="font-size: 0.8rem; word-break: break-all;">${o.order_id}</code>${copyLinkMarkup}</div></td>
                <td>${o.service}${bulkBadge}</td>
                <td><strong>${o.number}</strong></td>
                <td>${formatPrice(parseFloat(o.price) / 278.50)}</td>
                <td>${msgCountMarkup}</td>
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
                    
                    const noticeBox = document.getElementById('depositNoticeBox');
                    const noticeContent = document.getElementById('depositNoticeContent');
                    if (noticeBox && noticeContent) {
                        if (data.depositNotice && data.depositNotice.trim() !== '') {
                            noticeContent.textContent = data.depositNotice;
                            noticeBox.classList.remove('d-none');
                        } else {
                            noticeBox.classList.add('d-none');
                        }
                    }
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
            
            const depCurrency = d.currency || 'PKR';
            let amt = parseFloat(d.amount);
            if (depCurrency !== 'PKR') {
                const rate = exchangeRates[depCurrency]?.rate || 1.0;
                amt = amt * (278.50 / rate);
            }
            const formattedAmount = `Rs ${amt.toFixed(2)}`;

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

            const showTxId = d.tx_id && d.tx_id.startsWith('NP-') ? 'Not Provided' : d.tx_id;
            tr.innerHTML = `
                <td><code>${showTxId}</code></td>
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
        const method = depositMethod.value || 'Direct Transfer';
        const amount = parseFloat(depositAmount.value);
        const tx_id = depositTxId.value.trim();
        const screenshot_url = depositScreenshot.value.trim();
        const currency = currencySelector.value || 'PKR';
        const file = depositProofFile ? depositProofFile.files[0] : null;

        // Clear any previous error highlights
        depositAmount.style.border = '';
        if (depositProofFile) depositProofFile.style.border = '';

        // Validate Amount (REQUIRED)
        if (!depositAmount.value || isNaN(amount) || amount <= 0) {
            depositAmount.style.border = '2px solid #dc3545';
            depositAmount.focus();
            showAlert('Please enter the deposit amount.', 'warning');
            return;
        }

        // Validate Screenshot (REQUIRED)
        if (!file) {
            if (depositProofFile) depositProofFile.style.border = '2px solid #dc3545';
            showAlert('Please attach payment proof screenshot.', 'warning');
            return;
        }

        const pkrRate = exchangeRates['PKR'].rate;
        const selectedRate = exchangeRates[currency].rate;
        const symbol = exchangeRates[currency].symbol;
        const minDepositVal = 50.0 * (selectedRate / pkrRate);

        if (amount < minDepositVal) {
            depositAmount.style.border = '2px solid #dc3545';
            depositAmount.focus();
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
