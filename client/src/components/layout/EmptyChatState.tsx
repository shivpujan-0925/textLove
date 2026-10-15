import React from 'react';
import { Zap, Trash2, Clock, Lock, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '../ui/BrandLogo';

export const EmptyChatState: React.FC = () => {
  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center p-6 text-center select-none bg-background">
      <div className="max-w-md flex flex-col items-center">
        {/* Production Brand Logo */}
        <div className="mb-6">
          <BrandLogo size="xl" />
        </div>

        <h2 className="text-2xl font-bold tracking-tight text-foreground font-brand">
          Welcome to <span className="font-semibold text-[#185FA5] dark:text-[#5BA2E6]">text</span><span className="font-extrabold bg-gradient-to-r from-[#E04870] to-[#FF6B8E] dark:from-[#FF6B8E] dark:to-[#FFA0B6] bg-clip-text text-transparent">Love</span>
        </h2>
        <p className="text-xs text-foreground-muted mt-2 leading-relaxed max-w-sm">
          A minimalist, live-only, privacy-first messaging sanctuary. No message databases. No stored histories. Absolute discretion.
        </p>

        {/* Feature Grid */}
        <div className="grid grid-cols-2 gap-3 mt-8 w-full text-left">
          <div className="p-3.5 rounded-2xl glass-card flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-primary">
              <Lock className="w-4 h-4" />
              <span className="text-xs font-semibold">End-to-End E2EE</span>
            </div>
            <p className="text-[11px] text-foreground-muted leading-tight">
              Encrypted on your device. Keys never leave client memory.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl glass-card flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-accent-emerald">
              <Zap className="w-4 h-4" />
              <span className="text-xs font-semibold">Strict Live-Only</span>
            </div>
            <p className="text-[11px] text-foreground-muted leading-tight">
              Both users must be online. Zero store-and-forward queues.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl glass-card flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-accent-amber">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-semibold">30-Min Expiry</span>
            </div>
            <p className="text-[11px] text-foreground-muted leading-tight">
              Inactivity wipes all messages automatically from RAM.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl glass-card flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-accent-rose">
              <Trash2 className="w-4 h-4" />
              <span className="text-xs font-semibold">Delete for Both</span>
            </div>
            <p className="text-[11px] text-foreground-muted leading-tight">
              One-click permanent teardown removes all session traces.
            </p>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-2">
          <div className="px-3.5 py-1.5 rounded-full glass-card text-center text-xs text-foreground-muted flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-accent-emerald flex-shrink-0" />
            <span>Zero server message retention</span>
          </div>
        </div>
      </div>
    </div>
  );
};
