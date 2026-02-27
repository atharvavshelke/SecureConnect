const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/transactions/pending', adminController.getPendingTransactions);
router.post('/transactions/:id/approve', adminController.approveTransaction);
router.post('/transactions/:id/reject', adminController.rejectTransaction);
router.get('/users', adminController.getUsers);
router.post('/users/:id/ban', adminController.banUser);
router.delete('/users/:id', adminController.deleteUser);

module.exports = router;
