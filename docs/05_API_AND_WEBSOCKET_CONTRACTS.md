# textLove - REST API & WebSocket Contracts

## 1. REST API Specification

All REST endpoints operate under the `/api/v1` namespace. All request and response bodies use JSON (`application/json`). Authentication uses the `textlove_session` cookie (`HttpOnly; Secure; SameSite=Strict`).

### 1.1 Authentication Endpoints

#### `GET /api/v1/auth/google/url`
Generates the Google OAuth 2.0 authorization URL with PKCE challenge.
- **Request Headers**: None
- **Response `200 OK`**:
  ```json
  {
    "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&response_type=code&scope=openid%20email%20profile&redirect_uri=...&state=...&code_challenge=...&code_challenge_method=S256"
  }
  ```

#### `POST /api/v1/auth/google/callback`
Exchanges the authorization code and PKCE code verifier for an authenticated session.
- **Request Body**:
  ```json
  {
    "code": "4/0AX4XfWh...",
    "state": "random_anti_csrf_token",
    "codeVerifier": "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
  }
  ```
- **Response `200 OK`**:
  - Sets Cookie: `textlove_session=<token>; HttpOnly; Secure; SameSite=Strict; Max-Age=604800; Path=/`
  ```json
  {
    "user": {
      "id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "email": "user@example.com",
      "displayName": "Alice Smith",
      "username": "alice",
      "avatarUrl": "https://res.cloudinary.com/.../avatar.webp",
      "hasRegisteredKeys": true
    }
  }
  ```

#### `POST /api/v1/auth/logout`
Destroys the session in the database and clears the session cookie.
- **Request**: Authenticated session cookie
- **Response `200 OK`**: Clears cookie `textlove_session`
  ```json
  { "success": true, "message": "Logged out successfully" }
  ```

#### `GET /api/v1/auth/me`
Retrieves current authenticated session user profile.
- **Response `200 OK`**: Current user profile.
- **Response `401 Unauthorized`**: If unauthenticated or session expired.

---

### 1.2 User Profile & Key Directory Endpoints

#### `GET /api/v1/users/check-username/:username`
Checks if a proposed username is available.
- **Params**: `username` (string, 3-24 alphanumeric + underscores)
- **Response `200 OK`**:
  ```json
  {
    "username": "alice_sky",
    "available": true
  }
  ```

#### `PATCH /api/v1/users/profile`
Sets or updates user profile metadata (username, displayName).
- **Request Body**:
  ```json
  {
    "username": "alice_sky",
    "displayName": "Alice Sky"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "user": {
      "id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "username": "alice_sky",
      "displayName": "Alice Sky"
    }
  }
  ```

#### `POST /api/v1/users/avatar/signature`
Generates a signed signature for client-direct avatar upload to Cloudinary.
- **Response `200 OK`**:
  ```json
  {
    "timestamp": 1718000000,
    "signature": "8a7c6f...",
    "apiKey": "123456789",
    "cloudName": "textlove-cloud",
    "folder": "avatars"
  }
  ```

#### `POST /api/v1/users/avatar/confirm`
Notifies backend of completed direct upload to attach the Cloudinary asset to the profile.
- **Request Body**:
  ```json
  {
    "avatarUrl": "https://res.cloudinary.com/textlove/image/upload/v1718000000/avatars/user123.webp",
    "avatarPublicId": "avatars/user123"
  }
  ```
- **Response `200 OK`**: Returns updated user object.

#### `POST /api/v1/keys/register`
Publishes user's E2EE public key bundle to the server directory.
- **Request Body**:
  ```json
  {
    "identityPublicKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
    "signedPreKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
    "preKeySignature": "MEUCIQD1..."
  }
  ```
- **Response `200 OK`**: `{ "success": true, "registeredAt": "2026-10-13T14:48:00Z" }`

#### `GET /api/v1/users/:username/public-key`
Retrieves a target user's public key bundle for establishing a session.
- **Response `200 OK`**:
  ```json
  {
    "userId": "64f1a2b3c4d5e6f7a8b9c0d2",
    "username": "bob",
    "publicKeyBundle": {
      "identityPublicKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
      "signedPreKey": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
      "preKeySignature": "MEUCIQD1..."
    }
  }
  ```

