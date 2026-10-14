import { Schema, model, Document, Model, Types } from 'mongoose';

export interface ISession extends Document {
  _id: Types.ObjectId;
  sessionTokenHash: string;
  userId: Types.ObjectId;
  csrfToken: string;
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
    csrfToken: {
      type: String,
      required: true,
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
      index: { expires: 0 }, // Native MongoDB TTL index: automatically deletes expired sessions
    },
  },
  {
    versionKey: false,
  }
);

export const SessionModel: Model<ISession> = model<ISession>('Session', SessionSchema);
