const { Op } = require('sequelize');
const { User, GroupMember } = require('../models');

exports.getMe = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: ['id', 'username', 'email', 'credits', 'public_key', 'encrypted_private_key', 'avatar']
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (err) {
        return res.status(500).json({ error: 'Server error' });
    }
};

exports.uploadAvatar = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const avatarPath = '/uploads/' + req.file.filename;

    try {
        await User.update({ avatar: avatarPath }, { where: { id: req.user.id } });
        res.json({ message: 'Avatar updated', avatar: avatarPath });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update avatar' });
    }
};

exports.getUsers = async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'username', 'public_key', 'avatar'],
            where: {
                id: { [Op.ne]: req.user.id },
                is_admin: 0,
                is_banned: 0
            }
        });
        res.json(users);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch users' });
    }
};

exports.searchUsers = async (req, res) => {
    const query = req.query.q;
    const excludeGroupId = req.query.excludeGroupId;
    if (!query) return res.json([]);

    try {
        let excludeIds = [];
        if (excludeGroupId) {
            const members = await GroupMember.findAll({ where: { group_id: excludeGroupId } });
            excludeIds = members.map(m => m.user_id);
        }

        const whereClause = {
            id: { [Op.ne]: req.user.id },
            username: { [Op.like]: `%${query}%` },
            is_admin: 0,
            is_banned: 0
        };

        if (excludeIds.length > 0) {
            whereClause.id[Op.notIn] = excludeIds;
        }

        const users = await User.findAll({
            attributes: ['id', 'username', 'public_key', 'avatar'],
            where: whereClause,
            limit: 20
        });

        res.json(users);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to search users' });
    }
};
