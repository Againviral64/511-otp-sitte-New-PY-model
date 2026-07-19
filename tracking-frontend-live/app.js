// Live Render/Railway Backend API URL Configuration
let API_BASE_URL = window.location.origin.includes('localhost') 
    ? 'http://localhost:8000' 
    : 'https://511-otp-backend-fetching-production.up.railway.app';

// Allow overriding via query parameter ?backend=... or ?refresh=... (in milliseconds)
const urlParams = new URLSearchParams(window.location.search);
const queryBackend = urlParams.get('backend');
if (queryBackend) {
    API_BASE_URL = queryBackend;
}

let refreshInterval = 1500;
const queryRefresh = urlParams.get('refresh');
if (queryRefresh) {
    refreshInterval = parseInt(queryRefresh, 10);
}

const pathKey = window.location.pathname.substring(1);
let autoRefreshInterval = null;
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

async function initConfig() {
    try {
        const response = await fetch('/api/track-backend-url');
        if (response.ok) {
            const data = await response.json();
            if (data && data.url) {
                API_BASE_URL = data.url;
            }
        }
    } catch (err) {
        console.warn('Failed to fetch dynamic backend URL, using default fallback:', err);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!pathKey || pathKey.length < 5) {
        showError('Invalid tracking key. Please check your URL.');
        return;
    }
    

    
    // Dynamically resolve the backend API URL
    await initConfig();
    
    // Initial fetch
    fetchTrackingData();
    
    // Auto-refresh for live messages checking
    autoRefreshInterval = setInterval(fetchTrackingData, refreshInterval);
});

async function fetchTrackingData() {
    const spinIcon = document.getElementById('spin-icon');
    if (spinIcon) spinIcon.classList.add('active');

    try {
        const response = await fetch(`${API_BASE_URL}/api/track/${pathKey}`);
        if (!response.ok) {
            if (response.status === 404) {
                showError('This tracking key was not found or has expired.');
            } else {
                showError(`Server error (${response.status}). Please try again later.`);
            }
            stopAutoRefresh();
            return;
        }

        const data = await response.json();
        if (data.success) {
            renderTracker(data);
        } else {
            showError('Failed to fetch tracking data.');
            stopAutoRefresh();
        }
    } catch (err) {
        console.error('Fetch error:', err);
        // Don't show critical UI error on transient network errors, just log and keep trying
    } finally {
        if (spinIcon) {
            setTimeout(() => {
                spinIcon.classList.remove('active');
            }, 500);
        }
    }
}

