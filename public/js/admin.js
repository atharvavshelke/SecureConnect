import { adminApi } from './modules/adminApi.js';

let adminToken = null;

document.addEventListener('DOMContentLoaded', () => {
    adminToken = adminApi.getToken();

    if (adminToken) {
        verifyAdminToken();
    }

    // Setup login form
    document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);

    // Static Event Listeners
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) btnLogout.addEventListener('click', logout);

    const tabTransactions = document.getElementById('tabTransactions');
    if (tabTransactions) tabTransactions.addEventListener('click', (e) => showTab('transactions', e));

    const tabUsers = document.getElementById('tabUsers');
    if (tabUsers) tabUsers.addEventListener('click', (e) => showTab('users', e));

    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);

    const btnToggleSidebar = document.getElementById('btnToggleSidebar');
    if (btnToggleSidebar) btnToggleSidebar.addEventListener('click', toggleSidebar);

    const btnRefreshTransactions = document.getElementById('btnRefreshTransactions');
    if (btnRefreshTransactions) btnRefreshTransactions.addEventListener('click', loadPendingTransactions);

    const btnRefreshUsers = document.getElementById('btnRefreshUsers');
    if (btnRefreshUsers) btnRefreshUsers.addEventListener('click', loadUsers);

    // Event Delegation for dynamically populated lists
    document.getElementById('transactionsGrid').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');

        if (action === 'approve') approveTransaction(id);
        if (action === 'reject') rejectTransaction(id);
    });

    document.getElementById('usersTableBody').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');

        if (action === 'toggle-ban') {
            const shouldBan = btn.getAttribute('data-should-ban') === 'true';
            toggleBanUser(id, shouldBan);
        }
        if (action === 'delete') deleteUser(id);
    });
});

async function handleAdminLogin(e) {
    e.preventDefault();

    const username = document.getElementById('adminUsernameInput').value.trim();
    const password = document.getElementById('adminPasswordInput').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            if (!data.isAdmin) {
                showLoginError('Access denied. Admin credentials required.');
                return;
            }

            adminToken = data.token;
            localStorage.setItem('admin_token', adminToken);
            document.getElementById('adminUsername').textContent = data.username;

            showAdminPanel();
            loadPendingTransactions();
        } else {
            showLoginError(data.error || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        showLoginError('Connection error. Please try again.');
    }
}

function showLoginError(message) {
    const errorElement = document.getElementById('adminLoginError');
    errorElement.textContent = message;
    errorElement.classList.add('show');
    setTimeout(() => errorElement.classList.remove('show'), 5000);
}

async function verifyAdminToken() {
    try {
        const userData = await adminApi.get('/api/user/me');
        document.getElementById('adminUsername').textContent = userData.username;
        showAdminPanel();
        loadPendingTransactions();
    } catch (error) {
        console.error('Token verification failed:', error);
        localStorage.removeItem('admin_token');
        adminToken = null;
    }
}

function showAdminPanel() {
    document.getElementById('adminLogin').classList.add('hidden');
    document.getElementById('transactionsTab').classList.remove('hidden');
}

function showTab(tabName, event) {
    // Hide all tabs
    document.getElementById('transactionsTab').classList.add('hidden');
    document.getElementById('usersTab').classList.add('hidden');

    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Show selected tab
    if (tabName === 'transactions') {
        document.getElementById('transactionsTab').classList.remove('hidden');
        if (event) event.currentTarget.classList.add('active');
        loadPendingTransactions();
    } else if (tabName === 'users') {
        document.getElementById('usersTab').classList.remove('hidden');
        if (event) event.currentTarget.classList.add('active');
        loadUsers();
    }
}

async function loadPendingTransactions() {
    const grid = document.getElementById('transactionsGrid');
    grid.innerHTML = '<div class="loading">Loading transactions...</div>';

    try {
        const transactions = await adminApi.get('/api/admin/transactions/pending');
        displayTransactions(transactions);
        document.getElementById('pendingBadge').textContent = transactions.length;
    } catch (error) {
        console.error('Failed to load transactions:', error);
        grid.innerHTML = '<div class="loading">Failed to load transactions</div>';
    }
}

