import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createServer } from 'http';
import { initSocketServer } from '../src/socket/index.js';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { UserRepository } from '../src/repositories/user.repository.js';
import { SessionRepository } from '../src/repositories/session.repository.js';
import { ConversationRepository } from '../src/repositories/conversation.repository.js';

describe('Phase 8: Security Audit & Hardening Verification', () => {
  let app: ReturnType<typeof createApp>;
  let httpServer: ReturnType<typeof createServer>;
  let ioServer: ReturnType<typeof initSocketServer>;
  let port: number;

  beforeEach(async () => {
    UserRepository.clearInMemory();
    SessionRepository.clearInMemory();
    ConversationRepository.clearInMemory();

    app = createApp();
    httpServer = createServer(app);
    ioServer = initSocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      ioServer.close(() => {
        httpServer.close(() => resolve());
      });
    });
  });

  it('CSRF protection rejects forged, empty, and truncated tokens with constant-time equality check', async () => {
    const user = await UserRepository.create({
      googleId: 'csrf_test_google_1',
      email: 'csrf@test.com',
      username: 'csrf_user',
      displayName: 'CSRF Tester',
    });

    const { rawToken, csrfToken } = await SessionRepository.createSession(user._id.toString());
    const cookie = `textlove_session=${rawToken}`;

    // 1. Missing CSRF token -> 403
    const resNoToken = await request(app)
      .patch('/api/v1/users/profile')
      .set('Cookie', [cookie])
      .send({ displayName: 'New Name' });
    expect(resNoToken.status).toBe(403);
    expect(resNoToken.body.error.code).toBe('INVALID_CSRF_TOKEN');

    // 2. Truncated CSRF token -> 403
    const resTruncated = await request(app)
      .patch('/api/v1/users/profile')
      .set('Cookie', [cookie])
      .set('X-CSRF-Token', csrfToken.slice(0, 10))
      .send({ displayName: 'New Name' });
    expect(resTruncated.status).toBe(403);

    // 3. Forged CSRF token with matching length -> 403
    const resForged = await request(app)
      .patch('/api/v1/users/profile')
      .set('Cookie', [cookie])
      .set('X-CSRF-Token', 'x'.repeat(csrfToken.length))
      .send({ displayName: 'New Name' });
    expect(resForged.status).toBe(403);

    // 4. Legitimate matching CSRF token -> 200
    const resValid = await request(app)
      .patch('/api/v1/users/profile')
      .set('Cookie', [cookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ displayName: 'Authorized Name' });
    expect(resValid.status).toBe(200);
  });

  it('WebSocket drops forged msg:ack and conv:typing events from non-participants', async () => {
    // Create users Alice, Bob, and Eve
    const alice = await UserRepository.create({
      googleId: 'g_alice',
      email: 'alice@test.com',
      username: 'alice_sec',
      displayName: 'Alice',
    });
    const bob = await UserRepository.create({
      googleId: 'g_bob',
      email: 'bob@test.com',
      username: 'bob_sec',
      displayName: 'Bob',
    });
    const eve = await UserRepository.create({
      googleId: 'g_eve',
      email: 'eve@test.com',
      username: 'eve_attacker',
      displayName: 'Eve Attacker',
    });

    const sessionEve = await SessionRepository.createSession(eve._id.toString());
    const sessionAlice = await SessionRepository.createSession(alice._id.toString());

    // Create legitimate conversation between Alice and Bob
    const conv = await ConversationRepository.getOrCreate(
      { id: alice._id.toString(), username: alice.username },
      { id: bob._id.toString(), username: bob.username },
      'alice_sec_bob_sec_conv'
    );

    // Connect Eve
    const socketEve: ClientSocket = Client(`http://localhost:${port}`, {
      extraHeaders: {
        cookie: `textlove_session=${sessionEve.rawToken}`,
      },
      transports: ['websocket'],
    });

    // Connect Alice
    const socketAlice: ClientSocket = Client(`http://localhost:${port}`, {
      extraHeaders: {
        cookie: `textlove_session=${sessionAlice.rawToken}`,
      },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((r) => socketEve.on('connect', () => r())),
      new Promise<void>((r) => socketAlice.on('connect', () => r())),
    ]);

    let aliceReceivedPeerAck = false;
    socketAlice.on('msg:peer_ack', () => {
      aliceReceivedPeerAck = true;
    });

    let aliceReceivedTyping = false;
    socketAlice.on('conv:typing', () => {
      aliceReceivedTyping = true;
    });

    // Eve attempts to forge msg:ack for Alice and Bob's conversation
    socketEve.emit('msg:ack', {
      conversationId: conv.canonicalId,
      seq: 1,
      senderUsername: 'alice_sec',
      status: 'DECRYPTED_BY_PEER',
    });

    // Eve attempts to forge conv:typing for Alice and Bob's conversation
    socketEve.emit('conv:typing', {
      conversationId: conv.canonicalId,
      recipientUsername: 'alice_sec',
      isTyping: true,
    });

    // Wait 300ms to verify no forged events leaked to Alice
    await new Promise((r) => setTimeout(r, 300));

    expect(aliceReceivedPeerAck).toBe(false);
    expect(aliceReceivedTyping).toBe(false);

    socketEve.disconnect();
    socketAlice.disconnect();
  });

  it('WebSocket enforces sliding window rate limits on excessive message bursts', async () => {
    const user = await UserRepository.create({
      googleId: 'rate_user_g',
      email: 'rate@test.com',
      username: 'rate_user',
      displayName: 'Rate Tester',
    });

    const session = await SessionRepository.createSession(user._id.toString());

    const client: ClientSocket = Client(`http://localhost:${port}`, {
      extraHeaders: {
        cookie: `textlove_session=${session.rawToken}`,
      },
      transports: ['websocket'],
    });

    await new Promise<void>((r) => client.on('connect', () => r()));

    let rateLimitHit = false;
    const rateLimitPromise = new Promise<void>((resolve) => {
      client.on('msg:error', (err: { code: string }) => {
        if (err.code === 'RATE_LIMIT_EXCEEDED') {
          rateLimitHit = true;
          resolve();
        }
      });
    });

    // Emit 45 messages rapidly
    for (let i = 0; i < 45; i++) {
      client.emit('msg:send', {
        conversationId: 'some_conv',
        recipientUsername: 'offline_peer',
        ciphertext: 'AAAA',
        iv: 'BBBB',
        seq: i + 1,
      });
    }

    await Promise.race([
      rateLimitPromise,
      new Promise((r) => setTimeout(r, 2000)),
    ]);
    expect(rateLimitHit).toBe(true);

    client.disconnect();
  });
});
