import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { UserRepository } from '../src/repositories/user.repository.js';
import { SessionRepository } from '../src/repositories/session.repository.js';

describe('Google Authentication & Session Management', () => {
  const app = createApp();

  beforeEach(() => {
    UserRepository.clearInMemory();
    SessionRepository.clearInMemory();
  });

  it('GET /api/v1/auth/google/url returns authorization URL and sets state cookie', async () => {
    const res = await request(app).get('/api/v1/auth/google/url');

    expect(res.status).toBe(200);
    expect(res.body.authUrl).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(res.body.authUrl).toContain('code_challenge');
    expect(res.body.state).toBeDefined();

    // Verify state cookie is set with HttpOnly
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const stateCookie = cookies?.find((c: string) => c.includes('textlove_oauth_state'));
    expect(stateCookie).toBeDefined();
    expect(stateCookie).toContain('HttpOnly');
    expect(stateCookie).toContain('SameSite=Lax');
  });

  it('POST /api/v1/auth/google/callback fails with 403 when state is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/google/callback')
      .send({ idToken: 'mock_google_token_:sub1:alice%40example.com:Alice%20Smith' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('STATE_EXPIRED');
  });

  it('POST /api/v1/auth/google/callback fails with 403 when state mismatches', async () => {
    const res = await request(app)
      .post('/api/v1/auth/google/callback')
      .set('Cookie', [`textlove_oauth_state=${JSON.stringify({ state: 'server_state', codeVerifier: 'verifier' })}`])
      .send({
        idToken: 'mock_google_token_:sub1:alice%40example.com:Alice%20Smith',
        state: 'attacker_state_mismatch',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('STATE_MISMATCH');
  });

  it('completes successful OAuth login, generates unique username, and sets session cookie', async () => {
    // 1. Get auth URL to establish state
    const urlRes = await request(app).get('/api/v1/auth/google/url');
    const stateCookie = urlRes.headers['set-cookie']![0]!;
    const state = urlRes.body.state;

    // 2. Perform callback
    const callbackRes = await request(app)
      .post('/api/v1/auth/google/callback')
      .set('Cookie', [stateCookie])
      .send({
        idToken: 'mock_google_token_:sub_alice:alice%40example.com:Alice%20Wonderland',
        state,
      });

    expect(callbackRes.status).toBe(200);
    expect(callbackRes.body.success).toBe(true);
    expect(callbackRes.body.user.username).toMatch(/^[a-z0-9_]{3,24}$/);
    expect(callbackRes.body.user.displayName).toBe('Alice Wonderland');
    expect(callbackRes.body.csrfToken).toBeDefined();

    // Assert session cookie is set
    const setCookies = callbackRes.headers['set-cookie']!;
    const sessionCookie = setCookies.find((c: string) => c.includes('textlove_session'));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');
  });

  it('handles username collision safely on registration by generating unique variant', async () => {
    // Register first user named John Doe
    const u1Res = await request(app).get('/api/v1/auth/google/url');
    await request(app)
      .post('/api/v1/auth/google/callback')
      .set('Cookie', [u1Res.headers['set-cookie']![0]!])
      .send({
        idToken: 'mock_google_token_:sub_john1:john%40example.com:John%20Doe',
        state: u1Res.body.state,
      });

    // Register second user also named John Doe with different Google sub
    const u2Res = await request(app).get('/api/v1/auth/google/url');
    const callback2 = await request(app)
      .post('/api/v1/auth/google/callback')
      .set('Cookie', [u2Res.headers['set-cookie']![0]!])
      .send({
        idToken: 'mock_google_token_:sub_john2:john2%40example.com:John%20Doe',
        state: u2Res.body.state,
      });

    expect(callback2.status).toBe(200);
    expect(callback2.body.user.username).toMatch(/^john_doe_\d+/);
  });

  it('GET /api/v1/auth/me returns current session profile or 401 when unauthenticated', async () => {
    // Unauthenticated
    const unauth = await request(app).get('/api/v1/auth/me');
    expect(unauth.status).toBe(401);

    // Authenticate
    const urlRes = await request(app).get('/api/v1/auth/google/url');
    const authRes = await request(app)
      .post('/api/v1/auth/google/callback')
      .set('Cookie', [urlRes.headers['set-cookie']![0]!])
      .send({
        idToken: 'mock_google_token_:sub_me:me%40example.com:Me%20User',
        state: urlRes.body.state,
      });

    const sessionCookie = authRes.headers['set-cookie']!.find((c: string) => c.includes('textlove_session'))!;

    // Authenticated check
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [sessionCookie]);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.displayName).toBe('Me User');
    expect(meRes.body.csrfToken).toBeDefined();
  });

  it('POST /api/v1/auth/logout requires CSRF token, revokes session and clears cookie', async () => {
    // Authenticate
    const urlRes = await request(app).get('/api/v1/auth/google/url');
    const authRes = await request(app)
      .post('/api/v1/auth/google/callback')
      .set('Cookie', [urlRes.headers['set-cookie']![0]!])
      .send({
        idToken: 'mock_google_token_:sub_logout:logout%40example.com:Logout%20User',
        state: urlRes.body.state,
      });

    const sessionCookie = authRes.headers['set-cookie']!.find((c: string) => c.includes('textlove_session'))!;
    const csrfToken = authRes.body.csrfToken;

    // Attempt logout with invalid CSRF token
    const badCsrf = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', [sessionCookie])
      .set('X-CSRF-Token', 'invalid_csrf');
    expect(badCsrf.status).toBe(403);

    // Logout with valid CSRF token
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', [sessionCookie])
      .set('X-CSRF-Token', csrfToken);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // Verify session cookie is invalidated in subsequent requests
    const afterLogout = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [sessionCookie]);
    expect(afterLogout.status).toBe(401);
  });

  it('verifies Google authorization URL contains prompt=select_account and response_type=code', async () => {
    const res = await request(app).get('/api/v1/auth/google/url');

    expect(res.status).toBe(200);
    const authUrl = decodeURIComponent(res.body.authUrl);
    expect(authUrl).toContain('prompt=select_account');
    expect(authUrl).toContain('response_type=code');
    expect(authUrl).toContain('code_challenge_method=S256');
    expect(res.body.isMock).toBeDefined();
  });

  it('exchanges PKCE authorization code for session successfully', async () => {
    // 1. Initiate OAuth
    const urlRes = await request(app).get('/api/v1/auth/google/url');
    const stateCookie = urlRes.headers['set-cookie']![0]!;
    const state = urlRes.body.state;

    // 2. Exchange authorization code
    const callbackRes = await request(app)
      .post('/api/v1/auth/google/callback')
      .set('Cookie', [stateCookie])
      .send({
        code: 'mock_code_:sub_pkce_user:pkce%40example.com:PKCE%20User',
        state,
      });

    expect(callbackRes.status).toBe(200);
    expect(callbackRes.body.success).toBe(true);
    expect(callbackRes.body.user.displayName).toBe('PKCE User');
    expect(callbackRes.body.user.id).toBeDefined();
    expect(callbackRes.body.csrfToken).toBeDefined();
  });

  it('proves two different Google identities resolve to two distinct application accounts and sessions', async () => {
    // 1. Authenticate Identity A (Alice)
    const urlResA = await request(app).get('/api/v1/auth/google/url');
    const callbackResA = await request(app)
      .post('/api/v1/auth/google/callback')
      .set('Cookie', [urlResA.headers['set-cookie']![0]!])
      .send({
        idToken: 'mock_google_token_:sub_google_alice_999:alice.real%40gmail.com:Alice%20Smith',
        state: urlResA.body.state,
      });

    expect(callbackResA.status).toBe(200);
    const userA = callbackResA.body.user;
    const sessionCookieA = callbackResA.headers['set-cookie']!.find((c: string) => c.includes('textlove_session'))!;

    // 2. Authenticate Identity B (Bob)
    const urlResB = await request(app).get('/api/v1/auth/google/url');
    const callbackResB = await request(app)
      .post('/api/v1/auth/google/callback')
      .set('Cookie', [urlResB.headers['set-cookie']![0]!])
      .send({
        idToken: 'mock_google_token_:sub_google_bob_888:bob.real%40gmail.com:Bob%20Jones',
        state: urlResB.body.state,
      });

    expect(callbackResB.status).toBe(200);
    const userB = callbackResB.body.user;
    const sessionCookieB = callbackResB.headers['set-cookie']!.find((c: string) => c.includes('textlove_session'))!;

    // 3. Verify they resolved to completely different accounts
    expect(userA.id).not.toBe(userB.id);
    expect(userA.username).not.toBe(userB.username);
    expect(userA.displayName).toBe('Alice Smith');
    expect(userB.displayName).toBe('Bob Jones');
    expect(sessionCookieA).not.toBe(sessionCookieB);

    // 4. Verify querying /auth/me with session A returns User A
    const meA = await request(app).get('/api/v1/auth/me').set('Cookie', [sessionCookieA]);
    expect(meA.status).toBe(200);
    expect(meA.body.user.id).toBe(userA.id);
    expect(meA.body.user.displayName).toBe('Alice Smith');

    // 5. Verify querying /auth/me with session B returns User B
    const meB = await request(app).get('/api/v1/auth/me').set('Cookie', [sessionCookieB]);
    expect(meB.status).toBe(200);
    expect(meB.body.user.id).toBe(userB.id);
    expect(meB.body.user.displayName).toBe('Bob Jones');

    // 6. Logout Identity A and verify Identity B remains unaffected and authenticated
    await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', [sessionCookieA])
      .set('X-CSRF-Token', callbackResA.body.csrfToken);

    // Identity A is now unauthenticated
    const afterLogoutA = await request(app).get('/api/v1/auth/me').set('Cookie', [sessionCookieA]);
    expect(afterLogoutA.status).toBe(401);

    // Identity B's session remains active and valid
    const afterLogoutB = await request(app).get('/api/v1/auth/me').set('Cookie', [sessionCookieB]);
    expect(afterLogoutB.status).toBe(200);
    expect(afterLogoutB.body.user.id).toBe(userB.id);
  });

  it('successfully reactivates and signs in an account that was previously deleted', async () => {
    // 1. Initial login for user
    const urlRes1 = await request(app).get('/api/v1/auth/google/url');
    const stateCookie1 = urlRes1.headers['set-cookie']![0]!;
    const state1 = urlRes1.body.state;

    const idToken = 'mock_google_token_:reactivate_user_101:reactivate%40example.com:Reactivated%20User';
    const callback1 = await request(app)
      .post('/api/v1/auth/google/callback')
      .set('Cookie', [stateCookie1])
      .send({ idToken, state: state1 });

    expect(callback1.status).toBe(200);
    const initialUser = callback1.body.user;
    const initialSessionCookie = callback1.headers['set-cookie']!.find((c: string) => c.includes('textlove_session'))!;

    // 2. Delete the user account
    await UserRepository.deleteAccount(initialUser.id);

    // Old session should now be rejected as deleted
    const meAfterDelete = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [initialSessionCookie]);
    expect([401, 403]).toContain(meAfterDelete.status);

    // 3. User signs in again using the same Google account
    const urlRes2 = await request(app).get('/api/v1/auth/google/url');
    const stateCookie2 = urlRes2.headers['set-cookie']![0]!;
    const state2 = urlRes2.body.state;
    const callback2 = await request(app)
      .post('/api/v1/auth/google/callback')
      .set('Cookie', [stateCookie2])
      .send({ idToken, state: state2 });

    expect(callback2.status).toBe(200);
    expect(callback2.body.user.username).not.toContain('_deleted_');
    expect(callback2.body.user.displayName).toBe('Reactivated User');

    // 4. New session must be valid and authenticated
    const newSessionCookie = callback2.headers['set-cookie']!.find((c: string) => c.includes('textlove_session'))!;
    const meAfterReactivate = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [newSessionCookie]);
    expect(meAfterReactivate.status).toBe(200);
    expect(meAfterReactivate.body.user.displayName).toBe('Reactivated User');
  });
});
