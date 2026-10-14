# textLove - System Architecture Document

## 1. Executive Summary & Core Philosophy

**textLove** is a modern, privacy-first, real-time one-to-one messaging web application built on three non-negotiable architectural tenets:
1. **Zero Intentional Server-Side Message Retention**: The server never stores, persists, or queues message bodies or ciphertexts on disk, in databases, in caches, or in offline queues. Messages are ephemeral electrical impulses through network sockets.
2. **Strict Live-Only Messaging**: Delivery occurs only when both sender and recipient have active, authenticated, and authorized real-time connections. If the recipient is offline, the message is rejected at the edge with immediate, honest feedback.
3. **End-to-End Encryption (E2EE)**: Plaintext messages are encrypted directly on the sender's client device using audited cryptographic primitives and decrypted exclusively on the recipient's client device. The server only ever handles opaque ciphertext payloads transiently in volatile network buffers.

---

## 2. High-Level System Architecture

The system consists of three distinct tiers:

```
+-----------------------------------------------------------------------------------+
|                                  CLIENT TIER                                      |
|                                                                                   |
|  +---------------------------------------+  +----------------------------------+  |
|  |           Sender Browser              |  |         Recipient Browser        |  |
|  |  - React 18+ / TypeScript (Strict)    |  |  - React 18+ / TypeScript        |  |
|  |  - Vite + Tailwind CSS + shadcn/ui    |  |  - Client-side E2EE Engine       |  |
|  |  - Client-side E2EE Engine            |  |  - Ephemeral In-Memory State     |  |
|  |  - Ephemeral In-Memory State          |  |  - PWA Service Worker (App shell)|  |
|  +-------------------+-------------------+  +-----------------+----------------+  |
+----------------------|----------------------------------------|-------------------+
                       | HTTPS / WSS                            | HTTPS / WSS
                       v                                        v
+-----------------------------------------------------------------------------------+
|                                  BACKEND TIER                                     |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | Node.js + Express + TypeScript API Server                                  |  |
|  |  - Google OAuth 2.0 / OpenID Connect Server Flow                            |  |
|  |  - Security Middleware (Helmet, Strict CSP, Rate Limiting, CORS)           |  |
|  |  - Ephemeral Socket.IO Server & In-Memory Connection Registry               |  |
|  |  - Live-Only Message Relay Engine (Zero Disk / DB Writes)                   |  |
|  |  - Authoritative 30-Minute Conversation Expiry Monitor                      |  |
|  +-------------------------+----------------------------------+----------------+  |
+----------------------------|----------------------------------|-------------------+
                             |                                  |
                             v                                  v
+------------------------------------------+  +-------------------------------------+
|              METADATA TIER               |  |           THIRD-PARTY TIER          |
|                                          |  |                                     |
|  +------------------------------------+  |  |  +-------------------------------+  |
|  | MongoDB Replica Set                |  |  |  | Google Identity Platform      |  |
|  |  - User Profiles & Usernames       |  |  |  |  - OAuth 2.0 / OpenID Connect |  |
|  |  - E2EE Public Key Bundles         |  |  |  +-------------------------------+  |
|  |  - Session Store (TTL Indexed)     |  |  |                                     |
|  |  - Active Conversation Metadata    |  |  |  +-------------------------------+  |
|  |    (Status, Timestamps ONLY)       |  |  |  | Cloudinary Media Service       |  |
|  |  - STRICTLY ZERO MESSAGE DATA      |  |  |  |  - Direct-signed avatar upload|  |
|  +------------------------------------+  |  |  |  - Admin API purge on deletion|  |
+------------------------------------------+  +-------------------------------------+
```

---

## 3. Component Boundaries & Responsibilities

### 3.1 Client Tier (Frontend PWA)
- **Framework**: React with TypeScript (strict null checks enabled), built with Vite.
- **Styling**: Tailwind CSS with custom HSL tokens, shadcn/ui components, and Lucide icons.
- **E2EE Subsystem**:
  - Runs in browser memory.
  - Generates and stores device key pairs (Identity Key, Signed PreKey, Ephemeral Keys).
  - Private keys are stored strictly in memory and Web Crypto non-extractable CryptoKey format or browser session keystore; NEVER sent to any remote server.
  - Plaintext messages exist only in client React state during the active session.
  - Zero storage of message plaintext or ciphertext in `localStorage`, `IndexedDB`, `sessionStorage`, or service-worker cache.
