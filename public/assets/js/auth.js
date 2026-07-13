// public/assets/js/auth.js
// 0. Extract and store OAuth tokens from URL hash immediately on script load to avoid race conditions
if (window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    if (accessToken) {
        localStorage.setItem('nova_session_token', accessToken);
        window.history.replaceState(null, null, window.location.pathname);
    }
}

// Global fetch request interceptor to handle session expiration/invalid token redirects
const originalFetch = window.fetch;
window.fetch = async function (...args) {
    try {
        const response = await originalFetch(...args);
        
        if (response.status === 401) {
            handleSessionExpired();
        } else {
            const clone = response.clone();
            try {
                const json = await clone.json();
                if (json && json.success === false && (
                    json.message === 'Invalid token session.' || 
                    json.message === 'Invalid authorization token.' || 
                    json.message === 'Login expired'
                )) {
                    handleSessionExpired();
                }
            } catch (e) {
                // Ignore parsing/non-JSON errors
            }
        }
        return response;
    } catch (err) {
        throw err;
    }
};

let isRedirecting = false;
function handleSessionExpired() {
    if (isRedirecting) return;
    isRedirecting = true;

    localStorage.removeItem('nova_session_token');
    localStorage.removeItem('nova_user_email');

    // Create elegant red alert banner at the top of the body
    const alertEl = document.createElement('div');
    alertEl.style.position = 'fixed';
    alertEl.style.top = '24px';
    alertEl.style.left = '50%';
    alertEl.style.transform = 'translateX(-50%)';
    alertEl.style.zIndex = '999999';
    alertEl.style.backgroundColor = '#ef4444';
    alertEl.style.color = '#ffffff';
    alertEl.style.padding = '14px 24px';
    alertEl.style.borderRadius = '10px';
    alertEl.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.15)';
    alertEl.style.fontWeight = '600';
    alertEl.style.fontSize = '0.95rem';
    alertEl.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    alertEl.style.textAlign = 'center';
    alertEl.style.display = 'flex';
    alertEl.style.alignItems = 'center';
    alertEl.style.gap = '8px';
    alertEl.innerHTML = '<i class="fa-solid fa-circle-exclamation fs-5"></i><span>Login expired. Redirecting to login page...</span>';
    
    document.body.appendChild(alertEl);

    setTimeout(() => {
        const path = window.location.pathname;
        if (path.includes('/admin')) {
            window.location.href = '/admin-login';
        } else {
            window.location.href = '/login';
        }
    }, 2000);
}


document.addEventListener('DOMContentLoaded', () => {
    const sessionToken = localStorage.getItem('nova_session_token');
    const userEmail = localStorage.getItem('nova_user_email');
    
    const path = window.location.pathname;
    const isLoginPage = path.endsWith('/login') || path.endsWith('/signup');
    const isAdminPage = path.endsWith('/admin');
    const isDashboardPage = path.endsWith('/dashboard');

    // 1. Redirect if token is missing
    if (!sessionToken) {
        if (isDashboardPage || isAdminPage) {
            window.location.href = '/login';
            return;
        }
    } else {
        // Asynchronously check user profile status from database
        fetch('/api/user/profile', {
            headers: { 'Authorization': 'Bearer ' + sessionToken }
        })
        .then(res => res.json())
        .then(data => {
            if (data.success && data.profile) {
                if (data.profile.email) {
                    localStorage.setItem('nova_user_email', data.profile.email);
                }
                const isAdmin = data.profile.is_admin || (data.profile.role && data.profile.role.toLowerCase() === 'admin');
                if (isAdmin) {
                    // Admins belong in /admin
                    if (isLoginPage || isDashboardPage) {
                        window.location.href = '/admin';
                    }
                } else {
                    // Regular users belong in /dashboard
                    if (isLoginPage || isAdminPage) {
                        window.location.href = '/dashboard';
                    }
                }
            } else {
                // Invalid token session: clear localstorage and redirect
                localStorage.removeItem('nova_session_token');
                localStorage.removeItem('nova_user_email');
                if (isDashboardPage || isAdminPage) {
                    window.location.href = '/login';
                }
            }
        })
        .catch(() => {
            // Network error: Fallback redirection on login page
            if (isLoginPage) {
                window.location.href = '/dashboard';
            }
        });
    }

    // 2. Setup logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('nova_session_token');
            localStorage.removeItem('nova_user_email');
            window.location.href = '/login';
        });
    }
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    if (mobileLogoutBtn) {
        mobileLogoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('nova_session_token');
            localStorage.removeItem('nova_user_email');
            window.location.href = '/login';
        });
    }
    const mobileHeaderLogoutBtn = document.getElementById('mobileHeaderLogoutBtn');
    if (mobileHeaderLogoutBtn) {
        mobileHeaderLogoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('nova_session_token');
            localStorage.removeItem('nova_user_email');
            window.location.href = '/login';
        });
    }

    // 3. Render email identifier
    const userEmailBadge = document.getElementById('userEmailBadge');
    if (userEmailBadge && userEmail) {
        userEmailBadge.innerHTML = `<i class="fa-solid fa-user me-2 text-primary"></i>${userEmail}`;
    }
});