function displayTransactions(transactions) {
    const grid = document.getElementById('transactionsGrid');

    if (transactions.length === 0) {
        grid.innerHTML = '<div class="loading">No pending transactions</div>';
        return;
    }

    grid.innerHTML = '';

    transactions.forEach(transaction => {
        const card = document.createElement('div');
        card.className = 'transaction-card';

        card.innerHTML = `
            <div class="transaction-header">
                <div class="transaction-user">
                    <div class="user-name">${transaction.username}</div>
                    <div class="user-email">${transaction.email}</div>
                </div>
                <div class="transaction-id">#${transaction.id}</div>
            </div>
            
            <div class="transaction-details">
                <div class="detail-row">
                    <span class="detail-label">Amount:</span>
                    <span class="detail-value amount">${transaction.amount} Credits</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Reference:</span>
                </div>
                <div class="transaction-ref">${transaction.transaction_ref || 'N/A'}</div>
                <div class="detail-row">
                    <span class="detail-label">Date:</span>
                    <span class="detail-value">${new Date(transaction.created_at).toLocaleString()}</span>
                </div>
            </div>
            
            <div class="transaction-actions">
                <button class="action-btn btn-approve" data-action="approve" data-id="${transaction.id}">
                    Approve
                </button>
                <button class="action-btn btn-reject" data-action="reject" data-id="${transaction.id}">
                    Reject
                </button>
            </div>
        `;

        grid.appendChild(card);
    });
}

async function approveTransaction(transactionId) {
    if (!confirm('Approve this transaction and add credits to user account?')) return;

    try {
        await adminApi.post(`/api/admin/transactions/${transactionId}/approve`);
        alert('Transaction approved successfully!');
        loadPendingTransactions();
    } catch (error) {
        console.error('Failed to approve transaction:', error);
        alert('Failed to approve transaction');
    }
}

async function rejectTransaction(transactionId) {
    if (!confirm('Reject this transaction? This action cannot be undone.')) return;

    try {
        await adminApi.post(`/api/admin/transactions/${transactionId}/reject`);
        alert('Transaction rejected.');
        loadPendingTransactions();
    } catch (error) {
        console.error('Failed to reject transaction:', error);
        alert('Failed to reject transaction');
    }
}

async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="loading">Loading users...</td></tr>';

    try {
        const users = await adminApi.get('/api/admin/users');
        displayUsers(users);
    } catch (error) {
        console.error('Failed to load users:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Failed to load users</td></tr>';
    }
}

function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">No users registered yet</td></tr>';
        return;
    }

    tbody.innerHTML = '';

    users.forEach(user => {
        const row = document.createElement('tr');
        if (user.is_banned) {
            row.classList.add('banned-user');
        }

        row.innerHTML = `
            <td>${user.id}</td>
            <td>${user.username} ${user.is_banned ? '<span class="status-tag banned">BANNED</span>' : ''}</td>
            <td>${user.email}</td>
            <td><span class="credit-badge">${user.credits}</span></td>
            <td><span class="date-text">${new Date(user.created_at).toLocaleDateString()}</span></td>
            <td>
                <div class="user-actions">
                    <button class="action-btn-small ${user.is_banned ? 'btn-unban' : 'btn-ban'}" data-action="toggle-ban" data-id="${user.id}" data-should-ban="${!user.is_banned}">
                        ${user.is_banned ? 'Unban' : 'Ban'}
                    </button>
                    <button class="action-btn-small btn-delete" data-action="delete" data-id="${user.id}">
                        Delete
                    </button>
                </div>
            </td>
        `;

        tbody.appendChild(row);
    });
}

async function toggleBanUser(userId, shouldBan) {
    const action = shouldBan ? 'ban' : 'unban';
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;

    try {
        await adminApi.post(`/api/admin/users/${userId}/ban`, { ban: shouldBan });
        alert(`User ${action}ned successfully!`);
        loadUsers();
    } catch (error) {
        console.error(`Failed to ${action} user:`, error);
        alert(`Failed to ${action} user`);
    }
}

// Globals removed to respect CSP

async function deleteUser(userId) {
    if (!confirm('Are you sure you want to PERMANENTLY DELETE this user? This action cannot be undone.')) return;

    try {
        await adminApi.delete(`/api/admin/users/${userId}`);
        alert('User deleted successfully!');
        loadUsers();
    } catch (error) {
        console.error('Failed to delete user:', error);
        alert('Failed to delete user');
    }
}

async function logout() {
    if (adminToken) {
        try {
            await adminApi.post('/api/auth/logout');
        } catch (e) {
            console.error('Logout failed', e);
        }
    }
    localStorage.removeItem('admin_token');
    window.location.reload();
}

function toggleSidebar() {
    document.querySelector('.admin-sidebar').classList.toggle('open');
    document.querySelector('.sidebar-overlay').classList.toggle('open');
}

// Close sidebar when clicking a nav item on mobile
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        if (window.innerWidth <= 968) {
            toggleSidebar();
        }
    });
});
