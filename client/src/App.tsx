import React, { useState, useEffect, useCallback } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { useToast } from './context/useToast';
import { AuthProvider, GoogleAuthUrlResponse } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { SocketProvider, useSocket } from './context/SocketContext';
import { PwaProvider, usePwa } from './context/PwaContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { ChatArea } from './components/layout/ChatArea';
import { EmptyChatState } from './components/layout/EmptyChatState';
import { SettingsModal } from './components/layout/SettingsModal';
import { LandingPage } from './components/landing/LandingPage';
import {
  GoogleAccountChooserModal,
  GoogleAccountChoice,
} from './components/auth/GoogleAccountChooserModal';
import { Conversation, EphemeralMessage } from './types';
import { getCanonicalConversationId } from './utils/conversation';
import { apiUrl, getAuthHeaders } from './utils/api';
import { Button } from './components/ui/Button';
import { Radio, WifiOff, RefreshCw } from 'lucide-react';

const INITIAL_CONVERSATIONS: Conversation[] = [];

const INITIAL_MESSAGES: EphemeralMessage[] = [];

const MainContent: React.FC = () => {
  const { toast } = useToast();
  const { user: authUser, csrfToken, isLoading: isAuthLoading, loginWithGoogle, loginWithGoogleAccount } = useAuth();
  const { isOnline, isInstallable, isUpdateAvailable, installPwa, applyUpdate } = usePwa();
  const {
    sendEncryptedMessage,
    onMessageReceived,
    onMessageAck,
    onMessageError,
    onTerminated,
    onExpired,
    terminateConversation,
    connectionStatus,
    presenceMap,
    fetchPeerKeyBundle,
    subscribePresence,
  } = useSocket();

  const [currentView, setCurrentView] = useState<'landing' | 'chat'>('landing');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAccountChooserOpen, setIsAccountChooserOpen] = useState(false);
  const [oauthParams, setOauthParams] = useState<GoogleAuthUrlResponse | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>(INITIAL_CONVERSATIONS);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<EphemeralMessage[]>(INITIAL_MESSAGES);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const handleLogout = useCallback(() => {
    setConversations([]);
    setMessages([]);
    setSelectedConversationId(null);
    setMobileShowChat(false);
    setCurrentView('landing');
  }, []);

  // Wipe conversation and message states immediately when logged out
  useEffect(() => {
    if (!authUser) {
      setConversations([]);
      setMessages([]);
      setSelectedConversationId(null);
      setMobileShowChat(false);
    }
  }, [authUser]);

  // Automatically switch to chat view when user is logged in
  useEffect(() => {
    if (authUser) {
      setCurrentView('chat');
    }
  }, [authUser]);

  // Proactively subscribe to presence of all peer usernames
  useEffect(() => {
    const peerUsernames = conversations.map((c) => c.peer.username);
    if (peerUsernames.length > 0) {
      subscribePresence(peerUsernames);
    }
  }, [conversations, subscribePresence]);

  // Sync real-time presence into conversation list
  const liveConversations = conversations.map((conv) => {
    const isOnline = presenceMap[conv.peer.username.toLowerCase()];
    if (isOnline !== undefined && conv.peer.isOnline !== isOnline) {
      return {
        ...conv,
        peer: { ...conv.peer, isOnline },
      };
    }
    return conv;
  });

  const activeConversation =
    liveConversations.find((c) => c.id === selectedConversationId) || null;

  // Proactively normalize conversation IDs to canonical form when authenticated user changes
  useEffect(() => {
    if (authUser?.username) {
      const username = authUser.username;
      setConversations((prev) => {
        setSelectedConversationId((curr) => {
          if (!curr) return null;
          const match = prev.find((c) => c.id === curr);
          return match ? getCanonicalConversationId(username, match.peer.username) : curr;
        });
        return prev.map((c) => {
          const canonicalId = getCanonicalConversationId(username, c.peer.username);
          return c.id !== canonicalId ? { ...c, id: canonicalId } : c;
        });
      });
    }
  }, [authUser?.username]);

  // 1. Subscribe to real-time incoming messages
  useEffect(() => {
    const unsub = onMessageReceived((incoming) => {
      // If we don't have a conversation with this sender yet, add one dynamically
      setConversations((prev) => {
        const canonicalId = incoming.conversationId;
        const exists = prev.find(
          (c) => c.id === canonicalId || c.peer.username.toLowerCase() === incoming.senderUsername.toLowerCase()
        );
        if (!exists) {
          const newConv: Conversation = {
            id: canonicalId,
            peer: {
              id: `usr_${incoming.senderUsername}`,
              username: incoming.senderUsername,
              displayName: incoming.senderUsername,
              isOnline: true,
            },
            status: 'active',
            startedAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
          };
          return [newConv, ...prev];
        } else if (exists.id !== canonicalId) {
          return prev.map((c) =>
            c.peer.username.toLowerCase() === incoming.senderUsername.toLowerCase()
              ? { ...c, id: canonicalId }
              : c
          );
        }
        return prev;
      });

      // Append decrypted message into in-memory state
      setMessages((prev) => [...prev, incoming]);
    });

    return unsub;
  }, [onMessageReceived]);

  // 2. Subscribe to message delivery & decryption acks from peer
  useEffect(() => {
    const unsub = onMessageAck((ack) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.conversationId === ack.conversationId && m.seq === ack.seq
            ? { ...m, status: 'DECRYPTED_BY_PEER' }
            : m
        )
      );
    });
    return unsub;
  }, [onMessageAck]);

  // 3. Subscribe to relay errors (e.g. RECIPIENT_OFFLINE)
  useEffect(() => {
    const unsub = onMessageError((err) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.conversationId === err.conversationId && m.seq === err.seq
            ? {
                ...m,
                status: 'FAILED_OFFLINE',
                failureReason: err.message || 'User is offline. Message not sent.',
              }
            : m
        )
      );
      toast.error('Message Not Sent', err.message || 'Delivery rejected by live relay.');
    });
    return unsub;
  }, [onMessageError, toast]);

  // 4. Subscribe to conversation termination by peer
  useEffect(() => {
    const unsub = onTerminated((data) => {
      setConversations((prev) => prev.filter((c) => c.id !== data.conversationId));
      setMessages((prev) => prev.filter((m) => m.conversationId !== data.conversationId));
      setSelectedConversationId((curr) => (curr === data.conversationId ? null : curr));
      toast.warning(
        'Conversation Terminated',
        `@${data.terminatedBy} ended and purged this conversation on both ends.`
      );
    });
    return unsub;
  }, [onTerminated, toast]);

  // 4b. Subscribe to conversation inactivity expiration (30-minute inactivity)
  useEffect(() => {
    const unsub = onExpired((data) => {
      setConversations((prev) => prev.filter((c) => c.id !== data.conversationId));
      setMessages((prev) => prev.filter((m) => m.conversationId !== data.conversationId));
      setSelectedConversationId((curr) => (curr === data.conversationId ? null : curr));
      toast.warning(
        'Conversation Expired',
        'This conversation has authoritatively expired after 30 minutes of inactivity. All messages were wiped.'
      );
    });
    return unsub;
  }, [onExpired, toast]);

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    setMobileShowChat(true);
  };

  const handleInitiateNewChat = async (
    username: string,
    peerInfo?: { displayName?: string; avatarUrl?: string }
  ) => {
    if (!authUser) {
      handleGoogleSignInClick();
      return;
    }
    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const canonicalId = getCanonicalConversationId(authUser.username, cleanUsername);
    const existing = conversations.find(
      (c) => c.id === canonicalId || c.peer.username.toLowerCase() === cleanUsername
    );

    if (existing) {
      if (existing.id !== canonicalId) {
        setConversations((prev) =>
          prev.map((c) =>
            c.peer.username.toLowerCase() === cleanUsername ? { ...c, id: canonicalId } : c
          )
        );
      }
      setSelectedConversationId(canonicalId);
      setMobileShowChat(true);
      toast.info('Session located', `Switched to active session with @${cleanUsername}`);
      return;
    }

    // Pre-fetch peer public keys (fresh)
    const bundle = await fetchPeerKeyBundle(cleanUsername, true);

    const isPeerOnline = Boolean(presenceMap[cleanUsername]);

    const newConv: Conversation = {
      id: canonicalId,
      peer: {
        id: `usr_${cleanUsername}`,
        username: cleanUsername,
        displayName: peerInfo?.displayName || username,
        avatarUrl: peerInfo?.avatarUrl,
        isOnline: isPeerOnline,
        hasRegisteredKeys: Boolean(bundle),
      },
      status: 'active',
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
    };

    // Authoritatively reactivate/create conversation record on backend
    try {
      fetch(apiUrl('/api/v1/conversations/initiate'), {
        method: 'POST',
        headers: getAuthHeaders(
          csrfToken
            ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }
            : { 'Content-Type': 'application/json' }
        ),
        body: JSON.stringify({ recipientUsername: cleanUsername, canonicalId }),
        credentials: 'include',
      }).catch(() => {});
    } catch {
      // Handled gracefully
    }

    setConversations((prev) => [newConv, ...prev.filter((c) => c.id !== canonicalId)]);
    setSelectedConversationId(canonicalId);
    setMobileShowChat(true);
    toast.success('Live connection requested', `Initiated live encrypted session with @${cleanUsername}`);
  };

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!activeConversation || !authUser) return;

      const recipient = activeConversation.peer.username;
      const convId = activeConversation.id;

      try {
        const optimisticMsg = await sendEncryptedMessage(convId, recipient, text);
        setMessages((prev) => [...prev, optimisticMsg]);
      } catch (err: unknown) {
        const errMsg = (err as Error).message || 'Failed to send';
        const isOffline =
          errMsg.includes('RECIPIENT_OFFLINE') || errMsg.includes('YOU_ARE_OFFLINE');

        const failedMsg: EphemeralMessage = {
          id: `msg_failed_${Date.now()}`,
          conversationId: convId,
          senderUsername: authUser.username,
          text,
          timestamp: Date.now(),
          status: 'FAILED_OFFLINE',
          failureReason: isOffline
            ? `User @${recipient} is offline. Message not sent.`
            : errMsg,
          isMe: true,
        };

        setMessages((prev) => [...prev, failedMsg]);
        toast.error(
          'Delivery Rejected',
          isOffline ? `User @${recipient} is offline. Message not sent.` : errMsg
        );
      }
    },
    [activeConversation, sendEncryptedMessage, authUser?.username, toast]
  );

  const handleRetryMessage = useCallback(
    async (failedMsg: EphemeralMessage) => {
      // Manual retry: remove failed message and retry sending
      setMessages((prev) => prev.filter((m) => m.id !== failedMsg.id));
      await handleSendMessage(failedMsg.text);
    },
    [handleSendMessage]
  );

  const handleEndConversation = useCallback(
    (conversationId: string) => {
      const target = conversations.find((c) => c.id === conversationId);
      if (target) {
        terminateConversation(conversationId, target.peer.username);
      }
      // Idempotent REST deletion to guarantee authoritative server invalidation
      fetch(apiUrl(`/api/v1/conversations/${encodeURIComponent(conversationId)}`), {
        method: 'DELETE',
        headers: getAuthHeaders(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        credentials: 'include',
      }).catch(() => {});

      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      setMessages((prev) => prev.filter((m) => m.conversationId !== conversationId));
      setSelectedConversationId(null);
      setMobileShowChat(false);
      toast.warning(
        'Conversation Terminated',
        'Session permanently closed. All messages and ephemeral keys wiped from memory on both devices.'
      );
    },
    [conversations, terminateConversation, csrfToken, toast]
  );

  const handleGoogleSignInClick = async () => {
    try {
      const data = await loginWithGoogle();
      if (data) {
        setOauthParams(data);
        if (!data.isMock && data.authUrl) {
          window.location.href = data.authUrl;
          return;
        }
      }
      setIsAccountChooserOpen(true);
    } catch {
      setIsAccountChooserOpen(true);
    }
  };

  const handleAccountSelected = async (account: GoogleAccountChoice) => {
    try {
      await loginWithGoogleAccount(account, oauthParams?.state);
      setCurrentView('chat');
      toast.success(
        'Google Authentication Successful',
        `Signed in as ${account.name} with HttpOnly session cookie.`
      );
    } catch (err: unknown) {
      toast.error('Sign-in failed', (err as Error).message || 'Could not authenticate session.');
      throw err;
    }
  };

  return (
    <div className="flex flex-col h-full h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-background">
      <Navbar
        currentView={currentView}
        onNavigate={(view) => {
          if (view === 'chat' && !authUser) {
            handleGoogleSignInClick();
          } else {
            setCurrentView(view);
          }
        }}
        onSignIn={handleGoogleSignInClick}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLogout={handleLogout}
        isInstallable={isInstallable}
        onInstallPwa={installPwa}
        isLoadingAuth={isAuthLoading}
      />

      {/* Offline Mode Warning Banner */}
      {!isOnline && (
        <aside
          role="alert"
          aria-live="assertive"
          className="bg-accent-crimson/15 border-b border-accent-crimson/30 px-4 py-2 text-xs text-accent-crimson flex items-center justify-between z-40 flex-shrink-0"
        >
          <div className="flex items-center gap-2 max-w-4xl mx-auto w-full">
            <WifiOff className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium text-[11px] sm:text-xs">
              <strong>Offline</strong>: Live encrypted messaging is paused while offline. Reconnect to send messages.
            </span>
          </div>
        </aside>
      )}

      {/* PWA Update Notification Toast */}
      {isUpdateAvailable && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 right-4 z-50 glass-card p-3.5 rounded-2xl border border-primary/40 shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2"
        >
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-foreground">Update Available</span>
            <span className="text-[11px] text-foreground-muted">A new version of textLove is ready to install.</span>
          </div>
          <Button size="sm" variant="primary" onClick={applyUpdate} className="text-xs h-8 px-3 gap-1.5 flex-shrink-0">
            <RefreshCw className="w-3.5 h-3.5" />
            Reload Now
          </Button>
        </div>
      )}

      {/* Accessible Gateway Connection Status Banner */}
      {currentView === 'chat' && isOnline && authUser && connectionStatus !== 'connected' && (
        <aside
          role="status"
          aria-live="polite"
          className={`px-4 py-1.5 text-xs flex items-center justify-between border-b transition-all duration-200 z-30 flex-shrink-0 ${
            connectionStatus === 'reconnecting' || connectionStatus === 'connecting'
              ? 'bg-accent-amber/10 border-accent-amber/30 text-accent-amber'
              : 'bg-accent-crimson/10 border-accent-crimson/30 text-accent-crimson'
          }`}
        >
          <div className="flex items-center gap-2 max-w-4xl mx-auto w-full">
            <Radio className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
            <span className="font-medium text-[11px] sm:text-xs">
              {connectionStatus === 'reconnecting'
                ? 'Reconnecting to secure gateway...'
                : connectionStatus === 'connecting'
                ? 'Connecting to secure gateway...'
                : 'Connection to gateway lost. Reconnecting...'}
            </span>
          </div>
        </aside>
      )}

      <main id="main-content" role="main" className="flex-1 overflow-hidden relative min-h-0">
        {isAuthLoading ? (
          <div className="h-full flex overflow-hidden min-h-0 select-none" aria-label="Loading chat layout">
            {/* Sidebar Skeleton matching actual sidebar layout 1:1 on both mobile and desktop */}
            <div className="h-full flex-shrink-0 flex w-full md:w-80 lg:w-96 border-r border-border bg-surface flex-col select-none animate-pulse">
              {/* User Header Card */}
              <div className="p-4 border-b border-border/70 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-surface-raised border border-border/40 flex-shrink-0" />
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <div className="h-3.5 w-28 bg-surface-raised rounded" />
                    <div className="h-2.5 w-16 bg-surface-raised rounded" />
                  </div>
                </div>
                <div className="w-9 h-9 rounded-xl bg-surface-raised/60 flex-shrink-0" />
              </div>

              {/* Search Bar Skeleton */}
              <div className="p-3 border-b border-border/60">
                <div className="h-10 w-full bg-surface-raised rounded-xl" />
              </div>

              {/* Conversations List Skeleton */}
              <div className="flex-1 p-3 flex flex-col gap-2 overflow-hidden">
                <div className="h-16 w-full bg-surface-raised/40 rounded-xl" />
                <div className="h-16 w-full bg-surface-raised/40 rounded-xl" />
                <div className="h-16 w-full bg-surface-raised/40 rounded-xl" />
              </div>

              {/* Sidebar Footer Skeleton */}
              <div className="p-3 bg-surface-raised/40 border-t border-border flex items-center justify-between">
                <div className="h-3 w-28 bg-surface-raised rounded" />
                <div className="h-3 w-12 bg-surface-raised rounded" />
              </div>
            </div>

            {/* Empty Chat Area Skeleton (hidden on mobile, flex-1 on desktop) */}
            <div className="h-full flex-1 hidden md:flex flex-col items-center justify-center p-6 bg-background">
              <div className="max-w-md w-full flex flex-col items-center text-center animate-pulse">
                <div className="w-12 h-12 rounded-2xl bg-surface-raised mb-6" />
                <div className="h-7 w-56 bg-surface-raised rounded-lg mb-3" />
                <div className="h-4 w-72 bg-surface-raised rounded mb-8" />
                <div className="grid grid-cols-2 gap-3 w-full">
                  <div className="h-20 bg-surface-raised/50 rounded-2xl" />
                  <div className="h-20 bg-surface-raised/50 rounded-2xl" />
                  <div className="h-20 bg-surface-raised/50 rounded-2xl" />
                  <div className="h-20 bg-surface-raised/50 rounded-2xl" />
                </div>
              </div>
            </div>
          </div>
        ) : currentView === 'landing' || !authUser ? (
          <div className="h-full overflow-y-auto">
            <LandingPage
              onEnterChat={() => {
                if (authUser) setCurrentView('chat');
                else handleGoogleSignInClick();
              }}
              onGoogleSignInClick={handleGoogleSignInClick}
            />
          </div>
        ) : (
          <div className="h-full flex overflow-hidden min-h-0">
            {/* Sidebar */}
            <div
              className={`h-full flex-shrink-0 ${
                mobileShowChat ? 'hidden md:flex' : 'flex w-full md:w-auto'
              }`}
            >
              <Sidebar
                currentUser={authUser}
                conversations={liveConversations}
                selectedConversationId={selectedConversationId}
                onSelectConversation={handleSelectConversation}
                onInitiateNewChat={handleInitiateNewChat}
              />
            </div>

            {/* Main Chat Area */}
            <div
              className={`h-full flex-1 flex flex-col min-w-0 min-h-0 ${
                !mobileShowChat ? 'hidden md:flex' : 'flex w-full'
              }`}
            >
              {activeConversation ? (
                <ChatArea
                  conversation={activeConversation}
                  currentUser={authUser}
                  messages={messages.filter((m) => m.conversationId === activeConversation.id)}
                  onSendMessage={handleSendMessage}
                  onRetryMessage={handleRetryMessage}
                  onEndConversation={handleEndConversation}
                  onBackToSidebar={() => setMobileShowChat(false)}
                />
              ) : (
                <EmptyChatState />
              )}
            </div>
          </div>
        )}
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onLogout={handleLogout}
      />

      <GoogleAccountChooserModal
        isOpen={isAccountChooserOpen}
        onClose={() => setIsAccountChooserOpen(false)}
        onSelectAccount={handleAccountSelected}
        onLiveOAuthRedirect={
          oauthParams?.authUrl
            ? () => {
                window.location.href = oauthParams.authUrl;
              }
            : undefined
        }
      />
    </div>
  );
};

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <PwaProvider>
              <MainContent />
            </PwaProvider>
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
