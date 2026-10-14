import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { SessionRepository } from '../repositories/session.repository.js';
import { connectionRegistry } from './connectionRegistry.js';
import { liveRelayService } from '../services/liveRelay.service.js';
import { ConversationExpiryService } from '../services/conversationExpiry.service.js';
import { ConversationRepository } from '../repositories/conversation.repository.js';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    username: string;
    displayName: string;
  };
}

export function initSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingInterval: 10000,
    pingTimeout: 5000,
    transports: ['websocket', 'polling'],
  });

  connectionRegistry.setServer(io);

  // Authoritative background sweep daemon (every 30 seconds)
  ConversationExpiryService.startSweeper(io, 30000);

  // 1. Authenticate Socket connection via HttpOnly session cookie
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      if (!cookieHeader) {
        return next(new Error('AUTHENTICATION_REQUIRED'));
      }

      // Parse textlove_session cookie
      const cookies = Object.fromEntries(
        cookieHeader.split(';').map((c) => {
          const [k, ...v] = c.trim().split('=');
          return [k, decodeURIComponent(v.join('='))];
        })
      );

      const sessionToken = cookies['textlove_session'];
      if (!sessionToken) {
        return next(new Error('INVALID_SESSION'));
      }

      const valid = await SessionRepository.findValidSession(sessionToken);
      if (!valid || !valid.user) {
        return next(new Error('SESSION_EXPIRED'));
      }

      if (valid.user.status === 'deleted' || valid.user.status === 'suspended') {
        return next(new Error('ACCOUNT_UNAVAILABLE'));
      }

      socket.data = {
        userId: valid.user._id.toString(),
        username: valid.user.username,
        displayName: valid.user.displayName,
      };

      next();
    } catch (err: unknown) {
      logger.warn({ err: (err as Error).message }, 'Socket authentication error');
      next(new Error('INTERNAL_AUTH_ERROR'));
    }
  });

  // 2. Client Connection Lifecycle
  io.on('connection', (rawSocket: Socket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const { userId, username } = socket.data;

    connectionRegistry.register(userId, username, socket.id);

    logger.info(
      { username, socketId: socket.id },
      'Authenticated Socket.IO client connected'
    );

    // Bridge liveRelayService: if a message is submitted via HTTP /relay, deliver to this socket
    const unsubscribeRelay = liveRelayService.subscribe(username, (payload) => {
      socket.emit('msg:deliver', payload);
    });

    // -------------------------------------------------------------------------
    // A. Presence Subscriptions & Heartbeats
    // -------------------------------------------------------------------------
    socket.on('presence:subscribe', (payload: { usernames?: string[] }) => {
      if (!payload?.usernames || !Array.isArray(payload.usernames)) return;
      const statusList = connectionRegistry.subscribePresence(socket.id, payload.usernames);
      socket.emit('presence:batch', statusList);
    });

    socket.on('presence:query', (payload: { username?: string }) => {
      if (!payload?.username) return;
      const isOnline = connectionRegistry.isUserOnline(payload.username);
      socket.emit('presence:update', {
        username: payload.username.toLowerCase().trim(),
        online: isOnline,
      });
    });

    socket.on('presence:heartbeat', (_payload?: unknown) => {
      socket.emit('presence:heartbeat_ack', { timestamp: Date.now() });
    });

    // -------------------------------------------------------------------------
    // B. Strict Live-Only Message Relay (Zero Retention)
    // -------------------------------------------------------------------------
    socket.on(
      'msg:send',
      async (payload: {
        conversationId: string;
        recipientUsername: string;
        ciphertext: string;
        iv: string;
        seq: number;
        timestamp?: number;
        senderEphemeralPublicKey?: string;
      }) => {
        try {
          // Invariant Check 1: Reject if any prohibited plaintext fields exist
          const raw = payload as Record<string, unknown>;
          const prohibited = ['text', 'plaintext', 'message', 'body', 'content', 'msg'];
          for (const k of prohibited) {
            if (k in raw) {
              socket.emit('msg:error', {
                conversationId: payload?.conversationId,
                seq: payload?.seq,
                code: 'PLAINTEXT_PROHIBITED',
                message: 'Plaintext message fields are strictly prohibited on textLove.',
              });
              return;
            }
          }

          // Invariant Check 2: Reject if private key material exists
          for (const k of Object.keys(raw)) {
            if (k.toLowerCase().includes('priv') || k.toLowerCase().includes('secret')) {
              socket.emit('msg:error', {
                conversationId: payload?.conversationId,
                seq: payload?.seq,
                code: 'PRIVATE_KEY_PROHIBITED',
                message: 'Private key material must NEVER be transmitted.',
              });
              return;
            }
          }

          const {
            conversationId,
            recipientUsername,
            ciphertext,
            iv,
            seq,
            timestamp,
            senderEphemeralPublicKey,
          } = payload;

          if (!recipientUsername || !ciphertext || !iv || typeof seq !== 'number') {
            socket.emit('msg:error', {
              conversationId,
              seq,
              code: 'INVALID_PAYLOAD',
              message: 'Invalid message payload.',
            });
            return;
          }

          const target = recipientUsername.toLowerCase().trim();

          // Invariant Check 2: Atomic live presence verification at the exact millisecond of send
          const isRecipientOnline = connectionRegistry.isUserOnline(target);
          if (!isRecipientOnline) {
            socket.emit('msg:error', {
              conversationId,
              seq,
              code: 'RECIPIENT_OFFLINE',
              message: `User @${target} is offline. Message not sent.`,
            });
            return;
          }

          const recipientSockets = connectionRegistry.getSocketsForUser(target);
          if (recipientSockets.length === 0) {
            socket.emit('msg:error', {
              conversationId,
              seq,
              code: 'RECIPIENT_OFFLINE',
              message: `User @${target} is offline. Message not sent.`,
            });
            return;
          }

          // Invariant Check 2.5: Server-authoritative conversation state validation (30m inactivity & delete-for-both)
          const validation = await ConversationExpiryService.validateAndGet(
            conversationId,
            username,
            target
          );
          if (!validation.valid) {
            socket.emit('msg:error', {
              conversationId,
              seq,
              code: validation.code,
              message: validation.message || 'Operation rejected for this conversation.',
            });
            if (validation.code === 'CONVERSATION_EXPIRED') {
              socket.emit('conv:expired', {
                conversationId,
                reason: '30_MIN_INACTIVITY',
                expiredAt: new Date().toISOString(),
              });
            } else if (validation.code === 'CONVERSATION_CLOSED') {
              socket.emit('conv:terminated', {
                conversationId,
                terminatedBy: validation.conversation?.closedBy || 'peer',
              });
            }
            return;
          }

          const deliverPayload = {
            conversationId,
            senderUsername: username,
            recipientUsername: target,
            ciphertext,
            iv,
            seq,
            timestamp: timestamp || Date.now(),
            senderEphemeralPublicKey,
          };

          // Forward ciphertext into recipient socket memory write buffer
          for (const recipientSocketId of recipientSockets) {
            io.to(recipientSocketId).emit('msg:deliver', deliverPayload);
          }

          // Authoritative timer reset: only qualified message relay resets the 30-minute inactivity timer
          await ConversationExpiryService.recordQualifiedActivity(conversationId);

          // Instant honest confirmation to sender that ciphertext was relayed into network buffer
          socket.emit('msg:relayed', {
            conversationId,
            seq,
            status: 'RELAYED_TO_NETWORK',
            relayedAt: Date.now(),
          });

          logger.info(
            { conversationId, sender: username, recipient: target, seq },
            'Live ciphertext dispatched to peer socket(s)'
          );
        } catch (err: unknown) {
          socket.emit('msg:error', {
            conversationId: payload?.conversationId,
            seq: payload?.seq,
            code: 'INTERNAL_RELAY_ERROR',
            message: (err as Error).message || 'Failed to relay message.',
          });
        }
      }
    );

    // -------------------------------------------------------------------------
    // C. Delivery & Decryption Acknowledgements (msg:ack -> msg:peer_ack)
    // -------------------------------------------------------------------------
    socket.on(
      'msg:ack',
      (payload: {
        conversationId: string;
        seq: number;
        senderUsername: string;
        status: 'DECRYPTED_BY_PEER';
      }) => {
        if (!payload?.senderUsername || !payload?.seq) return;
        const senderSockets = connectionRegistry.getSocketsForUser(payload.senderUsername);
        for (const senderSocketId of senderSockets) {
          io.to(senderSocketId).emit('msg:peer_ack', {
            conversationId: payload.conversationId,
            seq: payload.seq,
            status: payload.status || 'DECRYPTED_BY_PEER',
          });
        }
      }
    );

    // -------------------------------------------------------------------------
    // D. Ephemeral Live Typing Indicator (Non-qualifying action: does not reset timer)
    // -------------------------------------------------------------------------
    socket.on('conv:typing', async (payload: { conversationId: string; recipientUsername: string; isTyping: boolean }) => {
      if (!payload?.recipientUsername || !payload?.conversationId) return;
      const target = payload.recipientUsername.toLowerCase().trim();
      const conv = await ConversationRepository.findByCanonicalId(payload.conversationId);
      if (!conv || conv.status !== 'active' || Date.now() >= conv.expiresAt.getTime()) {
        return; // Drop typing indicator if conversation is expired or closed
      }
      const targetSockets = connectionRegistry.getSocketsForUser(target);
      for (const targetSocketId of targetSockets) {
        io.to(targetSocketId).emit('conv:typing', {
          conversationId: payload.conversationId,
          senderUsername: username,
          isTyping: Boolean(payload.isTyping),
        });
      }
    });

    // -------------------------------------------------------------------------
    // E. Ephemeral Conversation Termination ("Delete for Both")
    // -------------------------------------------------------------------------
    socket.on('conv:terminate', async (payload: { conversationId: string; peerUsername?: string }) => {
      if (!payload?.conversationId) return;
      try {
        await ConversationExpiryService.deleteForBoth(payload.conversationId, username, io);
      } catch (err: unknown) {
        logger.warn({ err: (err as Error).message, conversationId: payload.conversationId }, 'Failed to close conversation');
      }
    });

    // -------------------------------------------------------------------------
    // F. Disconnection Cleanup
    // -------------------------------------------------------------------------
    socket.on('disconnect', () => {
      unsubscribeRelay();
      connectionRegistry.unregister(socket.id);
    });
  });

  return io;
}
