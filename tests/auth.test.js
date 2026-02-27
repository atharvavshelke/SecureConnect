process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret';
process.env.ADMIN_PASSWORD = 'test_admin_password';

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const authRoutes = require('../src/routes/authRoutes');
const errorHandler = require('../src/middleware/errorHandler');

// Setup mock app
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', authRoutes);
app.use(errorHandler);

const { sequelize, User } = require('../src/models');
const bcrypt = require('bcryptjs');

beforeAll(async () => {
    // Switch to strictly in-memory testing DB to prevent overriding local dev db
    sequelize.options.storage = ':memory:';
    await sequelize.authenticate();
    await sequelize.sync({ force: true });
});

afterAll(async () => {
    await sequelize.close();
});

describe('Authentication API', () => {
    beforeEach(async () => {
        await User.destroy({ where: {} });
    });

    describe('POST /api/register', () => {
        it('should register a new user successfully', async () => {
            const res = await request(app)
                .post('/api/register')
                .send({
                    username: 'testuser',
                    password: 'Password@123',
                    email: 'testuser@example.com',
                    publicKey: 'mockPubKey',
                    encryptedPrivateKey: 'mockPrivKey'
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('token');
            expect(res.body.message).toEqual('Registration successful');

            const userInDb = await User.findOne({ where: { username: 'testuser' } });
            expect(userInDb).toBeTruthy();
        });

        it('should fail registration with invalid password criteria', async () => {
            const res = await request(app)
                .post('/api/register')
                .send({
                    username: 'testuser2',
                    password: 'password', // Missing uppercase and symbol
                    email: 'testuser2@example.com'
                });

            expect(res.statusCode).toEqual(400);
            expect(res.body.error).toMatch(/Password must be at least/);
        });
    });

    describe('POST /api/login', () => {
        beforeEach(async () => {
            const hashedPassword = await bcrypt.hash('Password@123', 10);
            await User.create({
                username: 'loginuser',
                email: 'login@example.com',
                password: hashedPassword,
                credits: 500,
                is_logged_in: 0
            });
        });

        it('should login an existing user', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({
                    username: 'loginuser',
                    password: 'Password@123'
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('token');
            expect(res.body).toHaveProperty('userId');
        });

        it('should reject invalid password', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({
                    username: 'loginuser',
                    password: 'WrongPassword1!'
                });

            expect(res.statusCode).toEqual(400);
            expect(res.body.error).toEqual('Invalid credentials');
        });
    });
});
