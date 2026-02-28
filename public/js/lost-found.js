const supabase = window.uahSupabase;

// Helper to get auth token
async function getToken() {
    return window.uahAuth?.getToken ? await window.uahAuth.getToken() : null;
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
            loadItems(); // refresh the shared feed
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
            loadItems(); // refresh the shared feed
        } else {
            alert(data.error);
        }
    } catch (err) {
        console.error(err);
        alert('Failed to report lost item');
    }
});

// Load items (lost + found) for all logged-in users
async function loadItems() {
    const category = document.getElementById('categoryFilter').value;
    let url = '/api/lost-found';
    if (category) url += `?category=${encodeURIComponent(category)}`;

    try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const items = await res.json();
        displayItems(items);
    } catch (err) {
        console.error(err);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

// Display items in the list (lost + found)
function displayItems(items) {
    const container = document.getElementById('foundItemsList');
    if (items.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted);">No items yet.</p>';
        return;
    }
    container.innerHTML = items.map(item => {
        const type = item.type === 'lost' ? 'lost' : 'found';
        const badge = type === 'lost' ? 'LOST' : 'FOUND';
        return `
            <div class="item-card ${type}" data-id="${escapeHtml(item.id)}">
                <div class="status-badge">${badge}</div>
                <h4>${escapeHtml(item.title)}</h4>
                <p><strong>Category:</strong> ${escapeHtml(item.category)}</p>
                ${item.description ? `<p><strong>Description:</strong> ${escapeHtml(item.description)}</p>` : ''}
                ${item.images && item.images.length > 0 ? `
                    <div class="item-images">
                        ${item.images.map(img => `<img src="${img}" alt="Item image" onclick="openModal('${img}')">`).join('')}
                    </div>
                ` : ''}
                <div class="contact-info">
                    <strong>Contact:</strong> ${escapeHtml(item.contact_info)}
                </div>
                ${currentUser && item.user_id === currentUser.id ? `
                    <button class="delete-btn" onclick="deleteItem('${escapeHtml(item.id)}')">Delete</button>
                ` : ''}
            </div>
        `;
    }).join('');
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
            loadItems(); // refresh list
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
    document.getElementById('categoryFilter').value = '';
    loadItems();
});

// Initial load
loadItems();