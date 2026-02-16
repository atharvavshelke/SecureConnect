// Chat functionality with E2E encryption

let socket;
let currentChatUser = null;
let allUsers = [];
let onlineUsers = [];
let messageHistory = {};
let currentUserAvatarUrl = null;

// Check authentication
const token = localStorage.getItem('token');
const currentUserId = parseInt(localStorage.getItem('userId'));
const currentUsername = localStorage.getItem('username');

if (!token || !currentUserId) {
    window.location.href = '/';
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Load encryption keys calling with username
    await secureEncryption.loadKeys(currentUsername);

    // Display username
    document.getElementById('currentUsername').textContent = currentUsername;

    // Load user data
    await loadUserData();

    // Connect to WebSocket
    connectWebSocket();

    // Load chats
    await loadChats();

    // Setup search
    setupSearch();

    // Setup message form
    setupMessageForm();

    // Setup avatar upload
    document.getElementById('avatarInput').addEventListener('change', handleAvatarUpload);
});

async function loadUserData() {
    try {
        const response = await fetch('/api/user/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const userData = await response.json();
            updateCredits(userData.credits);
            updateAvatar(userData.avatar);
        } else {
            logout();
        }
    } catch (error) {
        console.error('Failed to load user data:', error);
    }
}

function updateCredits(credits) {
    document.getElementById('creditsCount').textContent = credits;
}

function updateAvatar(avatarPath) {
    currentUserAvatarUrl = avatarPath; // Store globally
    const avatarContainer = document.getElementById('currentUserAvatar');
    if (avatarPath) {
        console.log('Setting avatar path:', avatarPath);
        avatarContainer.innerHTML = `<img src="${avatarPath}" alt="Avatar" onerror="this.onerror=null; this.parentElement.textContent='${currentUsername.charAt(0).toUpperCase()}'; console.error('Failed to load avatar image');">`;
        // Clear text content not needed as innerHTML overwrites it, but if it fails, onerror restores it? 
        // actually onerror replaces the img with text? 
        // simpler: logic above handles it.
    } else {
        console.log('No avatar path, showing initials');
        avatarContainer.innerHTML = '';
        avatarContainer.textContent = currentUsername.charAt(0).toUpperCase();
    }
}

async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        alert('File is too large. Max 2MB.');
        return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    try {
        const response = await fetch('/api/user/avatar', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            updateAvatar(data.avatar);
            // Reload user data to sync everything
            loadUserData();
        } else {
            alert('Failed to upload avatar');
        }
    } catch (error) {
        console.error('Error uploading avatar:', error);
        alert('Error uploading avatar');
    }
}

function connectWebSocket() {
    socket = io({
        auth: {
            token: token
        }
    });

    socket.on('connect', () => {
        console.log('Connected to WebSocket');
        socket.emit('authenticate', token);
    });

    socket.on('authenticated', (data) => {
        console.log('Authenticated:', data);
    });

    socket.on('receive-message', async (data) => {
        // Decrypt and display message
        const decryptedMessage = await secureEncryption.decryptMessage(data.encryptedContent);

        // Add to message history
        if (!messageHistory[data.fromUserId]) {
            messageHistory[data.fromUserId] = [];
        }
        messageHistory[data.fromUserId].push({
            ...data,
            decryptedMessage,
            received: true
        });

        // Display if chatting with this user
        if (currentChatUser && currentChatUser.id === data.fromUserId) {
            displayMessage(data.fromUsername, decryptedMessage, false);
            // Mark as read immediately if chat is open? 
            // For now, reload chats to update order/unread count if not current
        }

        // Refresh chat list to show new message/counts
        loadChats();
    });

    socket.on('message-sent', async (data) => {
        // Reload credits and chat list (to move chat to top)
        await loadUserData();
        loadChats();
    });

    socket.on('message-error', (error) => {
        alert(error);
        loadUserData();
    });

    socket.on('users-online', (userIds) => {
        onlineUsers = userIds;
        updateOnlineStatus(userIds);
    });

    socket.on('auth-error', () => {
        alert('Authentication failed. Please login again.');
        logout();
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from WebSocket');
    });
}

