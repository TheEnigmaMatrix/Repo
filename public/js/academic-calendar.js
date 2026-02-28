async function getToken() {
  return window.uahAuth?.getToken ? await window.uahAuth.getToken() : null;
}

async function loadAcademicCalendarImage() {
  const container = document.getElementById('academicCalendarDisplay');
  if (!container) return;

  try {
    const token = await getToken();
    if (!token) return;

    const res = await fetch('/api/student-uploads/academic-calendar', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok && data.imageUrl) {
      container.className = '';
      var ts = data.updatedAt ? new Date(data.updatedAt).getTime() : Date.now();
      var src = data.imageUrl + (data.imageUrl.includes('?') ? '&' : '?') + 't=' + ts;
      container.innerHTML = `<img src="${src}" alt="Academic calendar" loading="lazy">`;
    } else {
      container.className = 'empty';
      container.textContent = 'No academic calendar image uploaded yet. Upload one above to save it forever.';
    }
  } catch (err) {
    console.error(err);
    container.className = 'empty';
    container.textContent = 'Unable to load academic calendar. Please try again later.';
  }
}

document.getElementById('uploadAcademicCalendarForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = await getToken();
  if (!token) return;

  const fileInput = document.getElementById('academicCalendarImageInput');
  if (!fileInput?.files?.length) return alert('Please select an image file.');
  const file = fileInput.files[0];
  if (!file.type?.startsWith('image/')) return alert('Please select an image file (PNG/JPG/WebP).');

  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await fetch('/api/student-uploads/academic-calendar', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      alert('Academic calendar image saved.');
      fileInput.value = '';
      loadAcademicCalendarImage();
    } else {
      alert(data.error || 'Upload failed');
    }
  } catch (err) {
    console.error(err);
    alert('Failed to upload image');
  }
});

window.uahAuth?.requireUser?.().then(() => {
  loadAcademicCalendarImage();
});