- **Connection Subsystem**:
  - Maintains authenticated WebSocket connection to backend via Socket.IO client.
  - Subscribes to peer presence.
  - Handles optimistic UI updates with honest delivery states: `PENDING_RELAY` -> `RELAYED` -> `DELIVERED_TO_PEER` -> `DECRYPTED_BY_PEER`.
  - Enforces local 30-minute inactivity countdown synchronized with authoritative server events.

### 3.2 Backend Tier (Node.js & Express API Server)
- **Role**: Identity verification, public key distribution directory, real-time presence broker, and ephemeral socket relay router.
- **Endpoints**:
  - REST API for authentication, profile setup, username claim, avatar signing, public key queries, conversation lifecycle, and account deletion.
  - Socket.IO gateway for real-time presence exchange and peer-to-peer message forwarding.
- **Live-Only Relay Router**:
  - Receives ciphertext envelope over sender's socket.
  - Validates sender authentication, conversation active status, and recipient online presence.
  - Forwards ciphertext to recipient socket room.
  - Emits relay acknowledgement back to sender.
  - If recipient socket is not connected or in-flight transfer fails, immediately drops the frame and rejects with an offline error.

### 3.3 Database Tier (MongoDB)
- **Strictly Limited Scope**:
  - Stores user account metadata (Google ID, verified email for account recovery, unique public username, display name, avatar URL).
  - Stores public identity keys and prekey bundles.
  - Stores authenticated session tokens with TTL expiration.
  - Stores active conversation pair mapping: `participantA_id`, `participantB_id`, `status` ('active' | 'expired' | 'closed'), `lastActivityAt`, `expiresAt`.
  - **PROHIBITED CONTENT**: Message texts, ciphertexts, initial vectors, message hashes, attachments, voice clips, unsent message buffers, or message sequence logs.

### 3.4 Media Service (Cloudinary)
- Used solely for user profile avatars.
- Client uploads directly to Cloudinary using signed signature URLs provided by the backend.
- Backend stores only the avatar URL and public ID.
- Upon account deletion, the backend invokes the Cloudinary Admin API to permanently purge the asset.

---

## 4. Ephemeral Memory and Buffer Handling Policy

The product owner explicitly prohibits intentional server-side message retention. In real-world networking, packets pass through kernel TCP buffers and Node.js process memory:

```
[Sender Socket] ---> [OS TCP Socket Buffer] 
                ---> [Node.js Stream Buffer] 
                ---> [Socket.IO Event Frame (In-Memory Reference)] 
                ---> [Target Socket Write Buffer] 
                ---> [OS TCP Send Buffer] ---> [Recipient Socket]
```

### Server-Side Ephemeral Buffer Guarantees:
1. **Zero Disk I/O**: Message frames are never passed to `fs.writeFile`, loggers, databases, or Redis queues.
2. **Immediate Dereferencing**: The message event handler takes the ciphertext payload, invokes `socket.to(recipientSocketId).emit('msg:deliver', payload)`, and drops all local JavaScript variable references within the event scope.
3. **Log Redaction**: Pino/Winston logging configurations explicitly redact or strip any socket event body matching `msg:*` payloads.
4. **Honest Documentation**: The system acknowledges that byte sequences exist in volatile RAM and kernel network buffers for milliseconds during transit. This constitutes transport relay, not retention.

---

## 5. Technology Stack Decisions & Justifications

| Layer | Selection | Justification |
| :--- | :--- | :--- |
| **Frontend** | React + TypeScript + Vite | Rapid development, strong typing, minimal bundle size, fast HMR. |
| **Styling** | Tailwind CSS + shadcn/ui | Clean design system, accessible primitives (Radix UI), full design token customization. |
| **Icons** | lucide-react | Modern, lightweight, consistent SVG icon library. |
| **Backend** | Node.js + Express + TypeScript | Lightweight, single-threaded event loop ideal for asynchronous socket multiplexing. |
| **Real-time** | Socket.IO | Battle-tested WebSocket protocol with automatic reconnection, heartbeat/ping-pong presence, room management, and binary buffer support. |
| **Database** | MongoDB (Mongoose) | Schema-validated document store with native TTL indexes for session expiry and conversation cleanup. |
| **Auth** | Google OAuth 2.0 (OpenID Connect) | Industry standard, eliminates password storage risks, verified user verification. |
| **E2EE** | Web Crypto API (ECDH X25519/P-256 + AES-256-GCM + HKDF) / libsodium | Native browser cryptographic engine, hardware-accelerated, audited by platform vendors, non-extractable key handles. |
| **Testing** | Vitest + RTL + Supertest + Playwright | Fast unit tests in Vitest, robust API integration testing in Supertest, browser E2E with Playwright. |
