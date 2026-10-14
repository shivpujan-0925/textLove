# textLove — System Architecture & Protocol Specification

## 1. High-Level Architecture Overview

**textLove** is designed from the ground up as a **Zero-Retention, Live-Only Ephemeral Messaging System**. Unlike traditional messaging platforms (Signal, WhatsApp, Telegram) that maintain store-and-forward server queues, textLove routes encrypted message packets strictly between concurrently active WebSocket connections.

```
+─────────────────────────────────────────────────────────────────────────────+
|                                CLIENT LAYER                                 |
|                                                                             |
|   +-----------------------+                    +------------------------+   |
|   |   Alice (Initiator)   |                    |   Bob (Recipient)      |   |
|   |  - WebCrypto Keystore |                    |  - WebCrypto Keystore  |   |
|   |  - In-Memory Ratchet  |                    |  - In-Memory Ratchet   |   |
|   |  - Inactivity Timer   |                    |  - Inactivity Timer    |   |
|   +-----------+-----------+                    +-----------+------------+   |
+───────────────│────────────────────────────────────────────│────────────────+
                │                                            │
                │ TLS 1.3 / WSS                             │ TLS 1.3 / WSS
                ▼                                            ▼
+─────────────────────────────────────────────────────────────────────────────+
|                        OBLIVIOUS GATEWAY (SERVER)                           |
|                                                                             |
|   +---------------------------------------------------------------------+   |
|   |                        Socket.IO Engine                             |   |
|   |   - Authenticated User-Socket Mapping (Strict Transient RAM)        |   |
|   |   - Blind Relay: Immediate Dispatch / Instant Reject if Offline    |   |
|   |   - Presence Broker: Real-time Online/Offline Broadcasts           |   |
|   |   - Inactivity Sweeper: Authoritative 30-minute Session Reaper     |   |
|   +---------------------------------------------------------------------+   |
|                                                                             |
|   +---------------------------------------------------------------------+   |
|   |                         REST API Handlers                           |   |
|   |   - Google OAuth 2.0 Auth Flow & Session Cookie Generation          |   |
|   |   - Profile & Avatar Upload (Cloudinary)                            |   |
|   |   - Public Prekey Directory (/api/keys/prekeys)                     |   |
|   +----------------------------------+----------------------------------+   |
+──────────────────────────────────────│──────────────────────────────────────+
                                       │
                                       ▼
+─────────────────────────────────────────────────────────────────────────────+
|                         PERSISTENCE (MongoDB Atlas)                         |
|                                                                             |
|   - Users (Google ID, username, avatar URL, createdAt)                      |
|   - Public Prekey Bundles (Identity Key, Signed Prekey, One-Time Prekeys)   |
|   - Active Session Metadata (Session IDs, timestamps for Reaper)            |
|                                                                             |
|   * NON-NEGOTIABLE INVARIANT: ZERO MESSAGE TABLES • ZERO STORE-AND-FORWARD  |
+─────────────────────────────────────────────────────────────────────────────+
```

---

## 2. End-to-End Encryption Protocol (X3DH + Double Ratchet)

textLove provides cryptographic confidentiality, authenticity, and forward secrecy using modern elliptic curve cryptography implemented via the W3C Web Cryptography API and `@noble/curves`.

### 2.1 Cryptographic Primitives

| Purpose | Algorithm / Primitive | Key Length / Parameters |
| :--- | :--- | :--- |
| **Long-Term Identity** | Ed25519 (EdDSA) | 256-bit signing keypair |
| **Diffie-Hellman Exchange** | X25519 (ECDH) | 256-bit Montgomery curve |
| **Key Derivation (KDF)** | HKDF-SHA256 | RFC 5869 extract-and-expand |
| **Symmetric Message AEAD** | AES-256-GCM | 256-bit key, 96-bit random IV, 128-bit auth tag |
| **Fingerprint Representation** | SHA-256 | Formatted 60-digit safety numbers |

### 2.2 X3DH Initial Key Agreement

When Alice initiates a secure channel with Bob:
1. **Prekey Retrieval**: Alice queries the server directory for Bob’s public prekey bundle:
   - Bob's Identity Key ($IK_B$)
   - Bob's Signed Prekey ($SPK_B$) + Signature $\text{Sig}(IK_B, SPK_B)$
   - Bob's One-Time Prekey ($OPK_B$, if available)
