# textLove - Threat Model & Security Controls

## 1. Threat Modeling Overview

textLove is designed under a realistic threat model assuming that network traffic is monitored by adversaries, servers may be targeted for intrusion, and browser environments carry inherent execution risks. 

We apply the **STRIDE** methodology (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) tailored specifically to a zero-retention, end-to-end encrypted messaging application.

---

## 2. Threat Vector Analysis & Countermeasures

### 2.1 Malicious Users
- **Threat**: Bad actors registering abusive usernames, stalking users, sending unsolicited chat requests, or flooding message channels.
- **Controls**:
  - Unique public usernames are constrained by regex `^[a-zA-Z0-9_]{3,24}$` and profanity filters.
  - Mutual consent handshake: Conversations require reciprocal connection initiation. A user cannot unilaterally force an encrypted session onto another user without an explicit invite/acceptance flow.
  - Rate limiting on conversation initiation requests (maximum 5 requests per minute per IP/user).
  - One-click "Block & Terminate" which tears down the active socket room and rejects future initiation attempts.

### 2.2 Account Compromise & OAuth Exploitation
- **Threat**: Compromised Google account, stolen OAuth authorization codes, or OAuth redirect URI tampering.
- **Controls**:
  - Google OAuth 2.0 implementation with PKCE (Proof Key for Code Exchange) and state verification parameter signed cryptographically to prevent CSRF / authorization code injection.
  - Server-side token exchange: client never touches Google client secrets.
  - Short-lived application sessions (TTL bounded) tied to cryptographically secure session IDs stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies.
  - Account deletion immediately invalidates all active sessions and revokes session tokens.

### 2.3 Cross-Site Scripting (XSS) & Malicious Browser Scripts
- **Threat**: Injected JavaScript accessing plaintext message state in memory or exfiltrating E2EE keys.
- **Controls**:
  - **Content Security Policy (CSP)**:
    ```http
    Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://res.cloudinary.com https://lh3.googleusercontent.com; connect-src 'self' wss: https:; frame-ancestors 'none'; form-action 'self';
    ```
  - **No `eval()` or dynamic code execution**: Strict Vite production bundle with no runtime code generation.
  - **DOM Escaping**: React JSX automatic string escaping prevents HTML injection from usernames or message previews.
  - **Non-Extractable Crypto Keys**: Web Crypto API keys generated with `extractable: false` prevents unauthorized script exfiltration of the raw private key bytes via simple property reads.

