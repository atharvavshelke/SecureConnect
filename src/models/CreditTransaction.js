const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('CreditTransaction', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: DataTypes.INTEGER, allowNull: false },
        amount: { type: DataTypes.INTEGER, allowNull: false },
        transaction_ref: { type: DataTypes.STRING },
        status: { type: DataTypes.STRING, defaultValue: 'pending' },
        created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
        approved_at: { type: DataTypes.DATE }
    }, {
        tableName: 'credit_transactions',
        timestamps: false
    });
};
