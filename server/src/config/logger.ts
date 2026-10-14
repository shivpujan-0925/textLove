import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'development' ? 'debug' : 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["set-cookie"]',
      'res.headers["set-cookie"]',
      'body.password',
      'body.token',
      'body.secret',
      'body.sessionSecret',
      'body.ciphertext',
      'body.iv',
      'body.salt',
      'body.privateKey',
      '*.privateKey',
      '*.password',
      '*.token',
      '*.secret',
      '*.ciphertext',
    ],
    censor: '[REDACTED]',
  },
});
