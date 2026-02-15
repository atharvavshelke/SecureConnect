Ronit --> here write how to do anyting and what u have done so far or just ignore this if u r lion /n
Atharva --> 
# SecureConnect

**End-to-End Encrypted Chat Application with Credit-Based Messaging System**

SecureConnect is a secure, real-time chat application featuring military-grade end-to-end encryption, a credit-based messaging system, and manual payment verification through an admin panel.

![SecureConnect](https://img.shields.io/badge/Encryption-E2E-00fff5)
![License](https://img.shields.io/badge/License-MIT-blue)
![Node](https://img.shields.io/badge/Node.js-20.x-green)

---

## Features

### 🔐 Security
- **End-to-End Encryption:** RSA-2048 + AES-256-GCM
- **Zero-Knowledge Architecture:** Server cannot read messages
- **Client-Side Key Generation:** Encryption keys never leave the browser
- **JWT Authentication:** Secure token-based auth
- **Password Hashing:** bcrypt with salt rounds

### 💬 Chat
- **Real-Time Messaging:** WebSocket-based instant communication
- **Online Status:** See who's available
- **Message History:** Encrypted message storage
- **User Discovery:** Browse all registered users

### 💳 Credit System
- **Pay-Per-Message:** 1 credit per message
- **Free Trial:** 10 credits included on registration
- **Manual Verification:** Admin approves credit purchases
- **Transaction History:** Track all credit requests

### 👨‍💼 Admin Panel
- **Transaction Management:** Review and approve credit purchases
- **User Overview:** Monitor all registered users
- **Real-Time Updates:** Live transaction notifications
- **Secure Access:** Admin-only authentication

---

## Technology Stack

- **Backend:** Node.js, Express
- **WebSocket:** Socket.io
- **Database:** SQLite
- **Encryption:** Web Crypto API
- **Authentication:** JWT, bcryptjs
- **Frontend:** Vanilla JavaScript, HTML5, CSS3

---

## Quick Start

### Prerequisites
- Node.js 20.x or higher
- npm 10.x or higher

### Installation

```bash
# Clone or download the repository
cd secureconnect

# Install dependencies
npm install

# Start the server
npm start
```

### Access

- **Application:** http://localhost:3000
- **Admin Panel:** http://localhost:3000/admin-panel

### Default Admin Credentials
- Username: `admin`
- Password: `admin123` (⚠️ Change this immediately!)

---

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed AWS EC2 deployment instructions.

### Quick Deploy

```bash
# On Ubuntu 24.04 LTS
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential
sudo npm install -g pm2

# Upload files and install
cd secureconnect
npm install

# Start with PM2
pm2 start server.js --name secureconnect
pm2 startup
pm2 save
```

---

## Configuration

### Environment Variables (Optional)

```bash
PORT=3000                    # Server port
NODE_ENV=production          # Environment
```

### Security Configuration

Edit `server.js` lines 15-17:

```javascript
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'your-secure-random-string-' + Math.random();
const ADMIN_PASSWORD = 'YourStrongPassword123!';
```

**⚠️ Important:** Always change the default admin password!

---

## How It Works

### Registration & Encryption

1. User creates an account
2. Browser generates RSA-2048 key pair
3. Public key stored on server
4. Private key stored in browser localStorage
5. 10 free credits added to account

### Sending Messages

1. User types message
2. Message encrypted with recipient's public key (AES-256-GCM)
3. Encrypted message sent via WebSocket
4. 1 credit deducted from sender
5. Recipient decrypts with their private key

### Credit Purchase

1. User requests credits
2. User makes payment externally
3. User submits transaction reference
4. Admin verifies payment
5. Admin approves transaction
6. Credits added to user account

---

## API Endpoints

### Authentication
- `POST /api/register` - Create new account
- `POST /api/login` - Login user
- `GET /api/user/me` - Get current user info

### Users
- `GET /api/users` - Get all users (authenticated)

### Credits
- `POST /api/credits/request` - Request credit purchase
- `GET /api/credits/transactions` - Get user's transactions

### Admin
- `GET /api/admin/transactions/pending` - Get pending transactions
- `POST /api/admin/transactions/:id/approve` - Approve transaction
- `POST /api/admin/transactions/:id/reject` - Reject transaction
- `GET /api/admin/users` - Get all users

---

## WebSocket Events

### Client → Server
- `authenticate` - Authenticate WebSocket connection
- `send-message` - Send encrypted message

### Server → Client
- `authenticated` - Authentication confirmed
- `receive-message` - New message received
- `message-sent` - Message sent confirmation
- `message-error` - Message sending error
- `users-online` - Online users update

---

## Database Schema

### users
```sql
id, username, password, email, credits, public_key, is_admin, created_at
```

### messages
```sql
id, from_user, to_user, encrypted_content, created_at
```

### credit_transactions
```sql
id, user_id, amount, transaction_ref, status, created_at, approved_at
```

---

## Security Considerations

### Client-Side
- Private keys never leave the browser
- All encryption happens in the browser
- localStorage used for key storage (consider more secure alternatives)

### Server-Side
- Messages stored encrypted
- Passwords hashed with bcrypt
- JWT tokens for authentication
- No plaintext message access

### Production Recommendations
1. Use HTTPS/WSS
2. Implement rate limiting
3. Add CAPTCHA to registration
4. Use secure key storage (Hardware Security Module)
5. Implement key backup/recovery system
6. Add two-factor authentication
7. Regular security audits
8. Database encryption at rest

---

## Project Structure

```
secureconnect/
├── server.js              # Main server file
├── package.json           # Dependencies
├── secureconnect.db      # SQLite database
├── public/
│   ├── index.html        # Landing/login page
│   ├── chat.html         # Chat interface
│   ├── css/
│   │   ├── style.css     # Landing page styles
│   │   ├── chat.css      # Chat styles
│   │   └── admin.css     # Admin styles
│   └── js/
│       ├── crypto.js     # E2E encryption module
│       ├── auth.js       # Authentication logic
│       ├── chat.js       # Chat functionality
│       └── admin.js      # Admin panel logic
├── admin/
│   └── admin.html        # Admin panel
├── DEPLOYMENT.md         # Deployment guide
└── README.md            # This file
```

---

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

Requires:
- Web Crypto API support
- WebSocket support
- LocalStorage support

---

## Limitations

1. **Key Recovery:** If user clears browser data, private key is lost
2. **Single Device:** Keys stored per browser, not synced across devices
3. **Manual Payments:** No automated payment gateway integration
4. **SQLite:** Not recommended for high-concurrency production use
5. **No File Sharing:** Text messages only

---

## Future Enhancements

- [ ] File and image encryption
- [ ] Group chats
- [ ] Key backup and recovery system
- [ ] Multi-device support
- [ ] Automated payment gateway integration
- [ ] Message read receipts
- [ ] Typing indicators
- [ ] Voice/video calls
- [ ] Mobile applications
- [ ] Message expiration (self-destruct)

---

## License

MIT License - See LICENSE file for details

---

## Disclaimer

This application is provided as-is for educational purposes. While it implements strong encryption, additional security measures should be implemented for production use. Always conduct security audits and follow best practices when handling sensitive data.

---

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

---

## Support

For deployment issues, see [DEPLOYMENT.md](DEPLOYMENT.md)

For security concerns, please report them privately.

---

**Built with ❤️ for privacy and security**
