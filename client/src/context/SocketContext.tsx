import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './useAuth';
import { KeyStore } from '../crypto/keyStore';
import { ConnectionStatus, EphemeralMessage } from '../types';
import { getCanonicalConversationId } from '../utils/conversation';
import { apiUrl, SOCKET_URL } from '../utils/api';

export interface PublicKeyBundle {
  identityPublicKey: string;
  signedPreKey: string;
  preKeySignature: string;
  createdAt?: string;
}

interface SocketContextType {
  socket: Socket | null;
  connectionStatus: ConnectionStatus;
  presenceMap: Record<string, boolean>;
  subscribePresence: (usernames: string[]) => void;
  isUserOnline: (username: string) => boolean;
  fetchPeerKeyBundle: (username: string, forceRefresh?: boolean) => Promise<PublicKeyBundle | null>;
  sendEncryptedMessage: (
    conversationId: string,
    recipientUsername: string,
    plaintext: string
  ) => Promise<EphemeralMessage>;
  sendTyping: (conversationId: string, recipientUsername: string, isTyping: boolean) => void;
  terminateConversation: (conversationId: string, peerUsername: string) => void;
  onMessageReceived: (callback: (msg: EphemeralMessage) => void) => () => void;
  onMessageAck: (callback: (data: { conversationId: string; seq: number; status: 'DECRYPTED_BY_PEER' }) => void) => () => void;
  onMessageError: (callback: (data: { conversationId: string; seq: number; code: string; message: string }) => void) => () => void;
  onTyping: (callback: (data: { conversationId: string; senderUsername: string; isTyping: boolean }) => void) => () => void;
  onTerminated: (callback: (data: { conversationId: string; terminatedBy: string }) => void) => () => void;
  onExpired: (callback: (data: { conversationId: string; reason: string; expiredAt?: string }) => void) => () => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>({});

  // In-memory cache for peer public key bundles during the session
  const peerKeyCache = useRef<Map<string, PublicKeyBundle>>(new Map());

  // Callback listeners
  const messageListeners = useRef<Set<(msg: EphemeralMessage) => void>>(new Set());
  const ackListeners = useRef<Set<(data: { conversationId: string; seq: number; status: 'DECRYPTED_BY_PEER' }) => void>>(new Set());
  const errorListeners = useRef<Set<(data: { conversationId: string; seq: number; code: string; message: string }) => void>>(new Set());
  const typingListeners = useRef<Set<(data: { conversationId: string; senderUsername: string; isTyping: boolean }) => void>>(new Set());
  const terminatedListeners = useRef<Set<(data: { conversationId: string; terminatedBy: string }) => void>>(new Set());
  const expiredListeners = useRef<Set<(data: { conversationId: string; reason: string; expiredAt?: string }) => void>>(new Set());

  // Subscribed usernames to re-subscribe upon reconnection
  const subscribedUsernames = useRef<Set<string>>(new Set());

