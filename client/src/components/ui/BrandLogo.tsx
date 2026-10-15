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
    sm: 'w-7 h-7',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
    xl: 'w-12 h-12',
  };

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Official textLove Vector Emblem with Airplane Origami & Heart Trail */}
      <div className={`${sizeMap[size]} flex-shrink-0 flex items-center justify-center`}>
        <svg
          viewBox="0 0 512 512"
          width="100%"
          height="100%"
          role="img"
          aria-label="textLove logo"
          className="w-full h-full drop-shadow-xs"
        >
          <title>textLove</title>
          <rect width="512" height="512" rx="112" fill="#185FA5" />
          <g transform="translate(-438.4,-115.2) scale(3.2)">
            <polygon points="195,105 265,75 245,135 230,117" fill="#FFFFFF" />
            <polygon points="230,117 265,75 238,119" fill="#B5D4F4" />
            <path
              d="M210 124 C201 138 190 129 182 141"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeDasharray="3 4"
              strokeLinecap="round"
            />
            <path
              d="M176 157 C169 152 169 146 173 146 C174.5 146 175.5 147 176 148 C176.5 147 177.5 146 179 146 C183 146 183 152 176 157 Z"
              fill="#FF6B8E"
            />
          </g>
        </svg>
      </div>

      {showText && (
        <span className={`font-brand tracking-[-0.03em] ${textSize}`}>
          <span className="font-semibold text-[#185FA5] dark:text-[#5BA2E6]">text</span>
          <span className="font-extrabold bg-gradient-to-r from-[#E04870] to-[#FF6B8E] dark:from-[#FF6B8E] dark:to-[#FFA0B6] bg-clip-text text-transparent">
            Love
          </span>
        </span>
      )}
    </div>
  );
};
