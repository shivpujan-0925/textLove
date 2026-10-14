# textLove - Session & Authentication Design

## 1. Authentication Strategy

textLove uses **Google OAuth 2.0 / OpenID Connect** via a secure, maintained server-side authorization code flow enhanced with **PKCE (Proof Key for Code Exchange)**.

### Why Google OAuth 2.0 with PKCE?
- Eliminates password storage, hashing vulnerabilities (e.g. bcrypt/Argon2 tuning concerns), and credential stuffing risks.
- PKCE protects against authorization code interception attacks even if redirect URIs are targeted on mobile/PWA environments.
- Provides cryptographic verification of Google ID tokens via Google's rotating public keys (`jwks_uri`).

---

## 2. Authentication Flow

```
[Browser Client]               [textLove Express Server]          [Google OAuth Platform]
       |                                   |                                  |
       |--- 1. Click "Sign in" ----------->|                                  |
       |    GET /api/v1/auth/google/url    |                                  |
       |<-- 2. Returns Auth URL + State ---|                                  |
       |    (code_challenge stored)        |                                  |
       |                                   |                                  |
       |--- 3. Redirect to Google Consent ----------------------------------->|
       |                                                                      |
       |<-- 4. User grants consent; Google redirects back with 'code' --------|
       |                                                                      |
       |--- 5. POST /api/v1/auth/google/callback ---------------------------->|
       |       { code, state, codeVerifier }                                  |
       |                                   |--- 6. Exchange code + verifier ->|
       |                                   |<-- 7. Returns ID Token + Profile-|
       |                                   |                                  |
       |                                   |--- 8. Verify JWT signature       |
       |                                   |--- 9. Find/Create User in DB     |
       |                                   |--- 10. Generate Session ID       |
       |                                   |--- 11. Store in MongoDB Sessions |
       |<-- 12. Set-Cookie: textlove_session (HttpOnly, Secure, SameSite) ----|
       |        200 OK User Profile        |                                  |
```

---

## 3. Cookie Architecture & Attributes

The session identifier is stored in a hardened HTTP cookie with the following security attributes:

```http
Set-Cookie: textlove_session=<32-byte-hex-token>; 
  Path=/; 
  HttpOnly; 
  Secure; 
  SameSite=Strict; 
  Max-Age=604800; 
  Priority=High
```

### Attribute Justification:
- **`HttpOnly`**: Blocks all JavaScript access via `document.cookie`, preventing session exfiltration via XSS.
- **`Secure`**: Enforces transmission strictly over encrypted TLS connections (HTTPS/WSS).
- **`SameSite=Strict`**: Blocks cookie dispatch on any third-party cross-site request, completely mitigating Cross-Site Request Forgery (CSRF).
- **`Max-Age=604800`**: 7-day expiration matching the MongoDB session TTL.

---

## 4. Session Storage & Lifecycle in MongoDB

Sessions are stored in the `sessions` collection with native TTL expiration:

```typescript
{
  "_id": ObjectId("64f..."),
  "sessionTokenHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", // SHA-256 of cookie token
  "userId": ObjectId("64f1a2b3c4d5e6f7a8b9c0d1"),
  "ipHash": "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...",
  "createdAt": ISODate("2026-10-13T14:48:00Z"),
  "expiresAt": ISODate("2026-10-20T14:48:00Z") // 7 days TTL
}
```

### Storage Security Guarantees:
- **Token Hashing at Rest**: The raw session token given to the client in the cookie is hashed using SHA-256 before saving to the database. Even in the event of a raw database read compromise, an attacker cannot construct valid session cookies.
- **Automatic TTL Index**: MongoDB index `{ "expiresAt": 1 }, { expireAfterSeconds: 0 }` automatically purges expired sessions.

---

## 5. Socket.IO Handshake Authentication

When a client initiates a WebSocket connection via Socket.IO, authentication occurs before accepting the socket:

```typescript
// Socket.IO Server Middleware
io.use(async (socket, next) => {
  try {
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) {
      return next(new Error('AUTHENTICATION_REQUIRED'));
    }

    const cookies = parseCookies(cookieHeader);
    const sessionToken = cookies['textlove_session'];
    if (!sessionToken) {
      return next(new Error('INVALID_SESSION'));
    }

    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const session = await SessionModel.findOne({
      sessionTokenHash: tokenHash,
      expiresAt: { $gt: new Date() },
    }).populate('userId');

    if (!session || !session.userId) {
      return next(new Error('SESSION_EXPIRED'));
    }

    // Attach authenticated user identity to socket instance
    socket.data.user = session.userId;
    socket.data.sessionId = session._id.toString();
    next();
  } catch (err) {
    next(new Error('INTERNAL_AUTH_ERROR'));
  }
});
```

---

## 6. Rate Limiting & Anti-Abuse Defenses

1. **Authentication Rate Limits**:
   - `GET /api/v1/auth/google/url`: Maximum 10 requests per minute per IP.
   - `POST /api/v1/auth/google/callback`: Maximum 5 requests per minute per IP.
2. **Session Revocation**:
   - Explicit `POST /api/v1/auth/logout` deletes the session from MongoDB and issues a clear cookie response.
   - User account deletion (`DELETE /api/v1/users/me`) deletes all sessions associated with that `userId` across all devices.
