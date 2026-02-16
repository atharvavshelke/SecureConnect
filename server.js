const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const fs = require('fs');
const multer = require('multer');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only images are allowed'));
    }
});

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'DRMldXqUB1ZAZXQjvKPR70073fAP5pSHEJsBBeucChjRkYirYAeKPHri9XD73fnUbMxkeUR487MHylj5xTk40CBHp0G54eXH2WIUhcrnJnGTCLcpljd9ZlUjIEATzS6b' + Math.random();
const ADMIN_PASSWORD = 'Password@2026'; // Change this!

// Database setup
const db = new sqlite3.Database('./secureconnect.db');

// Initialize database
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        credits INTEGER DEFAULT 0,
        public_key TEXT,
        is_admin INTEGER DEFAULT 0,
        avatar TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Messages table (stores encrypted messages)
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_user INTEGER NOT NULL,
        to_user INTEGER NOT NULL,
        encrypted_content TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_user) REFERENCES users (id),
        FOREIGN KEY (to_user) REFERENCES users (id)
    )`, (err) => {
        if (!err) {
            // Attempt to add is_read column if it doesn't exist (for existing databases)
            db.run("ALTER TABLE messages ADD COLUMN is_read INTEGER DEFAULT 0", (err) => {
                // Ignore error if column already exists
            });
        }
    });

    // Add avatar column if it doesn't exist (for existing databases)
    db.run("ALTER TABLE users ADD COLUMN avatar TEXT", (err) => {
        // Ignore error if column already exists
    });

    // Credit transactions table
    db.run(`CREATE TABLE IF NOT EXISTS credit_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        transaction_ref TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approved_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Create default admin user if not exists
    db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
        if (!row) {
            const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 10);
            db.run(
                "INSERT INTO users (username, password, email, credits, is_admin) VALUES (?, ?, ?, ?, ?)",
                ['admin', hashedPassword, 'admin@secureconnect.local', 999999, 1]
            );
            console.log('Default admin account created - Username: admin, Password: admin123');
        }
    });
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    secret: JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', './views');

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ error: 'Invalid token' });
    }
};

// Admin middleware
const requireAdmin = (req, res, next) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/chat', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/admin-panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'admin.html'));
});

// User registration
app.post('/api/register', async (req, res) => {
    const { username, password, email, publicKey } = req.body;

    if (!username || !password || !email) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
            'INSERT INTO users (username, password, email, public_key, credits) VALUES (?, ?, ?, ?, ?)',
            [username, hashedPassword, email, publicKey, 10], // 10 free credits
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ error: 'Username or email already exists' });
                    }
                    return res.status(500).json({ error: 'Registration failed' });
                }

                const token = jwt.sign(
                    { id: this.lastID, username, isAdmin: false },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );

                res.cookie('token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
                res.json({
                    message: 'Registration successful',
                    token,
                    userId: this.lastID,
                    username
                });
            }
        );
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// User login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, isAdmin: user.is_admin === 1 },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.cookie('token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
        res.json({
            message: 'Login successful',
            token,
            userId: user.id,
            username: user.username,
            isAdmin: user.is_admin === 1,
            credits: user.credits
        });
    });
});

// Get user info
app.get('/api/user/me', authenticateToken, (req, res) => {
    db.get('SELECT id, username, email, credits, public_key, avatar FROM users WHERE id = ?',
        [req.user.id],
        (err, user) => {
            if (err || !user) {
                return res.status(404).json({ error: 'User not found' });
            }
            res.json(user);
        }
    );
});

// Upload avatar
app.post('/api/user/avatar', authenticateToken, upload.single('avatar'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const avatarPath = '/uploads/' + req.file.filename;

    db.run(
        'UPDATE users SET avatar = ? WHERE id = ?',
        [avatarPath, req.user.id],
        (err) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to update avatar' });
            }
            res.json({ message: 'Avatar updated', avatar: avatarPath });
        }
    );
});

