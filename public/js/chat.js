import { api } from './modules/api.js';
import { socketManager } from './modules/socket.js';
import { webrtc } from './modules/webrtc.js';
import { ui } from './modules/ui.js';

let currentChatUser = null;
let allUsers = [];
let allGroups = [];
let currentSearchResults = [];
let currentChatType = 'private'; // 'private' or 'group'
let messageHistory = {};
let currentUserAvatarUrl = null;
let groupKeys = {}; // cache for decrypted group keys (ArrayBuffers)

const token = localStorage.getItem('token');
const currentUserId = parseInt(localStorage.getItem('userId'));
const currentUsername = localStorage.getItem('username');

if (!token || !currentUserId) {
    window.location.href = '/';
}

document.addEventListener('DOMContentLoaded', async () => {
    // Load encryption keys calling with username
    await secureEncryption.loadKeys(currentUsername);

    document.getElementById('currentUsername').textContent = currentUsername;

    await loadUserData();

    // Connect WebSocket
    socketManager.connect();

    // Set up WebRTC Listeners
    webrtc.setupListeners();

    await loadChats();
    await loadGroups();
    setupSearch();
    setupMessageForm();

    document.getElementById('avatarInput').addEventListener('change', handleAvatarUpload);

    // Setup Socket Listeners
    socketManager.on('receive-message', handleReceiveMessage);
    socketManager.on('receive-group-message', handleReceiveGroupMessage);
    socketManager.on('message-sent', async () => {
        await loadUserData();
        loadChats();
    });
    socketManager.on('message-error', (error) => {
        alert(error);
        loadUserData();
    });
    socketManager.on('users-online', (userIds) => {
        updateOnlineStatus(userIds);
    });
    socketManager.on('auth-error', () => {
        alert('Authentication failed. Please login again.');
        logout();
    });
});

async function handleReceiveMessage(data) {
    const decryptedMessage = await secureEncryption.decryptMessage(data.encryptedContent);
    const historyKey = `private_${data.fromUserId}`;
    if (!messageHistory[historyKey]) messageHistory[historyKey] = [];
    messageHistory[historyKey].push({ ...data, decryptedMessage, received: true });

    if (currentChatType === 'private' && currentChatUser && currentChatUser.id === data.fromUserId) {
        displayMessage({ ...data, decryptedMessage }, false);
        markAsRead(data.fromUserId);
    } else {
        loadChats();
    }
}

async function handleReceiveGroupMessage(data) {
    let decryptedMessage = '[Key pending...]';
    if (groupKeys[data.groupId]) {
        try {
            decryptedMessage = await secureEncryption.decryptWithGroupKey(data.encryptedContent, groupKeys[data.groupId]);
        } catch (e) {
            decryptedMessage = '[Decryption Failed]';
        }
    }

    const historyKey = `group_${data.groupId}`;
    if (!messageHistory[historyKey]) messageHistory[historyKey] = [];
    messageHistory[historyKey].push({ ...data, decryptedMessage, received: true });

    if (currentChatType === 'group' && currentChatUser && currentChatUser.id === data.groupId) {
        if (data.fromUserId !== currentUserId) {
            displayMessage({ ...data, decryptedMessage }, false);
        }
    } else {
        const groupIndex = allGroups.findIndex(g => g.id === data.groupId);
        if (groupIndex !== -1) {
            allGroups[groupIndex].unread_count = (allGroups[groupIndex].unread_count || 0) + 1;
            displayUsers();
        } else {
            loadGroups();
        }
    }
}

async function loadUserData() {
    try {
        const userData = await api.get('/api/user/me');
        ui.updateCredits(userData.credits);
        currentUserAvatarUrl = userData.avatar;
        ui.updateAvatar(userData.avatar, currentUsername);
    } catch (error) {
        console.error('Failed to load user data:', error);
        logout();
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
        const data = await api.postFormData('/api/user/avatar', formData);
        ui.updateAvatar(data.avatar, currentUsername);
        currentUserAvatarUrl = data.avatar;
        loadUserData();
    } catch (error) {
        alert('Error uploading avatar');
    }
}

