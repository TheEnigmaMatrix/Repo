<<<<<<< HEAD
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
=======
// Course Timetable image stored locally per login email (similar to QR Wallet)
(function () {
  var STORAGE_KEY_PREFIX = 'uah-course-timetable-';

  function getStorageKey() {
    var email = (localStorage.getItem('uah-login-email') || '').trim();
    var safe = (email || 'default').replace(/[@.]/g, '_');
    return STORAGE_KEY_PREFIX + safe;
  }

  function loadImageData() {
    try {
      var raw = localStorage.getItem(getStorageKey());
      return raw || null;
    } catch (e) {
      return null;
    }
  }

  function saveImageData(dataUrl) {
    try {
      localStorage.setItem(getStorageKey(), dataUrl);
      return true;
    } catch (e) {
      console.warn('Course timetable: could not save to localStorage', e);
      return false;
    }
  }

  function renderCourseTimetable() {
    var container = document.getElementById('courseTimetableDisplay');
    if (!container) return;

    var dataUrl = loadImageData();
    if (!dataUrl) {
      container.className = 'empty';
      container.textContent = 'No course timetable image uploaded yet. Upload one above to keep it saved on this device.';
      return;
    }

    container.className = '';
    container.innerHTML = '<img src="' + dataUrl + '" alt="Course timetable" loading="lazy">';
  }

  function init() {
    var form = document.getElementById('uploadCourseTimetableForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = document.getElementById('courseTimetableImageInput');
        var file = input && input.files ? input.files[0] : null;
        if (!file) {
          alert('Please select an image file.');
          return;
        }
        if (!file.type || file.type.indexOf('image/') !== 0) {
          alert('Please select a valid image file (PNG/JPG/WebP).');
          return;
        }

        var reader = new FileReader();
        reader.onload = function () {
          if (!saveImageData(reader.result)) {
            alert('Could not save image. Try a smaller image or clear some storage.');
            return;
          }
          if (input) input.value = '';
          renderCourseTimetable();
        };
        reader.onerror = function () {
          alert('Failed to read image file.');
        };
        reader.readAsDataURL(file);
      });
    }

    // Initial render from localStorage
    renderCourseTimetable();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

>>>>>>> 3fe8a295e81e02c6a3e0db6eb26a8301cf270bc0