2. **Signature Verification**: Alice validates Bob's signature on $SPK_B$ using $IK_B$.
3. **Ephemeral Key Generation**: Alice generates an ephemeral keypair ($EK_A$).
4. **Triple Diffie-Hellman Calculation**:
   - $DH_1 = \text{X25519}(IK_A, SPK_B)$
   - $DH_2 = \text{X25519}(EK_A, IK_B)$
   - $DH_3 = \text{X25519}(EK_A, SPK_B)$
   - $DH_4 = \text{X25519}(EK_A, OPK_B)$ *(if OPK present)*
5. **Master Secret Derivation**:
   $$SK = \text{HKDF-SHA256}(DH_1 \parallel DH_2 \parallel DH_3 [\parallel DH_4], \text{info}=\text{"textLove-X3DH"})$$

### 2.3 The Double Ratchet Algorithm

Every message sent or received steps the cryptographic state forward, guaranteeing **Forward Secrecy (FS)** and **Post-Compromise Security (Break-in Recovery)**:

```
[ Root Key (RK) ] ───────► HKDF Step (DH Ratchet) ───────► [ New Root Key ]
        │                                                          │
        ▼                                                          ▼
[ Chain Key (CK) ]                                         [ Chain Key (CK) ]
        │                                                          │
   Symmetric Step                                             Symmetric Step
        ├────────► [ Message Key 1 ] ──► AES-GCM Encrypt           ├────────► [ Message Key 2 ]
        ▼                                                          ▼
[ Next Chain Key ]                                         [ Next Chain Key ]
```

1. **DH Ratchet Step**: Whenever Alice receives a message containing a new ephemeral public key from Bob, she completes a new Diffie-Hellman handshake, feeding the output into the root chain to derive fresh sending and receiving chain keys.
2. **Symmetric Ratchet Step**: For each message transmitted within a chain, the chain key advances via HKDF. The derived single-use message key encrypts the plaintext and is **immediately overwritten in memory**.
3. **Replay Protection**: The 96-bit AES-GCM IV is strictly monotonic with a per-message nonce, rendering replay attacks mathematically impossible.

---

## 3. Oblivious Real-Time WebSocket Relay

The backend gateway acts as a **purely oblivious router**:

1. **Authentication on Handshake**: Clients connect to Socket.IO using secure, HTTP-only session cookies. The server validates the session and maps `socket.id <-> userId` in transient memory.
2. **Zero In-Transit Queuing**:
   - When Alice emits `message:send`, the server checks whether `recipientId` has an active socket.
   - If **Online**: Server immediately emits `message:relay` to Bob’s socket and replies to Alice with `message:ack`.
   - If **Offline**: Server immediately rejects the message with error code `ERR_RECIPIENT_OFFLINE`. The payload is dropped without touching disk, database, or queue.
3. **Presence Broker**: Socket disconnects trigger immediate `presence:update` broadcasts to open peer sessions so clients reflect real-time availability.

---

## 4. 30-Minute Inactivity Lifecycle & Memory Zeroization

To eliminate cold-storage forensic risks, textLove enforces an autonomous inactivity policy:

```
User Activity Detected
        │
        ▼
[ Reset Local Timer ] ──( 25 min idle )──► [ Inactivity Warning Toast ]
        │                                                │
        │                                          ( 5 min grace )
        │                                                ▼
        └────────────────────────────────────────► [ Session Expiry Triggered ]
                                                         │
                        ┌────────────────────────────────┴──────────────────────────────┐
                        ▼                                                               ▼
        [ Memory Zeroization ]                                                [ Socket Eviction ]
   - Wipe ratchet session state in RAM                                   - Server tears down session
   - Clear UI message array                                              - Broadcast disconnect
   - Flush crypto keys from memory                                       - Redirect to session-closed UI
```

### Local Zeroization Routine
- The client maintains all decrypted messages exclusively in volatile React/Zustand state.
- At timeout or manual exit, memory arrays are zeroed:
  - Buffer arrays are overwritten with `crypto.getRandomValues(new Uint8Array(len))` before dereferencing.
  - Browser IndexedDB only stores non-exportable identity keys; ratchet session keys and messages are never written to IndexedDB, LocalStorage, or SessionStorage.

---

## 5. Progressive Web App (PWA) Security Sandbox

textLove's Service Worker is designed with strict privacy boundaries:

- **What is Cached**:
  - Application shell (`index.html`, compiled CSS/JS bundles, fonts, vector icons).
- **What is FORBIDDEN from Cache**:
  - `/api/*` endpoints.
  - `/socket.io/*` WebSocket upgrade streams.
  - Authentication tokens or headers.
  - Any ciphertext, plaintext, or cryptographic key material.

When the device loses network connectivity, the Service Worker serves a minimal, secure offline warning screen. No offline message drafting or queuing is permitted.
