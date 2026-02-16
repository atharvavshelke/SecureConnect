// Admin Panel JavaScript

let adminToken = null;

document.addEventListener('DOMContentLoaded', () => {
    // Check if admin is already logged in
    adminToken = localStorage.getItem('admin_token');

    if (adminToken) {
        verifyAdminToken();
    }

    // Setup login form
    document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);
});

async function handleAdminLogin(e) {
    e.preventDefault();

    const username = document.getElementById('adminUsernameInput').value.trim();
    const password = document.getElementById('adminPasswordInput').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
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

    setTimeout(() => {
        errorElement.classList.remove('show');
    }, 5000);
}

async function verifyAdminToken() {
    try {
        const response = await fetch('/api/user/me', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (response.ok) {
            const userData = await response.json();
            document.getElementById('adminUsername').textContent = userData.username;
            showAdminPanel();
            loadPendingTransactions();
        } else {
            localStorage.removeItem('admin_token');
            adminToken = null;
        }
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

function showTab(tabName) {
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
        event.currentTarget.classList.add('active');
        loadPendingTransactions();
    } else if (tabName === 'users') {
        document.getElementById('usersTab').classList.remove('hidden');
        event.currentTarget.classList.add('active');
        loadUsers();
    }
}

async function loadPendingTransactions() {
    const grid = document.getElementById('transactionsGrid');
    grid.innerHTML = '<div class="loading">Loading transactions...</div>';

    try {
        const response = await fetch('/api/admin/transactions/pending', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (response.ok) {
            const transactions = await response.json();
            displayTransactions(transactions);

            // Update badge
            document.getElementById('pendingBadge').textContent = transactions.length;
        } else {
            grid.innerHTML = '<div class="loading">Failed to load transactions</div>';
        }
    } catch (error) {
        console.error('Failed to load transactions:', error);
        grid.innerHTML = '<div class="loading">Connection error</div>';
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
                <button class="action-btn btn-approve" onclick="approveTransaction(${transaction.id})">
                    Approve
                </button>
                <button class="action-btn btn-reject" onclick="rejectTransaction(${transaction.id})">
                    Reject
                </button>
            </div>
        `;

        grid.appendChild(card);
    });
}

async function approveTransaction(transactionId) {
    if (!confirm('Approve this transaction and add credits to user account?')) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/transactions/${transactionId}/approve`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (response.ok) {
            alert('Transaction approved successfully!');
            loadPendingTransactions();
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to approve transaction');
        }
    } catch (error) {
        console.error('Failed to approve transaction:', error);
        alert('Connection error. Please try again.');
    }
}

async function rejectTransaction(transactionId) {
    if (!confirm('Reject this transaction? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/transactions/${transactionId}/reject`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (response.ok) {
            alert('Transaction rejected.');
            loadPendingTransactions();
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to reject transaction');
        }
    } catch (error) {
        console.error('Failed to reject transaction:', error);
        alert('Connection error. Please try again.');
    }
}

async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="loading">Loading users...</td></tr>';

    try {
        const response = await fetch('/api/admin/users', {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });

        if (response.ok) {
            const users = await response.json();
            displayUsers(users);
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="loading">Failed to load users</td></tr>';
        }
    } catch (error) {
        console.error('Failed to load users:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Connection error</td></tr>';
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

        row.innerHTML = `
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>${user.email}</td>
            <td><span class="credit-badge">${user.credits}</span></td>
            <td><span class="date-text">${new Date(user.created_at).toLocaleDateString()}</span></td>
        `;

        tbody.appendChild(row);
    });
}

function logout() {
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
