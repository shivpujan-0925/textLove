# textLove

<div align="center">

<img src="client/public/icons/icon-512.svg" alt="textLove Logo" width="120" height="120" />

### **Live Conversations That Leave Zero Footprint**

*A privacy-first, live-only, end-to-end encrypted messaging platform with zero server retention, guaranteed forward secrecy, and 30-minute auto-expiry.*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61dafb?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?style=flat-square&logo=socketdotio&logoColor=white)](https://socket.io/)
[![WebCrypto](https://img.shields.io/badge/WebCrypto-AES--256--GCM-blueviolet?style=flat-square)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
[![PWA Ready](https://img.shields.io/badge/PWA-Installable-ff69b4?style=flat-square&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

[**Explore Documentation**](./README/ARCHITECTURE.md) • [**Security Architecture**](./README/SECURITY.md) • [**Free Deployment**](./README/DEPLOYMENT.md) • [**API Reference**](./README/API.md)

</div>

---

## 🌟 Overview

**textLove** is engineered from first principles for users who require genuine conversation confidentiality. Unlike mainstream messaging applications that archive every message indefinitely in cloud databases, textLove enforces a **Zero-Retention, Strict Live-Only** paradigm.

If both parties are not concurrently online and active, messages cannot be delivered. The server operates as an **oblivious blind relay**, routing ciphertext packets purely through ephemeral WebSocket memory buffers. Once a conversation is closed or idle for 30 minutes, all cryptographic ratchet keys, message plaintext, and ephemeral states are permanently wiped from device memory and unrecoverable by design.

---

## 🔒 Core Product Pillars

| Pillar | Guarantee | Technical Implementation |
| :--- | :--- | :--- |
| **🛡️ Device-Only E2EE** | No party—including server operators—can read your messages. | **X3DH** (Extended Triple Diffie-Hellman) initial key agreement + **Double Ratchet** algorithm with **AES-256-GCM** authenticated ciphertexts. |
| **⚡ Zero Server Retention** | Zero message bytes ever touch a disk, log, or database. | The server provides no message tables or queues. Messages exist solely in volatile process RAM during wire transit and are dropped if the recipient is offline. |
| **⏳ 30-Minute Auto-Expiry** | Idle conversations self-destruct automatically. | Built-in monotonic client inactivity timers trigger local session memory wiping and ratchet tear-down after 30 minutes of inactivity. |
| **🚫 No Offline Queuing** | No delayed replays or store-and-forward risks. | Strict online-to-online delivery. If the peer is not actively connected, transmission is blocked with explicit UI feedback. |
| **📱 PWA Standalone** | Native-like web experience with zero plaintext caching. | Installable on iOS, Android, and Desktop with service workers strictly caching immutable application shell assets—never cryptographic keys or messages. |

---

## 🏗️ System Topology

```
+-----------------------------------------------------------------------------------+
|                                  CLIENT A (Alice)                                 |
|  - Identity Key (Ed25519)                                                         |
|  - Ephemeral Ratchet Keys (X25519)                                                |
|  - Local Volatile Memory (Plaintext strictly ephemeral)                           |
+----------------------------------------+------------------------------------------+
                                         |  1. Encrypted Ciphertext
                                         |     (AES-256-GCM + Ratchet Header)
                                         v
+-----------------------------------------------------------------------------------+
|                             BLIND GATEWAY SERVER                                  |
|  - Socket.IO Real-Time Router (Transient RAM only)                                |
|  - Prekey Directory (Public identity & prekeys only)                              |
|  - Authenticated Presence Ledger (Online/Offline state)                           |
|  * NO MESSAGE DATABASE • NO DISK PERSISTENCE • NO OFFLINE STORAGE                 |
+----------------------------------------+------------------------------------------+
                                         |  2. Blind Relay
                                         |     (Dropped immediately if Bob offline)
                                         v
+-----------------------------------------------------------------------------------+
|                                  CLIENT B (Bob)                                   |
|  - Ephemeral Ratchet Step (Derives one-time decryption key)                       |
|  - Authenticated Decryption (AES-256-GCM)                                         |
|  - Immediate Key Zeroization (Forward secrecy preserved)                          |
+-----------------------------------------------------------------------------------+
```

---

## 🚀 Key Features

- **Google OAuth 2.0 & Session Management**: Secure user onboarding and authentication with HTTP-only, SameSite cookies.
- **Privacy-First Discovery**: Search peers by exact unique username. No contact list scraping or unprompted address-book matching.
- **Visual Inactivity Countdown**: Interactive progress tracker showing the remaining lifespan of active sessions before automatic memory scrubbing.
- **Manual Session Purge**: Dedicated action to immediately purge conversation history and tear down ratchet keys on demand.
- **Delivery Receipts & Latency Monitoring**: Instantaneous socket acknowledgments verifying live delivery without server-side retention.
- **Dark-Mode Production Interface**: High-contrast, minimalist UI built with React 18, Tailwind CSS, and Lucide icons.
- **PWA Capabilities**: Fast offline load of app shell with custom web app manifest, maskable SVG icons, and connection status banners.

---

## 📁 Repository & Documentation Directory

This repository contains full product documentation organized into modular guides in the [**`README/`**](./README) directory:

```
textLove/
├── client/                     # Vite + React 18 + TypeScript PWA
│   ├── public/                 # PWA Manifest, Service Worker, and Brand Assets
│   └── src/
│       ├── api/                # REST & WebSocket client interfaces
│       ├── components/         # Production UI (Chat, Auth, Modals, Branding)
│       ├── crypto/             # X3DH, Double Ratchet, and WebCrypto engines
│       └── store/              # Ephemeral state & inactivity managers
├── server/                     # Node.js + Express + Socket.IO Server
│   ├── src/
│   │   ├── config/             # Environment, rate-limiting, and DB configs
│   │   ├── controllers/        # Auth, User Profile, and Prekey controllers
│   │   ├── middleware/         # Security headers, auth guards, rate limiters
│   │   ├── models/             # User, Session, and Public Prekey schemas
│   │   └── sockets/            # Blind messaging and live presence handlers
│   └── tests/                  # Complete test suite (70+ unit/integration tests)
└── README/                     # 📚 Product & Technical Documentation
    ├── ARCHITECTURE.md         # Detailed system design, protocols, & data flows
    ├── SECURITY.md             # Threat model, cryptographic proofs, & invariants
    ├── DEPLOYMENT.md           # 100% Free production deployment walkthrough
    └── API.md                  # Complete WebSocket & REST API specification
```

---

## ⚡ Quickstart

### Prerequisites
- **Node.js**: `v20.x` or higher
- **npm**: `v10.x` or higher
- **MongoDB**: Local MongoDB instance or free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster

### 1. Clone the Repository
```bash
git clone https://github.com/shivpujan-0925/textLove.git
cd textLove
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy the template files and fill in your development keys:

```bash
# Root template
cp .env.example .env

# Server configuration
cp server/.env.example server/.env

# Client configuration
cp client/.env.example client/.env
```

*Key environment variables:*
- `MONGODB_URI`: Connection string for MongoDB (used only for user profiles and public prekeys).
- `JWT_SECRET`: 256-bit secret key for authentication tokens.
- `GOOGLE_CLIENT_ID`: Google OAuth Client ID.
- `CLOUDINARY_*`: (Optional) Credentials for profile avatar hosting.

### 4. Start Development Servers
Run both backend gateway and client interface simultaneously with a single command:

```bash
npm run dev
```

- **Client App**: [http://localhost:5173](http://localhost:5173)
- **Backend API & Gateway**: [http://localhost:4000](http://localhost:4000)

---

## 🧪 Testing & Quality Assurance

textLove features 100% automated test coverage across server security middleware, cryptographic ratchet correctness, and blind socket relay constraints:

```bash
# Run complete monorepo test suite (Server + Client)
npm test

# Run TypeScript compiler checks
npm run typecheck

# Run static analysis and linting
npm run lint

# Build production bundles
npm run build
```

---

## 🌐 Production Deployment

textLove is ready to deploy on **100% free hosting tiers**:

| Component | Recommended Free Host | Configuration Guide |
| :--- | :--- | :--- |
| **Frontend PWA** | [Vercel](https://vercel.com/) / [Netlify](https://www.netlify.com/) | [Deployment Guide: Client](./README/DEPLOYMENT.md#1-deploy-client-to-vercel) |
| **Real-time Gateway** | [Render](https://render.com/) / [Railway](https://railway.app/) | [Deployment Guide: Server](./README/DEPLOYMENT.md#2-deploy-server-to-render) |
| **Database** | [MongoDB Atlas (M0 Free Tier)](https://www.mongodb.com/cloud/atlas) | [Deployment Guide: Database](./README/DEPLOYMENT.md#3-mongodb-atlas-free-m0) |
| **Media Storage** | [Cloudinary (Free Tier)](https://cloudinary.com/) | [Deployment Guide: Cloudinary](./README/DEPLOYMENT.md#4-cloudinary-setup) |

For comprehensive deployment instructions, SSL setup, and environment verification, read [**`README/DEPLOYMENT.md`**](./README/DEPLOYMENT.md).

---

## 🛡️ Security & Responsible Disclosure

If you discover a vulnerability or potential security flaw within textLove:
1. Review our [**Security Policy & Threat Model**](./README/SECURITY.md).
2. Report the vulnerability privately by opening a confidential GitHub Security Advisory or reaching out via the contact information specified in `SECURITY.md`.
3. Please do **not** file public issues for zero-day security reports.

---

## 📄 License & Trademark

Distributed under the **MIT License**. See `LICENSE` for details.

*textLove — Live conversations that leave zero footprint.*
