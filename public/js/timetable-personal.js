// My Timetable – stored locally on the user's device (per email)
(function () {
    var STORAGE_KEY_PREFIX = 'uah-timetable-events-';

    function getStorageKey() {
        var email = (localStorage.getItem('uah-login-email') || '').trim();
        var safe = (email || 'default').replace(/[@.]/g, '_');
        return STORAGE_KEY_PREFIX + safe;
    }

    function loadFromStorage() {
        try {
            var raw = localStorage.getItem(getStorageKey());
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveToStorage(events) {
        try {
            localStorage.setItem(getStorageKey(), JSON.stringify(events));
        } catch (e) {
            console.warn('Timetable: could not save to localStorage', e);
        }
    }

    function nextId() {
        return 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
    }

    function showAddedFeedback(message) {
        var el = document.getElementById('timetableToast');
        if (el) {
            el.textContent = message;
            el.classList.add('show');
            clearTimeout(showAddedFeedback._t);
            showAddedFeedback._t = setTimeout(function () { el.classList.remove('show'); }, 2500);
        }
    }

    function runWhenReady(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    runWhenReady(function init() {
        document.getElementById('logout')?.addEventListener('click', function () {
            window.uahSupabase?.auth?.signOut?.();
            window.location.href = '/';
        });

        if (window.uahAuth && window.uahAuth.requireUser) {
            window.uahAuth.requireUser().catch(function () {});
        }

        // Initial render so Weekly Schedule and Upcoming sections show current data
        renderEvents();

        var weeklyForm = document.getElementById('weeklyEventForm');
        var oneTimeForm = document.getElementById('oneTimeEventForm');
        if (!weeklyForm || !oneTimeForm) return;

        // —— Weekly recurring event ——
        weeklyForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var eventName = (document.getElementById('weeklyName').value || '').trim();
            var dayVal = document.getElementById('weeklyDay').value;
            var dayOfWeek = dayVal === '' ? NaN : parseInt(dayVal, 10);
            var startTime = (document.getElementById('weeklyStart').value || '').trim();
            var endTime = (document.getElementById('weeklyEnd').value || '').trim();
            var location = (document.getElementById('weeklyLocation').value || '').trim();

            if (!eventName) {
                alert('Please enter event name.');
                return;
            }
            if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
                alert('Please select a day.');
                return;
            }
            if (!startTime || !endTime) {
                alert('Please enter start and end time.');
                return;
            }
            if (startTime >= endTime) {
                alert('End time must be after start time.');
                return;
            }

            var events = loadFromStorage();
            events.push({
                id: nextId(),
                event_name: eventName,
                day_of_week: dayOfWeek,
                event_date: null,
                start_time: startTime,
                end_time: endTime,
                location: location || null
            });
            saveToStorage(events);
            weeklyForm.reset();
            renderEvents();
            showAddedFeedback('Weekly event added. See Weekly Schedule below.');
        });

        // —— One-time event ——
        oneTimeForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var eventName = (document.getElementById('oneTimeName').value || '').trim();
            var eventDate = (document.getElementById('oneTimeDate').value || '').trim();
            var startTime = (document.getElementById('oneTimeStart').value || '').trim();
            var endTime = (document.getElementById('oneTimeEnd').value || '').trim();
            var location = (document.getElementById('oneTimeLocation').value || '').trim();

            if (!eventName) {
                alert('Please enter event name.');
                return;
            }
            if (!eventDate) {
                alert('Please select a date.');
                return;
            }
            if (!startTime || !endTime) {
                alert('Please enter start and end time.');
                return;
            }
            if (startTime >= endTime) {
                alert('End time must be after start time.');
                return;
            }

            var events = loadFromStorage();
            events.push({
                id: nextId(),
                event_name: eventName,
                day_of_week: null,
                event_date: eventDate,
                start_time: startTime,
                end_time: endTime,
                location: location || null
            });
            saveToStorage(events);
            oneTimeForm.reset();
            renderEvents();
            showAddedFeedback('One-time event added. See Upcoming One-Time Events below.');
        });
    });

    function renderEvents() {
        var events = loadFromStorage();
        var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        // Weekly: has day_of_week (number 0-6); one-time: has event_date
        var weekly = events.filter(function (e) {
            var d = e.day_of_week;
            return d != null && d !== '' && !e.event_date;
        });
        var oneTime = events.filter(function (e) { return e.event_date != null && e.event_date !== ''; })
            .sort(function (a, b) { return (a.event_date || '').localeCompare(b.event_date || ''); });

        // Weekly grid – match by numeric day
        var weeklyHtml = '';
        for (var day = 0; day <= 6; day++) {
            var dayEvents = weekly.filter(function (e) { return Number(e.day_of_week) === day; })
                .sort(function (a, b) { return (a.start_time || '').localeCompare(b.start_time || ''); });
            weeklyHtml += '<div class="day-column"><div class="day-header">' + dayNames[day] + '</div>';
            if (dayEvents.length === 0) {
                weeklyHtml += '<p style="color: var(--text-muted);">No events</p>';
            } else {
                dayEvents.forEach(function (e) {
                    var start = (e.start_time || '').slice(0, 5);
                    var end = (e.end_time || '').slice(0, 5);
                    weeklyHtml += '<div class="event-item" data-id="' + e.id + '">';
                    weeklyHtml += '<div class="event-time">' + start + ' - ' + end + '</div>';
                    weeklyHtml += '<div><strong>' + (e.event_name || '').replace(/</g, '&lt;') + '</strong></div>';
                    if (e.location) weeklyHtml += '<div>📍 ' + (e.location || '').replace(/</g, '&lt;') + '</div>';
                    weeklyHtml += '<button type="button" class="delete-event" data-id="' + e.id + '">Delete</button>';
                    weeklyHtml += '</div>';
                });
            }
            weeklyHtml += '</div>';
        }
        var weeklyEl = document.getElementById('weeklyEvents');
        if (weeklyEl) weeklyEl.innerHTML = weeklyHtml;

        // One-time events
        var oneTimeHtml = '';
        if (oneTime.length === 0) {
            oneTimeHtml = '<p style="color: var(--text-muted);">No upcoming one-time events.</p>';
        } else {
            var currentDate = '';
            oneTime.forEach(function (e) {
                var dateStr = e.event_date ? new Date(e.event_date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '';
                if (dateStr !== currentDate) {
                    if (currentDate !== '') oneTimeHtml += '</div>';
                    currentDate = dateStr;
                    oneTimeHtml += '<div class="date-group"><div class="date-header">' + dateStr + '</div>';
                }
                var start = (e.start_time || '').slice(0, 5);
                var end = (e.end_time || '').slice(0, 5);
                oneTimeHtml += '<div class="event-item" data-id="' + e.id + '">';
                oneTimeHtml += '<div class="event-time">' + start + ' - ' + end + '</div>';
                oneTimeHtml += '<div><strong>' + (e.event_name || '').replace(/</g, '&lt;') + '</strong></div>';
                if (e.location) oneTimeHtml += '<div>📍 ' + (e.location || '').replace(/</g, '&lt;') + '</div>';
                oneTimeHtml += '<button type="button" class="delete-event" data-id="' + e.id + '">Delete</button>';
                oneTimeHtml += '</div>';
            });
            oneTimeHtml += '</div>';
        }
        var oneTimeEl = document.getElementById('oneTimeEvents');
        if (oneTimeEl) oneTimeEl.innerHTML = oneTimeHtml;

        // Delete buttons (attach to each button after render so they work on newly added events)
        var root = document.querySelector('.content');
        if (root) {
            root.querySelectorAll('.delete-event').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = this.getAttribute('data-id');
                    if (!id) return;
                    if (!confirm('Delete this event?')) return;
                    var events2 = loadFromStorage().filter(function (e) { return e.id !== id; });
                    saveToStorage(events2);
                    renderEvents();
                });
            });
        }
    }

    // Theme toggle
    var themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', function () {
            document.body.classList.toggle('dark-mode');
            var isDark = document.body.classList.contains('dark-mode');
            var icon = document.getElementById('themeIcon');
            var text = document.getElementById('themeText');
            if (icon) icon.textContent = isDark ? '☀️' : '🌙';
            if (text) text.textContent = isDark ? 'Light Mode' : 'Dark Mode';
            localStorage.setItem('uah-theme', isDark ? 'dark' : 'light');
        });
    }
    if (localStorage.getItem('uah-theme') === 'dark') {
        document.body.classList.add('dark-mode');
        var icon = document.getElementById('themeIcon');
        var text = document.getElementById('themeText');
        if (icon) icon.textContent = '☀️';
        if (text) text.textContent = 'Light Mode';
    }
})();