  // Fetch peer public key bundle with in-memory caching
  const fetchPeerKeyBundle = useCallback(async (rawUsername: string, forceRefresh = false): Promise<PublicKeyBundle | null> => {
    const username = rawUsername.toLowerCase().trim();
    if (!forceRefresh && peerKeyCache.current.has(username)) {
      return peerKeyCache.current.get(username)!;
    }

    try {
      const token = typeof window !== 'undefined' ? sessionStorage.getItem('textlove_session_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(apiUrl(`/api/v1/keys/${encodeURIComponent(username)}`), {
        headers,
        credentials: 'include',
      });
      if (!res.ok) {
        return null;
      }
      const data = await res.json();
      if (data.success && data.publicKeyBundle) {
        peerKeyCache.current.set(username, data.publicKeyBundle);
        return data.publicKeyBundle;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // Initialize and manage authenticated socket lifecycle
  useEffect(() => {
    if (!user) {
      setSocket((prev) => {
        if (prev) prev.disconnect();
        return null;
      });
      setConnectionStatus('disconnected');
      return;
    }

    setConnectionStatus('connecting');

    const sessionToken = typeof window !== 'undefined' ? sessionStorage.getItem('textlove_session_token') : null;
    const newSocket = io(SOCKET_URL, {
      auth: sessionToken ? { token: sessionToken } : undefined,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      randomizationFactor: 0.5, // backoff with jitter
      timeout: 10000,
    });

    newSocket.on('connect', () => {
      setConnectionStatus('connected');

      // Re-subscribe to any previously tracked users
      if (subscribedUsernames.current.size > 0) {
        newSocket.emit('presence:subscribe', {
          usernames: Array.from(subscribedUsernames.current),
        });
      }
    });

    newSocket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect' || reason === 'io client disconnect') {
        setConnectionStatus('disconnected');
      } else {
        setConnectionStatus('reconnecting');
      }
    });

    newSocket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err?.message || err);
      setConnectionStatus('reconnecting');
    });

    newSocket.on('reconnect', () => {
      setConnectionStatus('connected');
    });

    // Presence events
    newSocket.on('presence:batch', (batch: { username: string; online: boolean }[]) => {
      if (Array.isArray(batch)) {
        setPresenceMap((prev) => {
          const next = { ...prev };
          for (const item of batch) {
            next[item.username.toLowerCase()] = item.online;
          }
          return next;
        });
      }
    });

    newSocket.on('presence:update', (item: { username: string; online: boolean }) => {
      if (item?.username) {
        const u = item.username.toLowerCase();
        setPresenceMap((prev) => ({
          ...prev,
          [u]: Boolean(item.online),
        }));
        if (item.online) {
          peerKeyCache.current.delete(u);
        }
      }
    });

    // Message delivery
    newSocket.on('msg:deliver', async (payload: {
      conversationId: string;
      senderUsername: string;
      recipientUsername: string;
      ciphertext: string;
      iv: string;
      seq: number;
      timestamp: number;
      senderEphemeralPublicKey?: string;
    }) => {
      try {
        const ks = KeyStore.getInstance();
        ks.ensureKeys();

        // Retrieve sender's public key bundle if needed for the inbound session
        let senderBundle = peerKeyCache.current.get(payload.senderUsername.toLowerCase());
        if (!senderBundle) {
          const fetched = await fetchPeerKeyBundle(payload.senderUsername);
          if (fetched) senderBundle = fetched;
        }

        const canonicalConvId = getCanonicalConversationId(
          payload.senderUsername,
          payload.recipientUsername
        );

        if (senderBundle && payload.senderEphemeralPublicKey) {
          ks.getOrCreateInboundSession(
            canonicalConvId,
            payload.senderUsername,
            senderBundle.identityPublicKey,
            senderBundle.signedPreKey,
            payload.senderEphemeralPublicKey
          );
        }

        // Decrypt ciphertext using AEAD AES-256-GCM
        const plaintext = await ks.decrypt(canonicalConvId, {
          conversationId: canonicalConvId,
          senderUsername: payload.senderUsername,
          recipientUsername: payload.recipientUsername,
          ciphertext: payload.ciphertext,
          iv: payload.iv,
          seq: payload.seq,
          timestamp: payload.timestamp,
          senderEphemeralPublicKey: payload.senderEphemeralPublicKey,
        });

        // Acknowledge decryption back to the sender
        newSocket.emit('msg:ack', {
          conversationId: canonicalConvId,
          seq: payload.seq,
          senderUsername: payload.senderUsername,
          status: 'DECRYPTED_BY_PEER',
        });

        const incomingMsg: EphemeralMessage = {
          id: `msg_${canonicalConvId}_${payload.seq}`,
          conversationId: canonicalConvId,
          senderUsername: payload.senderUsername,
          text: plaintext,
          timestamp: payload.timestamp,
          status: 'DECRYPTED_BY_PEER',
          isMe: false,
          seq: payload.seq,
        };

        // Notify in-memory listeners
        for (const listener of messageListeners.current) {
          listener(incomingMsg);
        }
      } catch (err) {
        console.error('Decryption failed for received payload:', err);
      }
    });

    // Peer acknowledgement
    newSocket.on('msg:peer_ack', (data: {
      conversationId: string;
      seq: number;
      status: 'DECRYPTED_BY_PEER';
    }) => {
      for (const listener of ackListeners.current) {
        listener(data);
      }
    });

    // Relay error (e.g. RECIPIENT_OFFLINE)
    newSocket.on('msg:error', (data: {
      conversationId: string;
      seq: number;
      code: string;
      message: string;
    }) => {
      for (const listener of errorListeners.current) {
        listener(data);
      }
    });

    // Typing
    newSocket.on('conv:typing', (data: {
      conversationId: string;
      senderUsername: string;
      isTyping: boolean;
    }) => {
      for (const listener of typingListeners.current) {
        listener(data);
      }
    });

    // Conversation termination
    newSocket.on('conv:terminated', (data: {
      conversationId: string;
      terminatedBy: string;
    }) => {
      for (const listener of terminatedListeners.current) {
        listener(data);
      }
    });

    // Conversation inactivity expiration
    newSocket.on('conv:expired', (data: {
      conversationId: string;
      reason: string;
      expiredAt?: string;
    }) => {
      for (const listener of expiredListeners.current) {
        listener(data);
      }
    });

    // Heartbeat ping every 25 seconds
    const heartbeatInterval = setInterval(() => {
      if (newSocket.connected) {
        newSocket.emit('presence:heartbeat');
      }
    }, 25000);

    setSocket(newSocket);

    return () => {
      clearInterval(heartbeatInterval);
      newSocket.disconnect();
      setSocket(null);
      setConnectionStatus('disconnected');
    };
  }, [user, fetchPeerKeyBundle]);

  const subscribePresence = useCallback((usernames: string[]) => {
    for (const u of usernames) {
      subscribedUsernames.current.add(u.toLowerCase());
    }
    if (socket && socket.connected) {
      socket.emit('presence:subscribe', { usernames });
    }
  }, [socket]);

  const isUserOnline = useCallback((rawUsername: string): boolean => {
    return Boolean(presenceMap[rawUsername.toLowerCase()]);
  }, [presenceMap]);

  const sendTyping = useCallback((conversationId: string, recipientUsername: string, isTyping: boolean) => {
    if (socket && socket.connected) {
      socket.emit('conv:typing', { conversationId, recipientUsername, isTyping });
    }
  }, [socket]);

  const terminateConversation = useCallback((conversationId: string, peerUsername: string) => {
    if (socket && socket.connected) {
      socket.emit('conv:terminate', { conversationId, peerUsername });
    }
  }, [socket]);

  // Send encrypted message strictly live
  const sendEncryptedMessage = useCallback(
    async (
      _conversationId: string,
      rawRecipientUsername: string,
      plaintext: string
    ): Promise<EphemeralMessage> => {
      const recipientUsername = rawRecipientUsername.toLowerCase().trim();
      const senderUsername = user!.username.toLowerCase().trim();
      const canonicalConvId = getCanonicalConversationId(senderUsername, recipientUsername);

      // 1. Invariant: Strict Live-Only Check
      // If socket is not connected or recipient is marked offline, reject immediately!
      if (!socket || !socket.connected) {
        throw new Error('YOU_ARE_OFFLINE');
      }

      if (!presenceMap[recipientUsername]) {
        throw new Error(`RECIPIENT_OFFLINE: User @${recipientUsername} is offline. Message not sent.`);
      }

      // 2. Resolve peer public key bundle
      let peerBundle = peerKeyCache.current.get(recipientUsername);
      if (!peerBundle) {
        peerBundle = (await fetchPeerKeyBundle(recipientUsername, true)) ?? undefined;
      }
      if (!peerBundle) {
        throw new Error(`PEER_KEYS_UNAVAILABLE: @${recipientUsername} has not registered encryption keys.`);
      }

      // 3. Initialize outbound E2EE session with peer's key bundle using canonical conversation ID
      const ks = KeyStore.getInstance();
      ks.ensureKeys();
      const { session, ephemeralPublicKeyHex } = ks.getOrCreateOutboundSession(
        canonicalConvId,
        recipientUsername,
        peerBundle
      );

      const activeEphemeralKey = ephemeralPublicKeyHex || session.ephemeralPublicKeyHex;

      // 4. Encrypt with AES-256-GCM AEAD using canonical conversation ID
      const encrypted = await ks.encrypt(
        canonicalConvId,
        plaintext,
        senderUsername,
        recipientUsername,
        activeEphemeralKey
      );

      // 5. Emit live payload over WebSocket with canonical conversation ID
      socket.emit('msg:send', {
        conversationId: canonicalConvId,
        recipientUsername,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        seq: encrypted.seq,
        timestamp: encrypted.timestamp,
        senderEphemeralPublicKey: activeEphemeralKey,
      });

      return {
        id: `msg_${canonicalConvId}_${encrypted.seq}`,
        conversationId: canonicalConvId,
        senderUsername: user!.username,
        text: plaintext,
        timestamp: encrypted.timestamp,
        status: 'RELAYED_TO_NETWORK',
        isMe: true,
        seq: encrypted.seq,
      };
    },
    [socket, user, presenceMap, fetchPeerKeyBundle]
  );

  const onMessageReceived = useCallback((cb: (msg: EphemeralMessage) => void) => {
    messageListeners.current.add(cb);
    return () => {
      messageListeners.current.delete(cb);
    };
  }, []);

  const onMessageAck = useCallback((cb: (data: { conversationId: string; seq: number; status: 'DECRYPTED_BY_PEER' }) => void) => {
    ackListeners.current.add(cb);
    return () => {
      ackListeners.current.delete(cb);
    };
  }, []);

  const onMessageError = useCallback((cb: (data: { conversationId: string; seq: number; code: string; message: string }) => void) => {
    errorListeners.current.add(cb);
    return () => {
      errorListeners.current.delete(cb);
    };
  }, []);

  const onTyping = useCallback((cb: (data: { conversationId: string; senderUsername: string; isTyping: boolean }) => void) => {
    typingListeners.current.add(cb);
    return () => {
      typingListeners.current.delete(cb);
    };
  }, []);

  const onTerminated = useCallback((cb: (data: { conversationId: string; terminatedBy: string }) => void) => {
    terminatedListeners.current.add(cb);
    return () => {
      terminatedListeners.current.delete(cb);
    };
  }, []);

  const onExpired = useCallback((cb: (data: { conversationId: string; reason: string; expiredAt?: string }) => void) => {
    expiredListeners.current.add(cb);
    return () => {
      expiredListeners.current.delete(cb);
    };
  }, []);

  return (
    <SocketContext.Provider
      value={{
        socket,
        connectionStatus,
        presenceMap,
        subscribePresence,
        isUserOnline,
        fetchPeerKeyBundle,
        sendEncryptedMessage,
        sendTyping,
        terminateConversation,
        onMessageReceived,
        onMessageAck,
        onMessageError,
        onTyping,
        onTerminated,
        onExpired,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
