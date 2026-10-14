import React from 'react';
import { cn } from '../../utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, label, leftIcon, rightIcon, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const isFlex = className?.includes('flex-1');

    return (
      <div className={cn('w-full flex flex-col gap-1.5', isFlex && 'flex-1 min-w-0')}>
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-foreground-muted select-none">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 text-foreground-muted pointer-events-none flex items-center">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={cn(
              'w-full h-10 rounded-xl bg-surface-raised border border-border px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/60',
              'transition-all duration-150',
              'focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/20',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              leftIcon && 'pl-9',
              rightIcon && 'pr-9',
              error && 'border-accent-crimson focus:border-accent-crimson focus:ring-accent-crimson/20',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 text-foreground-muted flex items-center">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <span className="text-xs text-accent-crimson">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
