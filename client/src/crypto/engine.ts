import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha256.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import {
  KeyPairBytes,
  KeyPairHex,
  PublicKeyBundleHex,
  EncryptedMessagePayload,
  SessionState,
} from './types';
import {
  bytesToHex,
  hexToBytes,
  bytesToBase64,
  base64ToBytes,
  utf8ToBytes,
  bytesToUtf8,
  zeroize,
} from './utils';

const PROTOCOL_SALT = utf8ToBytes('textLove-Protocol-Salt-v1');

/**
 * Generate Ed25519 Identity Key Pair
 */
export function generateIdentityKeyPair(): { bytes: KeyPairBytes; hex: KeyPairHex } {
  const privateKey = crypto.getRandomValues(new Uint8Array(32));
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    bytes: { publicKey, privateKey },
    hex: {
      publicKey: bytesToHex(publicKey),
      privateKey: bytesToHex(privateKey),
    },
  };
}

/**
 * Generate X25519 Signed Pre-Key and sign it with the Ed25519 Identity Private Key
 */
export function generateSignedPreKey(identityPrivateKey: Uint8Array): {
  bytes: KeyPairBytes;
  hex: KeyPairHex;
  signatureHex: string;
} {
  const preKeyPrivate = crypto.getRandomValues(new Uint8Array(32));
  const preKeyPublic = x25519.getPublicKey(preKeyPrivate);
  const signature = ed25519.sign(preKeyPublic, identityPrivateKey);

  return {
    bytes: { publicKey: preKeyPublic, privateKey: preKeyPrivate },
    hex: {
      publicKey: bytesToHex(preKeyPublic),
      privateKey: bytesToHex(preKeyPrivate),
    },
    signatureHex: bytesToHex(signature),
  };
}

/**
 * Cryptographically verify an Ed25519 signature over a signed X25519 Pre-Key
 */
export function verifyPreKeySignature(
  identityPublicKeyHex: string,
  signedPreKeyHex: string,
  preKeySignatureHex: string
): boolean {
  try {
    const idPub = hexToBytes(identityPublicKeyHex);
    const prePub = hexToBytes(signedPreKeyHex);
    const sig = hexToBytes(preKeySignatureHex);

    if (idPub.length !== 32 || prePub.length !== 32 || sig.length !== 64) {
      return false;
    }

    return ed25519.verify(sig, prePub, idPub);
  } catch {
    return false;
  }
}

/**
 * Compute the 12-digit human-verifiable Safety Number (cryptographic fingerprint)
 * Derived symmetrically from lexicographically sorted identity public keys.
 */
export function calculateSafetyNumber(
  identityKeyA: string,
  identityKeyB: string
): { safetyNumber: string; rawFingerprintHex: string } {
  const sorted = [identityKeyA.toLowerCase(), identityKeyB.toLowerCase()].sort();
  const first = sorted[0] ?? '';
  const second = sorted[1] ?? '';
  const combined = hexToBytes(first + second);
  const digest = sha256(combined);

  // Format digest into four 3-digit blocks (e.g. 842-194-039-771)
  const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const block1 = (view.getUint32(0, false) % 1000).toString().padStart(3, '0');
  const block2 = (view.getUint32(4, false) % 1000).toString().padStart(3, '0');
  const block3 = (view.getUint32(8, false) % 1000).toString().padStart(3, '0');
  const block4 = (view.getUint32(12, false) % 1000).toString().padStart(3, '0');

  return {
    safetyNumber: `${block1}-${block2}-${block3}-${block4}`,
    rawFingerprintHex: bytesToHex(digest),
  };
}

/**
 * Construct Associated Data (AD) for AEAD integrity binding
 */
function createAssociatedData(
  conversationId: string,
  seq: number,
  senderUsername: string,
  recipientUsername: string
): Uint8Array {
  const metadata = JSON.stringify({
    conversationId,
    seq,
    senderUsername,
    recipientUsername,
  });
  return utf8ToBytes(metadata);
}

/**
 * Establish Outbound Session (Initiator)
 * Computes Triple Diffie-Hellman master secret and derives forward-secure chain keys.
 */