async function loadChats() {
    try {
        allUsers = await api.get('/api/chats');
        ui.allUsersRef = allUsers; // share with UI module
        displayUsers();
    } catch (error) { }
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

        debounceTimer = setTimeout(async () => {
            try {
                const results = await api.get(`/api/users/search?q=${encodeURIComponent(query)}`);
                displaySearchResults(results, query);
            } catch (error) { }
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

    allGroups.forEach(group => {
        const item = document.createElement('div');
        item.className = 'user-item view-group-item';
        item.id = `group-item-${group.id}`;
        item.setAttribute('data-id', group.id);

        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        avatar.style.background = 'linear-gradient(135deg, var(--secondary), var(--primary))';
        avatar.textContent = (group.name || '?').charAt(0).toUpperCase();

        const details = document.createElement('div');
        details.className = 'user-details';
        details.innerHTML = `
            <div class="user-username">${group.name}</div>
            <div class="user-status">${group.unread_count > 0 ? `<span style="color: var(--primary); font-weight: bold;">${group.unread_count} new messages</span>` : (group.description || '')}</div>
        `;

        item.appendChild(avatar);
        item.appendChild(details);
        usersList.appendChild(item);
    });

    allUsers.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = 'user-item view-user-item';
        userItem.id = `user-item-${user.id}`;
        userItem.setAttribute('data-id', user.id);
        if (currentChatUser && currentChatUser.id === user.id && currentChatType === 'private') {
            userItem.classList.add('active');
        }

        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        if (user.avatar) {
            avatar.innerHTML = `<img src="${user.avatar}">`;
        } else {
            avatar.textContent = user.username.charAt(0).toUpperCase();
        }

        const details = document.createElement('div');
        details.className = 'user-details';

        let statusHtml = user.unread_count > 0
            ? `<span style="color: var(--primary); font-weight: bold;">${user.unread_count} new messages</span>`
            : `<span class="status-dot" data-user-id="${user.id}"></span><span>Offline</span>`;

        details.innerHTML = `
            <div class="user-username">${user.username}</div>
            <div class="user-status">${statusHtml}</div>
        `;

        userItem.appendChild(avatar);
        userItem.appendChild(details);
        usersList.appendChild(userItem);
    });

    updateListCount(allUsers.length + allGroups.length);
    updateOnlineStatus(socketManager.getOnlineUsers());
}

function displaySearchResults(results, query) {
    currentSearchResults = results;
    const usersList = document.getElementById('usersList');

    if (results.length === 0) {
        usersList.innerHTML = `<div class="loading">No users found for "${query}"</div>`;
        updateListCount(0);
        return;
    }

    usersList.innerHTML = '';
    results.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = 'user-item search-result-item';
        userItem.setAttribute('data-id', user.id);

        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        if (user.avatar) {
            avatar.innerHTML = `<img src="${user.avatar}">`;
        } else {
            avatar.textContent = user.username.charAt(0).toUpperCase();
        }

        const details = document.createElement('div');
        details.className = 'user-details';
        details.innerHTML = `<div class="user-username">${user.username}</div>`;

        userItem.appendChild(avatar);
        userItem.appendChild(details);
        usersList.appendChild(userItem);
    });

    updateListCount(results.length);
}

function updateListCount(count) {
    const onlineCountElement = document.getElementById('onlineCount');
    if (onlineCountElement) onlineCountElement.textContent = count;
}

function updateOnlineStatus(onlineUserIds) {
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

    if (currentChatUser) {
        const statusDot = document.querySelector('.chat-header .status-dot');
        const statusText = document.querySelector('.chat-header .encryption-status span:last-child');
        const statusContainer = document.querySelector('.chat-header .encryption-status');

        if (statusDot) {
            if (socketManager.getOnlineUsers().includes(currentChatUser.id)) {
                statusDot.classList.add('active');
                if (statusText) statusText.textContent = 'Online';
                if (statusContainer) statusContainer.style.color = 'var(--success)';
            } else {
                statusDot.classList.remove('active');
                if (statusText) statusText.textContent = 'Offline';
                if (statusContainer) statusContainer.style.color = 'var(--text-secondary)';
            }
        }
    }
}

