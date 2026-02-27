const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('Group', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: DataTypes.STRING, allowNull: false },
        description: { type: DataTypes.TEXT },
        created_by: { type: DataTypes.INTEGER, allowNull: false },
        created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    }, {
        tableName: 'groups',
        timestamps: false
    });
};
