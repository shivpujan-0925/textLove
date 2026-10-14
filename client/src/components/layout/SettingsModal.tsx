import React, { useState } from 'react';
import { useTheme } from '../../context/useTheme';
import { useToast } from '../../context/useToast';
import { useAuth } from '../../context/useAuth';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Avatar } from '../ui/Avatar';
import { PrivacyPolicyModal } from '../ui/PrivacyPolicyModal';
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
  Eye,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout?: () => void;
}

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
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large', 'Avatar image must be under 5 MB.');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      await uploadAvatar(file);
      toast.success('Profile Picture Updated', 'New avatar uploaded and processed securely.');
    } catch (err: unknown) {
      toast.error('Upload Failed', (err as Error).message);
    } finally {
      setIsUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    try {
      await updateProfile(displayName.trim());
      toast.success('Profile updated', 'Your display name has been saved.');
    } catch (err: unknown) {
      toast.error('Failed to update profile', (err as Error).message);
    }
  };

  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || newUsername.trim() === user?.username) return;
    setIsUpdatingUsername(true);
    try {
      await updateUsername(newUsername.trim());
      toast.success('Username changed', `@${newUsername.trim()} is now your public username.`);
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

  return (
    <>
      <Dialog
        isOpen={isOpen && !showDeleteConfirm}
        onClose={onClose}
        title="Settings & Privacy"
        description="Manage your textLove profile, interface theme, and privacy preferences."
      >
        <div className="flex flex-col gap-4 sm:gap-5 py-1 sm:py-2">
          {/* Profile Overview */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground tracking-wider uppercase">
                Profile
              </span>
              {user && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="h-7 px-2.5 text-xs text-foreground-muted hover:text-accent-crimson gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3 sm:gap-4 p-3 rounded-2xl bg-surface-raised border border-border">
              <div className="relative group flex-shrink-0">
                <Avatar
                  name={user?.displayName || 'User'}
                  src={user?.avatarUrl}
                  size="lg"
                  isOnline={user?.isOnline || false}
                  showPresence
                />
                <label
                  htmlFor="avatar-upload-overlay"
                  className="absolute inset-0 rounded-full flex flex-col items-center justify-center bg-black/60 text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity backdrop-blur-xs"
                  title="Upload profile picture"
                >
                  {isUploadingAvatar ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5" />
                  )}
                  <input
                    id="avatar-upload-overlay"
                    type="file"
                    className="sr-only"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={isUploadingAvatar}
                    onChange={handleAvatarFileChange}
                  />
                </label>
              </div>

              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-semibold text-foreground truncate">
                  {user?.displayName || 'User'}
                </span>
                <span className="text-xs text-foreground-muted font-mono truncate">
                  @{user?.username || 'user'}
                </span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-accent-emerald flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald" />
                    {user?.email ? 'Verified Account' : 'Active Session'}
                  </span>
                  <label
                    htmlFor="avatar-upload-btn"
                    className="text-[11px] text-primary hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Camera className="w-3 h-3" />
                    {isUploadingAvatar ? 'Uploading...' : 'Change photo'}
                    <input
                      id="avatar-upload-btn"
                      type="file"
                      className="sr-only"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={isUploadingAvatar}
                      onChange={handleAvatarFileChange}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Change Username Form */}
            <form onSubmit={handleSaveUsername} className="flex flex-col gap-1.5 p-3 rounded-xl bg-surface-raised/50 border border-border">
              <span className="text-xs font-medium text-foreground">Unique Public Username</span>
              <div className="flex gap-2 items-center">
                <div className="flex-1 min-w-0">
                  <Input
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="3-24 characters"
                    leftIcon={<AtSign className="w-3.5 h-3.5" />}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  isLoading={isUpdatingUsername}
                  disabled={!newUsername.trim() || newUsername.trim() === user?.username}
                  className="h-8 text-xs flex-shrink-0"
                >
                  Change
                </Button>
              </div>
              <p className="text-[10px] text-foreground-muted">
                Your unique handle for peers to find and chat with you.
              </p>
            </form>

            {/* Change Display Name Form */}
            <form onSubmit={handleSaveProfile} className="flex gap-2 mt-1 items-end">
              <div className="flex-1 min-w-0">
                <Input
                  label="Display Name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter display name"
                  className="h-9 text-xs"
                />
              </div>
              <Button type="submit" size="sm" className="h-9 text-xs flex-shrink-0">
                Save
              </Button>
            </form>
          </section>

          {/* Theme Settings */}
          <section className="flex flex-col gap-3">
            <span className="text-xs font-semibold text-foreground tracking-wider uppercase">
              Theme & Appearance
            </span>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Theme selection">
              <button
                type="button"
                onClick={() => setTheme('light')}
                aria-pressed={theme === 'light'}
                aria-label="Light mode"
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  theme === 'light'
                    ? 'border-primary bg-primary/10 text-primary font-medium shadow-xs'
                    : 'border-border bg-surface-raised text-foreground-muted hover:text-foreground'
                }`}
              >
                <Sun className="w-4 h-4" />
                <span className="text-xs">Light</span>
              </button>

              <button
                type="button"
                onClick={() => setTheme('dark')}
                aria-pressed={theme === 'dark'}
                aria-label="Dark mode"
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  theme === 'dark'
                    ? 'border-primary bg-primary/10 text-primary font-medium shadow-xs'
                    : 'border-border bg-surface-raised text-foreground-muted hover:text-foreground'
                }`}
              >
                <Moon className="w-4 h-4" />
                <span className="text-xs">Dark</span>
              </button>

              <button
                type="button"
                onClick={() => setTheme('system')}
                aria-pressed={theme === 'system'}
                aria-label="System preference theme"
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  theme === 'system'
                    ? 'border-primary bg-primary/10 text-primary font-medium shadow-xs'
                    : 'border-border bg-surface-raised text-foreground-muted hover:text-foreground'
                }`}
              >
                <Laptop className="w-4 h-4" />
                <span className="text-xs">System</span>
              </button>
            </div>
          </section>

          {/* Architectural Invariants Overview */}
          <section className="flex flex-col gap-2 p-3.5 rounded-xl bg-surface-raised/70 border border-border text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-primary" />
              textLove Privacy Assurances
            </span>
            <ul className="text-foreground-muted space-y-1.5 mt-1 text-[11px]">
              <li className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-accent-emerald flex-shrink-0" />
                Private keys stay on device; server forwards opaque ciphertext only.
              </li>
              <li className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-accent-emerald flex-shrink-0" />
                Live-only messaging: zero message database or store-and-forward queue.
              </li>
              <li className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-accent-amber flex-shrink-0" />
                Authoritative 30-minute inactivity auto-expiry wipes RAM state.
              </li>
              <li className="flex items-start gap-1.5">
                <Eye className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Device Observation Notice:</strong> Browsers cannot block operating system-level screenshots, recordings, or camera capture. While textLove guarantees zero server/network retention, displayed content can always be captured by the recipient device.
                </span>
              </li>
            </ul>

            <button
              type="button"
              onClick={() => setShowPrivacyModal(true)}
              className="text-primary hover:underline text-[11px] font-medium flex items-center gap-1 mt-1 text-left cursor-pointer"
            >
              <Shield className="w-3 h-3 flex-shrink-0" />
              <span>View Complete Privacy Policy & Security Standards &rarr;</span>
            </button>
          </section>

          {/* Danger Zone: Account Deletion */}
          <section className="flex flex-col gap-2 pt-2 border-t border-border">
            <span className="text-xs font-semibold text-accent-crimson tracking-wider uppercase">
              Danger Zone
            </span>
            <div className="flex items-center justify-between p-3 rounded-xl bg-accent-crimson/5 border border-accent-crimson/20">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-foreground">Delete Account</span>
                <span className="text-[11px] text-foreground-muted">
                  Permanently delete username, sessions, and Cloudinary media.
                </span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-xs flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Delete
              </Button>
            </div>
          </section>

          {/* Footer Copyright */}
          <div className="text-center pt-2 border-t border-border/40 text-[10px] text-foreground-muted">
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