// Get all users (for chat)
app.get('/api/users', authenticateToken, (req, res) => {
    db.all(
        'SELECT id, username, public_key, avatar FROM users WHERE id != ?',
        [req.user.id],
        (err, users) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch users' });
            }
            res.json(users);
        }
    );
});

// Search users
app.get('/api/users/search', authenticateToken, (req, res) => {
    const query = req.query.q;
    if (!query) return res.json([]);

    db.all(
        `SELECT id, username, public_key, avatar FROM users 
         WHERE id != ? AND username LIKE ? 
         LIMIT 20`,
        [req.user.id, `%${query}%`],
        (err, users) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to search users' });
            }
            res.json(users);
        }
    );
});

// Get recent chats with unread counts
app.get('/api/chats', authenticateToken, (req, res) => {
    const currentUserId = req.user.id;

    const sql = `
        SELECT 
            u.id, 
            u.username, 
            u.public_key,
            u.avatar,
            MAX(m.created_at) as last_message_time,
            SUM(CASE WHEN m.to_user = ? AND m.is_read = 0 THEN 1 ELSE 0 END) as unread_count
        FROM users u
        JOIN messages m ON (m.from_user = u.id AND m.to_user = ?) OR (m.from_user = ? AND m.to_user = u.id)
        WHERE u.id != ?
        GROUP BY u.id
        ORDER BY unread_count DESC, last_message_time DESC
    `;

    db.all(sql, [currentUserId, currentUserId, currentUserId, currentUserId], (err, chats) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to fetch chats' });
        }
        res.json(chats);
    });
});

// Get chat history with a specific user
app.get('/api/messages/:userId', authenticateToken, (req, res) => {
    const otherUserId = req.params.userId;
    const currentUserId = req.user.id;

    // Mark messages from this user as read
    db.run(
        'UPDATE messages SET is_read = 1 WHERE from_user = ? AND to_user = ? AND is_read = 0',
        [otherUserId, currentUserId],
        (err) => {
            if (err) console.error('Failed to mark messages as read:', err);
        }
    );

    db.all(
        `SELECT m.*, u.username as fromUsername 
         FROM messages m 
         JOIN users u ON m.from_user = u.id
         WHERE (from_user = ? AND to_user = ?) 
            OR (from_user = ? AND to_user = ?)
         ORDER BY created_at ASC`,
        [currentUserId, otherUserId, otherUserId, currentUserId],
        (err, messages) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch messages' });
            }

            // Format messages for frontend
            const formattedMessages = messages.map(msg => ({
                id: msg.id,
                fromUserId: msg.from_user,
                fromUsername: msg.fromUsername,
                toUserId: msg.to_user,
                encryptedContent: msg.encrypted_content,
                timestamp: msg.created_at,
                isRead: msg.is_read,
                received: msg.from_user !== currentUserId
            }));

            res.json(formattedMessages);
        }
    );
});

// Request credits
app.post('/api/credits/request', authenticateToken, (req, res) => {
    const { amount, transactionRef } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }

    db.run(
        'INSERT INTO credit_transactions (user_id, amount, transaction_ref, status) VALUES (?, ?, ?, ?)',
        [req.user.id, amount, transactionRef, 'pending'],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to create request' });
            }
            res.json({
                message: 'Credit request submitted for admin approval',
                transactionId: this.lastID
            });
        }
    );
});

// Get user's credit transactions
app.get('/api/credits/transactions', authenticateToken, (req, res) => {
    db.all(
        'SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC',
        [req.user.id],
        (err, transactions) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch transactions' });
            }
            res.json(transactions);
        }
    );
});

// Admin: Get all pending transactions
app.get('/api/admin/transactions/pending', authenticateToken, requireAdmin, (req, res) => {
    db.all(
        `SELECT ct.*, u.username, u.email 
         FROM credit_transactions ct 
         JOIN users u ON ct.user_id = u.id 
         WHERE ct.status = 'pending' 
         ORDER BY ct.created_at DESC`,
        (err, transactions) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch transactions' });
            }
            res.json(transactions);
        }
    );
});

