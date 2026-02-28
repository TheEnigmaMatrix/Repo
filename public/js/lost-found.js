const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Logout button
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

// Handle Found Item Form Submission
document.getElementById('foundForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = await getToken();
    if (!token) return;

    const formData = new FormData(e.target);
    // 'type' is already 'found' from hidden input
    const files = document.getElementById('foundImages').files;
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
            alert('Found item reported successfully!');
            e.target.reset();
            loadFoundItems(); // refresh the found items list
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to report found item');
    }
});

// Handle Lost Item Form Submission
document.getElementById('lostForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = await getToken();
    if (!token) return;

    const formData = new FormData(e.target);
    const files = document.getElementById('lostImages').files;
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
            alert('Lost item reported successfully!');
            e.target.reset();
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to report lost item');
    }
});

// Load found items (type = 'found') with optional category filter
async function loadFoundItems() {
    const category = document.getElementById('categoryFilter').value;
    let url = '/api/lost-found?type=found';
    if (category) url += `&category=${encodeURIComponent(category)}`;

    try {
        const res = await fetch(url);
        const items = await res.json();
        displayFoundItems(items);
    } catch (err) {
        console.error(err);
    }
}

// Display found items in the list
function displayFoundItems(items) {
    const container = document.getElementById('foundItemsList');
    if (items.length === 0) {
        container.innerHTML = '<p>No found items yet.</p>';
        return;
    }
    container.innerHTML = items.map(item => `
        <div class="item-card found" data-id="${item.id}">
            <h4>${item.title}</h4>
            <p><strong>Category:</strong> ${item.category}</p>
            ${item.description ? `<p><strong>Description:</strong> ${item.description}</p>` : ''}
            ${item.images && item.images.length > 0 ? `
                <div class="item-images">
                    ${item.images.map(img => `<img src="${img}" alt="Item image" onclick="openModal('${img}')">`).join('')}
                </div>
            ` : ''}
            <div class="contact-info">
                <strong>Contact:</strong> ${item.contact_info}
            </div>
            ${currentUser && item.user_id === currentUser.id ? `
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
            loadFoundItems(); // refresh list
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
document.getElementById('applyFilter').addEventListener('click', loadFoundItems);
document.getElementById('resetFilter').addEventListener('click', () => {
    document.getElementById('categoryFilter').value = '';
    loadFoundItems();
});

// Initial load
loadFoundItems();