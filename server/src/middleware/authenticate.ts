/* eslint-disable @typescript-eslint/no-namespace */
import { Request, Response, NextFunction } from 'express';
import { SessionRepository } from '../repositories/session.repository.js';
import { IUser } from '../models/User.model.js';
import { ISession } from '../models/Session.model.js';
import { AppError } from '../utils/appError.js';

// Extend Express Request declaration
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      session?: ISession;
      sessionToken?: string;
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const token = req.cookies?.['textlove_session'] || bearerToken;

  if (!token) {
    return next(new AppError('Authentication required. Please sign in.', 401, 'UNAUTHORIZED'));
  }

  try {
    const sessionResult = await SessionRepository.findValidSession(token);

    if (!sessionResult) {
      // Session expired or revoked; clear the cookie
      res.clearCookie('textlove_session', { path: '/' });
      return next(new AppError('Session expired. Please sign in again.', 401, 'SESSION_EXPIRED'));
    }

    if (sessionResult.user.status === 'suspended') {
      return next(new AppError('This account has been suspended.', 403, 'ACCOUNT_SUSPENDED'));
    }

    if (sessionResult.user.status === 'deleted') {
      return next(new AppError('This account no longer exists.', 403, 'ACCOUNT_DELETED'));
    }

    req.user = sessionResult.user;
    req.session = sessionResult.session;
    req.sessionToken = token;
    next();
  } catch (err) {
    next(err);
  }
};
