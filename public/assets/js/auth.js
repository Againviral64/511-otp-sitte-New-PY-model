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
