/**
 * Unified QR Wallet - UAH IITJ
 * Store and manage multiple QR codes by name (e.g. maths attendance, mess qr).
 * Data stored in localStorage for same-device persistence.
 */

const STORAGE_KEY = 'uah-qr-wallet';

function getQrList() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function saveQrList(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function showToast(msg, icon = '📱') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    const toastIcon = document.getElementById('toastIcon');
    if (toastMsg) toastMsg.textContent = msg;
    if (toastIcon) toastIcon.textContent = icon;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

function renderQrList(filterTerm = '') {
    const list = getQrList();
    const container = document.getElementById('qrList');
    const emptyState = document.getElementById('emptyState');

    if (!container) return;

    const filtered = filterTerm
        ? list.filter(item => item.name.toLowerCase().includes(filterTerm.toLowerCase()))
        : list;

    if (filtered.length === 0) {
        container.innerHTML = '';
        if (emptyState) {
            emptyState.style.display = list.length === 0 ? 'block' : 'none';
            if (list.length > 0) {
                const noMatch = document.createElement('div');
                noMatch.className = 'empty-state';
                noMatch.innerHTML = '<p>No QRs match your search.</p>';
                container.appendChild(noMatch);
            }
        }
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    container.innerHTML = filtered.map(item => `
        <li class="qr-list-item" data-id="${item.id}" role="button" tabindex="0">
            <span class="qr-name"><span class="icon">📱</span> ${escapeHtml(item.name)}</span>
            <span class="qr-actions">
                <span class="view-badge">Tap to view</span>
                <button type="button" class="delete-qr-btn" data-id="${item.id}" aria-label="Delete ${escapeHtml(item.name)}">Delete</button>
            </span>
        </li>
    `).join('');

    container.querySelectorAll('.qr-list-item').forEach(row => {
        const id = row.getAttribute('data-id');
        row.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-qr-btn')) return;
            openQrModal(id);
        });
        row.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (e.target.classList.contains('delete-qr-btn')) return;
                openQrModal(id);
            }
        });
    });

    container.querySelectorAll('.delete-qr-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            deleteQr(id);
        });
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openQrModal(id) {
    const list = getQrList();
    const item = list.find(x => x.id === id);
    if (!item) return;

    const modal = document.getElementById('qrModal');
    const titleEl = document.getElementById('qrModalTitle');
    const imgEl = document.getElementById('qrModalImage');
    if (titleEl) titleEl.textContent = item.name;
    if (imgEl) {
        imgEl.src = item.imageData;
        imgEl.alt = item.name + ' QR Code';
    }
    modal.classList.add('show');
}

function closeQrModal() {
    const modal = document.getElementById('qrModal');
    modal.classList.remove('show');
}

function deleteQr(id) {
    const list = getQrList().filter(x => x.id !== id);
    saveQrList(list);
    renderQrList(document.getElementById('searchInput')?.value || '');
    showToast('QR removed', '🗑️');
    closeQrModal();
}

function addQr(name, imageData) {
    const list = getQrList();
    const id = 'qr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
    list.push({ id, name: name.trim(), imageData });
    saveQrList(list);
    renderQrList(document.getElementById('searchInput')?.value || '');
    showToast('QR saved: ' + name.trim(), '✅');
}

// Form submit: add new QR
document.getElementById('addQrForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('qrName');
    const fileInput = document.getElementById('qrFile');
    const name = nameInput?.value?.trim();
    const file = fileInput?.files?.[0];

    if (!name) {
        showToast('Please enter a name', '⚠️');
        return;
    }
    if (!file || !file.type.startsWith('image/')) {
        showToast('Please choose an image file', '⚠️');
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        addQr(name, reader.result);
        nameInput.value = '';
        fileInput.value = '';
    };
    reader.readAsDataURL(file);
});

// Modal close
document.getElementById('qrModalClose')?.addEventListener('click', closeQrModal);
document.getElementById('qrModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'qrModal') closeQrModal();
});

// Search filter
document.getElementById('searchInput')?.addEventListener('input', (e) => {
    renderQrList(e.target.value.trim());
});

// Initial render
renderQrList();
