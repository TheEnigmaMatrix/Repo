// Supabase initialization (replace with your actual project URL and anon key)
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
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
    const adminKey = document.getElementById('signup-admin-key').value;

    // Prepare metadata
    const metadata = { full_name: fullName };
    if (adminKey) {
        metadata.admin_key = adminKey; // will be checked by the database trigger
    }

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: metadata }
    });
    if (error) {
        alert(error.message);
    } else {
        alert('Signup successful! Please check your email for confirmation.');
        // Optionally redirect to login or stay
    }
});