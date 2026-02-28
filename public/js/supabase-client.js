// Shared Supabase client + auth helpers (loaded on every page).
(function () {
  if (!window.supabase) {
    console.error('Supabase JS not loaded. Include @supabase/supabase-js v2 first.');
    return;
  }

  const SUPABASE_URL = 'https://zvcqzevzxnqllumwqpxs.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2Y3F6ZXZ6eG5xbGx1bXdxcHhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTY2MTgsImV4cCI6MjA4Nzc5MjYxOH0.Z3d98gsqhid1pC6hnaMPpnPpNmcR0D2GC-2xUusXuBs';

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true
    }
  });

  function isIndexRoute() {
    const p = window.location.pathname;
    return p === '/' || p.endsWith('/index.html');
  }

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  }

  async function requireUser() {
    var justLoggedIn = sessionStorage.getItem('uah-just-logged-in');
    if (justLoggedIn) {
      sessionStorage.removeItem('uah-just-logged-in');
      await new Promise(function (r) { setTimeout(r, 100); });
    }
    var session = (await supabase.auth.getSession()).data.session;
    if (session?.user) {
      window.uahCurrentUser = session.user;
      if (session.user.email) localStorage.setItem('uah-login-email', session.user.email);
      return session.user;
    }
    var result = await supabase.auth.getUser();
    var user = result.data.user;
    if (user) {
      window.uahCurrentUser = user;
      if (user.email) localStorage.setItem('uah-login-email', user.email);
      return user;
    }
    // No Supabase session: allow access if email was entered (easy dashboard open).
    var email = localStorage.getItem('uah-login-email');
    if (email && email.trim()) {
      window.uahCurrentUser = { id: null, email: email.trim() };
      return window.uahCurrentUser;
    }
    window.location.href = (window.location.pathname.replace(/\/[^/]+$/, '') || '/') + '/';
    return null;
  }

  function attachLogout() {
    const btn = document.getElementById('logout');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.href = '/';
    });
  }

  window.uahSupabase = supabase;
  window.uahAuth = { getToken, requireUser, attachLogout };

  // Enforce login on every page except index.
  if (!isIndexRoute()) {
    requireUser();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachLogout);
  } else {
    attachLogout();
  }
})();
