// Chat functionality with E2E encryption

let socket;
let currentChatUser = null;
let allUsers = [];
let allGroups = [];
let currentChatType = 'private'; // 'private' or 'group'
let onlineUsers = [];
let messageHistory = {};
let currentUserAvatarUrl = null;
let localStream;
let isCalling = false;
let callTimer;
let secondsActive = 0;
let groupKeys = {}; // cache for decrypted group keys (ArrayBuffers)
let iceCandidateQueue = [];

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

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
        const historyKey = `private_${data.fromUserId}`;
        if (!messageHistory[historyKey]) {
            messageHistory[historyKey] = [];
        }
        messageHistory[historyKey].push({
            ...data,
            decryptedMessage,
            received: true
        });

        // Display
        if (currentChatType === 'private' && currentChatUser && currentChatUser.id === data.fromUserId) {
            displayMessage({
                ...data,
                decryptedMessage
            }, false);
            markAsRead(data.fromUserId);
        } else {
            // Update unread count in sidebar (already handled by loadChats periodically, but could be real-time)
            loadChats();
        }
    });

    socket.on('receive-group-message', async (data) => {
        // Decrypt and display message
        let decryptedMessage;
        if (groupKeys[data.groupId]) {
            try {
                decryptedMessage = await secureEncryption.decryptWithGroupKey(data.encryptedContent, groupKeys[data.groupId]);
            } catch (e) {
                decryptedMessage = '[Decryption Failed - Key Error]';
            }
        } else {
            decryptedMessage = '[Key pending...]';
        }

        // Add to message history
        const historyKey = `group_${data.groupId}`;
        if (!messageHistory[historyKey]) {
            messageHistory[historyKey] = [];
        }
        messageHistory[historyKey].push({
            ...data,
            decryptedMessage,
            received: true
        });

        if (currentChatType === 'group' && currentChatUser && currentChatUser.id === data.groupId) {
            // Only display if not me (prevent double display)
            if (data.fromUserId !== parseInt(localStorage.getItem('userId'))) {
                displayMessage({
                    ...data,
                    decryptedMessage: decryptedMessage
                }, false);
            }
        } else {
            // Update sidebar unread count
            const groupIndex = allGroups.findIndex(g => g.id === data.groupId);
            if (groupIndex !== -1) {
                allGroups[groupIndex].unread_count = (allGroups[groupIndex].unread_count || 0) + 1;
                displayUsers();
            } else {
                loadGroups();
            }
        }
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

    // --- Voice Calling Listeners ---
    socket.on('incoming-call', (data) => {
        // data: { fromUserId, fromUsername, offer, type }
        if (isCalling) {
            socket.emit('call-response', { toUserId: data.fromUserId, accepted: false });
            return;
        }

        currentCallType = 'private';
        window.incomingCallData = data;
        document.getElementById('callOverlay').classList.remove('hidden');
        document.getElementById('callTargetName').textContent = data.fromUsername;
        document.getElementById('callStatus').textContent = 'Incoming Call...';
        document.getElementById('answerBtn').classList.remove('hidden');
        document.getElementById('groupCallParticipants').classList.add('hidden');

        // Hide mute/deafen initially until answered
        document.getElementById('muteBtn').classList.add('hidden');
        document.getElementById('deafenBtn').classList.add('hidden');
    });

    socket.on('incoming-group-call', (data) => {
        if (isCalling) return;

        currentCallType = 'group';
        currentGroupCallId = data.groupId;
        window.incomingCallData = data;

        document.getElementById('callOverlay').classList.remove('hidden');
        document.getElementById('callTargetName').textContent = `Group Call: ${data.groupName}`;
        document.getElementById('callStatus').textContent = `${data.fromUsername} is calling...`;
        document.getElementById('answerBtn').classList.remove('hidden');
        document.getElementById('groupCallParticipants').classList.add('hidden');

        document.getElementById('muteBtn').classList.add('hidden');
        document.getElementById('deafenBtn').classList.add('hidden');
    });

    socket.on('call-answered', async (data) => {
        if (currentCallType !== 'private') return;

        if (data.accepted) {
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                await processIceCandidateQueue();
                startCallTimer();
                document.getElementById('callStatus').textContent = 'Connected';
            } catch (err) {
                console.error("Error setting remote description:", err);
                endCall();
            }
        } else {
            alert('Call declined');
            endCall();
        }
    });

    socket.on('ice-candidate', async (data) => {
        if (currentCallType !== 'private') return;

        if (peerConnection && peerConnection.remoteDescription) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
                console.error('Error adding received ice candidate', e);
            }
        } else {
            iceCandidateQueue.push(data.candidate);
        }
    });

    // --- Mesh Networking Listeners ---
    socket.on('group-call-participants', async (data) => {
        if (currentCallType !== 'group' || data.groupId !== currentGroupCallId) return;

        // Emitted after we join. We must create an offer for every existing participant
        for (const participantId of data.participants) {
            if (participantId !== parseInt(localStorage.getItem('userId'))) {
                await initiateGroupPeerConnection(participantId);
            }
        }

        startCallTimer();
        document.getElementById('callStatus').textContent = 'Connected to Group';
    });

    socket.on('user-joined-group-call', (data) => {
        if (currentCallType !== 'group' || data.groupId !== currentGroupCallId) return;
        // Wait for them to send us an offer
        console.log(`${data.username} joined the call`);
    });

    socket.on('user-left-group-call', (data) => {
        if (currentCallType !== 'group' || data.groupId !== currentGroupCallId) return;
        removeGroupPeerConnection(data.userId);
    });

    socket.on('group-call-offer', async (data) => {
        if (currentCallType !== 'group' || data.groupId !== currentGroupCallId) return;
        await handleGroupOffer(data.fromUserId, data.offer);
    });

    socket.on('group-call-answer', async (data) => {
        if (currentCallType !== 'group' || data.groupId !== currentGroupCallId) return;
        await handleGroupAnswer(data.fromUserId, data.answer);
    });

    socket.on('group-ice-candidate', async (data) => {
        if (currentCallType !== 'group' || data.groupId !== currentGroupCallId) return;
        await handleGroupIceCandidate(data.fromUserId, data.candidate);
    });

    socket.on('call-error', (msg) => {
        alert(msg);
        endCall();
    });

    socket.on('call-ended', () => {
        console.log('Call ended by peer');
        endCall(false); // End call locally without emitting again
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

    if (allUsers.length === 0 && allGroups.length === 0) {
        usersList.innerHTML = '<div class="loading">No chats or groups yet.</div>';
        updateListCount(0);
        return;
    }

    usersList.innerHTML = '';

    // Render Groups first
    allGroups.forEach(group => {
        const item = document.createElement('div');
        item.className = 'user-item';
        item.id = `group-item-${group.id}`;
        item.onclick = (e) => openGroupChat(group, e.currentTarget);

        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        avatar.style.background = 'linear-gradient(135deg, var(--secondary), var(--primary))';
        avatar.textContent = (group.name || '?').charAt(0).toUpperCase();

        const details = document.createElement('div');
        details.className = 'user-details';

        const name = document.createElement('div');
        name.className = 'user-username';
        name.textContent = group.name;

        const desc = document.createElement('div');
        desc.className = 'user-status';
        if (group.unread_count > 0) {
            desc.innerHTML = `<span style="color: var(--primary); font-weight: bold;">${group.unread_count} new messages</span>`;
        } else {
            desc.textContent = group.description || '';
        }

        details.appendChild(name);
        details.appendChild(desc);
        item.appendChild(avatar);
        item.appendChild(details);
        usersList.appendChild(item);
    });

    // Render Users
    allUsers.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.id = `user-item-${user.id}`;
        if (currentChatUser && currentChatUser.id === user.id && currentChatType === 'private') {
            userItem.classList.add('active');
        }
        userItem.onclick = (e) => openChat(user, e.currentTarget);

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

    updateListCount(allUsers.length + allGroups.length);

    // Refresh online status
    updateOnlineStatus(onlineUsers);
}

function displaySearchResults(results, query) {
    const usersList = document.getElementById('usersList');

    if (results.length === 0) {
        usersList.innerHTML = `<div class="loading">No users found for "${query}"</div>`;
        updateListCount(0);
        return;
    }

    usersList.innerHTML = '';

    results.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.onclick = (e) => openChat(user, e.currentTarget);

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

    updateListCount(results.length);
}

function updateListCount(count) {
    const onlineCountElement = document.getElementById('onlineCount');
    if (onlineCountElement) {
        onlineCountElement.textContent = count;
    }
}

function updateOnlineStatus(onlineUserIds) {
    // Online count is no longer shown globally in the header, now per list item

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

async function openChat(user, element) {
    currentChatUser = user;
    currentChatType = 'private';

    // Mobile: Show chat view
    document.querySelector('.chat-container').classList.add('mobile-chat-active');

    // Update active state
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
    });
    if (element) {
        element.classList.add('active');
    } else {
        const item = document.getElementById(`user-item-${user.id}`);
        if (item) item.classList.add('active');
    }

    // Show chat window
    document.getElementById('chatWelcome').classList.add('hidden');
    document.getElementById('chatWindow').classList.remove('hidden');

    // Update chat header
    document.getElementById('chatUsername').textContent = user.username;
    document.getElementById('chatStatus').textContent = 'Encrypted';
    const chatAvatar = document.getElementById('chatAvatar');
    chatAvatar.innerHTML = user.avatar ? `<img src="${user.avatar}">` : user.username.charAt(0).toUpperCase();

    // Update status in header
    updateHeaderStatus(user);

    // Show/Hide buttons
    document.getElementById('groupInfoBtn').classList.add('hidden');


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
            const historyKey = `private_${user.id}`;
            messageHistory[historyKey] = decryptedMessages;

            // Display messages
            displayMessageHistory(`private_${user.id}`);
        } else {
            console.error('Failed to load message history');
            document.getElementById('messagesContainer').innerHTML = '<div class="error">Failed to load history</div>';
        }
    } catch (error) {
        console.error('Error loading history:', error);
        document.getElementById('messagesContainer').innerHTML = '<div class="error">Error loading history</div>';
    }
}

