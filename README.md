<div align="center">
  <img src="https://img.shields.io/badge/Military--Grade%20Encryption-00FF41?style=for-the-badge&logo=shield&logoColor=black" alt="Encryption Badge" />
  <img src="https://img.shields.io/badge/WebRTC%20Audio%20Calls-00FF41?style=for-the-badge&logo=webrtc&logoColor=black" alt="WebRTC Badge" />
  
  <h1>🛡️ SecureConnect</h1>
  <p><strong>A Next-Generation, End-to-End Encrypted Communication Platform</strong></p>
  <p>SecureConnect is a cyberpunk-themed, zero-knowledge chat and voice calling application built for absolute privacy. No one reads your messages. No one listens to your calls. Not even the server.</p>
</div>

---

## 🚀 Key Features

### � Absolute Privacy (E2EE)
- **Zero-Knowledge Architecture:** The server operates strictly as a blind relay. Only the sender and recipient have the keys to unlock messages.
- **Client-Side Cryptography:** RSA-OAEP (2048-bit) for secure key exchange, and AES-GCM (256-bit) for ultra-fast message encryption. All keys are generated directly in your browser.
- **Hardened Key Derivation:** PBKDF2 with 600,000 iterations protects your locally-stored private keys from offline cracking.

### 💬 Next-Gen Communication
- **Real-Time Stealth Chat:** Lightning-fast, WebSocket-driven instant messaging.
- **Encrypted Voice Calls:** Peer-to-peer WebRTC audio calls seamlessly integrated entirely within the browser.
- **Group Mesh Networking:** Encrypted multi-user group chats and voice calls powered by decentralized WebRTC meshing.

### 💳 Built-In Economy
- **Credit Protocol:** 1 Message = 1 Credit. Every account starts with 10 free credits to test the waters.
- **Admin Verification Panel:** Secure backend dashboard to manually verify external fund transfers before dispersing credits.

### �️ Iron-Clad Server Security
- **Rate-Limiting Matrix:** Brute-force and credential stuffing attacks are stopped dead by progressive IP-based rate limiters on authentication endpoints.
- **Strict Headers & Cookies:** Built with Helmet.js to enforce strict HTTP security policies and `SameSite: strict` token cookies to eradicate CSRF vulnerabilities.

---

## 💻 Tech Stack

- **Backend Network:** Node.js, Express.js
- **Real-Time Relay:** Socket.io, WebRTC
- **Datastore:** SQLite3
- **Crypto Engine:** Native Web Crypto API
- **Authentication:** JWT, bcryptjs
- **Frontend Matrix:** Vanilla HTML5, CSS3 (Glassmorphism), JavaScript

---

## 🛠️ Quick Start

### 1. Requirements
- Node.js `20.x` or higher
- npm `10.x` or higher
- A modern browser with WebRTC and Web Crypto API support

### 2. Initialization

```bash
# Clone the repository
git clone https://github.com/atharvavshelke/SecureConnect.git
cd SecureConnect

# Install server dependencies
npm install

# Boot the relay server
node server.js
```

### 3. Access the Matrix
- **Main Terminal:** `http://localhost:3000`
- **Admin Dashboard:** `http://localhost:3000/admin-panel`
  - *Default login:* `admin` / `admin123` 
  - *(⚠️ WARNING: Change this immediately by setting the `ADMIN_PASSWORD` environment variable)*

---

## 📸 The Interface

SecureConnect boasts a sleek, cyberpunk-inspired UI featuring deep blacks, neon green highlights (`#00ff41`), and dynamic glassmorphism to immerse you in the hacker aesthetic.

*(Insert Screenshots Here)*

---

## 🌐 Deployment (Production)

SecureConnect requires HTTPS/WSS to function in production (browsers block Web Crypto/WebRTC on insecure HTTP connections unless running on `localhost`).

```bash
PORT=3000
NODE_ENV=production
JWT_SECRET=super_secret_hashing_string
ADMIN_PASSWORD=your_secure_password
```
For a detailed guide on setting up an Nginx reverse proxy with SSL on an AWS EC2 instance, refer to the included `DEPLOYMENT.md` guide.

---

## 📜 Legal & Disclaimer

**SecureConnect is provided as-is for educational and research purposes.** 

While the application utilizes industry-standard encryption protocols (RSA-2048, AES-256-GCM, WebRTC, PBKDF2), deploying a truly secure communication platform requires continuous security audits, secure server infrastructure, and a deep understanding of operational security (OPSEC). 

The creators take no responsibility for data breaches or misuse of this software.

---
<div align="center">
  <i>Stay Secure. Stay Hidden.</i>
</div>