export function initializeOutboundSession(
  ourPreKeyPrivateHex: string,
  ourIdentityPublicKeyHex: string,
  peerBundle: PublicKeyBundleHex,
  conversationId: string,
  peerUsername: string
): {
  session: SessionState;
  ephemeralPublicKeyHex: string;
} {
  // 1. Verify peer's pre-key signature
  const isValid = verifyPreKeySignature(
    peerBundle.identityPublicKey,
    peerBundle.signedPreKey,
    peerBundle.preKeySignature
  );
  if (!isValid) {
    throw new Error('INVALID_PREKEY_SIGNATURE: Peer pre-key signature failed cryptographic verification.');
  }

  // 2. Generate one-time ephemeral keypair for this handshake
  const ephemeralPrivate = crypto.getRandomValues(new Uint8Array(32));
  const ephemeralPublic = x25519.getPublicKey(ephemeralPrivate);

  const ourPreKeyPriv = hexToBytes(ourPreKeyPrivateHex);
  const peerPreKeyPub = hexToBytes(peerBundle.signedPreKey);

  // 3. Diffie-Hellman computations
  const dh1 = x25519.getSharedSecret(ourPreKeyPriv, peerPreKeyPub);
  const dh2 = x25519.getSharedSecret(ephemeralPrivate, peerPreKeyPub);

  // 4. Combine shared secrets and zeroize temporary buffers
  const combinedDh = new Uint8Array(dh1.length + dh2.length);
  combinedDh.set(dh1, 0);
  combinedDh.set(dh2, dh1.length);
  zeroize(dh1);
  zeroize(dh2);
  zeroize(ephemeralPrivate);

  // 5. Derive unidirectional chain keys
  const masterSecret = hkdf(
    sha256,
    combinedDh,
    PROTOCOL_SALT,
    utf8ToBytes(`textLove-MasterSecret-${conversationId}`),
    64
  );
  zeroize(combinedDh);

  const rootKey = masterSecret.slice(0, 32);
  // Independent chain keys for outbound & inbound
  const sendChainKey = hkdf(sha256, masterSecret, undefined, utf8ToBytes('AliceToSend'), 32);
  const recvChainKey = hkdf(sha256, masterSecret, undefined, utf8ToBytes('BobToSend'), 32);
  zeroize(masterSecret);

  const { safetyNumber } = calculateSafetyNumber(
    ourIdentityPublicKeyHex,
    peerBundle.identityPublicKey
  );

  const session: SessionState = {
    conversationId,
    peerUsername,
    peerIdentityPublicKey: peerBundle.identityPublicKey,
    peerSafetyNumber: safetyNumber,
    rootKey,
    sendChainKey,
    recvChainKey,
    sendSeq: 1,
    recvSeq: 0,
    seenRecvSeqs: new Set<number>(),
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };

  return {
    session,
    ephemeralPublicKeyHex: bytesToHex(ephemeralPublic),
  };
}

/**
 * Establish Inbound Session (Recipient)
 * Responding side completes the Diffie-Hellman handshake from sender's ephemeral key.
 */
export function initializeInboundSession(
  ourPreKeyPrivateHex: string,
  ourIdentityPublicKeyHex: string,
  peerIdentityPublicKeyHex: string,
  peerPreKeyPublicHex: string,
  peerEphemeralPublicKeyHex: string,
  conversationId: string,
  peerUsername: string
): SessionState {
  const ourPreKeyPriv = hexToBytes(ourPreKeyPrivateHex);
  const peerPreKeyPub = hexToBytes(peerPreKeyPublicHex);
  const peerEphemeralPub = hexToBytes(peerEphemeralPublicKeyHex);

  // Diffie-Hellman computations symmetric with initiator
  const dh1 = x25519.getSharedSecret(ourPreKeyPriv, peerPreKeyPub);
  const dh2 = x25519.getSharedSecret(ourPreKeyPriv, peerEphemeralPub);

  const combinedDh = new Uint8Array(dh1.length + dh2.length);
  combinedDh.set(dh1, 0);
  combinedDh.set(dh2, dh1.length);
  zeroize(dh1);
  zeroize(dh2);

  const masterSecret = hkdf(
    sha256,
    combinedDh,
    PROTOCOL_SALT,
    utf8ToBytes(`textLove-MasterSecret-${conversationId}`),
    64
  );
  zeroize(combinedDh);

  const rootKey = masterSecret.slice(0, 32);
  // Recipient's send chain is BobToSend, recv chain is AliceToSend
  const sendChainKey = hkdf(sha256, masterSecret, undefined, utf8ToBytes('BobToSend'), 32);
  const recvChainKey = hkdf(sha256, masterSecret, undefined, utf8ToBytes('AliceToSend'), 32);
  zeroize(masterSecret);

  const { safetyNumber } = calculateSafetyNumber(
    ourIdentityPublicKeyHex,
    peerIdentityPublicKeyHex
  );

  return {
    conversationId,
    peerUsername,
    peerIdentityPublicKey: peerIdentityPublicKeyHex,
    peerSafetyNumber: safetyNumber,
    rootKey,
    sendChainKey,
    recvChainKey,
    sendSeq: 1,
    recvSeq: 0,
    seenRecvSeqs: new Set<number>(),
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };
}