async function openChat(user, element) {
    currentChatUser = user;
    currentChatType = 'private';
    webrtc.setCurrentUser(user);

    document.querySelector('.chat-container').classList.add('mobile-chat-active');
    document.querySelectorAll('.user-item').forEach(item => item.classList.remove('active'));
    if (element) {
        element.classList.add('active');
    } else {
        const item = document.getElementById(`user-item-${user.id}`);
        if (item) item.classList.add('active');
    }

    document.getElementById('chatWelcome').classList.add('hidden');
    document.getElementById('chatWindow').classList.remove('hidden');

    document.getElementById('chatUsername').textContent = user.username;
    document.getElementById('chatStatus').textContent = 'Encrypted';
    const chatAvatar = document.getElementById('chatAvatar');
    chatAvatar.innerHTML = user.avatar ? `<img src="${user.avatar}">` : user.username.charAt(0).toUpperCase();

    updateOnlineStatus(socketManager.getOnlineUsers());
    document.getElementById('groupInfoBtn').classList.add('hidden');
    document.getElementById('messagesContainer').innerHTML = '<div class="loading">Loading history...</div>';

    try {
        const messages = await api.get(`/api/messages/${user.id}`);
        const decryptedMessages = await Promise.all(messages.map(async (msg) => {
            try {
                const decrypted = await secureEncryption.decryptMessage(msg.encryptedContent);
                return { ...msg, decryptedMessage: decrypted };
            } catch (e) {
                return { ...msg, decryptedMessage: '[Decryption Failed]' };
            }
        }));

        messageHistory[`private_${user.id}`] = decryptedMessages;
        displayMessageHistory(`private_${user.id}`);
    } catch (error) {
        document.getElementById('messagesContainer').innerHTML = '<div class="error">Error loading history</div>';
    }
}

