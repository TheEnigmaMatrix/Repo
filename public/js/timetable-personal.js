const SUPABASE_URL = 'https://zvcqzevzxnqllumwqpxs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2Y3F6ZXZ6eG5xbGx1bXdxcHhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTY2MTgsImV4cCI6MjA4Nzc5MjYxOH0.Z3d98gsqhid1pC6hnaMPpnPpNmcR0D2GC-2xUusXuBs';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.getElementById('logout').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
});

async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
}

supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) window.location.href = '/';
});

loadEvents();

document.getElementById('weeklyEventForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = await getToken();
    if (!token) return;

    const eventName = document.getElementById('weeklyName').value;
    const dayOfWeek = parseInt(document.getElementById('weeklyDay').value);
    const startTime = document.getElementById('weeklyStart').value;
    const endTime = document.getElementById('weeklyEnd').value;
    const location = document.getElementById('weeklyLocation').value;

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
            alert('Weekly event added!');
            document.getElementById('weeklyEventForm').reset();
            loadEvents();
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to add event');
    }
});

document.getElementById('oneTimeEventForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = await getToken();
    if (!token) return;

    const eventName = document.getElementById('oneTimeName').value;
    const eventDate = document.getElementById('oneTimeDate').value;
    const startTime = document.getElementById('oneTimeStart').value;
    const endTime = document.getElementById('oneTimeEnd').value;
    const location = document.getElementById('oneTimeLocation').value;

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
            body: JSON.stringify({ eventName, eventDate, startTime, endTime, location })
        });
        const data = await res.json();
        if (res.ok) {
            alert('One-time event added!');
            document.getElementById('oneTimeEventForm').reset();
            loadEvents();
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to add event');
    }
});

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

function displayEvents(events) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    const weekly = events.filter(e => e.day_of_week !== null);
    const oneTime = events.filter(e => e.event_date !== null).sort((a,b) => a.event_date.localeCompare(b.event_date));

    // Weekly grid
    let weeklyHtml = '';
    for (let day = 0; day <= 6; day++) {
        const dayEvents = weekly.filter(e => e.day_of_week === day).sort((a,b) => a.start_time.localeCompare(b.start_time));
        weeklyHtml += `<div class="day-column"><div class="day-header">${dayNames[day]}</div>`;
        if (dayEvents.length === 0) {
            weeklyHtml += `<p style="color: var(--text-muted);">No events</p>`;
        } else {
            dayEvents.forEach(e => {
                weeklyHtml += `
                    <div class="event-item">
                        <div class="event-time">${e.start_time.slice(0,5)} - ${e.end_time.slice(0,5)}</div>
                        <div><strong>${e.event_name}</strong></div>
                        ${e.location ? `<div>📍 ${e.location}</div>` : ''}
                        <button class="delete-event" onclick="deleteEvent('${e.id}')">Delete</button>
                    </div>
                `;
            });
        }
        weeklyHtml += '</div>';
    }
    document.getElementById('weeklyEvents').innerHTML = weeklyHtml;

    // One-time events grouped by date
    let oneTimeHtml = '';
    if (oneTime.length === 0) {
        oneTimeHtml = '<p>No upcoming one-time events.</p>';
    } else {
        let currentDate = '';
        oneTime.forEach(e => {
            const dateStr = new Date(e.event_date).toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
            if (dateStr !== currentDate) {
                if (currentDate !== '') oneTimeHtml += '</div>';
                currentDate = dateStr;
                oneTimeHtml += `<div class="date-group"><div class="date-header">${dateStr}</div>`;
            }
            oneTimeHtml += `
                <div class="event-item">
                    <div class="event-time">${e.start_time.slice(0,5)} - ${e.end_time.slice(0,5)}</div>
                    <div><strong>${e.event_name}</strong></div>
                    ${e.location ? `<div>📍 ${e.location}</div>` : ''}
                    <button class="delete-event" onclick="deleteEvent('${e.id}')">Delete</button>
                </div>
            `;
        });
        oneTimeHtml += '</div>';
    }
    document.getElementById('oneTimeEvents').innerHTML = oneTimeHtml;
}

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

// Dark mode
const themeBtn = document.getElementById('themeToggle');
themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeBtn.innerText = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
    localStorage.setItem('uah-theme', isDark ? 'dark' : 'light');
});

if(localStorage.getItem('uah-theme') === 'dark') {
    document.body.classList.add('dark-mode');
    themeBtn.innerText = '☀️ Light Mode';
}