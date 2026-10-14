# textLove — API & Protocol Reference

This document outlines the real-time WebSocket protocol and REST endpoints implemented in **textLove**.

---

## 1. Real-Time WebSocket Protocol (Socket.IO)

All messaging in textLove occurs through real-time Socket.IO connections. The server operates as an **oblivious blind relay**, verifying authentication upon socket handshake and forwarding encrypted payloads directly between clients.

### 1.1 Connection & Authentication

Clients establish a WebSocket connection transmitting their HTTP-only session cookie:

```typescript
import { io } from "socket.io-client";

const socket = io(SERVER_URL, {
  withCredentials: true,
  transports: ["websocket", "polling"],
  reconnectionAttempts: 5,
});
```

The server decodes the session, verifies the user token, and joins the socket to a private user room: `user:<userId>`.

---

### 1.2 Socket Event Catalog

#### A. Client-to-Server Events

| Event | Payload Type | Description |
| :--- | :--- | :--- |
| `message:send` | `EncryptedMessagePayload` | Dispatches an end-to-end encrypted message packet to an online recipient. |
| `typing:start` | `{ recipientId: string }` | Notifies recipient that the sender has begun typing. |
| `typing:stop` | `{ recipientId: string }` | Notifies recipient that typing has ceased. |
| `presence:query` | `{ userIds: string[] }` | Queries the real-time online status of specific user IDs. |
| `session:heartbeat`| `{ sessionId: string }` | Pings the server to refresh active presence and reset inactivity timer. |
| `session:close` | `{ sessionId: string }` | Voluntarily ends a conversation, prompting peer session teardown. |

#### `EncryptedMessagePayload` Schema:
```json
{
  "recipientId": "664b9a3e8f1c8b2a34567890",
  "sessionId": "sess_89f0a2e3...",
  "ciphertext": "BASE64_AES_256_GCM_ENCRYPTED_STRING",
  "iv": "BASE64_96BIT_IV",
  "ratchetHeader": {
    "dhPublicKey": "BASE64_X25519_EPHEMERAL_PUBLIC_KEY",
    "previousChainLength": 0,
    "messageIndex": 4
  },
  "timestamp": 1728901234567
}
```

---

#### B. Server-to-Client Events

| Event | Payload Type | Description |
| :--- | :--- | :--- |
| `message:relay` | `RelayedMessagePayload` | Relays an incoming encrypted message from an authenticated peer. |
| `message:ack` | `{ messageId: string, timestamp: number }` | Confirms instantaneous receipt and wire dispatch of a sent message. |
| `message:error` | `{ code: string, message: string }` | Emitted when message dispatch fails (e.g., recipient offline). |
| `presence:update` | `{ userId: string, isOnline: boolean }` | Broadcasted when a contact connects or disconnects. |
| `typing:status` | `{ senderId: string, isTyping: boolean }` | Real-time typing indicator update. |
| `session:expired`| `{ sessionId: string, reason: string }` | Triggered by the 30-minute authoritative sweeper. |

---

### 1.3 Error Codes

| Error Code | HTTP / Socket Equivalent | Description |
| :--- | :--- | :--- |
| `ERR_UNAUTHENTICATED` | 401 | Connection or event received without valid session credentials. |
| `ERR_RECIPIENT_OFFLINE`| 404 | Target recipient is disconnected. Message is dropped immediately. |
| `ERR_RATE_LIMITED` | 429 | User exceeded allowed socket events per second threshold. |
| `ERR_SESSION_EXPIRED` | 410 | Inactivity timeout exceeded (30 minutes). Session wiped. |
| `ERR_PAYLOAD_INVALID` | 400 | Malformed ciphertext payload or missing required ratchet fields. |

---

## 2. REST API Specification

REST endpoints handle static discovery, cryptographic prekey registration, and user profiles.

### 2.1 Authentication & Profile

#### `GET /api/auth/me`
Retrieves currently authenticated user profile.
- **Headers**: Cookie: `token=<jwt>`
- **Response** `200 OK`:
  ```json
  {
    "user": {
      "id": "664b9a3e8f1c8b2a34567890",
      "username": "alice_sec",
      "email": "alice@example.com",
      "avatarUrl": "https://res.cloudinary.com/..."
    }
  }
  ```

#### `POST /api/auth/logout`
Clears session cookies and invalidates server session tracking.
- **Response** `200 OK`: `{"success": true}`

#### `PUT /api/users/profile`
Updates username or bio.
- **Body**: `{"username": "alice_new"}`
- **Response** `200 OK`: Updated user object.

#### `POST /api/users/avatar`
Uploads profile picture to Cloudinary storage.
- **Content-Type**: `multipart/form-data`
- **Response** `200 OK`: `{"avatarUrl": "https://res.cloudinary.com/..."}`

---

### 2.2 Cryptographic Prekeys Directory

#### `POST /api/keys/prekeys`
Publishes user's initial or replenished prekey bundle.
- **Body**:
  ```json
  {
    "identityKey": "BASE64_ED25519_PUBLIC_KEY",
    "signedPrekey": {
      "key": "BASE64_X25519_PUBLIC_KEY",
      "signature": "BASE64_ED25519_SIGNATURE"
    },
    "oneTimePrekeys": [
      "BASE64_X25519_OPK_1",
      "BASE64_X25519_OPK_2"
    ]
  }
  ```
- **Response** `201 Created`: `{"status": "published", "count": 2}`

#### `GET /api/keys/prekeys/:userId`
Fetches the public prekey bundle needed to initialize an X3DH handshake with a peer.
- **Response** `200 OK`:
  ```json
  {
    "userId": "664b9a3e8f1c8b2a34567890",
    "identityKey": "BASE64_ED25519_PUBLIC_KEY",
    "signedPrekey": {
      "key": "BASE64_X25519_PUBLIC_KEY",
      "signature": "BASE64_ED25519_SIGNATURE"
    },
    "oneTimePrekey": "BASE64_X25519_OPK_1"
  }
  ```
*(Note: Consumed one-time prekeys are immediately deleted from the server bundle).*

---

### 2.3 System Health

#### `GET /api/health`
Monitors API and database connectivity.
- **Response** `200 OK`:
  ```json
  {
    "status": "healthy",
    "uptime": 86420,
    "timestamp": 1728901234567,
    "database": "connected"
  }
  ```
