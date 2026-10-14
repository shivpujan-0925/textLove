import { Router } from 'express';
import { UserController } from './user.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { csrfProtection } from '../../middleware/csrfProtection.js';
import { usernameLookupRateLimiter } from '../../middleware/rateLimiter.js';
import { handleAvatarUpload } from '../../middleware/uploadAvatar.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { z } from 'zod';

export const userRouter = Router();

const updateUsernameSchema = {
  body: z.object({
    newUsername: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]{3,24}$/, 'Invalid username format'),
  }),
};

const updateProfileSchema = {
  body: z.object({
    displayName: z.string().min(1).max(50).optional(),
    avatarUrl: z.string().url().optional(),
  }),
};

// 1. Public search / discovery of usernames
userRouter.get(
  '/search',
  usernameLookupRateLimiter,
  UserController.searchUsers
);

// 2. Public check username availability
userRouter.get(
  '/check-username/:username',
  usernameLookupRateLimiter,
  UserController.checkUsername
);

// 3. Public lookup profile by username
userRouter.get(
  '/lookup/:username',
  usernameLookupRateLimiter,
  UserController.lookupUser
);

// 4. Authorized change username
userRouter.patch(
  '/username',
  authenticate,
  csrfProtection,
  validateRequest(updateUsernameSchema),
  UserController.updateUsername
);

// 5. Authorized update profile
userRouter.patch(
  '/profile',
  authenticate,
  csrfProtection,
  validateRequest(updateProfileSchema),
  UserController.updateProfile
);

// 6. Authorized upload profile avatar (Cloudinary)
userRouter.post(
  '/avatar',
  authenticate,
  csrfProtection,
  handleAvatarUpload,
  UserController.uploadAvatar
);

// 7. Permanent account deletion cascade
userRouter.delete(
  '/me',
  authenticate,
  csrfProtection,
  UserController.deleteAccount
);