function displayMessageHistory(key) {
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.innerHTML = '';

    const history = messageHistory[key] || [];
    history.forEach(msg => {
        displayMessage(msg, !msg.received);
    });

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function displayMessage(data, isSent) {
    const messagesContainer = document.getElementById('messagesContainer');
    const username = isSent ? (localStorage.getItem('username') || 'Me') : data.fromUsername;
    const message = data.decryptedMessage || data.encryptedContent; // Fallback to content if not decrypted

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';

    // Find the avatar URL for the user (sender)
    let avatarUrl = null;
    if (isSent) {
        avatarUrl = currentUserAvatarUrl;
    } else {
        const sender = allUsers.find(u => u.username === username) || (currentChatType === 'group' ? null : currentChatUser);
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
    const msgDate = data.created_at ? new Date(data.created_at) : new Date();
    time.textContent = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    content.appendChild(bubble);
    content.appendChild(time);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    messagesContainer.appendChild(messageDiv);

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
            let encryptedContent;
            if (currentChatType === 'private') {
                // Get my public key for self-encryption
                const myPublicKeyString = await secureEncryption.exportPublicKey();

                // Encrypt message with recipient's public key AND my public key
                encryptedContent = await secureEncryption.encryptMessage(
                    message,
                    currentChatUser.public_key,
                    myPublicKeyString
                );

                // Send via WebSocket
                socket.emit('send-message', {
                    toUserId: currentChatUser.id,
                    encryptedContent
                });
            } else if (currentChatType === 'group') {
                const groupKey = groupKeys[currentChatUser.id];
                if (!groupKey) {
                    alert('Group key not found. You may not have access to this group\'s E2EE.');
                    return;
                }

                encryptedContent = await secureEncryption.encryptWithGroupKey(message, groupKey);

                socket.emit('send-group-message', {
                    groupId: currentChatUser.id,
                    encryptedContent: encryptedContent
                });
            }


            // Store in local history
            const historyKey = `${currentChatType}_${currentChatUser.id}`;
            if (!messageHistory[historyKey]) {
                messageHistory[historyKey] = [];
            }
            const historyItem = {
                fromUsername: currentUsername,
                decryptedMessage: message,
                created_at: new Date().toISOString(),
                received: false
            };
            messageHistory[historyKey].push(historyItem);

            // Display message
            displayMessage(historyItem, true);

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
    currentChatType = null;

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

// Group Modal outside click listener
document.getElementById('groupModal').addEventListener('click', (e) => {
    if (e.target.id === 'groupModal') {
        closeCreateGroupModal();
    }
});

// --- Group & Calling UI State ---

function showCreateGroupModal() {
    document.getElementById('groupModal').classList.remove('hidden');
}

function closeCreateGroupModal() {
    document.getElementById('groupModal').classList.add('hidden');
}

async function handleCreateGroup(e) {
    if (e) e.preventDefault();
    const name = document.getElementById('groupName').value.trim();
    const description = document.getElementById('groupDescription').value.trim();

    if (!name) return;

    try {
        // E2EE: Generate Group Key
        const groupKeyBuffer = await secureEncryption.generateGroupKey();
        const myPublicKey = await secureEncryption.exportPublicKey();
        const encryptedGroupKey = await secureEncryption.encryptGroupKeyForMember(groupKeyBuffer, myPublicKey);

        const response = await fetch('/api/groups', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ name, description, encryptedGroupKey })
        });

        if (response.ok) {
            closeCreateGroupModal();
            loadGroups();
            document.getElementById('createGroupForm').reset();
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to create group');
        }
    } catch (error) {
        console.error('Error creating group:', error);
    }
}

