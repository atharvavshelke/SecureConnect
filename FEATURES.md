# Comprehensive Feature Documentation - SecureConnect

This document catalogues the exhaustive, nitty-gritty features, technical design decisions, and architectural implementation details of the SecureConnect platform.

## 1. Core Architecture & Stack

### Backend
*   **Runtime Environment:** Node.js (v16.x+)
*   **Web Framework:** Express.js (v4.18.2) for API routing and static file serving.
*   **Real-Time Transport:** Socket.IO (v4.6.1) for bidirectional WebSocket event emission (messaging, typing indicators, read receipts).
*   **Database:** SQLite3 (v5.1.6) relational file-based local storage (`secureconnect.db`).

### Frontend
*   **Templating/Views:** Vanilla HTML5 utilizing extensive `class` attributes for styling control without heavy frontend frameworks like React or Vue. Includes dynamic injection via EJS (v3.1.9) where applicable.
*   **Styling Engine:** Vanilla CSS. Uses custom CSS Variables (`--primary`, `--bg-color`) to support a cohesive, cyberpunk-inspired visual theme containing advanced features like Glassmorphism (`backdrop-filter`) and CSS micro-animations.
*   **Client Logic:** Vanilla JavaScript, modularized into specific concerns (`auth.js`, `chat.js`, `crypto.js`, `admin.js`).

## 2. Cryptographic Implementation (Client-Side Authority)

The defining characteristic of SecureConnect is its uncompromising "Zero Trust" architecture heavily reliant on native Web Interfaces.

### Asymmetric Cryptography (Identity & Key Exchange)
*   **Algorithm:** `RSA-OAEP` (2048-bit length).
*   **Storage Mechanism:** Generated natively in the browser via the `window.crypto.subtle` API upon user creation.
*   **Public Key Distribution:** Uploaded to the backend in string format for other users to fetch and encrypt payloads targeted to the owner.
*   **Private Key Protection:** The Private Key is encrypted via AES-GCM *before* it leaves the browser using a high-entropy symmetric key derived from the user's password utilizing the `PBKDF2` algorithm. It is then securely synced to the server, meaning the server only holds cipher-text.

### Symmetric Cryptography (Payload Protection)
*   **Algorithm:** `AES-GCM` (256-bit).
*   **Direct Messaging Mechanism:** Every individual text payload triggers the client to generate a new randomized 256-bit AES symmetric key. The message is encrypted. The symmetric key is then encrypted with the recipient's public RSA key. Both are transmitted to the server.
*   **Group Messaging Mechanism:** Group creators locally generate a communal AES-256 group key. As members join, the group admin's client individually encrypts this communal group key using each specific member's RSA public key.

## 3. Real-Time Communication Suites

### Secure Messaging
*   **Instant Delivery:** Websocket event listeners securely shuttle payloads.
*   **Typing Indicators:** Real-time visibility when parties are drafting responses.
*   **Read Receipts:** Cryptographically verified read status updates.
*   **Group Chat Support:** Support for multi-tenant secure rooms with specific Admin/Member tiering configurations.

### Peer-to-Peer A/V Transmissions
*   **Protocol:** WebRTC (Web Real-Time Communication).
*   **Signaling:** Socket.IO is utilized strictly as a signaling server to exchange SDP (Session Description Protocol) offers and ICE candidates.
*   **Media Transport:** Audio and Video tracks are streamed via Peer-to-Peer data channels entirely bypassing the node server.
*   **Stream Encryption:** Native DTLS-SRTP (Datagram Transport Layer Security - Secure Real-time Transport Protocol).
*   **Group Calling Topology:** Implements a fully distributed Mesh Network where every participant negotiates and maintains an independent, encrypted P2P stream with every other individual participant in the secure room.

## 4. Application Security & Middleware

SecureConnect utilizes several backend middleware packages to harden the application against standard attacks.

*   **Password Hashing:** `bcryptjs` applies multiple salting rounds to authentication credentials before SQLite insertion.
*   **Authentication Flow:** Stateless JWTs (`jsonwebtoken`) manage session longevity and route protection.
*   **Header Hardening:** Standard deployment of `helmet` to manage Content Security Policies, XSS filtering, and prevent Clickjacking.
*   **Brute Force Mitigation:** `express-rate-limit` governs the `/login` and `/register` endpoints to aggressively throttle repeated failed authentication attempts.
*   **Input Handling:** File uploads (avatars) are strictly governed by `multer`. Hard limits are placed (`2MB`), and mimetype checks enforce image-only injections to prevent arbitrary code execution attacks.

## 5. Economic & Administrative Control (The Credit System)

To mitigate spam, sybil attacks, and resource exhaustion, SecureConnect implements a managed economy.

*   **Regulated Registration:** New users are granted a default sum of 500 Credits upon account generation. Actions across the network decrement from this pool.
*   **Top-Up Requests:** Users can file requests for more credits manually.
*   **Administrative Dashboard:** Protected `/admin-panel` route restricted solely to users with the `is_admin` SQL flag.
*   **Moderation Tooling:** Admins execute commands to process credit requests, globally ban rogue identities, and forcefully purge users from the database. A default admin (user: admin) is procedurally generated on first-run.

## 6. Layout & Ecosystem Topology

*   **Landing (`index.html`):** Marketing material exhibiting a "Bento-style" grid layout heavily emphasizing zero-knowledge protocols. 
*   **Philosophy (`about.html`):** In-depth textual overview of the project's adherence to mass-surveillance resistance.
*   **Dispatch (`contact.html`):** Terminal-themed visual contact page equipped with an example PGP block for maximum aesthetic compliance.
*   **Application Gateway (`login.html`):** The primary registration and authentication portal hooking into `crypto.js` to establish RSA keypairs.
*   **The Hub (`chat.html`):** The core application dashboard housing the UI components for messaging, groups, and WebRTC streaming functionalities. 
