# textLove - UI Design System & Aesthetic Specification

## 1. Design Vision & Philosophy

**textLove** is designed to feel like an artisanal, high-end privacy instrument: quiet, refined, minimal, and intensely secure.

### Core Visual Principles:
- **Restrained Glassmorphism**: Use translucent card surfaces (`backdrop-blur-md` with subtle border contrast) rather than heavy, lag-inducing full-page blurs.
- **Deep Obsidian Dark Mode & Porcelain Light Mode**: Crafted HSL palettes optimized for contrast and OLED battery efficiency.
- **Micro-Interactions Over Flashy Transitions**: Fast, subtle animations (150ms-250ms) conveying state changes without impeding user speed.
- **No Deceptive Security Clichés**: No faux biometric fingerprints, padlock spinners, or fake military-grade graphics. Real cryptographic trust is shown via clean safety number badges and delivery checkmarks.

---

## 2. Color Palettes & Design Tokens

### 2.1 Dark Mode (Default / Primary)
Designed for immersive, focused communication:

```css
:root[class~="dark"] {
  --background: 224 71% 4%;         /* #090A0F - Deep Obsidian */
  --surface: 224 45% 8%;            /* #0E121C - Muted Dark Surface */
  --surface-raised: 224 40% 12%;     /* #141A28 - Elevated Card Surface */
  --border: 224 25% 18%;            /* rgba(255, 255, 255, 0.08) */
  --border-focus: 262 83% 58%;      /* #8B5CF6 - Electric Violet Accent */

  --foreground: 210 40% 98%;        /* Crisp Silver-White */
  --foreground-muted: 215 20% 65%;  /* Slate Gray */

  --primary: 262 83% 58%;           /* #8B5CF6 - Vibrant Purple / Violet */
  --primary-foreground: 210 40% 98%;

  --accent-rose: 336 84% 57%;       /* #F43F5E - Gentle Warm Rose Accent */
  --accent-emerald: 158 64% 52%;    /* #10B981 - Verified Online / E2EE Green */
  --accent-amber: 38 92% 50%;       /* #F59E0B - Expiry Warning / Uncertain */
  --accent-crimson: 0 84% 60%;      /* #EF4444 - Offline / Terminated / Danger */
}
```

### 2.2 Light Mode (Crisp & Clean)
Designed for daylight readability with soft depth:

```css
:root[class~="light"] {
  --background: 210 40% 98%;        /* #F8FAFC - Soft Porcelain */
  --surface: 0 0% 100%;             /* #FFFFFF - Pure White Cards */
  --surface-raised: 210 40% 96%;     /* #F1F5F9 - Light Muted Surface */
  --border: 214 32% 91%;            /* #E2E8F0 - Soft Slate Border */
  --border-focus: 262 83% 58%;

  --foreground: 222 47% 11%;        /* #0F172A - Deep Charcoal */
  --foreground-muted: 215 16% 47%;  /* #64748B - Muted Slate */

  --primary: 262 83% 58%;           /* #8B5CF6 */
  --primary-foreground: 0 0% 100%;

  --accent-rose: 336 84% 57%;
  --accent-emerald: 158 64% 42%;
  --accent-amber: 38 92% 50%;
  --accent-crimson: 0 84% 60%;
}
```

---

## 3. Typography Stack

- **Font Family**: Modern sans-serif stack led by `Inter` and `Plus Jakarta Sans` with fallback to system UI:
  ```css
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  ```
- **Monospace Stack** (for Safety Numbers, fingerprints, timestamps):
  ```css
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  ```
- **Hierarchy**:
  - `h1`: `text-2xl font-semibold tracking-tight` (Chat headers, major titles)
  - `h2`: `text-lg font-medium` (Modal headings, contact names)
  - `body`: `text-sm font-normal leading-relaxed` (Message bubbles, descriptions)
  - `caption`: `text-xs font-normal text-muted-foreground` (Timestamps, delivery badges)
  - `mono-num`: `font-mono text-xs tracking-wider uppercase` (Safety numbers)

---

## 4. Key Component Blueprints

### 4.1 Chat Header
- **Avatar & Presence**: 40px circular Cloudinary avatar with a glowing 8px presence ring (Emerald green for live online, slate for offline).
- **Username & Status**: Primary display name, `@username` handle, and live status badge (`"Active Now"` or `"Disconnected"`).
- **Inactivity Timer**: A minimal countdown pill:
  ```
  [ ⏳ 28:45 remaining ]
  ```
  Transitions from subtle gray to amber at $< 5$ minutes, and pulsing red at $< 1$ minute.
- **Safety Number Trigger**: A shield icon button opening the fingerprint modal.
- **End Chat Button**: An unobtrusive danger-ghost button (`"End & Delete"`).

### 4.2 Message Bubble Architecture
- **Sent Message (Right)**:
  - Background: Gradient from `hsl(var(--primary))` to `hsl(var(--accent-rose))` with high contrast white text.
  - Border radius: `rounded-2xl rounded-br-sm`.
  - Delivery footer: Timestamp + Delivery badge (`✓`, `✓✓`, or double green `✓✓`).
- **Received Message (Left)**:
  - Background: `bg-surface-raised` with crisp border `border border-border`.
  - Border radius: `rounded-2xl rounded-bl-sm`.
- **System Pill**:
  - Centered chip: `text-xs px-3 py-1 rounded-full bg-surface-raised/50 border border-border text-foreground-muted`.
  - Used for notices: `"Session established with end-to-end encryption"`, `"Messages expire 30m after inactivity"`.

### 4.3 Safety Number Modal
- Renders 12-digit fingerprint separated into groups: `394-102-583-991`.
- Clean SVG QR code for optical scanning between two phones.
- Clear explanatory copy: *"Compare this number with your peer to guarantee no third party is intercepting your conversation."*

---

## 5. Accessibility (a11y) & Low-End Device Optimizations

1. **WCAG 2.1 AA Compliance**:
   - Contrast ratio $\ge 4.5:1$ on all text and $\ge 3:1$ on user interface components.
   - All interactive icons have explicit `aria-label` attributes.
   - Visible keyboard `:focus-visible` rings with electric violet outlines.
2. **Low-End Hardware Performance**:
   - Limit `backdrop-filter: blur(...)` to fixed header bars only.
   - Hardware-accelerated CSS transforms (`transform: translate3d(...)`, `will-change: opacity`).
   - Zero heavy JavaScript animation libraries (no Framer Motion bundle bloat; standard Tailwind CSS transitions).