async function loadGroups() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch('/api/groups', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            allGroups = await response.json();
            displayUsers(); // Re-render main list
        }
    } catch (error) {
        console.error('Failed to load groups:', error);
    }
}

async function openGroupChat(group, element) {
    currentChatUser = group;
    currentChatType = 'group';
    const chatWindow = document.getElementById('chatWindow');
    const chatWelcome = document.getElementById('chatWelcome');
    const chatUsername = document.getElementById('chatUsername');
    const chatAvatar = document.getElementById('chatAvatar');

    // Mobile: Show chat view
    document.querySelector('.chat-container').classList.add('mobile-chat-active');

    // Update active state
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
    });
    if (element) {
        element.classList.add('active');
    } else {
        const item = document.getElementById(`group-item-${group.id}`);
        if (item) item.classList.add('active');
    }

    chatWelcome.classList.add('hidden');
    chatWindow.classList.remove('hidden');

    chatUsername.textContent = group.name;
    const chatStatus = document.getElementById('chatStatus');
    chatStatus.textContent = 'Loading status...';

    // Update unread count locally and mark as read on server
    const groupInList = allGroups.find(g => g.id === group.id);
    if (groupInList && groupInList.unread_count > 0) {
        groupInList.unread_count = 0;
        displayUsers();
        fetch(`/api/groups/${group.id}/read`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(err => console.error('Failed to mark group as read:', err));
    }

    // Fetch group status
    fetch(`/api/groups/${group.id}/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
        .then(res => res.json())
        .then(status => {
            if (status.onlineCount > 0) {
                chatStatus.textContent = `${status.onlineCount} online`;
            } else {
                chatStatus.textContent = `${status.totalCount} members`;
            }
        })
        .catch(() => {
            chatStatus.textContent = 'Group Chat';
        });

    chatAvatar.style.background = 'linear-gradient(135deg, var(--secondary), var(--primary))';
    chatAvatar.textContent = group.name.charAt(0).toUpperCase();

    // Show/Hide buttons
    document.getElementById('groupInfoBtn').classList.remove('hidden');

    // Decrypt group key if not cached
    if (!groupKeys[group.id] && group.encrypted_group_key) {
        try {
            groupKeys[group.id] = await secureEncryption.decryptGroupKey(group.encrypted_group_key);
        } catch (e) {
            console.error('Failed to decrypt group key:', e);
        }
    }

    // Join socket room
    socket.emit('join-group', group.id);

    // Load history
    try {
        const response = await fetch(`/api/groups/${group.id}/messages`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            const messages = await response.json();
            const container = document.getElementById('messagesContainer');
            container.innerHTML = '';

            const groupKey = groupKeys[group.id];

            for (const msg of messages) {
                let decrypted = '[Encrypted]';
                if (groupKey) {
                    try {
                        decrypted = await secureEncryption.decryptWithGroupKey(msg.encrypted_content, groupKey);
                    } catch (e) {
                        decrypted = '[Decryption Failed]';
                    }
                }

                const isSent = msg.from_user === parseInt(localStorage.getItem('userId'));
                displayMessage({
                    ...msg,
                    decryptedMessage: decrypted
                }, isSent);
            }

            // Update message history
            const historyKey = `group_${group.id}`;
            messageHistory[historyKey] = messages.map(msg => {
                const isSent = msg.from_user === parseInt(localStorage.getItem('userId'));
                return {
                    ...msg,
                    decryptedMessage: '[History Decrypted]', // Simplified for now since we displayed them
                    received: !isSent
                };
            });
        }
    } catch (error) {
        console.error('Failed to load group history:', error);
    }
}

let currentCallType = null; // 'private' or 'group'
let currentGroupCallId = null;

// Private call vars
let peerConnection;
let remoteStream;

// Group call vars
let groupPeerConnections = {}; // userId -> RTCPeerConnection
let groupIceQueues = {}; // userId -> []
let groupCallHasHadParticipants = false;
let groupCallMembersCache = {}; // Cache to quickly lookup avatars

// UI State
let isMuted = false;
let isDeafened = false;
let callCreditDeducted = false;

async function processIceCandidateQueue() {
    if (currentCallType !== 'private' || !peerConnection || !peerConnection.remoteDescription) return;
    console.log(`Processing ${iceCandidateQueue.length} queued ICE candidates`);
    while (iceCandidateQueue.length > 0) {
        const candidate = iceCandidateQueue.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error('Error adding queued ice candidate', e);
        }
    }
}

async function processGroupIceCandidateQueue(userId) {
    const pc = groupPeerConnections[userId];
    const queue = groupIceQueues[userId] || [];

    if (!pc || !pc.remoteDescription) return;

    while (queue.length > 0) {
        const candidate = queue.shift();
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error('Error adding queued group ice candidate', e);
        }
    }
}

async function startVoiceCall() {
    if (!currentChatUser) return;

    if (currentChatType === 'group') {
        return startGroupVoiceCall();
    }

    if (isCalling) return;

    try {
        isCalling = true;
        currentCallType = 'private';
        callCreditDeducted = false;

        const callOverlay = document.getElementById('callOverlay');
        const callTargetName = document.getElementById('callTargetName');
        const callStatus = document.getElementById('callStatus');
        const answerBtn = document.getElementById('answerBtn');

        callOverlay.classList.remove('hidden');
        callTargetName.textContent = currentChatUser.username;
        callStatus.textContent = 'Calling...';
        answerBtn.classList.add('hidden');

        document.getElementById('muteBtn').classList.remove('hidden');
        document.getElementById('deafenBtn').classList.remove('hidden');
        document.getElementById('groupCallParticipants').classList.add('hidden');

        if (!window.RTCPeerConnection) {
            alert('Your browser does not support WebRTC (calling feature).');
            isCalling = false;
            callOverlay.classList.add('hidden');
            return;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (window.isSecureContext === false) {
                alert('Call feature requires a secure connection (HTTPS or localhost). Please access the site via HTTPS.');
            } else {
                alert('Your browser does not support microphone access.');
            }
            isCalling = false;
            callOverlay.classList.add('hidden');
            return;
        }

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                alert('Microphone access denied. Please allow microphone permissions in your browser settings.');
            } else {
                alert('Could not access microphone: ' + err.message);
            }
            throw err;
        }

        peerConnection = new RTCPeerConnection(configuration);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.oniceconnectionstatechange = () => {
            if (peerConnection.iceConnectionState === 'connected' && !callCreditDeducted) {
                // Deduct credit only on establishing a connect and only for the caller mapping to 1 outgoing attempt
                socket.emit('call-connected', { toUserId: currentChatUser.id });
                callCreditDeducted = true;
            }
            if (peerConnection.iceConnectionState === 'disconnected' ||
                peerConnection.iceConnectionState === 'failed' ||
                peerConnection.iceConnectionState === 'closed') {
                endCall();
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', {
                    toUserId: currentChatUser.id,
                    candidate: event.candidate
                });
            }
        };

        peerConnection.ontrack = (event) => {
            remoteStream = event.streams[0];
            const audio = document.getElementById('remoteAudio');
            audio.srcObject = remoteStream;
            audio.play().catch(e => console.error('Error playing remote audio:', e));
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Offer is sent, but we don't have remote description yet.
        // processIceCandidateQueue will be called in 'call-answered' listener once we set remoteDescription.

        socket.emit('call-request', {
            toUserId: currentChatUser.id,
            type: 'voice',
            offer: offer
        });

    } catch (error) {
        console.error('Call failed:', error);
        if (error.name !== 'NotAllowedError' && error.name !== 'PermissionDeniedError' && !error.message.includes('secure connection')) {
            alert('Could not start call: ' + error.message);
        }
        endCall();
    }
}

async function startGroupVoiceCall() {
    if (isCalling) return;

    try {
        isCalling = true;
        currentCallType = 'group';
        currentGroupCallId = currentChatUser.id;
        callCreditDeducted = false;

        const callOverlay = document.getElementById('callOverlay');
        const callTargetName = document.getElementById('callTargetName');
        const callStatus = document.getElementById('callStatus');
        const answerBtn = document.getElementById('answerBtn');

        callOverlay.classList.remove('hidden');
        callTargetName.textContent = `Group Call: ${currentChatUser.name}`;
        callStatus.textContent = 'Joining...';
        answerBtn.classList.add('hidden');

        document.getElementById('muteBtn').classList.remove('hidden');
        document.getElementById('deafenBtn').classList.remove('hidden');
        document.getElementById('groupCallParticipants').classList.remove('hidden');
        document.getElementById('groupCallParticipants').innerHTML = '';

        if (!window.RTCPeerConnection || !navigator.mediaDevices) {
            alert('WebRTC/Microphone not supported.');
            endCall();
            return;
        }

        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Broadcast ring to others in the group
        socket.emit('group-call-request', { groupId: currentGroupCallId });

        // Fetch group members to cache avatars for UI
        fetch(`/api/groups/${currentGroupCallId}/members`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
            .then(res => res.ok ? res.json() : [])
            .then(members => {
                members.forEach(m => {
                    groupCallMembersCache[m.id] = m;
                });
            })
            .catch(err => console.error("Could not fetch group members for cache", err));

        // Join the active mesh
        socket.emit('join-group-call', { groupId: currentGroupCallId });

        // Deduct 1 credit for starting a group call
        socket.emit('call-connected', { groupId: currentGroupCallId });
        callCreditDeducted = true;

    } catch (error) {
        console.error('Group call failed:', error);
        alert('Could not start group call.');
        endCall();
    }
}

async function answerCall() {
    const data = window.incomingCallData;
    if (!data) return;

    if (currentCallType === 'group') {
        return answerGroupCall(data);
    }

    try {
        isCalling = true;
        const answerBtn = document.getElementById('answerBtn');
        answerBtn.classList.add('hidden');
        document.getElementById('callStatus').textContent = 'Connecting...';

        if (!window.RTCPeerConnection) {
            alert('Could not answer call: Your browser does not support WebRTC.');
            socket.emit('call-response', { toUserId: data.fromUserId, accepted: false });
            endCall();
            return;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Could not answer call: Secure connection (HTTPS) required for microphone access.');
            socket.emit('call-response', { toUserId: data.fromUserId, accepted: false });
            endCall();
            return;
        }

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                alert('Microphone access denied. Please allow microphone permissions in your browser settings.');
            } else {
                alert('Could not access microphone: ' + err.message);
            }
            socket.emit('call-response', { toUserId: data.fromUserId, accepted: false });
            endCall();
            return;
        }

        peerConnection = new RTCPeerConnection(configuration);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', {
                    toUserId: data.fromUserId,
                    candidate: event.candidate
                });
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            if (peerConnection.iceConnectionState === 'disconnected' ||
                peerConnection.iceConnectionState === 'failed' ||
                peerConnection.iceConnectionState === 'closed') {
                endCall();
            }
        };

        peerConnection.ontrack = (event) => {
            remoteStream = event.streams[0];
            const audio = document.getElementById('remoteAudio');
            audio.srcObject = remoteStream;
            audio.play().catch(e => console.error('Error playing remote audio:', e));
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('call-response', {
            toUserId: data.fromUserId,
            accepted: true,
            answer: answer
        });

        await processIceCandidateQueue();
        startCallTimer();
        isCalling = true;

    } catch (error) {
        console.error('Failed to answer call:', error);
        socket.emit('call-response', { toUserId: data.fromUserId, accepted: false });
        endCall();
    }
}

async function answerGroupCall(data) {
    try {
        isCalling = true;
        callCreditDeducted = false;
        const answerBtn = document.getElementById('answerBtn');
        answerBtn.classList.add('hidden');
        document.getElementById('callStatus').textContent = 'Connecting to Group...';

        document.getElementById('muteBtn').classList.remove('hidden');
        document.getElementById('deafenBtn').classList.remove('hidden');
        document.getElementById('groupCallParticipants').classList.remove('hidden');
        document.getElementById('groupCallParticipants').innerHTML = '';

        if (!navigator.mediaDevices) {
            endCall();
            return;
        }

        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Fetch group members to cache avatars for UI
        fetch(`/api/groups/${data.groupId}/members`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
            .then(res => res.ok ? res.json() : [])
            .then(members => {
                members.forEach(m => {
                    groupCallMembersCache[m.id] = m;
                });
            })
            .catch(err => console.error("Could not fetch group members for cache", err));

        socket.emit('join-group-call', { groupId: data.groupId });

        // Deduct 1 credit for joining a group call
        socket.emit('call-connected', { groupId: data.groupId });
        callCreditDeducted = true;

    } catch (err) {
        endCall();
    }
}

// --- Group Mesh Core Logic ---
async function createGroupPeerConnection(userId) {
    groupCallHasHadParticipants = true;
    const pc = new RTCPeerConnection(configuration);
    groupPeerConnections[userId] = pc;
    groupIceQueues[userId] = [];

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('group-ice-candidate', {
                toUserId: userId,
                groupId: currentGroupCallId,
                candidate: event.candidate
            });
        }
    };

    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
            removeGroupPeerConnection(userId);
        }
    };

    pc.ontrack = (event) => {
        let audioElement = document.getElementById(`audio-user-${userId}`);
        if (!audioElement) {
            audioElement = document.createElement('audio');
            audioElement.id = `audio-user-${userId}`;
            audioElement.autoplay = true;
            document.getElementById('audioContainer').appendChild(audioElement);

            // Add UI representation
            addParticipantUI(userId);
        }
        audioElement.srcObject = event.streams[0];
        if (isDeafened) {
            audioElement.volume = 0;
        } else {
            audioElement.volume = 1;
        }
    };

    return pc;
}

async function initiateGroupPeerConnection(userId) {
    const pc = await createGroupPeerConnection(userId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit('group-call-offer', {
        toUserId: userId,
        groupId: currentGroupCallId,
        offer: offer
    });
}

async function handleGroupOffer(fromUserId, offer) {
    let pc = groupPeerConnections[fromUserId];
    if (!pc) {
        pc = await createGroupPeerConnection(fromUserId);
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('group-call-answer', {
        toUserId: fromUserId,
        groupId: currentGroupCallId,
        answer: answer
    });

    await processGroupIceCandidateQueue(fromUserId);
}

async function handleGroupAnswer(fromUserId, answer) {
    const pc = groupPeerConnections[fromUserId];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await processGroupIceCandidateQueue(fromUserId);
    }
}

async function handleGroupIceCandidate(fromUserId, candidate) {
    const pc = groupPeerConnections[fromUserId];
    if (pc && pc.remoteDescription) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error(e);
        }
    } else {
        if (!groupIceQueues[fromUserId]) groupIceQueues[fromUserId] = [];
        groupIceQueues[fromUserId].push(candidate);
    }
}

function removeGroupPeerConnection(userId) {
    const pc = groupPeerConnections[userId];
    if (pc) {
        pc.close();
        delete groupPeerConnections[userId];
    }
    delete groupIceQueues[userId];

    const audioEl = document.getElementById(`audio-user-${userId}`);
    if (audioEl) audioEl.remove();

    const uiEl = document.getElementById(`participant-ui-${userId}`);
    if (uiEl) uiEl.remove();

    if (currentCallType === 'group' && groupCallHasHadParticipants) {
        if (Object.keys(groupPeerConnections).length === 0) {
            console.log("Last participant left, ending group call automatically.");
            endCall(true);
        }
    }
}

function addParticipantUI(userId) {
    const container = document.getElementById('groupCallParticipants');
    const el = document.createElement('div');
    el.className = 'group-participant';
    el.id = `participant-ui-${userId}`;

    // Attempt to lookup username and avatar
    let username = 'User ' + userId;
    let avatarHtml = `<div class="user-avatar">${username.charAt(0).toUpperCase()}</div>`;

    // Check our dedicated group member cache first, then fallback to allUsers
    let userRecord = groupCallMembersCache[userId] || allUsers.find(u => u.id === userId);

    if (userRecord) {
        username = userRecord.username;
        if (userRecord.avatar) {
            avatarHtml = `<div class="user-avatar"><img src="${userRecord.avatar}" alt="${username}'s avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;"></div>`;
        } else {
            avatarHtml = `<div class="user-avatar">${username.charAt(0).toUpperCase()}</div>`;
        }
    }

    el.innerHTML = `
        ${avatarHtml}
        <div class="user-name" style="margin-top: 5px; font-weight: bold; color: white; text-shadow: 1px 1px 2px black;">${username}</div>
    `;
    container.appendChild(el);
}

// --- End ---

function endCall(notifyPeer = true) {
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (peerConnection) peerConnection.close();

    // Notify peer before clearing state
    if (notifyPeer) {
        const targetUserId = currentChatUser?.id || window.incomingCallData?.fromUserId;
        if (targetUserId && currentCallType === 'private') {
            socket.emit('call-ended', { toUserId: targetUserId });
        } else if (currentGroupCallId && currentCallType === 'group') {
            socket.emit('leave-group-call', { groupId: currentGroupCallId });
        }
    }

    peerConnection = null;
    localStream = null;
    remoteStream = null;
    isCalling = false;
    currentCallType = null;
    currentGroupCallId = null;
    iceCandidateQueue = [];
    stopCallTimer();

    // Clear all group peer connections
    for (const userId in groupPeerConnections) {
        removeGroupPeerConnection(userId);
    }
    groupPeerConnections = {};
    groupIceQueues = {};
    groupCallHasHadParticipants = false;
    groupCallMembersCache = {};

    isMuted = false;
    isDeafened = false;

    document.getElementById('callOverlay').classList.add('hidden');
    window.incomingCallData = null;
    updateMuteUI(); // Reset mute/deafen UI
    updateDeafenUI();
}

function startCallTimer() {
    const timerElement = document.getElementById('callTimer');
    const statusElement = document.getElementById('callStatus');
    timerElement.classList.remove('hidden');
    statusElement.textContent = 'On Call';

    secondsActive = 0;
    callTimer = setInterval(() => {
        secondsActive++;
        const mins = Math.floor(secondsActive / 60).toString().padStart(2, '0');
        const secs = (secondsActive % 60).toString().padStart(2, '0');
        timerElement.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopCallTimer() {
    clearInterval(callTimer);
    document.getElementById('callTimer').classList.add('hidden');
}

async function showGroupMembers() {
    if (!currentChatUser || currentChatType !== 'group') return;

    document.getElementById('groupMembersModal').classList.remove('hidden');
    document.getElementById('groupMembersTitle').textContent = `${currentChatUser.name} - Members`;

    loadGroupMembers();
}

function closeGroupMembers() {
    document.getElementById('groupMembersModal').classList.add('hidden');
}

async function loadGroupMembers() {
    try {
        const response = await fetch(`/api/groups/${currentChatUser.id}/members`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            const members = await response.json();
            displayGroupMembers(members);
        }
    } catch (error) {
        console.error('Failed to load members:', error);
    }
}

function displayGroupMembers(members) {
    const list = document.getElementById('groupMembersList');
    list.innerHTML = '';

    const currentUserId = parseInt(localStorage.getItem('userId'));
    const currentUserMember = members.find(m => m.id === currentUserId);
    const isAdmin = currentUserMember && currentUserMember.role === 'admin';

    members.forEach(member => {
        const item = document.createElement('div');
        item.className = 'user-item member-item';

        const avatar = document.createElement('div');
        avatar.className = 'user-avatar small';
        if (member.avatar) {
            avatar.innerHTML = `<img src="${member.avatar}">`;
        } else {
            avatar.textContent = (member.username || '?').charAt(0).toUpperCase();
        }

        const details = document.createElement('div');
        details.className = 'member-details';

        const name = document.createElement('div');
        name.className = 'user-username';
        name.textContent = member.username;

        const role = document.createElement('div');
        role.className = 'user-role';
        role.textContent = member.role;
        if (member.role === 'admin') role.classList.add('admin');

        details.appendChild(name);
        details.appendChild(role);

        item.appendChild(avatar);
        item.appendChild(details);

        const actions = document.createElement('div');
        actions.className = 'member-actions';

        if (member.id === currentUserId) {
            const leaveBtn = document.createElement('button');
            leaveBtn.className = 'remove-member-btn leave';
            leaveBtn.title = 'Leave Group';
            leaveBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
            `;
            leaveBtn.onclick = () => removeMemberFromGroup(member.id, member.username, true);
            actions.appendChild(leaveBtn);
        } else if (isAdmin) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-member-btn';
            removeBtn.title = 'Remove Member';
            removeBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            `;
            removeBtn.onclick = () => removeMemberFromGroup(member.id, member.username, false);
            actions.appendChild(removeBtn);
        }

        item.appendChild(actions);
        list.appendChild(item);
    });
}

async function removeMemberFromGroup(userId, username, isLeave = false) {
    if (!currentChatUser) return;

    const confirmMsg = isLeave ?
        'Are you sure you want to leave this group?' :
        `Are you sure you want to remove ${username} from the group?`;

    if (!confirm(confirmMsg)) return;

    try {
        const response = await fetch(`/api/groups/${currentChatUser.id}/members/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            if (isLeave) {
                closeChat();
                loadGroups();
                closeGroupMembers();
            } else {
                loadGroupMembers();
                // Optionally notify via socket if we had a member-removed event
            }
        } else {
            const data = await response.json();
            alert(data.error || 'Operation failed');
        }
    } catch (error) {
        console.error('Failed to remove member:', error);
    }
}

