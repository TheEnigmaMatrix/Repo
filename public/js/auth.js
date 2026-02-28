function goToDashboard() {
    sessionStorage.setItem('uah-just-logged-in', '1');
    var path = (window.location.pathname || '').replace(/\/index\.html?$/i, '').replace(/\/?$/, '') || '';
    var dashboardPath = (path ? path + '/' : '/') + 'dashboard.html';
    window.location.replace(dashboardPath);
}

// If we already have an email saved, go straight to dashboard (optional: uncomment to auto-redirect returning users)
// var saved = localStorage.getItem('uah-login-email');
// if (saved && saved.trim()) { goToDashboard(); return; }

// Prefill email from last use
var loginEmailEl = document.getElementById('login-email');
var savedEmail = localStorage.getItem('uah-login-email');
if (savedEmail && loginEmailEl) loginEmailEl.value = savedEmail;

// Login: save email, open dashboard
var loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = (document.getElementById('login-email').value || '').trim();
        if (!email) return;
        localStorage.setItem('uah-login-email', email);
        goToDashboard();
    });
}
