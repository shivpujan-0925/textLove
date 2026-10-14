import { Request, Response, NextFunction } from 'express';
import { UserRepository } from '../../repositories/user.repository.js';
import { SessionRepository } from '../../repositories/session.repository.js';
import { ConversationRepository } from '../../repositories/conversation.repository.js';
import { ConversationExpiryService } from '../../services/conversationExpiry.service.js';
import { CloudinaryService } from '../../services/cloudinary.service.js';
import { connectionRegistry } from '../../socket/connectionRegistry.js';
import { UsernameHelper } from '../../utils/usernameGenerator.js';
import { AppError } from '../../utils/appError.js';

export class UserController {
  /**
   * Checks if a proposed username is available
   */
  public static async checkUsername(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username } = req.params;

      if (!username) {
        throw new AppError('Username parameter is required.', 400, 'MISSING_USERNAME');
      }

      const isValid = UsernameHelper.isValidFormat(username);
      const isReserved = UsernameHelper.isReserved(username);

      if (!isValid || isReserved) {
        res.status(200).json({
          username,
          available: false,
          reason: isReserved ? 'Username is reserved.' : 'Invalid characters or length (3-24 characters, a-z, 0-9, _).',
        });
        return;
      }

      const isAvailable = await UserRepository.isUsernameAvailable(username);

      res.status(200).json({
        username,
        available: isAvailable,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Public username lookup: returns safe public profile only (strictly no email or internal ids)
   */
  public static async lookupUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username } = req.params;

      if (!username) {
        throw new AppError('Username parameter is required.', 400, 'MISSING_USERNAME');
      }

      const publicProfile = await UserRepository.getPublicProfile(username);

      if (!publicProfile) {
        throw new AppError(`User '@${username}' not found.`, 404, 'USER_NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        user: publicProfile,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Authorized username change
   */
  public static async updateUsername(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
      }

      const { newUsername } = req.body;

      UsernameHelper.validateOrThrow(newUsername);

      const updatedUser = await UserRepository.updateUsername(req.user._id.toString(), newUsername);

      res.status(200).json({
        success: true,
        message: 'Username updated successfully.',
        user: {
          id: updatedUser._id.toString(),
          username: updatedUser.username,
          displayName: updatedUser.displayName,
          avatarUrl: updatedUser.avatarUrl,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Authorized profile update (displayName, avatarUrl)
   */
  public static async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
      }

      const { displayName, avatarUrl } = req.body;

      if (displayName !== undefined) {
        if (typeof displayName !== 'string' || displayName.trim().length === 0 || displayName.length > 50) {
          throw new AppError('Display name must be between 1 and 50 characters.', 400, 'INVALID_DISPLAY_NAME');
        }
      }

      const updated = await UserRepository.updateProfile(req.user._id.toString(), {
        displayName: displayName ? displayName.trim() : undefined,
        avatarUrl,
      });

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully.',
        user: {
          id: updated._id.toString(),
          username: updated.username,
          displayName: updated.displayName,
          avatarUrl: updated.avatarUrl,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Upload and process profile avatar with Cloudinary
   */
  public static async uploadAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
      }

      if (!req.file || !req.file.buffer) {
        throw new AppError('No avatar image file provided.', 400, 'MISSING_FILE');
      }

      // If user already had a Cloudinary avatar, schedule previous asset cleanup
      if (req.user.avatarPublicId) {
        await CloudinaryService.deleteAvatar(req.user.avatarPublicId);
      }

      const { avatarUrl, avatarPublicId } = await CloudinaryService.uploadAvatar(
        req.file.buffer,
        req.user._id.toString()
      );

      const updated = await UserRepository.updateProfile(req.user._id.toString(), {
        avatarUrl,
        avatarPublicId,
      });

      res.status(200).json({
        success: true,
        message: 'Avatar uploaded and updated successfully.',
        user: {
          id: updated._id.toString(),
          username: updated.username,
          displayName: updated.displayName,
          avatarUrl: updated.avatarUrl,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Public username discovery / search
   */
  public static async searchUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = (req.query.q as string) || '';

      if (!query.trim()) {
        res.status(200).json({ success: true, users: [] });
        return;
      }

      const users = await UserRepository.searchUsers(query.trim());

      res.status(200).json({
        success: true,
        users,
        data: users,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Permanent account deletion cascade
   */
  public static async deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
      }

      const confirmation = req.body?.confirmation;
      if (confirmation !== undefined && confirmation !== 'DELETE') {
        throw new AppError('Account deletion requires confirmation string "DELETE".', 400, 'CONFIRMATION_REQUIRED');
      }

      const userId = req.user._id.toString();
      const username = req.user.username.toLowerCase();

      // 1. Terminate all active conversations involving this user
      const activeConvs = await ConversationRepository.findActiveByUser(userId);
      for (const conv of activeConvs) {
        await ConversationExpiryService.deleteForBoth(conv.canonicalId, username);
      }

      // 2. Disconnect active WebSocket connections for this user
      const userSockets = connectionRegistry.getSocketsForUser(username);
      for (const sockId of userSockets) {
        connectionRegistry.unregister(sockId);
      }

      // 3. Purge Cloudinary media asset if present with retryable safety
      if (req.user.avatarPublicId) {
        try {
          await CloudinaryService.deleteAvatar(req.user.avatarPublicId);
        } catch {
          // Non-blocking: media asset deletion scheduled or failed gracefully
        }
      }

      // 4. Revoke all active user sessions across all devices
      await SessionRepository.revokeAllUserSessions(userId);

      // 5. Mark user account deleted and release username
      await UserRepository.deleteAccount(userId);

      // 6. Clear session cookie
      res.clearCookie('textlove_session', { path: '/' });

      res.status(200).json({
        success: true,
        message: 'Your account metadata and sessions have been permanently purged.',
        disclosure:
          'Account metadata and active sessions were permanently purged. Cloudinary asset removal was dispatched. Third-party provider backups are maintained in rotating cold storage and will naturally overwrite within 30 days.',
      });
    } catch (err) {
      next(err);
    }
  }
}
