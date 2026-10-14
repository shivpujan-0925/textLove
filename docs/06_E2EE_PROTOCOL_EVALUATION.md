# textLove - End-to-End Encryption (E2EE) Protocol Evaluation & Specification

## 1. Requirements for textLove E2EE Architecture

The cryptographic architecture for textLove must satisfy:
1. **Audited & Maintained Standards**: No custom or homegrown cryptographic primitives.
2. **Suitability for Live-Only Browser Messaging**: Because textLove rejects store-and-forward and offline message queues, the protocol does not require complex multi-prekey asynchronous synchronization trees (e.g. Signal's 100-one-time-prekey pool), but MUST provide:
   - **Forward Secrecy (FS)**: Compromise of current keys does not compromise past messages.
   - **Post-Compromise Security (PCS)**: Fresh ephemeral ratcheting allows recovery from temporary compromise.
   - **AEAD Integrity**: Authenticated Encryption with Associated Data (guaranteeing ciphertext authenticity and binding it to conversation ID and sequence number).
   - **Non-Extractability & Browser Memory Safety**: Protection against trivial key exfiltration.
   - **Verifiable Out-of-Band Safety Numbers**: Cryptographic fingerprint verification against Man-in-the-Middle (MitM) key substitution.

---

## 2. Comparative Evaluation of Candidate Libraries

| Criterion | 1. libsignal-protocol | 2. Matrix Vodozemac (Olm) | 3. libsodium-wrappers | 4. Web Crypto API (Native SubtleCrypto) |
| :--- | :--- | :--- | :--- | :--- |
| **Maintenance** | Low (TypeScript port unmaintained since 2021) | High (Active Matrix.org Rust/WASM project) | **High** (Actively maintained, ubiquitous standard) | **Standardized** (W3C Standard, built into browser engines) |
| **Bundle Size** | ~400 KB | ~1.2 MB (WASM binary) | **~180 KB** (Optimized WASM/JS) | **0 KB** (Native browser API) |
| **Designed For** | Asynchronous store-and-forward (SMS/Signal style) | Asynchronous Matrix federation | Ephemeral sessions, stream encryption, key exchange | Core browser cryptography, non-extractable keys |
| **Primitives Used** | Curve25519, AES-CBC-HMAC | Curve25519, AES-256, Ed25519 | **X25519, ChaCha20-Poly1305, Ed25519, BLAKE2b** | **P-256/X25519, AES-GCM-256, HKDF-SHA256, ECDSA** |
| **Suitability for Live-Only Web App** | Overengineered; complex state sync requires persistent DB | Heavy WASM initialization overhead | **Excellent**: direct `crypto_kx`, instant zero-overhead sessions | **Excellent**: hardware accelerated, `extractable: false` keys |

---

## 3. Cryptographic Architecture Selection & Decision

### **Selected Approach: Dual-Layered Robust Standard**
We adopt **`libsodium-wrappers`** as our primary cryptographic library, backed by the standard **Web Crypto API (`window.crypto.subtle`)** principles.

Both libraries rely on battle-tested primitives audited by world-class cryptographers:
- **Asymmetric Key Exchange**: **X25519** (Diffie-Hellman on Curve25519) via `crypto_kx_keypair` / `crypto_kx_client_session_keys`
- **Identity & Signatures**: **Ed25519** (`crypto_sign_keypair`)
- **Symmetric Authenticated Encryption (AEAD)**: **ChaCha20-Poly1305** or **AES-256-GCM**
- **Key Derivation Function (KDF)**: **HKDF-SHA256** / `crypto_kdf_derive_from_key`
- **Safety Number / Fingerprint**: **SHA-256** format

---

## 4. Key Management & Lifecycle

```
[User Registration]
        |
        v
+-------------------------------------------------------+
| Device generates:                                     |
| 1. Identity Key Pair (Ed25519): (IK_priv, IK_pub)     |
| 2. Base PreKey Pair (X25519): (SPK_priv, SPK_pub)     |
| 3. SPK Signature: Sign(IK_priv, SPK_pub)              |
+-------------------------------------------------------+
        |
        | Public keys sent to server directory (private keys stay on device)
        v
[MongoDB Public Key Bundle Directory]
```

### 4.1 Ephemeral Session Handshake (Per Conversation)
When Alice and Bob establish an active live session:
1. Alice retrieves Bob's verified Public Key Bundle `(IK_B, SPK_B)`.
2. Bob receives Alice's Public Key Bundle `(IK_A, SPK_A)`.
3. Alice generates an Ephemeral Key Pair: `(EK_A_priv, EK_A_pub)`.
4. Bob generates an Ephemeral Key Pair: `(EK_B_priv, EK_B_pub)`.
5. Both clients compute the Triple Diffie-Hellman master secret:
   $$DH_1 = \text{ECDH}(IK_A, SPK_B)$$
   $$DH_2 = \text{ECDH}(EK_A, IK_B)$$
   $$DH_3 = \text{ECDH}(EK_A, SPK_B)$$
   $$DH_4 = \text{ECDH}(EK_A, EK_B)$$
   $$\text{MasterSecret} = \text{HKDF-Extract}(\text{Salt}, DH_1 \mathbin{\Vert} DH_2 \mathbin{\Vert} DH_3 \mathbin{\Vert} DH_4)$$

### 4.2 Symmetric Ratchet per Message (Forward Secrecy)
For every message $i$:
1. A Message Key $MK_i$ is derived using the KDF:
   $$MK_i = \text{HKDF-Expand}(\text{ChainKey}_i, \text{"MessageKey"})$$
   $$\text{ChainKey}_{i+1} = \text{HKDF-Expand}(\text{ChainKey}_i, \text{"ChainAdvance"})$$
2. Plaintext is encrypted with $MK_i$ and a fresh 12-byte random nonce:
   $$\text{Ciphertext} = \text{Encrypt}_{\text{AEAD}}(MK_i, \text{Nonce}, \text{Plaintext}, AD)$$
   where Associated Data:
   $$AD = \text{ConversationUUID} \mathbin{\Vert} \text{SeqNumber} \mathbin{\Vert} \text{Timestamp}$$
3. $MK_i$ is **immediately erased from memory** after encryption/decryption.

---

## 5. Safety Number / Fingerprint Verification

To prevent Man-in-the-Middle (MitM) key substitution by a malicious or compromised server:
1. Both client devices calculate the canonical fingerprint:
   $$\text{RawFingerprint} = \text{SHA-256}(\text{Sort}(IK_A \mathbin{\Vert} IK_B))$$
2. The 32-byte digest is formatted into a **12-digit numeric code** displayed in four groups of three digits:
   ```
   842-194-039-771
   ```
3. A visual QR code encoding the fingerprint URL is also rendered in the chat header info modal.
4. If participants verify their safety numbers in person or via an alternate channel, they are mathematically guaranteed that no third party is intercepting the session.
