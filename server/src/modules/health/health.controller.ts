import { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { isDatabaseConnected } from '../../config/db.js';
import { connectionRegistry } from '../../socket/connectionRegistry.js';

const startTime = Date.now();

export const getHealth = (_req: Request, res: Response): void => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const memoryUsage = process.memoryUsage();
  const dbConnected = isDatabaseConnected();
  const connStats = connectionRegistry.getStats();

  res.status(200).json({
    status: 'healthy',
    service: 'textLove Backend API',
    version: '0.1.0',
    environment: env.NODE_ENV,
    uptimeSeconds,
    timestamp: new Date().toISOString(),
    metrics: {
      databaseConnected: dbConnected,
      activeConnections: connStats.totalSockets,
      activeUsers: connStats.activeUsers,
    },
    system: {
      nodeVersion: process.version,
      memory: {
        heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rssMB: Math.round(memoryUsage.rss / 1024 / 1024),
      },
    },
    invariants: {
      zeroMessageRetention: true,
      liveOnlyMessaging: true,
      e2eeMandatory: true,
      authoritativeInactivityExpiryMinutes: 30,
    },
  });
};

