# textLove - Data Flow & Component Diagrams

This document illustrates the operational flows, architectural boundaries, and sequence diagrams of textLove.

---

## 1. System Component Diagram

```mermaid
graph TD
    subgraph ClientA ["Client A (Browser / PWA)"]
        UI_A["UI Layer (React + Tailwind)"]
        Crypto_A["Crypto Engine (Web Crypto / libsodium)"]
        Socket_A["Socket.IO Client A"]
        Memory_A[("In-Memory State A (Plaintext)")]
        UI_A <--> Memory_A
        UI_A <--> Crypto_A
        Crypto_A <--> Socket_A
    end

    subgraph ClientB ["Client B (Browser / PWA)"]
        UI_B["UI Layer (React + Tailwind)"]
        Crypto_B["Crypto Engine (Web Crypto / libsodium)"]
        Socket_B["Socket.IO Client B"]
        Memory_B[("In-Memory State B (Plaintext)")]
        UI_B <--> Memory_B
        UI_B <--> Crypto_B
        Crypto_B <--> Socket_B
    end

    subgraph Backend ["textLove Backend Server (Node.js/Express)"]
        HttpRouter["Express REST API"]
        AuthModule["Google OAuth PKCE Module"]
        SocketGateway["Socket.IO Relay Gateway"]
        ExpiryDaemon["30-Min Inactivity Monitor"]
        ConnRegistry[("In-Memory Connection Registry")]
        
        HttpRouter --> AuthModule
        SocketGateway <--> ConnRegistry
        ExpiryDaemon <--> ConnRegistry
    end

    subgraph Storage ["Metadata Storage & Services"]
        Mongo[("MongoDB (Profiles, PubKeys, Sessions, ActiveConv)")]
        Cloudinary[("Cloudinary Media Storage")]
        GoogleOAuth[("Google OAuth 2.0 Identity")]
    end

    Socket_A <== "WSS (E2EE Ciphertext)" ==> SocketGateway
    Socket_B <== "WSS (E2EE Ciphertext)" ==> SocketGateway
    UI_A <-- "HTTPS (REST API)" --> HttpRouter
    UI_B <-- "HTTPS (REST API)" --> HttpRouter
    AuthModule <--> GoogleOAuth
    HttpRouter <--> Mongo
    SocketGateway <--> Mongo
    UI_A -. "Direct Upload (Signed)" .-> Cloudinary
    UI_B -. "Direct Upload (Signed)" .-> Cloudinary
```

---

## 2. Authentication & Onboarding Sequence Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant Client as Client Application
    participant Server as Express Server
    participant Google as Google Identity Platform
    participant Mongo as MongoDB

    User->>Client: Click "Sign in with Google"
    Client->>Server: GET /api/auth/google/url (request auth URL with PKCE challenge)
    Server-->>Client: Returns Auth URL & sets PKCE session state
    Client->>Google: Redirect to Google OAuth consent
    Google-->>User: Present consent screen
    User->>Google: Approves authentication
    Google-->>Client: Redirect to callback with authorization code
    Client->>Server: POST /api/auth/google/callback { code, codeVerifier }
    Server->>Google: Exchange code for Google tokens
    Google-->>Server: Return ID token & user profile (Google ID, Email, Name)
    Server->>Mongo: Find or create User record
    Mongo-->>Server: User record confirmed
    Server->>Server: Generate secure session token (crypto.randomBytes)
    Server->>Mongo: Save session with 7-day TTL index
    Server-->>Client: 200 OK + Set-Cookie: session_id (HttpOnly, Secure, SameSite=Strict)
    Client->>Client: Check if username exists
    alt New User without Username
        Client->>User: Display "Choose your unique username"
        User->>Client: Enters desired username
        Client->>Server: PATCH /api/users/profile { username }
        Server->>Mongo: Validate uniqueness and save username
        Server-->>Client: 200 OK Profile updated
    end
    Client->>Client: Initialize E2EE Identity & Prekeys locally
```

---

## 3. Client Key Generation & Public Key Bundle Registration

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Client as Client App (Web Crypto Engine)
    participant Server as Express API Server
    participant Mongo as MongoDB

    Client->>Client: Generate Identity Key Pair (IK: Ed25519 or ECDSA P-256)
    Client->>Client: Generate Signed PreKey Pair (SPK: X25519 or ECDH P-256)
    Client->>Client: Sign SPK with Identity Private Key
    Client->>Client: Store Private Keys in IndexedDB / Memory (non-extractable)
    Client->>Server: POST /api/keys/register { identityPublicKey, signedPreKey, signature }
    Server->>Server: Verify SPK signature using identityPublicKey
    Server->>Mongo: Store Public Key Bundle under User document
    Mongo-->>Server: Saved
    Server-->>Client: 200 OK (Public Key Bundle Registered)
```

