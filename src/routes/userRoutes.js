const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken, requireNoAdmin } = require('../middleware/auth');
const upload = require('../config/upload');

router.get('/user/me', authenticateToken, userController.getMe);
router.post('/user/avatar', authenticateToken, requireNoAdmin, upload.single('avatar'), userController.uploadAvatar);
router.get('/users', authenticateToken, requireNoAdmin, userController.getUsers);
router.get('/users/search', authenticateToken, requireNoAdmin, userController.searchUsers);

module.exports = router;
