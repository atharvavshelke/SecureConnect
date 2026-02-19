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
        credits INTEGER DEFAULT 500,
        public_key TEXT,
        encrypted_private_key TEXT,
        is_logged_in INTEGER DEFAULT 0,
        is_admin INTEGER DEFAULT 0,
        avatar TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (!err) {
            // Add columns if they don't exist (for existing databases)
            const columnsToAdd = [
                { name: "avatar", type: "TEXT" },
                { name: "encrypted_private_key", type: "TEXT" },
                { name: "is_logged_in", type: "INTEGER DEFAULT 0" }
            ];

            columnsToAdd.forEach(col => {
                db.run(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`, (err) => {
                    // Ignore error if column already exists
                });
            });

            // Reset is_logged_in on server start (in case of crash)
            db.run("UPDATE users SET is_logged_in = 0");
        }
    });

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
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Admin middleware
const requireAdmin = (req, res, next) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// User-only middleware (no admins allowed)
const requireNoAdmin = (req, res, next) => {
    if (req.user.isAdmin) {
        return res.status(403).json({ error: 'This feature is not available for admin accounts' });
    }
    next();
};

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/chat', authenticateToken, requireNoAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/admin-panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// User registration
app.post('/api/register', async (req, res) => {
    const { username, password, email, publicKey, encryptedPrivateKey } = req.body;

    if (!username || !password || !email) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (username.toLowerCase().includes('admin')) {
        return res.status(400).json({ error: 'Username "admin" is reserved' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
            'INSERT INTO users (username, password, email, public_key, encrypted_private_key, credits, is_logged_in) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [username, hashedPassword, email, publicKey, encryptedPrivateKey, 500], // 500 free credits, auto-login
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ error: 'Username or email already exists' });
                    }
                    console.error("Registration error:", err);
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
        console.error("Registration server error:", err);
        res.status(500).json({ error: 'Server error' });
    }
});

// User login
app.post('/api/login', (req, res) => {
    const { username, password, forceLogin } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        if (user.is_logged_in && !forceLogin) {
            return res.status(403).json({ error: 'User already logged in on another device.', requiresForceLogin: true });
        }

        // Set logged in status
        db.run('UPDATE users SET is_logged_in = 1 WHERE id = ?', [user.id], (updateErr) => {
            if (updateErr) {
                return res.status(500).json({ error: 'Login failed (status update)' });
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
                credits: user.credits,
                publicKey: user.public_key,
                encryptedPrivateKey: user.encrypted_private_key
            });
        });
    });
});

// User logout
app.post('/api/auth/logout', authenticateToken, (req, res) => {
    db.run('UPDATE users SET is_logged_in = 0 WHERE id = ?', [req.user.id], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.clearCookie('token');
        res.json({ message: 'Logged out successfully' });
    });
});

// Sync private key (for existing users or re-sync)
app.post('/api/user/sync-key', authenticateToken, requireNoAdmin, (req, res) => {
    const { encryptedPrivateKey } = req.body;
    if (!encryptedPrivateKey) {
        return res.status(400).json({ error: 'No key provided' });
    }

    db.run('UPDATE users SET encrypted_private_key = ? WHERE id = ?',
        [encryptedPrivateKey, req.user.id],
        (err) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to sync key' });
            }
            res.json({ message: 'Key synced successfully' });
        }
    );
});


// Get user info
app.get('/api/user/me', authenticateToken, (req, res) => {
    db.get('SELECT id, username, email, credits, public_key, encrypted_private_key, avatar FROM users WHERE id = ?',
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
app.post('/api/user/avatar', authenticateToken, requireNoAdmin, upload.single('avatar'), (req, res) => {
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
app.get('/api/users', authenticateToken, requireNoAdmin, (req, res) => {
    db.all(
        'SELECT id, username, public_key, avatar FROM users WHERE id != ? AND is_admin = 0',
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
app.get('/api/users/search', authenticateToken, requireNoAdmin, (req, res) => {
    const query = req.query.q;
    if (!query) return res.json([]);

    db.all(
        `SELECT id, username, public_key, avatar FROM users 
         WHERE id != ? AND username LIKE ? AND is_admin = 0
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
app.get('/api/chats', authenticateToken, requireNoAdmin, (req, res) => {
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
        WHERE u.id != ? AND u.is_admin = 0
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
app.get('/api/messages/:userId', authenticateToken, requireNoAdmin, (req, res) => {
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
app.post('/api/credits/request', authenticateToken, requireNoAdmin, (req, res) => {
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
app.get('/api/credits/transactions', authenticateToken, requireNoAdmin, (req, res) => {
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
            socket.isAdmin = verified.isAdmin; // Store admin status
            connectedUsers.set(verified.id, socket.id);

            // Broadcast online users (filter out admins)
            const onlineUsers = Array.from(io.sockets.sockets.values())
                .filter(s => s.userId && !s.isAdmin)
                .map(s => s.userId);
            io.emit('users-online', onlineUsers);
        } catch (err) {
            socket.emit('auth-error', 'Invalid token');
        }
    });

    socket.on('send-message', (data) => {
        const { toUserId, encryptedContent } = data;

        if (!socket.userId) {
            return socket.emit('message-error', 'Not authenticated');
        }

        if (socket.isAdmin) {
            return socket.emit('message-error', 'Admin accounts cannot send messages');
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
            const onlineUsers = Array.from(io.sockets.sockets.values())
                .filter(s => s.userId && !s.isAdmin)
                .map(s => s.userId);
            io.emit('users-online', onlineUsers);
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
