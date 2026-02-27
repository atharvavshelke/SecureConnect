const bcrypt = require('bcryptjs');
const { ADMIN_PASSWORD } = require('./env');
const models = require('../models');

// Extract properties directly to ensure backwards compatibility where 'db' might be expected
// Actually we will refactor all files to use models directly, but keep this simple.
const { sequelize, User } = models;

async function initDb() {
    try {
        await sequelize.authenticate();
        console.log('Connection to SQLite has been established successfully via Sequelize.');

        // Sync models (creates tables, adds missing columns ideally)
        // Note: In production you'd use migrations instead of sync({ alter: true })
        // Since we are transitioning, we will use it carefully here.
        await sequelize.sync({ alter: false }); // Avoid alter for now as we have existing data and relations might conflict

        // Handle Default Admin Creation
        let adminUser = await User.findOne({ where: { username: 'admin' } });

        if (!adminUser) {
            const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 10);
            await User.create({
                username: 'admin',
                password: hashedPassword,
                email: 'admin@secureconnect.local',
                credits: 999999,
                is_admin: 1
            });
            console.log('Default admin account created');
        } else if (adminUser.is_admin === 0) {
            adminUser.is_admin = 1;
            await adminUser.save();
        }

        // Reset all logins on boot
        await User.update({ is_logged_in: 0 }, { where: {} });

    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
}

// Export models and initDb directly for easy swapping
module.exports = {
    ...models,
    sequelize,
    initDb,
    // Provide a mocked 'db' object just in case we miss a file during transition to prevent immediate crashes,
    // though the queries themselves would fail.
    db: {
        run: () => console.warn('Warn: Deprecated db.run used!'),
        get: () => console.warn('Warn: Deprecated db.get used!'),
        all: () => console.warn('Warn: Deprecated db.all used!')
    }
};