// Member search logic (moved to initialization)
async function setupMemberSearch() {
    const searchInput = document.getElementById('memberSearchInput');
    if (!searchInput) return;

    searchInput.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) {
            document.getElementById('memberSearchResults').innerHTML = '';
            return;
        }

        try {
            const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}&excludeGroupId=${currentChatUser.id}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            if (response.ok) {
                const users = await response.json();
                if (users.length === 0) {
                    document.getElementById('memberSearchResults').innerHTML = '<div style="padding: 10px; color: var(--text-secondary);">No users found.</div>';
                } else {
                    displayMemberSearchResults(users);
                }
            }
        } catch (error) {
            console.error('Search failed:', error);
        }
    });
}

function displayMemberSearchResults(users) {
    const results = document.getElementById('memberSearchResults');
    results.innerHTML = '';

    users.forEach(user => {
        if (user.id === parseInt(localStorage.getItem('userId'))) return;

        const item = document.createElement('div');
        item.className = 'search-result-item';

        const avatar = document.createElement('div');
        avatar.className = 'user-avatar small';
        if (user.avatar) {
            avatar.innerHTML = `<img src="${user.avatar}">`;
        } else {
            avatar.textContent = user.username.charAt(0).toUpperCase();
        }

        const nameSpan = document.createElement('span');
        nameSpan.className = 'user-username';
        nameSpan.textContent = user.username;

        const addBtn = document.createElement('button');
        addBtn.className = 'btn-mini';
        addBtn.innerHTML = `
            <svg style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add
        `;
        addBtn.onclick = () => addMemberToGroup(user.id, user.username, user.public_key);

        item.appendChild(avatar);
        item.appendChild(nameSpan);
        item.appendChild(addBtn);
        results.appendChild(item);
    });
}

