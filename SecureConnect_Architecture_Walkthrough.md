# SecureConnect — Express.js vs Node.js Usage & Working Diagram

## Express.js vs Node.js: Where Each Is Used

Express.js is a **framework built on top of Node.js**. In SecureConnect, they serve distinct roles. Here's a clean separation:

---

### 🟢 Pure Node.js (No Express)

These files use **only Node.js core modules** or npm packages that are unrelated to Express. Express is never imported or used.

| File | What It Does | Node.js APIs / Packages Used |
|------|-------------|------------------------------|
| [env.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/config/env.js) | Loads environment variables | `dotenv`, `process.env`, `process.exit` |
| [db.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/config/db.js) | Initializes Sequelize/SQLite DB, seeds admin | `bcryptjs`, `sequelize`, `console` |
| [models/index.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/models/index.js) | Defines Sequelize models & associations | `sequelize` ORM |
| [User.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/models/User.js), [Message.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/models/Message.js), [Group.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/models/Group.js), etc. | Individual Sequelize model definitions | `sequelize` DataTypes |
| [socketManager.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/sockets/socketManager.js) | Manages Socket.IO connections, JWT auth for WS | `socket.io`, `jsonwebtoken`, `redis` |
| [chatEvents.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/sockets/events/chatEvents.js) | Handles `send-message` socket event | Sequelize `Message.create()` |
| [webrtcEvents.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/sockets/events/webrtcEvents.js) | WebRTC signaling (call/answer/ICE) | Socket.IO events only |
| [groupEvents.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/sockets/events/groupEvents.js) | Group chat/call socket events | Socket.IO + Sequelize |
| [creditHelper.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/sockets/utils/creditHelper.js) | Credit deduction logic | Sequelize `User` model |
| [asyncHandler.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/middleware/asyncHandler.js) | Generic async error wrapper | Pure JS (wraps promises) |
| **All frontend JS** (`public/js/*`) | Client-side browser code | Browser APIs (`fetch`, `localStorage`, `io()`) |

---

### 🔵 Express.js (The HTTP Framework Layer)

These files **import or depend on `express`** — they define routes, use `express.Router()`, or use Express middleware APIs (`req`, `res`, `next`).

