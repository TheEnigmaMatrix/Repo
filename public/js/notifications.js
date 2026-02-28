const SUPABASE_URL = 'https://zvcqzevzxnqllumwqpxs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2Y3F6ZXZ6eG5xbGx1bXdxcHhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTY2MTgsImV4cCI6MjA4Nzc5MjYxOH0.Z3d98gsqhid1pC6hnaMPpnPpNmcR0D2GC-2xUusXuBs';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
}

let isAdminUser = false;
let lastUnseenCount = -1;
let pollUnseenInterval = null;

document.getElementById('logout')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
});

function getLoginEmail() {
    return (localStorage.getItem('uah-login-email') || '').trim().toLowerCase();
}

async function getAuthHeaders(extraHeaders) {
    const headers = Object.assign({}, extraHeaders || {});
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    else {
        const email = getLoginEmail();
        if (email) headers['X-User-Email'] = email;
    }
    return headers;
}

(async function init() {
    const email = getLoginEmail();
    if (!email) {
        window.location.href = '/index.html';
        return;
    }

    // Admin only if Supabase session exists (optional)
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();
            if (profile) {
                isAdminUser = profile.role === 'admin';
                const adminEl = document.getElementById('adminSection');
                const formEl = document.getElementById('adminFormContainer');
                if (adminEl) adminEl.style.display = 'block';
                if (formEl && isAdminUser) formEl.style.display = 'block';
            }
        }
    } catch (_) { /* ignore */ }

    // Gmail: handle redirect params
    const params = new URLSearchParams(window.location.search);
    if (params.get('gmail') === 'connected') {
        window.history.replaceState({}, '', window.location.pathname);
        document.getElementById('gmailConnectBlock').style.display = 'none';
        document.getElementById('gmailConnectedBlock').style.display = 'block';
    } else if (params.get('gmail') === 'error') {
        window.history.replaceState({}, '', window.location.pathname);
        alert('Gmail connection failed. Please try again.');
    }

    await refreshGmailStatus();
    loadWatchedSenders();
    loadUnseenBySender();
    startUnseenCountPolling();
})();

// ----- Campus notices (admin post) -----
document.getElementById('notificationForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdminUser) return;
    const token = await getToken();
    if (!token) return;
    const title = document.getElementById('title').value;
    const category = document.getElementById('category').value;
    const content = document.getElementById('content').value;
    try {
        const res = await fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ title, category, content })
        });
        const data = await res.json();
        if (res.ok) {
            alert('Notification posted!');
            document.getElementById('notificationForm').reset();
            loadNotifications();
        } else alert(data.error || 'Failed');
    } catch (err) {
        console.error(err);
        alert('Failed to post notification');
    }
});

async function loadNotifications() {
    const category = document.getElementById('filterCategory')?.value;
    let url = '/api/notifications';
    if (category) url += `?category=${encodeURIComponent(category)}`;
    try {
        const res = await fetch(url);
        const list = await res.json();
        displayNotifications(Array.isArray(list) ? list : []);
    } catch (err) {
        console.error(err);
    }
}

function displayNotifications(notifications) {
    const container = document.getElementById('notificationsList');
    if (!container) return;
    if (!notifications.length) {
        container.innerHTML = '<p style="color: var(--text-muted);">No campus notices yet.</p>';
        return;
    }
    const categoryClass = c => (c || 'general').toLowerCase();
    container.innerHTML = notifications.map(n => `
        <div class="notice-card" data-id="${n.id}">
            <div class="dept-tag tag-${categoryClass(n.category)}">${n.category || 'General'}</div>
            <h3 style="margin-bottom: 10px; font-size: 1.25rem;">${n.title || ''}</h3>
            <p style="color: var(--text-muted); font-size: 0.95rem; line-height: 1.6;">${(n.content || '').replace(/\n/g, '<br>')}</p>
            <div style="margin-top: 20px; font-size: 0.8rem; color: var(--text-muted);">${new Date(n.created_at).toLocaleString()}</div>
            ${isAdminUser ? `<button class="delete-btn btn-sm btn-secondary" style="margin-top:12px" onclick="deleteNotification('${n.id}')">Delete</button>` : ''}
        </div>
    `).join('');
}

window.deleteNotification = async function(id) {
    if (!isAdminUser) return;
    if (!confirm('Delete this notification?')) return;
    const token = await getToken();
    if (!token) return;
    try {
        const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) loadNotifications();
        else alert((await res.json()).error);
    } catch (err) {
        console.error(err);
    }
};

document.getElementById('applyFilter')?.addEventListener('click', loadNotifications);
document.getElementById('resetFilter')?.addEventListener('click', () => {
    const el = document.getElementById('filterCategory');
    if (el) el.value = '';
    loadNotifications();
});

// ----- Gmail connect & watched senders -----
async function refreshGmailStatus() {
    try {
        const res = await fetch('/api/gmail/status', { headers: await getAuthHeaders() });
        const data = await res.json();
        if (res.ok && data.connected) {
            document.getElementById('gmailConnectBlock').style.display = 'none';
            document.getElementById('gmailConnectedBlock').style.display = 'block';
            loadWatchedSenders();
        } else {
            document.getElementById('gmailConnectBlock').style.display = 'block';
            document.getElementById('gmailConnectedBlock').style.display = 'none';
        }
    } catch (_) {
        document.getElementById('gmailConnectBlock').style.display = 'block';
        document.getElementById('gmailConnectedBlock').style.display = 'none';
    }
}

