const { User } = require('../models');
const { JWT_SECRET } = require('../config/env');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../middleware/asyncHandler');

exports.register = asyncHandler(async (req, res) => {
    const { username, password, email, publicKey, encryptedPrivateKey } = req.body;

    if (!username || !password || !email) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const usernameRegex = /^[a-z0-9]{5,32}$/;
    if (!usernameRegex.test(username)) {
        return res.status(400).json({ error: 'Username must be lowercase alphanumeric and between 5-32 characters long' });
    }

    if (username.toLowerCase().includes('admin')) {
        return res.status(400).json({ error: 'Username "admin" is reserved' });
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email) || email.includes('+')) {
        return res.status(400).json({ error: 'Please provide a valid email address. Plus-addressing (e.g., user+test@gmail.com) is not allowed.' });
    }

    const passwordRegex = /^(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long, contain at least one uppercase letter and one special character' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            username,
            password: hashedPassword,
            email,
            public_key: publicKey,
            encrypted_private_key: encryptedPrivateKey,
            credits: 500,
            is_logged_in: 1
        });

        const token = jwt.sign(
            { id: newUser.id, username, isAdmin: false },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.cookie('token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
        res.json({
            message: 'Registration successful',
            token,
            userId: newUser.id,
            username
        });
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            const validationError = new Error('Username or email already exists');
            validationError.statusCode = 400;
            throw validationError;
        }
        throw err;
    }
});

exports.login = asyncHandler(async (req, res) => {
    let { username, password, forceLogin } = req.body;
    if (username) username = username.toLowerCase();

    const user = await User.findOne({ where: { username } });
    if (!user) {
        return res.status(400).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.status(400).json({ error: 'Invalid credentials' });
    }

    if (user.is_logged_in && !forceLogin) {
        return res.status(403).json({ error: 'User already logged in on another device.', requiresForceLogin: true });
    }

    if (user.is_banned) {
        return res.status(403).json({ error: 'Your account has been banned' });
    }

    user.is_logged_in = 1;
    await user.save();

    const token = jwt.sign(
        { id: user.id, username: user.username, isAdmin: user.is_admin === 1 },
        JWT_SECRET,
        { expiresIn: '24h' }
    );

    res.cookie('token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    res.json({
        message: 'Login successful',
        token,
        userId: user.id,
        username: user.username,
        isAdmin: user.is_admin === 1,
        credits: user.credits,
        publicKey: user.public_key,
        encryptedPrivateKey: user.encrypted_private_key
    });
});

exports.logout = asyncHandler(async (req, res) => {
    await User.update({ is_logged_in: 0 }, { where: { id: req.user.id } });
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
});

exports.syncKey = asyncHandler(async (req, res) => {
    const { encryptedPrivateKey } = req.body;
    if (!encryptedPrivateKey) {
        return res.status(400).json({ error: 'No key provided' });
    }

    await User.update({ encrypted_private_key: encryptedPrivateKey }, { where: { id: req.user.id } });
    res.json({ message: 'Key synced successfully' });
});
