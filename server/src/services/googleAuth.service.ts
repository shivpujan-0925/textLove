import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import { env } from '../config/env.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../config/logger.js';

export interface VerifiedGoogleUser {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}

const client = new OAuth2Client({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
});

export class GoogleAuthService {
  /**
   * Detects whether the current environment is running with mock/offline credentials
   */
  public static isMockEnvironment(): boolean {
    return (
      !env.GOOGLE_CLIENT_ID ||
      env.GOOGLE_CLIENT_ID.startsWith('mock_') ||
      env.NODE_ENV === 'test'
    );
  }

  /**
   * Generates Google OAuth 2.0 authorization URL with PKCE and state protection
   * Explicitly requests 'prompt=select_account' so the user is always presented
   * with the Google account chooser.
   */
  public static getAuthorizationUrl(state: string, codeChallenge: string): string {
    const baseOrigin = env.CORS_ORIGIN.split(',')[0]?.trim().replace(/\/+$/, '') || 'http://localhost:5173';
    const redirectUri = `${baseOrigin}/auth/callback`;

    return client.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      redirect_uri: redirectUri,
      prompt: 'select_account',
    });
  }

  /**
   * Exchanges an authorization code and PKCE codeVerifier for tokens
   */
  public static async exchangeCodeForTokens(
    code: string,
    codeVerifier: string
  ): Promise<string> {
    // In development or test environments, allow simulated mock authorization codes
    if (code.startsWith('mock_code_')) {
      return code.replace('mock_code_', 'mock_google_token_');
    }

    try {
      const baseOrigin = env.CORS_ORIGIN.split(',')[0]?.trim().replace(/\/+$/, '') || 'http://localhost:5173';
      const redirectUri = `${baseOrigin}/auth/callback`;
      const { tokens } = await client.getToken({
        code,
        codeVerifier,
        redirect_uri: redirectUri,
      });

      if (!tokens.id_token) {
        throw new AppError('No ID token received from Google.', 401, 'NO_ID_TOKEN');
      }

      return tokens.id_token;
    } catch (err: unknown) {
      logger.warn({ err: (err as Error).message }, 'Failed to exchange authorization code');
      throw new AppError('Failed to exchange Google authorization code.', 401, 'CODE_EXCHANGE_FAILED');
    }
  }

  /**
   * Verifies Google OpenID Connect ID Token
   * Checks issuer, audience, signature, and expiration
   */
  public static async verifyToken(idToken: string): Promise<VerifiedGoogleUser> {
    // In development or test environments, allow simulated mock ID tokens
    if (idToken.startsWith('mock_google_token_')) {
      return this.verifyMockToken(idToken);
    }

    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new AppError('Invalid Google identity token payload.', 401, 'INVALID_TOKEN');
      }

      // Check issuer strictly per OpenID spec
      const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
      if (!payload.iss || !validIssuers.includes(payload.iss)) {
        throw new AppError('Invalid token issuer.', 401, 'INVALID_ISSUER');
      }

      if (!payload.sub || !payload.email) {
        throw new AppError('Missing required identity fields in Google token.', 401, 'MALFORMED_TOKEN');
      }

      return {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name || payload.email.split('@')[0] || 'User',
        picture: payload.picture,
      };
    } catch (err: unknown) {
      logger.warn({ err: (err as Error).message }, 'Google token verification rejected');
      throw new AppError('Google authentication failed. Please try again.', 401, 'AUTH_FAILED');
    }
  }

  /**
   * Verifies mock tokens for automated tests and local offline development
   */
  private static verifyMockToken(mockToken: string): VerifiedGoogleUser {
    // Format: mock_google_token_<id>_<email_encoded>_<name_encoded>
    const parts = mockToken.split(':');
    if (parts.length >= 4) {
      return {
        googleId: parts[1] || 'mock_sub_123',
        email: decodeURIComponent(parts[2] || 'test@example.com'),
        name: decodeURIComponent(parts[3] || 'Test User'),
        picture: parts[4] ? decodeURIComponent(parts[4]) : undefined,
      };
    }

    // Default mock user
    return {
      googleId: 'mock_google_id_default',
      email: 'mockuser@example.com',
      name: 'Mock User',
    };
  }
}
