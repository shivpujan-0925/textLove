import React, { useState, useEffect } from 'react';
import { Conversation, User, PublicUser } from '../../types';
import { useSocket } from '../../context/useSocket';
import { Avatar } from '../ui/Avatar';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Search, Plus, UserPlus, Radio, Shield, Clock, Loader2, MessageSquarePlus, ShieldCheck } from 'lucide-react';
import { PrivacyPolicyModal } from '../ui/PrivacyPolicyModal';
import { apiUrl } from '../../utils/api';

interface SidebarProps {
  currentUser: User;
  conversations: Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onInitiateNewChat: (username: string, peerInfo?: { displayName?: string; avatarUrl?: string }) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  conversations,
  selectedConversationId,
  onSelectConversation,
  onInitiateNewChat,
}) => {
  const { presenceMap, subscribePresence } = useSocket();
  const [searchQuery, setSearchQuery] = useState('');
  const [isInitiating, setIsInitiating] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [discoveredUsers, setDiscoveredUsers] = useState<PublicUser[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);

  // Subscribe to presence updates for all conversation peers
  useEffect(() => {
    const peerUsernames = conversations.map((c) => c.peer.username);
    if (peerUsernames.length > 0) {
      subscribePresence(peerUsernames);
    }
  }, [conversations, subscribePresence]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setDiscoveredUsers([]);
      setIsSearchingUsers(false);
      return;
    }

    setIsSearchingUsers(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(apiUrl(`/api/v1/users/search?q=${encodeURIComponent(trimmed)}`), {
          credentials: 'include',
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            // Filter out current user from discovery results
            const filtered = (json.data as PublicUser[]).filter(
              (u) => u.username.toLowerCase() !== currentUser.username.toLowerCase()
            );
            setDiscoveredUsers(filtered);
          }
        }
      } catch {
        // Quiet failure on search network drop
      } finally {
        setIsSearchingUsers(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, currentUser.username]);

  const filteredConversations = conversations.filter(
    (c) =>
      c.peer.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.peer.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStartChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    onInitiateNewChat(newUsername.trim());
    setNewUsername('');
    setIsInitiating(false);
  };

  const handleSelectDiscoveredUser = (u: PublicUser) => {
    onInitiateNewChat(u.username, {
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
    });
    setSearchQuery('');
    setDiscoveredUsers([]);
  };

  return (
    <aside className="w-full md:w-80 lg:w-96 h-full flex flex-col bg-surface border-r border-border select-none">
      {/* User Header Card */}
      <div className="p-4 border-b border-border/70 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar
            name={currentUser.displayName}
            src={currentUser.avatarUrl}
            isOnline={currentUser.isOnline}
            showPresence
            size="md"
          />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-foreground truncate">
              {currentUser.displayName}
            </span>
            <span className="text-xs text-foreground-muted font-mono truncate">
              @{currentUser.username}
            </span>
          </div>
        </div>

        <Button
          variant="glass"
          size="icon"
          onClick={() => setIsInitiating((prev) => !prev)}
          title="New Live Chat"
          aria-label="New Live Chat"
        >
          <Plus className="w-4 h-4 text-primary" />
        </Button>
      </div>

      {/* Initiation Input Bar (collapsible) */}
      {isInitiating && (
        <form onSubmit={handleStartChatSubmit} className="p-3 bg-surface-raised/60 border-b border-border">
          <label className="text-xs font-medium text-foreground-muted block mb-1.5">
            Connect via username:
          </label>
          <div className="flex gap-2">
            <Input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="e.g. alex"
              autoFocus
              className="h-8 text-xs font-mono"
              leftIcon={<UserPlus className="w-3.5 h-3.5" />}
            />
            <Button type="submit" size="sm" className="h-8 text-xs flex-shrink-0">
              Connect
            </Button>
          </div>
          <p className="text-[10px] text-foreground-muted mt-1.5 flex items-center gap-1">
            <Radio className="w-3 h-3 text-accent-emerald inline" />
            Live-only: recipient must be actively online.
          </p>
        </form>
      )}

      {/* Search & Username filter */}
      <div className="p-3 border-b border-border/50">
        <div className="relative">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by username or name..."
            aria-label="Search users or conversations"
            className="h-10 text-xs pr-8"
            leftIcon={
              isSearchingUsers ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )
            }
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setDiscoveredUsers([]);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-foreground-muted hover:text-foreground rounded-md transition-colors"
              aria-label="Clear search input"
            >
              <span className="text-xs font-bold leading-none">&times;</span>
            </button>
          )}
        </div>
      </div>

      {/* Conversations and Discovery List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/30">
        {/* Discovered Users Section when searching */}
        {searchQuery.trim().length >= 2 && (
          <div className="p-2 bg-surface-raised/30 border-b border-border/40">
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-foreground-muted uppercase tracking-wider">
              <span>Public Directory (@{searchQuery.trim()})</span>
              {isSearchingUsers && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
            </div>

            {isSearchingUsers ? (
              <div className="flex flex-col gap-1.5 mt-1 px-1">
                {[1, 2].map((k) => (
                  <div
                    key={k}
                    className="p-2.5 rounded-xl flex items-center justify-between gap-3 bg-surface border border-border/60"
                  >
                    <div className="flex items-center gap-2.5 w-full">
                      <div className="w-8 h-8 rounded-full skeleton-shimmer flex-shrink-0" />
                      <div className="flex flex-col gap-1.5 flex-1">
                        <div className="w-24 h-3 rounded skeleton-shimmer" />
                        <div className="w-16 h-2 rounded skeleton-shimmer" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : discoveredUsers.length > 0 ? (
              <div className="flex flex-col gap-1 mt-1">
                {discoveredUsers.map((u) => (
                  <div
                    key={u.username}
                    className="p-2 rounded-xl flex items-center justify-between gap-3 bg-surface hover:bg-surface-raised border border-border/60 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        name={u.displayName}
                        src={u.avatarUrl}
                        size="sm"
                        isOnline={u.isOnline || false}
                        showPresence
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {u.displayName}
                        </span>
                        <span className="text-[10px] text-foreground-muted font-mono truncate">
                          @{u.username}
                        </span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="glass"
                      onClick={() => handleSelectDiscoveredUser(u)}
                      className="h-8 px-2.5 text-xs gap-1 flex-shrink-0 min-h-[32px]"
                      aria-label={`Start live encrypted chat with ${u.displayName}`}
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5 text-primary" />
                      Chat
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-2 py-2 text-[11px] text-foreground-muted">
                No matching public users found for &quot;{searchQuery.trim()}&quot;
              </p>
            )}
          </div>
        )}

        {/* Existing active conversations */}
        {filteredConversations.length > 0 ? (
          filteredConversations.map((conv) => {
            const isSelected = conv.id === selectedConversationId;
            const isOnline = presenceMap?.[conv.peer.username.toLowerCase()] ?? conv.peer.isOnline;
            return (
              <button
                key={conv.id}
                role="button"
                aria-pressed={isSelected}
                aria-label={`Conversation with ${conv.peer.displayName}, ${isOnline ? 'Online' : 'Offline'}`}
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full text-left p-3.5 flex items-start gap-3 transition-all min-h-[56px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isSelected
                    ? 'bg-surface-raised border-l-2 border-primary shadow-xs'
                    : 'hover:bg-surface-raised/60 active:bg-surface-raised/80'
                }`}
              >
                <Avatar
                  name={conv.peer.displayName}
                  src={conv.peer.avatarUrl}
                  isOnline={isOnline}
                  showPresence
                  size="md"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-medium text-foreground truncate">
                      {conv.peer.displayName}
                    </span>
                    <span className="text-[10px] text-foreground-muted font-mono flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      30m
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-foreground-muted font-mono truncate">
                      @{conv.peer.username}
                    </span>

                    {isOnline ? (
                      <span className="text-[10px] font-medium text-accent-emerald flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald" />
                        Live
                      </span>
                    ) : (
                      <span className="text-[10px] text-foreground-muted">Offline</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        ) : searchQuery.trim().length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center text-foreground-muted">
            <div className="w-10 h-10 rounded-full bg-surface-raised flex items-center justify-center mb-3">
              <Shield className="w-5 h-5 text-foreground-muted" />
            </div>
            <p className="text-xs font-medium text-foreground">No active sessions</p>
            <p className="text-[11px] text-foreground-muted mt-1 max-w-[200px]">
              Click the + button above to start a live encrypted conversation.
            </p>
          </div>
        ) : null}
      </div>

      {/* Sidebar Footer Notice with Copyright & Privacy Tag */}
      <div className="p-3 bg-surface-raised/40 border-t border-border text-[11px] text-foreground-muted flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald" />
            Live ephemeral session
          </span>
          <span className="flex items-center gap-1 text-[10px] text-foreground-muted font-medium">
            <Shield className="w-3 h-3 text-primary" />
            E2EE
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px] text-foreground-muted/80 pt-1.5 border-t border-border/40">
          <span>&copy; {new Date().getFullYear()} textLove</span>
          <button
            type="button"
            onClick={() => setIsPrivacyModalOpen(true)}
            className="hover:text-primary transition-colors hover:underline cursor-pointer flex items-center gap-1"
            title="View Zero-Retention Privacy Policy"
            aria-label="View Zero-Retention Privacy Policy"
          >
            <ShieldCheck className="w-3 h-3 text-accent-emerald" />
            <span>Privacy</span>
          </button>
        </div>
      </div>

      {/* Production Privacy Policy Modal */}
      <PrivacyPolicyModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
      />
    </aside>
  );
};
