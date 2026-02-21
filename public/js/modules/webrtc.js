import { socketManager } from './socket.js';
import { ui } from './ui.js';

let peerConnection;
let localStream;
let remoteStream;
let isCalling = false;
let currentCallType = null;
let currentGroupCallId = null;
let currentChatUser = null;

let groupPeerConnections = {};
let groupIceQueues = {};
let groupCallHasHadParticipants = false;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

let iceCandidateQueue = [];

// Track mute/deafen locally so UI can be consistent
export let isMuted = false;
export let isDeafened = false;

export const webrtc = {
    setCurrentUser(user) {
        currentChatUser = user;
    },

    getCurrentCallType() {
        return currentCallType;
    },

    getCurrentGroupCallId() {
        return currentGroupCallId;
    },

    setupListeners() {
        socketManager.on('incoming-call', (data) => {
            if (isCalling) {
                socketManager.send('call-response', { toUserId: data.fromUserId, accepted: false });
                return;
            }
            currentCallType = 'private';
            window.incomingCallData = data;
            ui.showIncomingCall(data.fromUsername);
        });

        socketManager.on('incoming-group-call', (data) => {
            if (isCalling) return;
            currentCallType = 'group';
            currentGroupCallId = data.groupId;
            window.incomingCallData = data;
            ui.showIncomingGroupCall(data.groupName, data.fromUsername);
        });

        socketManager.on('call-answered', async (data) => {
            if (currentCallType !== 'private') return;
            if (data.accepted) {
                try {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                    await this.processIceCandidateQueue();
                    ui.startCallTimer();
                    ui.setCallStatus('Connected');
                } catch (err) {
                    this.endCall();
                }
            } else {
                alert('Call declined');
                this.endCall();
            }
        });

        socketManager.on('ice-candidate', async (data) => {
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

        // Mesh Networking
        socketManager.on('group-call-participants', async (data) => {
            if (currentCallType !== 'group' || data.groupId !== currentGroupCallId) return;
            const currentUserId = parseInt(localStorage.getItem('userId'));
            for (const participantId of data.participants) {
                if (participantId !== currentUserId) {
                    await this.initiateGroupPeerConnection(participantId);
                }
            }
            ui.startCallTimer();
            ui.setCallStatus('Connected to Group');
        });

        socketManager.on('user-left-group-call', (data) => {
            if (currentCallType !== 'group' || data.groupId !== currentGroupCallId) return;
            this.removeGroupPeerConnection(data.userId);
        });

        socketManager.on('group-call-offer', async (data) => {
            if (currentCallType !== 'group' || data.groupId !== currentGroupCallId) return;
            await this.handleGroupOffer(data.fromUserId, data.offer);
        });

        socketManager.on('group-call-answer', async (data) => {
            if (currentCallType !== 'group' || data.groupId !== currentGroupCallId) return;
            await this.handleGroupAnswer(data.fromUserId, data.answer);
        });

        socketManager.on('group-ice-candidate', async (data) => {
            if (currentCallType !== 'group' || data.groupId !== currentGroupCallId) return;
            await this.handleGroupIceCandidate(data.fromUserId, data.candidate);
        });

        socketManager.on('call-error', (msg) => {
            alert(msg);
            this.endCall();
        });

        socketManager.on('call-ended', () => {
            this.endCall(false);
        });
    },

    async processIceCandidateQueue() {
        if (currentCallType !== 'private' || !peerConnection || !peerConnection.remoteDescription) return;
        while (iceCandidateQueue.length > 0) {
            const candidate = iceCandidateQueue.shift();
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.error(e);
            }
        }
    },

    async processGroupIceCandidateQueue(userId) {
        const pc = groupPeerConnections[userId];
        const queue = groupIceQueues[userId] || [];
        if (!pc || !pc.remoteDescription) return;
        while (queue.length > 0) {
            const candidate = queue.shift();
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.error(e);
            }
        }
    },

    async startVoiceCall() {
        if (!currentChatUser) return;
        if (isCalling) return;

        try {
            isCalling = true;
            currentCallType = 'private';

            ui.showOutgoingCall(currentChatUser.username);

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert('Your browser does not support microphone access.');
                this.endCall();
                return;
            }

            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            peerConnection = new RTCPeerConnection(configuration);
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

            let callCreditDeducted = false;

            peerConnection.oniceconnectionstatechange = () => {
                if (peerConnection.iceConnectionState === 'connected' && !callCreditDeducted) {
                    socketManager.send('call-connected', { toUserId: currentChatUser.id });
                    callCreditDeducted = true;
                }
                if (['disconnected', 'failed', 'closed'].includes(peerConnection.iceConnectionState)) {
                    this.endCall();
                }
            };

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socketManager.send('ice-candidate', {
                        toUserId: currentChatUser.id,
                        candidate: event.candidate
                    });
                }
            };

            peerConnection.ontrack = (event) => {
                remoteStream = event.streams[0];
                const audio = document.getElementById('remoteAudio');
                audio.srcObject = remoteStream;
                audio.play().catch(e => console.error(e));
            };

            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            socketManager.send('call-request', {
                toUserId: currentChatUser.id,
                type: 'voice',
                offer: offer
            });

        } catch (error) {
            console.error('Call failed:', error);
            this.endCall();
        }
    },

    async startGroupVoiceCall() {
        if (isCalling) return;

        try {
            isCalling = true;
            currentCallType = 'group';
            currentGroupCallId = currentChatUser.id;

            ui.showOutgoingGroupCall(currentChatUser.name);

            if (!window.RTCPeerConnection || !navigator.mediaDevices) {
                this.endCall();
                return;
            }

            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            socketManager.send('group-call-request', { groupId: currentGroupCallId });
            socketManager.send('join-group-call', { groupId: currentGroupCallId });
            socketManager.send('call-connected', { groupId: currentGroupCallId });

        } catch (error) {
            console.error('Group call failed:', error);
            this.endCall();
        }
    },

    async answerCall() {
        const data = window.incomingCallData;
        if (!data) return;

        if (currentCallType === 'group') {
            return this.answerGroupCall(data);
        }

        try {
            isCalling = true;
            ui.setCallStatus('Connecting...');
            document.getElementById('answerBtn').classList.add('hidden');

            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            peerConnection = new RTCPeerConnection(configuration);
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socketManager.send('ice-candidate', {
                        toUserId: data.fromUserId,
                        candidate: event.candidate
                    });
                }
            };

            peerConnection.oniceconnectionstatechange = () => {
                if (['disconnected', 'failed', 'closed'].includes(peerConnection.iceConnectionState)) {
                    this.endCall();
                }
            };

            peerConnection.ontrack = (event) => {
                remoteStream = event.streams[0];
                const audio = document.getElementById('remoteAudio');
                audio.srcObject = remoteStream;
                audio.play();
            };

            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            socketManager.send('call-response', {
                toUserId: data.fromUserId,
                accepted: true,
                answer: answer
            });

            await this.processIceCandidateQueue();
            ui.startCallTimer();
        } catch (error) {
            socketManager.send('call-response', { toUserId: data.fromUserId, accepted: false });
            this.endCall();
        }
    },

    async answerGroupCall(data) {
        try {
            isCalling = true;
            document.getElementById('answerBtn').classList.add('hidden');
            ui.setCallStatus('Connecting to Group...');

            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            socketManager.send('join-group-call', { groupId: data.groupId });
            socketManager.send('call-connected', { groupId: data.groupId });

        } catch (err) {
            this.endCall();
        }
    },

    async createGroupPeerConnection(userId) {
        groupCallHasHadParticipants = true;
        const pc = new RTCPeerConnection(configuration);
        groupPeerConnections[userId] = pc;
        groupIceQueues[userId] = [];

        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socketManager.send('group-ice-candidate', {
                    toUserId: userId,
                    groupId: currentGroupCallId,
                    candidate: event.candidate
                });
            }
        };

        pc.oniceconnectionstatechange = () => {
            if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
                this.removeGroupPeerConnection(userId);
            }
        };

        pc.ontrack = (event) => {
            let audioElement = document.getElementById(`audio-user-${userId}`);
            if (!audioElement) {
                audioElement = document.createElement('audio');
                audioElement.id = `audio-user-${userId}`;
                audioElement.autoplay = true;
                document.getElementById('audioContainer').appendChild(audioElement);
                ui.addGroupParticipantUI(userId); // Call UI module to draw
            }
            audioElement.srcObject = event.streams[0];
            audioElement.volume = isDeafened ? 0 : 1;
        };

        return pc;
    },

    async initiateGroupPeerConnection(userId) {
        const pc = await this.createGroupPeerConnection(userId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socketManager.send('group-call-offer', {
            toUserId: userId,
            groupId: currentGroupCallId,
            offer: offer
        });
    },

    async handleGroupOffer(fromUserId, offer) {
        let pc = groupPeerConnections[fromUserId];
        if (!pc) {
            pc = await this.createGroupPeerConnection(fromUserId);
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socketManager.send('group-call-answer', {
            toUserId: fromUserId,
            groupId: currentGroupCallId,
            answer: answer
        });

        await this.processGroupIceCandidateQueue(fromUserId);
    },

    async handleGroupAnswer(fromUserId, answer) {
        const pc = groupPeerConnections[fromUserId];
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            await this.processGroupIceCandidateQueue(fromUserId);
        }
    },

    async handleGroupIceCandidate(fromUserId, candidate) {
        const pc = groupPeerConnections[fromUserId];
        if (pc && pc.remoteDescription) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) { }
        } else {
            if (!groupIceQueues[fromUserId]) groupIceQueues[fromUserId] = [];
            groupIceQueues[fromUserId].push(candidate);
        }
    },

    removeGroupPeerConnection(userId) {
        const pc = groupPeerConnections[userId];
        if (pc) {
            pc.close();
            delete groupPeerConnections[userId];
        }
        delete groupIceQueues[userId];
        ui.removeGroupParticipantUI(userId);

        if (currentCallType === 'group' && groupCallHasHadParticipants) {
            if (Object.keys(groupPeerConnections).length === 0) {
                this.endCall(true);
            }
        }
    },

    endCall(notifyPeer = true) {
        if (localStream) localStream.getTracks().forEach(track => track.stop());
        if (peerConnection) peerConnection.close();

        if (notifyPeer) {
            const targetUserId = currentChatUser?.id || window.incomingCallData?.fromUserId;
            if (targetUserId && currentCallType === 'private') {
                socketManager.send('call-ended', { toUserId: targetUserId });
            } else if (currentGroupCallId && currentCallType === 'group') {
                socketManager.send('leave-group-call', { groupId: currentGroupCallId });
            }
        }

        peerConnection = null;
        localStream = null;
        remoteStream = null;
        isCalling = false;
        currentCallType = null;
        currentGroupCallId = null;
        iceCandidateQueue = [];
        ui.stopCallTimer();

        for (const userId in groupPeerConnections) {
            this.removeGroupPeerConnection(userId);
        }
        groupPeerConnections = {};
        groupIceQueues = {};
        groupCallHasHadParticipants = false;

        ui.hideCallUI();
    },

    toggleMute() {
        isMuted = !isMuted;
        if (localStream) {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = !isMuted;
            });
        }
        ui.updateMuteUI(isMuted);
    },

    toggleDeafen() {
        isDeafened = !isDeafened;
        const privateAudio = document.getElementById('remoteAudio');
        if (privateAudio) {
            privateAudio.volume = isDeafened ? 0 : 1;
        }

        document.querySelectorAll('audio[id^="audio-user-"]').forEach(el => {
            el.volume = isDeafened ? 0 : 1;
        });
        ui.updateDeafenUI(isDeafened);
    }
};
