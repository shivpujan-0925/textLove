import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { UserModel } from '../src/models/User.model.js';
import { SessionModel } from '../src/models/Session.model.js';

describe('Prohibited-Data Policy & Schema Audit', () => {
  it('strictly prohibits message, chat, or ciphertext collections in MongoDB models', () => {
    // Explicitly load models to ensure registration
    expect(UserModel).toBeDefined();
    expect(SessionModel).toBeDefined();

    const registeredModels = mongoose.modelNames();
    const prohibitedKeywords = [
      'message',
      'chat',
      'payload',
      'ciphertext',
      'history',
      'queue',
      'inbox',
      'retention',
      'conversationhistory',
    ];

    for (const modelName of registeredModels) {
      for (const keyword of prohibitedKeywords) {
        expect(
          modelName.toLowerCase().includes(keyword),
          `Model '${modelName}' violates textLove zero-message-retention policy!`
        ).toBe(false);
      }
    }
  });

  it('strictly prohibits message or private key fields in User model schema', () => {
    const userSchemaPaths = Object.keys(UserModel.schema.paths);
    const prohibitedFields = [
      'message',
      'messages',
      'content',
      'body',
      'ciphertext',
      'privatekey',
      'secretkey',
      'readreceipt',
    ];

    for (const path of userSchemaPaths) {
      for (const prohibited of prohibitedFields) {
        expect(
          path.toLowerCase().includes(prohibited),
          `User schema field '${path}' violates textLove zero-message-retention policy!`
        ).toBe(false);
      }
    }
  });

  it('rejects saving User if prohibited message fields are injected', () => {
    expect(() => {
      new UserModel({
        googleId: 'g_123',
        email: 'test@example.com',
        username: 'validuser',
        displayName: 'Valid User',
        ciphertext: 'injected_stolen_data', // Prohibited field
      });
    }).toThrow(/Field `ciphertext` is not in schema/);
  });
});