function renderTracker(data) {
    document.getElementById('tracker-card').style.display = 'block';
    document.getElementById('error-card').style.display = 'none';

    // Update status badge
    const badge = document.getElementById('status-badge');
    badge.className = 'status-badge ' + data.status.toLowerCase();
    badge.textContent = data.status;

    // Keep auto-refresh running so messages keep updating in real-time

    // Number
    const numDisplay = document.getElementById('number-display');
    if (numDisplay) {
        numDisplay.textContent = data.number || '--';
        numDisplay.style.cursor = 'pointer';
        numDisplay.title = 'Click to copy phone number';
        numDisplay.onclick = () => {
            const rawNum = numDisplay.textContent.trim();
            if (rawNum && rawNum !== '--') {
                navigator.clipboard.writeText(rawNum).then(() => {
                    showToast('Phone number copied!');
                }).catch(err => {
                    console.error('Failed to copy phone number:', err);
                });
            }
        };
    }
    
    // Metadata - only show started at time
    if (data.created_at) {
        const date = new Date(data.created_at);
        document.getElementById('started-at').textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    // Render SMS history list
    const msgList = document.getElementById('messages-list');
    msgList.innerHTML = '';

    const messages = data.sms_messages || [];
    const msgCount = messages.length;
    if (lastSmsCount === -1) {
        lastSmsCount = msgCount;
    } else if (msgCount > lastSmsCount) {
        playChimeNotification();
        lastSmsCount = msgCount;
    }

    if (messages.length === 0) {
        msgList.innerHTML = `
            <div class="no-messages">
                <p>Waiting for SMS messages...</p>
                <p style="font-size: 0.8rem; margin-top: 5px;">This page will auto-update when code arrives.</p>
            </div>
        `;
    } else {
        // Sort latest messages first
        const sortedMsgs = [...messages].reverse();
        sortedMsgs.forEach((msg, idx) => {
            const messageNum = messages.length - idx; // e.g. Message #3, Message #2, Message #1
            const timeStr = msg.time ? new Date(msg.time).toLocaleTimeString() : 'Recent';
            const msgText = typeof msg === 'object' ? msg.text : msg;
            
            // Extract OTP or copy full message
            const otpMatch = msgText ? msgText.match(/\b\d{4,8}\b/) : null;
            const otpText = otpMatch ? otpMatch[0] : msgText;

            const isLatest = idx === 0;

            const item = document.createElement('div');
            item.className = 'sms-item';
            
            // Custom styling for newest message card vs older cards
            if (isLatest) {
                item.style.borderColor = 'var(--accent-color)';
                item.style.background = 'rgba(16, 185, 129, 0.04)';
                item.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.06)';
            } else {
                item.style.borderColor = 'var(--border-color)';
                item.style.background = 'rgba(255, 255, 255, 0.02)';
            }
            item.style.border = '1px solid';
            item.style.borderRadius = '10px';
            item.style.padding = '14px';
            item.style.marginBottom = '12px';
            item.style.display = 'flex';
            item.style.flexDirection = 'column';

            // Header row inside card
            const header = document.createElement('div');
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.alignItems = 'center';
            header.style.marginBottom = '10px';
            header.style.paddingBottom = '8px';
            header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';

            // Left side text labels
            const labelContainer = document.createElement('div');
            labelContainer.style.display = 'flex';
            labelContainer.style.flexDirection = 'column';

            const label = document.createElement('span');
            label.style.fontWeight = '700';
            label.style.fontSize = '0.75rem';
            label.style.textTransform = 'uppercase';
            label.style.letterSpacing = '0.5px';
            if (isLatest) {
                label.style.color = 'var(--accent-color)';
                label.textContent = `Message #${messageNum} (Latest)`;
            } else {
                label.style.color = 'var(--text-secondary)';
                label.textContent = `Message #${messageNum}`;
            }
            labelContainer.appendChild(label);

            const timeLabel = document.createElement('span');
            timeLabel.style.fontSize = '0.65rem';
            timeLabel.style.color = 'var(--text-secondary)';
            timeLabel.style.marginTop = '2px';
            timeLabel.textContent = timeStr;
            labelContainer.appendChild(timeLabel);

            header.appendChild(labelContainer);

            // Copy button on the right of the header
            const copyBtn = document.createElement('button');
            copyBtn.style.padding = '4px 10px';
            copyBtn.style.fontSize = '0.7rem';
            copyBtn.style.borderRadius = '4px';
            copyBtn.style.fontWeight = '600';
            copyBtn.style.background = isLatest ? 'var(--accent-color)' : 'var(--primary-color)';
            copyBtn.style.color = '#fff';
            copyBtn.style.border = 'none';
            copyBtn.style.cursor = 'pointer';
            copyBtn.innerHTML = 'Copy';

            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(otpText).then(() => {
                    const origText = copyBtn.innerHTML;
                    copyBtn.innerHTML = 'Copied!';
                    const origBg = copyBtn.style.background;
                    copyBtn.style.background = '#059669'; // darker green accent for Copied state
                    setTimeout(() => {
                        copyBtn.innerHTML = origText;
                        copyBtn.style.background = origBg;
                    }, 1500);
                });
            });
            header.appendChild(copyBtn);
            item.appendChild(header);

            // Message text element
            const content = document.createElement('p');
            content.className = 'sms-item-text';
            content.style.margin = '0';
            content.style.fontSize = '0.85rem';
            content.style.fontFamily = 'monospace';
            content.style.lineHeight = '1.4';
            content.style.color = 'var(--text-primary)';
            content.textContent = msgText;
            item.appendChild(content);

            msgList.appendChild(item);
        });
    }
}

function showError(msg) {
    document.getElementById('tracker-card').style.display = 'none';
    const errCard = document.getElementById('error-card');
    errCard.style.display = 'block';
    document.getElementById('error-text').textContent = msg;
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
    const statusBar = document.getElementById('loading-status-bar');
    if (statusBar) {
        statusBar.style.display = 'none';
    }
}

function copyOTP() {
    const code = document.getElementById('otp-code').textContent;
    if (!code || code === '------') return;
    
    navigator.clipboard.writeText(code).then(() => {
        showToast('OTP copied to clipboard!');
    }).catch(err => {
        console.error('Clipboard copy failed:', err);
    });
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


