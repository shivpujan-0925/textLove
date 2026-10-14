import { Server } from 'socket.io';
import { logger } from '../config/logger.js';

export interface UserConnectionInfo {
  userId: string;
  username: string;
  connectedAt: Date;
  lastPingAt: Date;
}

export class ConnectionRegistry {
  private userToSockets = new Map<string, Set<string>>(); // lowercase username -> Set<socketId>
  private socketToUser = new Map<string, { userId: string; username: string }>(); // socketId -> user info
  private presenceSubscribers = new Map<string, Set<string>>(); // target lowercase username -> Set<subscriberSocketId>
  private io?: Server;

  public setServer(io: Server): void {
    this.io = io;
  }

  /**
   * Register a new socket connection for a user.
   * If this is the user's first active socket, broadcast online presence to subscribers.
   */
  public register(userId: string, rawUsername: string, socketId: string): { isFirstConnection: boolean } {
    const username = rawUsername.toLowerCase().trim();
    if (!this.userToSockets.has(username)) {
      this.userToSockets.set(username, new Set());
    }

    const sockets = this.userToSockets.get(username)!;
    const isFirstConnection = sockets.size === 0;
    sockets.add(socketId);

    this.socketToUser.set(socketId, { userId, username });

    logger.info(
      { username, socketId, totalUserSockets: sockets.size },
      'Socket registered in connection registry'
    );

    if (isFirstConnection) {
      this.broadcastPresence(username, true);
    }

    return { isFirstConnection };
  }

  /**
   * Unregister a socket connection upon disconnect.
   * If all sockets for this user are gone, broadcast offline presence.
   */
  public unregister(socketId: string): { username: string; isOffline: boolean } | null {
    const info = this.socketToUser.get(socketId);
    if (!info) return null;

    this.socketToUser.delete(socketId);
    const { username } = info;

    const sockets = this.userToSockets.get(username);
    let isOffline = false;
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.userToSockets.delete(username);
        isOffline = true;
      }
    }

    // Clean up any subscriptions made by this socket
    for (const [targetUser, subSet] of this.presenceSubscribers.entries()) {
      subSet.delete(socketId);
      if (subSet.size === 0) {
        this.presenceSubscribers.delete(targetUser);
      }
    }

    logger.info(
      { username, socketId, remainingSockets: sockets ? sockets.size : 0, isOffline },
      'Socket unregistered from connection registry'
    );

    if (isOffline) {
      this.broadcastPresence(username, false);
    }

    return { username, isOffline };
  }

  /**
   * Atomic check whether target user has at least one active connection
   */
  public isUserOnline(rawUsername: string): boolean {
    const sockets = this.userToSockets.get(rawUsername.toLowerCase().trim());
    return Boolean(sockets && sockets.size > 0);
  }

  /**
   * Retrieve all active socket IDs for a target user
   */
  public getSocketsForUser(rawUsername: string): string[] {
    const sockets = this.userToSockets.get(rawUsername.toLowerCase().trim());
    return sockets ? Array.from(sockets) : [];
  }

  /**
   * Subscribe a socket to real-time presence updates of target usernames
   */
  public subscribePresence(subscriberSocketId: string, targetUsernames: string[]): { username: string; online: boolean }[] {
    const result: { username: string; online: boolean }[] = [];

    for (const target of targetUsernames) {
      const normalized = target.toLowerCase().trim();
      if (!this.presenceSubscribers.has(normalized)) {
        this.presenceSubscribers.set(normalized, new Set());
      }
      this.presenceSubscribers.get(normalized)!.add(subscriberSocketId);

      result.push({
        username: normalized,
        online: this.isUserOnline(normalized),
      });
    }

    return result;
  }

  /**
   * Broadcast presence update to all active subscribers
   */
  public broadcastPresence(rawUsername: string, online: boolean): void {
    if (!this.io) return;
    const normalized = rawUsername.toLowerCase().trim();
    const subscribers = this.presenceSubscribers.get(normalized);

    if (subscribers && subscribers.size > 0) {
      const payload = { username: normalized, online };
      for (const socketId of subscribers) {
        this.io.to(socketId).emit('presence:update', payload);
      }
    }
  }

  /**
   * Clear registry (used in test teardown)
   */
  public clear(): void {
    this.userToSockets.clear();
    this.socketToUser.clear();
    this.presenceSubscribers.clear();
  }
}

export const connectionRegistry = new ConnectionRegistry();
