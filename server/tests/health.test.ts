import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Health Check Endpoint', () => {
  const app = createApp();

  it('GET /api/v1/health returns 200 with service status and invariants', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.service).toBe('textLove Backend API');
    expect(res.body.invariants).toBeDefined();
    expect(res.body.invariants.zeroMessageRetention).toBe(true);
    expect(res.body.invariants.liveOnlyMessaging).toBe(true);
    expect(res.body.invariants.authoritativeInactivityExpiryMinutes).toBe(30);
  });

  it('GET /api/health also returns 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  it('GET /unknown-route returns 404 with structured JSON error', async () => {
    const res = await request(app).get('/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
