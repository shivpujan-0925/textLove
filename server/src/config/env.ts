import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from current directory or server directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/textlove'),
  SESSION_SECRET: z.string().min(16).default('dev_session_secret_at_least_32_chars_long_for_security'),
  GOOGLE_CLIENT_ID: z.string().optional().default('mock_google_client_id_for_dev'),
  GOOGLE_CLIENT_SECRET: z.string().optional().default('mock_google_client_secret_for_dev'),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default('mock_cloud'),
  CLOUDINARY_API_KEY: z.string().optional().default('mock_key'),
  CLOUDINARY_API_SECRET: z.string().optional().default('mock_secret'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  // Output detailed configuration failure
  console.error('❌ Invalid environment configuration:', JSON.stringify(parsedEnv.error.format(), null, 2));
  throw new Error('Environment configuration validation failed');
}

export const env = parsedEnv.data;
