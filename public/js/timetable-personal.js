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

// Check authentication
supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) window.location.href = '/';
});

// Load events on page load
loadEvents();

// Form submission
document.getElementById('addEventForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = await getToken();
    if (!token) return;

    const eventName = document.getElementById('eventName').value;
    const dayOfWeek = parseInt(document.getElementById('dayOfWeek').value);
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const location = document.getElementById('location').value;

    // Basic time validation
    if (startTime >= endTime) {
        alert('End time must be after start time');
        return;
    }

    try {
        const res = await fetch('/api/timetable/personal', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ eventName, dayOfWeek, startTime, endTime, location })
        });
        const data = await res.json();
        if (res.ok) {
            alert('Event added!');
            document.getElementById('addEventForm').reset();
            loadEvents();
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to add event');
    }
});

// Load events and display
async function loadEvents() {
    const token = await getToken();
    if (!token) return;

    try {
        const res = await fetch('/api/timetable/personal', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const events = await res.json();
        displayEvents(events);
    } catch (err) {
        console.error(err);
    }
}

// Display events grouped by day
function displayEvents(events) {
    const container = document.getElementById('timetableContainer');
    if (!events || events.length === 0) {
        container.innerHTML = '<div class="card no-events">No events in your timetable. Add one above!</div>';
        return;
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const grouped = {};
    events.forEach(event => {
        if (!grouped[event.day_of_week]) grouped[event.day_of_week] = [];
        grouped[event.day_of_week].push(event);
    });

    let html = '';
    for (let day = 0; day <= 6; day++) {
        if (grouped[day]) {
            // Sort events by start time
            grouped[day].sort((a, b) => a.start_time.localeCompare(b.start_time));
            html += `<div class="day-group card">`;
            html += `<div class="day-title">${dayNames[day]}</div>`;
            grouped[day].forEach(event => {
                html += `
                    <div class="event-row" data-id="${event.id}">
                        <div class="event-time">${event.start_time.slice(0,5)} - ${event.end_time.slice(0,5)}</div>
                        <div class="event-name">${event.event_name}</div>
                        <div class="event-location">${event.location || ''}</div>
                        <div class="event-actions">
                            <button class="delete-event" onclick="deleteEvent('${event.id}')">Delete</button>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        }
    }
    container.innerHTML = html;
}

// Delete event
window.deleteEvent = async function(id) {
    if (!confirm('Delete this event?')) return;
    const token = await getToken();
    if (!token) return;
    try {
        const res = await fetch(`/api/timetable/personal/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            loadEvents();
        } else {
            const data = await res.json();
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
    }
};