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

// Current user and admin status
let isAdminUser = false;

// Check login and admin status
supabase.auth.getUser().then(async ({ data: { user } }) => {
    if (!user) {
        window.location.href = '/';
        return;
    }
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    if (profile) {
        isAdminUser = profile.role === 'admin';
        if (isAdminUser) {
            document.getElementById('adminSection').style.display = 'block';
        }
    }
});

// Load bus schedules on page load
loadBusSchedules();

// Admin form submission
document.getElementById('addBusForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdminUser) {
        alert('You are not authorized.');
        return;
    }
    const token = await getToken();
    if (!token) return;

    const routeName = document.getElementById('routeName').value;
    const stopName = document.getElementById('stopName').value;
    const arrivalTime = document.getElementById('arrivalTime').value;

    try {
        const res = await fetch('/api/bus-schedule', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ routeName, stopName, arrivalTime })
        });
        const data = await res.json();
        if (res.ok) {
            alert('Schedule added!');
            document.getElementById('addBusForm').reset();
            loadBusSchedules();
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to add schedule');
    }
});

// Load schedules
async function loadBusSchedules() {
    try {
        const res = await fetch('/api/bus-schedule');
        const schedules = await res.json();
        displayBusSchedules(schedules);
    } catch (err) {
        console.error(err);
    }
}

// Display schedules grouped by route
function displayBusSchedules(schedules) {
    const container = document.getElementById('busScheduleList');
    if (!schedules || schedules.length === 0) {
        container.innerHTML = '<div class="no-schedule">No bus schedules available.</div>';
        return;
    }

    // Group by route_name
    const grouped = {};
    schedules.forEach(item => {
        if (!grouped[item.route_name]) grouped[item.route_name] = [];
        grouped[item.route_name].push(item);
    });

    let html = '';
    for (const route in grouped) {
        // Sort stops by arrival time
        grouped[route].sort((a, b) => a.arrival_time.localeCompare(b.arrival_time));
        html += `<div class="route-group card">`;
        html += `<div class="route-title">${route}</div>`;
        grouped[route].forEach(stop => {
            html += `
                <div class="stop-row" data-id="${stop.id}">
                    <div class="stop-name">${stop.stop_name}</div>
                    <div class="stop-time">${stop.arrival_time.slice(0,5)}</div>
                    ${isAdminUser ? `
                        <div class="stop-actions">
                            <button class="delete-btn" onclick="deleteSchedule('${stop.id}')">Delete</button>
                        </div>
                    ` : ''}
                </div>
            `;
        });
        html += `</div>`;
    }
    container.innerHTML = html;
}

// Delete schedule (admin only)
window.deleteSchedule = async function(id) {
    if (!isAdminUser) return;
    if (!confirm('Delete this schedule entry?')) return;
    const token = await getToken();
    if (!token) return;
    try {
        const res = await fetch(`/api/bus-schedule/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            loadBusSchedules();
        } else {
            const data = await res.json();
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
    }
};