/**
 * Encrypt message using the symmetric ratchet and AES-256-GCM AEAD
 */
export async function encryptMessage(
  session: SessionState,
  plaintext: string,
  senderUsername: string,
  recipientUsername: string,
  ephemeralPublicKeyHex?: string
): Promise<EncryptedMessagePayload> {
  const seq = session.sendSeq;
  session.sendSeq += 1;

  // 1. Advance the symmetric ratchet to derive unique message key
  const messageKey = hkdf(sha256, session.sendChainKey, undefined, utf8ToBytes(`MK-${seq}`), 32);
  const nextChainKey = hkdf(sha256, session.sendChainKey, undefined, utf8ToBytes('ChainAdvance'), 32);
  session.sendChainKey = nextChainKey;

  // 2. Generate 12-byte random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ad = createAssociatedData(session.conversationId, seq, senderUsername, recipientUsername);

  // 3. Encrypt via SubtleCrypto AES-GCM
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    messageKey as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  zeroize(messageKey); // Zeroize raw key immediately after importing

  const plaintextBytes = utf8ToBytes(plaintext);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      additionalData: ad as unknown as BufferSource,
      tagLength: 128,
    },
    cryptoKey,
    plaintextBytes as unknown as BufferSource
  );

  session.lastActiveAt = Date.now();

  return {
    conversationId: session.conversationId,
    senderUsername,
    recipientUsername,
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
    iv: bytesToBase64(iv),
    seq,
    timestamp: Date.now(),
    senderEphemeralPublicKey: ephemeralPublicKeyHex,
  };
}

/**
 * Authenticate and decrypt message using AES-256-GCM AEAD with Replay Protection
 */
export async function decryptMessage(
  session: SessionState,
  payload: EncryptedMessagePayload
): Promise<string> {
  const { seq, ciphertext, iv, conversationId, senderUsername, recipientUsername } = payload;

  // 1. Replay and Ordering Protection
  if (session.seenRecvSeqs.has(seq)) {
    throw new Error(`REPLAY_DETECTED: Message sequence #${seq} has already been decrypted.`);
  }

  const prevRecvSeq = session.recvSeq;
  const prevRecvChainKey = new Uint8Array(session.recvChainKey);

  try {
    // 2. Advance symmetric ratchet to the target message sequence
    while (session.recvSeq < seq) {
      session.recvSeq += 1;
      const messageKey = hkdf(sha256, session.recvChainKey, undefined, utf8ToBytes(`MK-${session.recvSeq}`), 32);
      const nextChainKey = hkdf(sha256, session.recvChainKey, undefined, utf8ToBytes('ChainAdvance'), 32);
      session.recvChainKey = nextChainKey;

      if (session.recvSeq === seq) {
        // 3. Authenticate and decrypt AES-GCM
        const ivBytes = base64ToBytes(iv);
        const ciphertextBytes = base64ToBytes(ciphertext);
        const ad = createAssociatedData(conversationId, seq, senderUsername, recipientUsername);

        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          messageKey as unknown as BufferSource,
          { name: 'AES-GCM' },
          false,
          ['decrypt']
        );
        zeroize(messageKey);

        const decryptedBuffer = await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: ivBytes as unknown as BufferSource,
            additionalData: ad as unknown as BufferSource,
            tagLength: 128,
          },
          cryptoKey,
          ciphertextBytes as unknown as BufferSource
        );

        session.seenRecvSeqs.add(seq);
        session.lastActiveAt = Date.now();
        return bytesToUtf8(new Uint8Array(decryptedBuffer));
      } else {
        zeroize(messageKey);
      }
    }

    throw new Error(`INVALID_SEQUENCE: Cannot decrypt message sequence #${seq} with current recvSeq #${session.recvSeq}`);
  } catch (err: unknown) {
    session.recvSeq = prevRecvSeq;
    session.recvChainKey = prevRecvChainKey;
    if ((err as Error).message?.includes('REPLAY_DETECTED') || (err as Error).message?.includes('INVALID_SEQUENCE')) {
      throw err;
    }
    throw new Error('AUTHENTICATION_FAILED: Ciphertext authentication tag failed or payload was altered.');
  }
}
