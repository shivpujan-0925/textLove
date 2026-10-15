import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { UserRepository } from '../src/repositories/user.repository.js';
import { SessionRepository } from '../src/repositories/session.repository.js';

describe('Usernames & Public User Profiles', () => {
  const app = createApp();

  beforeEach(() => {
    UserRepository.clearInMemory();
    SessionRepository.clearInMemory();
  });

  // Helper to quickly register a user and get session cookie + CSRF token
  const registerUser = async (name: string, email: string) => {
    const urlRes = await request(app).get('/api/v1/auth/google/url');
    const authRes = await request(app)
      .post('/api/v1/auth/google/callback')
      .set('Cookie', [urlRes.headers['set-cookie']![0]!])
      .send({
        idToken: `mock_google_token_:sub_${name}:${encodeURIComponent(email)}:${encodeURIComponent(name)}`,
        state: urlRes.body.state,
      });

    const cookie = authRes.headers['set-cookie']!.find((c: string) => c.includes('textlove_session'))!;
    return {
      user: authRes.body.user,
      cookie,
      csrfToken: authRes.body.csrfToken,
    };
  };

  it('GET /api/v1/users/check-username/:username validates availability, reserved names, and length', async () => {
    // 1. Unused valid username
    const res1 = await request(app).get('/api/v1/users/check-username/available_user');
    expect(res1.status).toBe(200);
    expect(res1.body.available).toBe(true);

    // 2. Reserved username
    const res2 = await request(app).get('/api/v1/users/check-username/admin');
    expect(res2.status).toBe(200);
    expect(res2.body.available).toBe(false);
    expect(res2.body.reason).toContain('reserved');

    // 3. Invalid characters
    const res3 = await request(app).get('/api/v1/users/check-username/bad-name!');
    expect(res3.status).toBe(200);
    expect(res3.body.available).toBe(false);

    // 4. Too short
    const res4 = await request(app).get('/api/v1/users/check-username/ab');
    expect(res4.status).toBe(200);
    expect(res4.body.available).toBe(false);
  });

  it('GET /api/v1/users/lookup/:username returns public profile and NEVER exposes email or private data', async () => {
    const { user } = await registerUser('Alice Security', 'alice.private@example.com');

    const res = await request(app).get(`/api/v1/users/lookup/${user.username}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.username).toBe(user.username);
    expect(res.body.user.displayName).toBe('Alice Security');

    // STRICT PRIVACY ASSERTIONS: Email and internal IDs must never be exposed
    expect(res.body.user.email).toBeUndefined();
    expect(res.body.user.googleId).toBeUndefined();
    expect(res.body.user.sessions).toBeUndefined();
  });

  it('GET /api/v1/users/lookup/:username returns 404 for nonexistent user', async () => {
    const res = await request(app).get('/api/v1/users/lookup/nonexistent_ghost_99');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('PATCH /api/v1/users/username allows authorized user to change username with CSRF validation', async () => {
    const { cookie, csrfToken, user } = await registerUser('Bob Tester', 'bob@example.com');

    // 1. Without CSRF token -> 403 Forbidden
    const noCsrf = await request(app)
      .patch('/api/v1/users/username')
      .set('Cookie', [cookie])
      .send({ newUsername: 'bob_new_handle' });
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe('INVALID_CSRF_TOKEN');

    // 2. With valid CSRF token -> Success
    const changeRes = await request(app)
      .patch('/api/v1/users/username')
      .set('Cookie', [cookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ newUsername: 'bob_new_handle' });

    expect(changeRes.status).toBe(200);
    expect(changeRes.body.user.username).toBe('bob_new_handle');

    // Verify lookup reflects new username
    const lookup = await request(app).get('/api/v1/users/lookup/bob_new_handle');
    expect(lookup.status).toBe(200);

    // Old username is now free
    const oldCheck = await request(app).get(`/api/v1/users/check-username/${user.username}`);
    expect(oldCheck.body.available).toBe(true);
  });

  it('PATCH /api/v1/users/username rejects duplicate username with 409 Conflict', async () => {
    const u1 = await registerUser('Alice One', 'alice1@example.com');
    const u2 = await registerUser('Bob Two', 'bob2@example.com');

    // Bob tries to steal Alice's username
    const res = await request(app)
      .patch('/api/v1/users/username')
      .set('Cookie', [u2.cookie])
      .set('X-CSRF-Token', u2.csrfToken)
      .send({ newUsername: u1.user.username });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USERNAME_TAKEN');
  });

  it('PATCH /api/v1/users/username enforces 7-day cooldown on subsequent changes with 429', async () => {
    const { cookie, csrfToken } = await registerUser('Cooldown User', 'cooldown@example.com');

    // First change succeeds
    const firstRes = await request(app)
      .patch('/api/v1/users/username')
      .set('Cookie', [cookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ newUsername: 'cooldown_handle1' });
    expect(firstRes.status).toBe(200);

    // Second change immediately fails with 429 USERNAME_COOLDOWN
    const secondRes = await request(app)
      .patch('/api/v1/users/username')
      .set('Cookie', [cookie])
      .set('X-CSRF-Token', csrfToken)
      .send({ newUsername: 'cooldown_handle2' });
    expect(secondRes.status).toBe(429);
    expect(secondRes.body.error.code).toBe('USERNAME_COOLDOWN');
    expect(secondRes.body.error.message).toContain('7 days');
  });
});