| File | What It Does | Express APIs Used |
|------|-------------|-------------------|
| [server.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/server.js) | **Main entry point** — creates Express app, mounts middleware & routes, starts HTTP server | `express()`, `app.use()`, `app.get()`, `express.json()`, `express.static()`, `http.createServer(app)` |
| [authRoutes.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/routes/authRoutes.js) | Auth endpoints (`/register`, `/login`, `/logout`) | `express.Router()`, `router.post()` |
| [userRoutes.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/routes/userRoutes.js) | User profile & key endpoints | `express.Router()`, `router.get/post()` |
| [messageRoutes.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/routes/messageRoutes.js) | Message history endpoints | `express.Router()`, `router.get()` |
| [creditRoutes.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/routes/creditRoutes.js) | Credit balance/purchase endpoints | `express.Router()` |
| [adminRoutes.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/routes/adminRoutes.js) | Admin dashboard endpoints | `express.Router()`, `requireAdmin` middleware |
| [groupRoutes.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/routes/groupRoutes.js) | Group CRUD endpoints | `express.Router()` |
| [authController.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/controllers/authController.js) | Register/login/logout handlers | `(req, res)` Express handler functions |
| [userController.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/controllers/userController.js) | User profile handlers | `(req, res)` |
| [messageController.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/controllers/messageController.js) | Message retrieval handlers | `(req, res)` |
| [creditController.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/controllers/creditController.js) | Credit logic handlers | `(req, res)` |
| [adminController.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/controllers/adminController.js) | Admin actions (ban, delete, stats) | `(req, res)` |
| [groupController.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/controllers/groupController.js) | Group CRUD handlers | `(req, res)` |
| [auth.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/middleware/auth.js) | JWT authentication middleware | `(req, res, next)` Express middleware |
| [rateLimit.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/middleware/rateLimit.js) | Rate limiting middleware | `express-rate-limit` (Express middleware) |
| [errorHandler.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/middleware/errorHandler.js) | Global error handler | `(err, req, res, next)` Express error middleware |
| [upload.js](file:///c:/Users/ronro/OneDrive/Documents/py-pro/SecureConnect/src/config/upload.js) | File upload config | `multer` (Express middleware) |

---

### 🟡 Key Distinction Summary

> [!IMPORTANT]
> **Node.js** is the runtime — it powers everything. **Express.js** is only used for the **HTTP request/response cycle** (routes, middleware, serving pages). **Socket.IO**, **Sequelize**, **JWT**, and the **frontend code** all run on Node.js but do NOT use Express.

---

## Complete Working Diagram

```mermaid
graph TB
    subgraph CLIENT["🌐 Browser (Frontend)"]
        HTML["HTML Pages<br/>index, login, chat,<br/>admin, contact, about, 404"]
        CSS["CSS Stylesheets<br/>chat.css, admin.css,<br/>glassmorphism.css, etc."]
        JS_MODULES["JS Modules"]
        
        subgraph JS_MODULES_DETAIL["Frontend JavaScript"]
            AUTH_JS["auth.js<br/>Login/Register UI"]
            CHAT_JS["chat.js<br/>Chat UI Logic"]
            ADMIN_JS["admin.js<br/>Admin Dashboard"]
            API_MOD["api.js<br/>HTTP fetch wrapper"]
            SOCKET_MOD["socket.js<br/>Socket.IO client"]
            WEBRTC_MOD["webrtc.js<br/>Video/Audio calls"]
            UI_MOD["ui.js<br/>UI helpers"]
            CRYPTO_JS["crypto.js<br/>E2E Encryption"]
            ADMIN_API["adminApi.js<br/>Admin fetch wrapper"]
        end
    end

    subgraph SERVER["⚙️ Node.js Runtime (server.js)"]
        subgraph EXPRESS_LAYER["Express.js Layer (HTTP)"]
            MW["Middleware Stack"]
            MW_HELMET["helmet — Security headers"]
            MW_JSON["express.json — Body parser"]
            MW_COOKIE["cookie-parser"]
            MW_SESSION["express-session"]
            MW_STATIC["express.static — Serves /public"]
            MW_RATE["express-rate-limit"]
            MW_AUTH["auth.js — JWT verify middleware"]
            MW_ERR["errorHandler.js — Global error handler"]
            
            subgraph ROUTES["Express Routes"]
                R_AUTH["authRoutes<br/>POST /api/register<br/>POST /api/login<br/>POST /api/auth/logout"]
                R_USER["userRoutes<br/>GET/POST /api/user/*"]
                R_MSG["messageRoutes<br/>GET /api/messages/*"]
                R_CREDIT["creditRoutes<br/>GET/POST /api/credits/*"]
                R_ADMIN["adminRoutes<br/>GET/POST /api/admin/*"]
                R_GROUP["groupRoutes<br/>CRUD /api/groups/*"]
                R_PAGES["Page Routes<br/>GET /, /login, /chat,<br/>/admin-panel, /about, /contact"]
            end

            subgraph CONTROLLERS["Controllers"]
                C_AUTH["authController<br/>register, login, logout, syncKey"]
                C_USER["userController<br/>profile, users list"]
                C_MSG["messageController<br/>chat history"]
                C_CREDIT["creditController<br/>balance, purchase"]
                C_ADMIN["adminController<br/>ban, delete, stats"]
                C_GROUP["groupController<br/>create, join, leave, list"]
            end
        end

        subgraph SOCKETIO_LAYER["Socket.IO Layer (WebSocket)"]
            SM["socketManager.js<br/>JWT auth on connect"]
            REDIS["Redis Adapter<br/>(optional, for scaling)"]
            
            subgraph SOCKET_EVENTS["Socket Events"]
                SE_CHAT["chatEvents.js<br/>send-message → receive-message"]
                SE_GROUP["groupEvents.js<br/>group messaging & calls"]
                SE_WEBRTC["webrtcEvents.js<br/>call, answer, ICE candidates"]
            end
            
            CREDIT_HELPER["creditHelper.js<br/>Deduct credits per message"]
        end

        subgraph DATA_LAYER["Data Layer (Sequelize ORM)"]
            SEQ["Sequelize Instance<br/>SQLite dialect"]
            
            subgraph MODELS["Models"]
                M_USER["User"]
                M_MSG["Message"]
                M_GROUP["Group"]
                M_GMEMBER["GroupMember"]
                M_GMSG["GroupMessage"]
                M_CREDIT["CreditTransaction"]
            end
        end

        ENV["env.js<br/>dotenv config<br/>PORT, JWT_SECRET,<br/>ADMIN_PASSWORD"]
        DB_INIT["db.js<br/>initDb — sync tables,<br/>seed admin user"]
    end

    subgraph DATABASE["💾 SQLite Database"]
        SQLITE["secureconnect.db"]
    end

    %% Client → Server connections
    API_MOD -->|"HTTP REST<br/>fetch() + JWT"| MW
    SOCKET_MOD -->|"WebSocket<br/>socket.io-client"| SM
    WEBRTC_MOD -->|"WebRTC signaling<br/>via Socket.IO"| SE_WEBRTC
    MW_STATIC -->|"Serves static files"| HTML
    MW_STATIC -->|"Serves static files"| CSS
    MW_STATIC -->|"Serves static files"| JS_MODULES

    %% Express internal flow
    MW --> MW_HELMET --> MW_JSON --> MW_COOKIE --> MW_SESSION --> MW_STATIC
    MW_STATIC --> MW_RATE
    MW_RATE --> MW_AUTH
    MW_AUTH --> ROUTES
    ROUTES --> CONTROLLERS
    CONTROLLERS --> MODELS
    R_AUTH --> C_AUTH
    R_USER --> C_USER
    R_MSG --> C_MSG
    R_CREDIT --> C_CREDIT
    R_ADMIN --> C_ADMIN
    R_GROUP --> C_GROUP
    CONTROLLERS -.->|"on error"| MW_ERR

    %% Socket.IO internal flow
    SM --> REDIS
    SM --> SOCKET_EVENTS
    SE_CHAT --> CREDIT_HELPER
    SE_CHAT --> M_MSG
    SE_GROUP --> M_GROUP
    CREDIT_HELPER --> M_USER

    %% Data layer
    MODELS --> SEQ --> SQLITE
    DB_INIT --> SEQ
    ENV --> DB_INIT

    %% Styling
    classDef express fill:#3b82f6,stroke:#1e40af,color:#fff
    classDef node fill:#22c55e,stroke:#15803d,color:#fff
    classDef client fill:#f59e0b,stroke:#b45309,color:#fff
    classDef db fill:#8b5cf6,stroke:#6d28d9,color:#fff
    
    class MW,MW_HELMET,MW_JSON,MW_COOKIE,MW_SESSION,MW_STATIC,MW_RATE,MW_AUTH,MW_ERR,ROUTES,R_AUTH,R_USER,R_MSG,R_CREDIT,R_ADMIN,R_GROUP,R_PAGES,CONTROLLERS,C_AUTH,C_USER,C_MSG,C_CREDIT,C_ADMIN,C_GROUP express
    class SM,REDIS,SOCKET_EVENTS,SE_CHAT,SE_GROUP,SE_WEBRTC,CREDIT_HELPER,SEQ,MODELS,M_USER,M_MSG,M_GROUP,M_GMEMBER,M_GMSG,M_CREDIT,ENV,DB_INIT node
    class HTML,CSS,JS_MODULES,AUTH_JS,CHAT_JS,ADMIN_JS,API_MOD,SOCKET_MOD,WEBRTC_MOD,UI_MOD,CRYPTO_JS,ADMIN_API client
    class SQLITE db
```

### How a Request Flows Through the System

```mermaid
sequenceDiagram
    participant B as Browser
    participant E as Express Middleware
    participant R as Express Router
    participant C as Controller
    participant M as Sequelize Model
    participant DB as SQLite DB
    participant S as Socket.IO Server

    Note over B,DB: 📡 HTTP Flow (Express.js)
    B->>E: POST /api/login (fetch)
    E->>E: helmet → json → cookie → session → rateLimit → authMiddleware
    E->>R: authRoutes.js → router.post('/login')
    R->>C: authController.login(req, res)
    C->>M: User.findOne({ where: { username } })
    M->>DB: SELECT * FROM users
    DB-->>M: Row data
    M-->>C: User instance
    C->>C: bcrypt.compare() + jwt.sign()
    C-->>B: { token, userId, username, ... }

    Note over B,S: 🔌 WebSocket Flow (Pure Node.js)
    B->>S: socket.emit('authenticate', token)
    S->>S: jwt.verify(token) — socketManager.js
    S-->>B: users-online event
    B->>S: socket.emit('send-message', { toUserId, encryptedContent })
    S->>S: chatEvents.js → deductCredit()
    S->>M: Message.create(...)
    M->>DB: INSERT INTO messages
    S-->>B: message-sent / receive-message
```

> [!TIP]
> **Blue nodes** = Express.js layer (HTTP only) | **Green nodes** = Pure Node.js (sockets, ORM, config) | **Yellow nodes** = Frontend (browser)
