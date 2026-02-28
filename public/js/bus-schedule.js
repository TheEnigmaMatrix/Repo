const supabase = window.uahSupabase;

async function getToken() {
    return window.uahAuth?.getToken ? await window.uahAuth.getToken() : null;
}

// Ensure logged in and then load user's saved image
window.uahAuth?.requireUser?.().then(() => {
    loadBusScheduleImage();
});

// Load and display the bus schedule image (for all users)
async function loadBusScheduleImage() {
    const container = document.getElementById('busScheduleList');
    if (!container) return;
    try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch('/api/student-uploads/bus-schedule', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.imageUrl) {
            container.innerHTML = `
                <div class="schedule-image-card">
                    <img src="${data.imageUrl}" alt="Bus schedule" loading="lazy">
                </div>
            `;
        } else {
            container.innerHTML = '<div class="no-schedule">No bus schedule image uploaded yet. Upload one above to save it forever.</div>';
        }
    } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="no-schedule">Unable to load bus schedule. Please try again later.</div>';
    }
}

// Student: upload bus schedule image (saved to your account)
document.getElementById('uploadScheduleForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
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
    formData.append('image', file);

    try {
        const res = await fetch('/api/student-uploads/bus-schedule', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        const data = await res.json();
        if (res.ok) {
            alert('Bus schedule image saved.');
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
