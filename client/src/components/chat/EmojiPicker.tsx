import React, { useState, useRef, useEffect } from 'react';
import { Smile, Search, X } from 'lucide-react';
import { Button } from '../ui/Button';

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  disabled?: boolean;
}

const EMOJI_CATEGORIES = [
  {
    name: 'Smileys & Emotion',
    shortLabel: 'Smileys',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🥲', '☺️', '😊', '😇',
      '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😋', '😛', '😜', '🤪',
      '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟',
      '😕', '🙁', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😮‍💨', '😤', '😠',
      '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗',
      '🤔', '🫣', '🤭', '🫢', '🫡', '🤫', '🫠', '🤥', '😶', '😐', '😑', '😬',
      '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐',
    ],
  },
  {
    name: 'Gestures & People',
    shortLabel: 'Gestures',
    icon: '👋',
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🫰', '🤞', '🤟',
      '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊',
      '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪',
    ],
  },
  {
    name: 'Love & Hearts',
    shortLabel: 'Hearts',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '💌', '🌹', '💐',
    ],
  },
  {
    name: 'Symbols & Objects',
    shortLabel: 'Objects',
    icon: '✨',
    emojis: [
      '✨', '⭐️', '🌟', '💫', '🔥', '💥', '🎉', '🎊', '🔒', '🔑', '🛡️', '⚡',
      '🚀', '🛸', '💡', '💬', '👁️‍🗨️', '🎯', '🏆', '🥇', '👑', '💎', '🌈', '☕',
    ],
  },
];

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelectEmoji, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const currentCat = EMOJI_CATEGORIES[activeCategory] ?? EMOJI_CATEGORIES[0];
  const filteredEmojis = searchQuery.trim()
    ? EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter((_e, i) => i % 2 === 0 || searchQuery.length > 0)
    : (currentCat ? currentCat.emojis : []);

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="h-10 w-10 text-foreground-muted hover:text-foreground"
        title="Insert Emoji"
        aria-label="Emoji Picker"
      >
        <Smile className="w-5 h-5 text-foreground-muted hover:text-primary transition-colors" />
      </Button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Emoji Picker"
          className="absolute bottom-full mb-3 left-0 w-72 sm:w-80 bg-surface border border-border/80 shadow-2xl rounded-2xl p-3 z-50 flex flex-col gap-2.5 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Top Bar: Search & Close */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search emojis..."
                aria-label="Search emojis"
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-surface-raised border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                  aria-label="Clear emoji search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              aria-label="Close emoji picker"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Category Tabs (if not searching) */}
          {!searchQuery && (
            <div className="flex items-center gap-1 border-b border-border/60 pb-1.5 overflow-hidden" role="tablist" aria-label="Emoji categories">
              {EMOJI_CATEGORIES.map((cat, idx) => (
                <button
                  key={cat.shortLabel}
                  type="button"
                  role="tab"
                  aria-selected={activeCategory === idx}
                  onClick={() => setActiveCategory(idx)}
                  className={`flex-1 min-w-0 py-1 px-1.5 text-xs rounded-md flex items-center justify-center gap-1 transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${
                    activeCategory === idx
                      ? 'bg-primary/10 text-primary font-medium shadow-xs'
                      : 'text-foreground-muted hover:text-foreground hover:bg-surface-raised'
                  }`}
                  title={cat.name}
                  aria-label={cat.name}
                >
                  <span className="text-sm leading-none flex-shrink-0">{cat.icon}</span>
                  <span className="hidden sm:inline text-[11px] truncate">{cat.shortLabel}</span>
                </button>
              ))}
            </div>
          )}

          {/* Emoji Grid */}
          <div className="h-44 overflow-y-auto grid grid-cols-7 sm:grid-cols-8 gap-1 p-1 select-none">
            {filteredEmojis.map((emoji, index) => (
              <button
                key={`${emoji}-${index}`}
                type="button"
                onClick={() => {
                  onSelectEmoji(emoji);
                  setIsOpen(false);
                }}
                aria-label={`Select emoji ${emoji}`}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-surface-raised hover:scale-115 active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
