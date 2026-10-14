import { Server } from 'socket.io';
import { ConversationRepository } from '../repositories/conversation.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { connectionRegistry } from '../socket/connectionRegistry.js';
import { logger } from '../config/logger.js';
import { IConversation } from '../models/Conversation.model.js';

export interface ConversationValidationResult {
  valid: boolean;
  code?: 'CONVERSATION_EXPIRED' | 'CONVERSATION_CLOSED' | 'UNAUTHORIZED_PARTICIPANT' | 'USER_NOT_FOUND';
  message?: string;
  conversation?: IConversation;
}

export class ConversationExpiryService {
  private static sweepTimer: NodeJS.Timeout | null = null;

  /**
   * Authoritatively validate active conversation status before allowing message relay
   */
  public static async validateAndGet(
    canonicalId: string,
    senderUsername: string,
    recipientUsername: string,
    currentTime: Date = new Date()
  ): Promise<ConversationValidationResult> {
    const sUser = senderUsername.toLowerCase().trim();
    const rUser = recipientUsername.toLowerCase().trim();

    // Check if conversation record already exists
    let conv = await ConversationRepository.findByCanonicalId(canonicalId);

    if (!conv) {
      // Resolve both user records to initialize authoritative record
      const [userA, userB] = await Promise.all([
        UserRepository.findByUsername(sUser),
        UserRepository.findByUsername(rUser),
      ]);

      if (!userA || !userB || userA.status === 'deleted' || userB.status === 'deleted') {
        return {
          valid: false,
          code: 'USER_NOT_FOUND',
          message: 'One or both conversation participants could not be found.',
        };
      }

      conv = await ConversationRepository.getOrCreate(
        { id: userA._id.toString(), username: userA.username },
        { id: userB._id.toString(), username: userB.username },
        canonicalId,
        currentTime
      );
    }

    // Check participant authorization
    const isParticipant =
      (conv.participantAUsername === sUser && conv.participantBUsername === rUser) ||
      (conv.participantAUsername === rUser && conv.participantBUsername === sUser);

    if (!isParticipant) {
      return {
        valid: false,
        code: 'UNAUTHORIZED_PARTICIPANT',
        message: 'Sender or recipient is not an authorized participant in this conversation.',
      };
    }

    // Check closed status (Delete for Both)
    if (conv.status === 'closed') {
      return {
        valid: false,
        code: 'CONVERSATION_CLOSED',
        message: 'This conversation was ended and deleted for both participants.',
        conversation: conv,
      };
    }

    // Check reactive 30-minute expiration
    if (conv.status === 'expired' || currentTime.getTime() >= conv.expiresAt.getTime()) {
      if (conv.status !== 'expired') {
        await ConversationRepository.expire(canonicalId);
        conv.status = 'expired';
      }
      return {
        valid: false,
        code: 'CONVERSATION_EXPIRED',
        message: 'This conversation has expired due to 30 minutes of inactivity.',
        conversation: conv,
      };
    }

    return {
      valid: true,
      conversation: conv,
    };
  }

  /**
   * Record qualified conversation activity (only deliberate messages reset timer)
   */
  public static async recordQualifiedActivity(
    canonicalId: string,
    currentTime: Date = new Date()
  ): Promise<IConversation | null> {
    return ConversationRepository.recordActivity(canonicalId, currentTime);
  }

  /**
   * Idempotently delete/terminate conversation for both participants
   */
  public static async deleteForBoth(
    canonicalId: string,
    requesterUsername: string,
    io?: Server,
    currentTime: Date = new Date()
  ): Promise<{ success: boolean; closedAt: Date; closedBy: string }> {
    const username = requesterUsername.toLowerCase().trim();
    const conv = await ConversationRepository.findByCanonicalId(canonicalId);

    if (!conv) {
      return { success: true, closedAt: currentTime, closedBy: username };
    }

    // Authorize requester
    const isAuthorized =
      conv.participantAUsername === username || conv.participantBUsername === username;
    if (!isAuthorized) {
      throw new Error('UNAUTHORIZED_PARTICIPANT');
    }

    const updated = await ConversationRepository.closeForBoth(canonicalId, username, currentTime);

    // Notify connected sockets for both participants in real-time
    if (io) {
      const peerUsername =
        conv.participantAUsername === username ? conv.participantBUsername : conv.participantAUsername;

      const targetUsernames = [username, peerUsername];
      for (const target of targetUsernames) {
        const sockets = connectionRegistry.getSocketsForUser(target);
        for (const sockId of sockets) {
          io.to(sockId).emit('conv:terminated', {
            conversationId: canonicalId,
            terminatedBy: username,
          });
        }
      }
    }

    logger.info({ canonicalId, terminatedBy: username }, 'Conversation closed for both participants');
    return {
      success: true,
      closedAt: updated?.closedAt || currentTime,
      closedBy: username,
    };
  }

  /**
   * Proactive sweep of all active conversations that have reached expiresAt
   */
  public static async sweepExpiredConversations(
    currentTime: Date = new Date(),
    io?: Server
  ): Promise<number> {
    const expiredList = await ConversationRepository.findExpiredActive(currentTime);
    if (expiredList.length === 0) return 0;

    for (const conv of expiredList) {
      await ConversationRepository.expire(conv.canonicalId);
      logger.info({ canonicalId: conv.canonicalId }, 'Conversation proactively marked expired by sweeper');

      // Notify connected participants
      if (io) {
        const participants = [conv.participantAUsername, conv.participantBUsername];
        for (const p of participants) {
          const sockets = connectionRegistry.getSocketsForUser(p);
          for (const sId of sockets) {
            io.to(sId).emit('conv:expired', {
              conversationId: conv.canonicalId,
              reason: '30_MIN_INACTIVITY',
              expiredAt: currentTime.toISOString(),
            });
          }
        }
      }
    }

    return expiredList.length;
  }

  /**
   * Start proactive periodic sweep daemon (every 30 seconds by default)
   */
  public static startSweeper(io: Server, intervalMs = 30000): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(async () => {
      try {
        await this.sweepExpiredConversations(new Date(), io);
      } catch (err: unknown) {
        logger.error({ err: (err as Error).message }, 'Error during conversation expiry sweep');
      }
    }, intervalMs);
  }

  /**
   * Stop sweeper daemon (useful for test teardown)
   */
  public static stopSweeper(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }
}
