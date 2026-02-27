const { sequelize, User, CreditTransaction } = require('../models');

exports.getPendingTransactions = async (req, res) => {
    try {
        const transactions = await sequelize.query(
            `SELECT ct.*, u.username, u.email 
             FROM credit_transactions ct 
             JOIN users u ON ct.user_id = u.id 
             WHERE ct.status = 'pending' 
             ORDER BY ct.created_at DESC`,
            { type: sequelize.QueryTypes.SELECT }
        );
        res.json(transactions);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to fetch transactions' });
    }
};

exports.approveTransaction = async (req, res) => {
    const transactionId = req.params.id;

    const t = await sequelize.transaction();
    try {
        const transaction = await CreditTransaction.findByPk(transactionId, { transaction: t });

        if (!transaction) {
            await t.rollback();
            return res.status(404).json({ error: 'Transaction not found' });
        }

        if (transaction.status !== 'pending') {
            await t.rollback();
            return res.status(400).json({ error: 'Transaction already processed' });
        }

        transaction.status = 'approved';
        transaction.approved_at = new Date();
        await transaction.save({ transaction: t });

        const user = await User.findByPk(transaction.user_id, { transaction: t });
        user.credits += transaction.amount;
        await user.save({ transaction: t });

        await t.commit();
        res.json({ message: 'Transaction approved and credits added' });
    } catch (err) {
        await t.rollback();
        console.error(err);
        return res.status(500).json({ error: 'Failed to approve transaction' });
    }
};

exports.rejectTransaction = async (req, res) => {
    const transactionId = req.params.id;

    try {
        const [updated] = await CreditTransaction.update(
            { status: 'rejected' },
            { where: { id: transactionId, status: 'pending' } }
        );

        if (updated === 0) {
            return res.status(400).json({ error: 'Transaction not found or already processed' });
        }
        res.json({ message: 'Transaction rejected' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to reject transaction' });
    }
};

exports.getUsers = async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'username', 'email', 'credits', 'is_banned', 'created_at'],
            where: { is_admin: 0 }
        });
        res.json(users);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch users' });
    }
};

exports.banUser = async (req, res) => {
    const userId = req.params.id;
    const { ban } = req.body;

    try {
        const [updated] = await User.update(
            { is_banned: ban ? 1 : 0 },
            { where: { id: userId, is_admin: 0 } }
        );

        if (updated === 0) {
            return res.status(404).json({ error: 'User not found or is an admin' });
        }
        res.json({ message: ban ? 'User banned successfully' : 'User unbanned successfully' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update user status' });
    }
};

exports.deleteUser = async (req, res) => {
    const userId = req.params.id;

    try {
        const deleted = await User.destroy({
            where: { id: userId, is_admin: 0 }
        });

        if (deleted === 0) {
            return res.status(404).json({ error: 'User not found or is an admin' });
        }
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to delete user' });
    }
};
