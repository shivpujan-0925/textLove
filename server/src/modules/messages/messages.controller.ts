import { Request, Response, NextFunction } from 'express';
import { UserRepository } from '../../repositories/user.repository.js';
import { liveRelayService } from '../../services/liveRelay.service.js';
import { AppError } from '../../utils/appError.js';
import { logger } from '../../config/logger.js';

export class MessagesController {
  /**
   * Relay encrypted ciphertext to recipient's active live connection.
   * Zero message database persistence: strictly rejects plaintext and offline queues.
   */
  public static async relayMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
      }

      const body = req.body || {};

      // 1. Strict security check: reject if plaintext message fields exist
      const prohibitedPlaintextFields = ['text', 'plaintext', 'message', 'body', 'content', 'msg'];
      for (const field of prohibitedPlaintextFields) {
        if (field in body) {
          logger.warn(
            { userId: req.user._id, field },
            'CRITICAL SECURITY ALERT: Plaintext field detected in relayMessage payload! Rejected.'
          );
          throw new AppError(
            'Plaintext message payloads are strictly prohibited. textLove operates on opaque E2EE ciphertext only.',
            400,
            'PLAINTEXT_PROHIBITED'
          );
        }
      }

      // 2. Strict security check: reject if private keys exist
      for (const k of Object.keys(body)) {
        if (k.toLowerCase().includes('priv') || k.toLowerCase().includes('secret')) {
          throw new AppError(
            'Private key material must NEVER be transmitted to the server.',
            400,
            'PRIVATE_KEY_PROHIBITED'
          );
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
      } = body;

      // 3. Verify recipient exists
      const recipient = await UserRepository.findByUsername(recipientUsername);
      if (!recipient || recipient.status === 'deleted') {
        throw new AppError(`Recipient '@${recipientUsername}' not found.`, 404, 'RECIPIENT_NOT_FOUND');
      }

      // 4. Dispatch to active connection stream (zero store-and-forward)
      const isDelivered = liveRelayService.forward({
        conversationId,
        senderUsername: req.user.username,
        recipientUsername: recipient.username,
        ciphertext,
        iv,
        seq,
        timestamp: timestamp || Date.now(),
        senderEphemeralPublicKey,
      });

      if (!isDelivered) {
        // If recipient is not currently online, reject immediately with RECIPIENT_OFFLINE
        // (textLove strictly forbids offline message queuing)
        throw new AppError(
          `Recipient '@${recipient.username}' is currently offline. textLove strictly rejects offline queuing.`,
          409,
          'RECIPIENT_OFFLINE'
        );
      }

      // 5. Redacted logging: routing metadata only, zero ciphertext or private material logged
      logger.info(
        {
          conversationId,
          senderUsername: req.user.username,
          recipientUsername: recipient.username,
          seq,
        },
        'Encrypted payload relayed into recipient active connection buffer'
      );

      res.status(200).json({
        success: true,
        status: 'RELAYED_TO_NETWORK',
        conversationId,
        seq,
        relayedAt: Date.now(),
      });
    } catch (err) {
      next(err);
    }
  }
}
