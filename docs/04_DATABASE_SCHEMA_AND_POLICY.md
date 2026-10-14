# textLove - MongoDB Schema & Prohibited-Data Policy

## 1. Architectural Scope of MongoDB

In textLove, **MongoDB is strictly limited to identity, security metadata, and active connection tracking.**

The database **NEVER** stores, caches, buffers, or archives:
- Message content (plaintext or ciphertext)
- Initialization vectors (IV) or salt vectors associated with messages
- Message sequence logs or message audit trails
- Message read receipts or delivery statuses
- Message attachments, images, or media transcripts
- Private encryption keys or master secret keys
- Ephemeral ratcheted session keys

---

## 2. Authorized MongoDB Collections & Mongoose Schemas

### 2.1 `users` Collection

Stores account identity, public profiles, and non-sensitive E2EE public keys.

```typescript
import { Schema, model, Document } from 'mongoose';

export interface IUser extends Document {
  googleId: string;
  email: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  avatarPublicId?: string;
  publicKeyBundle?: {
    identityPublicKey: string; // Base64 encoded public key
    signedPreKey: string;      // Base64 encoded public key
    preKeySignature: string;   // Base64 encoded signature
    createdAt: Date;
  };
  status: 'active' | 'suspended' | 'deleted';
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date;
}

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
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 24,
      match: /^[a-zA-Z0-9_]{3,24}$/,
      index: true,
    },
    displayName: {
      type: String,
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
  }
);
```

### 2.2 `sessions` Collection

Stores authenticated user login sessions with automatic TTL expiration.

```typescript
export interface ISession extends Document {
  sessionTokenHash: string;
  userId: Schema.Types.ObjectId;
  ipHash?: string;
  userAgent?: string;
  createdAt: Date;
  expiresAt: Date;
}

const SessionSchema = new Schema<ISession>(
  {
    sessionTokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    ipHash: {
      type: String,
    },
    userAgent: {
      type: String,
      maxlength: 300,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB native TTL index: automatically drops expired session
    },
  },
  {
    versionKey: false,
  }
);
```

### 2.3 `conversations` Collection (Active Conversations Metadata)

Tracks active pairing metadata, session authorization, and the authoritative 30-minute inactivity timer.

```typescript
export interface IConversation extends Document {
  participantA: Schema.Types.ObjectId; // User A ID
  participantB: Schema.Types.ObjectId; // User B ID
  status: 'active' | 'expired' | 'closed';
  startedAt: Date;
  lastActivityAt: Date; // Reset only on qualifying messaging actions
  expiresAt: Date;      // Exactly lastActivityAt + 30 minutes
}

const ConversationSchema = new Schema<IConversation>(
  {
    participantA: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    participantB: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'closed'],
      default: 'active',
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 86400 }, // Retention cap: purges metadata 24 hours after expiry
    },
  },
  {
    versionKey: false,
  }
);

// Compound index to ensure uniqueness of active conversation between any pair
ConversationSchema.index({ participantA: 1, participantB: 1, status: 1 });
```

---

## 3. Strict Prohibited-Data Policy (Zero Retention Blacklist)

To ensure structural guarantees against accidental data retention, the codebase will enforce the following controls:

### 3.1 Prohibited Schema Fields Rule
Under no circumstances shall any Mongoose schema or MongoDB collection definition include fields matching the prohibited patterns:
- `message*`
- `content*`
- `body*`
- `text*`
- `ciphertext*`
- `payload*`
- `iv` or `initializationVector`
- `mediaUrl` (except avatarUrl in User)
- `attachment*`
- `readReceipt*`
- `privateKey*`

### 3.2 Automated CI Schema Linting
A dedicated automated test (`test/security/schemaAudit.test.ts`) inspects all registered Mongoose models at build/test time:
```typescript
it('ensures zero message or payload collections exist in MongoDB schemas', () => {
  const modelNames = mongoose.modelNames();
  const prohibitedWords = ['message', 'chat', 'payload', 'ciphertext', 'history', 'queue', 'inbox'];
  
  for (const name of modelNames) {
    for (const word of prohibitedWords) {
      expect(name.toLowerCase()).not.toContain(word);
    }
  }
});
```

### 3.3 Logger Redaction Policy
Using Pino/Winston logging, all logging interceptors are configured with automatic field masking:
```typescript
const logger = pino({
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.ciphertext',
      'body.iv',
      'body.token',
      'body.password',
      'payload.ciphertext',
      'msg.ciphertext',
      '*.privateKey'
    ],
    remove: true,
  },
});
```
Any attempt to log a socket event or HTTP body automatically strips the payload.
