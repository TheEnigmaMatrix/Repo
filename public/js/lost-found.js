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

// Current user info (for delete permissions)
let currentUser = null;
supabase.auth.getUser().then(({ data: { user } }) => {
    currentUser = user;
    if (!user) window.location.href = '/';
});

// Form submission
document.getElementById('reportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = await getToken();
    if (!token) return;

    const formData = new FormData();
    formData.append('type', document.getElementById('itemType').value);
    formData.append('title', document.getElementById('title').value);
    formData.append('category', document.getElementById('category').value);
    formData.append('description', document.getElementById('description').value);
    formData.append('contactEmail', document.getElementById('contactEmail').value);
    const files = document.getElementById('images').files;
    for (let i = 0; i < files.length; i++) {
        formData.append('images', files[i]);
    }

    try {
        const res = await fetch('/api/lost-found', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();
        if (res.ok) {
            alert('Item reported successfully!');
            document.getElementById('reportForm').reset();
            loadItems(); // refresh list
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to report item');
    }
});

// Load items with optional filters
async function loadItems() {
    const type = document.getElementById('filterType').value;
    const category = document.getElementById('filterCategory').value;
    let url = '/api/lost-found';
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (category) params.append('category', category);
    if (params.toString()) url += '?' + params.toString();

    try {
        const res = await fetch(url);
        const items = await res.json();
        displayItems(items);
    } catch (err) {
        console.error(err);
    }
}

// Display items in the list
function displayItems(items) {
    const container = document.getElementById('itemsList');
    if (items.length === 0) {
        container.innerHTML = '<p>No items found.</p>';
        return;
    }
    container.innerHTML = items.map(item => `
        <div class="item-card ${item.type}" data-id="${item.id}">
            <h4>${item.title} <small>(${item.type})</small></h4>
            <p><strong>Category:</strong> ${item.category}</p>
            ${item.description ? `<p><strong>Description:</strong> ${item.description}</p>` : ''}
            ${item.images && item.images.length > 0 ? `
                <div class="item-images">
                    ${item.images.map(img => `<img src="${img}" alt="Item image" onclick="openModal('${img}')">`).join('')}
                </div>
            ` : ''}
            <p class="contact-email"><strong>Contact:</strong> ${item.contact_email}</p>
            ${currentUser && (item.user_id === currentUser.id) ? `
                <button class="delete-btn" onclick="deleteItem('${item.id}')">Delete</button>
            ` : ''}
        </div>
    `).join('');
}

// Delete item (only owner)
window.deleteItem = async function(id) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    const token = await getToken();
    if (!token) return;
    try {
        const res = await fetch(`/api/lost-found/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            alert('Item deleted');
            loadItems();
        } else {
            const data = await res.json();
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
    }
};

// Image modal
const modal = document.getElementById('imageModal');
const modalImg = document.getElementById('modalImage');
const closeBtn = document.querySelector('.close');
window.openModal = function(src) {
    modal.style.display = 'block';
    modalImg.src = src;
};
closeBtn.onclick = function() {
    modal.style.display = 'none';
};
window.onclick = function(event) {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
};

// Filter buttons
document.getElementById('applyFilter').addEventListener('click', loadItems);
document.getElementById('resetFilter').addEventListener('click', () => {
    document.getElementById('filterType').value = '';
    document.getElementById('filterCategory').value = '';
    loadItems();
});

// Initial load
loadItems();