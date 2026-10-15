import { UserModel, IUser } from '../models/User.model.js';
import { isDatabaseConnected } from '../config/db.js';
import { AppError } from '../utils/appError.js';
import mongoose from 'mongoose';

export interface PublicUserProfile {
  username: string;
  displayName: string;
  avatarUrl?: string;
  status: 'active' | 'suspended' | 'deleted';
  lastActiveAt: Date;
  hasRegisteredKeys: boolean;
}

// In-Memory fallback store for tests and offline development
const inMemUsers = new Map<string, IUser>();

export class UserRepository {
  public static async findByGoogleId(googleId: string): Promise<IUser | null> {
    if (isDatabaseConnected()) {
      return UserModel.findOne({ googleId });
    }
    for (const user of inMemUsers.values()) {
      if (user.googleId === googleId) return user;
    }
    return null;
  }

  public static async findByUsername(username: string): Promise<IUser | null> {
    const normalized = username.toLowerCase().trim();
    if (isDatabaseConnected()) {
      return UserModel.findOne({ username: normalized });
    }
    for (const user of inMemUsers.values()) {
      if (user.username.toLowerCase() === normalized) return user;
    }
    return null;
  }

  public static async findById(id: string): Promise<IUser | null> {
    if (isDatabaseConnected()) {
      return UserModel.findById(id);
    }
    return inMemUsers.get(id) || null;
  }

