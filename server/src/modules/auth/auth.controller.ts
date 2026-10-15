import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { GoogleAuthService } from '../../services/googleAuth.service.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/appError.js';
import crypto from 'crypto';

const isProduction = env.NODE_ENV === 'production';

export class AuthController {
  /**
   * Generates Google OAuth authorization URL and sets temporary state cookie
   */
  public static getGoogleAuthUrl(_req: Request, res: Response, next: NextFunction): void {
    try {
      const { authUrl, state, codeVerifier } = AuthService.generateOAuthParams();

      // Store state and codeVerifier in short-lived HttpOnly cookie (10 min)
      const oauthPayload = JSON.stringify({ state, codeVerifier });
      res.cookie('textlove_oauth_state', oauthPayload, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax', // 'none' required for cross-domain Vercel <-> Render
        maxAge: 10 * 60 * 1000,
        path: '/',
      });

      res.status(200).json({
        authUrl,
        state,
        codeVerifier,
        isMock: GoogleAuthService.isMockEnvironment(),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Handles OAuth callback: validates state, exchanges code or verifies ID token, establishes session
   */
  public static async handleGoogleCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { idToken: providedToken, code, state: clientState, codeVerifier: clientVerifier } = req.body;

      if (!providedToken && !code) {
        throw new AppError('Google identity token or authorization code is required.', 400, 'MISSING_TOKEN');
      }

      let codeVerifierToUse: string | undefined = clientVerifier;

      const stateCookie = req.cookies?.['textlove_oauth_state'];
      if (!stateCookie && !clientState) {
        throw new AppError('OAuth session expired or state missing. Please try again.', 403, 'STATE_EXPIRED');
      }

      // Validate OAuth state if cookie exists
      if (stateCookie) {
        try {
          const parsedState = JSON.parse(stateCookie);
          if (clientState && parsedState.state && clientState !== parsedState.state) {
            throw new AppError('OAuth state mismatch. Potential CSRF detected.', 403, 'STATE_MISMATCH');
          }
          if (!codeVerifierToUse) {
            codeVerifierToUse = parsedState.codeVerifier;
          }
        } catch (e: unknown) {
          if ((e as AppError).errorCode === 'STATE_MISMATCH') throw e;
          throw new AppError('Malformed OAuth state.', 403, 'INVALID_OAUTH_STATE');
        }
      }

      if (!providedToken && code && !codeVerifierToUse) {
        throw new AppError('OAuth session expired or state missing. Please try again.', 403, 'STATE_EXPIRED');
      }

      // Retrieve or exchange ID token
      let idToken = providedToken;
      if (!idToken && code && codeVerifierToUse) {
        idToken = await GoogleAuthService.exchangeCodeForTokens(code, codeVerifierToUse);
      }

      // Hash client IP for session binding
      const rawIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
      const ipHash = rawIp ? crypto.createHash('sha256').update(rawIp).digest('hex') : undefined;
      const userAgent = req.headers['user-agent'];

      const result = await AuthService.authenticateGoogleUser(idToken, ipHash, userAgent);

      // Clear the temporary state cookie
      res.clearCookie('textlove_oauth_state', {
        path: '/',
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
      });

      // Set the hardened session cookie (7 days)
      res.cookie('textlove_session', result.rawToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      res.status(200).json({
        success: true,
        user: result.user,
        token: result.rawToken,
        csrfToken: result.csrfToken,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Returns current authenticated user and CSRF token
   */
  public static getMe(req: Request, res: Response): void {
    if (!req.user || !req.session) {
      throw new AppError('Not authenticated.', 401, 'UNAUTHORIZED');
    }

    res.status(200).json({
      success: true,
      user: {
        id: req.user._id.toString(),
        username: req.user.username,
        displayName: req.user.displayName,
        avatarUrl: req.user.avatarUrl,
        hasRegisteredKeys: Boolean(req.user.publicKeyBundle?.identityPublicKey),
        lastUsernameChangedAt: req.user.lastUsernameChangedAt,
        lastAvatarChangedAt: req.user.lastAvatarChangedAt,
      },
      csrfToken: req.session.csrfToken,
    });
  }

  /**
   * Logs out user, invalidates session in database, and clears cookie
   */
  public static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.sessionToken) {
        await AuthService.logout(req.sessionToken);
      }

      res.clearCookie('textlove_session', {
        path: '/',
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
      });

      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (err) {
      next(err);
    }
  }
}
