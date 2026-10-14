import { Schema, model, Document, Model, Types } from 'mongoose';

export interface IUser extends Document {
  _id: Types.ObjectId;
  googleId: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  avatarPublicId?: string;
  publicKeyBundle?: {
    identityPublicKey: string;
    signedPreKey: string;
    preKeySignature: string;
    createdAt: Date;
  };
  status: 'active' | 'suspended' | 'deleted';
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date;
}

export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

const UserSchema = new Schema<IUser>(
  {
    googleId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      select: false, // Hidden by default from queries to protect privacy
    },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 24,
      match: [USERNAME_REGEX, 'Username must be 3-24 characters containing only alphanumeric characters and underscores.'],
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    avatarUrl: {
      type: String,
      trim: true,
    },
    avatarPublicId: {
      type: String,
      trim: true,
    },
    publicKeyBundle: {
      identityPublicKey: { type: String },
      signedPreKey: { type: String },
      preKeySignature: { type: String },
      createdAt: { type: Date },
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'deleted'],
      default: 'active',
      index: true,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: 'throw', // Enforces that any injected field not in schema throws a validation error
  }
);

// STRICT PROHIBITED DATA ENFORCEMENT HOOK
// Blocks any message content, ciphertext, or private keys from being injected into User
UserSchema.pre('validate', function (next) {
  const prohibitedKeys = [
    'message',
    'messages',
    'content',
    'body',
    'ciphertext',
    'privateKey',
    'secretKey',
    'masterKey',
    'chatHistory',
  ];

  const obj = this.toObject();
  for (const key of Object.keys(obj)) {
    for (const prohibited of prohibitedKeys) {
      if (key.toLowerCase().includes(prohibited.toLowerCase())) {
        return next(
          new Error(`SECURITY_VIOLATION: Field '${key}' violates textLove zero message retention policy.`)
        );
      }
    }
  }
  next();
});

export const UserModel: Model<IUser> = model<IUser>('User', UserSchema);
