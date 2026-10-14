import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/appError.js';
import crypto from 'crypto';

// Configure Cloudinary credentials
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export class CloudinaryService {
  private static isMockMode(): boolean {
    return (
      env.NODE_ENV === 'test' ||
      !env.CLOUDINARY_API_KEY ||
      env.CLOUDINARY_API_KEY.startsWith('mock_') ||
      env.CLOUDINARY_CLOUD_NAME.startsWith('mock_')
    );
  }

  /**
   * Uploads an avatar image buffer with safe face-centered square cropping
   */
  public static async uploadAvatar(
    fileBuffer: Buffer,
    userId: string
  ): Promise<{ avatarUrl: string; avatarPublicId: string }> {
    const unpredictableId = `textlove_avatars/${userId}_${crypto.randomUUID()}`;

    // Test or mock environment fallback
    if (this.isMockMode()) {
      return {
        avatarUrl: `https://res.cloudinary.com/textlove/image/upload/v1/mock_avatars/${userId}_${crypto.randomUUID()}.webp`,
        avatarPublicId: unpredictableId,
      };
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: unpredictableId,
          folder: 'textlove_avatars',
          overwrite: false,
          resource_type: 'image',
          allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
          transformation: [
            {
              width: 400,
              height: 400,
              crop: 'fill',
              gravity: 'face',
              quality: 'auto:good',
              fetch_format: 'webp',
            },
          ],
        },
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            logger.error({ error }, 'Cloudinary upload failed');
            return reject(new AppError('Failed to upload image to media storage.', 502, 'MEDIA_UPLOAD_FAILED'));
          }

          resolve({
            avatarUrl: result.secure_url,
            avatarPublicId: result.public_id,
          });
        }
      );

      uploadStream.end(fileBuffer);
    });
  }

  /**
   * Deletes a Cloudinary asset when user deletes account or updates avatar
   */
  public static async deleteAvatar(publicId?: string): Promise<void> {
    if (!publicId || this.isMockMode()) {
      return;
    }

    try {
      await cloudinary.uploader.destroy(publicId, { invalidate: true });
      logger.info({ publicId }, 'Cloudinary avatar asset destroyed');
    } catch (err: unknown) {
      // Log error but do not break account deletion cascade
      logger.warn({ err: (err as Error).message, publicId }, 'Failed to delete Cloudinary asset');
    }
  }
}
