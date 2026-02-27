require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!JWT_SECRET || !ADMIN_PASSWORD) {
    console.error('FATAL ERROR: JWT_SECRET and ADMIN_PASSWORD must be defined in the environment.');
    process.exit(1);
}

module.exports = {
    PORT: process.env.PORT || 3000,
    JWT_SECRET,
    ADMIN_PASSWORD,
    NODE_ENV: process.env.NODE_ENV || 'development'
};
