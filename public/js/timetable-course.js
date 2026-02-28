async function getToken() {
  return window.uahAuth?.getToken ? await window.uahAuth.getToken() : null;
}

async function loadCourseTimetableImage() {
  const container = document.getElementById('courseTimetableDisplay');
  if (!container) return;

  try {
    const token = await getToken();
    if (!token) return;

    const res = await fetch('/api/student-uploads/course-timetable', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok && data.imageUrl) {
      container.className = '';
      var ts = data.updatedAt ? new Date(data.updatedAt).getTime() : Date.now();
      var src = data.imageUrl + (data.imageUrl.includes('?') ? '&' : '?') + 't=' + ts;
      container.innerHTML = `<img src="${src}" alt="Course timetable" loading="lazy" crossorigin="">`;
    } else {
      container.className = 'empty';
      container.textContent = 'No course timetable image uploaded yet. Upload one above to save it forever.';
    }
  } catch (err) {
    console.error(err);
    container.className = 'empty';
    container.textContent = 'Unable to load course timetable. Please try again later.';
  }
}

document.getElementById('uploadCourseTimetableForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = await getToken();
  if (!token) return;

  const fileInput = document.getElementById('courseTimetableImageInput');
  if (!fileInput?.files?.length) return alert('Please select an image file.');
  const file = fileInput.files[0];
  if (!file.type?.startsWith('image/')) return alert('Please select an image file (PNG/JPG/WebP).');

  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await fetch('/api/student-uploads/course-timetable', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      fileInput.value = '';
      loadCourseTimetableImage();
      setTimeout(loadCourseTimetableImage, 800);
      if (typeof showToast === 'function') showToast('Saved', 'Course timetable image saved. It will appear above.', '📚');
      else alert('Course timetable image saved.');
    } else {
      alert(data.error || 'Upload failed');
    }
  } catch (err) {
    console.error(err);
    alert('Failed to upload image');
  }
});



window.uahAuth?.requireUser?.().then(() => {
  loadCourseTimetableImage();
});
