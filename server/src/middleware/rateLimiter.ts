import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { Request, Response } from 'express';

export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute per specification
  max: env.NODE_ENV === 'production' ? 30 : 1000, // 1000 in dev/test, 30/min in production
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many authentication attempts. Please slow down and try again shortly.',
    },
  },
  handler: (_req: Request, res: Response, _next, options) => {
    res.status(429).json(options.message);
  },
});

export const usernameLookupRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: env.NODE_ENV === 'test' ? 1000 : 45, // 45 lookups per minute in prod/dev
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'LOOKUP_RATE_LIMITED',
      message: 'Too many username lookups. Please slow down.',
    },
  },
  handler: (_req: Request, res: Response, _next, options) => {
    res.status(429).json(options.message);
  },
});
