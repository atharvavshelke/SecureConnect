import { api } from './api.js';

let socket;
let onlineUsers = [];
let eventListeners = {};

export const socketManager = {
    connect() {
        const token = localStorage.getItem('token');
        if (!token) return;

        socket = io({
            auth: { token }
        });

        socket.on('connect', () => {
            console.log('Connected to WebSocket');
            socket.emit('authenticate', token);
        });

        // Register default internal listeners and bubble them up
        socket.on('users-online', (userIds) => {
            onlineUsers = userIds;
            this.emit('users-online', userIds);
        });

        // Generic catch-all to forward to our custom event system
        const eventsToForward = [
            'receive-message', 'receive-group-message', 'message-sent', 'message-error',
            'incoming-call', 'incoming-group-call', 'call-answered', 'ice-candidate',
            'group-call-participants', 'user-joined-group-call', 'user-left-group-call',
            'group-call-offer', 'group-call-answer', 'group-ice-candidate', 'call-error', 'call-ended',
            'auth-error', 'disconnect', 'credits-updated'
        ];

        eventsToForward.forEach(ev => {
            socket.on(ev, (data) => this.emit(ev, data));
        });
    },

    on(event, callback) {
        if (!eventListeners[event]) {
            eventListeners[event] = [];
        }
        eventListeners[event].push(callback);
    },

    emit(event, data) {
        if (eventListeners[event]) {
            eventListeners[event].forEach(cb => cb(data));
        }
    },

    send(event, data) {
        if (socket && socket.connected) {
            socket.emit(event, data);
        }
    },

    getOnlineUsers() {
        return onlineUsers;
    }
};
