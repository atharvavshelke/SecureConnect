const { Op } = require('sequelize');
const { sequelize, Message, User } = require('../models');

exports.getRecentChats = async (req, res) => {
    const currentUserId = req.user.id;

    const sql = `
        SELECT 
            u.id, 
            u.username, 
            u.public_key,
            u.avatar,
            MAX(m.created_at) as last_message_time,
            SUM(CASE WHEN m.to_user = ? AND m.is_read = 0 THEN 1 ELSE 0 END) as unread_count
        FROM users u
        JOIN messages m ON (m.from_user = u.id AND m.to_user = ?) OR (m.from_user = ? AND m.to_user = u.id)
        WHERE u.id != ? AND u.is_admin = 0 AND u.is_banned = 0
        GROUP BY u.id
        ORDER BY unread_count DESC, last_message_time DESC
    `;

    try {
        const chats = await sequelize.query(sql, {
            replacements: [currentUserId, currentUserId, currentUserId, currentUserId],
            type: sequelize.QueryTypes.SELECT
        });
        res.json(chats);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to fetch chats' });
    }
};

exports.getChatHistory = async (req, res) => {
    const otherUserId = req.params.userId;
    const currentUserId = req.user.id;

    try {
        await Message.update(
            { is_read: 1 },
            { where: { from_user: otherUserId, to_user: currentUserId, is_read: 0 } }
        );

        const messages = await Message.findAll({
            where: {
                [Op.or]: [
                    { from_user: currentUserId, to_user: otherUserId },
                    { from_user: otherUserId, to_user: currentUserId }
                ]
            },
            include: [{ model: User, as: 'sender', attributes: ['username'] }],
            order: [['created_at', 'ASC']]
        });

        const formattedMessages = messages.map(msg => ({
            id: msg.id,
            fromUserId: msg.from_user,
            fromUsername: msg.sender ? msg.sender.username : 'Unknown',
            toUserId: msg.to_user,
            encryptedContent: msg.encrypted_content,
            timestamp: msg.created_at,
            isRead: msg.is_read,
            received: msg.from_user !== currentUserId
        }));

        res.json(formattedMessages);
    } catch (err) {
        console.error('Failed to fetch messages:', err);
        return res.status(500).json({ error: 'Failed to fetch messages' });
    }
};