### 2.4 Session Theft & Man-in-the-Middle (MitM)
- **Threat**: Interception of HTTP traffic, session token replay, or cross-site request forgery.
- **Controls**:
  - Mandatory HTTPS/TLS 1.3 in production with `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
  - Session cookie attributes: `HttpOnly` (inaccessible via JavaScript `document.cookie`), `Secure` (transmitted solely over HTTPS), `SameSite=Strict` (prevents cross-site credential dispatch).
  - Session ID generation using CSPRNG (`crypto.randomBytes(32)`).
  - Socket.IO authentication validates the session cookie upon the initial HTTP upgrade handshake.

### 2.5 Unauthorized Conversation Access
- **Threat**: An attacker attempts to join an arbitrary socket room or eavesdrop on a conversation ID they do not belong to.
- **Controls**:
  - Ephemeral conversation IDs are generated with cryptographically secure UUID v4 tokens.
  - Socket.IO rooms are guarded server-side: when a client requests to join a room, the server checks the database/in-memory session map to verify that `socket.userId === participantA` OR `socket.userId === participantB`.
  - If a user is not authorized, the connection is instantly rejected with `403 Forbidden` and logged as a security alert.
  - Even if an attacker somehow joined a socket room, all payloads are E2EE ciphertext encrypted under keys known only to the two verified participants.

### 2.6 WebSocket Abuse & Flooding (Denial of Service)
- **Threat**: Connection exhaustion, rapid message blasting, huge payload uploads, or memory exhaustion attacks.
- **Controls**:
  - Maximum payload size limit on Socket.IO: `maxHttpBufferSize: 64 * 1024` (64 KB). Any message exceeding this limit is severed at the transport layer.
  - Per-socket rate limiter: Token bucket algorithm restricting messages to a maximum of 10 messages per second per user socket. Exceeding triggers a temporary socket mute, repeated violation results in disconnection.
  - Strict connection rate limits per IP using Express rate limiting.

### 2.7 Key Substitution & Compromise (Man-in-the-Middle on E2EE)
- **Threat**: A compromised server substitutes participant B's public key with the attacker's public key during key exchange.
- **Controls**:
  - **Safety Number / Key Fingerprint Verification**: The client calculates a SHA-256 fingerprint of the combined public keys:
    $$\text{Fingerprint} = \text{SHA-256}(PK_A \mathbin{\Vert} PK_B)$$
    displayed in the UI as a scannable QR code and 12-digit safety number. Users can compare safety numbers out-of-band to guarantee zero key substitution.
  - Ephemeral Key Pair per conversation session: In addition to Identity Keys, each active conversation derives an ephemeral Diffie-Hellman secret, ensuring that even if an old key was later revealed, past sessions remain secure (Forward Secrecy).

### 2.8 Replayed or Modified Ciphertext
- **Threat**: An adversary intercepts ciphertext and re-submits it to replay old messages or flips bits in transit.
- **Controls**:
  - **Authenticated Encryption with Associated Data (AEAD)**: AES-256-GCM or ChaCha20-Poly1305 guarantees ciphertext integrity. Any tampered bit causes decryption failure.
  - **Anti-Replay Counters & Monotonic Sequence Numbers**: Each message envelope includes an incrementing 64-bit sequence counter and UTC epoch timestamp.
  - Associated Data (AD) binds the ciphertext to the `conversationId` and `sequenceNumber`:
    $$C = \text{Encrypt}_{K}(\text{plaintext}, AD = \text{conversationId} \mathbin{\Vert} \text{seq})$$
  - The recipient validates that `seq == expectedSeq` and verifies the AEAD authentication tag. Replayed sequence numbers are rejected immediately.

### 2.9 Metadata Exposure & Traffic Analysis
- **Threat**: Observers monitor network traffic to discover who is talking to whom and when.
- **Controls**:
  - WSS (WebSocket over TLS) encrypts all transport headers and payloads.
  - Minimal metadata exposed: the server only tracks connected socket IDs and conversation participation while the session is alive.
  - No logs of message sizes, timings, or recipient IDs are persisted in database audit trails.

### 2.10 Server Compromise Scenario
- **Threat**: Root access gained on the Node.js backend.
- **Impact & Resilience**:
  - The attacker **CANNOT** decrypt past or present messages, because the server never holds private keys.
  - The attacker **CANNOT** retrieve message history from the database, because the database stores zero message content.
  - The attacker **CAN** attempt denial of service or actively substitute public keys for future sessions (which will trigger a safety number fingerprint mismatch warning in client UIs).

### 2.11 Malicious or Compromised Recipient Devices
- **Threat**: The recipient device takes screenshots, runs malware, or extracts data from memory.
- **Honest Limitations Acknowledged**:
  - **No Web Screenshot Prevention**: Modern web browsers running on desktop OS (Windows, macOS, Linux) or mobile (Android, iOS) provide no foolproof API to prevent OS-level screenshots, screen recording, or external cameras photographing the display.
  - **DOM & In-Memory Reality**: Plaintext must exist in JavaScript memory and the DOM tree to be rendered visually on screen. While textLove wipes message arrays immediately upon conversation teardown and does not write to local storage, an attacker with root/malware access to the client operating system can inspect browser process memory.

---

## 3. Security Headers Specification

Every HTTP response sent by the Express server must include:

```http
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0
Referrer-Policy: strict-origin-when-cross-origin
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://res.cloudinary.com https://lh3.googleusercontent.com; connect-src 'self' wss: https:; frame-ancestors 'none';
```
