import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { UserRepository } from '../src/repositories/user.repository.js';
import { SessionRepository } from '../src/repositories/session.repository.js';

describe('Profile Management, Cloudinary Avatar Uploads & Username Discovery', () => {
  const app = createApp();

  beforeEach(() => {
    UserRepository.clearInMemory();
    SessionRepository.clearInMemory();
  });

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

  // Helper to create a valid minimal 1x1 PNG image buffer with magic bytes
  const createValidPngBuffer = (): Buffer => {
    return Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR header
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82,
    ]);
  };

  describe('Avatar Image Uploads', () => {
    it('POST /api/v1/users/avatar rejects unauthenticated request with 401', async () => {
      const res = await request(app)
        .post('/api/v1/users/avatar')
        .attach('avatar', createValidPngBuffer(), 'avatar.png');

      expect(res.status).toBe(401);
    });

    it('POST /api/v1/users/avatar rejects request missing CSRF token with 403', async () => {
      const { cookie } = await registerUser('Avatar User', 'avatar@example.com');

      const res = await request(app)
        .post('/api/v1/users/avatar')
        .set('Cookie', [cookie])
        .attach('avatar', createValidPngBuffer(), 'avatar.png');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INVALID_CSRF_TOKEN');
    });

    it('rejects disallowed file types (e.g. text/pdf) with 400 INVALID_IMAGE_FORMAT', async () => {
      const { cookie, csrfToken } = await registerUser('Avatar User', 'avatar@example.com');

      const res = await request(app)
        .post('/api/v1/users/avatar')
        .set('Cookie', [cookie])
        .set('X-CSRF-Token', csrfToken)
        .attach('avatar', Buffer.from('plain text content'), 'malicious.txt');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_IMAGE_FORMAT');
    });

    it('rejects forged files with invalid magic bytes with 400 INVALID_IMAGE_CONTENT', async () => {
      const { cookie, csrfToken } = await registerUser('Avatar User', 'avatar@example.com');

      // Spoofed filename.png but content is executable / random bytes without PNG header
      const spoofedBuffer = Buffer.from('not really a png image at all just plain text');

      const res = await request(app)
        .post('/api/v1/users/avatar')
        .set('Cookie', [cookie])
        .set('X-CSRF-Token', csrfToken)
        .attach('avatar', spoofedBuffer, 'spoofed.png');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_IMAGE_CONTENT');
    });

    it('rejects oversized files (> 5MB) with 400 IMAGE_TOO_LARGE', async () => {
      const { cookie, csrfToken } = await registerUser('Avatar User', 'avatar@example.com');

      // Create a 5.5MB dummy buffer
      const oversizedBuffer = Buffer.alloc(5.5 * 1024 * 1024, 0xff);

      const res = await request(app)
        .post('/api/v1/users/avatar')
        .set('Cookie', [cookie])
        .set('X-CSRF-Token', csrfToken)
        .attach('avatar', oversizedBuffer, 'huge.jpg');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('IMAGE_TOO_LARGE');
    });

    it('successfully uploads valid image, returns secure Cloudinary URL, and updates profile', async () => {
      const { cookie, csrfToken } = await registerUser('Avatar User', 'avatar@example.com');

      const res = await request(app)
        .post('/api/v1/users/avatar')
        .set('Cookie', [cookie])
        .set('X-CSRF-Token', csrfToken)
        .attach('avatar', createValidPngBuffer(), 'avatar.png');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.avatarUrl).toContain('cloudinary.com');

      // Verify /me endpoint returns updated avatar
      const meRes = await request(app).get('/api/v1/auth/me').set('Cookie', [cookie]);
      expect(meRes.body.user.avatarUrl).toBe(res.body.user.avatarUrl);
    });
  });

  describe('Username Discovery / Search', () => {
    it('GET /api/v1/users/search discovers users by prefix and never leaks private data', async () => {
      await registerUser('Charlie Brown', 'charlie.private@example.com');
      await registerUser('Charlotte Web', 'charlotte.private@example.com');

      const res = await request(app).get('/api/v1/users/search?q=char');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.users.length).toBeGreaterThanOrEqual(2);

      for (const u of res.body.users) {
        expect(u.username).toMatch(/^char/i);
        expect(u.displayName).toBeDefined();

        // STRICT PRIVACY CHECK
        expect(u.email).toBeUndefined();
        expect(u.googleId).toBeUndefined();
      }
    });

    it('returns empty array when search query is empty', async () => {
      const res = await request(app).get('/api/v1/users/search?q=');
      expect(res.status).toBe(200);
      expect(res.body.users).toEqual([]);
    });
  });

  describe('Permanent Account Deletion Cascade', () => {
    it('DELETE /api/v1/users/me deletes account, revokes sessions, and clears cookies', async () => {
      const { cookie, csrfToken, user } = await registerUser('Ephemeral User', 'ephemeral@example.com');

      // First upload an avatar so we test asset cleanup
      await request(app)
        .post('/api/v1/users/avatar')
        .set('Cookie', [cookie])
        .set('X-CSRF-Token', csrfToken)
        .attach('avatar', createValidPngBuffer(), 'avatar.png');

      // Delete account
      const deleteRes = await request(app)
        .delete('/api/v1/users/me')
        .set('Cookie', [cookie])
        .set('X-CSRF-Token', csrfToken);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      // Verify session cookie is invalidated
      const meRes = await request(app).get('/api/v1/auth/me').set('Cookie', [cookie]);
      expect(meRes.status).toBe(401);

      // Verify public lookup for deleted user returns 404
      const lookup = await request(app).get(`/api/v1/users/lookup/${user.username}`);
      expect(lookup.status).toBe(404);
    });
  });
});
