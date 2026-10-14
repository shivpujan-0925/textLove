import { Router } from 'express';
import { KeysController } from './keys.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { csrfProtection } from '../../middleware/csrfProtection.js';
import { usernameLookupRateLimiter } from '../../middleware/rateLimiter.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { z } from 'zod';

export const keysRouter = Router();

const registerKeyBundleSchema = {
  body: z.object({
    identityPublicKey: z.string().length(64).regex(/^[a-fA-F0-9]{64}$/, 'Must be 32-byte hex string'),
    signedPreKey: z.string().length(64).regex(/^[a-fA-F0-9]{64}$/, 'Must be 32-byte hex string'),
    preKeySignature: z.string().length(128).regex(/^[a-fA-F0-9]{128}$/, 'Must be 64-byte hex string'),
  }),
};

// 1. Register or update client E2EE public key bundle
keysRouter.post(
  '/register',
  authenticate,
  csrfProtection,
  validateRequest(registerKeyBundleSchema),
  KeysController.registerKeys
);

// 2. Public lookup of a peer's public key bundle
keysRouter.get(
  '/:username',
  usernameLookupRateLimiter,
  KeysController.getPeerPublicKey
);
