import React, { useEffect } from 'react';
import { cn } from '../../utils/cn';
import { X } from 'lucide-react';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  className,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain p-3 sm:p-6 flex min-h-full items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? 'dialog-description' : undefined}
        className={cn(
          'relative w-full max-w-lg max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col rounded-2xl glass-panel shadow-2xl p-4 sm:p-6 transition-all z-10 text-foreground animate-in fade-in zoom-in-95 duration-150 my-auto',
          className
        )}
      >
        <div className="flex items-start justify-between pb-3 sm:pb-4 border-b border-border/60 gap-4 flex-shrink-0">
          <div className="min-w-0 pr-2">
            {title && (
              <h2 id="dialog-title" className="text-base sm:text-lg font-semibold tracking-tight text-foreground truncate">
                {title}
              </h2>
            )}
            {description && (
              <p id="dialog-description" className="text-xs text-foreground-muted mt-0.5 sm:mt-1 leading-relaxed">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-foreground-muted hover:text-foreground p-1.5 sm:p-2 rounded-xl hover:bg-surface-raised transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary -mr-1 flex-shrink-0"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        <div className="mt-3 sm:mt-4 overflow-y-auto flex-1 min-h-0 pr-1 -mr-1 overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
};