function displayMessageHistory(key) {
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.innerHTML = '';
    const history = messageHistory[key] || [];
    history.forEach(msg => displayMessage(msg, !msg.received));
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function displayMessage(data, isSent) {
    const messagesContainer = document.getElementById('messagesContainer');
    const username = isSent ? (localStorage.getItem('username') || 'Me') : data.fromUsername;
    const message = data.decryptedMessage || data.encryptedContent;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';

    let avatarUrl = null;
    if (isSent) {
        avatarUrl = currentUserAvatarUrl;
    } else {
        const sender = allUsers.find(u => u.username === username) || (currentChatType === 'group' ? null : currentChatUser);
        if (sender && sender.avatar) avatarUrl = sender.avatar;
    }

    if (avatarUrl) {
        avatar.innerHTML = `<img src="${avatarUrl}">`;
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
    const msgDate = data.created_at || data.timestamp ? new Date(data.created_at || data.timestamp) : new Date();
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
        // The provided "Code Edit" snippet for error handling in api.js
        // is not directly applicable here as this is an event listener,
        // not the api._fetch function.
        // Assuming the instruction meant to update the api.js file itself
        // to handle errors, and not to insert this code here.
        // Since api.js is not provided, I cannot modify it.
        // I will proceed with the original logic of the event listener.

        const message = messageInput.value.trim();
        if (!message) return;

        try {
            let encryptedContent;
            if (currentChatType === 'private') {
                const myPublicKeyString = await secureEncryption.exportPublicKey();
                encryptedContent = await secureEncryption.encryptMessage(
                    message,
                    currentChatUser.public_key,
                    myPublicKeyString
                );
                socketManager.send('send-message', {
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
                socketManager.send('send-group-message', {
                    groupId: currentChatUser.id,
                    encryptedContent
                });
            }

            const historyKey = `${currentChatType}_${currentChatUser.id}`;
            if (!messageHistory[historyKey]) messageHistory[historyKey] = [];

            const historyItem = {
                fromUsername: currentUsername,
                decryptedMessage: message,
                created_at: new Date().toISOString(),
                received: false
            };
            messageHistory[historyKey].push(historyItem);
            displayMessage(historyItem, true);
            messageInput.value = '';
        } catch (error) {
            alert('Failed to send message. Please try again.');
        }
    });
}

function closeChat() {
    currentChatUser = null;
    currentChatType = null;
    if (document.querySelector('.chat-container').classList.contains('mobile-chat-active')) {
        document.querySelector('.chat-container').classList.remove('mobile-chat-active');
    }
    document.getElementById('chatWindow').classList.add('hidden');
    document.getElementById('chatWelcome').classList.remove('hidden');
    document.querySelectorAll('.user-item').forEach(item => item.classList.remove('active'));
}

function closeMobileChat() {
    closeChat();
}

async function markAsRead(userId) {
    try {
        await api.post(`/api/messages/${userId}`, {}); // trigger read logic if exists or we could ignore
    } catch (e) { }
}

async function loadGroups() {
    try {
        allGroups = await api.get('/api/groups');
        displayUsers();
    } catch (error) { }
}

async function openGroupChat(group, element) {
    currentChatUser = group;
    currentChatType = 'group';
    webrtc.setCurrentUser(group);

    document.querySelector('.chat-container').classList.add('mobile-chat-active');
    document.querySelectorAll('.user-item').forEach(item => item.classList.remove('active'));
    if (element) {
        element.classList.add('active');
    } else {
        const item = document.getElementById(`group-item-${group.id}`);
        if (item) item.classList.add('active');
    }

    document.getElementById('chatWelcome').classList.add('hidden');
    document.getElementById('chatWindow').classList.remove('hidden');

    document.getElementById('chatUsername').textContent = group.name;
    const chatStatus = document.getElementById('chatStatus');
    chatStatus.textContent = 'Loading status...';

    const groupInList = allGroups.find(g => g.id === group.id);
    if (groupInList && groupInList.unread_count > 0) {
        groupInList.unread_count = 0;
        displayUsers();
        fetch(`/api/groups/${group.id}/read`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(err => { });
    }

    try {
        const status = await api.get(`/api/groups/${group.id}/status`);
        if (status.onlineCount > 0) {
            chatStatus.textContent = `${status.onlineCount} online`;
        } else {
            chatStatus.textContent = `${status.totalCount} members`;
        }
    } catch (e) {
        chatStatus.textContent = 'Group Chat';
    }

    const chatAvatar = document.getElementById('chatAvatar');
    chatAvatar.style.background = 'linear-gradient(135deg, var(--secondary), var(--primary))';
    chatAvatar.innerHTML = '';
    chatAvatar.textContent = group.name.charAt(0).toUpperCase();

    document.getElementById('groupInfoBtn').classList.remove('hidden');

    if (!groupKeys[group.id] && group.encrypted_group_key) {
        try {
            groupKeys[group.id] = await secureEncryption.decryptGroupKey(group.encrypted_group_key);
        } catch (e) { }
    }

    socketManager.send('join-group', group.id);

    try {
        const messages = await api.get(`/api/groups/${group.id}/messages`);
        const groupKey = groupKeys[group.id];
        messageHistory[`group_${group.id}`] = [];
        document.getElementById('messagesContainer').innerHTML = '';

        for (const msg of messages) {
            let decrypted = '[Encrypted]';
            if (groupKey) {
                try {
                    decrypted = await secureEncryption.decryptWithGroupKey(msg.encrypted_content, groupKey);
                } catch (e) {
                    decrypted = '[Decryption Failed]';
                }
            }

            const isSent = msg.from_user === currentUserId;
            displayMessage({ ...msg, decryptedMessage: decrypted }, isSent);

            messageHistory[`group_${group.id}`].push({
                ...msg,
                decryptedMessage: decrypted,
                received: !isSent
            });
        }
    } catch (error) { }
}

async function handleCreateGroup(e) {
    if (e) e.preventDefault();
    const name = document.getElementById('groupName').value.trim();
    const description = document.getElementById('groupDescription').value.trim();

    if (!name) return;

    try {
        const groupKeyBuffer = await secureEncryption.generateGroupKey();
        const myPublicKey = await secureEncryption.exportPublicKey();
        const encryptedGroupKey = await secureEncryption.encryptGroupKeyForMember(groupKeyBuffer, myPublicKey);

        await api.post('/api/groups', { name, description, encryptedGroupKey });

        document.getElementById('groupModal').classList.add('hidden');
        loadGroups();
        document.getElementById('createGroupForm').reset();
    } catch (error) {
        alert(error.message || 'Failed to create group');
    }
}

function showCreditModal() {
    document.getElementById('creditModal').classList.remove('hidden');
    loadTransactions();
}
function closeCreditModal() {
    document.getElementById('creditModal').classList.add('hidden');
}
function selectPackage(amount, event) {
    document.getElementById('creditAmount').value = amount;
    document.querySelectorAll('.package-card').forEach(card => card.classList.remove('selected'));
    if (event) {
        event.currentTarget.classList.add('selected');
    } else if (event && event.target) {
        event.target.closest('.package-card').classList.add('selected');
    }
}
function showCreateGroupModal() {
    document.getElementById('groupModal').classList.remove('hidden');
}
function closeCreateGroupModal() {
    document.getElementById('groupModal').classList.add('hidden');
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    window.location.href = '/';
}

async function loadTransactions() {
    try {
        const transactions = await api.get('/api/credits/transactions');
        displayTransactions(transactions);
    } catch (error) { }
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
        item.innerHTML = `
            <div class="transaction-info">
                <div class="transaction-amount">${transaction.amount} Credits</div>
                <div class="transaction-ref">Ref: ${transaction.transaction_ref || 'N/A'}</div>
            </div>
            <div class="transaction-status ${transaction.status}">${transaction.status}</div>
        `;
        transactionsList.appendChild(item);
    });
}

document.getElementById('creditRequestForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseInt(document.getElementById('creditAmount').value);
    const transactionRef = document.getElementById('transactionRef').value.trim();

    if (!transactionRef) return alert('Please enter a transaction reference');

    try {
        await api.post('/api/credits/request', { amount, transactionRef });
        alert('Credit request submitted successfully!');
        document.getElementById('transactionRef').value = '';
        loadTransactions();
    } catch (error) {
        alert('Connection error. Please try again.');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('creditModal').addEventListener('click', (e) => {
        if (e.target.id === 'creditModal') closeCreditModal();
    });

    document.getElementById('groupModal').addEventListener('click', (e) => {
        if (e.target.id === 'groupModal') closeCreateGroupModal();
    });

    const groupForm = document.getElementById('createGroupForm');
    if (groupForm) groupForm.addEventListener('submit', handleCreateGroup);

    const callBtn = document.getElementById('voiceCallBtn');
    if (callBtn) callBtn.onclick = () => webrtc.startVoiceCall();

    const groupCallBtn = document.getElementById('groupVoiceCallBtn'); // Ensure this button exists if starting group calls
    if (groupCallBtn) groupCallBtn.onclick = () => webrtc.startGroupVoiceCall();

    // Group call in chat header same as private call
    if (callBtn) {
        callBtn.onclick = () => {
            if (currentChatType === 'group') {
                webrtc.startGroupVoiceCall();
            } else {
                webrtc.startVoiceCall();
            }
        };
    }

    const hangupBtn = document.getElementById('hangupBtn');
    if (hangupBtn) hangupBtn.onclick = () => webrtc.endCall(true);

    const answerBtn = document.getElementById('answerBtn');
    if (answerBtn) answerBtn.onclick = () => webrtc.answerCall();

    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) muteBtn.onclick = () => webrtc.toggleMute();

    const deafenBtn = document.getElementById('deafenBtn');
    if (deafenBtn) deafenBtn.onclick = () => webrtc.toggleDeafen();

    document.getElementById('groupMembersModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'groupMembersModal') closeGroupMembers();
    });

    const usersList = document.getElementById('usersList');
    if (usersList) {
        usersList.addEventListener('click', (e) => {
            const searchResultItem = e.target.closest('.search-result-item');
            if (searchResultItem) {
                const userId = parseInt(searchResultItem.getAttribute('data-id'));
                const user = allUsers.find(u => u.id === userId) || currentSearchResults.find(u => u.id === userId);
                if (user) openChat(user, searchResultItem);
                return;
            }

            const userItem = e.target.closest('.view-user-item');
            if (userItem) {
                const userId = parseInt(userItem.getAttribute('data-id'));
                const user = allUsers.find(u => u.id === userId);
                if (user) openChat(user, userItem);
                return;
            }

            const groupItem = e.target.closest('.view-group-item');
            if (groupItem) {
                const groupId = parseInt(groupItem.getAttribute('data-id'));
                const group = allGroups.find(g => g.id === groupId);
                if (group) openGroupChat(group, groupItem);
                return;
            }
        });
    }

    setupMemberSearch();

    // Attach static UI listeners
    const btnChangeAvatar = document.getElementById('btnChangeAvatar');
    if (btnChangeAvatar) btnChangeAvatar.addEventListener('click', () => document.getElementById('avatarInput').click());

    const btnShowCreateGroup = document.getElementById('btnShowCreateGroup');
    if (btnShowCreateGroup) btnShowCreateGroup.addEventListener('click', showCreateGroupModal);

    const btnShowCredits = document.getElementById('btnShowCredits');
    if (btnShowCredits) btnShowCredits.addEventListener('click', showCreditModal);

    const btnChatLogout = document.getElementById('btnChatLogout');
    if (btnChatLogout) btnChatLogout.addEventListener('click', logout);

    const groupInfoBtn = document.getElementById('groupInfoBtn');
    if (groupInfoBtn) groupInfoBtn.addEventListener('click', showGroupMembers);

    const btnCloseChat = document.getElementById('btnCloseChat');
    if (btnCloseChat) btnCloseChat.addEventListener('click', closeChat);

    const btnCloseCreateGroupModal = document.getElementById('btnCloseCreateGroupModal');
    if (btnCloseCreateGroupModal) btnCloseCreateGroupModal.addEventListener('click', closeCreateGroupModal);

    const btnCloseGroupMembers = document.getElementById('btnCloseGroupMembers');
    if (btnCloseGroupMembers) btnCloseGroupMembers.addEventListener('click', closeGroupMembers);

    const btnCloseCreditModal = document.getElementById('btnCloseCreditModal');
    if (btnCloseCreditModal) btnCloseCreditModal.addEventListener('click', closeCreditModal);

    const creditPackagesContainer = document.querySelector('.credit-packages');
    if (creditPackagesContainer) {
        creditPackagesContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.package-card');
            if (card) {
                const amount = card.getAttribute('data-package');
                selectPackage(amount, e);
            }
        });
    }

    const groupMembersList = document.getElementById('groupMembersList');
    if (groupMembersList) {
        groupMembersList.addEventListener('click', (e) => {
            const btn = e.target.closest('.remove-member-btn');
            if (btn) {
                removeMemberFromGroup(btn.getAttribute('data-id'), btn.getAttribute('data-username'), btn.classList.contains('leave'));
            }
        });
    }

    const memberSearchResults = document.getElementById('memberSearchResults');
    if (memberSearchResults) {
        memberSearchResults.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-mini');
            if (btn) {
                addMemberToGroup(btn.getAttribute('data-id'), btn.getAttribute('data-username'), btn.getAttribute('data-public-key'));
            }
        });
    }
});

