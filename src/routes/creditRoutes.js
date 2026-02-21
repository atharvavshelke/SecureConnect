const express = require('express');
const router = express.Router();
const creditController = require('../controllers/creditController');
const { authenticateToken, requireNoAdmin } = require('../middleware/auth');

router.post('/request', authenticateToken, requireNoAdmin, creditController.requestCredits);
router.get('/transactions', authenticateToken, requireNoAdmin, creditController.getTransactions);

module.exports = router;
