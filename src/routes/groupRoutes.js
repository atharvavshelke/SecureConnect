const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.post('/', groupController.createGroup);
router.get('/', groupController.getGroups);
router.get('/:id/members', groupController.getGroupMembers);
router.post('/:id/members', groupController.addGroupMember);
router.delete('/:id/members/:userId', groupController.removeGroupMember);
router.get('/:id/messages', groupController.getGroupMessages);
router.get('/:id/status', groupController.getGroupStatus);
router.post('/:id/read', groupController.markGroupRead);

module.exports = router;
