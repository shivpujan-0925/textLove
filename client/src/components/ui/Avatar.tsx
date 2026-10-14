import React, { useState } from 'react';
import { cn } from '../../utils/cn';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  showPresence?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  isOnline = false,
  showPresence = false,
  className,
  ...props
}) => {
  const [imageFailed, setImageFailed] = useState(false);

  const getInitials = (n: string) => {
    const parts = n.trim().split(/\s+/);
    if (parts.length >= 2) {
      return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  };

  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  };

  const presenceSizes = {
    sm: 'w-2.5 h-2.5 bottom-0 right-0 border-2',
    md: 'w-3 h-3 bottom-0 right-0 border-2',
    lg: 'w-3.5 h-3.5 bottom-0.5 right-0.5 border-2',
    xl: 'w-4 h-4 bottom-1 right-1 border-2',
  };

  return (
    <div className={cn('relative inline-flex flex-shrink-0', className)} {...props}>
      <div
        className={cn(
          'rounded-full flex items-center justify-center font-semibold overflow-hidden border border-border select-none bg-surface-raised text-foreground',
          sizes[size]
        )}
      >
        {src && !imageFailed ? (
          <img
            src={src}
            alt={name}
            onError={() => setImageFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-foreground-muted">{getInitials(name)}</span>
        )}
      </div>

      {showPresence && (
        <span
          className={cn(
            'absolute rounded-full border-background transition-colors duration-200',
            presenceSizes[size],
            isOnline ? 'bg-accent-emerald ring-1 ring-accent-emerald/30' : 'bg-foreground-muted/40'
          )}
          title={isOnline ? 'Active Online' : 'Offline'}
        />
      )}
    </div>
  );
};
