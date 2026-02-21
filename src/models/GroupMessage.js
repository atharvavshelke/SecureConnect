const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('GroupMessage', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        group_id: { type: DataTypes.INTEGER, allowNull: false },
        from_user: { type: DataTypes.INTEGER, allowNull: false },
        encrypted_content: { type: DataTypes.TEXT, allowNull: false },
        created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    }, {
        tableName: 'group_messages',
        timestamps: false
    });
};
