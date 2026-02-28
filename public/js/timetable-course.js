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

let isAdminUser = false;

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
            document.getElementById('adminUploadSection').style.display = 'block';
        }
    }
});

loadCalendar();

document.getElementById('uploadCalendarForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdminUser) {
        alert('Not authorized');
        return;
    }
    const token = await getToken();
    if (!token) return;

    const title = document.getElementById('calendarTitle').value;
    const fileInput = document.getElementById('calendarPdf');
    const file = fileInput.files[0];
    if (!file) {
        alert('Please select a PDF file');
        return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('pdf', file);

    try {
        const res = await fetch('/api/academic-calendar', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();
        if (res.ok) {
            alert('Calendar uploaded!');
            document.getElementById('uploadCalendarForm').reset();
            loadCalendar();
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Upload failed');
    }
});

async function loadCalendar() {
    try {
        const res = await fetch('/api/academic-calendar');
        const data = await res.json();
        displayCalendar(data);
    } catch (err) {
        console.error(err);
    }
}

function displayCalendar(calendar) {
    const container = document.getElementById('calendarDisplay');
    if (!calendar) {
        container.innerHTML = '<p class="no-calendar">No academic calendar uploaded yet.</p>';
        return;
    }
    container.innerHTML = `
        <h2>${calendar.title}</h2>
        <iframe src="${calendar.file_url}" class="pdf-viewer"></iframe>
        <p><a href="${calendar.file_url}" target="_blank" download>Download PDF</a></p>
    `;
}

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