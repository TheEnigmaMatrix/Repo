const SUPABASE_URL = 'https://zvcqzevzxnqllumwqpxs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2Y3F6ZXZ6eG5xbGx1bXdxcHhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTY2MTgsImV4cCI6MjA4Nzc5MjYxOH0.Z3d98gsqhid1pC6hnaMPpnPpNmcR0D2GC-2xUusXuBs';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Logout
document.getElementById('logout').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
});

// Helper to get auth token
async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
}

// Current user and role
let currentUser = null;
let isAdminUser = false;

// Check login and admin status
supabase.auth.getUser().then(async ({ data: { user } }) => {
    if (!user) {
        window.location.href = '/';
        return;
    }
    currentUser = user;

    // Fetch profile to check role
    const token = await getToken();
    const res = await fetch('/api/user/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
        const profile = await res.json();
        isAdminUser = profile.role === 'admin';
        if (isAdminUser) {
            document.getElementById('adminFormContainer').style.display = 'block';
        }
    }
});

// We need a /api/user/profile endpoint. Add to server.js if not present.
// But for simplicity, we can also fetch from profiles table directly using supabase client.
// Let's do that with supabase client (safer because we already have session).
// We'll replace the fetch with supabase query.

supabase.auth.getUser().then(async ({ data: { user } }) => {
    if (!user) {
        window.location.href = '/';
        return;
    }
    currentUser = user;
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    if (profile) {
        isAdminUser = profile.role === 'admin';
        if (isAdminUser) {
            document.getElementById('adminFormContainer').style.display = 'block';
        }
    }
});

// Handle admin form submission
document.getElementById('notificationForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdminUser) {
        alert('You are not authorized to post notifications.');
        return;
    }
    const token = await getToken();
    if (!token) return;

    const title = document.getElementById('title').value;
    const category = document.getElementById('category').value;
    const content = document.getElementById('content').value;

    try {
        const res = await fetch('/api/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ title, category, content })
        });
        const data = await res.json();
        if (res.ok) {
            alert('Notification posted!');
            document.getElementById('notificationForm').reset();
            loadNotifications(); // refresh list
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to post notification');
    }
});

// Load notifications with optional filter
async function loadNotifications() {
    const category = document.getElementById('filterCategory').value;
    let url = '/api/notifications';
    if (category) url += `?category=${encodeURIComponent(category)}`;

    try {
        const res = await fetch(url);
        const notifications = await res.json();
        displayNotifications(notifications);
    } catch (err) {
        console.error(err);
    }
}

// Display notifications
function displayNotifications(notifications) {
    const container = document.getElementById('notificationsList');
    if (notifications.length === 0) {
        container.innerHTML = '<p>No notifications found.</p>';
        return;
    }
    container.innerHTML = notifications.map(n => `
        <div class="notification-card ${n.category?.toLowerCase() || 'general'}" data-id="${n.id}">
            <div class="notification-header">
                <span class="notification-category">${n.category || 'General'}</span>
                <span class="notification-date">${new Date(n.created_at).toLocaleString()}</span>
            </div>
            <div class="notification-title">${n.title}</div>
            <div class="notification-content">${n.content.replace(/\n/g, '<br>')}</div>
            ${isAdminUser ? `<button class="delete-btn" onclick="deleteNotification('${n.id}')">Delete</button>` : ''}
        </div>
    `).join('');
}

// Delete notification (admin only)
window.deleteNotification = async function(id) {
    if (!isAdminUser) return;
    if (!confirm('Delete this notification?')) return;
    const token = await getToken();
    if (!token) return;
    try {
        const res = await fetch(`/api/notifications/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            loadNotifications();
        } else {
            const data = await res.json();
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
    }
};

// Filter buttons
document.getElementById('applyFilter').addEventListener('click', loadNotifications);
document.getElementById('resetFilter').addEventListener('click', () => {
    document.getElementById('filterCategory').value = '';
    loadNotifications();
});

// Initial load
loadNotifications();