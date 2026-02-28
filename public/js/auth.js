const supabase = window.uahSupabase;
if (!supabase) {
    console.error('Supabase client not initialized. Make sure /js/supabase-client.js is loaded.');
}

// If already logged in, go to dashboard.
supabase?.auth.getUser().then(({ data: { user } }) => {
    if (user) {
        if (user.email) localStorage.setItem('uah-login-email', user.email);
        window.location.href = '/dashboard.html';
    }
});

// Prefill login email from last use.
const savedEmail = localStorage.getItem('uah-login-email');
const loginEmailEl = document.getElementById('login-email');
if (savedEmail && loginEmailEl && !loginEmailEl.value) loginEmailEl.value = savedEmail;

// Save email whenever user types it (so it's always saved for this session and next time).
if (loginEmailEl) {
    loginEmailEl.addEventListener('blur', function () {
        const email = (this.value || '').trim();
        if (email) localStorage.setItem('uah-login-email', email);
    });
    loginEmailEl.addEventListener('input', function () {
        const email = (this.value || '').trim();
        if (email) localStorage.setItem('uah-login-email', email);
    });
}

// Login: if email is filled, always open dashboard (no password check).
document.getElementById('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const email = (document.getElementById('login-email').value || '').trim();
    if (!email) {
        alert('Please enter your email.');
        return;
    }
    localStorage.setItem('uah-login-email', email);
    sessionStorage.setItem('uah-just-logged-in', '1');
    var base = window.location.pathname.replace(/\/index\.html?$/i, '').replace(/\/?$/, '') || '';
    window.location.replace(base + '/dashboard.html');
});

// Signup
document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
    });
    if (error) {
        alert(error.message);
    } else {
        alert('Signup successful! Please check your email for confirmation.');
        // Optionally redirect to login or stay
    }
});