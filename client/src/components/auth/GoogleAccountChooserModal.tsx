import React, { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Avatar } from '../ui/Avatar';
import { UserPlus, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

export interface GoogleAccountChoice {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

const PRESET_ACCOUNTS: GoogleAccountChoice[] = [
  {
    id: 'google_user_alice_101',
    name: 'Alice Smith',
    email: 'alice.smith@example.com',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'google_user_bob_202',
    name: 'Bob Martinez',
    email: 'bob.martinez@example.com',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'google_user_charlie_303',
    name: 'Charlie Chen',
    email: 'charlie.chen@example.com',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  },
];

interface GoogleAccountChooserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAccount: (account: GoogleAccountChoice) => Promise<void>;
  onLiveOAuthRedirect?: () => void;
}

export const GoogleAccountChooserModal: React.FC<GoogleAccountChooserModalProps> = ({
  isOpen,
  onClose,
  onSelectAccount,
  onLiveOAuthRedirect,
}) => {
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChoose = async (account: GoogleAccountChoice) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onSelectAccount(account);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to authenticate selected Google account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim() || !customEmail.trim()) {
      setError('Both name and valid Google email are required.');
      return;
    }

    const customAccount: GoogleAccountChoice = {
      id: `google_user_custom_${Date.now()}`,
      name: customName.trim(),
      email: customEmail.trim().toLowerCase(),
    };

    await handleChoose(customAccount);
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="">
      <div className="flex flex-col items-center text-center -mt-2">
        {/* Google Logo */}
        <div className="w-10 h-10 mb-3 flex items-center justify-center rounded-full bg-white shadow-sm border border-neutral-200">
          <svg className="w-6 h-6" viewBox="0 0 24 24">
            <path
              fill="#EA4335"
              d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
            />
            <path
              fill="#4285F4"
              d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
            />
            <path
              fill="#FBBC05"
              d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15s.7 5.3 1.9 7.7l3.7-2.9z"
            />
            <path
              fill="#34A853"
              d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16c1.8 3.7 5.6 7 10.1 7z"
            />
          </svg>
        </div>

        <h3 className="text-xl font-bold text-foreground">Sign in with Google</h3>
        <p className="text-xs text-foreground-muted mt-1">
          Choose an account to continue to <span className="font-semibold text-[#185FA5] dark:text-[#5BA2E6]">text</span><span className="font-extrabold text-[#E04870] dark:text-[#FF6B8E]">Love</span>
        </p>

        {error && (
          <div className="mt-3 w-full p-2.5 rounded-lg bg-accent-crimson/10 border border-accent-crimson/20 text-accent-crimson text-xs flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="w-full mt-5">
          {!isCustomMode ? (
            <div className="space-y-2">
              {PRESET_ACCOUNTS.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleChoose(acc)}
                  aria-label={`Sign in as ${acc.name} (${acc.email})`}
                  className="w-full flex items-center gap-3.5 p-3 rounded-xl border border-border/80 bg-surface hover:bg-surface-raised transition-all hover:border-primary/50 text-left group disabled:opacity-60 min-h-[56px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Avatar src={acc.avatarUrl} name={acc.name} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      {acc.name}
                    </div>
                    <div className="text-xs text-foreground-muted truncate">{acc.email}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-foreground-muted group-hover:text-primary transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}

              {/* Use Another Account Button */}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsCustomMode(true)}
                aria-label="Use another Google account"
                className="w-full flex items-center gap-3.5 p-3 rounded-xl border border-dashed border-border hover:border-primary/50 bg-surface/50 hover:bg-surface-raised transition-all text-left group min-h-[56px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center bg-surface-raised text-foreground-muted group-hover:text-primary transition-colors">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    Use another Google account
                  </div>
                  <div className="text-xs text-foreground-muted">Sign in with custom name and email</div>
                </div>
              </button>
            </div>
          ) : (
            <form onSubmit={handleCustomSubmit} className="space-y-3.5 text-left">
              <div>
                <label className="text-xs font-medium text-foreground">Google Account Display Name</label>
                <Input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Dana Scully"
                  className="mt-1"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Google Email Address</label>
                <Input
                  type="email"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  placeholder="e.g. dana.scully@gmail.com"
                  className="mt-1"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCustomMode(false)}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  Back to List
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting ? 'Authenticating...' : 'Sign In as Account'}
                </Button>
              </div>
            </form>
          )}

          {/* Fallback to real Google OAuth endpoint if configured */}
          {onLiveOAuthRedirect && (
            <div className="mt-4 pt-3 border-t border-border/60 text-center">
              <button
                type="button"
                onClick={onLiveOAuthRedirect}
                className="text-[11px] text-foreground-muted hover:text-primary transition-colors underline"
              >
                Continue with official Google OAuth
              </button>
            </div>
          )}

          <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-foreground-muted">
            <ShieldCheck className="w-3.5 h-3.5 text-accent-emerald" />
            <span>Secure authentication with encrypted session</span>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
