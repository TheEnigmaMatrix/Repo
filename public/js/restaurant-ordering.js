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

// Load restaurants on page load
loadRestaurants();

// Admin form submission
document.getElementById('addRestaurantForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isAdminUser) {
        alert('You are not authorized.');
        return;
    }
    const token = await getToken();
    if (!token) return;

    const name = document.getElementById('restaurantName').value;
    const url = document.getElementById('restaurantUrl').value;
    const logo_url = document.getElementById('restaurantLogo').value;

    try {
        const res = await fetch('/api/restaurants', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, url, logo_url })
        });
        const data = await res.json();
        if (res.ok) {
            alert('Restaurant added!');
            document.getElementById('addRestaurantForm').reset();
            loadRestaurants();
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to add restaurant');
    }
});

// Load restaurants
async function loadRestaurants() {
    try {
        const res = await fetch('/api/restaurants');
        const restaurants = await res.json();
        displayRestaurants(restaurants);
    } catch (err) {
        console.error(err);
    }
}

// Display restaurants
function displayRestaurants(restaurants) {
    const container = document.getElementById('restaurantList');
    if (!restaurants || restaurants.length === 0) {
        container.innerHTML = '<div class="no-restaurants">No restaurants available.</div>';
        return;
    }

    let html = '<div class="restaurant-grid">';
    restaurants.forEach(r => {
        html += `
            <div class="restaurant-card" data-id="${r.id}">
                ${r.logo_url ? `<img src="${r.logo_url}" alt="${r.name}" class="restaurant-logo">` : ''}
                <div class="restaurant-name">${r.name}</div>
                <a href="${r.url}" target="_blank" rel="noopener noreferrer" class="order-btn">Order Now</a>
                ${isAdminUser ? `<button class="delete-btn" onclick="deleteRestaurant('${r.id}')">Delete</button>` : ''}
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

// Delete restaurant (admin only)
window.deleteRestaurant = async function(id) {
    if (!isAdminUser) return;
    if (!confirm('Delete this restaurant?')) return;
    const token = await getToken();
    if (!token) return;
    try {
        const res = await fetch(`/api/restaurants/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            loadRestaurants();
        } else {
            const data = await res.json();
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
    }
};