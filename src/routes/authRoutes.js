const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authLimiter } = require('../middleware/rateLimit');
const { authenticateToken, requireNoAdmin } = require('../middleware/auth');

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/auth/logout', authenticateToken, authController.logout);
router.post('/user/sync-key', authenticateToken, requireNoAdmin, authController.syncKey);

module.exports = router;
