import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/appError.js';

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

  if (!clientCsrfToken || clientCsrfToken !== req.session.csrfToken) {
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
