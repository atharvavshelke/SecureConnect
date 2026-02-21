const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('Message', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        from_user: { type: DataTypes.INTEGER, allowNull: false },
        to_user: { type: DataTypes.INTEGER, allowNull: false },
        encrypted_content: { type: DataTypes.TEXT, allowNull: false },
        is_read: { type: DataTypes.INTEGER, defaultValue: 0 },
        created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    }, {
        tableName: 'messages',
        timestamps: false
    });
};
