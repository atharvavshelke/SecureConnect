const { sequelize, Group, GroupMember, GroupMessage } = require('../models');

exports.createGroup = async (req, res) => {
    const { name, description, encryptedGroupKey } = req.body;
    if (!name) return res.status(400).json({ error: 'Group name is required' });

    const t = await sequelize.transaction();
    try {
        const group = await Group.create(
            { name, description, created_by: req.user.id },
            { transaction: t }
        );

        await GroupMember.create(
            { group_id: group.id, user_id: req.user.id, role: 'admin', encrypted_group_key: encryptedGroupKey },
            { transaction: t }
        );

        await t.commit();
        res.json({ id: group.id, name, description });
    } catch (err) {
        await t.rollback();
        return res.status(500).json({ error: 'Failed to create group' });
    }
};

exports.getGroups = async (req, res) => {
    try {
        const groups = await sequelize.query(`
            SELECT 
                g.*, 
                gm.encrypted_group_key,
                (SELECT COUNT(*) FROM group_messages WHERE group_id = g.id AND created_at > gm.last_read_at) as unread_count
            FROM groups g
            JOIN group_members gm ON g.id = gm.group_id
            WHERE gm.user_id = ?
            ORDER BY g.created_at DESC`,
            { replacements: [req.user.id], type: sequelize.QueryTypes.SELECT }
        );
        res.json(groups);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch groups' });
    }
};

exports.getGroupMembers = async (req, res) => {
    try {
        const members = await sequelize.query(`
            SELECT u.id, u.username, u.avatar, gm.role, gm.joined_at
            FROM users u
            JOIN group_members gm ON u.id = gm.user_id
            WHERE gm.group_id = ?`,
            { replacements: [req.params.id], type: sequelize.QueryTypes.SELECT }
        );
        res.json(members);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch group members' });
    }
};

exports.addGroupMember = async (req, res) => {
    const groupId = parseInt(req.params.id);
    const { userId, encryptedGroupKey } = req.body;
    const requesterId = req.user.id;

    if (!userId) return res.status(400).json({ error: 'User ID is required' });
    if (!encryptedGroupKey) return res.status(400).json({ error: 'Encrypted group key is required' });

    const t = await sequelize.transaction();
    try {
        // Check if requester is an admin
        const requester = await GroupMember.findOne({
            where: { group_id: groupId, user_id: requesterId },
            transaction: t
        });

        if (!requester || requester.role !== 'admin') {
            await t.rollback();
            return res.status(403).json({ error: 'Only group admins can add members' });
        }

        await GroupMember.create({
            group_id: groupId,
            user_id: parseInt(userId),
            encrypted_group_key: encryptedGroupKey,
            role: 'member'
        }, { transaction: t });

        await t.commit();
        res.json({ message: 'Member added successfully' });
    } catch (err) {
        await t.rollback();
        if (err.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({ error: 'User is already a member' });
        }
        console.error('Add member error:', err);
        return res.status(500).json({ error: 'Failed to add member' });
    }
};

exports.removeGroupMember = async (req, res) => {
    const groupId = req.params.id;
    const targetUserId = parseInt(req.params.userId);
    const requesterId = req.user.id;

    const t = await sequelize.transaction();
    try {
        const requesterRole = await GroupMember.findOne({
            where: { group_id: groupId, user_id: requesterId },
            transaction: t
        });

        if (!requesterRole) {
            await t.rollback();
            return res.status(403).json({ error: 'You are not a member of this group' });
        }

        const isLeave = requesterId === targetUserId;
        const isAdmin = requesterRole.role === 'admin';

        if (!isLeave && !isAdmin) {
            await t.rollback();
            return res.status(403).json({ error: 'Only group admins can remove members' });
        }

        await GroupMember.destroy({
            where: { group_id: groupId, user_id: targetUserId },
            transaction: t
        });

        const memberCount = await GroupMember.count({
            where: { group_id: groupId },
            transaction: t
        });

        if (memberCount === 0) {
            await GroupMessage.destroy({ where: { group_id: groupId }, transaction: t });
            await Group.destroy({ where: { id: groupId }, transaction: t });
        }

        await t.commit();
        res.json({ message: isLeave ? 'Left group successfully' : 'Member removed successfully' });
    } catch (err) {
        await t.rollback();
        return res.status(500).json({ error: 'Failed to remove member' });
    }
};

exports.getGroupMessages = async (req, res) => {
    const groupId = req.params.id;
    const userId = req.user.id;

    try {
        const messages = await sequelize.query(`
            SELECT gm.*, u.username as fromUsername
            FROM group_messages gm
            JOIN users u ON gm.from_user = u.id
            WHERE gm.group_id = ?
            ORDER BY gm.created_at ASC`,
            { replacements: [groupId], type: sequelize.QueryTypes.SELECT }
        );

        await GroupMember.update(
            { last_read_at: new Date() },
            { where: { group_id: groupId, user_id: userId } }
        );

        res.json(messages);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch messages' });
    }
};

exports.getGroupStatus = async (req, res) => {
    const { getConnectedUsers } = require('../sockets/socketManager');
    const connectedUsers = getConnectedUsers();
    const groupId = req.params.id;

    try {
        const members = await GroupMember.findAll({
            attributes: ['user_id'],
            where: { group_id: groupId }
        });

        let onlineCount = 0;
        members.forEach(member => {
            if (connectedUsers && connectedUsers.has(member.user_id)) {
                onlineCount++;
            }
        });

        res.json({
            onlineCount,
            totalCount: members.length
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch status' });
    }
};

exports.markGroupRead = async (req, res) => {
    try {
        await GroupMember.update(
            { last_read_at: new Date() },
            { where: { group_id: req.params.id, user_id: req.user.id } }
        );
        res.json({ message: 'Marked as read' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to mark as read' });
    }
};
