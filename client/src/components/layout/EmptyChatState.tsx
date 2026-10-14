import React from 'react';
import { Heart, Zap, Trash2, Clock, Lock } from 'lucide-react';
import { Badge } from '../ui/Badge';

export const EmptyChatState: React.FC = () => {
  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center p-6 text-center select-none bg-background">
      <div className="max-w-md flex flex-col items-center">
        {/* Glowing Logo Heart Icon */}
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-primary to-accent-rose flex items-center justify-center shadow-xl shadow-primary/20 mb-6">
          <Heart className="w-8 h-8 text-white fill-white/20" />
        </div>

        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Welcome to <span className="text-primary">textLove</span>
        </h2>
        <p className="text-xs text-foreground-muted mt-2 leading-relaxed max-w-sm">
          A minimalist, live-only, privacy-first messaging sanctuary. No databases of messages. No stored histories. Absolute discretion.
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
          <Badge variant="purple" className="text-xs font-mono">
            Zero Server Retention Guaranteed
          </Badge>
        </div>
      </div>
    </div>
  );
};
