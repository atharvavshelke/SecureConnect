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
        is_banned INTEGER DEFAULT 0,
        avatar TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (!err) {
            // Add columns if they don't exist (for existing databases)
            const columnsToAdd = [
                { name: "avatar", type: "TEXT" },
                { name: "encrypted_private_key", type: "TEXT" },
                { name: "is_logged_in", type: "INTEGER DEFAULT 0" },
                { name: "is_banned", type: "INTEGER DEFAULT 0" }
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

    // Groups table
    db.run(`CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users (id)
    )`);

    // Group members table
    db.run(`CREATE TABLE IF NOT EXISTS group_members (
        group_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT DEFAULT 'member', -- 'admin' or 'member'
        encrypted_group_key TEXT, -- Group AES key encrypted with member's RSA public key
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, user_id),
        FOREIGN KEY (group_id) REFERENCES groups (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`, (err) => {
        if (!err) {
            // Add columns for existing databases
            db.run("ALTER TABLE group_members ADD COLUMN encrypted_group_key TEXT", (err) => {
                // Ignore error if column already exists
            });
            db.run("ALTER TABLE group_members ADD COLUMN last_read_at DATETIME DEFAULT '2026-01-01 00:00:00'", (err) => {
                // Ignore error if column already exists
            });
        }
    });

    // Group messages table
    db.run(`CREATE TABLE IF NOT EXISTS group_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        from_user INTEGER NOT NULL,
        encrypted_content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups (id),
        FOREIGN KEY (from_user) REFERENCES users (id)
    )`);

    // Create default admin user if not exists
    db.get("SELECT * FROM users WHERE LOWER(username) = 'admin'", (err, row) => {
        if (!row) {
            const hashedPassword = bcrypt.hashSync(ADMIN_PASSWORD, 10);
            db.run(
                "INSERT INTO users (username, password, email, credits, is_admin) VALUES (?, ?, ?, ?, ?)",
                ['admin', hashedPassword, 'admin@secureconnect.local', 999999, 1]
            );
            console.log('Default admin account created - Username: admin, Password: admin123');
        } else if (row.username !== 'admin') {
            // Standardize existing admin username to lowercase
            db.run("UPDATE users SET username = 'admin' WHERE id = ?", [row.id]);
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
app.use(express.static(path.join(__dirname, 'public')));
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

        // Check if user is banned
        db.get('SELECT is_banned FROM users WHERE id = ?', [verified.id], (err, user) => {
            if (err || (user && user.is_banned)) {
                return res.status(403).json({ error: 'Your account has been banned' });
            }
            next();
        });
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

    // Username validation: all lowercase, alphanumeric, 5-32 characters
    const usernameRegex = /^[a-z0-9]{5,32}$/;
    if (!usernameRegex.test(username)) {
        return res.status(400).json({ error: 'Username must be lowercase alphanumeric and between 5-32 characters long' });
    }

    if (username.toLowerCase().includes('admin')) {
        return res.status(400).json({ error: 'Username "admin" is reserved' });
    }

    // Email validation: proper format, no plus-addressing
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email) || email.includes('+')) {
        return res.status(400).json({ error: 'Please provide a valid email address. Plus-addressing (e.g., user+test@gmail.com) is not allowed.' });
    }

    // Password validation: min 8 chars, one uppercase, one special char
    const passwordRegex = /^(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long, contain at least one uppercase letter and one special character' });
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
    let { username, password, forceLogin } = req.body;
    if (username) username = username.toLowerCase();

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

        if (user.is_banned) {
            return res.status(403).json({ error: 'Your account has been banned' });
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
        'SELECT id, username, public_key, avatar FROM users WHERE id != ? AND is_admin = 0 AND is_banned = 0',
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
    const excludeGroupId = req.query.excludeGroupId;
    if (!query) return res.json([]);

    let sql = `SELECT id, username, public_key, avatar FROM users 
               WHERE id != ? AND username LIKE ? AND is_admin = 0 AND is_banned = 0`;
    let params = [req.user.id, `%${query}%`];

    if (excludeGroupId) {
        sql += ` AND id NOT IN (SELECT user_id FROM group_members WHERE group_id = ?)`;
        params.push(excludeGroupId);
    }

    sql += ` LIMIT 20`;

    db.all(sql, params, (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to search users' });
        }
        res.json(users);
    });
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
        WHERE u.id != ? AND u.is_admin = 0 AND u.is_banned = 0
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
        'SELECT id, username, email, credits, is_banned, created_at FROM users WHERE is_admin = 0',
        (err, users) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch users' });
            }
            res.json(users);
        }
    );
});

