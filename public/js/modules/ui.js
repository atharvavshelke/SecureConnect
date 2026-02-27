export const ui = {
    callTimerInterval: null,
    secondsActive: 0,

    // Maps dependencies for resolving users in UI 
    allUsersRef: [],
    groupCallMembersCacheRef: {},

    updateCredits(credits) {
        document.getElementById('creditsCount').textContent = credits;
    },

    updateAvatar(avatarPath, currentUsername) {
        const avatarContainer = document.getElementById('currentUserAvatar');
        if (avatarPath) {
            avatarContainer.innerHTML = `<img src="${avatarPath}" alt="Avatar">`;
        } else {
            avatarContainer.innerHTML = '';
            avatarContainer.textContent = currentUsername.charAt(0).toUpperCase();
        }
    },

    showIncomingCall(fromUsername) {
        document.getElementById('callOverlay').classList.remove('hidden');
        document.getElementById('callTargetName').textContent = fromUsername;
        document.getElementById('callStatus').textContent = 'Incoming Call...';
        document.getElementById('answerBtn').classList.remove('hidden');
        document.getElementById('groupCallParticipants').classList.add('hidden');
        document.getElementById('muteBtn').classList.add('hidden');
        document.getElementById('deafenBtn').classList.add('hidden');
    },

    showIncomingGroupCall(groupName, callerName) {
        document.getElementById('callOverlay').classList.remove('hidden');
        document.getElementById('callTargetName').textContent = `Group Call: ${groupName}`;
        document.getElementById('callStatus').textContent = `${callerName} is calling...`;
        document.getElementById('answerBtn').classList.remove('hidden');
        document.getElementById('groupCallParticipants').classList.add('hidden');
        document.getElementById('muteBtn').classList.add('hidden');
        document.getElementById('deafenBtn').classList.add('hidden');
    },

    showOutgoingCall(targetName) {
        document.getElementById('callOverlay').classList.remove('hidden');
        document.getElementById('callTargetName').textContent = targetName;
        document.getElementById('callStatus').textContent = 'Calling...';
        document.getElementById('answerBtn').classList.add('hidden');
        document.getElementById('muteBtn').classList.remove('hidden');
        document.getElementById('deafenBtn').classList.remove('hidden');
        document.getElementById('groupCallParticipants').classList.add('hidden');
    },

    showOutgoingGroupCall(groupName) {
        document.getElementById('callOverlay').classList.remove('hidden');
        document.getElementById('callTargetName').textContent = `Group Call: ${groupName}`;
        document.getElementById('callStatus').textContent = 'Joining...';
        document.getElementById('answerBtn').classList.add('hidden');
        document.getElementById('muteBtn').classList.remove('hidden');
        document.getElementById('deafenBtn').classList.remove('hidden');
        document.getElementById('groupCallParticipants').classList.remove('hidden');
        document.getElementById('groupCallParticipants').innerHTML = '';
    },

    setCallStatus(status) {
        document.getElementById('callStatus').textContent = status;
    },

    hideCallUI() {
        document.getElementById('callOverlay').classList.add('hidden');
        this.updateMuteUI(false);
        this.updateDeafenUI(false);
    },

    startCallTimer() {
        const timerElement = document.getElementById('callTimer');
        timerElement.classList.remove('hidden');
        this.secondsActive = 0;
        this.callTimerInterval = setInterval(() => {
            this.secondsActive++;
            const mins = Math.floor(this.secondsActive / 60).toString().padStart(2, '0');
            const secs = (this.secondsActive % 60).toString().padStart(2, '0');
            timerElement.textContent = `${mins}:${secs}`;
        }, 1000);
    },

    stopCallTimer() {
        clearInterval(this.callTimerInterval);
        document.getElementById('callTimer').classList.add('hidden');
    },

    updateMuteUI(isMuted) {
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
    },

    updateDeafenUI(isDeafened) {
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
    },

    addGroupParticipantUI(userId) {
        const container = document.getElementById('groupCallParticipants');
        const el = document.createElement('div');
        el.className = 'group-participant';
        el.id = `participant-ui-${userId}`;

        let username = 'User ' + userId;
        let avatarHtml = `<div class="user-avatar">${username.charAt(0).toUpperCase()}</div>`;

        let userRecord = this.groupCallMembersCacheRef[userId] || this.allUsersRef.find(u => u.id === userId);

        if (userRecord) {
            username = userRecord.username;
            if (userRecord.avatar) {
                avatarHtml = `<div class="user-avatar"><img src="${userRecord.avatar}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;"></div>`;
            } else {
                avatarHtml = `<div class="user-avatar">${username.charAt(0).toUpperCase()}</div>`;
            }
        }

        el.innerHTML = `
            ${avatarHtml}
            <div class="user-name" style="margin-top: 5px; font-weight: bold; color: white; text-shadow: 1px 1px 2px black;">${username}</div>
        `;
        container.appendChild(el);
    },

    removeGroupParticipantUI(userId) {
        const audioEl = document.getElementById(`audio-user-${userId}`);
        if (audioEl) audioEl.remove();

        const uiEl = document.getElementById(`participant-ui-${userId}`);
        if (uiEl) uiEl.remove();
    }
};
