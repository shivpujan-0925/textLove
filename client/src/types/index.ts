export type Theme = 'light' | 'dark' | 'system';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  isOnline: boolean;
  hasRegisteredKeys?: boolean;
  lastUsernameChangedAt?: string;
  lastAvatarChangedAt?: string;
}

export interface PublicUser {
  username: string;
  displayName: string;
  avatarUrl?: string;
  isOnline?: boolean;
}

export type ConversationStatus = 'active' | 'expired' | 'closed' | 'pending';

export interface Conversation {
  id: string;
  peer: User;
  status: ConversationStatus;
  startedAt: string;
  lastActivityAt: string;
  expiresAt: string;
  unreadCount?: number;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export type MessageDeliveryStatus =
  | 'PENDING_RELAY'
  | 'RELAYED_TO_NETWORK'
  | 'DELIVERED_TO_PEER'
  | 'DECRYPTED_BY_PEER'
  | 'FAILED_OFFLINE'
  | 'DELIVERY_UNCERTAIN';

export interface EphemeralMessage {
  id: string;
  conversationId: string;
  senderUsername: string;
  text: string;
  timestamp: number;
  status: MessageDeliveryStatus;
  isMe: boolean;
  seq?: number;
  failureReason?: string;
}
