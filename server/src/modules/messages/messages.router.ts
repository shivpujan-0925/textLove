import { Router } from 'express';
import { MessagesController } from './messages.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { csrfProtection } from '../../middleware/csrfProtection.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { z } from 'zod';

export const messagesRouter = Router();

const relayMessageSchema = {
  body: z.object({
    conversationId: z.string().min(1).max(100),
    recipientUsername: z.string().min(3).max(24),
    ciphertext: z.string().min(1),
    iv: z.string().min(1),
    seq: z.number().int().positive(),
    timestamp: z.number().positive().optional(),
    senderEphemeralPublicKey: z.string().length(64).regex(/^[a-fA-F0-9]{64}$/).optional(),
  }),
};

// Authorized live-only message relay (zero persistence)
messagesRouter.post(
  '/relay',
  authenticate,
  csrfProtection,
  validateRequest(relayMessageSchema),
  MessagesController.relayMessage
);
