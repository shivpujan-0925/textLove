import React, { useEffect, useState } from 'react';
import { useTheme } from '../../context/useTheme';
import { useAuth } from '../../context/useAuth';
import { useSocket } from '../../context/useSocket';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';
import {
  Heart,
  Sun,
  Moon,
  Laptop,
  Settings,
  MessageSquare,
  Sparkles,
  LogOut,
  Radio,
} from 'lucide-react';

interface NavbarProps {
  currentView: 'landing' | 'chat';
  onNavigate: (view: 'landing' | 'chat') => void;
  onOpenSettings: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  onOpenSettings,
}) => {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const { connectionStatus } = useSocket();
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);

  // Probe the backend health endpoint
  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setBackendHealthy(data.status === 'healthy');
        } else {
          if (isMounted) setBackendHealthy(false);
        }
      } catch {
        if (isMounted) setBackendHealthy(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-border/80 px-4 sm:px-6 h-16 flex items-center justify-between">
      {/* Brand Logo */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-2.5 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded-xl p-1"
          aria-label="textLove Home"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary to-accent-rose flex items-center justify-center shadow-md shadow-primary/20 group-hover:scale-105 transition-transform">
            <Heart className="w-5 h-5 text-white fill-white/20" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-base tracking-tight text-foreground font-sans">
                text<span className="text-primary font-bold">Love</span>
              </span>
              <Badge variant="purple" className="text-[10px] px-1.5 py-0 h-4 font-mono">
                E2EE
              </Badge>
            </div>
            <span className="text-[11px] text-foreground-muted -mt-0.5 hidden sm:block">
              zero-retention messaging
            </span>
          </div>
        </button>

        {/* Live connection status indicator */}
        <div className="hidden md:flex items-center ml-2">
          {user ? (
            connectionStatus === 'connected' ? (
              <Badge variant="emerald" className="gap-1 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse" />
                Live Connected
              </Badge>
            ) : connectionStatus === 'connecting' ? (
              <Badge variant="amber" className="gap-1 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-amber animate-pulse" />
                Connecting...
              </Badge>
            ) : connectionStatus === 'reconnecting' ? (
              <Badge variant="amber" className="gap-1 text-[11px]">
                <Radio className="w-3 h-3 text-accent-amber animate-spin" />
                Reconnecting...
              </Badge>
            ) : (
              <Badge variant="crimson" className="gap-1 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-crimson" />
                Disconnected
              </Badge>
            )
          ) : backendHealthy === true ? (
            <Badge variant="emerald" className="gap-1 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse" />
              API Online
            </Badge>
          ) : backendHealthy === false ? (
            <Badge variant="crimson" className="gap-1 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-crimson" />
              API Offline
            </Badge>
          ) : (
            <Badge variant="default" className="text-[11px]">Connecting...</Badge>
          )}
        </div>
      </div>

      {/* Navigation & Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* View Switcher Button */}
        {currentView === 'landing' ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigate('chat')}
            className="gap-1.5"
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Open Chat</span>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate('landing')}
            className="gap-1.5"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="hidden sm:inline">About textLove</span>
          </Button>
        )}

        {/* Theme Switcher */}
        <div className="flex items-center bg-surface-raised border border-border rounded-xl p-0.5">
          <button
            onClick={() => setTheme('light')}
            className={`p-1.5 rounded-lg transition-colors ${
              theme === 'light'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-foreground-muted hover:text-foreground'
            }`}
            title="Light Theme"
            aria-label="Light Theme"
          >
            <Sun className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`p-1.5 rounded-lg transition-colors ${
              theme === 'dark'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-foreground-muted hover:text-foreground'
            }`}
            title="Dark Theme"
            aria-label="Dark Theme"
          >
            <Moon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTheme('system')}
            className={`p-1.5 rounded-lg transition-colors ${
              theme === 'system'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-foreground-muted hover:text-foreground'
            }`}
            title="System Theme"
            aria-label="System Theme"
          >
            <Laptop className="w-4 h-4" />
          </button>
        </div>

        {/* Settings Dialog Trigger */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          title="Settings & Privacy"
          aria-label="Settings and Privacy"
        >
          <Settings className="w-4 h-4 text-foreground-muted hover:text-foreground" />
        </Button>

        {/* Authenticated User Pill & Quick Logout */}
        {user && (
          <div className="flex items-center gap-2 pl-1 border-l border-border/60">
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-surface-raised transition-colors text-left"
              title="View your profile in settings"
            >
              <Avatar src={user.avatarUrl} name={user.displayName || user.username} size="sm" />
              <div className="hidden lg:flex flex-col">
                <span className="text-xs font-semibold text-foreground leading-tight max-w-[100px] truncate">
                  {user.displayName}
                </span>
                <span className="text-[10px] text-primary font-mono leading-tight truncate">
                  @{user.username}
                </span>
              </div>
            </button>

            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await logout();
                onNavigate('landing');
              }}
              title="Log out and revoke session"
              aria-label="Log Out"
              className="text-foreground-muted hover:text-accent-crimson hover:bg-accent-crimson/10"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
};
