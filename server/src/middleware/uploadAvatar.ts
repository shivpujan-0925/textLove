import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/appError.js';

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
    return cb(
      new AppError(
        'Invalid file type. Only JPEG, PNG, and WebP images are allowed.',
        400,
        'INVALID_IMAGE_FORMAT'
      )
    );
  }
  cb(null, true);
};

export const multerUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
}).single('avatar');

/**
 * Validates actual file magic bytes to prevent forged file extensions
 */
export const validateImageMagicBytes = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.file || !req.file.buffer) {
    return next(new AppError('No image file provided.', 400, 'MISSING_FILE'));
  }

  const buffer = req.file.buffer;
  if (buffer.length < 12) {
    return next(new AppError('Corrupted or invalid image file.', 400, 'INVALID_IMAGE_CONTENT'));
  }

  // 1. JPEG: FF D8 FF
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  // 3. WebP: 'RIFF' .... 'WEBP'
  const isWebp =
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';

  if (!isJpeg && !isPng && !isWebp) {
    return next(
      new AppError(
        'File contents do not match permitted image formats (JPEG, PNG, WebP).',
        400,
        'INVALID_IMAGE_CONTENT'
      )
    );
  }

  next();
};

/**
 * Handles multer file upload errors cleanly
 */
export const handleAvatarUpload = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  multerUpload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Image file size exceeds the 5MB limit.', 400, 'IMAGE_TOO_LARGE'));
      }
      return next(new AppError(err.message, 400, 'UPLOAD_ERROR'));
    }
    if (err) {
      return next(err);
    }
    validateImageMagicBytes(req, res, next);
  });
};
