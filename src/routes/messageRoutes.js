const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { authenticateToken, requireNoAdmin } = require('../middleware/auth');

router.get('/chats', authenticateToken, requireNoAdmin, messageController.getRecentChats);
router.get('/messages/:userId', authenticateToken, requireNoAdmin, messageController.getChatHistory);

module.exports = router;