#### `DELETE /api/v1/users/me`
Executes user-controlled account deletion.
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "message": "Account metadata removed and sessions revoked. Cloudinary purge queued."
  }
  ```

---

### 1.3 Conversation Lifecycle Endpoints

#### `POST /api/v1/conversations/initiate`
Initiates a live conversation request with another user.
- **Request Body**: `{ "recipientUsername": "bob" }`
- **Response `200 OK` (when recipient is online)**:
  ```json
  {
    "conversationId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending_acceptance",
    "expiresAt": "2026-10-13T15:18:00Z"
  }
  ```
- **Response `400 Bad Request` (when recipient is offline)**:
  ```json
  {
    "error": "RECIPIENT_OFFLINE",
    "message": "Bob is currently offline. textLove requires both participants to be online."
  }
  ```

#### `DELETE /api/v1/conversations/:id`
Triggers "Delete for Both" on an active conversation.
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "conversationId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "closed"
  }
  ```

---

## 2. WebSocket (Socket.IO) Event Protocol

Socket connections authenticate during initial handshake via the `textlove_session` cookie.

### 2.1 Presence & Life-Cycle Events

| Event Name | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `presence:subscribe` | Client -> Server | `{ "usernames": ["bob", "charlie"] }` | Subscribe to online status of peers |
| `presence:update` | Server -> Client | `{ "username": "bob", "online": true }` | Real-time presence change notification |
| `presence:heartbeat`| Client -> Server | `{ "timestamp": 1718000000 }` | Keepalive (does NOT reset 30-min conversation timer) |

### 2.2 Conversation Pairing Events

| Event Name | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `conv:invite` | Server -> Client | `{ "conversationId": "uuid", "from": "alice" }` | Alerts Bob of Alice's chat invite |
| `conv:accept` | Client -> Server | `{ "conversationId": "uuid" }` | Bob accepts the invite |
| `conv:ready` | Server -> Client | `{ "conversationId": "uuid", "peerKeyBundle": { ... } }` | Both joined; mutual keys exchanged |
| `conv:expired` | Server -> Client | `{ "conversationId": "uuid", "reason": "30_MIN_INACTIVITY" }` | Emitted when conversation exceeds 30m idle |
| `conv:deleted` | Server -> Client | `{ "conversationId": "uuid", "initiator": "alice" }` | Emitted when a peer clicks "Delete for Both" |

### 2.3 Strict Live-Only Messaging Events

#### `msg:send` (Client -> Server)
Sent by the sender device with encrypted ciphertext.
```typescript
interface MsgSendPayload {
  conversationId: string;    // UUID v4
  recipientUsername: string; // Target user
  ciphertext: string;        // Base64 encoded AES-256-GCM ciphertext
  iv: string;                // Base64 encoded 12-byte IV
  seq: number;               // Monotonic integer counter
  timestamp: number;         // Millisecond epoch
}
```

#### `msg:deliver` (Server -> Recipient Client)
Relayed directly to the recipient socket.
```typescript
interface MsgDeliverPayload {
  conversationId: string;
  senderUsername: string;
  ciphertext: string;
  iv: string;
  seq: number;
  timestamp: number;
}
```

#### `msg:relayed` (Server -> Sender Client)
Instant confirmation that message was forwarded into network write buffer.
```typescript
interface MsgRelayedPayload {
  conversationId: string;
  seq: number;
  status: 'RELAYED_TO_NETWORK';
}
```

#### `msg:ack` (Recipient Client -> Server -> Sender Client)
Confirmation that recipient received, verified, and decrypted the payload.
```typescript
interface MsgAckPayload {
  conversationId: string;
  seq: number;
  status: 'DECRYPTED';
}
```

#### `msg:error` (Server -> Sender Client)
Emitted if recipient disconnected or delivery is impossible.
```typescript
interface MsgErrorPayload {
  conversationId: string;
  seq: number;
  code: 'RECIPIENT_OFFLINE' | 'DELIVERY_UNCERTAIN' | 'CONVERSATION_EXPIRED' | 'RATE_LIMITED';
  message: string;
}
```
