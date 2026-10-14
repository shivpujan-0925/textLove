import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateIdentityKeyPair,
  generateSignedPreKey,
  verifyPreKeySignature,
  calculateSafetyNumber,
  initializeOutboundSession,
  initializeInboundSession,
  encryptMessage,
  decryptMessage,
} from '../src/crypto/engine';
import { KeyStore } from '../src/crypto/keyStore';
import { hexToBytes } from '../src/crypto/utils';

describe('textLove Cryptographic Engine (E2EE Foundation)', () => {
  beforeEach(() => {
    KeyStore.getInstance().reset();
  });

  it('generates valid Ed25519 identity key and verifiable signed X25519 prekey', () => {
    const idKey = generateIdentityKeyPair();
    expect(idKey.hex.publicKey).toHaveLength(64); // 32 bytes = 64 hex chars
    expect(idKey.hex.privateKey).toHaveLength(64);

    const preKey = generateSignedPreKey(idKey.bytes.privateKey);
    expect(preKey.hex.publicKey).toHaveLength(64);
    expect(preKey.signatureHex).toHaveLength(128); // 64 bytes = 128 hex chars

    // Verify valid signature
    const isValid = verifyPreKeySignature(
      idKey.hex.publicKey,
      preKey.hex.publicKey,
      preKey.signatureHex
    );
    expect(isValid).toBe(true);

    // Tampered prekey must fail verification
    const tamperedPreKeyHex = preKey.hex.publicKey.slice(0, -2) + (preKey.hex.publicKey.slice(-2) === 'aa' ? 'bb' : 'aa');
    const isTamperedValid = verifyPreKeySignature(
      idKey.hex.publicKey,
      tamperedPreKeyHex,
      preKey.signatureHex
    );
    expect(isTamperedValid).toBe(false);
  });

  it('computes identical, symmetric 12-digit Safety Numbers regardless of order', () => {
    const aliceId = generateIdentityKeyPair();
    const bobId = generateIdentityKeyPair();

    const snAlice = calculateSafetyNumber(aliceId.hex.publicKey, bobId.hex.publicKey);
    const snBob = calculateSafetyNumber(bobId.hex.publicKey, aliceId.hex.publicKey);

    expect(snAlice.safetyNumber).toMatch(/^\d{3}-\d{3}-\d{3}-\d{3}$/);
    expect(snAlice.safetyNumber).toBe(snBob.safetyNumber);
    expect(snAlice.rawFingerprintHex).toBe(snBob.rawFingerprintHex);
  });

  it('performs full X3DH handshake and successfully encrypts/decrypts live messages', async () => {
    // 1. Setup Alice and Bob identities
    const aliceId = generateIdentityKeyPair();
    const alicePreKey = generateSignedPreKey(aliceId.bytes.privateKey);

    const bobId = generateIdentityKeyPair();
    const bobPreKey = generateSignedPreKey(bobId.bytes.privateKey);

    const bobBundle = {
      identityPublicKey: bobId.hex.publicKey,
      signedPreKey: bobPreKey.hex.publicKey,
      preKeySignature: bobPreKey.signatureHex,
    };

    const conversationId = 'conv_alice_bob_123';

    // 2. Alice initializes outbound session
    const { session: aliceSession, ephemeralPublicKeyHex } = initializeOutboundSession(
      alicePreKey.hex.privateKey,
      aliceId.hex.publicKey,
      bobBundle,
      conversationId,
      'bob'
    );

    // 3. Bob initializes inbound session
    const bobSession = initializeInboundSession(
      bobPreKey.hex.privateKey,
      bobId.hex.publicKey,
      aliceId.hex.publicKey,
      alicePreKey.hex.publicKey,
      ephemeralPublicKeyHex,
      conversationId,
      'alice'
    );

    // Both derive identical Safety Numbers
    expect(aliceSession.peerSafetyNumber).toBe(bobSession.peerSafetyNumber);

    // 4. Alice encrypts a message
    const plaintext = 'Secret message from Alice to Bob: zero server retention!';
    const encryptedPayload = await encryptMessage(
      aliceSession,
      plaintext,
      'alice',
      'bob',
      ephemeralPublicKeyHex
    );

    expect(encryptedPayload.ciphertext).not.toContain(plaintext);
    expect(encryptedPayload.seq).toBe(1);

    // 5. Bob decrypts the message
    const decrypted = await decryptMessage(bobSession, encryptedPayload);
    expect(decrypted).toBe(plaintext);
  });

  it('rejects decryption when an unrelated user attempts to decrypt the ciphertext', async () => {
    const aliceId = generateIdentityKeyPair();
    const alicePreKey = generateSignedPreKey(aliceId.bytes.privateKey);

    const bobId = generateIdentityKeyPair();
    const bobPreKey = generateSignedPreKey(bobId.bytes.privateKey);

    const eveId = generateIdentityKeyPair();
    const evePreKey = generateSignedPreKey(eveId.bytes.privateKey);

    const bobBundle = {
      identityPublicKey: bobId.hex.publicKey,
      signedPreKey: bobPreKey.hex.publicKey,
      preKeySignature: bobPreKey.signatureHex,
    };

    const conversationId = 'conv_confidential';
    const { session: aliceSession, ephemeralPublicKeyHex } = initializeOutboundSession(
      alicePreKey.hex.privateKey,
      aliceId.hex.publicKey,
      bobBundle,
      conversationId,
      'bob'
    );

    // Eve intercepts the ephemeral public key and tries to establish session
    const eveSession = initializeInboundSession(
      evePreKey.hex.privateKey,
      eveId.hex.publicKey,
      aliceId.hex.publicKey,
      alicePreKey.hex.publicKey,
      ephemeralPublicKeyHex,
      conversationId,
      'alice'
    );

    const payload = await encryptMessage(aliceSession, 'Classified contents', 'alice', 'bob');

    // Eve attempting to decrypt must fail AES-GCM authentication
    await expect(decryptMessage(eveSession, payload)).rejects.toThrow(
      /AUTHENTICATION_FAILED/i
    );
  });

  it('fails authentication if ciphertext or associated data has been tampered with', async () => {
    const aliceId = generateIdentityKeyPair();
    const alicePreKey = generateSignedPreKey(aliceId.bytes.privateKey);

    const bobId = generateIdentityKeyPair();
    const bobPreKey = generateSignedPreKey(bobId.bytes.privateKey);

    const conversationId = 'conv_tamper_test';
    const { session: aliceSession, ephemeralPublicKeyHex } = initializeOutboundSession(
      alicePreKey.hex.privateKey,
      aliceId.hex.publicKey,
      {
        identityPublicKey: bobId.hex.publicKey,
        signedPreKey: bobPreKey.hex.publicKey,
        preKeySignature: bobPreKey.signatureHex,
      },
      conversationId,
      'bob'
    );

    const bobSession = initializeInboundSession(
      bobPreKey.hex.privateKey,
      bobId.hex.publicKey,
      aliceId.hex.publicKey,
      alicePreKey.hex.publicKey,
      ephemeralPublicKeyHex,
      conversationId,
      'alice'
    );

    const payload = await encryptMessage(aliceSession, 'Original message', 'alice', 'bob');

    // 1. Tamper with ciphertext bytes
    const tamperedCiphertext = Buffer.from(payload.ciphertext, 'base64');
    tamperedCiphertext[0] ^= 0xff; // Flip bits
    const tamperedPayload = {
      ...payload,
      ciphertext: tamperedCiphertext.toString('base64'),
    };

    await expect(decryptMessage(bobSession, tamperedPayload)).rejects.toThrow(
      /AUTHENTICATION_FAILED/i
    );

    // 2. Tamper with metadata (Associated Data tampering)
    const metadataTamperedPayload = {
      ...payload,
      recipientUsername: 'eve', // Tamper recipient
    };

    await expect(decryptMessage(bobSession, metadataTamperedPayload)).rejects.toThrow(
      /AUTHENTICATION_FAILED/i
    );
  });

  it('prevents replay attacks by rejecting duplicate sequence numbers', async () => {
    const aliceId = generateIdentityKeyPair();
    const alicePreKey = generateSignedPreKey(aliceId.bytes.privateKey);

    const bobId = generateIdentityKeyPair();
    const bobPreKey = generateSignedPreKey(bobId.bytes.privateKey);

    const conversationId = 'conv_replay_test';
    const { session: aliceSession, ephemeralPublicKeyHex } = initializeOutboundSession(
      alicePreKey.hex.privateKey,
      aliceId.hex.publicKey,
      {
        identityPublicKey: bobId.hex.publicKey,
        signedPreKey: bobPreKey.hex.publicKey,
        preKeySignature: bobPreKey.signatureHex,
      },
      conversationId,
      'bob'
    );

    const bobSession = initializeInboundSession(
      bobPreKey.hex.privateKey,
      bobId.hex.publicKey,
      aliceId.hex.publicKey,
      alicePreKey.hex.publicKey,
      ephemeralPublicKeyHex,
      conversationId,
      'alice'
    );

    const payload = await encryptMessage(aliceSession, 'First delivery', 'alice', 'bob');

    // First decryption succeeds
    const firstDecrypted = await decryptMessage(bobSession, payload);
    expect(firstDecrypted).toBe('First delivery');

    // Replay attack with identical payload must be rejected
    await expect(decryptMessage(bobSession, payload)).rejects.toThrow(
      /REPLAY_DETECTED/i
    );
  });

  it('detects peer key changes and flags a security warning', () => {
    const keyStore = KeyStore.getInstance();
    keyStore.ensureKeys();

    const bobId1 = generateIdentityKeyPair();
    const bobPreKey1 = generateSignedPreKey(bobId1.bytes.privateKey);

    // Initial session with Bob's first key
    const firstRes = keyStore.getOrCreateOutboundSession('conv_key_change', 'bob', {
      identityPublicKey: bobId1.hex.publicKey,
      signedPreKey: bobPreKey1.hex.publicKey,
      preKeySignature: bobPreKey1.signatureHex,
    });
    expect(firstRes.keyChangedWarning).toBe(false);

    // Bob re-registers or attacker substitutes Bob's key
    const bobId2 = generateIdentityKeyPair();
    const bobPreKey2 = generateSignedPreKey(bobId2.bytes.privateKey);

    const secondRes = keyStore.getOrCreateOutboundSession('conv_key_change_2', 'bob', {
      identityPublicKey: bobId2.hex.publicKey,
      signedPreKey: bobPreKey2.hex.publicKey,
      preKeySignature: bobPreKey2.signatureHex,
    });

    expect(secondRes.keyChangedWarning).toBe(true);
    expect(secondRes.session.keyChangedWarning).toBe(true);
  });

  it('fails safely when pre-key signature is invalid', () => {
    const aliceId = generateIdentityKeyPair();
    const alicePreKey = generateSignedPreKey(aliceId.bytes.privateKey);

    const fakeBobId = generateIdentityKeyPair();
    const fakeBobPreKey = generateSignedPreKey(fakeBobId.bytes.privateKey);

    // Tamper signature
    const corruptSignature = '00'.repeat(64);

    expect(() => {
      initializeOutboundSession(
        alicePreKey.hex.privateKey,
        aliceId.hex.publicKey,
        {
          identityPublicKey: fakeBobId.hex.publicKey,
          signedPreKey: fakeBobPreKey.hex.publicKey,
          preKeySignature: corruptSignature,
        },
        'conv_fake',
        'bob'
      );
    }).toThrow(/INVALID_PREKEY_SIGNATURE/i);
  });
});
