import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './modules/health/health.router.js';
import { authRouter } from './modules/auth/auth.router.js';
import { userRouter } from './modules/users/user.router.js';
import { keysRouter } from './modules/keys/keys.router.js';
import { messagesRouter } from './modules/messages/messages.router.js';
import { conversationRouter } from './modules/conversations/conversation.router.js';

export const createApp = (): Express => {
  const app = express();

  // 1. Trust proxy in production if behind reverse proxy
  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // 2. Security HTTP Headers
  app.use(securityHeaders);

  // 3. Explicit CORS configuration
  const allowedOrigins = env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, or server-to-server)
        if (!origin) {
          return callback(null, true);
        }

        const cleanOrigin = origin.replace(/\/+$/, '');

        // 1. Direct or wildcard match
        if (allowedOrigins.includes(cleanOrigin) || allowedOrigins.includes('*')) {
          return callback(null, true);
        }

        // 2. Allow any .vercel.app deployment if a vercel domain or preview is in allowedOrigins
        const allowsVercel = allowedOrigins.some((o) => o.includes('.vercel.app'));
        if (allowsVercel && cleanOrigin.endsWith('.vercel.app')) {
          return callback(null, true);
        }

        // 3. Allow localhost in development
        if (cleanOrigin.includes('localhost') || cleanOrigin.includes('127.0.0.1')) {
          return callback(null, true);
        }

        logger.warn({ origin: cleanOrigin, allowed: allowedOrigins }, 'Blocked by CORS policy');
        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
    })
  );

  // 4. Request parsing with strict payload bounds
  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: true, limit: '64kb' }));
  app.use(cookieParser());

  // 5. Lightweight request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (req.path !== '/api/health' && req.path !== '/api/v1/health') {
        logger.info(
          {
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs: duration,
          },
          'HTTP request handled'
        );
      }
    });
    next();
  });

  // 6. API Routes
  app.use('/api/v1/health', healthRouter);
  app.use('/api/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', userRouter);
  app.use('/api/v1/keys', keysRouter);
  app.use('/api/v1/messages', messagesRouter);
  app.use('/api/v1/conversations', conversationRouter);

  // 7. Catch-all for unhandled routes
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Cannot ${req.method} ${req.path}`,
      },
    });
  });

  // 8. Centralized error handling
  app.use(errorHandler);

  return app;
};
