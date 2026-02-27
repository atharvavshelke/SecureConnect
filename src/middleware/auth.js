const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { User } = require('../models');

const authenticateToken = async (req, res, next) => {
    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;

        const user = await User.findByPk(verified.id, { attributes: ['is_banned'] });
        if (!user || user.is_banned) {
            return res.status(403).json({ error: 'Your account has been banned' });
        }
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

const requireAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

const requireNoAdmin = (req, res, next) => {
    if (req.user && req.user.isAdmin) {
        return res.status(403).json({ error: 'This feature is not available for admin accounts' });
    }
    next();
};

module.exports = { authenticateToken, requireAdmin, requireNoAdmin };