async function addMemberToGroup(userId, username, userPublicKey) {
    if (!currentChatUser) return;

    if (!userPublicKey) {
        alert(`${username} has not set up their encryption keys yet and cannot be added to an encrypted group.`);
        return;
    }

    const groupKey = groupKeys[currentChatUser.id];
    if (!groupKey) {
        alert('You do not have the group key to invite others.');
        return;
    }

    try {
        // Re-encrypt group key for the new member
        const encryptedGroupKey = await secureEncryption.encryptGroupKeyForMember(groupKey, userPublicKey);

        const response = await fetch(`/api/groups/${currentChatUser.id}/members`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ userId, encryptedGroupKey })
        });

        if (response.ok) {
            alert(`Added ${username} to group!`);
            document.getElementById('memberSearchInput').value = '';
            document.getElementById('memberSearchResults').innerHTML = '';
            loadGroupMembers();
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to add member');
        }
    } catch (error) {
        console.error('Add member error:', error);
    }
}

// Initialize listeners
setTimeout(() => {
    const groupForm = document.getElementById('createGroupForm');
    if (groupForm) groupForm.addEventListener('submit', handleCreateGroup);

    const callBtn = document.getElementById('voiceCallBtn');
    if (callBtn) callBtn.onclick = startVoiceCall;

    const hangupBtn = document.getElementById('hangupBtn');
    if (hangupBtn) hangupBtn.onclick = () => endCall(true);

    const answerBtn = document.getElementById('answerBtn');
    if (answerBtn) answerBtn.onclick = answerCall;

    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) muteBtn.onclick = toggleMute;

    const deafenBtn = document.getElementById('deafenBtn');
    if (deafenBtn) deafenBtn.onclick = toggleDeafen;

    // Group Modal outside click
    document.getElementById('groupMembersModal').addEventListener('click', (e) => {
        if (e.target.id === 'groupMembersModal') {
            closeGroupMembers();
        }
    });

    setupMemberSearch();
    loadGroups();
}, 100);

