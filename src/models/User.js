const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('User', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        username: { type: DataTypes.STRING, unique: true, allowNull: false },
        password: { type: DataTypes.STRING, allowNull: false },
        email: { type: DataTypes.STRING, unique: true, allowNull: false },
        credits: { type: DataTypes.INTEGER, defaultValue: 500 },
        public_key: { type: DataTypes.TEXT },
        encrypted_private_key: { type: DataTypes.TEXT },
        is_logged_in: { type: DataTypes.INTEGER, defaultValue: 0 },
        is_admin: { type: DataTypes.INTEGER, defaultValue: 0 },
        is_banned: { type: DataTypes.INTEGER, defaultValue: 0 },
        avatar: { type: DataTypes.TEXT },
        created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    }, {
        tableName: 'users',
        timestamps: false
    });
};
