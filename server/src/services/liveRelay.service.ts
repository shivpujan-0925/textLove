/**
 * In-memory transient live connection registry.
 * Zero database persistence: strictly dispatches live ciphertext to active peer memory streams.
 */

export interface LiveMessagePayload {
  conversationId: string;
  senderUsername: string;
  recipientUsername: string;
  ciphertext: string;
  iv: string;
  seq: number;
  timestamp: number;
  senderEphemeralPublicKey?: string;
}

type LiveListener = (msg: LiveMessagePayload) => void;

class LiveRelayService {
  private activeListeners = new Map<string, Set<LiveListener>>();

  /**
   * Register a live connection memory listener for a username
   */
  public subscribe(username: string, listener: LiveListener): () => void {
    const key = username.toLowerCase();
    if (!this.activeListeners.has(key)) {
      this.activeListeners.set(key, new Set());
    }
    this.activeListeners.get(key)!.add(listener);

    return () => {
      const set = this.activeListeners.get(key);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.activeListeners.delete(key);
        }
      }
    };
  }

  /**
   * Check if recipient has an active live connection
   */
  public isUserOnline(username: string): boolean {
    const set = this.activeListeners.get(username.toLowerCase());
    return Boolean(set && set.size > 0);
  }

  /**
   * Forward ciphertext instantly to recipient's active memory stream
   * NEVER saves to disk or database.
   */
  public forward(msg: LiveMessagePayload): boolean {
    const set = this.activeListeners.get(msg.recipientUsername.toLowerCase());
    if (!set || set.size === 0) {
      return false; // Recipient is offline; textLove strictly rejects offline queuing
    }

    for (const listener of set) {
      try {
        listener(msg);
      } catch {
        // Continue notifying remaining active listeners
      }
    }
    return true;
  }

  /**
   * Clear registry (for test suite cleanup)
   */
  public clear(): void {
    this.activeListeners.clear();
  }
}

export const liveRelayService = new LiveRelayService();
