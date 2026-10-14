# textLove - Master Architectural Specification & Phase Roadmap

## 1. Architectural Summary & System Cohesion

**textLove** is an ephemeral, end-to-end encrypted (E2EE) one-to-one web messaging application engineered for guaranteed privacy through **zero intentional server-side data retention**.

### Architectural Invariants:
1. **Zero Message Persistence**: Plaintext and ciphertext exist in server memory only during the microsecond packet routing cycle. MongoDB strictly contains identity metadata (`users`), active login sessions (`sessions`), and active pairing metadata (`conversations`). No message bodies, ciphertexts, message hashes, or delivery histories are stored anywhere.
2. **Strict Live-Only Relay**: Both participants must be online with verified active WebSocket connections. If the recipient is offline, the server instantly rejects the message and notifies the sender. Messages are never queued, delayed, or replayed.
3. **Audited End-to-End Encryption**: End-to-end encryption using `libsodium-wrappers` / standard Web Crypto API (X25519 key exchange, Ed25519 signatures, AES-256-GCM / ChaCha20-Poly1305 AEAD, HKDF ratcheting) with 12-digit safety numbers. Private keys are generated and retained exclusively on client devices.
4. **Authoritative 30-Minute Inactivity Expiry**: Conversations automatically expire 30 minutes after the last qualifying messaging action. The server enforces this authoritatively, even if both clients disconnect.
5. **Delete-for-Both & Full Account Purge**: Either participant can permanently close the conversation for both sides, immediately wiping all in-memory message history and keys. Account deletion revokes all sessions, purges MongoDB metadata, and deletes Cloudinary avatars.
6. **Modern, Minimal Aesthetic**: Built with React, TypeScript, Vite, Tailwind CSS, and shadcn/ui featuring a deep obsidian dark mode, crisp porcelain light mode, restrained glassmorphism, and responsive PWA capabilities.

---

## 2. Directory of Specification Deliverables

All detailed technical specifications have been authored and checked into the [`docs/`](file:///d:/Projects/textLove/docs) directory:

1. [01_ARCHITECTURE.md](file:///d:/Projects/textLove/docs/01_ARCHITECTURE.md): System principles, tier boundaries, stack decisions, and buffer handling.
2. [02_THREAT_MODEL.md](file:///d:/Projects/textLove/docs/02_THREAT_MODEL.md): STRIDE threat model, browser security controls, CSP, and honest limitations.
3. [03_DATA_FLOW_DIAGRAMS.md](file:///d:/Projects/textLove/docs/03_DATA_FLOW_DIAGRAMS.md): Mermaid sequence and component diagrams.
4. [04_DATABASE_SCHEMA_AND_POLICY.md](file:///d:/Projects/textLove/docs/04_DATABASE_SCHEMA_AND_POLICY.md): MongoDB schemas, indexes, and automated prohibited-data blacklisting.
5. [05_API_AND_WEBSOCKET_CONTRACTS.md](file:///d:/Projects/textLove/docs/05_API_AND_WEBSOCKET_CONTRACTS.md): REST endpoints, Zod schemas, and Socket.IO event payloads.
6. [06_E2EE_PROTOCOL_EVALUATION.md](file:///d:/Projects/textLove/docs/06_E2EE_PROTOCOL_EVALUATION.md): Comparative cryptographic library evaluation and ratcheting spec.
7. [07_SESSION_AND_AUTH.md](file:///d:/Projects/textLove/docs/07_SESSION_AND_AUTH.md): Google OAuth 2.0 PKCE, HttpOnly cookie hardening, and session rotation.
8. [08_PRESENCE_AND_LIVE_MESSAGING.md](file:///d:/Projects/textLove/docs/08_PRESENCE_AND_LIVE_MESSAGING.md): In-memory presence registry, atomic send-time checks, and honest states.
9. [09_EXPIRY_SPECIFICATION.md](file:///d:/Projects/textLove/docs/09_EXPIRY_SPECIFICATION.md): Authoritative 30-minute inactivity rules and sweep daemons.
10. [10_DELETION_SEMANTICS.md](file:///d:/Projects/textLove/docs/10_DELETION_SEMANTICS.md): Delete-for-Both, cascading account purge, and V8 memory realities.
11. [11_UI_DESIGN_SYSTEM.md](file:///d:/Projects/textLove/docs/11_UI_DESIGN_SYSTEM.md): HSL color tokens, typography, message bubbles, and accessibility.
12. [12_TEST_AND_DEPLOYMENT_PLAN.md](file:///d:/Projects/textLove/docs/12_TEST_AND_DEPLOYMENT_PLAN.md): Vitest, Supertest, Playwright multi-user E2E, and Docker deployment.

---

## 3. Unresolved Questions & Risky Assumptions

Before beginning Phase 1, we identify the following architectural trade-offs and questions for user review:

### Question 1: Username Recycling Upon Account Deletion
- **Risk/Assumption**: When a user deletes their account, should their unique username become immediately available for another user to claim, or should deleted usernames be quarantined/reserved to prevent impersonation attacks?
- *Proposed default*: 30-day quarantine before releasing username for re-registration.

### Question 2: Multi-Tab & Multi-Device Behavior for Live-Only Sessions
- **Risk/Assumption**: If a user opens textLove in two browser tabs or two devices simultaneously, how should live messages be routed?
- *Proposed default*: A single active primary session per user for conversation sockets. If a user connects from a second tab, the prior tab's socket is notified and transitioned to standby/view-only mode to prevent race conditions in ratcheted key sequences.

### Question 3: Development & Testing Mock for Google OAuth
- **Risk/Assumption**: During local development and automated CI testing without live Google credentials, do you prefer a dedicated Dev Auth Mock provider (enabled strictly when `NODE_ENV === 'development' | 'test'`) that simulates Google sign-in with mock user profiles?
- *Proposed default*: Include a secure development mock identity provider enabled strictly in non-production environments to allow frictionless local development and automated CI testing.

---

## 4. Implementation Phase Breakdown (Roadmap)

To ensure strict compliance with the incremental delivery workflow:

- **Phase 0 (Current)**: Architecture, Threat Model & Specification (COMPLETED).
- **Phase 1**: Project Foundation & Environment Setup (Monorepo/Folder structure, TypeScript config, Vite + React + Tailwind + Express skeleton, ESLint/Vitest infrastructure, environment variables).
- **Phase 2**: Database Models & Prohibited-Data Enforcement (MongoDB setup, User/Session/Conversation schemas, automated schema blacklist CI test).
- **Phase 3**: Authentication & User Management (Google OAuth 2.0 PKCE, session management, username reservation, Cloudinary avatar flow, account deletion).
- **Phase 4**: End-to-End Cryptography Engine (Client-side key generation, prekey registration, Triple-DH session derivation, AES-256-GCM / ChaCha20 AEAD ratcheting, safety numbers).
- **Phase 5**: Real-Time Socket Gateway, Presence & Live-Only Messaging (Socket.IO server, in-memory connection registry, atomic live relay, honest delivery status, zero message queueing).
- **Phase 6**: 30-Minute Expiry Daemon & Delete-for-Both Mechanics (Dual enforcement sweep, server-authoritative expiry, client memory purge, race condition handling).
- **Phase 7**: UI/UX Implementation & PWA Polish (Responsive chat interface, obsidian dark / porcelain light themes, countdown timer, safety number modal, PWA manifest).
- **Phase 8**: Integration, Security Auditing, E2E Testing & Verification (Playwright multi-user live messaging tests, penetration checks, load tests, final validation).
