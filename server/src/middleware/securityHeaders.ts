import helmet from 'helmet';
import { env } from '../config/env.js';

export const securityHeaders = helmet({
  contentSecurityPolicy: env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc: [
        "'self'",
        'data:',
        'blob:',
        'https://res.cloudinary.com',
        'https://lh3.googleusercontent.com',
        'https://images.unsplash.com',
      ],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  } : false, // In local development, avoid interfering with Vite HMR WebSocket
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: env.NODE_ENV === 'production' ? {
    maxAge: 63072000,
    includeSubDomains: true,
    preload: true,
  } : false,
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
});
