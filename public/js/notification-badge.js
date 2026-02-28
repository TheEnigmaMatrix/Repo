/**
 * Global email notification unseen counter.
 * Include this script + Supabase on any page that has an element with id="emailNotificationBadge".
 */
(function() {
    const SUPABASE_URL = 'https://zvcqzevzxnqllumwqpxs.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2Y3F6ZXZ6eG5xbGx1bXdxcHhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTY2MTgsImV4cCI6MjA4Nzc5MjYxOH0.Z3d98gsqhid1pC6hnaMPpnPpNmcR0D2GC-2xUusXuBs';
    if (typeof window.supabase === 'undefined') return;
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const badge = document.getElementById('emailNotificationBadge');
    if (!badge) return;

    async function getToken() {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token;
    }
    async function fetchUnseenCount() {
        const token = await getToken();
        if (!token) return 0;
        try {
            const res = await fetch('/api/notifications/email/unseen-count', { headers: { 'Authorization': 'Bearer ' + token } });
            const data = await res.json();
            return res.ok ? (data.count || 0) : 0;
        } catch (_) { return 0; }
    }
    function updateBadge(count) {
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }
    async function poll() {
        const count = await fetchUnseenCount();
        updateBadge(count);
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        poll();
        setInterval(poll, 30000);
    });
})();
