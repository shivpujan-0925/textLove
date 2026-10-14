/**
 * textLove IndexedDB Non-Extractable WebCrypto Vault
 *
 * Implements Phase 9 Security Recommendation:
 * Upgrades KeyStore from localStorage to browser IndexedDB protected by
 * a non-extractable WebCrypto AES-GCM-256 CryptoKey.
 *
 * Security Invariants:
 * 1. Non-Extractable Key: The device master key is generated with `extractable: false`.
 *    Even in the event of an XSS vulnerability, `crypto.subtle.exportKey()` will fail with
 *    `InvalidAccessError: key is not extractable`.
 * 2. At-Rest Encryption: User cryptographic keypairs (Ed25519 identity key, X25519 signed pre-key)
 *    are encrypted at rest in IndexedDB using AES-256-GCM authenticated encryption.
 * 3. LocalStorage Sanitization: Any legacy plaintext keys in localStorage are automatically
 *    migrated and purged from localStorage.
 */

import { KeyPairHex } from './types';

const DB_NAME = 'textlove_crypto_vault_v1';
const DB_VERSION = 1;
const STORE_DEVICE_KEY = 'device_keys';
const STORE_USER_KEYS = 'user_keys';
const DEVICE_KEY_ID = 'master_vault_key';

export interface StoredUserKeys {
  identityKeys: KeyPairHex;
  signedPreKey: KeyPairHex;
  preKeySignature: string;
}

interface EncryptedRecord {
  id: string; // username
  iv: number[];
  ciphertext: number[];
  updatedAt: string;
}

// In-memory fallback map for non-browser or mock testing environments
const memoryVault = new Map<string, StoredUserKeys>();

function isIndexedDbAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.indexedDB !== 'undefined' &&
    typeof window.crypto !== 'undefined' &&
    typeof window.crypto.subtle !== 'undefined'
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      return reject(new Error('INDEXEDDB_UNAVAILABLE'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_DEVICE_KEY)) {
        db.createObjectStore(STORE_DEVICE_KEY, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_USER_KEYS)) {
        db.createObjectStore(STORE_USER_KEYS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieve or generate a non-extractable WebCrypto AES-GCM-256 device key.
 * The key is generated with extractable: false so that malicious scripts
 * cannot call crypto.subtle.exportKey() to steal the key.
 */
async function getOrCreateDeviceKey(db: IDBDatabase): Promise<CryptoKey> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DEVICE_KEY, 'readwrite');
    const store = tx.objectStore(STORE_DEVICE_KEY);
    const getReq = store.get(DEVICE_KEY_ID);

    getReq.onsuccess = async () => {
      if (getReq.result && getReq.result.key) {
        return resolve(getReq.result.key as CryptoKey);
      }

      try {
        // Generate a non-extractable AES-GCM 256-bit key
        const newKey = await window.crypto.subtle.generateKey(
          {
            name: 'AES-GCM',
            length: 256,
          },
          false, // extractable = false (cannot be exported by script)
          ['encrypt', 'decrypt']
        );

        const putReq = store.put({
          id: DEVICE_KEY_ID,
          key: newKey,
          createdAt: new Date().toISOString(),
        });

        putReq.onsuccess = () => resolve(newKey);
        putReq.onerror = () => reject(putReq.error);
      } catch (err) {
        reject(err);
      }
    };

    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Save user cryptographic keys securely encrypted in IndexedDB.
 */
export async function saveKeysToSecureVault(
  username: string,
  keys: StoredUserKeys
): Promise<void> {
  const normUser = username.toLowerCase().trim();

  // Always keep memory vault updated
  memoryVault.set(normUser, keys);

  // Clean up any legacy localStorage entries immediately
  purgeLegacyLocalStorage(normUser);

  if (!isIndexedDbAvailable()) {
    return;
  }

  try {
    const db = await openDatabase();
    const deviceKey = await getOrCreateDeviceKey(db);

    const plaintextStr = JSON.stringify(keys);
    const plaintextBytes = new TextEncoder().encode(plaintextStr);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      deviceKey,
      plaintextBytes
    );

    const record: EncryptedRecord = {
      id: normUser,
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(ciphertextBuffer)),
      updatedAt: new Date().toISOString(),
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_USER_KEYS, 'readwrite');
      const store = tx.objectStore(STORE_USER_KEYS);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    // Non-fatal: memory vault remains populated for current session
    console.warn('[KeyStore Vault] Failed to persist to IndexedDB:', err);
  }
}

