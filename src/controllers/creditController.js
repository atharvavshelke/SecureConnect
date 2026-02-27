const { CreditTransaction } = require('../models');

exports.requestCredits = async (req, res) => {
    const { amount, transactionRef } = req.body;
    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }

    try {
        const transaction = await CreditTransaction.create({
            user_id: req.user.id,
            amount,
            transaction_ref: transactionRef,
            status: 'pending'
        });
        res.json({
            message: 'Credit request submitted for admin approval',
            transactionId: transaction.id
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to create request' });
    }
};

exports.getTransactions = async (req, res) => {
    try {
        const transactions = await CreditTransaction.findAll({
            where: { user_id: req.user.id },
            order: [['created_at', 'DESC']]
        });
        res.json(transactions);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to fetch transactions' });
    }
};
