import { Router } from 'express';
import { ConversationController } from './conversation.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { csrfProtection } from '../../middleware/csrfProtection.js';

export const conversationRouter = Router();

// 1. Authoritative conversation status & expiry countdown check
conversationRouter.get('/:id/status', authenticate, ConversationController.getStatus);

// 2. Delete conversation for both participants
conversationRouter.delete('/:id', authenticate, csrfProtection, ConversationController.deleteConversation);
