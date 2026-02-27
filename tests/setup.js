const { Sequelize } = require('sequelize');

let sequelize;

const initializeTestDb = async () => {
    // Force sqlite into memory for ultra-fast, isolated testing
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: ':memory:',
        logging: false
    });

    // We must require models AFTER configuring the memory db
    // This requires a minor refactor in models/index.js to accept an injected instance
    // Or, we globally overwrite the config before models load:

    // For now, let's just make sure tests run in a clean SQLite file if memory gets complex with associations.
    // Actually, setting process.env.NODE_ENV = 'test' should trigger test-specific DB logic in db.js
};

const closeTestDb = async () => {
    if (sequelize) {
        await sequelize.close();
    }
};

module.exports = {
    initializeTestDb,
    closeTestDb
};