async function loadChats() {
    try {
        const response = await fetch('/api/chats', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            allUsers = await response.json();
            displayUsers();
        }
    } catch (error) {
        console.error('Failed to load chats:', error);
    }
}

async function searchUsers(query) {
    try {
        const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const results = await response.json();
            displaySearchResults(results, query);
        }
    } catch (error) {
        console.error('Failed to search users:', error);
    }
}

function setupSearch() {
    const searchInput = document.getElementById('userSearch');
    let debounceTimer;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();

        if (query.length === 0) {
            loadChats();
            return;
        }

        debounceTimer = setTimeout(() => {
            searchUsers(query);
        }, 300);
    });
}

function displayUsers() {
    const usersList = document.getElementById('usersList');

    if (allUsers.length === 0) {
        usersList.innerHTML = '<div class="loading">No chats yet. Search to find users.</div>';
        return;
    }

    usersList.innerHTML = '';

    allUsers.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        if (currentChatUser && currentChatUser.id === user.id) {
            userItem.classList.add('active');
        }
        userItem.onclick = () => openChat(user);

        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        if (user.avatar) {
            const img = document.createElement('img');
            img.src = user.avatar;
            avatar.appendChild(img);
        } else {
            avatar.textContent = user.username.charAt(0).toUpperCase();
        }

        const details = document.createElement('div');
        details.className = 'user-details';

        const username = document.createElement('div');
        username.className = 'user-username';
        username.textContent = user.username;

        const status = document.createElement('div');
        status.className = 'user-status';

        let statusHtml = '';
        if (user.unread_count > 0) {
            statusHtml = `<span style="color: var(--primary); font-weight: bold;">${user.unread_count} new messages</span>`;
        } else {
            statusHtml = `
                <span class="status-dot" data-user-id="${user.id}"></span>
                <span>Offline</span>
            `;
        }
        status.innerHTML = statusHtml;

        details.appendChild(username);
        details.appendChild(status);
        userItem.appendChild(avatar);
        userItem.appendChild(details);
        usersList.appendChild(userItem);
    });

    // Refresh online status
    updateOnlineStatus(onlineUsers);
}

function displaySearchResults(results, query) {
    const usersList = document.getElementById('usersList');

    if (results.length === 0) {
        usersList.innerHTML = `<div class="loading">No users found for "${query}"</div>`;
        return;
    }

    usersList.innerHTML = '';

    results.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.onclick = () => openChat(user);

        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        if (user.avatar) {
            const img = document.createElement('img');
            img.src = user.avatar;
            avatar.appendChild(img);
        } else {
            avatar.textContent = user.username.charAt(0).toUpperCase();
        }

        const details = document.createElement('div');
        details.className = 'user-details';

        const username = document.createElement('div');
        username.className = 'user-username';
        username.textContent = user.username;

        details.appendChild(username);
        userItem.appendChild(avatar);
        userItem.appendChild(details);
        usersList.appendChild(userItem);
    });
}

function updateOnlineStatus(onlineUserIds) {
    document.getElementById('onlineCount').textContent = onlineUserIds.length;

    // Update status dots
    document.querySelectorAll('.status-dot').forEach(dot => {
        const userId = parseInt(dot.getAttribute('data-user-id'));
        if (onlineUserIds.includes(userId)) {
            dot.classList.add('active');
            dot.nextElementSibling.textContent = 'Online';
        } else {
            dot.classList.remove('active');
            dot.nextElementSibling.textContent = 'Offline';
        }
    });

    // Update header status if current chat user is affected
    if (currentChatUser) {
        updateHeaderStatus(currentChatUser);
    }
}

