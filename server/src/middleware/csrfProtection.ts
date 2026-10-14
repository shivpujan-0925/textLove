import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/appError.js';

import crypto from 'crypto';

export const csrfProtection = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  // Safe HTTP read methods are exempt
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // If no session exists on request, let authentication middleware handle authorization
  if (!req.session) {
    return next();
  }

  const clientCsrfToken = req.headers['x-csrf-token'];

  if (!clientCsrfToken || typeof clientCsrfToken !== 'string') {
    return next(
      new AppError(
        'Invalid or missing CSRF token. Request blocked for your security.',
        403,
        'INVALID_CSRF_TOKEN'
      )
    );
  }

  const expectedBuffer = Buffer.from(req.session.csrfToken);
  const actualBuffer = Buffer.from(clientCsrfToken);

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return next(
      new AppError(
        'Invalid or missing CSRF token. Request blocked for your security.',
        403,
        'INVALID_CSRF_TOKEN'
      )
    );
  }

  next();
};
