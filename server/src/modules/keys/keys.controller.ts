import { Request, Response, NextFunction } from 'express';
import { ed25519 } from '@noble/curves/ed25519.js';
import { UserRepository } from '../../repositories/user.repository.js';
import { AppError } from '../../utils/appError.js';
import { logger } from '../../config/logger.js';

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2 !== 0) {
    throw new AppError('Invalid hex key length.', 400, 'INVALID_HEX');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

export class KeysController {
  /**
   * Register or update user's E2EE public key bundle
   * Cryptographically verifies Ed25519 signature before publishing.
   * Strictly prohibits private keys.
   */
  public static async registerKeys(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError('Authentication required to register keys.', 401, 'UNAUTHORIZED');
      }

      const body = req.body || {};

      // 1. Strict security check: reject if private keys are present anywhere in payload
      const bodyKeys = Object.keys(body).map((k) => k.toLowerCase());
      for (const k of bodyKeys) {
        if (k.includes('priv') || k.includes('secret')) {
          logger.warn(
            { userId: req.user._id, field: k },
            'CRITICAL SECURITY ALERT: Private key material detected in registerKeys payload! Rejected.'
          );
          throw new AppError(
            'Private key material must NEVER be transmitted to the server.',
            400,
            'PRIVATE_KEY_PROHIBITED'
          );
        }
      }

      const { identityPublicKey, signedPreKey, preKeySignature } = body;

      if (!identityPublicKey || !signedPreKey || !preKeySignature) {
        throw new AppError(
          'Missing required key bundle parameters (identityPublicKey, signedPreKey, preKeySignature).',
          400,
          'INVALID_KEY_BUNDLE'
        );
      }

      // 2. Cryptographic signature verification
      try {
        const idPubBytes = hexToBytes(identityPublicKey);
        const prePubBytes = hexToBytes(signedPreKey);
        const sigBytes = hexToBytes(preKeySignature);

        if (idPubBytes.length !== 32 || prePubBytes.length !== 32 || sigBytes.length !== 64) {
          throw new AppError(
            'Invalid cryptographic key lengths: Ed25519 public key (32 bytes), X25519 prekey (32 bytes), signature (64 bytes).',
            400,
            'INVALID_KEY_LENGTH'
          );
        }

        const isVerified = ed25519.verify(sigBytes, prePubBytes, idPubBytes);
        if (!isVerified) {
          throw new AppError(
            'Pre-key cryptographic signature verification failed.',
            400,
            'INVALID_PREKEY_SIGNATURE'
          );
        }
      } catch (err: unknown) {
        if (err instanceof AppError) throw err;
        throw new AppError('Cryptographic key verification failed.', 400, 'VERIFICATION_ERROR');
      }

      // 3. Store verified public bundle in user repository
      const registeredAt = new Date();
      await UserRepository.updatePublicKeyBundle(req.user._id.toString(), {
        identityPublicKey,
        signedPreKey,
        preKeySignature,
        createdAt: registeredAt,
      });

      logger.info(
        { userId: req.user._id, username: req.user.username },
        'E2EE public key bundle registered successfully.'
      );

      res.status(200).json({
        success: true,
        message: 'E2EE public key bundle registered successfully.',
        registeredAt: registeredAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Retrieve public key bundle for a target peer username
   * Strictly public information only.
   */
  public static async getPeerPublicKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username } = req.params;
      if (!username) {
        throw new AppError('Username parameter is required.', 400, 'MISSING_USERNAME');
      }

      const user = await UserRepository.findByUsername(username);
      if (!user || user.status === 'deleted') {
        throw new AppError(`User '@${username}' not found.`, 404, 'USER_NOT_FOUND');
      }

      if (!user.publicKeyBundle?.identityPublicKey) {
        throw new AppError(
          `User '@${username}' has not yet registered an E2EE public key bundle on this device.`,
          404,
          'KEYS_NOT_REGISTERED'
        );
      }

      res.status(200).json({
        success: true,
        username: user.username,
        publicKeyBundle: {
          identityPublicKey: user.publicKeyBundle.identityPublicKey,
          signedPreKey: user.publicKeyBundle.signedPreKey,
          preKeySignature: user.publicKeyBundle.preKeySignature,
          createdAt: user.publicKeyBundle.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
