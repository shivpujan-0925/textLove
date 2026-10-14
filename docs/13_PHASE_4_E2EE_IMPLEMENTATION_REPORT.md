# textLove - Phase 4: End-to-End Encryption (E2EE) Implementation & Security Analysis

## 1. Selected Cryptographic Libraries & Standards

textLove strictly adheres to established, independently reviewed cryptographic standards and audited libraries:

| Primitive / Operation | Algorithm & Specification | Library / Engine | Rationale |
| :--- | :--- | :--- | :--- |
| **Identity & Fingerprinting** | **Ed25519** (RFC 8032) | `@noble/curves` (v2.4.0) | Audited by Cure53; minimal, timing-safe, zero dependencies. |
| **Key Agreement (Diffie-Hellman)** | **X25519** (RFC 7748) | `@noble/curves` (v2.4.0) | State-of-the-art Montgomery curve Diffie-Hellman on Curve25519. |
| **Pre-Key Authentication** | **Ed25519 Signatures** | `@noble/curves` (v2.4.0) | Authenticates ownership of signed pre-keys, preventing server key substitution. |
| **Key Derivation (KDF)** | **HKDF-SHA256** (RFC 5869) | `@noble/hashes` (v2.4.0) | Extract-and-expand pseudorandom key derivation for chain ratcheting. |
| **Symmetric AEAD Encryption** | **AES-256-GCM** (NIST SP 800-38D) | W3C Standard Web Crypto API (`SubtleCrypto`) | Native hardware-accelerated authenticated encryption with 128-bit authentication tag. |
| **Fingerprint & Safety Number** | **SHA-256 Digest** | `@noble/hashes` (v2.4.0) | Symmetric lexicographical hash formatted as a 12-digit human-auditable number. |

---

## 2. Key Management & Handshake Architecture

### 2.1 Identity & Public Key Registration
1. **Local Key Generation**: The client device generates an Ed25519 Identity Key Pair $(IK_{\text{priv}}, IK_{\text{pub}})$ and an X25519 Base Pre-Key $(SPK_{\text{priv}}, SPK_{\text{pub}})$.
2. **Signature Binding**: The device signs $SPK_{\text{pub}}$ using $IK_{\text{priv}}$.
3. **Public Bundle Registration (`POST /api/v1/keys/register`)**:
   - The client submits only the public bundle $\{ IK_{\text{pub}}, SPK_{\text{pub}}, \text{Signature} \}$.
   - The backend validates the Ed25519 signature before publishing.
   - **Strict Invariant**: Private keys **never** leave the client. If private key fields are detected in the request body, the backend immediately rejects with `400 PRIVATE_KEY_PROHIBITED`.

### 2.2 Ephemeral Session Handshake (X3DH Variant for Live Messaging)
When Alice initiates a live conversation with Bob:
1. Alice retrieves Bob's verified public bundle from the server directory.
2. Alice verifies Bob's signature on his signed pre-key.
3. Alice generates a fresh X25519 ephemeral keypair $(EK_{A,\text{priv}}, EK_{A,\text{pub}})$.
4. Alice computes the Diffie-Hellman shared secrets:
   - $DH_1 = \text{X25519}(SPK_{A,\text{priv}}, SPK_{B,\text{pub}})$ (Static-Static authenticated DH)
   - $DH_2 = \text{X25519}(EK_{A,\text{priv}}, SPK_{B,\text{pub}})$ (Ephemeral-Static DH)
5. Alice derives Root Key ($RK$) and initial unidirectional Chain Keys ($CK_{\text{send}}, CK_{\text{recv}}$) using HKDF-SHA256 with application salt `"textLove-Protocol-Salt-v1"` and conversation context info.
6. When Bob receives Alice's first message containing $EK_{A,\text{pub}}$, Bob computes the exact matching $DH_1$ and $DH_2$ values and derives the identical initial chain keys.

