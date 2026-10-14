import { Request, Response, NextFunction } from 'express';
import { ConversationRepository } from '../../repositories/conversation.repository.js';
import { ConversationExpiryService } from '../../services/conversationExpiry.service.js';
import { AppError } from '../../utils/appError.js';

export class ConversationController {
  /**
   * Authoritative query for conversation status and remaining seconds
   */
  public static async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
      }

      const { id } = req.params;
      if (!id) {
        throw new AppError('Conversation ID is required.', 400, 'MISSING_CONVERSATION_ID');
      }

      const conv = await ConversationRepository.findByCanonicalId(id);
      if (!conv) {
        throw new AppError('Conversation not found.', 404, 'CONVERSATION_NOT_FOUND');
      }

      // Verify participant authorization
      const username = req.user.username.toLowerCase();
      const isParticipant =
        conv.participantAUsername === username || conv.participantBUsername === username;
      if (!isParticipant) {
        throw new AppError('You are not authorized to access this conversation.', 403, 'UNAUTHORIZED_PARTICIPANT');
      }

      const now = Date.now();
      let status = conv.status;

      // Reactive check
      if (status === 'active' && now >= conv.expiresAt.getTime()) {
        await ConversationRepository.expire(id);
        status = 'expired';
      }

      const remainingMs = Math.max(0, conv.expiresAt.getTime() - now);
      const remainingSeconds = status === 'active' ? Math.floor(remainingMs / 1000) : 0;

      res.status(200).json({
        success: true,
        conversation: {
          id: conv.canonicalId,
          status,
          startedAt: conv.startedAt,
          lastActivityAt: conv.lastActivityAt,
          expiresAt: conv.expiresAt,
          remainingSeconds,
          closedAt: conv.closedAt,
          closedBy: conv.closedBy,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete conversation for both participants ("Delete for Both")
   * Idempotent, server-side participant authorization
   */
  public static async deleteConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
      }

      const { id } = req.params;
      if (!id) {
        throw new AppError('Conversation ID is required.', 400, 'MISSING_CONVERSATION_ID');
      }

      const username = req.user.username.toLowerCase();
      const conv = await ConversationRepository.findByCanonicalId(id);

      if (!conv) {
        // Idempotent: already deleted/purged
        res.status(200).json({
          success: true,
          message: 'Conversation is already ended and deleted.',
          status: 'closed',
        });
        return;
      }

      // Authorize that requester is participant
      const isParticipant =
        conv.participantAUsername === username || conv.participantBUsername === username;
      if (!isParticipant) {
        throw new AppError('You are not authorized to terminate this conversation.', 403, 'UNAUTHORIZED_PARTICIPANT');
      }

      const result = await ConversationExpiryService.deleteForBoth(id, username);

      res.status(200).json({
        success: true,
        message: 'Conversation permanently closed and deleted for both participants.',
        closedAt: result.closedAt,
        closedBy: result.closedBy,
      });
    } catch (err) {
      next(err);
    }
  }
}
