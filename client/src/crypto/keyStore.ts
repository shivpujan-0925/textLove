import {
  generateIdentityKeyPair,
  generateSignedPreKey,
  initializeOutboundSession,
  initializeInboundSession,
  encryptMessage,
  decryptMessage,
  calculateSafetyNumber,
} from './engine';
import {
  KeyPairHex,
  PublicKeyBundleHex,
  SessionState,
  EncryptedMessagePayload,
} from './types';

export class KeyStore {
  private static instance: KeyStore | null = null;

  private currentUsername: string = '';
  private identityKeys: KeyPairHex | null = null;
  private signedPreKey: KeyPairHex | null = null;
  private preKeySignature: string | null = null;

  // Active in-memory session states per conversation
  private sessions = new Map<string, SessionState>();
  // Cached peer identity keys to detect unexpected key changes
  private peerIdentityKeys = new Map<string, string>();

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): KeyStore {
    if (!KeyStore.instance) {
      KeyStore.instance = new KeyStore();
    }
    return KeyStore.instance;
  }

  /**
   * Scope KeyStore to specific logged-in user to prevent key collision across accounts
   */
  public initForUser(rawUsername: string): void {
    const username = rawUsername.toLowerCase().trim();
    if (this.currentUsername === username && this.identityKeys) return;

    if (this.currentUsername) {
      this.saveToStorage();
    }

    this.currentUsername = username;
    this.identityKeys = null;
    this.signedPreKey = null;
    this.preKeySignature = null;
    this.sessions.clear();
    this.peerIdentityKeys.clear();

    this.loadFromStorage();
  }

  private getStorageKey(key: string): string {
    return this.currentUsername
      ? `textlove_e2ee_${this.currentUsername}_${key}`
      : `textlove_e2ee_${key}`;
  }

  /**
   * Reset keystore (for testing or user logout)
   */
  public reset(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.getStorageKey('identity'));
      localStorage.removeItem(this.getStorageKey('prekey'));
      localStorage.removeItem(this.getStorageKey('signature'));
    }
    this.currentUsername = '';
    this.identityKeys = null;
    this.signedPreKey = null;
    this.preKeySignature = null;
    this.sessions.clear();
    this.peerIdentityKeys.clear();
  }

  /**
   * Ensure user has generated cryptographic keys on this device
   */
  public ensureKeys(): PublicKeyBundleHex {
    if (this.identityKeys && this.signedPreKey && this.preKeySignature) {
      return this.getPublicBundle();
    }

    // 1. Generate new Ed25519 Identity Key Pair
    const idKey = generateIdentityKeyPair();
    this.identityKeys = idKey.hex;

    // 2. Generate new X25519 Signed Pre-Key signed by Identity Key
    const preKey = generateSignedPreKey(idKey.bytes.privateKey);
    this.signedPreKey = preKey.hex;
    this.preKeySignature = preKey.signatureHex;

    this.saveToStorage();
    return this.getPublicBundle();
  }

  /**
   * Return the public key bundle for server registration
   */
  public getPublicBundle(): PublicKeyBundleHex {
    if (!this.identityKeys || !this.signedPreKey || !this.preKeySignature) {
      throw new Error('KEYSTORE_UNINITIALIZED: Cryptographic keys have not been generated.');
    }

    return {
      identityPublicKey: this.identityKeys.publicKey,
      signedPreKey: this.signedPreKey.publicKey,
      preKeySignature: this.preKeySignature,
    };
  }

  /**
   * Initialize or retrieve an outbound session with peer
   */
  public getOrCreateOutboundSession(
    conversationId: string,
    peerUsername: string,
    peerBundle: PublicKeyBundleHex
  ): { session: SessionState; ephemeralPublicKeyHex?: string; keyChangedWarning: boolean } {
    let keyChangedWarning = false;
    const knownKey = this.peerIdentityKeys.get(peerUsername);
    if (knownKey && knownKey.toLowerCase() !== peerBundle.identityPublicKey.toLowerCase()) {
      keyChangedWarning = true;
      this.sessions.delete(conversationId);
    }
    this.peerIdentityKeys.set(peerUsername, peerBundle.identityPublicKey);

    const existing = this.sessions.get(conversationId);
    if (existing) {
      if (keyChangedWarning) existing.keyChangedWarning = true;
      return { session: existing, keyChangedWarning };
    }

    this.ensureKeys();
    const { session, ephemeralPublicKeyHex } = initializeOutboundSession(
      this.signedPreKey!.privateKey,
      this.identityKeys!.publicKey,
      peerBundle,
      conversationId,
      peerUsername
    );

    if (keyChangedWarning) session.keyChangedWarning = true;
    this.sessions.set(conversationId, session);
    return { session, ephemeralPublicKeyHex, keyChangedWarning };
  }

  /**
   * Initialize or retrieve an inbound session from a received encrypted payload
   */
  public getOrCreateInboundSession(
    conversationId: string,
    peerUsername: string,
    peerIdentityPublicKeyHex: string,
    peerPreKeyPublicHex: string,
    peerEphemeralPublicKeyHex: string
  ): { session: SessionState; keyChangedWarning: boolean } {
    let keyChangedWarning = false;
    const knownKey = this.peerIdentityKeys.get(peerUsername);
    if (knownKey && knownKey.toLowerCase() !== peerIdentityPublicKeyHex.toLowerCase()) {
      keyChangedWarning = true;
      this.sessions.delete(conversationId);
    }
    this.peerIdentityKeys.set(peerUsername, peerIdentityPublicKeyHex);

    const existing = this.sessions.get(conversationId);
    if (existing) {
      if (keyChangedWarning) existing.keyChangedWarning = true;
      return { session: existing, keyChangedWarning };
    }

    this.ensureKeys();
    const session = initializeInboundSession(
      this.signedPreKey!.privateKey,
      this.identityKeys!.publicKey,
      peerIdentityPublicKeyHex,
      peerPreKeyPublicHex,
      peerEphemeralPublicKeyHex,
      conversationId,
      peerUsername
    );

    if (keyChangedWarning) session.keyChangedWarning = true;
    this.sessions.set(conversationId, session);
    return { session, keyChangedWarning };
  }

  /**
   * Get safety number for an active conversation
   */
  public getSafetyNumber(peerIdentityPublicKeyHex: string): string {
    this.ensureKeys();
    return calculateSafetyNumber(this.identityKeys!.publicKey, peerIdentityPublicKeyHex).safetyNumber;
  }

  /**
   * Encrypt a message
   */
  public async encrypt(
    conversationId: string,
    plaintext: string,
    senderUsername: string,
    recipientUsername: string,
    ephemeralPublicKeyHex?: string
  ): Promise<EncryptedMessagePayload> {
    const session = this.sessions.get(conversationId);
    if (!session) {
      throw new Error(`SESSION_NOT_FOUND: No active E2EE session found for conversation ${conversationId}`);
    }

    return encryptMessage(
      session,
      plaintext,
      senderUsername,
      recipientUsername,
      ephemeralPublicKeyHex
    );
  }

  /**
   * Decrypt a message
   */
  public async decrypt(
    conversationId: string,
    payload: EncryptedMessagePayload
  ): Promise<string> {
    const session = this.sessions.get(conversationId);
    if (!session) {
      throw new Error(`SESSION_NOT_FOUND: No active E2EE session found for conversation ${conversationId}`);
    }

    return decryptMessage(session, payload);
  }

  private saveToStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      if (this.identityKeys) {
        localStorage.setItem(this.getStorageKey('identity'), JSON.stringify(this.identityKeys));
      }
      if (this.signedPreKey) {
        localStorage.setItem(this.getStorageKey('prekey'), JSON.stringify(this.signedPreKey));
      }
      if (this.preKeySignature) {
        localStorage.setItem(this.getStorageKey('signature'), this.preKeySignature);
      }
    } catch {
      // Graceful fallback if storage quota exceeded or disabled
    }
  }

  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const idRaw = localStorage.getItem(this.getStorageKey('identity'));
      const preRaw = localStorage.getItem(this.getStorageKey('prekey'));
      const sigRaw = localStorage.getItem(this.getStorageKey('signature'));

      if (idRaw && preRaw && sigRaw) {
        this.identityKeys = JSON.parse(idRaw);
        this.signedPreKey = JSON.parse(preRaw);
        this.preKeySignature = sigRaw;
      }
    } catch {
      // In-memory fallback
    }
  }
}