### 2.3 Forward-Secure Symmetric Ratchet (Per Message)
For each message sent with sequence number $seq$:
1. A single-use 256-bit Message Key ($MK_{seq}$) is derived:
   $$MK_{seq} = \text{HKDF-Expand}(CK_{\text{send}}, \text{"MK-"} \mathbin{\Vert} seq, 32)$$
2. The chain key is immediately ratcheted forward:
   $$CK_{\text{send}} = \text{HKDF-Expand}(CK_{\text{send}}, \text{"ChainAdvance"}, 32)$$
3. The message is encrypted using AES-256-GCM with a fresh 12-byte random IV.
4. **Associated Data (AD)** is bound to the ciphertext tag:
   $$AD = \text{JSON}(\{ \text{conversationId}, seq, \text{senderUsername}, \text{recipientUsername} \})$$
5. $MK_{seq}$ is **immediately zeroized from memory**.
6. When the recipient authenticates and decrypts the ciphertext, its receiving chain advances symmetrically and $MK_{seq}$ is zeroized.

---

## 3. Replay, Tamper, & Ordering Protection

1. **Replay Rejection**: Each conversation maintains a monotonically increasing sequence counter $seq$. The recipient maintains `recvSeq` and `seenRecvSeqs`. Duplicate or replayed sequence numbers throw `REPLAY_DETECTED` and are dropped.
2. **Ciphertext & Metadata Tampering**: Because AES-256-GCM computes a 128-bit authentication tag over both the ciphertext and the Associated Data, modifying even a single bit of ciphertext or spoofing the conversation ID/recipient causes `crypto.subtle.decrypt` to fail with `AUTHENTICATION_FAILED`.
3. **Atomic State Advancement**: If an invalid or corrupted packet arrives, the ratchet state is safely rolled back to prevent desynchronization on transient network errors.

---

## 4. Threat Model & Security Boundaries

### 4.1 What IS Protected
- **Eavesdropping on Network / Server**: Even if an attacker controls the ISP, reverse proxy, or backend server, all message bodies are encrypted with keys the server does not possess.
- **Server Database Compromise**: The database contains zero messages and zero private keys. Gaining root access to MongoDB yields no plaintext and no decryption keys.
- **Man-in-the-Middle (MitM) Key Substitution**: Mitigating server key spoofing via the 12-digit out-of-band Safety Number (`XXX-XXX-XXX-XXX`). Both users can verify their fingerprints in person or out-of-band.
- **Forward Secrecy**: If a device's RAM or storage is compromised after a session ends, past messages cannot be decrypted because old message keys are zeroized and chain keys advance monotonically.
- **Replay Attacks**: Replaying past encrypted frames fails the duplicate sequence check.

### 4.2 What is NOT Protected (Limitations & Threat Assumptions)
- **Endpoint Compromise & Root Malware**: If an attacker installs a keylogger, screen recorder, or OS rootkit on the user's phone or computer, plaintext can be stolen at the input/display layer.
- **Browser XSS & Malicious Extensions**:
  - Malicious browser extensions with `<all_urls>` permission can inspect the DOM or intercept typing events.
  - An XSS vulnerability in the web client could execute arbitrary JavaScript inside the application origin. To mitigate this, textLove employs strict Content Security Policy (`CSP`), Helmet security headers, and sanitizes all inputs.
- **Device Theft (Unlocked Browser)**: If an attacker steals an unlocked physical device with an active session, they can view currently displayed ephemeral messages until the 30-minute inactivity timer expires.
- **Metadata Leakage**: While message bodies are end-to-end encrypted, network-level observers can observe connection timing, packet sizes, and communicating IP addresses (traffic analysis).

---

## 5. Independent Security Review Notice

> [!WARNING]
> While textLove integrates audited cryptographic libraries (`@noble/curves`, `@noble/hashes`, and the native W3C Web Crypto API) and follows established Double Ratchet / X3DH design principles:
> 
> **Any production deployment handling high-risk, sensitive, or regulated communications MUST undergo an independent third-party cryptographic review and application security audit before public launch.**
