/**
 * UAH IITJ - Shared theme and UI behavior.
 * Load this on every page. Apply saved theme as first script in <body> (inline) to avoid flash.
 * This script initializes the theme toggle button on DOMContentLoaded.
 */
(function () {
    function initThemeToggle() {
        var btn = document.getElementById('themeToggle');
        if (!btn) return;
        var icon = document.getElementById('themeIcon');
        var textEl = document.getElementById('themeText');

        function updateLabel() {
            var isDark = document.body.classList.contains('dark-mode');
            if (icon) icon.textContent = isDark ? '☀️' : '🌙';
            if (textEl) textEl.textContent = isDark ? 'Light Mode' : 'Dark Mode';
            if (!textEl && btn) btn.innerHTML = (isDark ? '☀️ Light Mode' : '🌙 Dark Mode');
        }

        updateLabel();
        btn.addEventListener('click', function () {
            document.body.classList.toggle('dark-mode');
            var isDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('uah-theme', isDark ? 'dark' : 'light');
            updateLabel();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initThemeToggle);
    } else {
        initThemeToggle();
    }
})();
