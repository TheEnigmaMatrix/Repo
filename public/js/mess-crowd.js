// Supabase initialization (same as dashboard)
const SUPABASE_URL = 'https://zvcqzevzxnqllumwqpxs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2Y3F6ZXZ6eG5xbGx1bXdxcHhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTY2MTgsImV4cCI6MjA4Nzc5MjYxOH0.Z3d98gsqhid1pC6hnaMPpnPpNmcR0D2GC-2xUusXuBs';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Logout button
document.getElementById('logout').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
});

// Helper to get auth token
async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
}

// Fetch occupancy and update UI
async function fetchOccupancy() {
    const token = await getToken();
    if (!token) {
        window.location.href = '/';
        return;
    }

    try {
        const res = await fetch('/api/mess/occupancy', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
            document.getElementById('mealWindow').textContent = data.mealWindow;
            document.getElementById('occupancy').textContent = data.occupancy;
            document.getElementById('capacity').textContent = data.totalCapacity;
            const indicator = document.getElementById('colorIndicator');
            indicator.style.backgroundColor = data.color;
            let statusMessage = '';
            if (data.color === 'green') statusMessage = 'Low crowd – Good time to go!';
            else if (data.color === 'yellow') statusMessage = 'Moderate crowd – Might be a bit busy.';
            else if (data.color === 'red') statusMessage = 'High crowd – Consider going later.';
            document.getElementById('statusText').textContent = statusMessage;
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to fetch occupancy');
    }
}

// Simulate a scan
document.getElementById('simulateScan').addEventListener('click', async () => {
    const token = await getToken();
    if (!token) return;

    try {
        const res = await fetch('/api/mess/scan', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
            alert('Check-in recorded!');
            fetchOccupancy();  // Refresh data
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to record check-in');
    }
});

// Initial load
fetchOccupancy();
// Optionally refresh every 60 seconds
setInterval(fetchOccupancy, 60000);