function updateHeaderStatus(user) {
    const statusDot = document.querySelector('.chat-header .status-dot');
    const statusText = document.querySelector('.chat-header .encryption-status span:last-child');
    const statusContainer = document.querySelector('.chat-header .encryption-status');

    if (onlineUsers.includes(user.id)) {
        statusDot.classList.add('active');
        statusText.textContent = 'Online';
        statusContainer.style.color = 'var(--success)';
    } else {
        statusDot.classList.remove('active');
        statusText.textContent = 'Offline';
        statusContainer.style.color = 'var(--text-secondary)';
    }
}

async function openChat(user) {
    currentChatUser = user;

    // Mobile: Show chat view
    document.querySelector('.chat-container').classList.add('mobile-chat-active');

    // Update active state
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget.classList.add('active');

    // Show chat window
    document.getElementById('chatWelcome').classList.add('hidden');
    document.getElementById('chatWindow').classList.remove('hidden');

    // Update chat header
    document.getElementById('chatUsername').textContent = user.username;
    const chatAvatar = document.getElementById('chatAvatar');
    if (user.avatar) {
        chatAvatar.innerHTML = `<img src="${user.avatar}" alt="Avatar">`;
    } else {
        chatAvatar.innerHTML = '';
        chatAvatar.innerHTML = '';
        chatAvatar.textContent = user.username.charAt(0).toUpperCase();
    }

    // Update status in header
    updateHeaderStatus(user);


    // Clear existing messages while loading
    document.getElementById('messagesContainer').innerHTML = '<div class="loading">Loading history...</div>';

    try {
        // Fetch message history
        const response = await fetch(`/api/messages/${user.id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const messages = await response.json();

            // Decrypt messages
            const decryptedMessages = await Promise.all(messages.map(async (msg) => {
                try {
                    const decrypted = await secureEncryption.decryptMessage(msg.encryptedContent);
                    return {
                        ...msg,
                        decryptedMessage: decrypted
                    };
                } catch (e) {
                    console.error('Failed to decrypt message:', e);
                    return {
                        ...msg,
                        decryptedMessage: '[Decryption Failed]'
                    };
                }
            }));

            // Update message history
            messageHistory[user.id] = decryptedMessages;

            // Display messages
            displayMessageHistory(user.id);
        } else {
            console.error('Failed to load message history');
            document.getElementById('messagesContainer').innerHTML = '<div class="error">Failed to load history</div>';
        }
    } catch (error) {
        console.error('Error loading history:', error);
        document.getElementById('messagesContainer').innerHTML = '<div class="error">Error loading history</div>';
    }
}

function displayMessageHistory(userId) {
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.innerHTML = '';

    const history = messageHistory[userId] || [];
    history.forEach(msg => {
        displayMessage(
            msg.received ? msg.fromUsername : currentUsername,
            msg.decryptedMessage,
            !msg.received
        );
    });

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function displayMessage(username, message, isSent) {
    const messagesContainer = document.getElementById('messagesContainer');

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';

    // Find the avatar URL for the user (sender)
    let avatarUrl = null;
    if (isSent) {
        // Current user
        avatarUrl = currentUserAvatarUrl;
    } else {
        // Other user - from allUsers or currentChatUser
        const sender = allUsers.find(u => u.username === username) || currentChatUser;
        if (sender && sender.avatar) avatarUrl = sender.avatar;
    }

    if (avatarUrl) {
        const img = document.createElement('img');
        img.src = avatarUrl;
        avatar.appendChild(img);
    } else {
        avatar.textContent = username.charAt(0).toUpperCase();
    }

    const content = document.createElement('div');
    content.className = 'message-content';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = message;

    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    content.appendChild(bubble);
    content.appendChild(time);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    messagesContainer.appendChild(messageDiv);

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function setupMessageForm() {
    const messageForm = document.getElementById('messageForm');
    const messageInput = document.getElementById('messageInput');

    messageForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentChatUser) {
            alert('Please select a user to chat with');
            return;
        }

        const message = messageInput.value.trim();
        if (!message) return;

        try {
            // Get my public key for self-encryption
            const myPublicKeyString = await secureEncryption.exportPublicKey();

            // Encrypt message with recipient's public key AND my public key
            const encryptedContent = await secureEncryption.encryptMessage(
                message,
                currentChatUser.public_key,
                myPublicKeyString
            );

            // Send via WebSocket
            socket.emit('send-message', {
                toUserId: currentChatUser.id,
                encryptedContent
            });

            // Store in local history
            if (!messageHistory[currentChatUser.id]) {
                messageHistory[currentChatUser.id] = [];
            }
            messageHistory[currentChatUser.id].push({
                fromUsername: currentUsername,
                decryptedMessage: message,
                received: false
            });

            // Display message
            displayMessage(currentUsername, message, true);

            // Clear input
            messageInput.value = '';
        } catch (error) {
            console.error('Failed to send message:', error);
            alert('Failed to send message. Please try again.');
        }
    });
}

function closeChat() {
    currentChatUser = null;

    // Check if on mobile and handle accordingly
    if (document.querySelector('.chat-container').classList.contains('mobile-chat-active')) {
        document.querySelector('.chat-container').classList.remove('mobile-chat-active');
    }

    document.getElementById('chatWindow').classList.add('hidden');
    document.getElementById('chatWelcome').classList.remove('hidden');

    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
    });
}

function closeMobileChat() {
    document.querySelector('.chat-container').classList.remove('mobile-chat-active');
    closeChat();
}

// Credit modal functions
function showCreditModal() {
    document.getElementById('creditModal').classList.remove('hidden');
    loadTransactions();
}

function closeCreditModal() {
    document.getElementById('creditModal').classList.add('hidden');
}

function selectPackage(amount) {
    document.getElementById('creditAmount').value = amount;

    // Update selected state
    document.querySelectorAll('.package-card').forEach(card => {
        card.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
}

async function loadTransactions() {
    try {
        const response = await fetch('/api/credits/transactions', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const transactions = await response.json();
            displayTransactions(transactions);
        }
    } catch (error) {
        console.error('Failed to load transactions:', error);
    }
}

function displayTransactions(transactions) {
    const transactionsList = document.getElementById('transactionsList');

    if (transactions.length === 0) {
        transactionsList.innerHTML = '<div class="loading">No transactions yet</div>';
        return;
    }

    transactionsList.innerHTML = '';

    transactions.forEach(transaction => {
        const item = document.createElement('div');
        item.className = 'transaction-item';

        const info = document.createElement('div');
        info.className = 'transaction-info';

        const amount = document.createElement('div');
        amount.className = 'transaction-amount';
        amount.textContent = `${transaction.amount} Credits`;

        const ref = document.createElement('div');
        ref.className = 'transaction-ref';
        ref.textContent = `Ref: ${transaction.transaction_ref || 'N/A'}`;

        info.appendChild(amount);
        info.appendChild(ref);

        const status = document.createElement('div');
        status.className = `transaction-status ${transaction.status}`;
        status.textContent = transaction.status;

        item.appendChild(info);
        item.appendChild(status);
        transactionsList.appendChild(item);
    });
}

document.getElementById('creditRequestForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const amount = parseInt(document.getElementById('creditAmount').value);
    const transactionRef = document.getElementById('transactionRef').value.trim();

    if (!transactionRef) {
        alert('Please enter a transaction reference');
        return;
    }

    try {
        const response = await fetch('/api/credits/request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ amount, transactionRef })
        });

        if (response.ok) {
            alert('Credit request submitted successfully! Waiting for admin approval.');
            document.getElementById('transactionRef').value = '';
            loadTransactions();
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to submit request');
        }
    } catch (error) {
        console.error('Failed to submit credit request:', error);
        alert('Connection error. Please try again.');
    }
});

function logout() {
    // Only remove session data, keep keys!
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    // localStorage.removeItem('username'); // Keep username for convenience? No, remove it.
    // keys are stored as 'secureconnect_private_key_USERNAME', so they persist safely.

    window.location.href = '/';
}

// Close modal on outside click
document.getElementById('creditModal').addEventListener('click', (e) => {
    if (e.target.id === 'creditModal') {
        closeCreditModal();
    }
});
