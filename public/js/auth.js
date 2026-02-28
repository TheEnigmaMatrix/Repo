<<<<<<< Updated upstream
// Initialize Supabase client
const SUPABASE_URL = 'https://zvcqzevzxnqllumwqpxs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2Y3F6ZXZ6eG5xbGx1bXdxcHhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTY2MTgsImV4cCI6MjA4Nzc5MjYxOH0.Z3d98gsqhid1pC6hnaMPpnPpNmcR0D2GC-2xUusXuBs';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        alert(error.message);
    } else {
        window.location.href = '/dashboard.html';
=======
(function () {
    function getSupabase() {
        return window.uahSupabase || null;
>>>>>>> Stashed changes
    }

<<<<<<< Updated upstream
// Signup
document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
=======
    function showMessage(msg, isError) {
        if (typeof alert === 'function') {
            alert(msg);
        } else {
            var el = document.getElementById('auth-message');
            if (el) {
                el.textContent = msg;
                el.style.color = isError ? '#c53030' : '#276749';
                el.style.display = 'block';
            }
        }
    }

    function setButtonLoading(btn, loading) {
        if (!btn) return;
        btn.disabled = loading;
        btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
        btn.textContent = loading ? 'Please wait…' : (btn.dataset.originalText || 'Submit');
    }
>>>>>>> Stashed changes

    function init() {
        var supabase = getSupabase();
        if (!supabase) {
            showMessage('Auth not ready. Refresh the page or check your connection.', true);
            return;
        }

        // If already logged in, go to dashboard.
        supabase.auth.getUser().then(function (result) {
            var user = result && result.data && result.data.user;
            if (user) {
                if (user.email) localStorage.setItem('uah-login-email', user.email);
                window.location.href = '/dashboard.html';
            }
        }).catch(function () { /* ignore */ });

        // Prefill login email from last use.
        var savedEmail = localStorage.getItem('uah-login-email');
        var loginEmailEl = document.getElementById('login-email');
        if (savedEmail && loginEmailEl && !loginEmailEl.value) loginEmailEl.value = savedEmail;

        if (loginEmailEl) {
            loginEmailEl.addEventListener('blur', function () {
                var email = (this.value || '').trim();
                if (email) localStorage.setItem('uah-login-email', email);
            });
            loginEmailEl.addEventListener('input', function () {
                var email = (this.value || '').trim();
                if (email) localStorage.setItem('uah-login-email', email);
            });
        }

        // Login
        var loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async function (e) {
                e.preventDefault();
                var supabase = getSupabase();
                if (!supabase) {
                    showMessage('Auth not ready. Please refresh the page.', true);
                    return;
                }
                var email = (document.getElementById('login-email').value || '').trim();
                var password = document.getElementById('login-password').value;
                if (!email) {
                    showMessage('Please enter your IITJ email.', true);
                    return;
                }
                if (!password) {
                    showMessage('Please enter your password.', true);
                    return;
                }
                var btn = loginForm.querySelector('button[type="submit"]');
                setButtonLoading(btn, true);
                localStorage.setItem('uah-login-email', email);
                try {
                    var result = await supabase.auth.signInWithPassword({ email: email, password: password });
                    var data = result.data, error = result.error;
                    if (error) {
                        if (error.message && (error.message.indexOf('Invalid') !== -1 || error.message.indexOf('credentials') !== -1)) {
                            showMessage('Invalid email or password. If you don\'t have an account, please Sign Up first.', true);
                        } else {
                            showMessage(error.message || 'Login failed', true);
                        }
                        setButtonLoading(btn, false);
                        return;
                    }
                    if (data && data.user && data.user.email) localStorage.setItem('uah-login-email', data.user.email);
                    sessionStorage.setItem('uah-just-logged-in', '1');
                    window.location.replace('/dashboard.html');
                } catch (err) {
                    console.error(err);
                    showMessage('Login failed: ' + (err && err.message ? err.message : 'Please try again.'), true);
                    setButtonLoading(btn, false);
                }
            });
        }

        // Sign Up
        var signupForm = document.getElementById('signup-form');
        if (signupForm) {
            signupForm.addEventListener('submit', async function (e) {
                e.preventDefault();
                var supabase = getSupabase();
                if (!supabase) {
                    showMessage('Auth not ready. Please refresh the page.', true);
                    return;
                }
                var fullName = (document.getElementById('signup-name').value || '').trim();
                var email = (document.getElementById('signup-email').value || '').trim();
                var password = document.getElementById('signup-password').value;

                if (!email || !password) {
                    showMessage('Please enter email and password.', true);
                    return;
                }
                var btn = signupForm.querySelector('button[type="submit"]');
                setButtonLoading(btn, true);
                localStorage.setItem('uah-login-email', email);
                try {
                    var result = await supabase.auth.signUp({
                        email: email,
                        password: password,
                        options: { data: { full_name: fullName } }
                    });
                    var data = result.data, error = result.error;
                    if (error) {
                        showMessage(error.message || 'Sign up failed', true);
                        setButtonLoading(btn, false);
                        return;
                    }
                    if (data && data.user && (data.user.confirmed_at || data.session)) {
                        sessionStorage.setItem('uah-just-logged-in', '1');
                        window.location.replace('/dashboard.html');
                    } else {
                        showMessage('Sign up successful! You can now log in with your email and password.');
                        setButtonLoading(btn, false);
                    }
                } catch (err) {
                    console.error(err);
                    showMessage('Sign up failed: ' + (err && err.message ? err.message : 'Please try again.'), true);
                    setButtonLoading(btn, false);
                }
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
<<<<<<< Updated upstream
        alert('Check your email for confirmation!');
=======
        init();
>>>>>>> Stashed changes
    }
})();