---

## 4. Conversation Initialization & Live Handshake Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Alice (Client A)
    participant Server as textLove Backend
    actor Bob as Bob (Client B)

    Alice->>Server: POST /api/conversations/initiate { recipientUsername: "bob" }
    Server->>Server: Check Bob's online presence in Connection Registry
    alt Bob is Offline
        Server-->>Alice: 400 Bad Request { error: "RECIPIENT_OFFLINE", message: "Bob is currently offline. textLove only allows live messaging." }
    else Bob is Online
        Server->>Server: Create ActiveConversation (status: "pending_handshake")
        Server->>Bob: Socket emit 'conv:incoming_request' { conversationId, sender: "alice" }
        Bob-->>Server: Socket emit 'conv:accept_request' { conversationId }
        Server->>Alice: Socket emit 'conv:established' { conversationId, bobPublicKeyBundle }
        Server->>Bob: Socket emit 'conv:established' { conversationId, alicePublicKeyBundle }
        Alice->>Alice: Compute Shared Master Secret & Session Ratchet
        Bob->>Bob: Compute Shared Master Secret & Session Ratchet
        Alice->>Alice: Display Safety Number (Fingerprint)
        Bob->>Bob: Display Safety Number (Fingerprint)
    end
```

---

## 5. Live-Only Message Send & Ephemeral Relay Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Alice (Sender)
    participant ClientA as Alice's Client Engine
    participant Server as textLove Backend (Socket.IO)
    participant ClientB as Bob's Client Engine
    actor Bob as Bob (Recipient)

    Alice->>ClientA: Type "Hi Bob!" & hit send
    ClientA->>ClientA: Encrypt plaintext using AES-256-GCM (Session Key, Sequence #, Timestamp)
    ClientA->>ClientA: Mark message locally as PENDING_RELAY
    ClientA->>Server: Socket emit 'msg:send' { conversationId, recipientId: "bob", ciphertext, iv, seq, timestamp }
    Server->>Server: Verify Alice session & conversation membership
    Server->>Server: Verify Bob socket is actively connected right now!
    alt Bob Socket Disconnected / Dropped
        Server-->>ClientA: Socket emit 'msg:error' { seq, code: "RECIPIENT_DISCONNECTED", message: "Bob disconnected. Message not delivered." }
        ClientA->>Alice: Update message status to FAILED_OFFLINE (Red warning)
        ClientA->>ClientA: Drop from queue (no auto-replay)
    else Bob Socket Connected
        Server->>ClientB: Socket emit 'msg:deliver' { conversationId, senderId: "alice", ciphertext, iv, seq, timestamp }
        Server-->>ClientA: Socket emit 'msg:relayed' { seq, status: "RELAYED_TO_NETWORK" }
        ClientA->>Alice: Update message badge to single tick (Relayed)
        Note over Server: Server drops ciphertext references immediately from RAM
        ClientB->>ClientB: Validate seq, decrypt with Session Key & AEAD tag
        ClientB->>ClientB: Append plaintext to ephemeral React state array
        ClientB->>Bob: Render "Hi Bob!" on screen
        ClientB->>Server: Socket emit 'msg:ack' { conversationId, seq, status: "DECRYPTED" }
        Server->>ClientA: Socket emit 'msg:peer_ack' { seq, status: "DECRYPTED" }
        ClientA->>Alice: Update message badge to double green tick (Decrypted & Received)
    end
```

---

## 6. Conversation Expiry & Teardown Sequence

```mermaid
sequenceDiagram
    autonumber
    participant Server as textLove Backend
    participant ClientA as Alice's Client
    participant ClientB as Bob's Client
    participant Mongo as MongoDB

    Note over Server: 30 minutes pass without message sends or qualifying actions
    Server->>Server: Inactivity Monitor detects conversationId exceeds 30m idle limit
    Server->>Mongo: Update ActiveConversation status = "expired", remove session metadata
    Server->>ClientA: Socket emit 'conv:expired' { conversationId, reason: "30_MIN_INACTIVITY" }
    Server->>ClientB: Socket emit 'conv:expired' { conversationId, reason: "30_MIN_INACTIVITY" }
    ClientA->>ClientA: Purge local plaintext message array & session keys from memory
    ClientB->>ClientB: Purge local plaintext message array & session keys from memory
    ClientA->>ClientA: Render "Conversation has expired due to 30 minutes of inactivity" screen
    ClientB->>ClientB: Render "Conversation has expired due to 30 minutes of inactivity" screen
```
