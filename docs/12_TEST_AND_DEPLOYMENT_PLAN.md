# textLove - Test & Deployment Plan

## 1. Quality Assurance Strategy & Testing Pyramid

textLove implements rigorous multi-tier testing designed to validate security assertions, zero-retention invariants, and real-time socket behavior.

```
                  / \
                 /   \
                / E2E \          Playwright (Multi-User Live Sessions)
               /-------\
              / Socket  \        Supertest + Socket.IO Client Pairs
             /  Integ.   \
            /-------------\
           /   API Unit    \     Vitest + Supertest (REST & Auth)
          /  & Component    \    React Testing Library (UI Components)
         /-------------------\
        /  Crypto & Security  \  Vitest (WebCrypto / Libsodium unit tests,
       /     Invariants        \ Schema Blacklist linter, CSP checker)
      /-------------------------\
```

---

## 2. Test Suites Specification

### 2.1 Cryptographic & Security Invariant Tests (`test/crypto/`)
- **Key Pair Generation**: Validates key lengths, format conversions (Base64/ArrayBuffer), and signature verification.
- **AEAD Encryption & Decryption**: Tests authenticated encryption with AES-256-GCM / ChaCha20-Poly1305. Verifies that tampered bits or mismatched sequence numbers in Associated Data cause immediate decryption failure.
- **Ratcheting & Forward Secrecy**: Validates that message keys advance monotonically and past message keys cannot decrypt future messages.
- **Safety Number Derivation**: Tests deterministic SHA-256 fingerprint derivation regardless of which participant is sorted first.
- **Database Schema Blacklist Audit**: Inspects all Mongoose models to guarantee zero collections or fields related to message history or ciphertext.

### 2.2 Backend API & Session Integration Tests (`test/api/`)
- **Google OAuth PKCE Simulation**: Mocks Google token exchange; verifies state parameter checks, PKCE code challenge verification, and session creation.
- **Session Cookie Security**: Verifies `HttpOnly`, `Secure`, `SameSite=Strict`, and cookie parsing.
- **Rate Limiting**: Sends burst requests to verify 429 Too Many Requests responses.
- **Account Deletion Cascade**: Verifies that invoking account deletion revokes active sessions and clears user records.

### 2.3 Socket.IO Real-Time & Live-Only Delivery Tests (`test/socket/`)
- **Live-Only Rejection Test**: Client A attempts to send a message when Client B is disconnected. Asserts that the server returns `RECIPIENT_OFFLINE` and zero bytes are queued.
- **Atomic Relay & ACK Test**: Client A and Client B connected. Client A sends message -> Server relays -> Client B receives and sends ACK -> Client A receives `DECRYPTED` status.
- **Zero-Storage RAM Verification**: Verifies that the server does not store message frames in any in-memory list or dictionary after relay.
- **Inactivity Expiry Test**: Fast-forwards time by 30 minutes; asserts that conversation status transitions to `expired` and subsequent sends fail.
- **Delete-for-Both Test**: Asserts that one client triggering delete disconnects the room and clears states on both clients.

### 2.4 Browser End-to-End Tests with Playwright (`test/e2e/`)
- **Multi-Browser Context Execution**: Launches two isolated browser contexts (Alice and Bob) simultaneously:
  1. Alice logs in, sets username `@alice`.
  2. Bob logs in, sets username `@bob`.
  3. Alice initiates chat with `@bob`.
  4. Bob accepts incoming chat notification.
  5. Alice sends "Hello Bob!" -> Bob verifies receipt and E2EE decryption in real-time.
  6. Alice turns off Bob's browser (disconnect) -> Alice attempts to send a message -> Alice observes immediate `FAILED_OFFLINE` error without hanging.
  7. Alice clicks "End & Delete Conversation" -> Both screens transition immediately to terminated state.

---

## 3. Dependency, Secret & Security Audits

Every pull request and build runs automated security checks:
```bash
# 1. Dependency vulnerability audit
npm audit --audit-level=high

# 2. Secret leak scanning
npx gitleaks detect --source=. -v

# 3. Static type-check
npm run typecheck

# 4. ESLint security rules (eslint-plugin-security)
npm run lint
```

---

## 4. Production Deployment Architecture

```
                  [Internet / Users]
                          |
                          v
               [Cloudflare / Edge Proxy]
               - TLS 1.3 Termination
               - DDoS Mitigation & WAF
               - Strict Security Headers
                          |
                          v
         [Containerized Express Server (Docker)]
         - Node.js Alpine runtime (Distroless / Non-root user)
         - Serves Vite PWA static bundle via compression middleware
         - Handles REST API & Socket.IO WSS gateway
                          |
            +-------------+-------------+
            |                           |
            v                           v
  [MongoDB Atlas (Replica Set)]   [Cloudinary CDN]
  - IP Whitelist Restricted       - Signed Uploads
  - Encrypted at rest (AES-256)   - Admin API Purge
  - TLS enforced
```

### Environment Configuration:
- `NODE_ENV=production`
- `PORT=3000`
- `MONGODB_URI=mongodb+srv://...`
- `GOOGLE_CLIENT_ID=...`
- `GOOGLE_CLIENT_SECRET=...`
- `SESSION_SECRET=...`
- `CLOUDINARY_CLOUD_NAME=...`
- `CLOUDINARY_API_KEY=...`
- `CLOUDINARY_API_SECRET=...`
- `APP_URL=https://textlove.app`
