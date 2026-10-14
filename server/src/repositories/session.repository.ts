import crypto from 'crypto';
import mongoose from 'mongoose';
import { SessionModel, ISession } from '../models/Session.model.js';
import { UserRepository } from './user.repository.js';
import { IUser } from '../models/User.model.js';
import { isDatabaseConnected } from '../config/db.js';

export interface ValidSessionResult {
  session: ISession;
  user: IUser;
}

// In-Memory fallback store for tests and offline development
const inMemSessions = new Map<string, ISession>();

export class SessionRepository {
  public static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  public static async createSession(
    userId: string,
    ipHash?: string,
    userAgent?: string
  ): Promise<{ rawToken: string; csrfToken: string; session: ISession }> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const csrfToken = crypto.randomBytes(24).toString('hex');
    const sessionTokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7-day TTL

    const sessionData = {
      sessionTokenHash,
      userId: new mongoose.Types.ObjectId(userId),
      csrfToken,
      ipHash,
      userAgent: userAgent ? userAgent.slice(0, 300) : undefined,
      createdAt: new Date(),
      expiresAt,
    };

    if (isDatabaseConnected()) {
      const session = new SessionModel(sessionData);
      const saved = await session.save();
      return { rawToken, csrfToken, session: saved };
    }

    const id = new mongoose.Types.ObjectId();
    const session = new SessionModel({
      _id: id,
      ...sessionData,
    });
    inMemSessions.set(sessionTokenHash, session);
    return { rawToken, csrfToken, session };
  }

  public static async findValidSession(rawToken: string): Promise<ValidSessionResult | null> {
    const sessionTokenHash = this.hashToken(rawToken);

    let session: ISession | null = null;
    if (isDatabaseConnected()) {
      session = await SessionModel.findOne({
        sessionTokenHash,
        expiresAt: { $gt: new Date() },
      });
    } else {
      const found = inMemSessions.get(sessionTokenHash);
      if (found && found.expiresAt > new Date()) {
        session = found;
      } else if (found) {
        inMemSessions.delete(sessionTokenHash); // Clean up expired
      }
    }

    if (!session) return null;

    const user = await UserRepository.findById(session.userId.toString());
    if (!user || user.status === 'deleted' || user.status === 'suspended') {
      return null;
    }

    return { session, user };
  }

  public static async revokeSession(rawToken: string): Promise<void> {
    const sessionTokenHash = this.hashToken(rawToken);
    if (isDatabaseConnected()) {
      await SessionModel.deleteOne({ sessionTokenHash });
    } else {
      inMemSessions.delete(sessionTokenHash);
    }
  }

  public static async revokeAllUserSessions(userId: string): Promise<void> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    if (isDatabaseConnected()) {
      await SessionModel.deleteMany({ userId: userObjId });
    } else {
      for (const [hash, sess] of inMemSessions.entries()) {
        if (sess.userId.toString() === userId) {
          inMemSessions.delete(hash);
        }
      }
    }
  }

  public static clearInMemory(): void {
    inMemSessions.clear();
  }
}
