# 🔒 SecureConnect

**SecureConnect** is a robust, feature-rich end-to-end encrypted (E2EE) messaging and voice-calling application. Built with security and privacy at its core, it ensures that your conversations—whether over text or voice—remain completely confidential.

![SecureConnect](https://img.shields.io/badge/Security-E2EE-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue)
![Dependencies](https://img.shields.io/badge/Dependencies-Up%20to%20date-success)

---

## ✨ Features

### 🛡️ Uncompromised Security
- **End-to-End Encryption (E2EE):** Utilizes `RSA-OAEP` (2048-bit) for secure key exchange and `AES-GCM` (256-bit) for message encryption.
- **Client-Side Cryptography:** Keys are generated, stored, and utilized entirely within the browser using the Web Crypto API. The server never sees your private keys or plaintext messages.
- **Secure Authentication:** Implementation of JWT-based authentication, bcrypt password hashing, and rate-limiting (`express-rate-limit`) to prevent brute-force attacks.
- **Helmet Protected:** HTTP headers are secured against common vulnerabilities.

### 💬 Real-Time Messaging & Calling
- **Instant Messaging:** Real-time text communication powered by `Socket.IO`.
- **Private & Group Chats:** Support for one-on-one encrypted messaging as well as secure group chats with shared encrypted keys.
- **Voice Calling:** High-quality, real-time voice calling using `WebRTC`. Supports peer-to-peer private calls and Mesh network-based group calls.

### 💰 Credit-Based System
- **Economy & Credits:** Users begin with free credits. Additional credits can be requested through the platform.
- **Administrative Control:** Admins can review, approve, or reject credit requests via a dedicated dashboard.

### 👨‍💻 Admin Panel
- Comprehensive dashboard for managing the platform.
- Capabilities to ban/unban users, delete accounts, and manage all credit transactions.
- Automated creation of a default admin account on initial startup.

### 🎨 Modern UI/UX
- Responsive, dynamic, and premium interface built with Vanilla CSS.
- Profile customization with avatar file uploads (`multer`).

---

## 🛠️ Technology Stack

**Frontend:**
- HTML5 / CSS3 (Vanilla, custom UI framework)
- Vanilla JavaScript
- Web Crypto API (for E2EE)
- WebRTC (for Voice Calls)

**Backend:**
- Node.js & Express.js
- Socket.IO (for WebSockets)
- SQLite3 (Relational database)

**Security & Utilities:**
- `bcryptjs` (Password Hashing)
- `jsonwebtoken` (Auth)
- `express-rate-limit` & `helmet` (Security Middleware)
- `multer` (File Uploads)

**DevOps:**
- GitHub Actions (CI/CD Pipeline)
- PM2 (Process Management)
- AWS EC2 Deployment (`deploy.yml`)

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v16.x or higher)
- [npm](https://www.npmjs.com/)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/SecureConnect.git
   cd SecureConnect
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup (Optional but recommended):**
   Create a `.env` file in the root directory and configure the following variables:
   ```env
   PORT=3000
   JWT_SECRET=your_super_secret_jwt_key
   ADMIN_PASSWORD=your_custom_admin_password
   NODE_ENV=development
   ```
   *Note: If not provided, the application will use secure default fallbacks.*

4. **Initialize the Database:**
   The SQLite database (`secureconnect.db`) will be automatically created and initialized upon starting the server.

5. **Start the server:**
   ```bash
   # For development (using nodemon)
   npm run dev

   # For production
   npm start
   ```

6. **Access the application:**
   Open your browser and navigate to `http://localhost:3000`.

### Default Admin Credentials
Upon the first startup, a default admin account is created if one does not exist:
- **Username:** `admin`
- **Password:** `Password@2026` (or the value set in `ADMIN_PASSWORD`)

---

## 🏗️ Architecture & Security Model

1. **Key Generation:** When a user registers, their device generates an RSA-2048 key pair.
2. **Key Storage:** The Public Key is sent to the server. The Private Key is encrypted using AES-GCM (derived from the user's password using PBKDF2) and then stored on the server for syncing across devices.
3. **Message Encryption:** 
   - A random AES-256 key is generated for every message.
   - The message is encrypted using this AES key.
   - The AES key is then encrypted using the recipient's RSA Public Key.
   - Both the encrypted message and the encrypted AES key are sent to the server.
4. **Message Decryption:** The recipient retrieves the payload, decrypts the AES key using their locally unencrypted RSA Private Key, and then decrypts the message.
5. **Group Encryption:** A group admin generates a communal AES key. This key is individually encrypted with every group member's RSA Public Key and distributed. All group messages are encrypted symmetrically with this group AES key.

---

## 🚢 Deployment

SecureConnect includes a pre-configured GitHub Actions workflow (`deploy.yml`) for deploying to an AWS EC2 instance.

**To deploy:**
1. Configure your repository secrets:
   - `HOST_DNS`: Your EC2 instance URL/IP.
   - `USERNAME`: SSH username (e.g., `ubuntu`).
   - `EC2_SSH_KEY`: Your SSH private key.
2. Push your changes to the `online` branch.
3. The GitHub Action will automatically pull the code, install dependencies, and restart the PM2 process.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
