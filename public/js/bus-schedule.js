const SUPABASE_URL = 'https://zvcqzevzxnqllumwqpxs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2Y3F6ZXZ6eG5xbGx1bXdxcHhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTY2MTgsImV4cCI6MjA4Nzc5MjYxOH0.Z3d98gsqhid1pC6hnaMPpnPpNmcR0D2GC-2xUusXuBs';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Logout
document.getElementById('logout')?.addEventListener('click', async () => {
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
            const el = document.getElementById('adminSection');
            if (el) el.style.display = 'block';
        }
    }
    loadBusScheduleImage();
});

// Load and display the bus schedule image (for all users)
async function loadBusScheduleImage() {
    const container = document.getElementById('busScheduleList');
    if (!container) return;
    try {
        const res = await fetch('/api/bus-schedule/image');
        const data = await res.json();
        if (res.ok && data.imageUrl) {
            container.innerHTML = `
                <div class="schedule-image-card">
                    <img src="${data.imageUrl}" alt="Bus schedule" loading="lazy">
                </div>
            `;
        } else {
            container.innerHTML = '<div class="no-schedule">No bus schedule image uploaded yet. Check back later or ask an admin to upload one.</div>';
        }
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="no-schedule">Unable to load bus schedule. Please try again later.</div>';
    }
}

// Admin: upload bus schedule image
document.getElementById('uploadScheduleForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdminUser) {
        alert('You are not authorized.');
        return;
    }
    const token = await getToken();
    if (!token) return;

    const fileInput = document.getElementById('scheduleImageInput');
    if (!fileInput?.files?.length) {
        alert('Please select an image file.');
        return;
    }
    const file = fileInput.files[0];
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file (e.g. PNG, JPG).');
        return;
    }

    const formData = new FormData();
    formData.append('scheduleImage', file);

    try {
        const res = await fetch('/api/bus-schedule/image', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        const data = await res.json();
        if (res.ok) {
            alert('Bus schedule image uploaded successfully.');
            fileInput.value = '';
            loadBusScheduleImage();
        } else {
            alert(data.error || 'Upload failed');
        }
    } catch (err) {
        console.error(err);
        alert('Failed to upload image');
    }
});
