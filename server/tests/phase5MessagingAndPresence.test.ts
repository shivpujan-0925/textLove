import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { initSocketServer } from '../src/socket/index.js';
import { connectionRegistry } from '../src/socket/connectionRegistry.js';
import { UserRepository } from '../src/repositories/user.repository.js';
import { SessionRepository } from '../src/repositories/session.repository.js';

describe('Phase 5: Real-Time Messaging & Presence Gateway', () => {
  let server: http.Server;
  let serverPort: number;

  beforeEach(async () => {
    UserRepository.clearInMemory();
    SessionRepository.clearInMemory();
    connectionRegistry.clear();

    const app = createApp();
    server = http.createServer(app);
    initSocketServer(server);

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
    connectionRegistry.clear();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  async function createMockUserAndSession(username: string, displayName: string) {
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

    return { user, sessionToken: rawToken };
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

  describe('A. Server-Authoritative Presence & Multi-Tab Handling', () => {
    it('correctly tracks single tab, multi-tab presence, and disconnects', () => {
      // 1. Initially offline
      expect(connectionRegistry.isUserOnline('alice')).toBe(false);

      // 2. Tab 1 connects
      const reg1 = connectionRegistry.register('u_1', 'alice', 'sock_1');
      expect(reg1.isFirstConnection).toBe(true);
      expect(connectionRegistry.isUserOnline('alice')).toBe(true);
      expect(connectionRegistry.getSocketsForUser('alice')).toEqual(['sock_1']);

      // 3. Tab 2 connects for the same user
      const reg2 = connectionRegistry.register('u_1', 'alice', 'sock_2');
      expect(reg2.isFirstConnection).toBe(false);
      expect(connectionRegistry.isUserOnline('alice')).toBe(true);
      expect(connectionRegistry.getSocketsForUser('alice')).toHaveLength(2);

      // 4. Tab 1 closes -> user MUST remain online because Tab 2 is active
      const unreg1 = connectionRegistry.unregister('sock_1');
      expect(unreg1?.isOffline).toBe(false);
      expect(connectionRegistry.isUserOnline('alice')).toBe(true);
      expect(connectionRegistry.getSocketsForUser('alice')).toEqual(['sock_2']);

      // 5. Tab 2 closes -> now user is authoritatively offline
      const unreg2 = connectionRegistry.unregister('sock_2');
      expect(unreg2?.isOffline).toBe(true);
      expect(connectionRegistry.isUserOnline('alice')).toBe(false);
      expect(connectionRegistry.getSocketsForUser('alice')).toHaveLength(0);
    });

    it('subscribes to presence and returns real-time batch and updates', () => {
      connectionRegistry.register('u_bob', 'bob', 'sock_bob');

      const initial = connectionRegistry.subscribePresence('sock_alice', ['bob', 'charlie']);
      expect(initial).toEqual([
        { username: 'bob', online: true },
        { username: 'charlie', online: false },
      ]);
    });
  });

  describe('B. Authenticated Socket Connection', () => {
    it('rejects connection without session cookie', async () => {
      const client = createClientSocket();

      const connectError = await new Promise<string>((resolve) => {
        client.on('connect_error', (err) => resolve(err.message));
        client.connect();
      });

      expect(connectError).toBe('AUTHENTICATION_REQUIRED');
      client.disconnect();
    });

    it('rejects connection with invalid session token', async () => {
      const client = createClientSocket('invalid_session_token_123');

      const connectError = await new Promise<string>((resolve) => {
        client.on('connect_error', (err) => resolve(err.message));
        client.connect();
      });

      expect(connectError).toBe('SESSION_EXPIRED');
      client.disconnect();
    });

    it('allows valid authenticated session to connect and registers presence', async () => {
      const { sessionToken } = await createMockUserAndSession('alice', 'Alice Smith');
      const client = createClientSocket(sessionToken);

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
        client.connect();
      });

      expect(client.connected).toBe(true);
      expect(connectionRegistry.isUserOnline('alice')).toBe(true);

      client.disconnect();
    });
  });

  describe('C. Live-Only Messaging and Strict Invariants', () => {
    it('strictly rejects send attempt when recipient is offline with no queuing', async () => {
      const { sessionToken } = await createMockUserAndSession('alice', 'Alice Smith');
      const client = createClientSocket(sessionToken);

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
        client.connect();
      });

      // Bob is offline
      expect(connectionRegistry.isUserOnline('bob')).toBe(false);

      const errorPromise = new Promise<{ code: string; message: string }>((resolve) => {
        client.on('msg:error', (data) => resolve(data));
      });

      client.emit('msg:send', {
        conversationId: 'conv_123',
        recipientUsername: 'bob',
        ciphertext: 'base64_mock_ciphertext',
        iv: 'base64_mock_iv',
        seq: 1,
      });

      const err = await errorPromise;
      expect(err.code).toBe('RECIPIENT_OFFLINE');
      expect(err.message).toContain('is offline. Message not sent.');

      client.disconnect();
    });

    it('strictly rejects any socket payload containing plaintext fields', async () => {
      const { sessionToken } = await createMockUserAndSession('alice', 'Alice Smith');
      const client = createClientSocket(sessionToken);

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
        client.connect();
      });

      const errorPromise = new Promise<{ code: string }>((resolve) => {
        client.on('msg:error', (data) => resolve(data));
      });

      client.emit('msg:send', {
        conversationId: 'conv_123',
        recipientUsername: 'bob',
        ciphertext: 'base64_mock_ciphertext',
        iv: 'base64_mock_iv',
        seq: 1,
        text: 'Forbidden plaintext', // Prohibited!
      });

      const err = await errorPromise;
      expect(err.code).toBe('PLAINTEXT_PROHIBITED');

      client.disconnect();
    });

    it('strictly rejects any socket payload containing private key material', async () => {
      const { sessionToken } = await createMockUserAndSession('alice', 'Alice Smith');
      const client = createClientSocket(sessionToken);

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
        client.connect();
      });

      const errorPromise = new Promise<{ code: string }>((resolve) => {
        client.on('msg:error', (data) => resolve(data));
      });

      client.emit('msg:send', {
        conversationId: 'conv_123',
        recipientUsername: 'bob',
        ciphertext: 'base64_mock_ciphertext',
        iv: 'base64_mock_iv',
        seq: 1,
        privateKey: 'hex_private_key_leak', // Prohibited!
      });

      const err = await errorPromise;
      expect(err.code).toBe('PRIVATE_KEY_PROHIBITED');

      client.disconnect();
    });

    it('relays live ciphertext between online peers and routes acknowledgement back', async () => {
      const { sessionToken: aliceToken } = await createMockUserAndSession('alice', 'Alice Smith');
      const { sessionToken: bobToken } = await createMockUserAndSession('bob', 'Bob Martinez');

      const aliceSocket = createClientSocket(aliceToken);
      const bobSocket = createClientSocket(bobToken);

      await Promise.all([
        new Promise<void>((resolve) => {
          aliceSocket.on('connect', () => resolve());
          aliceSocket.connect();
        }),
        new Promise<void>((resolve) => {
          bobSocket.on('connect', () => resolve());
          bobSocket.connect();
        }),
      ]);

      expect(connectionRegistry.isUserOnline('alice')).toBe(true);
      expect(connectionRegistry.isUserOnline('bob')).toBe(true);

      // 1. Bob awaits delivery
      const bobReceivePromise = new Promise<{
        conversationId: string;
        senderUsername: string;
        ciphertext: string;
        iv: string;
        seq: number;
      }>((resolve) => {
        bobSocket.on('msg:deliver', (data) => resolve(data));
      });

      // 2. Alice awaits relayed confirmation
      const aliceRelayedPromise = new Promise<{ status: string }>((resolve) => {
        aliceSocket.on('msg:relayed', (data) => resolve(data));
      });

      // Alice sends live message to Bob
      aliceSocket.emit('msg:send', {
        conversationId: 'conv_live_1',
        recipientUsername: 'bob',
        ciphertext: 'cipher_hello_bob',
        iv: 'iv_123',
        seq: 1,
      });

      const relayed = await aliceRelayedPromise;
      expect(relayed.status).toBe('RELAYED_TO_NETWORK');

      const received = await bobReceivePromise;
      expect(received.senderUsername).toBe('alice');
      expect(received.ciphertext).toBe('cipher_hello_bob');
      expect(received.seq).toBe(1);

      // 3. Bob sends decryption acknowledgement
      const aliceAckPromise = new Promise<{ status: string; seq: number }>((resolve) => {
        aliceSocket.on('msg:peer_ack', (data) => resolve(data));
      });

      bobSocket.emit('msg:ack', {
        conversationId: 'conv_live_1',
        seq: 1,
        senderUsername: 'alice',
        status: 'DECRYPTED_BY_PEER',
      });

      const ack = await aliceAckPromise;
      expect(ack.status).toBe('DECRYPTED_BY_PEER');
      expect(ack.seq).toBe(1);

      aliceSocket.disconnect();
      bobSocket.disconnect();
    });

    it('forwards ephemeral typing and conversation termination', async () => {
      const { sessionToken: aliceToken } = await createMockUserAndSession('alice', 'Alice Smith');
      const { sessionToken: bobToken } = await createMockUserAndSession('bob', 'Bob Martinez');

      const aliceSocket = createClientSocket(aliceToken);
      const bobSocket = createClientSocket(bobToken);

      await Promise.all([
        new Promise<void>((resolve) => {
          aliceSocket.on('connect', () => resolve());
          aliceSocket.connect();
        }),
        new Promise<void>((resolve) => {
          bobSocket.on('connect', () => resolve());
          bobSocket.connect();
        }),
      ]);

      // Typing event
      const bobTypingPromise = new Promise<{ senderUsername: string; isTyping: boolean }>((resolve) => {
        bobSocket.on('conv:typing', (data) => resolve(data));
      });

      aliceSocket.emit('conv:typing', {
        conversationId: 'conv_live_1',
        recipientUsername: 'bob',
        isTyping: true,
      });

      const typingData = await bobTypingPromise;
      expect(typingData.senderUsername).toBe('alice');
      expect(typingData.isTyping).toBe(true);

      // Termination event ("Delete for both")
      const bobTerminatedPromise = new Promise<{ terminatedBy: string }>((resolve) => {
        bobSocket.on('conv:terminated', (data) => resolve(data));
      });

      aliceSocket.emit('conv:terminate', {
        conversationId: 'conv_live_1',
        peerUsername: 'bob',
      });

      const terminatedData = await bobTerminatedPromise;
      expect(terminatedData.terminatedBy).toBe('alice');

      aliceSocket.disconnect();
      bobSocket.disconnect();
    });
  });

  describe('D. Strict Zero-Retention Architecture Verification', () => {
    it('verifies that no message collections or queues exist in the database schema', () => {
      const modelNames = mongoose.modelNames();
      for (const name of modelNames) {
        expect(name.toLowerCase()).not.toContain('message');
        expect(name.toLowerCase()).not.toContain('chat');
        expect(name.toLowerCase()).not.toContain('queue');
        expect(name.toLowerCase()).not.toContain('payload');
      }
    });
  });
});
