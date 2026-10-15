import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { BrandLogo } from '../ui/BrandLogo';
import { PrivacyPolicyModal } from '../ui/PrivacyPolicyModal';
import { useAuth } from '../../context/useAuth';
import {
  Zap,
  Lock,
  Clock,
  ArrowRight,
  Sparkles,
  ServerOff,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

interface LandingPageProps {
  onEnterChat: () => void;
  onGoogleSignInClick: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onEnterChat,
  onGoogleSignInClick,
}) => {
  const { user } = useAuth();
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);

  return (
    <div className="min-h-full flex flex-col bg-background selection:bg-primary/20">
      {/* Hero Section */}
      <section className="relative px-4 sm:px-6 lg:px-8 pt-16 pb-20 max-w-6xl mx-auto flex flex-col items-center text-center">
        {/* Glow ambient background aura */}
        <div className="absolute top-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-card mb-8 select-none">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-foreground">
            Zero-Retention Live Communication
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald" />
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground max-w-3xl leading-[1.15] font-display">
          Live conversations that leave{' '}
          <span className="bg-gradient-to-r from-primary via-accent-rose to-primary bg-clip-text text-transparent">
            zero footprint
          </span>
          .
        </h1>

        <p className="mt-6 text-base sm:text-lg text-foreground-muted max-w-2xl leading-relaxed">
          <strong>textLove</strong> is a modern, privacy-first one-to-one web messenger. No message database. No store-and-forward queues. Both users must be online to chat, and all memory state vanishes after 30 minutes of inactivity.
        </p>

        {/* CTA Action Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          {user ? (
            <Button
              size="lg"
              onClick={onEnterChat}
              className="w-full sm:w-auto gap-2 text-sm px-6 h-12 shadow-lg shadow-primary/25"
            >
              <span>Open Chat</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={onGoogleSignInClick}
              className="w-full sm:w-auto gap-3 text-sm px-6 h-12 shadow-lg shadow-primary/25"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
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
              <span>Sign in with Google</span>
            </Button>
          )}
        </div>

        {/* Invariant Pills */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <Badge variant="emerald" className="py-1 px-3 text-xs gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> No Message Database
          </Badge>
          <Badge variant="emerald" className="py-1 px-3 text-xs gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> End-to-End Encrypted
          </Badge>
          <Badge variant="emerald" className="py-1 px-3 text-xs gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> 30-Minute Auto-Expiry
          </Badge>
          <Badge variant="emerald" className="py-1 px-3 text-xs gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Zero Storage Queues
          </Badge>
        </div>
      </section>

      {/* Core Architectural Pillars */}
      <section className="px-4 sm:px-6 lg:px-8 py-16 max-w-6xl mx-auto w-full border-t border-border/60">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Built for uncompromising discretion
          </h2>
          <p className="mt-3 text-xs sm:text-sm text-foreground-muted leading-relaxed">
            Every layer of textLove is architected around what the server <em>refuses</em> to retain.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Pillar 1 */}
          <div className="p-6 rounded-2xl glass-card flex flex-col gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <ServerOff className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Zero Retention</h3>
            <p className="text-xs text-foreground-muted leading-relaxed">
              No message database in MongoDB, no Redis store, no disk writes, and no logging of ciphertext or keys.
            </p>
          </div>

          {/* Pillar 2 */}
          <div className="p-6 rounded-2xl glass-card flex flex-col gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-emerald/10 border border-accent-emerald/20 flex items-center justify-center text-accent-emerald">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Strict Live-Only</h3>
            <p className="text-xs text-foreground-muted leading-relaxed">
              Both users must be actively connected. If a peer is offline, the message is immediately rejected. No delayed delivery.
            </p>
          </div>

          {/* Pillar 3 */}
          <div className="p-6 rounded-2xl glass-card flex flex-col gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-amber/10 border border-accent-amber/20 flex items-center justify-center text-accent-amber">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-foreground">30-Min Inactivity Expiry</h3>
            <p className="text-xs text-foreground-muted leading-relaxed">
              Conversations authoritatively expire 30 minutes after the last qualifying action. Inactive sessions cannot be resurrected.
            </p>
          </div>

          {/* Pillar 4 */}
          <div className="p-6 rounded-2xl glass-card flex flex-col gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-rose/10 border border-accent-rose/20 flex items-center justify-center text-accent-rose">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-foreground">True Device E2EE</h3>
            <p className="text-xs text-foreground-muted leading-relaxed">
              Authenticated encryption happens exclusively on client hardware. Private keys never leave browser memory.
            </p>
          </div>
        </div>
      </section>

      {/* Production-Level Footer */}
      <footer className="mt-auto border-t border-border/60 py-8 px-4 sm:px-6 bg-surface/40">
        <div className="max-w-6xl mx-auto flex flex-col gap-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Brand Logo & Copyright */}
            <div className="flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
              <BrandLogo size="sm" showText={true} textSize="text-base" />
              <span className="hidden sm:inline text-border">|</span>
              <p className="text-xs text-foreground-muted">
                &copy; {new Date().getFullYear()} textLove Inc. All rights reserved.
              </p>
            </div>

            {/* Production Privacy Tag */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-card border border-accent-emerald/30 text-xs shadow-xs select-none">
              <ShieldCheck className="w-3.5 h-3.5 text-accent-emerald flex-shrink-0" />
              <span className="font-medium text-foreground">Zero-Retention Privacy Verified</span>
              <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald" />
            </div>

            {/* Production Legal & Privacy Policy Links */}
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-foreground-muted">
              <button
                type="button"
                onClick={() => setIsPrivacyModalOpen(true)}
                className="hover:text-primary transition-colors cursor-pointer underline-offset-4 hover:underline"
              >
                Privacy Policy
              </button>
              <span>&bull;</span>
              <button
                type="button"
                onClick={() => setIsPrivacyModalOpen(true)}
                className="hover:text-primary transition-colors cursor-pointer underline-offset-4 hover:underline"
              >
                Security Architecture
              </button>
              <span>&bull;</span>
              <button
                type="button"
                onClick={() => setIsPrivacyModalOpen(true)}
                className="hover:text-primary transition-colors cursor-pointer underline-offset-4 hover:underline"
              >
                Zero-Retention Terms
              </button>
            </div>
          </div>

          <div className="text-center border-t border-border/40 pt-4 text-[11px] text-foreground-muted/80">
            <span>
              End-to-end client encrypted. Zero server message databases. Authoritative 30-minute memory auto-expiry.
            </span>
          </div>
        </div>
      </footer>

      {/* Production Privacy Policy & Security Modal */}
      <PrivacyPolicyModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
      />
    </div>
  );
};