/**
 * Load user cryptographic keys from encrypted IndexedDB vault.
 */
export async function loadKeysFromSecureVault(
  username: string
): Promise<StoredUserKeys | null> {
  const normUser = username.toLowerCase().trim();

  // 1. Check in-memory vault first
  if (memoryVault.has(normUser)) {
    return memoryVault.get(normUser)!;
  }

  // 2. Check IndexedDB
  if (isIndexedDbAvailable()) {
    try {
      const db = await openDatabase();
      const record = await new Promise<EncryptedRecord | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_USER_KEYS, 'readonly');
        const store = tx.objectStore(STORE_USER_KEYS);
        const req = store.get(normUser);
        req.onsuccess = () => resolve(req.result as EncryptedRecord);
        req.onerror = () => reject(req.error);
      });

      if (record) {
        const deviceKey = await getOrCreateDeviceKey(db);
        const iv = new Uint8Array(record.iv);
        const ciphertext = new Uint8Array(record.ciphertext);

        const decryptedBuffer = await window.crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv,
          },
          deviceKey,
          ciphertext
        );

        const decryptedStr = new TextDecoder().decode(decryptedBuffer);
        const keys = JSON.parse(decryptedStr) as StoredUserKeys;
        memoryVault.set(normUser, keys);
        return keys;
      }
    } catch (err) {
      console.warn('[KeyStore Vault] Failed to load from IndexedDB:', err);
    }
  }

  // 3. Fallback: Check and migrate legacy localStorage keys if present
  const migrated = migrateLegacyLocalStorage(normUser);
  if (migrated) {
    memoryVault.set(normUser, migrated);
    // Asynchronously save to IndexedDB
    saveKeysToSecureVault(normUser, migrated).catch(() => {});
    return migrated;
  }

  return null;
}

/**
 * Purge user keys from IndexedDB vault and memory.
 */
export async function purgeFromSecureVault(username: string): Promise<void> {
  const normUser = username.toLowerCase().trim();
  memoryVault.delete(normUser);
  purgeLegacyLocalStorage(normUser);

  if (!isIndexedDbAvailable()) return;

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_USER_KEYS, 'readwrite');
      const store = tx.objectStore(STORE_USER_KEYS);
      const req = store.delete(normUser);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Graceful error ignore on purge
  }
}

/**
 * Clear all memory vault state (useful for test isolation)
 */
export function clearMemoryVault(): void {
  memoryVault.clear();
}

/**
 * Migrate legacy plaintext keys from localStorage into IndexedDB and immediately purge them.
 */
function migrateLegacyLocalStorage(username: string): StoredUserKeys | null {
  if (typeof localStorage === 'undefined') return null;

  try {
    const idKey = username ? `textlove_e2ee_${username}_identity` : 'textlove_e2ee_identity';
    const preKey = username ? `textlove_e2ee_${username}_prekey` : 'textlove_e2ee_prekey';
    const sigKey = username ? `textlove_e2ee_${username}_signature` : 'textlove_e2ee_signature';

    const idRaw = localStorage.getItem(idKey);
    const preRaw = localStorage.getItem(preKey);
    const sigRaw = localStorage.getItem(sigKey);

    if (idRaw && preRaw && sigRaw) {
      const keys: StoredUserKeys = {
        identityKeys: JSON.parse(idRaw),
        signedPreKey: JSON.parse(preRaw),
        preKeySignature: sigRaw,
      };

      // Purge immediately to eliminate XSS exfiltration window
      purgeLegacyLocalStorage(username);
      return keys;
    }
  } catch {
    // Ignore migration parse error
  }

  return null;
}

/**
 * Scrub all textlove_e2ee localStorage entries.
 */
function purgeLegacyLocalStorage(username: string): void {
  if (typeof localStorage === 'undefined') return;

  try {
    const prefix = username ? `textlove_e2ee_${username}_` : 'textlove_e2ee_';
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(prefix) || key.startsWith('textlove_e2ee_'))) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage errors
  }
}
