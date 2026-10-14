import React from 'react';
import { useTheme } from '../../context/useTheme';
import { useAuth } from '../../context/useAuth';
import { useSocket } from '../../context/useSocket';
import { usePwa } from '../../context/usePwa';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import { BrandLogo } from '../ui/BrandLogo';
import {
  Sun,
  Moon,
  Laptop,
  Settings,
  MessageSquare,
  LogOut,
  Download,
} from 'lucide-react';

interface NavbarProps {
  currentView?: 'landing' | 'chat';
  onNavigate?: (view: 'landing' | 'chat') => void;
  onOpenSettings: () => void;
  isInstallable?: boolean;
  onInstallPwa?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView = 'chat',
  onNavigate = () => {},
  onOpenSettings,
  isInstallable,
  onInstallPwa,
}) => {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const { connectionStatus } = useSocket();
  const pwa = usePwa();
  const showInstall = isInstallable ?? pwa.isInstallable;
  const handleInstall = onInstallPwa ?? pwa.installPwa;

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-border/80 px-4 sm:px-6 h-16 flex items-center justify-between">
      {/* Brand Logo */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onNavigate('landing')}
          className="flex items-center text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded-xl p-0.5"
          aria-label="textLove Home"
        >
          <BrandLogo size="md" showText={true} textSize="text-lg" />
        </button>

        {/* Clean, product-level live connection indicator */}
        {currentView === 'chat' && (
          <div className="hidden sm:flex items-center ml-1">
            {connectionStatus === 'connected' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/20 select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald" />
                Live
              </span>
            ) : connectionStatus === 'connecting' || connectionStatus === 'reconnecting' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent-amber/10 text-accent-amber border border-accent-amber/20 select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-amber animate-pulse" />
                Connecting
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent-crimson/10 text-accent-crimson border border-accent-crimson/20 select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-crimson" />
                Offline
              </span>
            )}
          </div>
        )}
      </div>

      {/* Navigation & Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* View Switcher Button (shown on landing page) */}
        {currentView === 'landing' && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigate('chat')}
            className="gap-1.5"
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">Open Chat</span>
          </Button>
        )}

        {/* Install PWA Prompt Button */}
        {showInstall && (
          <Button
            variant="glass"
            size="sm"
            onClick={handleInstall}
            className="gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/10"
            title="Install textLove Application"
            aria-label="Install textLove App"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Install App</span>
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
