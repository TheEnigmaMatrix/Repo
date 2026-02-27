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

// Load PHC schedules on page load
loadPhcSchedules();

// Admin form submission
document.getElementById('addPhcForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdminUser) {
        alert('You are not authorized.');
        return;
    }
    const token = await getToken();
    if (!token) return;

    const doctorName = document.getElementById('doctorName').value;
    const specialization = document.getElementById('specialization').value;
    const dayOfWeek = parseInt(document.getElementById('dayOfWeek').value);
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;

    if (startTime >= endTime) {
        alert('End time must be after start time');
        return;
    }

    try {
        const res = await fetch('/api/phc-timetable', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ doctorName, specialization, dayOfWeek, startTime, endTime })
        });
        const data = await res.json();
        if (res.ok) {
            alert('Schedule added!');
            document.getElementById('addPhcForm').reset();
            loadPhcSchedules();
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to add schedule');
    }
});

// Filter buttons
document.getElementById('applyFilter').addEventListener('click', loadPhcSchedules);
document.getElementById('resetFilter').addEventListener('click', () => {
    document.getElementById('filterDoctor').value = '';
    document.getElementById('filterSpecialization').value = '';
    loadPhcSchedules();
});

// Load schedules with filters
async function loadPhcSchedules() {
    const doctor = document.getElementById('filterDoctor').value;
    const specialization = document.getElementById('filterSpecialization').value;
    let url = '/api/phc-timetable';
    const params = new URLSearchParams();
    if (doctor) params.append('doctor', doctor);
    if (specialization) params.append('specialization', specialization);
    if (params.toString()) url += '?' + params.toString();

    try {
        const res = await fetch(url);
        const schedules = await res.json();
        displayPhcSchedules(schedules);
    } catch (err) {
        console.error(err);
    }
}

// Display schedules grouped by day
function displayPhcSchedules(schedules) {
    const container = document.getElementById('phcList');
    if (!schedules || schedules.length === 0) {
        container.innerHTML = '<div class="no-schedule">No PHC schedules available.</div>';
        return;
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const grouped = {};
    schedules.forEach(item => {
        if (!grouped[item.day_of_week]) grouped[item.day_of_week] = [];
        grouped[item.day_of_week].push(item);
    });

    let html = '';
    for (let day = 0; day <= 6; day++) {
        if (grouped[day]) {
            // Sort by start time
            grouped[day].sort((a, b) => a.start_time.localeCompare(b.start_time));
            html += `<div class="day-group">`;
            html += `<div class="day-title">${dayNames[day]}</div>`;
            grouped[day].forEach(entry => {
                html += `
                    <div class="doctor-row" data-id="${entry.id}">
                        <div class="doctor-name">${entry.doctor_name}</div>
                        <div class="doctor-specialization">${entry.specialization || 'General'}</div>
                        <div class="doctor-time">${entry.start_time.slice(0,5)} - ${entry.end_time.slice(0,5)}</div>
                        ${isAdminUser ? `
                            <div class="doctor-actions">
                                <button class="delete-btn" onclick="deleteSchedule('${entry.id}')">Delete</button>
                            </div>
                        ` : ''}
                    </div>
                `;
            });
            html += `</div>`;
        }
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
        const res = await fetch(`/api/phc-timetable/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            loadPhcSchedules();
        } else {
            const data = await res.json();
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
    }
};