import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

mongoose.set('bufferCommands', false);

let isConnected = false;

export const connectDatabase = async (): Promise<boolean> => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return true;
  }

  try {
    // Attempt connection with 3-second server selection timeout
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
    });

    isConnected = true;
    logger.info({ uri: env.MONGODB_URI.replace(/\/\/.*@/, '//***@') }, 'Connected to MongoDB');
    return true;
  } catch (error) {
    logger.warn(
      { err: (error as Error).message },
      'MongoDB connection failed. Operating in in-memory repository mode for local development/testing.'
    );
    isConnected = false;
    return false;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('Disconnected from MongoDB');
  }
};

export const isDatabaseConnected = (): boolean => {
  return isConnected && mongoose.connection.readyState === 1;
};
