const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const chatEvents = require('./events/chatEvents');
const webrtcEvents = require('./events/webrtcEvents');
const groupEvents = require('./events/groupEvents');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

const connectedUsers = new Map();
const activeGroupCalls = new Map();

exports.getConnectedUsers = () => connectedUsers;

exports.initSockets = async (io) => {
    if (process.env.REDIS_URL) {
        const pubClient = createClient({ url: process.env.REDIS_URL });
        const subClient = pubClient.duplicate();

        pubClient.on('error', (err) => console.log('Redis Pub Error', err));
        subClient.on('error', (err) => console.log('Redis Sub Error', err));

        try {
            await Promise.all([
                pubClient.connect(),
                subClient.connect()
            ]);
            io.adapter(createAdapter(pubClient, subClient));
            console.log('Redis adapter connected for Socket.IO');
        } catch (err) {
            console.error('Failed to connect to Redis Adapter, falling back to in-memory:', err);
        }
    }

    io.on('connection', (socket) => {
        console.log('New client connected');

        socket.on('authenticate', (token) => {
            try {
                const verified = jwt.verify(token, JWT_SECRET);
                socket.userId = verified.id;
                socket.username = verified.username;
                socket.isAdmin = verified.isAdmin;
                connectedUsers.set(verified.id, socket.id);

                const onlineUsers = Array.from(io.sockets.sockets.values())
                    .filter(s => s.userId && !s.isAdmin)
                    .map(s => s.userId);
                io.emit('users-online', onlineUsers);
            } catch (err) {
                socket.emit('auth-error', 'Invalid token');
            }
        });

        chatEvents(io, socket, connectedUsers);
        groupEvents(io, socket, connectedUsers, activeGroupCalls);
        webrtcEvents(io, socket, connectedUsers, activeGroupCalls);

        socket.on('disconnect', () => {
            if (socket.userId) {
                for (const [groupId, participants] of activeGroupCalls.entries()) {
                    if (participants.has(socket.userId)) {
                        participants.delete(socket.userId);
                        if (participants.size === 0) {
                            activeGroupCalls.delete(groupId);
                        } else {
                            participants.forEach(participantId => {
                                const recipientSocketId = connectedUsers.get(participantId);
                                if (recipientSocketId) {
                                    io.to(recipientSocketId).emit('user-left-group-call', {
                                        groupId: groupId,
                                        userId: socket.userId
                                    });
                                }
                            });
                        }
                    }
                }
                connectedUsers.delete(socket.userId);
                const onlineUsers = Array.from(io.sockets.sockets.values())
                    .filter(s => s.userId && !s.isAdmin)
                    .map(s => s.userId);
                io.emit('users-online', onlineUsers);
            }
            console.log('Client disconnected');
        });
    });
};