// Admin: Ban/Unban user
app.post('/api/admin/users/:id/ban', authenticateToken, requireAdmin, (req, res) => {
    const userId = req.params.id;
    const { ban } = req.body; // true to ban, false to unban

    db.run(
        'UPDATE users SET is_banned = ? WHERE id = ? AND is_admin = 0',
        [ban ? 1 : 0, userId],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to update user status' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'User not found or is an admin' });
            }
            res.json({ message: ban ? 'User banned successfully' : 'User unbanned successfully' });
        }
    );
});

// Admin: Delete user
app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, (req, res) => {
    const userId = req.params.id;

    db.serialize(() => {
        // Delete user's messages, group memberships, etc. to maintain referential integrity if needed
        // For simplicity, we'll just delete the user and rely on the fact that we might need to clean up related data
        // but often in small apps we just delete the user.
        db.run('DELETE FROM users WHERE id = ? AND is_admin = 0', [userId], function (err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to delete user' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'User not found or is an admin' });
            }
            res.json({ message: 'User deleted successfully' });
        });
    });
});

// --- Group API Routes ---

// Create a new group
app.post('/api/groups', authenticateToken, (req, res) => {
    const { name, description, encryptedGroupKey } = req.body;
    if (!name) return res.status(400).json({ error: 'Group name is required' });

    console.log('Group creation request:', { name, description, userId: req.user.id });

    db.serialize(() => {
        db.run('INSERT INTO groups (name, description, created_by) VALUES (?, ?, ?)',
            [name, description, req.user.id],
            function (err) {
                if (err) {
                    console.error('Error creating group (INSERT INTO groups):', err);
                    return res.status(500).json({ error: 'Failed to create group' });
                }

                const groupId = this.lastID;
                console.log('Group created with ID:', groupId);

                // Add creator as member with their encrypted version of the group key
                db.run('INSERT INTO group_members (group_id, user_id, role, encrypted_group_key) VALUES (?, ?, ?, ?)',
                    [groupId, req.user.id, 'admin', encryptedGroupKey],
                    (err) => {
                        if (err) {
                            console.error('Error adding creator to group (INSERT INTO group_members):', err);
                            return res.status(500).json({ error: 'Failed to add creator to group' });
                        }
                        console.log('Creator added to group_members successfully');
                        res.json({ id: groupId, name, description });
                    }
                );
            }
        );
    });
});

// Get user's groups with unread counts
app.get('/api/groups', authenticateToken, (req, res) => {
    db.all(`
        SELECT 
            g.*, 
            gm.encrypted_group_key,
            (SELECT COUNT(*) FROM group_messages WHERE group_id = g.id AND created_at > gm.last_read_at) as unread_count
        FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.user_id = ?
        ORDER BY g.created_at DESC`,
        [req.user.id],
        (err, groups) => {
            if (err) return res.status(500).json({ error: 'Failed to fetch groups' });
            res.json(groups);
        }
    );
});

// Get group members
app.get('/api/groups/:id/members', authenticateToken, (req, res) => {
    db.all(`
        SELECT u.id, u.username, u.avatar, gm.role, gm.joined_at
        FROM users u
        JOIN group_members gm ON u.id = gm.user_id
        WHERE gm.group_id = ?`,
        [req.params.id],
        (err, members) => {
            if (err) return res.status(500).json({ error: 'Failed to fetch group members' });
            res.json(members);
        }
    );
});

// Add user to group
app.post('/api/groups/:id/members', authenticateToken, (req, res) => {
    const { userId, encryptedGroupKey } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID is required' });

    db.run('INSERT INTO group_members (group_id, user_id, encrypted_group_key) VALUES (?, ?, ?)',
        [req.params.id, userId, encryptedGroupKey],
        (err) => {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'User is already a member' });
                }
                return res.status(500).json({ error: 'Failed to add member' });
            }
            res.json({ message: 'Member added successfully' });
        }
    );
});

// Remove user from group (Kick) or Leave group
app.delete('/api/groups/:id/members/:userId', authenticateToken, (req, res) => {
    const groupId = req.params.id;
    const targetUserId = parseInt(req.params.userId);
    const requesterId = req.user.id;

    db.get('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, requesterId],
        (err, requesterRow) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (!requesterRow) return res.status(403).json({ error: 'You are not a member of this group' });

            const isLeave = requesterId === targetUserId;
            const isAdmin = requesterRow.role === 'admin';

            if (!isLeave && !isAdmin) {
                return res.status(403).json({ error: 'Only group admins can remove members' });
            }

            db.run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, targetUserId], (err) => {
                if (err) return res.status(500).json({ error: 'Failed to remove member' });

                // Check if any members left
                db.get('SELECT COUNT(*) as memberCount FROM group_members WHERE group_id = ?', [groupId], (err, row) => {
                    if (!err && row.memberCount === 0) {
                        db.run('DELETE FROM groups WHERE id = ?', [groupId]);
                        db.run('DELETE FROM group_messages WHERE group_id = ?', [groupId]);
                    }
                });

                res.json({ message: isLeave ? 'Left group successfully' : 'Member removed successfully' });
            });
        }
    );
});