document.getElementById('connectGmailBtn')?.addEventListener('click', async () => {
    try {
        const hintDefault = (localStorage.getItem('uah-gmail-address') || getLoginEmail() || '').trim();
        const gmail = prompt('Enter your Gmail address to connect:', hintDefault);
        if (!gmail) return;
        const gmailAddr = gmail.trim().toLowerCase();
        localStorage.setItem('uah-gmail-address', gmailAddr);
        const res = await fetch('/api/gmail/auth-url', { headers: await getAuthHeaders({ 'X-Gmail-Address': gmailAddr }) });
        const data = await res.json();
        if (res.ok && data.url) window.location.href = data.url;
        else alert(data.error || 'Could not get Gmail auth URL');
    } catch (err) {
        console.error(err);
        alert('Failed to connect Gmail');
    }
});

async function loadWatchedSenders() {
    try {
        const res = await fetch('/api/gmail/watched-senders', { headers: await getAuthHeaders() });
        const list = await res.json();
        const container = document.getElementById('watchedSendersList');
        if (!container) return;
        if (!list.length) {
            container.innerHTML = '<p style="font-size:0.9rem; color: var(--text-muted);">No senders added yet.</p>';
            return;
        }
        container.innerHTML = list.map(s => `
            <div class="watched-sender-row" data-id="${s.id}">
                <span style="color: var(--text-main);">${s.display_name} &lt;${s.sender_email}&gt;</span>
                <button type="button" class="btn-sm btn-secondary" onclick="removeWatchedSender('${s.id}')">Remove</button>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

window.removeWatchedSender = async function(id) {
    try {
        await fetch(`/api/gmail/watched-senders/${id}`, { method: 'DELETE', headers: await getAuthHeaders() });
        loadWatchedSenders();
    } catch (err) {
        console.error(err);
    }
};

document.getElementById('addSenderBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('senderEmail')?.value?.trim();
    const name = document.getElementById('senderDisplayName')?.value?.trim();
    if (!email || !name) {
        alert('Enter sender email and display name.');
        return;
    }
    try {
        const res = await fetch('/api/gmail/watched-senders', {
            method: 'POST',
            headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ sender_email: email, display_name: name })
        });
        if (res.ok) {
            document.getElementById('senderEmail').value = '';
            document.getElementById('senderDisplayName').value = '';
            loadWatchedSenders();
        } else {
            const d = await res.json();
            alert(d.error || 'Failed to add');
        }
    } catch (err) {
        console.error(err);
    }
});

document.getElementById('syncGmailBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('syncGmailBtn');
    btn.disabled = true;
    btn.textContent = 'Syncing…';
    try {
        const res = await fetch('/api/gmail/sync', { method: 'POST', headers: await getAuthHeaders() });
        const data = await res.json();
        if (res.ok) {
            loadUnseenBySender();
            updateUnseenBadge(await fetchUnseenCount());
            if (data.newCount > 0) showToast(`You have ${data.newCount} new unseen email(s) from watched senders.`);
        } else alert(data.error || 'Sync failed');
    } catch (err) {
        console.error(err);
        alert('Sync failed');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sync inbox now';
    }
});

// ----- Unseen counts grouped by sender (no mail content) -----
async function loadUnseenBySender() {
    try {
        const res = await fetch('/api/notifications/email/unseen-by-sender', { headers: await getAuthHeaders() });
        const list = await res.json();
        const container = document.getElementById('emailNotificationsList');
        if (!container) return;
        if (!Array.isArray(list) || list.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted);">No unseen emails from watched senders. Add senders and sync.</p>';
            return;
        }
        container.innerHTML = list.map(s => `
            <div class="email-notification-card unseen">
                <div>
                    <div class="from-msg">${(s.from_name || s.from_email || 'Unknown')}</div>
                    <div class="time">${(s.from_email || '').replace(/</g, '&lt;')}</div>
                </div>
                <div style="font-weight:800; color: var(--accent); font-size:1.2rem;">${s.count || 0}</div>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

document.getElementById('markAllSeenBtn')?.addEventListener('click', async () => {
    try {
        await fetch('/api/notifications/email/mark-all-seen', { method: 'POST', headers: await getAuthHeaders() });
        loadUnseenBySender();
        lastUnseenCount = 0;
        updateUnseenBadge(0);
    } catch (err) {
        console.error(err);
    }
});

// ----- Unseen count badge & toast -----
async function fetchUnseenCount() {
    try {
        const res = await fetch('/api/notifications/email/unseen-count', { headers: await getAuthHeaders() });
        const data = await res.json();
        return res.ok ? (data.count || 0) : 0;
    } catch (_) {
        return 0;
    }
}

function updateUnseenBadge(count) {
    const badge = document.getElementById('emailNotificationBadge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

function showToast(message) {
    const existing = document.querySelector('.toast-popup');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.className = 'toast-popup';
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 5000);
}

function startUnseenCountPolling() {
    if (pollUnseenInterval) clearInterval(pollUnseenInterval);
    const poll = async () => {
        const count = await fetchUnseenCount();
        if (count > lastUnseenCount && lastUnseenCount >= 0) {
            showToast(`You have ${count - lastUnseenCount} new email notification(s) from watched senders.`);
        }
        lastUnseenCount = count;
        updateUnseenBadge(count);
        loadUnseenBySender();
    };
    poll();
    pollUnseenInterval = setInterval(poll, 30000);
}

// Initial load
loadNotifications();
