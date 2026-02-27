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
            document.getElementById('adminFormContainer').style.display = 'block';
        }
    }
});

// Load courses on page load
loadCourses();

// Admin form submission
document.getElementById('addCourseForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdminUser) {
        alert('You are not authorized to add courses.');
        return;
    }
    const token = await getToken();
    if (!token) return;

    const courseCode = document.getElementById('courseCode').value;
    const courseName = document.getElementById('courseName').value;
    const dayOfWeek = parseInt(document.getElementById('dayOfWeek').value);
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    const venue = document.getElementById('venue').value;
    const instructor = document.getElementById('instructor').value;

    if (startTime >= endTime) {
        alert('End time must be after start time');
        return;
    }

    try {
        const res = await fetch('/api/timetable/course', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ courseCode, courseName, dayOfWeek, startTime, endTime, venue, instructor })
        });
        const data = await res.json();
        if (res.ok) {
            alert('Course added!');
            document.getElementById('addCourseForm').reset();
            loadCourses();
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to add course');
    }
});

// Load courses
async function loadCourses() {
    try {
        const res = await fetch('/api/timetable/course');
        const courses = await res.json();
        displayCourses(courses);
    } catch (err) {
        console.error(err);
    }
}

// Display courses grouped by day
function displayCourses(courses) {
    const container = document.getElementById('timetableContainer');
    if (!courses || courses.length === 0) {
        container.innerHTML = '<div class="card no-courses">No courses scheduled.</div>';
        return;
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const grouped = {};
    courses.forEach(course => {
        if (!grouped[course.day_of_week]) grouped[course.day_of_week] = [];
        grouped[course.day_of_week].push(course);
    });

    let html = '';
    for (let day = 0; day <= 6; day++) {
        if (grouped[day]) {
            grouped[day].sort((a, b) => a.start_time.localeCompare(b.start_time));
            html += `<div class="day-group card">`;
            html += `<div class="day-title">${dayNames[day]}</div>`;
            grouped[day].forEach(course => {
                html += `
                    <div class="course-row" data-id="${course.id}">
                        <div class="course-time">${course.start_time.slice(0,5)} - ${course.end_time.slice(0,5)}</div>
                        <div class="course-code">${course.course_code}</div>
                        <div class="course-name">${course.course_name}</div>
                        <div class="course-details">
                            ${course.venue ? `Venue: ${course.venue}<br>` : ''}
                            ${course.instructor ? `Instr: ${course.instructor}` : ''}
                        </div>
                        ${isAdminUser ? `
                            <div class="course-actions">
                                <button class="delete-course" onclick="deleteCourse('${course.id}')">Delete</button>
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

// Delete course (admin only)
window.deleteCourse = async function(id) {
    if (!isAdminUser) return;
    if (!confirm('Delete this course?')) return;
    const token = await getToken();
    if (!token) return;
    try {
        const res = await fetch(`/api/timetable/course/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            loadCourses();
        } else {
            const data = await res.json();
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
    }
};