function toggleMute() {
    isMuted = !isMuted;
    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            track.enabled = !isMuted;
        });
    }
    updateMuteUI();
}

function updateMuteUI() {
    const muteIcon = document.getElementById('muteIcon');
    const btn = document.getElementById('muteBtn');
    if (isMuted) {
        btn.classList.add('disabled');
        muteIcon.innerHTML = `
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
        `;
    } else {
        btn.classList.remove('disabled');
        muteIcon.innerHTML = `
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
        `;
    }
}

function toggleDeafen() {
    isDeafened = !isDeafened;

    // Private Call Audio
    const privateAudio = document.getElementById('remoteAudio');
    if (privateAudio) {
        privateAudio.volume = isDeafened ? 0 : 1;
    }

    // Group Call Audios
    document.querySelectorAll('audio[id^="audio-user-"]').forEach(el => {
        el.volume = isDeafened ? 0 : 1;
    });

    updateDeafenUI();
}

function updateDeafenUI() {
    const deafenIcon = document.getElementById('deafenIcon');
    const btn = document.getElementById('deafenBtn');
    if (isDeafened) {
        btn.classList.add('disabled');
        deafenIcon.innerHTML = `
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M23 9a11.05 11.05 0 0 1-2.07 7.93"></path>
            <path d="M19.07 4.93A10.06 10.06 0 0 1 20.35 12"></path>
        `;
    } else {
        btn.classList.remove('disabled');
        deafenIcon.innerHTML = `
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
        `;
    }
}