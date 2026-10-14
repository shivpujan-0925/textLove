import React, { useState, useEffect, useRef } from 'react';
import { Conversation, EphemeralMessage, User } from '../../types';
import { KeyStore } from '../../crypto/keyStore';
import { useSocket } from '../../context/useSocket';
import { usePwa } from '../../context/usePwa';
import { apiUrl } from '../../utils/api';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Dialog } from '../ui/Dialog';
import { EmojiPicker } from '../chat/EmojiPicker';
import {
  ArrowLeft,
  ShieldCheck,
  Trash2,
  Send,
  Clock,
  Check,
  CheckCheck,
  AlertCircle,
  QrCode,
  Lock,
  RotateCcw,
  ChevronDown,
  Copy,
} from 'lucide-react';

interface ChatAreaProps {
  conversation: Conversation;
  currentUser: User;
  messages: EphemeralMessage[];
  onSendMessage: (text: string) => void;
  onRetryMessage?: (message: EphemeralMessage) => void;
  onEndConversation: (conversationId: string) => void;
  onBackToSidebar?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  conversation,
  currentUser: _currentUser,
  messages,
  onSendMessage,
  onRetryMessage,
  onEndConversation,
  onBackToSidebar,
}) => {
  const [inputText, setInputText] = useState('');
  const [showSafetyNumber, setShowSafetyNumber] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [peerIdentityPublicKey, setPeerIdentityPublicKey] = useState<string | null>(null);
  const [peerIsTyping, setPeerIsTyping] = useState(false);
  const [remainingTime, setRemainingTime] = useState<string>('30:00');
  const [remainingMs, setRemainingMs] = useState<number>(30 * 60 * 1000);
  const [copiedSafetyNumber, setCopiedSafetyNumber] = useState(false);
  const [keyChangedWarning, setKeyChangedWarning] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const initialPeerKeyRef = useRef<string | null>(null);

  const { fetchPeerKeyBundle, sendTyping, onTyping, subscribePresence, presenceMap } = useSocket();
  const { isOnline } = usePwa();
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevMessagesLength = useRef(messages.length);

  const isPeerOnline =
    presenceMap?.[conversation.peer.username.toLowerCase()] ?? conversation.peer.isOnline;

  // Subscribe to peer's presence when chat opens or changes
  useEffect(() => {
    if (conversation.peer.username) {
      subscribePresence([conversation.peer.username]);
    }
  }, [conversation.peer.username, subscribePresence]);

  // Track scroll position to allow user to scroll up and view previous messages
  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceToBottom < 60;
    isAtBottomRef.current = atBottom;
    setShowScrollBottom(distanceToBottom > 150);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({
        top: el.scrollHeight,
        behavior,
      });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  };

  // Auto-scroll to bottom only when user is already at bottom or when user sends a new message
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    const isNewMessage = messages.length > prevMessagesLength.current;
    prevMessagesLength.current = messages.length;

    if (isNewMessage) {
      // If I sent the message or was already at bottom, scroll down to reveal it
      if (lastMsg?.isMe || isAtBottomRef.current) {
        scrollToBottom('smooth');
      }
    } else if (isAtBottomRef.current) {
      scrollToBottom('auto');
    }
  }, [messages, peerIsTyping]);

  // Fetch peer public key bundle for accurate Safety Number calculation & key-change detection
  useEffect(() => {
    let isMounted = true;
    const cleanPeer = conversation.peer.username.replace(/^@/, '').trim();
    const loadPeerKey = async () => {
      try {
        const bundle = await fetchPeerKeyBundle(cleanPeer, true);
        if (isMounted && bundle) {
          if (initialPeerKeyRef.current && initialPeerKeyRef.current !== bundle.identityPublicKey) {
            setKeyChangedWarning(true);
          } else if (!initialPeerKeyRef.current) {
            initialPeerKeyRef.current = bundle.identityPublicKey;
          }
          setPeerIdentityPublicKey(bundle.identityPublicKey);
        }
      } catch {
        // Fallback handled gracefully
      }
    };
    loadPeerKey();
    return () => {
      isMounted = false;
    };
  }, [conversation.peer.username, isPeerOnline, fetchPeerKeyBundle]);

  // Listen for peer typing events in this conversation
  useEffect(() => {
    const unsub = onTyping((data) => {
      if (
        data.conversationId === conversation.id &&
        data.senderUsername.toLowerCase() === conversation.peer.username.toLowerCase()
      ) {
        setPeerIsTyping(data.isTyping);
      }
    });
    return unsub;
  }, [conversation.id, conversation.peer.username, onTyping]);

  // Check server-authoritative status on mount / reconnect
  useEffect(() => {
    let isMounted = true;
    const verifyStatus = async () => {
      try {
        const res = await fetch(apiUrl(`/api/v1/conversations/${encodeURIComponent(conversation.id)}/status`), {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success && data.conversation) {
            if (data.conversation.status === 'expired' || data.conversation.status === 'closed') {
              onEndConversation(conversation.id);
            }
          }
        }
      } catch {
        // Handled gracefully
      }
    };
    verifyStatus();
    return () => {
      isMounted = false;
    };
  }, [conversation.id, onEndConversation]);

  // Live countdown timer for 30m inactivity auto-expiry with dynamic warning states
  useEffect(() => {
    const updateCountdown = () => {
      const expiresAt = new Date(conversation.expiresAt).getTime();
      const diff = Math.max(0, expiresAt - Date.now());
      setRemainingMs(diff);
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemainingTime(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
      if (diff <= 0) {
        onEndConversation(conversation.id);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [conversation.expiresAt, conversation.id, onEndConversation]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);

    // Debounced typing indicator emission
    sendTyping(conversation.id, conversation.peer.username, true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(conversation.id, conversation.peer.username, false);
    }, 2000);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTyping(conversation.id, conversation.peer.username, false);

    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handleSelectEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
  };

  const getDeliveryIcon = (status: EphemeralMessage['status']) => {
    switch (status) {
      case 'PENDING_RELAY':
        return (
          <span title="Sending...">
            <Clock className="w-3.5 h-3.5 text-foreground-muted animate-spin" />
          </span>
        );
      case 'RELAYED_TO_NETWORK':
        return (
          <span title="Sent">
            <Check className="w-3.5 h-3.5 text-foreground-muted" />
          </span>
        );
      case 'DELIVERED_TO_PEER':
        return (
          <span title="Delivered">
            <CheckCheck className="w-3.5 h-3.5 text-foreground-muted" />
          </span>
        );
      case 'DECRYPTED_BY_PEER':
        return (
          <span title="Read">
            <CheckCheck className="w-3.5 h-3.5 text-accent-emerald" />
          </span>
        );
      case 'FAILED_OFFLINE':
        return (
          <span title="Recipient offline">
            <AlertCircle className="w-3.5 h-3.5 text-accent-crimson" />
          </span>
        );
      case 'DELIVERY_UNCERTAIN':
        return (
          <span title="Delivery uncertain">
            <AlertCircle className="w-3.5 h-3.5 text-accent-amber" />
          </span>
        );
    }
  };

  // Compute symmetric safety number formatted into 4 groups of 3 digits
  const safetyNumberFormatted = (() => {
    try {
      const ks = KeyStore.getInstance();
      ks.ensureKeys();
      if (peerIdentityPublicKey) {
        const raw = ks.getSafetyNumber(peerIdentityPublicKey);
        return raw.replace(/-/g, '  ');
      }
      return 'Calculating...';
    } catch {
      return 'Not available';
    }
  })();

  const handleCopySafetyNumber = () => {
    if (safetyNumberFormatted && !safetyNumberFormatted.includes('...')) {
      navigator.clipboard.writeText(safetyNumberFormatted.replace(/\s+/g, ' '));
      setCopiedSafetyNumber(true);
      setTimeout(() => setCopiedSafetyNumber(false), 2000);
    }
  };

  return (
    <main className="flex-1 h-full min-h-0 min-w-0 flex flex-col bg-background overflow-hidden relative">
      {/* Chat Top Header */}
      <header className="h-14 sm:h-16 px-3 sm:px-6 glass-panel border-b border-border/80 flex items-center justify-between z-10 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {onBackToSidebar && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBackToSidebar}
              className="md:hidden -ml-2"
              aria-label="Back to conversations"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </Button>
          )}

          <Avatar
            name={conversation.peer.displayName}
            src={conversation.peer.avatarUrl}
            isOnline={isPeerOnline}
            showPresence
            size="md"
          />

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground truncate">
                {conversation.peer.displayName}
              </span>
              <span className="text-xs text-foreground-muted font-mono hidden sm:inline">
                @{conversation.peer.username}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isPeerOnline ? (
                <span className="text-[11px] font-medium text-accent-emerald flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald" />
                  Active now
                </span>
              ) : (
                <span className="text-[11px] text-foreground-muted flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground-muted/50" />
                  Offline
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Controls: Inactivity Timer, Safety Number, Delete for Both */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Authoritative Expiry Countdown Pill */}
          <div
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full border text-[11px] sm:text-xs font-mono transition-colors ${
              remainingMs <= 60000
                ? 'bg-accent-crimson/15 border-accent-crimson/40 text-accent-crimson animate-pulse font-semibold'
                : remainingMs <= 300000
                ? 'bg-accent-amber/15 border-accent-amber/40 text-accent-amber'
                : 'bg-surface-raised border-border text-foreground-muted'
            }`}
            title={`Conversation authoritatively expires after 30 minutes of inactivity (${remainingTime} remaining)`}
            role="timer"
            aria-label={`Inactivity timer: ${remainingTime} remaining`}
          >
            <Clock
              className={`w-3.5 h-3.5 ${
                remainingMs <= 60000
                  ? 'text-accent-crimson'
                  : remainingMs <= 300000
                  ? 'text-accent-amber'
                  : 'text-foreground-muted'
              }`}
            />
            <span>{remainingTime}</span>
          </div>

          {/* Safety Number Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                const cleanPeer = conversation.peer.username.replace(/^@/, '').trim();
                const bundle = await fetchPeerKeyBundle(cleanPeer, true);
                if (bundle) setPeerIdentityPublicKey(bundle.identityPublicKey);
              } catch {
                // Handled
              }
              setShowSafetyNumber(true);
            }}
            className="gap-1.5 text-xs text-foreground-muted hover:text-foreground"
            title="Verify E2EE Safety Number"
            aria-label="Verify E2EE Safety Number"
          >
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="hidden lg:inline">Safety Number</span>
          </Button>

          {/* Delete for Both */}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowConfirmDelete(true)}
            className="gap-1.5 text-xs"
            title="Permanently End and Delete for Both"
            aria-label="Permanently End and Delete for Both"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">End & Delete</span>
          </Button>
        </div>
      </header>

      {/* Key-Change Warning Banner */}
      {keyChangedWarning && (
        <aside
          role="alert"
          className="p-3 bg-accent-amber/15 border-b border-accent-amber/30 text-accent-amber text-xs flex items-center justify-between gap-3 px-4 sm:px-6 z-10"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">
              <strong>Security Warning:</strong> @{conversation.peer.username}&apos;s identity key changed. Verify Safety Numbers before continuing.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowSafetyNumber(true)}
            className="h-7 text-xs flex-shrink-0 border-accent-amber/40 text-accent-amber hover:bg-accent-amber/10"
          >
            Verify Keys
          </Button>
        </aside>
      )}

      {/* Message Stream */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 overscroll-contain"
      >
        {/* Security & Inactivity Banner Pill */}
        <div className="flex justify-center my-2">
          <div className="max-w-md px-3.5 py-1.5 rounded-full glass-card text-center text-[11px] text-foreground-muted flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span>
              End-to-end encrypted. Zero server retention.
            </span>
          </div>
        </div>

        {/* Messages */}
        {messages.map((msg) => {
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[70%] px-4 py-2.5 rounded-2xl shadow-sm text-sm break-words ${
                  msg.isMe
                    ? msg.status === 'FAILED_OFFLINE'
                      ? 'bg-accent-crimson/10 border border-accent-crimson/30 text-foreground rounded-br-sm'
                      : 'bg-primary/10 dark:bg-primary/20 border border-primary/25 dark:border-primary/35 text-foreground rounded-br-sm'
                    : 'bg-surface-raised border border-border text-foreground rounded-bl-sm'
                }`}
              >
                <p className="leading-relaxed">{msg.text}</p>
                <div
                  className={`flex items-center justify-end gap-1.5 mt-1 text-[10px] ${
                    msg.isMe && msg.status === 'FAILED_OFFLINE'
                      ? 'text-accent-crimson'
                      : 'text-foreground-muted'
                  }`}
                >
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {msg.isMe && getDeliveryIcon(msg.status)}
                </div>
              </div>

              {/* Offline failure reason & manual retry button */}
              {msg.isMe && (msg.status === 'FAILED_OFFLINE' || msg.status === 'DELIVERY_UNCERTAIN') && (
                <div className="flex items-center gap-2 mt-1 text-xs text-accent-crimson">
                  <span>{msg.failureReason || 'Recipient offline. Message not sent.'}</span>
                  {onRetryMessage && (
                    <button
                      type="button"
                      onClick={() => onRetryMessage(msg)}
                      className="inline-flex items-center gap-1 font-medium underline hover:text-accent-crimson/80 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Real-time Peer Typing Indicator */}
        {peerIsTyping && (
          <div className="flex items-center gap-2 text-xs text-foreground-muted animate-in fade-in duration-200">
            <span className="flex gap-1 items-center px-3 py-1.5 rounded-full bg-surface-raised border border-border">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
              <span className="ml-1 text-[11px] font-mono">@{conversation.peer.username} is typing...</span>
            </span>
          </div>
        )}

      </div>

      {/* Message Input Footer with Emoji Picker */}
      <footer className="p-2 sm:p-4 glass-panel border-t border-border/80 flex-shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <form onSubmit={handleSend} className="flex items-center gap-1.5 sm:gap-2 max-w-4xl mx-auto w-full min-w-0">
          {/* Emoji Picker */}
          <EmojiPicker
            onSelectEmoji={handleSelectEmoji}
            disabled={!isPeerOnline || !isOnline}
          />

          <Input
            value={inputText}
            onChange={handleInputChange}
            placeholder={
              !isOnline
                ? 'You are offline. Live messaging is disabled (zero message queue policy).'
                : isPeerOnline
                ? `Live encrypted message to @${conversation.peer.username}...`
                : 'Peer is offline. Live messaging only.'
            }
            disabled={!isPeerOnline || !isOnline}
            className="flex-1 h-10 sm:h-11 text-xs sm:text-sm"
          />

          <Button
            type="submit"
            disabled={!inputText.trim() || !isPeerOnline || !isOnline}
            className="h-10 sm:h-11 px-3 sm:px-5 gap-1.5 sm:gap-2 flex-shrink-0"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </Button>
        </form>
      </footer>

      {/* Safety Number Modal */}
      <Dialog
        isOpen={showSafetyNumber}
        onClose={() => setShowSafetyNumber(false)}
        title="E2EE Safety Number Verification"
        description="Verify cryptographic fingerprints to mathematically guarantee no third party is intercepting your connection."
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="p-4 rounded-2xl bg-surface-raised border border-border flex items-center justify-center shadow-inner">
            <QrCode className="w-32 h-32 text-foreground" />
          </div>

          <div className="w-full bg-surface-raised/80 p-3.5 rounded-xl border border-border flex flex-col items-center gap-2">
            <span className="text-[11px] text-foreground-muted block">
              Cryptographic Safety Number (SHA-256 Digest)
            </span>
            <span className="font-mono text-base sm:text-lg font-bold tracking-widest text-primary select-all">
              {safetyNumberFormatted}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopySafetyNumber}
              className="h-7 text-xs gap-1.5 mt-1"
            >
              {copiedSafetyNumber ? (
                <>
                  <Check className="w-3.5 h-3.5 text-accent-emerald" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-foreground-muted" />
                  <span>Copy Fingerprint</span>
                </>
              )}
            </Button>
          </div>

          <p className="text-xs text-foreground-muted leading-relaxed max-w-sm">
            Compare these 12 digits with @{conversation.peer.username}. If the numbers match on both devices, your connection is cryptographically guaranteed against Man-in-the-Middle (MitM) attacks.
          </p>

          <Button
            variant="secondary"
            className="w-full mt-2"
            onClick={() => setShowSafetyNumber(false)}
          >
            Verified & Done
          </Button>
        </div>
      </Dialog>

      {/* Confirm Delete for Both Modal */}
      <Dialog
        isOpen={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
        title="Permanently End & Delete for Both?"
        description="This action cannot be undone. All messages and cryptographic keys will be instantly purged from memory on both devices."
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="p-3.5 rounded-xl bg-accent-crimson/10 border border-accent-crimson/30 text-accent-crimson text-xs leading-relaxed space-y-2">
            <p className="font-semibold">Authoritative Deletion for Both Participants:</p>
            <p>
              Because textLove operates with zero server message retention, once ended, the conversation is permanently closed for both users. All ephemeral session keys, active websocket routes, and in-memory messages will be immediately destroyed on both devices.
            </p>
            <p className="text-foreground-muted border-t border-accent-crimson/20 pt-2 font-normal">
              Notice: Previously viewed, copied, photographed, or independently retained content cannot be reliably erased from another person's device.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 mt-2">
            <Button variant="ghost" onClick={() => setShowConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowConfirmDelete(false);
                onEndConversation(conversation.id);
              }}
            >
              Yes, Delete for Both
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Floating scroll-to-bottom button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={() => {
            scrollToBottom('smooth');
            setShowScrollBottom(false);
            isAtBottomRef.current = true;
          }}
          className="absolute bottom-20 right-6 p-2 rounded-full bg-surface-raised border border-border shadow-lg hover:bg-surface-raised/80 transition-all text-foreground z-20 flex items-center justify-center animate-in fade-in zoom-in-95 cursor-pointer"
          title="Scroll to latest messages"
          aria-label="Scroll to latest messages"
        >
          <ChevronDown className="w-4 h-4 text-primary" />
        </button>
      )}
    </main>
  );
};
