import { Schema, model, Document, Types } from 'mongoose';

/**
 * Conversation Metadata Retention and Cleanup Policy:
 * 
 * 1. STRICT ZERO-MESSAGE RETENTION:
 *    - This model stores ONLY non-message authorization and lifecycle metadata.
 *    - Absolutely NO message content, plaintext, ciphertext, initialization vectors (IVs),
 *      ephemeral public keys, or message sequence history is ever written to MongoDB.
 *    - Strict schema validation (`strict: 'throw'`) rejects any unexpected fields.
 *
 * 2. 30-MINUTE INACTIVITY EXPIRATION:
 *    - `expiresAt` represents the server-authoritative expiration timestamp.
 *    - Each qualified deliberate authenticated message (`msg:send`) updates `lastActivityAt`
 *      and resets `expiresAt = currentTime + 30 minutes`.
 *    - Non-qualifying events (Websocket pings/heartbeats, presence polling, typing indicators,
 *      window focus, reconnection attempts) NEVER reset this timer.
 *    - Operations against expired or closed conversations are strictly rejected (`CONVERSATION_EXPIRED`, `CONVERSATION_CLOSED`).
 *
 * 3. 24-HOUR METADATA TTL PURGE:
 *    - MongoDB TTL index on `expiresAt` with `expires: 86400` automatically deletes the minimal
 *      metadata record 24 hours after expiration, ensuring database pruning without orphaned records.
 *
 * 4. DELETE-FOR-BOTH WORKFLOW:
 *    - Either participant can permanently close and delete the conversation at any time.
 *    - The conversation status transitions to `closed`, all in-memory client state is purged,
 *      and subsequent attempts to send messages or revive the session are rejected.
 */
export interface IConversation extends Document {
  _id: Types.ObjectId;
  canonicalId: string;
  participantA: Types.ObjectId;
  participantB: Types.ObjectId;
  participantAUsername: string;
  participantBUsername: string;
  status: 'active' | 'expired' | 'closed';
  startedAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  closedAt?: Date;
  closedBy?: string;
}

const ConversationSchema = new Schema<IConversation>(
  {
    canonicalId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
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
    participantAUsername: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    participantBUsername: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
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
    closedAt: {
      type: Date,
    },
    closedBy: {
      type: String,
      trim: true,
    },
  },
  {
    versionKey: false,
    strict: 'throw', // Prohibit any unrecognized fields
  }
);

// Compound index for pair lookup
ConversationSchema.index({ participantA: 1, participantB: 1, status: 1 });
ConversationSchema.index({ participantAUsername: 1, participantBUsername: 1 });

export const ConversationModel = model<IConversation>('Conversation', ConversationSchema);
