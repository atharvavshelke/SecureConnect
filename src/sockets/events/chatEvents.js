const { Message } = require('../../models');
const { deductCredit } = require('../utils/creditHelper');

module.exports = (io, socket, connectedUsers) => {
    socket.on('send-message', (data) => {
        const { toUserId, encryptedContent } = data;

        if (!socket.userId) return socket.emit('message-error', 'Not authenticated');
        if (socket.isAdmin) return socket.emit('message-error', 'Admin accounts cannot send messages');

        deductCredit(socket.userId, async (err, success) => {
            if (err) {
                return socket.emit('message-error', 'Insufficient credits. Please purchase more credits.');
            }

            try {
                const message = await Message.create({
                    from_user: socket.userId,
                    to_user: toUserId,
                    encrypted_content: encryptedContent
                });

                const messageData = {
                    id: message.id,
                    fromUserId: socket.userId,
                    fromUsername: socket.username,
                    toUserId,
                    encryptedContent,
                    timestamp: message.created_at || new Date().toISOString()
                };

                const recipientSocketId = connectedUsers.get(toUserId);
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit('receive-message', messageData);
                }
                socket.emit('message-sent', messageData);
            } catch (err) {
                console.error(err);
                return socket.emit('message-error', 'Failed to send message');
            }
        });
    });
};