  public static async create(data: {
    googleId: string;
    email: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  }): Promise<IUser> {
    const normalizedUsername = data.username.toLowerCase().trim();

    if (isDatabaseConnected()) {
      try {
        const user = new UserModel({
          ...data,
          username: normalizedUsername,
        });
        return await user.save();
      } catch (err: unknown) {
        // Handle MongoDB E11000 duplicate key error
        if ((err as { code?: number }).code === 11000) {
          throw new AppError('A user with this username or Google account already exists.', 409, 'DUPLICATE_RESOURCE');
        }
        throw err;
      }
    }

    // In-memory fallback validation
    for (const existing of inMemUsers.values()) {
      if (existing.googleId === data.googleId) {
        throw new AppError('Google account is already registered.', 409, 'DUPLICATE_GOOGLE_ID');
      }
      if (existing.username.toLowerCase() === normalizedUsername) {
        throw new AppError('Username is already taken.', 409, 'DUPLICATE_USERNAME');
      }
    }

    const id = new mongoose.Types.ObjectId();
    const newUser = new UserModel({
      _id: id,
      ...data,
      username: normalizedUsername,
      status: 'active',
      lastActiveAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    inMemUsers.set(id.toString(), newUser);
    return newUser;
  }

  public static async touchLastActive(userId: string): Promise<void> {
    if (isDatabaseConnected()) {
      await UserModel.findByIdAndUpdate(userId, { lastActiveAt: new Date() });
    } else {
      const user = inMemUsers.get(userId);
      if (user) {
        user.lastActiveAt = new Date();
      }
    }
  }

  public static async updateUsername(userId: string, newUsername: string): Promise<IUser> {
    const normalized = newUsername.toLowerCase().trim();

    // Check availability first
    const existing = await this.findByUsername(normalized);
    if (existing && existing._id.toString() !== userId) {
      throw new AppError('Username is already taken.', 409, 'USERNAME_TAKEN');
    }

    if (isDatabaseConnected()) {
      try {
        const updated = await UserModel.findByIdAndUpdate(
          userId,
          { username: normalized, updatedAt: new Date() },
          { new: true, runValidators: true }
        );
        if (!updated) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
        return updated;
      } catch (err: unknown) {
        if ((err as { code?: number }).code === 11000) {
          throw new AppError('Username is already taken.', 409, 'USERNAME_TAKEN');
        }
        throw err;
      }
    }

    const user = inMemUsers.get(userId);
    if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    user.username = normalized;
    user.updatedAt = new Date();
    return user;
  }

  public static async isUsernameAvailable(username: string): Promise<boolean> {
    const user = await this.findByUsername(username);
    return user === null;
  }

  public static async getPublicProfile(username: string): Promise<PublicUserProfile | null> {
    const user = await this.findByUsername(username);
    if (!user || user.status === 'deleted') return null;

    // Strips all private metadata (email, googleId, internal identifiers, sessions)
    return {
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      status: user.status,
      lastActiveAt: user.lastActiveAt,
      hasRegisteredKeys: Boolean(user.publicKeyBundle?.identityPublicKey),
    };
  }

  public static async updateProfile(
    userId: string,
    data: { displayName?: string; avatarUrl?: string; avatarPublicId?: string }
  ): Promise<IUser> {
    if (isDatabaseConnected()) {
      const updated = await UserModel.findByIdAndUpdate(
        userId,
        { ...data, updatedAt: new Date() },
        { new: true, runValidators: true }
      );
      if (!updated) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
      return updated;
    }

    const user = inMemUsers.get(userId);
    if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    if (data.displayName !== undefined) user.displayName = data.displayName;
    if (data.avatarUrl !== undefined) user.avatarUrl = data.avatarUrl;
    if (data.avatarPublicId !== undefined) user.avatarPublicId = data.avatarPublicId;
    user.updatedAt = new Date();
    return user;
  }

  public static async updatePublicKeyBundle(
    userId: string,
    bundle: {
      identityPublicKey: string;
      signedPreKey: string;
      preKeySignature: string;
      createdAt: Date;
    }
  ): Promise<IUser> {
    if (isDatabaseConnected()) {
      const updated = await UserModel.findByIdAndUpdate(
        userId,
        { publicKeyBundle: bundle, updatedAt: new Date() },
        { new: true, runValidators: true }
      );
      if (!updated) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
      return updated;
    }

    const user = inMemUsers.get(userId);
    if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    user.publicKeyBundle = bundle;
    user.updatedAt = new Date();
    return user;
  }

  public static async deleteAccount(userId: string): Promise<IUser> {
    const deletedUsername = `_deleted_${Date.now()}_${userId.slice(-4)}`;

    if (isDatabaseConnected()) {
      const updated = await UserModel.findByIdAndUpdate(
        userId,
        {
          status: 'deleted',
          username: deletedUsername,
          avatarUrl: undefined,
          avatarPublicId: undefined,
          publicKeyBundle: undefined,
          updatedAt: new Date(),
        },
        { new: true }
      );
      if (!updated) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
      return updated;
    }

    const user = inMemUsers.get(userId);
    if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    user.status = 'deleted';
    user.username = deletedUsername;
    user.avatarUrl = undefined;
    user.avatarPublicId = undefined;
    user.publicKeyBundle = undefined;
    user.updatedAt = new Date();
    return user;
  }

  public static async reactivateAccount(
    userId: string,
    data: { username: string; displayName: string; avatarUrl?: string }
  ): Promise<IUser> {
    const normalizedUsername = data.username.toLowerCase().trim();

    if (isDatabaseConnected()) {
      const updated = await UserModel.findByIdAndUpdate(
        userId,
        {
          status: 'active',
          username: normalizedUsername,
          displayName: data.displayName,
          avatarUrl: data.avatarUrl,
          avatarPublicId: undefined,
          publicKeyBundle: null,
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        },
        { new: true }
      );
      if (!updated) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
      return updated;
    }

    const user = inMemUsers.get(userId);
    if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    user.status = 'active';
    user.username = normalizedUsername;
    user.displayName = data.displayName;
    user.avatarUrl = data.avatarUrl;
    user.avatarPublicId = undefined;
    user.publicKeyBundle = undefined;
    user.lastActiveAt = new Date();
    user.updatedAt = new Date();
    return user;
  }

  public static async searchUsers(query: string, limit = 15): Promise<PublicUserProfile[]> {
    const clean = query.trim().toLowerCase();
    if (!clean) return [];

    if (isDatabaseConnected()) {
      const users = await UserModel.find({
        status: 'active',
        $or: [
          { username: { $regex: `^${clean}`, $options: 'i' } },
          { displayName: { $regex: clean, $options: 'i' } },
        ],
      })
        .limit(limit)
        .select('username displayName avatarUrl status lastActiveAt publicKeyBundle');

      return users.map((u) => ({
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        status: u.status,
        lastActiveAt: u.lastActiveAt,
        hasRegisteredKeys: Boolean(u.publicKeyBundle?.identityPublicKey),
      }));
    }

    const results: PublicUserProfile[] = [];
    for (const u of inMemUsers.values()) {
      if (
        u.status === 'active' &&
        (u.username.toLowerCase().includes(clean) || u.displayName.toLowerCase().includes(clean))
      ) {
        results.push({
          username: u.username,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl,
          status: u.status,
          lastActiveAt: u.lastActiveAt,
          hasRegisteredKeys: Boolean(u.publicKeyBundle?.identityPublicKey),
        });
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  // Clear in-memory state for testing
  public static clearInMemory(): void {
    inMemUsers.clear();
  }
}
