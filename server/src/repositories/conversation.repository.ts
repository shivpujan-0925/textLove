import { Types } from 'mongoose';
import { ConversationModel, IConversation } from '../models/Conversation.model.js';
import { isDatabaseConnected } from '../config/db.js';
import { logger } from '../config/logger.js';

export const INACTIVITY_EXPIRY_MS = 30 * 60 * 1000; // Authoritative 30 minutes

// In-Memory store for offline development and fast unit testing
const inMemConversations = new Map<string, IConversation>();

export class ConversationRepository {
  public static clearInMemory(): void {
    inMemConversations.clear();
  }

  /**
   * Resolve existing conversation or initialize fresh record with authoritative 30m expiry
   */
  public static async getOrCreate(
    participantA: { id: string | Types.ObjectId; username: string },
    participantB: { id: string | Types.ObjectId; username: string },
    canonicalId: string,
    currentTime: Date = new Date()
  ): Promise<IConversation> {
    if (isDatabaseConnected()) {
      const existing = await ConversationModel.findOne({ canonicalId });

      if (existing) {
        // Reactive check: if currently marked active but passed expiresAt, transition to expired
        if (existing.status === 'active' && currentTime.getTime() >= existing.expiresAt.getTime()) {
          existing.status = 'expired';
          await existing.save();
          logger.info({ canonicalId }, 'Conversation reactively marked expired on lookup');
        }
        return existing;
      }

      const expiresAt = new Date(currentTime.getTime() + INACTIVITY_EXPIRY_MS);
      const newConv = new ConversationModel({
        canonicalId,
        participantA: new Types.ObjectId(participantA.id),
        participantB: new Types.ObjectId(participantB.id),
        participantAUsername: participantA.username.toLowerCase(),
        participantBUsername: participantB.username.toLowerCase(),
        status: 'active',
        startedAt: currentTime,
        lastActivityAt: currentTime,
        expiresAt,
      });

      await newConv.save();
      logger.info({ canonicalId, expiresAt }, 'New authoritative conversation record initialized');
      return newConv;
    }

    // In-memory fallback
    const existingMem = inMemConversations.get(canonicalId);
    if (existingMem) {
      if (existingMem.status === 'active' && currentTime.getTime() >= existingMem.expiresAt.getTime()) {
        existingMem.status = 'expired';
        logger.info({ canonicalId }, 'In-mem conversation reactively marked expired on lookup');
      }
      return existingMem;
    }

    const expiresAt = new Date(currentTime.getTime() + INACTIVITY_EXPIRY_MS);
    const inMemDoc = {
      _id: new Types.ObjectId(),
      canonicalId,
      participantA: new Types.ObjectId(participantA.id),
      participantB: new Types.ObjectId(participantB.id),
      participantAUsername: participantA.username.toLowerCase(),
      participantBUsername: participantB.username.toLowerCase(),
      status: 'active' as const,
      startedAt: currentTime,
      lastActivityAt: currentTime,
      expiresAt,
      save: async function () {
        return this;
      },
    } as unknown as IConversation;

    inMemConversations.set(canonicalId, inMemDoc);
    logger.info({ canonicalId, expiresAt }, 'New in-mem conversation record initialized');
    return inMemDoc;
  }

  /**
   * Find conversation by canonical ID
   */
  public static async findByCanonicalId(canonicalId: string): Promise<IConversation | null> {
    if (isDatabaseConnected()) {
      return ConversationModel.findOne({ canonicalId });
    }
    return inMemConversations.get(canonicalId) || null;
  }

  /**
   * Record a qualifying message event: atomically updates lastActivityAt and resets 30m timer
   * Fails if conversation is not active (i.e. already expired or closed)
   */
  public static async recordActivity(
    canonicalId: string,
    currentTime: Date = new Date()
  ): Promise<IConversation | null> {
    const expiresAt = new Date(currentTime.getTime() + INACTIVITY_EXPIRY_MS);
    if (isDatabaseConnected()) {
      return ConversationModel.findOneAndUpdate(
        { canonicalId, status: 'active', expiresAt: { $gt: currentTime } },
        {
          lastActivityAt: currentTime,
          expiresAt,
        },
        { new: true }
      );
    }

    const conv = inMemConversations.get(canonicalId);
    if (!conv || conv.status !== 'active' || currentTime.getTime() >= conv.expiresAt.getTime()) {
      return null;
    }
    conv.lastActivityAt = currentTime;
    conv.expiresAt = expiresAt;
    return conv;
  }

  /**
   * Atomically mark conversation as expired
   */
  public static async expire(canonicalId: string): Promise<IConversation | null> {
    if (isDatabaseConnected()) {
      return ConversationModel.findOneAndUpdate(
        { canonicalId, status: 'active' },
        { status: 'expired' },
        { new: true }
      );
    }

    const conv = inMemConversations.get(canonicalId);
    if (!conv || conv.status !== 'active') return conv || null;
    conv.status = 'expired';
    return conv;
  }

  /**
   * Idempotently mark conversation as closed (Delete for Both)
   */
  public static async closeForBoth(
    canonicalId: string,
    closedByUsername: string,
    currentTime: Date = new Date()
  ): Promise<IConversation | null> {
    if (isDatabaseConnected()) {
      return ConversationModel.findOneAndUpdate(
        { canonicalId },
        {
          status: 'closed',
          closedAt: currentTime,
          closedBy: closedByUsername.toLowerCase(),
        },
        { new: true }
      );
    }

    const conv = inMemConversations.get(canonicalId);
    if (!conv) return null;
    conv.status = 'closed';
    conv.closedAt = currentTime;
    conv.closedBy = closedByUsername.toLowerCase();
    return conv;
  }

  /**
   * Find all active conversations that have authoritatively expired
   */
  public static async findExpiredActive(currentTime: Date = new Date()): Promise<IConversation[]> {
    if (isDatabaseConnected()) {
      return ConversationModel.find({
        status: 'active',
        expiresAt: { $lte: currentTime },
      });
    }

    return Array.from(inMemConversations.values()).filter(
      (c) => c.status === 'active' && c.expiresAt.getTime() <= currentTime.getTime()
    );
  }

  /**
   * Find all active conversations involving a user
   */
  public static async findActiveByUser(userId: string | Types.ObjectId): Promise<IConversation[]> {
    const idStr = userId.toString();
    if (isDatabaseConnected()) {
      const objId = new Types.ObjectId(idStr);
      return ConversationModel.find({
        status: 'active',
        $or: [{ participantA: objId }, { participantB: objId }],
      });
    }

    return Array.from(inMemConversations.values()).filter(
      (c) =>
        c.status === 'active' &&
        (c.participantA.toString() === idStr || c.participantB.toString() === idStr)
    );
  }
}
