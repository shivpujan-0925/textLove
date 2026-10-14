export interface KeyPairBytes {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface KeyPairHex {
  publicKey: string;
  privateKey: string;
}

export interface PublicKeyBundleHex {
  identityPublicKey: string; // Ed25519 public key (hex)
  signedPreKey: string;      // X25519 prekey (hex)
  preKeySignature: string;   // Ed25519 signature over signedPreKey (hex)
  createdAt?: string;
}

export interface OutboundHandshakePayload {
  conversationId: string;
  senderUsername: string;
  recipientUsername: string;
  senderIdentityPublicKey: string; // Ed25519 public key (hex)
  senderEphemeralPublicKey: string; // X25519 ephemeral public key (hex)
}

export interface EncryptedMessagePayload {
  conversationId: string;
  senderUsername: string;
  recipientUsername: string;
  ciphertext: string;              // Base64 encoded AES-256-GCM ciphertext + tag
  iv: string;                      // Base64 encoded 12-byte IV
  seq: number;                     // Monotonically increasing sequence number
  timestamp: number;               // Millisecond timestamp
  senderEphemeralPublicKey?: string; // Included on initial handshake message
}

export interface SessionState {
  conversationId: string;
  peerUsername: string;
  peerIdentityPublicKey: string;
  peerSafetyNumber: string;
  keyChangedWarning?: boolean;
  ephemeralPublicKeyHex?: string;
  peerEphemeralPublicKeyHex?: string;
  
  // Symmetric ratchet state
  rootKey: Uint8Array;
  sendChainKey: Uint8Array;
  recvChainKey: Uint8Array;
  
  // Replay and sequence tracking
  sendSeq: number;
  recvSeq: number;
  seenRecvSeqs: Set<number>;
  
  createdAt: number;
  lastActiveAt: number;
}
