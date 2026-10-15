import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/useTheme';
import { useToast } from '../../context/useToast';
import { useAuth } from '../../context/useAuth';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Avatar } from '../ui/Avatar';
import { PrivacyPolicyModal } from '../ui/PrivacyPolicyModal';
import { cn } from '../../utils/cn';
import {
  Sun,
  Moon,
  Laptop,
  Shield,
  Trash2,
  Lock,
  Zap,
  Clock,
  LogOut,
  AtSign,
  Camera,
  Loader2,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout?: () => void;
}

const USERNAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const AVATAR_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onLogout,
}) => {
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const { user, updateUsername, updateProfile, uploadAvatar, deleteAccount, logout } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [newUsername, setNewUsername] = useState(user?.username || '');
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // Periodic tick to keep cooldown countdowns fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Keep form inputs synced when user profile updates
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setNewUsername(user.username || '');
    }
  }, [user?.displayName, user?.username]);

  // Cooldown calculation helper
  const getCooldown = (lastChangedAt?: string, cooldownMs: number = 0) => {
    if (!lastChangedAt) return { isActive: false, remainingMs: 0, text: '', nextAvailableDate: '' };
    const lastTime = new Date(lastChangedAt).getTime();
    if (isNaN(lastTime)) return { isActive: false, remainingMs: 0, text: '', nextAvailableDate: '' };

    const remainingMs = Math.max(0, cooldownMs - (Date.now() - lastTime));
    if (remainingMs <= 0) return { isActive: false, remainingMs: 0, text: '', nextAvailableDate: '' };

    const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.ceil((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

    let text = '';
    if (days > 0) {
      text = `${days}d ${hours}h`;
    } else if (hours > 0) {
      text = `${hours}h ${minutes}m`;
    } else {
      text = `${minutes}m`;
    }

    const nextAvailableDate = new Date(lastTime + cooldownMs).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });

    return { isActive: true, remainingMs, text, nextAvailableDate };
  };

  const usernameCooldown = getCooldown(user?.lastUsernameChangedAt, USERNAME_COOLDOWN_MS);
  const avatarCooldown = getCooldown(user?.lastAvatarChangedAt, AVATAR_COOLDOWN_MS);

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (avatarCooldown.isActive) {
      toast.warning(
        'Cooldown Active',
        `Avatar change is limited to once every hour. (${avatarCooldown.text} remaining)`
      );
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large', 'Avatar image must be under 5 MB.');
      e.target.value = '';
      return;
    }

    setIsUploadingAvatar(true);
    try {
      await uploadAvatar(file);
      toast.success('Avatar Updated', 'New profile picture uploaded and processed securely.');
    } catch (err: unknown) {
      toast.error('Upload Failed', (err as Error).message);
    } finally {
      setIsUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed || trimmed === user?.displayName) return;
    setIsSavingProfile(true);
    try {
      await updateProfile(trimmed);
      toast.success('Profile updated', 'Your display name has been saved.');
    } catch (err: unknown) {
      toast.error('Failed to update profile', (err as Error).message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newUsername.trim().toLowerCase();
    if (!trimmed || trimmed === user?.username) return;

    if (usernameCooldown.isActive) {
      toast.warning(
        'Cooldown Active',
        `Username can only be changed once every 7 days. (${usernameCooldown.text} remaining)`
      );
      return;
    }

    setIsUpdatingUsername(true);
    try {
      await updateUsername(trimmed);
      toast.success('Username changed', `@${trimmed} is now your public username.`);
    } catch (err: unknown) {
      toast.error('Username change failed', (err as Error).message);
    } finally {
      setIsUpdatingUsername(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    toast.info('Logged out', 'Your session has been securely ended.');
    onClose();
    onLogout?.();
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmInput !== 'DELETE') {
      toast.error('Confirmation required', 'You must type DELETE in all capitals to confirm.');
      return;
    }
    setIsDeletingAccount(true);
    try {
      await deleteAccount(deleteConfirmInput);
      toast.warning(
        'Account Permanently Deleted',
        'Your account metadata, sessions, and Cloudinary media have been permanently purged.'
      );
      setShowDeleteConfirm(false);
      setDeleteConfirmInput('');
      onClose();
      onLogout?.();
    } catch (err: unknown) {
      toast.error('Account Deletion Failed', (err as Error).message);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const hasDisplayNameChanged = displayName.trim() !== '' && displayName.trim() !== user?.displayName;
  const hasUsernameChanged = newUsername.trim() !== '' && newUsername.trim().toLowerCase() !== user?.username;

  return (
    <>
      <Dialog
        isOpen={isOpen && !showDeleteConfirm}
        onClose={onClose}
        title="Settings & Privacy"
        description="Manage your profile identity, appearance, and privacy preferences."
      >
        <div className="flex flex-col gap-4 py-1">
          {/* Unified Profile & Identity Card */}
          <section className="p-4 rounded-2xl bg-surface-raised/40 border border-border/70 flex flex-col gap-4">
            {/* Profile Header Row */}
            <div className="flex items-center gap-3.5">
              <div className="relative group flex-shrink-0">
                <Avatar
                  name={user?.displayName || 'User'}
                  src={user?.avatarUrl}
                  size="lg"
                  isOnline={user?.isOnline || false}
                  showPresence
                />
                {/* Camera upload overlay */}
                <label
                  htmlFor="avatar-upload-input"
                  className={cn(
                    'absolute inset-0 rounded-full flex flex-col items-center justify-center transition-all backdrop-blur-xs select-none',
                    avatarCooldown.isActive
                      ? 'bg-black/60 text-accent-amber/90 cursor-not-allowed'
                      : 'bg-black/50 hover:bg-black/70 text-white cursor-pointer opacity-0 group-hover:opacity-100'
                  )}
                  title={
                    avatarCooldown.isActive
                      ? `Avatar locked (${avatarCooldown.text} remaining)`
                      : 'Change profile picture (1 hour cooldown)'
                  }
                >
                  {isUploadingAvatar ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : avatarCooldown.isActive ? (
                    <Lock className="w-4 h-4 text-accent-amber" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                  <input
                    id="avatar-upload-input"
                    type="file"
                    className="sr-only"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={isUploadingAvatar || avatarCooldown.isActive}
                    onChange={handleAvatarFileChange}
                  />
                </label>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm sm:text-base font-semibold text-foreground truncate">
                    {user?.displayName || 'User'}
                  </h3>
                  {user && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLogout}
                      className="h-7 px-2 text-xs text-foreground-muted hover:text-accent-crimson gap-1"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-foreground-muted font-mono truncate">
                    @{user?.username || 'user'}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span className="text-[11px] text-accent-emerald flex items-center gap-1 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse" />
                    {user?.email ? 'Verified' : 'Active Session'}
                  </span>
                </div>

                {/* Avatar Cooldown / Change Action */}
                <div className="mt-2 flex items-center gap-2">
                  {avatarCooldown.isActive ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-amber/10 text-accent-amber border border-accent-amber/20 text-[10px] font-medium">
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      Photo locked ({avatarCooldown.text} left)
                    </span>
                  ) : (
                    <label
                      htmlFor="avatar-upload-input"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary-hover cursor-pointer"
                    >
                      <Camera className="w-3 h-3" />
                      Change photo (1h limit)
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Subtle Divider */}
            <div className="h-px bg-border/60" />

            {/* Editable Fields */}
            <div className="flex flex-col gap-3.5">
              {/* Display Name Field */}
              <form onSubmit={handleSaveProfile} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="settings-display-name" className="text-xs font-medium text-foreground">
                    Display Name
                  </label>
                  <span className="text-[10px] text-foreground-muted">
                    Visible to conversation peers
                  </span>
                </div>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 min-w-0">
                    <Input
                      id="settings-display-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Enter display name"
                      className="h-9 text-xs"
                      disabled={isSavingProfile}
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    variant={hasDisplayNameChanged ? 'primary' : 'secondary'}
                    isLoading={isSavingProfile}
                    disabled={!hasDisplayNameChanged || isSavingProfile}
                    className="h-9 text-xs flex-shrink-0"
                  >
                    Save
                  </Button>
                </div>
              </form>

              {/* Unique Public Username Field */}
              <form onSubmit={handleSaveUsername} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="settings-username" className="text-xs font-medium text-foreground">
                    Unique Public Username
                  </label>
                  {usernameCooldown.isActive ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-accent-amber font-medium">
                      <Clock className="w-3 h-3" />
                      Locked for {usernameCooldown.text}
                    </span>
                  ) : (
                    <span className="text-[10px] text-foreground-muted">
                      1 change every 7 days
                    </span>
                  )}
                </div>

                <div className="flex gap-2 items-center">
                  <div className="flex-1 min-w-0">
                    <Input
                      id="settings-username"
                      value={newUsername}
                      onChange={(e) =>
                        setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))
                      }
                      placeholder="3-24 characters"
                      leftIcon={<AtSign className="w-3.5 h-3.5" />}
                      className="h-9 text-xs font-mono"
                      disabled={usernameCooldown.isActive || isUpdatingUsername}
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    isLoading={isUpdatingUsername}
                    disabled={
                      usernameCooldown.isActive ||
                      !hasUsernameChanged ||
                      newUsername.trim().length < 3 ||
                      isUpdatingUsername
                    }
                    className="h-9 text-xs flex-shrink-0"
                  >
                    Change
                  </Button>
                </div>

                <p className="text-[10px] text-foreground-muted">
                  {usernameCooldown.isActive
                    ? `Username changes are limited to once every 7 days. Next change available on ${usernameCooldown.nextAvailableDate}.`
                    : 'Your unique handle for peers to discover and chat with you.'}
                </p>
              </form>
            </div>
          </section>

          {/* Theme & Appearance (Segmented Pill Switcher) */}
          <section className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-foreground tracking-wider uppercase">
              Theme & Appearance
            </span>
            <div
              className="p-1 rounded-xl bg-surface-raised border border-border/70 grid grid-cols-3 gap-1"
              role="group"
              aria-label="Theme selection"
            >
              <button
                type="button"
                onClick={() => setTheme('light')}
                aria-pressed={theme === 'light'}
                aria-label="Light mode"
                className={cn(
                  'flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all select-none',
                  theme === 'light'
                    ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                    : 'text-foreground-muted hover:text-foreground hover:bg-surface-raised/60'
                )}
              >
                <Sun className="w-3.5 h-3.5" />
                Light
              </button>

              <button
                type="button"
                onClick={() => setTheme('dark')}
                aria-pressed={theme === 'dark'}
                aria-label="Dark mode"
                className={cn(
                  'flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all select-none',
                  theme === 'dark'
                    ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                    : 'text-foreground-muted hover:text-foreground hover:bg-surface-raised/60'
                )}
              >
                <Moon className="w-3.5 h-3.5" />
                Dark
              </button>

              <button
                type="button"
                onClick={() => setTheme('system')}
                aria-pressed={theme === 'system'}
                aria-label="System preference theme"
                className={cn(
                  'flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all select-none',
                  theme === 'system'
                    ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                    : 'text-foreground-muted hover:text-foreground hover:bg-surface-raised/60'
                )}
              >
                <Laptop className="w-3.5 h-3.5" />
                System
              </button>
            </div>
          </section>

          {/* Privacy Assurances Section */}
          <section className="p-3.5 rounded-xl bg-surface-raised/30 border border-border/70 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-primary" />
                textLove Privacy Assurances
              </span>
              <span className="text-[10px] font-mono text-accent-emerald px-1.5 py-0.5 rounded bg-accent-emerald/10 border border-accent-emerald/20 font-medium">
                Zero-Retention
              </span>
            </div>

            <ul className="text-foreground-muted space-y-1.5 text-[11px]">
              <li className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-accent-emerald flex-shrink-0" />
                <span>Private keys stay on device; server forwards opaque ciphertext only.</span>
              </li>
              <li className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-accent-emerald flex-shrink-0" />
                <span>Live-only messaging: zero database storage or store-and-forward queue.</span>
              </li>
              <li className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-accent-amber flex-shrink-0" />
                <span>Authoritative 30-minute inactivity auto-expiry wipes RAM state.</span>
              </li>
            </ul>

            <button
              type="button"
              onClick={() => setShowPrivacyModal(true)}
              className="pt-1 text-primary hover:underline text-[11px] font-medium flex items-center gap-1 cursor-pointer text-left"
            >
              <Shield className="w-3 h-3 flex-shrink-0" />
              <span>View Complete Privacy Policy & Security Standards &rarr;</span>
            </button>
          </section>

          {/* Danger Zone: Account Deletion */}
          <section className="flex flex-col gap-2 pt-1 border-t border-border/60">
            <span className="text-xs font-semibold text-accent-crimson tracking-wider uppercase">
              Danger Zone
            </span>
            <div className="flex items-center justify-between p-3 rounded-xl bg-accent-crimson/5 border border-accent-crimson/20">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-foreground">Delete Account</span>
                <span className="text-[11px] text-foreground-muted">
                  Permanently purge username, sessions, and Cloudinary media.
                </span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-xs flex-shrink-0 h-8"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Delete
              </Button>
            </div>
          </section>

          {/* Footer Copyright */}
          <div className="text-center pt-1 border-t border-border/40 text-[10px] text-foreground-muted">
            &copy; {new Date().getFullYear()} textLove Inc. Zero-retention encrypted communications.
          </div>
        </div>
      </Dialog>

      {/* Complete Privacy Policy Modal */}
      <PrivacyPolicyModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />

      {/* Delete Account Confirmation Dialog */}
      <Dialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          if (!isDeletingAccount) {
            setShowDeleteConfirm(false);
            setDeleteConfirmInput('');
          }
        }}
        title="Confirm Account Deletion"
        description="Are you certain you wish to permanently delete your account? This action is immediate and completely irreversible."
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="p-3.5 rounded-xl bg-accent-crimson/10 border border-accent-crimson/30 text-accent-crimson text-xs leading-relaxed space-y-2">
            <p className="font-semibold">Immediate Purge Actions:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>All active user sessions revoked across all browsers and devices.</li>
              <li>MongoDB account record deleted and public username released.</li>
              <li>All active conversations terminated and closed for both participants.</li>
              <li>Cloudinary profile avatar scheduled for permanent asset deletion.</li>
            </ul>
            <div className="border-t border-accent-crimson/20 pt-2 text-foreground-muted font-normal space-y-1">
              <p className="font-semibold text-foreground">Infrastructure Backup Disclosure:</p>
              <p>
                Live production databases and media assets are purged immediately. In accordance with standard cloud operations, automated encrypted rolling infrastructure snapshots (MongoDB Atlas / hosting cold storage) are maintained for disaster recovery for up to 30 days before natural overwriting. Cloud provider backups cannot be selectively edited.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">
              To proceed, please type <span className="font-mono font-bold text-accent-crimson">DELETE</span> below:
            </label>
            <Input
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              placeholder="Type DELETE to confirm"
              className="font-mono text-xs"
              disabled={isDeletingAccount}
            />
          </div>

          <div className="flex items-center justify-end gap-3 mt-2">
            <Button
              variant="ghost"
              disabled={isDeletingAccount}
              onClick={() => {
                setShowDeleteConfirm(false);
                setDeleteConfirmInput('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              isLoading={isDeletingAccount}
              disabled={deleteConfirmInput !== 'DELETE' || isDeletingAccount}
              onClick={handleDeleteAccount}
            >
              Permanently Delete Account
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
};
