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

