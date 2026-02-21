const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('GroupMember', {
        group_id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
        user_id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
        role: { type: DataTypes.STRING, defaultValue: 'member' },
        encrypted_group_key: { type: DataTypes.TEXT },
        joined_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
        last_read_at: { type: DataTypes.DATE, defaultValue: new Date('2026-01-01 00:00:00') }
    }, {
        tableName: 'group_members',
        timestamps: false
    });
};
