const { GroupMember, GroupMessage } = require('../../models');
const { deductCredit } = require('../utils/creditHelper');

module.exports = (io, socket, connectedUsers, activeGroupCalls) => {
    socket.on('join-group', async (groupId) => {
        if (!socket.userId) return;
        try {
            const member = await GroupMember.findOne({ where: { group_id: groupId, user_id: socket.userId } });
            if (member) {
                socket.join(`group_${groupId}`);
            }
        } catch (err) {
            console.error(err);
        }
    });

    socket.on('send-group-message', async (data) => {
        const { groupId, encryptedContent } = data;
        if (!socket.userId) return socket.emit('message-error', 'Not authenticated');

        try {
            const member = await GroupMember.findOne({ where: { group_id: groupId, user_id: socket.userId } });
            if (!member) return socket.emit('message-error', 'Not a member of this group');

            deductCredit(socket.userId, async (err) => {
                if (err) return socket.emit('message-error', err.message);

                try {
                    const message = await GroupMessage.create({
                        group_id: groupId,
                        from_user: socket.userId,
                        encrypted_content: encryptedContent
                    });

                    const messageData = {
                        id: message.id,
                        groupId,
                        fromUserId: socket.userId,
                        fromUsername: socket.username,
                        encryptedContent,
                        created_at: message.created_at || new Date().toISOString()
                    };

                    io.to(`group_${groupId}`).emit('receive-group-message', messageData);
                } catch (err) {
                    console.error(err);
                }
            });
        } catch (err) {
            console.error(err);
        }
    });
};
