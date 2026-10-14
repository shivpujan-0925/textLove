import React, { createContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { KeyStore } from '../crypto/keyStore';

export interface GoogleAccountDetails {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface GoogleAuthUrlResponse {
  authUrl: string;
  state: string;
  isMock: boolean;
}

export interface AuthContextType {
  user: User | null;
  csrfToken: string | null;
  isLoading: boolean;
  loginWithGoogle: () => Promise<GoogleAuthUrlResponse | null>;
  loginWithGoogleAccount: (account: GoogleAccountDetails, existingState?: string) => Promise<void>;
  simulateDevLogin: (name?: string, email?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUsername: (newUsername: string) => Promise<void>;
  updateProfile: (displayName: string) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  deleteAccount: (confirmation?: string) => Promise<{ success: boolean; message: string; disclosure?: string } | void>;
  registerE2EEKeys: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const registerE2EEKeys = useCallback(async (token?: string | null, targetUsername?: string) => {
    const activeToken = token || csrfToken;
    if (!activeToken) return;
    try {
      if (targetUsername) {
        KeyStore.getInstance().initForUser(targetUsername);
      }
      const bundle = KeyStore.getInstance().ensureKeys();
      const res = await fetch('/api/v1/keys/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': activeToken,
        },
        credentials: 'include',
        body: JSON.stringify(bundle),
      });
      if (res.ok) {
        setUser((prev) => (prev ? { ...prev, hasRegisteredKeys: true } : null));
      }
    } catch {
      // Offline fallback
    }
  }, [csrfToken]);

  // 1. Check existing session on load
  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUser({
          id: data.user.id,
          username: data.user.username,
          displayName: data.user.displayName,
          avatarUrl: data.user.avatarUrl,
          isOnline: true,
          hasRegisteredKeys: data.user.hasRegisteredKeys,
        });
        setCsrfToken(data.csrfToken);
        KeyStore.getInstance().initForUser(data.user.username);
        registerE2EEKeys(data.csrfToken, data.user.username);
      } else {
        setUser(null);
        setCsrfToken(null);
      }
    } catch {
      setUser(null);
      setCsrfToken(null);
    } finally {
      setIsLoading(false);
    }
  }, [registerE2EEKeys]);

  // 2. Google OAuth URL fetch
  const loginWithGoogle = async (): Promise<GoogleAuthUrlResponse | null> => {
    try {
      const res = await fetch('/api/v1/auth/google/url', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        return data;
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `OAuth request failed with status ${res.status}`);
    } catch (err) {
      console.error('Failed to initiate Google OAuth:', err);
      throw err;
    }
  };

  // 3. Authenticate with a specific selected Google account (validating state and establishing session)
  const loginWithGoogleAccount = async (account: GoogleAccountDetails, existingState?: string) => {
    try {
      setIsLoading(true);
      let state = existingState;

      // Only fetch URL if state was not already obtained
      if (!state) {
        const urlRes = await fetch('/api/v1/auth/google/url', { credentials: 'include' });
        if (!urlRes.ok) {
          const errData = await urlRes.json().catch(() => ({}));
          throw new Error(errData.error?.message || 'Failed to initiate OAuth session with backend.');
        }
        const urlData = await urlRes.json();
        state = urlData.state;
      }

      const idToken = `mock_google_token_:${encodeURIComponent(account.id)}:${encodeURIComponent(
        account.email
      )}:${encodeURIComponent(account.name)}${
        account.avatarUrl ? ':' + encodeURIComponent(account.avatarUrl) : ''
      }`;

      const callbackRes = await fetch('/api/v1/auth/google/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          idToken,
          state,
        }),
      });

      if (!callbackRes.ok) {
        const errorData = await callbackRes.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Authentication failed');
      }

      const data = await callbackRes.json();
      setUser({
        id: data.user.id,
        username: data.user.username,
        displayName: data.user.displayName,
        avatarUrl: data.user.avatarUrl,
        isOnline: true,
        hasRegisteredKeys: data.user.hasRegisteredKeys,
      });
      setCsrfToken(data.csrfToken);
      KeyStore.getInstance().initForUser(data.user.username);
      registerE2EEKeys(data.csrfToken, data.user.username);
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Handle incoming OAuth callback (when returning from Google OAuth redirect)
  const handleOAuthCallback = useCallback(
    async (code: string, state: string) => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/v1/auth/google/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code, state }),
        });

        if (res.ok) {
          const data = await res.json();
          setUser({
            id: data.user.id,
            username: data.user.username,
            displayName: data.user.displayName,
            avatarUrl: data.user.avatarUrl,
            isOnline: true,
            hasRegisteredKeys: data.user.hasRegisteredKeys,
          });
          setCsrfToken(data.csrfToken);
          KeyStore.getInstance().initForUser(data.user.username);
          registerE2EEKeys(data.csrfToken, data.user.username);
          // Clean query params from URL
          const cleanPath = window.location.pathname.replace(/\/auth\/callback\/?$/, '') || '/';
          window.history.replaceState({}, document.title, cleanPath);
        }
      } catch (err) {
        console.error('Failed to complete OAuth callback:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [registerE2EEKeys]
  );

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code && state) {
      handleOAuthCallback(code, state);
    } else {
      checkAuth();
    }
  }, [checkAuth, handleOAuthCallback]);

  // Backward-compatible dev helper
  const simulateDevLogin = async (name = 'Test User', email = 'test@example.com') => {
    await loginWithGoogleAccount({
      id: `dev_user_${Date.now()}`,
      name,
      email,
    });
  };

  // 5. Logout and revoke session
  const logout = async () => {
    try {
      if (csrfToken) {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: {
            'X-CSRF-Token': csrfToken,
          },
          credentials: 'include',
        });
      }
    } finally {
      setUser(null);
      setCsrfToken(null);
      KeyStore.getInstance().reset();
    }
  };

  // 6. Update unique username
  const updateUsername = async (newUsername: string) => {
    if (!csrfToken) throw new Error('CSRF token missing');

    const res = await fetch('/api/v1/users/username', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      credentials: 'include',
      body: JSON.stringify({ newUsername }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to update username');
    }

    setUser((prev) => (prev ? { ...prev, username: data.user.username } : null));
  };

  // 7. Update display name
  const updateProfile = async (displayName: string) => {
    if (!csrfToken) throw new Error('CSRF token missing');

    const res = await fetch('/api/v1/users/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      credentials: 'include',
      body: JSON.stringify({ displayName }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to update profile');
    }

    setUser((prev) => (prev ? { ...prev, displayName: data.user.displayName } : null));
  };

  // 8. Upload profile avatar to Cloudinary
  const uploadAvatar = async (file: File) => {
    if (!csrfToken) throw new Error('CSRF token missing');

    const formData = new FormData();
    formData.append('avatar', file);

    const res = await fetch('/api/v1/users/avatar', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': csrfToken,
      },
      credentials: 'include',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to upload avatar image');
    }

    setUser((prev) => (prev ? { ...prev, avatarUrl: data.user.avatarUrl } : null));
  };

  // 9. Permanent account deletion cascade
  const deleteAccount = async (confirmation: string = 'DELETE') => {
    if (!csrfToken) throw new Error('CSRF token missing');

    const res = await fetch('/api/v1/users/me', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      credentials: 'include',
      body: JSON.stringify({ confirmation }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to delete account');
    }

    KeyStore.getInstance().reset();
    setUser(null);
    setCsrfToken(null);
    return data;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        csrfToken,
        isLoading,
        loginWithGoogle,
        loginWithGoogleAccount,
        simulateDevLogin,
        logout,
        updateUsername,
        updateProfile,
        uploadAvatar,
        deleteAccount,
        registerE2EEKeys: () => registerE2EEKeys(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
