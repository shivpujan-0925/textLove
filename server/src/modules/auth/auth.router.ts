import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { csrfProtection } from '../../middleware/csrfProtection.js';
import { authRateLimiter } from '../../middleware/rateLimiter.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { z } from 'zod';

export const authRouter = Router();

const googleCallbackSchema = {
  body: z
    .object({
      idToken: z.string().optional(),
      code: z.string().optional(),
      state: z.string().optional(),
    })
    .refine((data) => Boolean(data.idToken || data.code), {
      message: 'Either identity token or authorization code is required',
    }),
};

// 1. Initiate OAuth
authRouter.get('/google/url', authRateLimiter, AuthController.getGoogleAuthUrl);

// 2. Complete OAuth Callback
authRouter.post(
  '/google/callback',
  authRateLimiter,
  validateRequest(googleCallbackSchema),
  AuthController.handleGoogleCallback
);

// 3. Current Session Profile
authRouter.get('/me', authenticate, AuthController.getMe);

// 4. Logout & Session Revocation
authRouter.post('/logout', authenticate, csrfProtection, AuthController.logout);