// Get group messages
app.get('/api/groups/:id/messages', authenticateToken, (req, res) => {
    const groupId = req.params.id;
    const userId = req.user.id;

    db.all(`
        SELECT gm.*, u.username as fromUsername
        FROM group_messages gm
        JOIN users u ON gm.from_user = u.id
        WHERE gm.group_id = ?
        ORDER BY gm.created_at ASC`,
        [groupId],
        (err, messages) => {
            if (err) return res.status(500).json({ error: 'Failed to fetch messages' });

            // Mark as read
            db.run('UPDATE group_members SET last_read_at = CURRENT_TIMESTAMP WHERE group_id = ? AND user_id = ?',
                [groupId, userId]);

            res.json(messages);
        }
    );
});

// Get group status (online members)
app.get('/api/groups/:id/status', authenticateToken, (req, res) => {
    const groupId = req.params.id;
    db.all('SELECT user_id FROM group_members WHERE group_id = ?', [groupId], (err, members) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch status' });

        let onlineCount = 0;
        members.forEach(member => {
            if (connectedUsers.has(member.user_id)) {
                onlineCount++;
            }
        });

        res.json({
            onlineCount,
            totalCount: members.length
        });
    });
});

// Mark group as read
app.post('/api/groups/:id/read', authenticateToken, (req, res) => {
    db.run('UPDATE group_members SET last_read_at = CURRENT_TIMESTAMP WHERE group_id = ? AND user_id = ?',
        [req.params.id, req.user.id],
        (err) => {
            if (err) return res.status(500).json({ error: 'Failed to mark as read' });
            res.json({ message: 'Marked as read' });
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
const activeGroupCalls = new Map(); // groupId -> Set of userIds

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

    socket.on('join-group', (groupId) => {
        if (!socket.userId) return;
        // Verify membership
        db.get('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, socket.userId], (err, row) => {
            if (row) {
                socket.join(`group_${groupId}`);
            }
        });
    });

    socket.on('send-group-message', (data) => {
        const { groupId, encryptedContent } = data;
        if (!socket.userId) return socket.emit('message-error', 'Not authenticated');

        // Verify membership
        db.get('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, socket.userId], (err, member) => {
            if (err || !member) return socket.emit('message-error', 'Not a member of this group');

            deductCredit(socket.userId, (err) => {
                if (err) return socket.emit('message-error', err.message);

                db.run('INSERT INTO group_messages (group_id, from_user, encrypted_content) VALUES (?, ?, ?)',
                    [groupId, socket.userId, encryptedContent],
                    function (err) {
                        if (err) return;

                        const messageData = {
                            id: this.lastID,
                            groupId,
                            fromUserId: socket.userId,
                            fromUsername: socket.username,
                            encryptedContent,
                            created_at: new Date().toISOString()
                        };

                        io.to(`group_${groupId}`).emit('receive-group-message', messageData);
                    }
                );
            });
        });
    });

    // --- WebRTC Signaling ---

    socket.on('call-request', (data) => {
        // data: { toUserId, type: 'voice', offer }
        const { toUserId } = data;
        const recipientSocketId = connectedUsers.get(parseInt(toUserId));
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('incoming-call', {
                fromUserId: socket.userId,
                fromUsername: socket.username,
                offer: data.offer,
                type: data.type
            });
        }
    });

    socket.on('call-response', (data) => {
        // data: { toUserId, accepted, answer }
        const { toUserId } = data;
        const recipientSocketId = connectedUsers.get(parseInt(toUserId));
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('call-answered', {
                fromUserId: socket.userId,
                accepted: data.accepted,
                answer: data.answer
            });
        }
    });

    socket.on('ice-candidate', (data) => {
        const { toUserId, candidate } = data;
        const recipientSocketId = connectedUsers.get(parseInt(toUserId));
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('ice-candidate', {
                fromUserId: socket.userId,
                candidate: candidate
            });
        }
    });

    socket.on('call-ended', (data) => {
        const { toUserId } = data;
        const recipientSocketId = connectedUsers.get(parseInt(toUserId));
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('call-ended', {
                fromUserId: socket.userId
            });
        }
    });

    // --- Mesh Group Voice Calling ---
    socket.on('group-call-request', (data) => {
        const { groupId } = data;
        if (!socket.userId) return;

        db.get('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, socket.userId], (err, member) => {
            if (err || !member) return socket.emit('call-error', 'Not a member of this group');

            // Initialize group call tracking if it doesn't exist
            if (!activeGroupCalls.has(groupId)) {
                activeGroupCalls.set(groupId, new Set());
            }

            // Get other online group members
            db.all('SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ?', [groupId, socket.userId], (err, members) => {
                if (err) return;

                db.get('SELECT name FROM groups WHERE id = ?', [groupId], (err, group) => {
                    if (err || !group) return;

                    members.forEach(m => {
                        const recipientSocketId = connectedUsers.get(m.user_id);
                        if (recipientSocketId) {
                            io.to(recipientSocketId).emit('incoming-group-call', {
                                groupId: groupId,
                                groupName: group.name,
                                fromUserId: socket.userId,
                                fromUsername: socket.username
                            });
                        }
                    });
                });
            });
        });
    });

    socket.on('join-group-call', (data) => {
        const { groupId } = data;
        if (!socket.userId) return;

        if (!activeGroupCalls.has(groupId)) {
            activeGroupCalls.set(groupId, new Set());
        }

        const participants = activeGroupCalls.get(groupId);

        // Notify existing participants that someone is joining
        participants.forEach(participantId => {
            const recipientSocketId = connectedUsers.get(participantId);
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('user-joined-group-call', {
                    groupId: groupId,
                    userId: socket.userId,
                    username: socket.username
                });
            }
        });

        // Send the current list of participants to the new joiner
        socket.emit('group-call-participants', {
            groupId: groupId,
            participants: Array.from(participants)
        });

        // Add the new user to the call
        participants.add(socket.userId);
    });

    socket.on('leave-group-call', (data) => {
        const { groupId } = data;
        if (!socket.userId || !activeGroupCalls.has(groupId)) return;

        const participants = activeGroupCalls.get(groupId);
        participants.delete(socket.userId);

        if (participants.size === 0) {
            activeGroupCalls.delete(groupId);
        } else {
            // Notify others
            participants.forEach(participantId => {
                const recipientSocketId = connectedUsers.get(participantId);
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit('user-left-group-call', {
                        groupId: groupId,
                        userId: socket.userId
                    });
                }
            });
        }
    });

    socket.on('group-call-offer', (data) => {
        const { toUserId, groupId, offer } = data;
        const recipientSocketId = connectedUsers.get(parseInt(toUserId));
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('group-call-offer', {
                fromUserId: socket.userId,
                groupId: groupId,
                offer: offer
            });
        }
    });

    socket.on('group-call-answer', (data) => {
        const { toUserId, groupId, answer } = data;
        const recipientSocketId = connectedUsers.get(parseInt(toUserId));
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('group-call-answer', {
                fromUserId: socket.userId,
                groupId: groupId,
                answer: answer
            });
        }
    });

    socket.on('group-ice-candidate', (data) => {
        const { toUserId, groupId, candidate } = data;
        const recipientSocketId = connectedUsers.get(parseInt(toUserId));
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('group-ice-candidate', {
                fromUserId: socket.userId,
                groupId: groupId,
                candidate: candidate
            });
        }
    });

    // --- Validated Credit Deduction for Calls ---
    socket.on('call-connected', (data) => {
        // Only deduct for the caller (or someone joining a group call)
        // to avoid double charging. We'll rely on the client emitting this exactly once per successful outgoing leg.
        if (!socket.userId) return;

        deductCredit(socket.userId, (err, success) => {
            if (err) {
                socket.emit('call-error', 'Insufficient credits for calling. Call will be disconnected.');
            } else {
                // Send an updated credit count back
                db.get('SELECT credits FROM users WHERE id = ?', [socket.userId], (err, row) => {
                    if (!err && row) {
                        socket.emit('credits-updated', { credits: row.credits });
                    }
                });
            }
        });
    });

    socket.on('call-ended', (data) => {
        const { toUserId } = data;
        const recipientSocketId = connectedUsers.get(parseInt(toUserId));
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('call-ended', {
                fromUserId: socket.userId
            });
        }
    });

    socket.on('disconnect', () => {
        if (socket.userId) {
            // Cleanup group calls
            for (const [groupId, participants] of activeGroupCalls.entries()) {
                if (participants.has(socket.userId)) {
                    participants.delete(socket.userId);

                    if (participants.size === 0) {
                        activeGroupCalls.delete(groupId);
                    } else {
                        participants.forEach(participantId => {
                            const recipientSocketId = connectedUsers.get(participantId);
                            if (recipientSocketId) {
                                io.to(recipientSocketId).emit('user-left-group-call', {
                                    groupId: groupId,
                                    userId: socket.userId
                                });
                            }
                        });
                    }
                }
            }

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