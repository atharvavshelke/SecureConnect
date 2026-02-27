const { Sequelize } = require('sequelize');

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './secureconnect.db',
    logging: false
});

const User = require('./User')(sequelize);
const Message = require('./Message')(sequelize);
const Group = require('./Group')(sequelize);
const GroupMember = require('./GroupMember')(sequelize);
const GroupMessage = require('./GroupMessage')(sequelize);
const CreditTransaction = require('./CreditTransaction')(sequelize);

// Associations
User.hasMany(Message, { foreignKey: 'from_user', as: 'sentMessages' });
User.hasMany(Message, { foreignKey: 'to_user', as: 'receivedMessages' });
Message.belongsTo(User, { foreignKey: 'from_user', as: 'sender' });
Message.belongsTo(User, { foreignKey: 'to_user', as: 'receiver' });

User.hasMany(CreditTransaction, { foreignKey: 'user_id' });
CreditTransaction.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(Group, { foreignKey: 'created_by' });
Group.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

Group.belongsToMany(User, { through: GroupMember, foreignKey: 'group_id' });
User.belongsToMany(Group, { through: GroupMember, foreignKey: 'user_id' });

// We explicitly define relationships on the join table as well for easier querying
Group.hasMany(GroupMember, { foreignKey: 'group_id' });
GroupMember.belongsTo(Group, { foreignKey: 'group_id' });
User.hasMany(GroupMember, { foreignKey: 'user_id' });
GroupMember.belongsTo(User, { foreignKey: 'user_id' });

Group.hasMany(GroupMessage, { foreignKey: 'group_id' });
GroupMessage.belongsTo(Group, { foreignKey: 'group_id' });

User.hasMany(GroupMessage, { foreignKey: 'from_user' });
GroupMessage.belongsTo(User, { foreignKey: 'from_user', as: 'sender' });

module.exports = {
    sequelize,
    User,
    Message,
    Group,
    GroupMember,
    GroupMessage,
    CreditTransaction
};