async function showGroupMembers() {
    if (!currentChatUser || currentChatType !== 'group') return;
    document.getElementById('groupMembersModal').classList.remove('hidden');
    document.getElementById('groupMembersTitle').textContent = `${currentChatUser.name} - Members`;
    try {
        const members = await api.get(`/api/groups/${currentChatUser.id}/members`);
        ui.groupCallMembersCacheRef = {};
        members.forEach(m => ui.groupCallMembersCacheRef[m.id] = m);
        displayGroupMembers(members);
    } catch (e) { }
}

function closeGroupMembers() {
    document.getElementById('groupMembersModal').classList.add('hidden');
}

function displayGroupMembers(members) {
    const list = document.getElementById('groupMembersList');
    list.innerHTML = '';
    const currentUserMember = members.find(m => m.id === currentUserId);
    const isAdmin = currentUserMember && currentUserMember.role === 'admin';

    members.forEach(member => {
        const item = document.createElement('div');
        item.className = 'user-item member-item';

        let avatarHtml = member.avatar ? `<img src="${member.avatar}">` : (member.username || '?').charAt(0).toUpperCase();

        const actionsHtml = member.id === currentUserId
            ? `<button class="remove-member-btn leave" title="Leave Group" data-id="${member.id}" data-username="${member.username}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg></button>`
            : isAdmin ? `<button class="remove-member-btn" title="Remove Member" data-id="${member.id}" data-username="${member.username}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>` : '';

        item.innerHTML = `
            <div class="user-avatar small">${avatarHtml}</div>
            <div class="member-details">
                <div class="user-username">${member.username}</div>
                <div class="user-role ${member.role === 'admin' ? 'admin' : ''}">${member.role}</div>
            </div>
            <div class="member-actions">${actionsHtml}</div>
        `;
        list.appendChild(item);
    });
}

