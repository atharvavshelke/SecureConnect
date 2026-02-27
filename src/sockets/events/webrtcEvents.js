const { Op } = require('sequelize');
const { Group, GroupMember, User } = require('../../models');
const { deductCredit } = require('../utils/creditHelper');

module.exports = (io, socket, connectedUsers, activeGroupCalls) => {
    socket.on('call-request', (data) => {
        const { toUserId } = data;
        const recipientSocketId = connectedUsers.get(parseInt(toUserId));
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('incoming-call', {
                fromUserId: socket.userId,
                fromUsername: socket.username,
                offer: data.offer,
                type: data.type
            });
        }
    });

    socket.on('call-response', (data) => {
        const { toUserId } = data;
        const recipientSocketId = connectedUsers.get(parseInt(toUserId));
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('call-answered', {
                fromUserId: socket.userId,
                accepted: data.accepted,
                answer: data.answer
            });
        }
    });

    socket.on('ice-candidate', (data) => {
        const { toUserId, candidate } = data;
        const recipientSocketId = connectedUsers.get(parseInt(toUserId));
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('ice-candidate', {
                fromUserId: socket.userId,
                candidate: candidate
            });
        }
    });

    socket.on('call-ended', (data) => {
        const { toUserId } = data;
        const recipientSocketId = connectedUsers.get(parseInt(toUserId));
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('call-ended', {
                fromUserId: socket.userId
            });
        }
    });

    socket.on('group-call-request', async (data) => {
        const { groupId } = data;
        if (!socket.userId) return;

        try {
            const member = await GroupMember.findOne({ where: { group_id: groupId, user_id: socket.userId } });
            if (!member) return socket.emit('call-error', 'Not a member of this group');

            if (!activeGroupCalls.has(groupId)) {
                activeGroupCalls.set(groupId, new Set());
            }

            const members = await GroupMember.findAll({ where: { group_id: groupId, user_id: { [Op.ne]: socket.userId } } });
            const group = await Group.findByPk(groupId);

            if (!group) return;

            members.forEach(m => {
                const recipientSocketId = connectedUsers.get(m.user_id);
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit('incoming-group-call', {
                        groupId: groupId,
                        groupName: group.name,
                        fromUserId: socket.userId,
                        fromUsername: socket.username
                    });
                }
            });
        } catch (err) {
            console.error(err);
        }
    });

    socket.on('join-group-call', (data) => {
        const { groupId } = data;
        if (!socket.userId) return;

        if (!activeGroupCalls.has(groupId)) {
            activeGroupCalls.set(groupId, new Set());
        }

        const participants = activeGroupCalls.get(groupId);

        participants.forEach(participantId => {
            const recipientSocketId = connectedUsers.get(participantId);
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('user-joined-group-call', {
                    groupId: groupId,
                    userId: socket.userId,
                    username: socket.username
                });
            }
        });

        socket.emit('group-call-participants', {
            groupId: groupId,
            participants: Array.from(participants)
        });

        participants.add(socket.userId);
    });

    socket.on('leave-group-call', (data) => {
        const { groupId } = data;
        if (!socket.userId || !activeGroupCalls.has(groupId)) return;

        const participants = activeGroupCalls.get(groupId);
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
    });

    socket.on('group-call-offer', (data) => {
        const { toUserId, groupId, offer } = data;
        const recipientSocketId = connectedUsers.get(parseInt(toUserId));
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('group-call-offer', {
                fromUserId: socket.userId,
                groupId: groupId,
                offer: offer
            });
        }
    });

    socket.on('group-call-answer', (data) => {
        const { toUserId, groupId, answer } = data;
        const recipientSocketId = connectedUsers.get(parseInt(toUserId));
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('group-call-answer', {
                fromUserId: socket.userId,
                groupId: groupId,
                answer: answer
            });
        }
    });

    socket.on('group-ice-candidate', (data) => {
        const { toUserId, groupId, candidate } = data;
        const recipientSocketId = connectedUsers.get(parseInt(toUserId));
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('group-ice-candidate', {
                fromUserId: socket.userId,
                groupId: groupId,
                candidate: candidate
            });
        }
    });

    socket.on('call-connected', (data) => {
        if (!socket.userId) return;

        deductCredit(socket.userId, async (err, success) => {
            if (err) {
                socket.emit('call-error', 'Insufficient credits for calling. Call will be disconnected.');
            } else {
                try {
                    const user = await User.findByPk(socket.userId, { attributes: ['credits'] });
                    if (user) {
                        socket.emit('credits-updated', { credits: user.credits });
                    }
                } catch (err) {
                    console.error(err);
                }
            }
        });
    });
};
