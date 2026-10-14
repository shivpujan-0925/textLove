import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { UserRepository } from '../src/repositories/user.repository.js';
import { SessionRepository } from '../src/repositories/session.repository.js';
import { liveRelayService } from '../src/services/liveRelay.service.js';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateTestKeyBundle() {
  const idPriv = crypto.getRandomValues(new Uint8Array(32));
  const idPub = ed25519.getPublicKey(idPriv);

  const prePriv = crypto.getRandomValues(new Uint8Array(32));
  const prePub = x25519.getPublicKey(prePriv);

  const sig = ed25519.sign(prePub, idPriv);

  return {
    identityPublicKey: bytesToHex(idPub),
    signedPreKey: bytesToHex(prePub),
    preKeySignature: bytesToHex(sig),
  };
}

describe('E2EE Key Registration & Live-Only Message Relay', () => {
  const app = createApp();

  beforeEach(() => {
    UserRepository.clearInMemory();
    SessionRepository.clearInMemory();
    liveRelayService.clear();
  });

  async function registerAndLogin(displayName: string, email: string) {
    const urlRes = await request(app).get('/api/v1/auth/google/url');
    const stateCookie = urlRes.headers['set-cookie']!.find((c: string) => c.includes('textlove_oauth_state'))!;

    const cbRes = await request(app)
      .post('/api/v1/auth/google/callback')
      .set('Cookie', stateCookie)
      .send({
        idToken: `mock_google_token_:sub_${displayName}:${encodeURIComponent(email)}:${encodeURIComponent(displayName)}`,
        state: urlRes.body.state,
      });

    const sessionCookie = cbRes.headers['set-cookie']!.find((c: string) => c.includes('textlove_session'))!;

    return {
      user: cbRes.body.user,
      csrfToken: cbRes.body.csrfToken,
      sessionCookie,
    };
  }

  describe('Key Registration (POST /api/v1/keys/register)', () => {
    it('requires authentication and CSRF token', async () => {
      const bundle = generateTestKeyBundle();

      // 1. Unauthenticated
      const resUnauth = await request(app).post('/api/v1/keys/register').send(bundle);
      expect(resUnauth.status).toBe(401);

      // 2. Authenticated but missing CSRF
      const { sessionCookie } = await registerAndLogin('Alice Keys', 'alice.keys@test.org');
      const resNoCsrf = await request(app)
        .post('/api/v1/keys/register')
        .set('Cookie', sessionCookie)
        .send(bundle);
      expect(resNoCsrf.status).toBe(403);
    });

    it('successfully registers cryptographically verified public key bundle', async () => {
      const { sessionCookie, csrfToken, user } = await registerAndLogin('Bob Keys', 'bob.keys@test.org');
      const bundle = generateTestKeyBundle();

      const res = await request(app)
        .post('/api/v1/keys/register')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send(bundle);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.registeredAt).toBeDefined();

      // Verify bundle can be retrieved publicly
      const getRes = await request(app).get(`/api/v1/keys/${user.username}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.publicKeyBundle.identityPublicKey).toBe(bundle.identityPublicKey);
      expect(getRes.body.publicKeyBundle.signedPreKey).toBe(bundle.signedPreKey);
      expect(getRes.body.publicKeyBundle.preKeySignature).toBe(bundle.preKeySignature);
    });

    it('rejects registration if pre-key signature is forged or invalid', async () => {
      const { sessionCookie, csrfToken } = await registerAndLogin('Charlie Keys', 'charlie.keys@test.org');
      const bundle = generateTestKeyBundle();

      // Tamper signature
      const tamperedBundle = {
        ...bundle,
        preKeySignature: '00'.repeat(64),
      };

      const res = await request(app)
        .post('/api/v1/keys/register')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send(tamperedBundle);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PREKEY_SIGNATURE');
    });

    it('strictly prohibits private key material in request payloads', async () => {
      const { sessionCookie, csrfToken } = await registerAndLogin('Dave Keys', 'dave.keys@test.org');
      const bundle = generateTestKeyBundle();

      // Malicious or buggy payload attempting to transmit private key
      const leakyPayload = {
        ...bundle,
        identityPrivateKey: '11'.repeat(32),
      };

      const res = await request(app)
        .post('/api/v1/keys/register')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send(leakyPayload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PRIVATE_KEY_PROHIBITED');
    });
  });

  describe('Peer Key Retrieval (GET /api/v1/keys/:username)', () => {
    it('returns public bundle only and strictly no private keys, emails, or internal IDs', async () => {
      const { user, sessionCookie, csrfToken } = await registerAndLogin('Elena Keys', 'elena.keys@test.org');
      const bundle = generateTestKeyBundle();

      await request(app)
        .post('/api/v1/keys/register')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send(bundle);

      const res = await request(app).get(`/api/v1/keys/${user.username}`);
      expect(res.status).toBe(200);

      const data = res.body;
      expect(data.username).toBe(user.username);
      expect(data.publicKeyBundle).toBeDefined();

      // STRICT PRIVACY AUDIT
      expect(data.email).toBeUndefined();
      expect(data.googleId).toBeUndefined();
      expect(data.id).toBeUndefined();
      expect(data._id).toBeUndefined();
      expect(data.privateKey).toBeUndefined();
      expect(data.publicKeyBundle.privateKey).toBeUndefined();
    });

    it('returns 404 KEYS_NOT_REGISTERED when target user has no registered keys', async () => {
      const { user } = await registerAndLogin('Frank NoKeys', 'frank.nokeys@test.org');
      const res = await request(app).get(`/api/v1/keys/${user.username}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('KEYS_NOT_REGISTERED');
    });
  });

  describe('Live Message Relay (POST /api/v1/messages/relay)', () => {
    it('strictly rejects any plaintext message field (zero plaintext fallback)', async () => {
      const { sessionCookie, csrfToken } = await registerAndLogin('Alice Relay', 'alice.relay@test.org');
      const { user: bob } = await registerAndLogin('Bob Recipient', 'bob.recipient@test.org');

      // Attempting to send plaintext text
      const plaintextPayload = {
        conversationId: 'conv_123',
        recipientUsername: bob.username,
        text: 'This is unauthorized plaintext!',
        ciphertext: 'base64_ciphertext',
        iv: 'base64_iv',
        seq: 1,
      };

      const res = await request(app)
        .post('/api/v1/messages/relay')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send(plaintextPayload);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PLAINTEXT_PROHIBITED');
    });

    it('rejects delivery if recipient is offline (zero store-and-forward)', async () => {
      const { sessionCookie, csrfToken } = await registerAndLogin('Alice Relay 2', 'alice.relay2@test.org');
      const { user: offlineBob } = await registerAndLogin('Offline Bob', 'offline.bob@test.org');

      const relayPayload = {
        conversationId: 'conv_offline',
        recipientUsername: offlineBob.username,
        ciphertext: 'base64_valid_ciphertext',
        iv: 'base64_valid_iv',
        seq: 1,
      };

      const res = await request(app)
        .post('/api/v1/messages/relay')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send(relayPayload);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RECIPIENT_OFFLINE');
    });

    it('relays encrypted ciphertext to active connection and NEVER persists message to database', async () => {
      const { sessionCookie, csrfToken, user: alice } = await registerAndLogin(
        'Alice Live',
        'alice.live@test.org'
      );
      const { user: onlineBob } = await registerAndLogin('Bob Live', 'bob.live@test.org');

      // Bob establishes live active connection
      const receivedMessages: unknown[] = [];
      const unsubscribe = liveRelayService.subscribe(onlineBob.username, (msg) => {
        receivedMessages.push(msg);
      });

      const relayPayload = {
        conversationId: 'conv_live_pair',
        recipientUsername: onlineBob.username,
        ciphertext: 'U2FsdGVkX18...opaque_ciphertext',
        iv: 'YWJjZGVmMTIzNDU2',
        seq: 1,
        senderEphemeralPublicKey: 'aa'.repeat(32),
      };

      const res = await request(app)
        .post('/api/v1/messages/relay')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send(relayPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('RELAYED_TO_NETWORK');

      // Recipient received live ciphertext in memory
      expect(receivedMessages).toHaveLength(1);
      const msg = receivedMessages[0] as typeof relayPayload & { senderUsername: string };
      expect(msg.ciphertext).toBe(relayPayload.ciphertext);
      expect(msg.senderUsername).toBe(alice.username);

      // ZERO PERSISTENCE AUDIT:
      // Check MongoDB models to confirm no message model exists and no messages were saved
      const collections = mongoose.connection.collections;
      expect(collections['messages']).toBeUndefined();
      expect(collections['ephemeralmessages']).toBeUndefined();

      unsubscribe();
    });
  });
});
