import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import request from 'supertest';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { initSocketServer } from '../src/socket/index.js';
import { connectionRegistry } from '../src/socket/connectionRegistry.js';
import { UserRepository } from '../src/repositories/user.repository.js';
import { SessionRepository } from '../src/repositories/session.repository.js';
import { ConversationRepository } from '../src/repositories/conversation.repository.js';
import { ConversationExpiryService } from '../src/services/conversationExpiry.service.js';
import { CloudinaryService } from '../src/services/cloudinary.service.js';

describe('Phase 6: Secure Conversation Expiry & Deletion Workflows', () => {
  let server: http.Server;
  let serverPort: number;
  let ioServer: any;
  let app: any;

  beforeEach(async () => {
    UserRepository.clearInMemory();
    SessionRepository.clearInMemory();
    ConversationRepository.clearInMemory();
    connectionRegistry.clear();
    ConversationExpiryService.stopSweeper();

    app = createApp();
    server = http.createServer(app);
    ioServer = initSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr) {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    ConversationExpiryService.stopSweeper();
    connectionRegistry.clear();
    if (ioServer) {
      await new Promise<void>((resolve) => {
        ioServer.close(() => resolve());
      });
    }
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  async function createTestUserAndSession(username: string, displayName: string) {
    const user = await UserRepository.create({
      googleId: `google_${username}`,
      email: `${username}@example.com`,
      displayName,
      username,
      status: 'active',
    });

    const { rawToken } = await SessionRepository.createSession(
      user._id.toString(),
      '127.0.0.1',
      'test-agent'
    );

    const sessionRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [`textlove_session=${rawToken}`]);

    const csrfToken = sessionRes.body.csrfToken;

    return { user, sessionToken: rawToken, csrfToken, cookie: `textlove_session=${rawToken}` };
  }

  function createClientSocket(sessionToken?: string): ClientSocket {
    return Client(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      autoConnect: false,
      extraHeaders: sessionToken
        ? { cookie: `textlove_session=${sessionToken}` }
        : undefined,
    });
  }

  // ===========================================================================
  // A. Thirty-Minute Inactivity Expiration
  // ===========================================================================
  describe('A. 30-Minute Inactivity Expiration & Authoritative Timers', () => {
    it('initializes conversation with authoritative 30m expiry and validates active state', async () => {
      const { user: userA } = await createTestUserAndSession('alice', 'Alice Smith');
      const { user: userB } = await createTestUserAndSession('bob', 'Bob Jones');

      const startTime = new Date('2026-10-14T10:00:00Z');
      const canonicalId = 'alice:bob';

      const conv = await ConversationRepository.getOrCreate(
        { id: userA._id, username: userA.username },
        { id: userB._id, username: userB.username },
        canonicalId,
        startTime
      );

      expect(conv.status).toBe('active');
      expect(conv.expiresAt.getTime()).toBe(startTime.getTime() + 30 * 60 * 1000);

      // Validation at T + 10m is valid
      const validation10m = await ConversationExpiryService.validateAndGet(
        canonicalId,
        'alice',
        'bob',
        new Date('2026-10-14T10:10:00Z')
      );
      expect(validation10m.valid).toBe(true);
    });

    it('rejects operations after 30 minutes and transitions conversation to expired', async () => {
      const { user: userA } = await createTestUserAndSession('alice', 'Alice Smith');
      const { user: userB } = await createTestUserAndSession('bob', 'Bob Jones');

      const startTime = new Date('2026-10-14T10:00:00Z');
      const canonicalId = 'alice:bob';

      await ConversationRepository.getOrCreate(
        { id: userA._id, username: userA.username },
        { id: userB._id, username: userB.username },
        canonicalId,
        startTime
      );

      // Advance clock past 30 minutes: T + 31 minutes
      const expiredTime = new Date('2026-10-14T10:31:00Z');
      const validation = await ConversationExpiryService.validateAndGet(
        canonicalId,
        'alice',
        'bob',
        expiredTime
      );

      expect(validation.valid).toBe(false);
      expect(validation.code).toBe('CONVERSATION_EXPIRED');

      const record = await ConversationRepository.findByCanonicalId(canonicalId);
      expect(record?.status).toBe('expired');
    });

    it('qualifying message activity resets authoritative timer by 30 minutes from message timestamp', async () => {
      const { user: userA } = await createTestUserAndSession('alice', 'Alice Smith');
      const { user: userB } = await createTestUserAndSession('bob', 'Bob Jones');

      const startTime = new Date('2026-10-14T10:00:00Z');
      const canonicalId = 'alice:bob';

      await ConversationRepository.getOrCreate(
        { id: userA._id, username: userA.username },
        { id: userB._id, username: userB.username },
        canonicalId,
        startTime
      );

      // User sends deliberate message at T + 20 minutes
      const msgTime = new Date('2026-10-14T10:20:00Z');
      const updated = await ConversationExpiryService.recordQualifiedActivity(canonicalId, msgTime);

      expect(updated).not.toBeNull();
      expect(updated?.lastActivityAt.getTime()).toBe(msgTime.getTime());
      // Authoritative expiration extended to T + 50 minutes (20m + 30m)
      expect(updated?.expiresAt.getTime()).toBe(msgTime.getTime() + 30 * 60 * 1000);

      // Validation at T + 35 minutes is valid because timer was reset
      const valAt35m = await ConversationExpiryService.validateAndGet(
        canonicalId,
        'alice',
        'bob',
        new Date('2026-10-14T10:35:00Z')
      );
      expect(valAt35m.valid).toBe(true);
    });

    it('proactive sweeper identifies expired conversations and notifies participants', async () => {
      const { user: userA } = await createTestUserAndSession('alice', 'Alice Smith');
      const { user: userB } = await createTestUserAndSession('bob', 'Bob Jones');

      const startTime = new Date('2026-10-14T10:00:00Z');
      const canonicalId = 'alice:bob';

      await ConversationRepository.getOrCreate(
        { id: userA._id, username: userA.username },
        { id: userB._id, username: userB.username },
        canonicalId,
        startTime
      );

      // Sweeper run at T + 15m finds 0 expired
      const swept15m = await ConversationExpiryService.sweepExpiredConversations(
        new Date('2026-10-14T10:15:00Z')
      );
      expect(swept15m).toBe(0);

      // Sweeper run at T + 31m finds and expires 1 conversation
      const swept31m = await ConversationExpiryService.sweepExpiredConversations(
        new Date('2026-10-14T10:31:00Z')
      );
      expect(swept31m).toBe(1);

      const record = await ConversationRepository.findByCanonicalId(canonicalId);
      expect(record?.status).toBe('expired');
    });
  });

  // ===========================================================================
  // B. Offline Users, Reconnection, and Stale Events
  // ===========================================================================
  describe('B. Offline Users, Reconnection & Stale Events', () => {
    it('expires conversation even if both participants are offline', async () => {
      const { user: userA } = await createTestUserAndSession('alice', 'Alice Smith');
      const { user: userB } = await createTestUserAndSession('bob', 'Bob Jones');

      const startTime = new Date('2026-10-14T10:00:00Z');
      const canonicalId = 'alice:bob';

      await ConversationRepository.getOrCreate(
        { id: userA._id, username: userA.username },
        { id: userB._id, username: userB.username },
        canonicalId,
        startTime
      );

      // Both users are offline (no registered sockets)
      expect(connectionRegistry.isUserOnline('alice')).toBe(false);
      expect(connectionRegistry.isUserOnline('bob')).toBe(false);

      // Sweeper runs at T + 35m
      const swept = await ConversationExpiryService.sweepExpiredConversations(
        new Date('2026-10-14T10:35:00Z')
      );
      expect(swept).toBe(1);

      const record = await ConversationRepository.findByCanonicalId(canonicalId);
      expect(record?.status).toBe('expired');
    });

    it('reconnecting clients honor expired status via REST status endpoint', async () => {
      const { user: userA, cookie, csrfToken } = await createTestUserAndSession('alice', 'Alice Smith');
      const { user: userB } = await createTestUserAndSession('bob', 'Bob Jones');

      const startTime = new Date('2026-10-14T10:00:00Z');
      const canonicalId = 'alice:bob';

      await ConversationRepository.getOrCreate(
        { id: userA._id, username: userA.username },
        { id: userB._id, username: userB.username },
        canonicalId,
        startTime
      );

      // Mark expired
      await ConversationRepository.expire(canonicalId);

      // Reconnecting client queries status
      const res = await request(app)
        .get(`/api/v1/conversations/${canonicalId}/status`)
        .set('Cookie', [cookie])
        .set('X-CSRF-Token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.conversation.status).toBe('expired');
      expect(res.body.conversation.remainingSeconds).toBe(0);
    });

    it('rejects stale WebSocket messages attempted after expiration and emits conv:expired', async () => {
      const { sessionToken: tokenA } = await createTestUserAndSession('alice', 'Alice Smith');
      const { sessionToken: tokenB } = await createTestUserAndSession('bob', 'Bob Jones');

      const clientA = createClientSocket(tokenA);
      const clientB = createClientSocket(tokenB);

      clientA.connect();
      clientB.connect();

      await new Promise<void>((resolve) => {
        let count = 0;
        const done = () => {
          count++;
          if (count === 2) resolve();
        };
        clientA.on('connect', done);
        clientB.on('connect', done);
      });

      const canonicalId = 'alice:bob';
      const userA = await UserRepository.findByUsername('alice');
      const userB = await UserRepository.findByUsername('bob');

      // Create conversation already expired
      const pastTime = new Date(Date.now() - 35 * 60 * 1000);
      await ConversationRepository.getOrCreate(
        { id: userA!._id, username: 'alice' },
        { id: userB!._id, username: 'bob' },
        canonicalId,
        pastTime
      );

      // Alice tries to send stale message
      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        clientA.on('msg:error', (data) => resolve(data));
      });

      const expiredPromise = new Promise<{ conversationId: string; reason: string }>((resolve) => {
        clientA.on('conv:expired', (data) => resolve(data));
      });

      clientA.emit('msg:send', {
        conversationId: canonicalId,
        recipientUsername: 'bob',
        ciphertext: 'base64ciphertext',
        iv: 'base64iv',
        seq: 1,
        timestamp: Date.now(),
      });

      const [errData, expData] = await Promise.all([errorPromise, expiredPromise]);

      expect(errData.code).toBe('CONVERSATION_EXPIRED');
      expect(expData.conversationId).toBe(canonicalId);

      clientA.disconnect();
      clientB.disconnect();
    });
  });

  // ===========================================================================
  // C. Delete Conversation for Both Participants
  // ===========================================================================
  describe('C. Delete-for-Both Participants & Idempotency', () => {
    it('terminates conversation, notifies both participants via Socket, and invalidates active state', async () => {
      const { sessionToken: tokenA } = await createTestUserAndSession('alice', 'Alice Smith');
      const { sessionToken: tokenB } = await createTestUserAndSession('bob', 'Bob Jones');

      const clientA = createClientSocket(tokenA);
      const clientB = createClientSocket(tokenB);

      clientA.connect();
      clientB.connect();

      await new Promise<void>((resolve) => {
        let count = 0;
        const done = () => {
          count++;
          if (count === 2) resolve();
        };
        clientA.on('connect', done);
        clientB.on('connect', done);
      });

      const userA = await UserRepository.findByUsername('alice');
      const userB = await UserRepository.findByUsername('bob');
      const canonicalId = 'alice:bob';

      await ConversationRepository.getOrCreate(
        { id: userA!._id, username: 'alice' },
        { id: userB!._id, username: 'bob' },
        canonicalId
      );

      // Set up termination listeners on both clients
      const termPromiseA = new Promise<{ conversationId: string; terminatedBy: string }>((resolve) => {
        clientA.on('conv:terminated', resolve);
      });
      const termPromiseB = new Promise<{ conversationId: string; terminatedBy: string }>((resolve) => {
        clientB.on('conv:terminated', resolve);
      });

      // Alice triggers terminate over websocket
      clientA.emit('conv:terminate', { conversationId: canonicalId });

      const [resA, resB] = await Promise.all([termPromiseA, termPromiseB]);

      expect(resA.conversationId).toBe(canonicalId);
      expect(resA.terminatedBy).toBe('alice');
      expect(resB.conversationId).toBe(canonicalId);
      expect(resB.terminatedBy).toBe('alice');

      // Authoritative state is now closed
      const record = await ConversationRepository.findByCanonicalId(canonicalId);
      expect(record?.status).toBe('closed');
      expect(record?.closedBy).toBe('alice');

      // Subsequent validation rejects revival
      const val = await ConversationExpiryService.validateAndGet(canonicalId, 'bob', 'alice');
      expect(val.valid).toBe(false);
      expect(val.code).toBe('CONVERSATION_CLOSED');

      clientA.disconnect();
      clientB.disconnect();
    });

    it('simultaneous deletion requests from both participants resolve cleanly and idempotently', async () => {
      const { user: userA } = await createTestUserAndSession('alice', 'Alice Smith');
      const { user: userB } = await createTestUserAndSession('bob', 'Bob Jones');

      const canonicalId = 'alice:bob';
      await ConversationRepository.getOrCreate(
        { id: userA._id, username: 'alice' },
        { id: userB._id, username: 'bob' },
        canonicalId
      );

      // Both users execute deleteForBoth concurrently
      const [res1, res2] = await Promise.all([
        ConversationExpiryService.deleteForBoth(canonicalId, 'alice'),
        ConversationExpiryService.deleteForBoth(canonicalId, 'bob'),
      ]);

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);

      const record = await ConversationRepository.findByCanonicalId(canonicalId);
      expect(record?.status).toBe('closed');
    });

    it('repeated deletion operations are idempotent and succeed without error', async () => {
      const { user: userA } = await createTestUserAndSession('alice', 'Alice Smith');
      const { user: userB } = await createTestUserAndSession('bob', 'Bob Jones');

      const canonicalId = 'alice:bob';
      await ConversationRepository.getOrCreate(
        { id: userA._id, username: 'alice' },
        { id: userB._id, username: 'bob' },
        canonicalId
      );

      // First deletion
      const first = await ConversationExpiryService.deleteForBoth(canonicalId, 'alice');
      expect(first.success).toBe(true);

      // Repeated deletion
      const second = await ConversationExpiryService.deleteForBoth(canonicalId, 'alice');
      expect(second.success).toBe(true);

      // Third deletion on nonexistent / already purged
      const third = await ConversationExpiryService.deleteForBoth('nonexistent:id', 'alice');
      expect(third.success).toBe(true);
    });

    it('rejects unauthorized deletion attempts by third parties (403)', async () => {
      const { user: userA } = await createTestUserAndSession('alice', 'Alice Smith');
      const { user: userB } = await createTestUserAndSession('bob', 'Bob Jones');
      const { cookie: eveCookie, csrfToken: eveCsrf } = await createTestUserAndSession('eve', 'Eve Hacker');

      const canonicalId = 'alice:bob';
      await ConversationRepository.getOrCreate(
        { id: userA._id, username: 'alice' },
        { id: userB._id, username: 'bob' },
        canonicalId
      );

      // Eve attempts to delete conversation between Alice and Bob
      const res = await request(app)
        .delete(`/api/v1/conversations/${canonicalId}`)
        .set('Cookie', [eveCookie])
        .set('X-CSRF-Token', eveCsrf);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNAUTHORIZED_PARTICIPANT');
    });
  });

  // ===========================================================================
  // D. Account Deletion Cascade & Session Revocation
  // ===========================================================================
  describe('D. Permanent Account Deletion Cascade', () => {
    it('deactivates user, revokes all sessions, disconnects sockets, and terminates active conversations', async () => {
      const { user: userA, cookie: cookieA, csrfToken: csrfA, sessionToken: tokenA } =
        await createTestUserAndSession('alice', 'Alice Smith');
      const { user: userB, cookie: cookieB } =
        await createTestUserAndSession('bob', 'Bob Jones');

      // Alice connects via Socket
      const clientA = createClientSocket(tokenA);
      clientA.connect();
      await new Promise<void>((resolve) => clientA.on('connect', resolve));

      expect(connectionRegistry.isUserOnline('alice')).toBe(true);

      // Active conversation exists between Alice and Bob
      const canonicalId = 'alice:bob';
      await ConversationRepository.getOrCreate(
        { id: userA._id, username: 'alice' },
        { id: userB._id, username: 'bob' },
        canonicalId
      );

      // Alice deletes her account with confirmation 'DELETE'
      const delRes = await request(app)
        .delete('/api/v1/users/me')
        .set('Cookie', [cookieA])
        .set('X-CSRF-Token', csrfA)
        .send({ confirmation: 'DELETE' });

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);
      expect(delRes.body.disclosure).toBeDefined();

      // 1. Session is revoked
      const authRes = await request(app).get('/api/v1/auth/me').set('Cookie', [cookieA]);
      expect(authRes.status).toBe(401);

      // 2. User status is deleted
      const deletedUser = await UserRepository.findById(userA._id.toString());
      expect(deletedUser?.status).toBe('deleted');

      // 3. User socket connection unregistered
      expect(connectionRegistry.isUserOnline('alice')).toBe(false);

      // 4. Conversation is closed
      const convRecord = await ConversationRepository.findByCanonicalId(canonicalId);
      expect(convRecord?.status).toBe('closed');

      clientA.disconnect();
    });

    it('rejects account deletion if invalid confirmation string is provided', async () => {
      const { cookie, csrfToken } = await createTestUserAndSession('alice', 'Alice Smith');

      const res = await request(app)
        .delete('/api/v1/users/me')
        .set('Cookie', [cookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ confirmation: 'WRONG' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CONFIRMATION_REQUIRED');
    });

    it('handles Cloudinary cleanup failure gracefully without aborting account deletion', async () => {
      const { user, cookie, csrfToken } = await createTestUserAndSession('alice', 'Alice Smith');

      // Set avatar public ID on user
      await UserRepository.updateProfile(user._id.toString(), {
        avatarPublicId: 'avatars/alice_test_public_id',
      });

      // Mock Cloudinary delete to reject with a network error
      const deleteSpy = vi
        .spyOn(CloudinaryService, 'deleteAvatar')
        .mockRejectedValueOnce(new Error('Cloudinary 503 Service Unavailable'));

      const delRes = await request(app)
        .delete('/api/v1/users/me')
        .set('Cookie', [cookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ confirmation: 'DELETE' });

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify user was still successfully deleted despite Cloudinary failure
      const postUser = await UserRepository.findById(user._id.toString());
      expect(postUser?.status).toBe('deleted');

      deleteSpy.mockRestore();
    });
  });

  // ===========================================================================
  // E. Realistic Expiration Integration Test
  // ===========================================================================
  describe('E. Realistic Expiration Integration Test', () => {
    it('executes realistic lifecycle: active -> inactivity timeout -> sweeper sweep -> real-time socket notification', async () => {
      const { sessionToken: tokenA } = await createTestUserAndSession('alice', 'Alice Smith');
      const { sessionToken: tokenB } = await createTestUserAndSession('bob', 'Bob Jones');

      const clientA = createClientSocket(tokenA);
      const clientB = createClientSocket(tokenB);

      clientA.connect();
      clientB.connect();

      await new Promise<void>((resolve) => {
        let count = 0;
        const done = () => {
          count++;
          if (count === 2) resolve();
        };
        clientA.on('connect', done);
        clientB.on('connect', done);
      });

      const userA = await UserRepository.findByUsername('alice');
      const userB = await UserRepository.findByUsername('bob');
      const canonicalId = 'alice:bob';

      // Initialize conversation that authoritatively expires in 50ms for realistic test
      const t0 = new Date(Date.now() - 30 * 60 * 1000 + 50); // 50ms remaining
      const conv = await ConversationRepository.getOrCreate(
        { id: userA!._id, username: 'alice' },
        { id: userB!._id, username: 'bob' },
        canonicalId,
        t0
      );

      expect(conv.status).toBe('active');

      // Set up listener for real-time conv:expired emission on client A
      const expiredPromise = new Promise<{ conversationId: string; reason: string }>((resolve) => {
        clientA.on('conv:expired', resolve);
      });

      // Wait 60ms so the 50ms realistic window passes
      await new Promise((r) => setTimeout(r, 60));

      // Trigger sweeper with the live server's io instance
      await ConversationExpiryService.sweepExpiredConversations(new Date(), ioServer);

      const expEvent = await expiredPromise;
      expect(expEvent.conversationId).toBe(canonicalId);
      expect(expEvent.reason).toBe('30_MIN_INACTIVITY');

      // Verify conversation record in repository is now expired
      const updatedConv = await ConversationRepository.findByCanonicalId(canonicalId);
      expect(updatedConv?.status).toBe('expired');

      clientA.disconnect();
      clientB.disconnect();
    });

    it('authoritatively reactivates an expired or closed conversation when initiate is called', async () => {
      const { user: userA, cookie: cookieA } = await createTestUserAndSession('alice', 'Alice Smith');
      const { user: userB } = await createTestUserAndSession('bob', 'Bob Jones');

      const canonicalId = 'alice:bob';

      // Setup expired conversation
      await ConversationRepository.getOrCreate(
        { id: userA._id, username: 'alice' },
        { id: userB._id, username: 'bob' },
        canonicalId,
        new Date(Date.now() - 40 * 60 * 1000)
      );
      await ConversationRepository.expire(canonicalId);

      const before = await ConversationRepository.findByCanonicalId(canonicalId);
      expect(before?.status).toBe('expired');

      // Alice initiates a new chat with Bob
      const res = await request(app)
        .post('/api/v1/conversations/initiate')
        .set('Cookie', [cookieA])
        .send({ recipientUsername: 'bob', canonicalId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.conversation.status).toBe('active');
      expect(res.body.conversation.remainingSeconds).toBeGreaterThan(1700);

      const after = await ConversationRepository.findByCanonicalId(canonicalId);
      expect(after?.status).toBe('active');
      expect(after?.closedBy).toBeUndefined();
    });
  });
});

