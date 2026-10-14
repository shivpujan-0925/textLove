import crypto from 'crypto';
import { USERNAME_REGEX } from '../models/User.model.js';
import { UserRepository } from '../repositories/user.repository.js';
import { AppError } from './appError.js';

const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'textlove',
  'support',
  'system',
  'official',
  'root',
  'security',
  'moderator',
  'help',
  'null',
  'undefined',
]);

export class UsernameHelper {
  public static isValidFormat(username: string): boolean {
    return USERNAME_REGEX.test(username);
  }

  public static isReserved(username: string): boolean {
    return RESERVED_USERNAMES.has(username.toLowerCase());
  }

  /**
   * Sanitizes a base string into acceptable username characters
   */
  public static sanitizeBase(input: string): string {
    const cleaned = input
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    if (cleaned.length < 3) {
      return `user_${crypto.randomBytes(3).toString('hex')}`;
    }
    return cleaned.slice(0, 18);
  }

  /**
   * Generates a unique, collision-resistant username for new registrations
   */
  public static async generateUniqueUsername(baseInput: string): Promise<string> {
    const base = this.sanitizeBase(baseInput);

    // 1. Try base directly if not reserved
    if (!this.isReserved(base)) {
      const isAvailable = await UserRepository.isUsernameAvailable(base);
      if (isAvailable) {
        return base;
      }
    }

    // 2. Retry loop with random suffixes (up to 10 attempts)
    for (let attempt = 1; attempt <= 10; attempt++) {
      const suffix = crypto.randomInt(100, 9999).toString();
      const candidate = `${base.slice(0, 24 - suffix.length - 1)}_${suffix}`;

      if (!this.isReserved(candidate)) {
        const isAvailable = await UserRepository.isUsernameAvailable(candidate);
        if (isAvailable) {
          return candidate;
        }
      }
    }

    // 3. Fallback to high-entropy hex
    return `u_${crypto.randomBytes(6).toString('hex')}`;
  }

  /**
   * Validates a candidate username according to textLove username rules
   */
  public static validateOrThrow(username: string): void {
    if (!username || typeof username !== 'string') {
      throw new AppError('Username is required.', 400, 'INVALID_USERNAME');
    }

    const trimmed = username.trim().toLowerCase();

    if (trimmed.length < 3 || trimmed.length > 24) {
      throw new AppError('Username must be between 3 and 24 characters long.', 400, 'INVALID_USERNAME_LENGTH');
    }

    if (!this.isValidFormat(trimmed)) {
      throw new AppError(
        'Username can only contain alphanumeric characters and underscores.',
        400,
        'INVALID_USERNAME_FORMAT'
      );
    }

    if (this.isReserved(trimmed)) {
      throw new AppError('This username is reserved and cannot be claimed.', 400, 'RESERVED_USERNAME');
    }
  }
}
