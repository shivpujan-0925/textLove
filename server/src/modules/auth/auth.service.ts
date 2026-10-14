import crypto from 'crypto';
import { GoogleAuthService, VerifiedGoogleUser } from '../../services/googleAuth.service.js';
import { UserRepository } from '../../repositories/user.repository.js';
import { SessionRepository } from '../../repositories/session.repository.js';
import { UsernameHelper } from '../../utils/usernameGenerator.js';

export interface AuthSessionResponse {
  rawToken: string;
  csrfToken: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    hasRegisteredKeys: boolean;
  };
}

export class AuthService {
  /**
   * Generates authorization URL, state parameter, and PKCE challenge
   */
  public static generateOAuthParams(): {
    authUrl: string;
    state: string;
    codeVerifier: string;
  } {
    const state = crypto.randomBytes(24).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    const authUrl = GoogleAuthService.getAuthorizationUrl(state, codeChallenge);

    return { authUrl, state, codeVerifier };
  }

  /**
   * Completes Google authentication: verifies identity, creates or finds user,
   * generates collision-safe username, and rotates session.
   */
  public static async authenticateGoogleUser(
    idToken: string,
    ipHash?: string,
    userAgent?: string
  ): Promise<AuthSessionResponse> {
    const verifiedGoogleUser: VerifiedGoogleUser = await GoogleAuthService.verifyToken(idToken);

    // 1. Look up user by Google identity subject
    let user = await UserRepository.findByGoogleId(verifiedGoogleUser.googleId);

    if (!user) {
      // 2. Generate unique collision-resistant username for new user
      const candidateBase = verifiedGoogleUser.name || verifiedGoogleUser.email.split('@')[0] || 'user';
      const uniqueUsername = await UsernameHelper.generateUniqueUsername(candidateBase);

      user = await UserRepository.create({
        googleId: verifiedGoogleUser.googleId,
        email: verifiedGoogleUser.email,
        username: uniqueUsername,
        displayName: verifiedGoogleUser.name,
        avatarUrl: verifiedGoogleUser.picture,
      });
    } else {
      // Update last active cleanly
      user.lastActiveAt = new Date();
      await UserRepository.touchLastActive(user._id.toString());
    }

    // 3. Issue new cryptographically secure session
    const { rawToken, csrfToken } = await SessionRepository.createSession(
      user._id.toString(),
      ipHash,
      userAgent
    );

    return {
      rawToken,
      csrfToken,
      user: {
        id: user._id.toString(),
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        hasRegisteredKeys: Boolean(user.publicKeyBundle?.identityPublicKey),
      },
    };
  }

  public static async logout(rawToken: string): Promise<void> {
    await SessionRepository.revokeSession(rawToken);
  }
}
