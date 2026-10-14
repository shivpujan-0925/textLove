# textLove — Security Policy & Threat Model

## 1. Security Philosophy & Invariants

**textLove** is built on a simple premise: **Data that does not exist cannot be compromised, subpoenaed, or leaked.**

Traditional encrypted messaging systems maintain persistent message databases and store-and-forward queues on centralized infrastructure. textLove enforces non-negotiable architectural invariants:

1. **Zero Server Retention**: No message, ciphertext, IV, decryption key, or conversation transcript is ever stored in any database or disk system.
2. **Device-Only End-to-End Encryption**: Ciphertexts are constructed and decrypted exclusively in the client's memory sandbox. The relay server possesses zero decryption capability.
3. **Strict Ephemerality**: Conversations are live-only. If either peer disconnects or remains inactive for 30 minutes, the session is purged and cryptographic keys are permanently shredded.
4. **No Plaintext Persistence**: Neither plaintext nor session ratchet keys are written to `localStorage`, `sessionStorage`, `IndexedDB`, or service worker caches.

---

## 2. Threat Model & Adversary Assumptions

We evaluate textLove against five primary threat actors:

| Threat Actor | Capabilities | textLove Defense |
| :--- | :--- | :--- |
| **Malicious Server Operator / Compromised Host** | Full access to server RAM, database, and network interfaces. | Server receives only authenticated ciphertexts (`AES-256-GCM`). Private identity keys and ratchet keys never leave the client device. Server cannot decrypt messages or forge signatures. |
| **Passive Network Eavesdropper (ISP / Wi-Fi Sniffer)** | Inspects, records, or intercepts network traffic. | Double layer of encryption: TLS 1.3 transport security + End-to-End Application Layer Encryption. Payloads appear as random entropy. |
| **Active Man-in-the-Middle (MITM)** | Attempts to alter, replay, or inject packets on the wire. | **AES-256-GCM** ensures ciphertext integrity via 128-bit authentication tags. Tampered packets fail verification and are instantly dropped. Replay attacks fail due to monotonic ratchet nonces. |
| **Targeted Device Forensics (Post-Session)** | Seizes physical device after conversation closes. | Inactivity auto-expiry scrubs memory. Session ratchet keys and message plaintexts exist only in volatile process RAM; zero traces remain on flash memory or disk. |
| **Compromised Ephemeral Key** | Adversary discovers a single ephemeral message key. | **Double Ratchet forward secrecy**: Past messages remain encrypted and mathematically undecryptable. Ratchet steps continuously advance to restore post-compromise security. |

### Out of Scope / Explicit Non-Goals
- **Active Endpoint Malware / Compromised Operating System**: If a client device is infected with an active keylogger, kernel rootkit, or screen capture malware, application-level cryptography cannot prevent capture of displayed screen content.
- **Physical Shoulder Surfing**: Users are responsible for their physical surroundings while active on the screen.
- **Metadata Anonymity (Traffic Analysis)**: The server necessarily knows which authenticated user IDs have open WebSocket connections to facilitate packet routing. (No message content or metadata is retained after socket teardown).

---

## 3. Cryptographic Implementation Details

### 3.1 Key Hierarchy & Storage

```
Client Device
├── Non-Exportable Storage (IndexedDB via WebCrypto API)
│   ├── Identity Keypair (Ed25519) — Long term device identity
│   └── Signed Prekey Pair (X25519) — Periodically rotated
│
└── Ephemeral Volatile Memory (RAM Only — Zeroized on Exit)
    ├── One-Time Prekey Pairs (X25519)
    ├── Active Ratchet Root Keys (HKDF State)
    ├── Chain Keys (Sending / Receiving)
    ├── Single-use Message Keys (Purged immediately post-decryption)
    └── Message Plaintexts
```

### 3.2 Authentication & Signature Verification
- Bob signs his prekey bundle using his long-term **Ed25519** private key.
- Alice verifies Bob's signature before computing the initial **X3DH** handshake.
- This prevents the server from substituting an unauthorized prekey bundle to perform a man-in-the-middle attack.

### 3.3 Safety Numbers (Fingerprint Verification)
Users can verify the cryptographic integrity of their channel out-of-band by comparing the 60-digit safety number displayed in the conversation settings modal. The safety number is derived from the sorted concatenation of both users' public identity keys:

$$\text{SafetyNumber} = \text{Truncate60}(\text{SHA-256}(IK_A \parallel IK_B))$$

---

## 4. Anti-Forensic Memory Hygiene

To safeguard against physical device inspection or browser heap analysis:

1. **Zeroization Routines**: Cryptographic key material held in memory buffers is explicitly overwritten with pseudorandom bytes prior to garbage collection.
2. **React State Scrubbing**: On session close, conversation arrays in client memory are replaced with empty arrays and immediately garbage collected.
3. **Restricted Cache Scope**: The Progressive Web App Service Worker caches exclusively static assets (`.js`, `.css`, `.svg`, `.html`). API responses and socket payloads bypass all caching mechanisms.
4. **No Local Persistence**: The application explicitly avoids saving conversation logs in IndexedDB or browser web storage.

---

## 5. Security Audit & Automated Testing

textLove maintains an automated test suite verifying security constraints:

```bash
# Run security and cryptographic unit tests
npm test -w server
npm test -w client
```

### Test Suite Validations:
- **Zero-Retention Invariant**: Asserts that no database collection exists for messages and that MongoDB write operations are zero during messaging.
- **Replay Protection**: Verifies that re-transmitting an identical ratchet packet causes the client to fail AEAD authentication.
- **Tampered Payload Rejection**: Asserts that altering any single bit of ciphertext or IV causes AES-256-GCM verification to reject the payload.
- **Offline Message Rejection**: Tests that emitting messages to offline users fails synchronously with `ERR_RECIPIENT_OFFLINE`.
- **Inactivity Sweeper**: Confirms that background timers reap sessions exceeding 30 minutes of idle duration.

---

## 6. Responsible Vulnerability Disclosure

We welcome responsible security research and vulnerability disclosures. If you discover a potential vulnerability within textLove:

1. **Do not disclose publicly** or file a public GitHub issue.
2. Email your findings with a proof-of-concept to the security team or open a **Confidential Security Advisory** on GitHub.
3. Provide reasonable time for remediation prior to public disclosure.

We commit to acknowledging reports within 48 hours and providing transparent patches for verified vulnerabilities.
