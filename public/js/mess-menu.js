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
let currentCategory = 'veg'; // default

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
            document.getElementById('adminSection').style.display = 'block';
        }
    }
});

// Tab switching
document.querySelectorAll('.category-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentCategory = tab.dataset.category;
        loadMenu();
    });
});

// Load menu on page load
loadMenu();

// Admin form submission
document.getElementById('addMenuForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdminUser) {
        alert('You are not authorized.');
        return;
    }
    const token = await getToken();
    if (!token) return;

    const mealType = document.getElementById('mealType').value;
    const dayOfWeek = parseInt(document.getElementById('dayOfWeek').value);
    const category = document.getElementById('categorySelect').value;
    const itemsText = document.getElementById('items').value;
    const items = itemsText.split('\n').map(i => i.trim()).filter(i => i.length > 0);

    if (items.length === 0) {
        alert('Please enter at least one item.');
        return;
    }

    try {
        const res = await fetch('/api/mess-menu', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ mealType, dayOfWeek, items, category })
        });
        const data = await res.json();
        if (res.ok) {
            alert('Menu entry added!');
            document.getElementById('addMenuForm').reset();
            loadMenu();
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to add menu');
    }
});

// Load menu for current category
async function loadMenu() {
    try {
        const url = `/api/mess-menu?category=${currentCategory}`;
        const res = await fetch(url);
        const menu = await res.json();
        displayMenu(menu);
    } catch (err) {
        console.error(err);
    }
}

// Display menu grouped by day
function displayMenu(menu) {
    const container = document.getElementById('menuList');
    if (!menu || menu.length === 0) {
        container.innerHTML = '<div class="no-menu">No menu available for this category.</div>';
        return;
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const groupedByDay = {};
    menu.forEach(entry => {
        if (!groupedByDay[entry.day_of_week]) groupedByDay[entry.day_of_week] = [];
        groupedByDay[entry.day_of_week].push(entry);
    });

    let html = '';
    for (let day = 0; day <= 6; day++) {
        if (groupedByDay[day]) {
            // Sort by meal type order: breakfast, lunch, snacks, dinner
            const mealOrder = { breakfast: 1, lunch: 2, snacks: 3, dinner: 4 };
            groupedByDay[day].sort((a, b) => mealOrder[a.meal_type] - mealOrder[b.meal_type]);

            html += `<div class="day-group">`;
            html += `<div class="day-title">${dayNames[day]}</div>`;
            groupedByDay[day].forEach(entry => {
                html += `
                    <div class="meal-row" data-id="${entry.id}">
                        <div class="meal-type">${entry.meal_type}</div>
                        <div class="meal-items">
                            <ul>
                                ${entry.items.map(item => `<li>${item}</li>`).join('')}
                            </ul>
                        </div>
                        ${isAdminUser ? `<button class="delete-btn" onclick="deleteMenuEntry('${entry.id}')">Delete</button>` : ''}
                    </div>
                `;
            });
            html += `</div>`;
        }
    }
    container.innerHTML = html;
}

// Delete menu entry (admin only)
window.deleteMenuEntry = async function(id) {
    if (!isAdminUser) return;
    if (!confirm('Delete this menu entry?')) return;
    const token = await getToken();
    if (!token) return;
    try {
        const res = await fetch(`/api/mess-menu/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            loadMenu();
        } else {
            const data = await res.json();
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
    }
};