import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  textSize?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showText = false,
  className = '',
  textSize = 'text-lg',
}) => {
  const sizeMap = {
    sm: 'w-7 h-7 rounded-lg',
    md: 'w-8 h-8 rounded-xl',
    lg: 'w-10 h-10 rounded-xl',
    xl: 'w-12 h-12 rounded-2xl',
  };

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Production-grade Static Vector Emblem (zero animation, clean geometry) */}
      <div
        className={`${sizeMap[size]} flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-primary via-[#8B5CF6] to-accent-rose shadow-xs border border-white/15`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="logoInnerGrad" x1="8" y1="6.5" x2="16" y2="14.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="#7C3AED" />
              <stop offset="100%" stopColor="#DB2777" />
            </linearGradient>
          </defs>
          {/* Pristine speech bubble silhouette */}
          <path
            d="M12 2C6.48 2 2 6.03 2 11c0 2.22.91 4.26 2.43 5.85L3.38 19.61a.6.6 0 00.75.75l3.45-1.15A10.36 10.36 0 0012 20c5.52 0 10-4.03 10-9s-4.48-9-10-9z"
            fill="#FFFFFF"
          />
          {/* Inset precision heart mark */}
          <path
            d="M12 14.2l-.56-.51C9.44 11.89 8 10.58 8 9c0-1.28.98-2.25 2.25-2.25.72 0 1.4.33 1.75.86.35-.53 1.03-.86 1.75-.86 1.27 0 2.25.97 2.25 2.25 0 1.58-1.44 2.89-3.44 4.69l-.56.51z"
            fill="url(#logoInnerGrad)"
          />
        </svg>
      </div>

      {showText && (
        <span className={`font-brand tracking-[-0.03em] ${textSize}`}>
          <span className="font-semibold text-foreground">text</span>
          <span className="font-extrabold bg-gradient-to-r from-primary to-accent-rose bg-clip-text text-transparent">Love</span>
        </span>
      )}
    </div>
  );
};