// Admin: Approve transaction
app.post('/api/admin/transactions/:id/approve', authenticateToken, requireAdmin, (req, res) => {
    const transactionId = req.params.id;

    db.get('SELECT * FROM credit_transactions WHERE id = ?', [transactionId], (err, transaction) => {
        if (err || !transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        if (transaction.status !== 'pending') {
            return res.status(400).json({ error: 'Transaction already processed' });
        }

        db.serialize(() => {
            db.run(
                'UPDATE credit_transactions SET status = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?',
                ['approved', transactionId]
            );

            db.run(
                'UPDATE users SET credits = credits + ? WHERE id = ?',
                [transaction.amount, transaction.user_id],
                (err) => {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to update credits' });
                    }
                    res.json({ message: 'Transaction approved and credits added' });
                }
            );
        });
    });
});

// Admin: Reject transaction
app.post('/api/admin/transactions/:id/reject', authenticateToken, requireAdmin, (req, res) => {
    const transactionId = req.params.id;

    db.run(
        'UPDATE credit_transactions SET status = ? WHERE id = ? AND status = ?',
        ['rejected', transactionId, 'pending'],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to reject transaction' });
            }
            if (this.changes === 0) {
                return res.status(400).json({ error: 'Transaction not found or already processed' });
            }
            res.json({ message: 'Transaction rejected' });
        }
    );
});

// Admin: Get all users
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    db.all(
        'SELECT id, username, email, credits, created_at FROM users WHERE is_admin = 0',
        (err, users) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch users' });
            }
            res.json(users);
        }
    );
});

// Deduct credit for sending message
const deductCredit = (userId, callback) => {
    db.run(
        'UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0',
        [userId],
        function (err) {
            if (err) {
                callback(err, null);
            } else if (this.changes === 0) {
                callback(new Error('Insufficient credits'), null);
            } else {
                callback(null, true);
            }
        }
    );
};

// Socket.io for real-time chat
const connectedUsers = new Map();

io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('authenticate', (token) => {
        try {
            const verified = jwt.verify(token, JWT_SECRET);
            socket.userId = verified.id;
            socket.username = verified.username;
            connectedUsers.set(verified.id, socket.id);

            socket.emit('authenticated', { userId: verified.id, username: verified.username });

            // Broadcast online users
            io.emit('users-online', Array.from(connectedUsers.keys()));
        } catch (err) {
            socket.emit('auth-error', 'Invalid token');
        }
    });

    socket.on('send-message', (data) => {
        const { toUserId, encryptedContent } = data;

        if (!socket.userId) {
            return socket.emit('message-error', 'Not authenticated');
        }

        // Deduct credit
        deductCredit(socket.userId, (err, success) => {
            if (err) {
                return socket.emit('message-error', 'Insufficient credits. Please purchase more credits.');
            }

            // Save message to database
            db.run(
                'INSERT INTO messages (from_user, to_user, encrypted_content) VALUES (?, ?, ?)',
                [socket.userId, toUserId, encryptedContent],
                function (err) {
                    if (err) {
                        return socket.emit('message-error', 'Failed to send message');
                    }

                    const messageData = {
                        id: this.lastID,
                        fromUserId: socket.userId,
                        fromUsername: socket.username,
                        toUserId,
                        encryptedContent,
                        timestamp: new Date().toISOString()
                    };

                    // Send to recipient if online
                    const recipientSocketId = connectedUsers.get(toUserId);
                    if (recipientSocketId) {
                        io.to(recipientSocketId).emit('receive-message', messageData);
                    }

                    // Confirm to sender
                    socket.emit('message-sent', messageData);
                }
            );
        });
    });

    socket.on('disconnect', () => {
        if (socket.userId) {
            connectedUsers.delete(socket.userId);
            io.emit('users-online', Array.from(connectedUsers.keys()));
        }
        console.log('Client disconnected');
    });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`SecureConnect server running on port ${PORT}`);
    console.log(`Access at: http://YOUR_EC2_IP:${PORT}`);
    console.log(`Admin panel: http://YOUR_EC2_IP:${PORT}/admin-panel`);
});