async function removeMemberFromGroup(userId, username, isLeave = false) {
    if (!currentChatUser) return;
    if (!confirm(isLeave ? 'Are you sure you want to leave this group?' : `Are you sure you want to remove ${username} from the group?`)) return;

    try {
        await api.delete(`/api/groups/${currentChatUser.id}/members/${userId}`);
        if (isLeave) {
            closeChat();
            loadGroups();
            closeGroupMembers();
        } else {
            showGroupMembers();
        }
    } catch (e) {
        alert(e.message || 'Operation failed');
    }
}

function setupMemberSearch() {
    const searchInput = document.getElementById('memberSearchInput');
    if (!searchInput) return;

    searchInput.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) {
            document.getElementById('memberSearchResults').innerHTML = '';
            return;
        }
        try {
            const users = await api.get(`/api/users/search?q=${encodeURIComponent(query)}&excludeGroupId=${currentChatUser.id}`);
            if (users.length === 0) {
                document.getElementById('memberSearchResults').innerHTML = '<div style="padding: 10px; color: var(--text-secondary);">No users found.</div>';
            } else {
                displayMemberSearchResults(users);
            }
        } catch (error) { }
    });
}

function displayMemberSearchResults(users) {
    const results = document.getElementById('memberSearchResults');
    results.innerHTML = '';
    users.forEach(user => {
        if (user.id === currentUserId) return;
        const item = document.createElement('div');
        item.className = 'search-result-item';
        let avatarHtml = user.avatar ? `<img src="${user.avatar}">` : user.username.charAt(0).toUpperCase();
        item.innerHTML = `
            <div class="user-avatar small">${avatarHtml}</div>
            <span class="user-username">${user.username}</span>
            <button class="btn-mini" data-id="${user.id}" data-username="${user.username}" data-public-key="${user.public_key}">
                <svg style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add
            </button>
        `;
        results.appendChild(item);
    });
}

async function addMemberToGroup(userId, username, userPublicKey) {
    if (!currentChatUser) return;
    if (!userPublicKey) return alert(`${username} has not set up their encryption keys yet and cannot be added to an encrypted group.`);

    const groupKey = groupKeys[currentChatUser.id];
    if (!groupKey) return alert('You do not have the group key to invite others.');

    try {
        const encryptedGroupKey = await secureEncryption.encryptGroupKeyForMember(groupKey, userPublicKey);
        await api.post(`/api/groups/${currentChatUser.id}/members`, { userId, encryptedGroupKey });

        alert(`Added ${username} to group!`);
        document.getElementById('memberSearchInput').value = '';
        document.getElementById('memberSearchResults').innerHTML = '';
        showGroupMembers();
    } catch (e) {
        alert(e.message || 'Failed to add member');
    }
}