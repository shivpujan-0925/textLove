import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';
import { AppError } from '../utils/appError.js';

export const validateRequest = (schema: {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.body && typeof req.body === 'object') {
        const rawKeys = Object.keys(req.body).map((k) => k.toLowerCase());

        // 1. Invariant: Private keys must never reach the server
        for (const k of rawKeys) {
          if (k.includes('priv') || k.includes('secret')) {
            throw new AppError(
              'Private key material must NEVER be transmitted to the server.',
              400,
              'PRIVATE_KEY_PROHIBITED'
            );
          }
        }

        // 2. Invariant: Plaintext message bodies are strictly prohibited
        const fullPath = req.originalUrl || req.baseUrl || req.path;
        if (fullPath.includes('/messages')) {
          const prohibitedPlaintext = ['text', 'plaintext', 'message', 'content', 'msg'];
          for (const k of prohibitedPlaintext) {
            if (k in req.body) {
              throw new AppError(
                'Plaintext message payloads are strictly prohibited. textLove operates on opaque E2EE ciphertext only.',
                400,
                'PLAINTEXT_PROHIBITED'
              );
            }
          }
        }
      }

      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      if (schema.query) {
        req.query = await schema.query.parseAsync(req.query);
      }
      if (schema.params) {
        req.params = await schema.params.parseAsync(req.params);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};
