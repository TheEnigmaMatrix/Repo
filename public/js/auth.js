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
    }
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
        alert('Check your email for confirmation!');
    }
});