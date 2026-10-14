import React from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Shield, Lock, Clock, Zap, Eye, CheckCircle2, ServerOff } from 'lucide-react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Privacy Policy & Security Standards"
      description="textLove is engineered around what our infrastructure mathematically refuses to store."
      className="max-w-xl"
    >
      <div className="flex flex-col gap-4 py-2 overflow-y-auto max-h-[60vh] pr-1">
        {/* Trust Badge Banner */}
        <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0 text-primary">
            <Shield className="w-5 h-5" />
          </div>
          <div className="flex flex-col text-xs">
            <span className="font-semibold text-foreground">Zero-Retention Architectural Guarantee</span>
            <span className="text-foreground-muted">
              No message database. No store-and-forward queues. Real-time live relay only.
            </span>
          </div>
        </div>

        {/* Section 1: Zero Message Retention */}
        <div className="space-y-1.5 text-xs">
          <h4 className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
            <ServerOff className="w-4 h-4 text-accent-emerald" />
            1. Zero Server-Side Message Storage
          </h4>
          <p className="text-foreground-muted leading-relaxed">
            textLove maintains no MongoDB collections, no Redis message queues, and no disk logging for chat messages, plaintext, or ciphertext. Messages exist solely in volatile process memory during live transit between actively connected peer WebSockets and are discarded immediately upon write buffer flush.
          </p>
        </div>

        {/* Section 2: End-to-End Encryption */}
        <div className="space-y-1.5 text-xs">
          <h4 className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
            <Lock className="w-4 h-4 text-primary" />
            2. Client-Hardware End-to-End Encryption (E2EE)
          </h4>
          <p className="text-foreground-muted leading-relaxed">
            All conversations are encrypted on client devices before leaving your browser. The server acts strictly as an oblivious relay and cannot inspect, decrypt, or tamper with message contents. Private identity and ratchet keys are stored exclusively in client browser memory and are never transmitted to any server.
          </p>
        </div>

        {/* Section 3: Authoritative 30-Minute Expiry */}
        <div className="space-y-1.5 text-xs">
          <h4 className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
            <Clock className="w-4 h-4 text-accent-amber" />
            3. Authoritative 30-Minute Inactivity Expiry
          </h4>
          <p className="text-foreground-muted leading-relaxed">
            Active conversations automatically and authoritatively expire exactly 30 minutes after the last qualifying message exchange. Upon expiration, all session keys, WebSocket routing tables, and client memory state are permanently purged on both devices. Expired sessions cannot be resurrected.
          </p>
        </div>

        {/* Section 4: Live-Only Messaging Invariant */}
        <div className="space-y-1.5 text-xs">
          <h4 className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
            <Zap className="w-4 h-4 text-accent-emerald" />
            4. Strict Live-Only Delivery Policy
          </h4>
          <p className="text-foreground-muted leading-relaxed">
            Messages can only be transmitted when both communicating parties are simultaneously online. If a recipient goes offline or disconnects, the server rejects subsequent messages immediately. textLove enforces zero offline message queues or delayed background delivery.
          </p>
        </div>

        {/* Section 5: Device Observation & Screenshot Notice */}
        <div className="space-y-1.5 text-xs">
          <h4 className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
            <Eye className="w-4 h-4 text-accent-rose" />
            5. Device Capture & Operating System Notice
          </h4>
          <p className="text-foreground-muted leading-relaxed">
            While textLove guarantees zero server retention, web browsers cannot prevent operating system-level screenshots, screen recordings, or external camera capture by the person you are communicating with. Discretion with peers remains essential.
          </p>
        </div>

        {/* Section 6: Account & Data Rights */}
        <div className="space-y-1.5 text-xs border-t border-border/60 pt-3">
          <h4 className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            6. Account Deletion & Right to Erasure
          </h4>
          <p className="text-foreground-muted leading-relaxed">
            Users may permanently delete their account at any time via Settings. Account deletion immediately revokes all authentication sessions, releases public username handles, destroys in-memory state, and schedules associated profile avatars for permanent deletion.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border/60 mt-2">
        <span className="text-[11px] text-foreground-muted font-mono">
          © 2026 textLove • Effective Oct 2026
        </span>
        <Button variant="secondary" size="sm" onClick={onClose} className="px-4">
          Understood
        </Button>
      </div>
    </Dialog>
  );
};
