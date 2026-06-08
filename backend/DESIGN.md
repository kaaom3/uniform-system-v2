---
name: Uniform & Waterpark Admin
description: Internal management dashboard for uniform inventory and waterpark access.
colors:
  primary: "#4f46e5"
  primary-hover: "#4338ca"
  primary-light: "#6366f1"
  neutral-bg: "#f8fafc"
  neutral-surface: "#ffffff"
  neutral-sidebar: "#f1f5f9"
  neutral-header: "#0f172a"
  ink-base: "#1e293b"
  ink-muted: "#94a3b8"
  accent-success: "#10b981"
  accent-danger: "#f43f5e"
  accent-info: "#0891b2"
  accent-warning: "#f59e0b"
  cyan-primary: "#06b6d4"
  cyan-dark: "#0891b2"
typography:
  display:
    fontFamily: "Sarabun, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 900
    lineHeight: 1.2
  body:
    fontFamily: "Sarabun, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Sarabun, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.4
    textTransform: "uppercase"
  small:
    fontFamily: "Sarabun, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "14px"
  "2xl": "16px"
  "3xl": "24px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
motion:
  easeOutQuart: "cubic-bezier(0.25, 1, 0.5, 1)"
  easeOutExpo: "cubic-bezier(0.16, 1, 0.3, 1)"
  duration-fast: "200ms"
  duration-normal: "250ms"
  duration-slow: "400ms"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
    fontWeight: "700"
    transition: "300ms"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    border: "1px solid {colors.neutral-sidebar}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
    hoverBg: "{colors.neutral-sidebar}"
  card:
    backgroundColor: "{colors.neutral-surface}"
    rounded: "{rounded.2xl}"
    padding: "20px"
    border: "1px solid #e2e8f0"
    shadow: "0 1px 3px 0 rgb(0 0 0 / 0.1)"
  header:
    backgroundColor: "{colors.neutral-header}"
    textColor: "#ffffff"
    padding: "16px-20px"
    shadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)"
---

# Design System: Uniform & Waterpark Admin

## 1. Overview

**Creative North Star: "The Precise Quartermaster"**

This system is designed for high-efficiency administrative workflows within a company. It prioritizes clarity and speed over decoration, using a restrained professional palette centered on indigo actions and clean slates. The interface feels like a modern SaaS tool—functional, trustworthy, and built to reduce friction during long administrative sessions. Multi-language support (Thai + English) ensures accessibility for diverse teams.

**Key Characteristics:**
- High density without clutter; all information scannable at a glance.
- Strong semantic color cues: Indigo for primary actions, Emerald for approval/success, Rose for rejection/danger, Cyan for secondary info (waterpark tier).
- Soft but structural rounding (12px–16px) reduces visual fatigue during extended use.
- Consistent motion vocabulary (ease-out-quart, ease-out-expo) for predictable interactions.
- Notification toasts and modal overlays for task feedback.
- Responsive grid adapting from mobile (full-width) to desktop (sidebar nav + main content).

---

## 2. Colors

The palette is **Restrained**, using slate neutrals to ground the interface and indigo for primary actions.

### Primary Action
- **Indigo 600** (#4f46e5): Primary buttons, active navigation states, focus indicators.
- **Indigo 700** (#4338ca): Hover state for primary buttons.
- **Indigo 500** (#6366f1): Secondary buttons, light backgrounds (e.g., active tab bg).
- **Indigo 50** (#eef2ff): Background tint for active tab/nav items.

### Neutral Foundation
- **Deep Header** (#0f172a / Slate-900): Top navigation bar; provides strong visual anchor and contrast.
- **Soft Background** (#f8fafc / Slate-50): Main workspace background; reduces eye strain.
- **Sidebar Slate** (#f1f5f9 / Slate-100): Subtle shift from main background to define navigation rail.
- **Neutral Surface** (#ffffff): Card backgrounds, form inputs, modal content.
- **Ink Base** (#1e293b / Slate-800): Primary text; maintains 4.5:1 contrast on light backgrounds.
- **Ink Muted** (#94a3b8 / Slate-400): Secondary text, disabled states; 4.5:1 contrast on light backgrounds.

### Semantic & Status Colors
- **Emerald 500** (#10b981): Approved requests, success states, positive badges.
- **Rose 500** (#f43f5e): Rejected requests, error states, danger actions.
- **Cyan 600** (#06b6d4): Waterpark tier displays, secondary info panels.
- **Amber 500** (#f59e0b): Warnings (e.g., "locked registration" alerts).
- **Sky 500** (#0891b2): Accent info, secondary actions, read badges.

### The Rarity Rule
The primary indigo accent is reserved for the single most important action on any screen. Its absence is as important as its presence. Secondary screens and lower-priority actions use ghost buttons or slate outlines.

---

## 3. Typography

**Font Family:** Sarabun (Google Fonts; system fallback: sans-serif)

A single sans-serif family maintains a technical, tool-like feel and ensures wide browser support. Sarabun is optimized for Thai text rendering with clear letterforms and even spacing.

### Hierarchy & Weights

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| **Display / Page Title** | 1.5rem (24px) | 900 | 1.2 | Page titles (e.g., "Admin Dashboard") |
| **Heading / Section** | 1.25rem (20px) | 800 | 1.2 | Section headers, card titles |
| **Body / Paragraph** | 0.875rem (14px) | 400 | 1.5 | Main text, descriptions, lists |
| **Label / Eyebrow** | 0.75rem (12px) | 700 | 1.4 | Form labels, small caps eyebrows, badges (uppercase) |
| **Small / Meta** | 0.625rem (10px) | 500 | 1.4 | Timestamps, secondary metadata, hints |

### Contrast Requirements
- Body text and placeholders: **4.5:1 minimum** against background (WCAG AA).
- All text on colored backgrounds: test with computed contrast; adjust text color or background if below 4.5:1.
- Links: 4.5:1 minimum; underline on hover/focus for clarity.

---

## 4. Elevation & Shadows

The system uses tonal layering and structural shadows rather than heavy borders or gradients.

### Shadow Vocabulary
- **Card Shadow (sm)**: `0 1px 3px 0 rgb(0 0 0 / 0.1)` — Standard resting state for content containers.
- **Header/Modal Shadow (lg)**: `0 20px 25px -5px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)` — Elements that overlap main content or fixed headers.
- **Hover Lift**: Cards and interactive items lift on hover with `transform: translateY(-2px)` and increased shadow for tactile feedback.
- **Focus States**: `box-shadow: 0 0 0 3px {primary-color} / 0.1` or `ring-2 ring-indigo-500` for keyboard navigation.

### Z-Index Scale
- **Backdrop (modal)**: 50 (covers main content, allows interaction behind with transparency)
- **Notification Toast**: 999 (above everything; 9999 for critical alerts)
- **Modal / Dialog**: 100 (above backdrop)
- **Sticky Header**: 20 (above scrolling content)
- **Dropdown / Popover**: 1000 (absolute position; must escape overflow containers)

---

## 5. Motion & Transitions

Motion is intentional and enhances usability without being gratuitous.

### Easing Curves
- **Ease Out Quart** (`cubic-bezier(0.25, 1, 0.5, 1)`): Smooth deceleration; used for tab transitions, micro-interactions.
- **Ease Out Expo** (`cubic-bezier(0.16, 1, 0.3, 1)`): Faster deceleration; used for entrance animations, scale effects.

### Duration Scale
- **Fast (200ms)**: Hover states, button press feedback, color transitions.
- **Normal (250–300ms)**: Tab switches, card transitions, focus states.
- **Slow (400ms)**: Page entrance animations, staggered list reveals.

### Specific Animations
- **Entrance (fadeInScale)**: `opacity 0 → 1, transform scale(0.98) → 1, translateY(10px) → 0` over 400ms ease-out-expo.
- **Stagger**: Sequential children delayed by 50ms increments (`.stagger-1`, `.stagger-2`, etc.).
- **Tab Switch**: Outgoing tab fades out + slides down (opacity 1 → 0, translateY 0 → 10px); incoming tab fades in + slides up (reverse).
- **Button Press**: Active state uses `scale(0.96)` for tactile feedback.
- **Hover Lift**: Interactive cards elevate with `translateY(-2px)` and increased shadow.

### Reduced Motion
Every animation includes a `@media (prefers-reduced-motion: reduce)` fallback that removes motion and uses instant opacity changes or no animation. Example:
```css
@media (prefers-reduced-motion: reduce) {
  .interactive-card, .admin-tab-content {
    transition: none;
    animation: none;
  }
}
```

---

## 6. Components

### Buttons

| Variant | Background | Text | Border | Rounded | Padding | Transition |
|---------|------------|------|--------|---------|---------|------------|
| **Primary** | Indigo 600 | White | None | lg (12px) | 10px 16px | 300ms hover to Indigo 700 |
| **Secondary** | Slate 800 | White | 1px Slate 700 | lg | 10px 16px | 300ms hover shade change |
| **Ghost** | Transparent | Slate 500 | 1px Slate 200 | lg | 10px 16px | 300ms hover to Slate 100 bg |
| **Danger** | Rose 500 | White | None | lg | 10px 16px | 300ms hover to Rose 600 |
| **Success** | Emerald 500 | White | None | lg | 10px 16px | 300ms hover to Emerald 600 |

- **Active State**: Primary buttons active on click use `scale(0.96)` for press feedback.
- **Disabled State**: Opacity 0.5, cursor-not-allowed, no hover effect.
- **Loading State**: Icon spinner (animated circle) replaces button text; button disabled.

### Cards

- **Background**: White (#ffffff)
- **Border**: 1px Slate 200
- **Rounded**: 2xl (16px)
- **Padding**: 20px (or 16px for compact cards)
- **Shadow**: 0 1px 3px rgb(0 0 0 / 0.1)
- **Hover**: Lift with `translateY(-2px)` and increased shadow (not all cards; only interactive ones)

### Forms & Inputs

- **Background**: Slate 50 (#f1f5f9)
- **Border**: 1px Slate 200; focused: 2px ring Indigo 500
- **Rounded**: lg (12px)
- **Padding**: 12px 16px (inside inputs)
- **Text Color**: Slate 700
- **Label Style**: 0.75rem uppercase, 700 weight, Slate 700

### Navigation (Sidebar)

- **Active State**: 4px left-border indigo-500 + light indigo background tint (indigo-50).
- **Inactive State**: Transparent background, slate-500 text, 4px transparent left border.
- **Hover State**: Slate 100 background, slate-700 text.
- **Icon + Label**: Icons 20px, label 0.875rem medium weight, gap 12px.

### Notifications / Toasts

- **Position**: Fixed top-right, z-index 999.
- **Background**: Emerald 500 (success), Rose 500 (error), Indigo 600 (info).
- **Text**: White, 14px medium weight.
- **Padding**: 12px 24px (py-3 px-6)
- **Rounded**: xl (14px)
- **Border**: 1px white / 20% opacity (adds lightness)
- **Backdrop Filter**: Slight blur (`backdrop-blur-sm`) for depth.
- **Duration**: Auto-dismiss after 5000ms.
- **Motion**: Fade in on appear, fade out on dismiss (250ms ease-out-quart).

### Modals & Dialogs

- **Backdrop**: Semi-transparent overlay, dark with opacity 0.3–0.5.
- **Modal Container**: White background, rounded-2xl, shadow-lg, max-width constrained (often 500–600px).
- **Close Button**: Icon button, slate-300 text, hover to slate-500.
- **Title**: Display weight (900), slate-800, 1.25rem.
- **Body**: Body text (400 weight), slate-600, line-height 1.5.
- **Footer**: Right-aligned action buttons, separated by gap-3.

### Tabs / Tab Navigation

- **Inactive Tab**: Transparent background, slate-500 text, 4px transparent left border.
- **Active Tab**: Indigo 50 background, Indigo 600 text, 4px indigo-500 left border.
- **Transition**: 250ms ease-out-quart (opacity + transform).

### Badges / Badges

- **Background**: Color-coded (success=emerald-50, danger=rose-50, info=indigo-50, etc.).
- **Text**: Color-coded (success=emerald-700, danger=rose-700, info=indigo-700, etc.).
- **Rounded**: full (border-radius 9999px) for pill shape.
- **Padding**: 4px 12px (py-1 px-3).
- **Font**: 0.75rem, 600 weight.
- **Border**: 1px matching color (e.g., emerald-200 for success).

---

## 7. Responsive Breakpoints & Layout

### Mobile-First Grid
- **Base**: Full-width single column, max-width 100%.
- **sm (640px)**: Two-column grids, tighter padding (16px → 8px gutters).
- **md (768px)**: Three-column grids, flex sidebar to top navigation.
- **lg (1024px)**: Full sidebar navigation (left rail), main content takes remaining space.
- **xl (1280px)**: Max-width container (1280px) centered with padding.

### Admin Dashboard Layout
```
Header (full-width, sticky, z-20)
├── Logo + Title
├── Navigation (mobile: hamburger; desktop: always visible)
└── User Menu + Logout

Body (flex row on desktop, single column on mobile)
├── Sidebar (md+ only, overflow-y-auto, width 256–288px)
│   ├── Nav eyebrow "เมนูการจัดการ" (uppercase label)
│   └── Tab buttons (stack vertical, full-width)
└── Main Content Area (flex-1, overflow-y-auto)
    ├── Active tab content (animated in)
    └── [Tables, forms, cards as needed]
```

### Grid for Cards / Data
- Uniform layouts use `grid-cols-1 lg:grid-cols-2 xl:grid-cols-3` with gap-6.
- Responsive table columns stack on mobile, expand to full layout on desktop.

---

## 8. Do's and Don'ts

### Do:
- ✅ Use Tailwind utility classes for spacing, colors, and rounded values (e.g., `rounded-lg`, `p-4`, `gap-3`).
- ✅ Maintain consistent 16px–24px padding between major content sections.
- ✅ Use semantic color assignments: indigo for primary, emerald for approved, rose for rejected.
- ✅ Apply `rounded-lg` (12px) to buttons and form inputs; `rounded-2xl` (16px) to cards.
- ✅ Include `@media (prefers-reduced-motion: reduce)` for all animations.
- ✅ Test all text contrast against its background; aim for 4.5:1 on body text.
- ✅ Use `aria-label` and `aria-hidden` to ensure screen reader support.
- ✅ Provide clear `:focus-visible` states for keyboard navigation.

### Don't:
- ❌ Don't use hard-coded hex values; always prefer Tailwind tokens and CSS variables (e.g., `bg-indigo-600`, not `style="background: #4f46e5"`).
- ❌ Don't use `border-left` > 1px as a decorative accent except for navigation active states.
- ❌ Don't use gradient text (`background-clip: text`); use solid colors for readability.
- ❌ Don't apply display fonts (900 weight) to data labels or form input text; reserve for headings.
- ❌ Don't nest cards within cards; flatten the hierarchy.
- ❌ Don't remove focus states or outline for "cleaner" appearance; keyboard users depend on them.
- ❌ Don't animate layout properties (width, height, top, left); animate opacity, transform, or filter instead.
- ❌ Don't use more than 2–3 accent colors on a single page; restrict indigo to primary actions.
- ❌ Don't disable auto-dismiss for notification toasts; users expect them to auto-clear after 5s unless interacted with.

---

## 9. Language & Localization

The system supports **Thai (th) and English (en)** with:
- Thai font (Sarabun) loaded from Google Fonts with weights 300–800.
- Thai language labels in UI (e.g., "Admin Dashboard" + Thai equivalent).
- Right-to-left (RTL) not currently in scope; all text is left-to-right.
- Date/time formatting using locale-aware formatting (e.g., `Intl.DateTimeFormat`).
- Number formatting for currency and quotas (e.g., "1,234 / 2,500").

---

## 10. Accessibility & WCAG AA Compliance

- **Color Contrast**: All text meets 4.5:1 against background; large text (≥18px or bold ≥14px) meets 3:1.
- **Focus States**: All interactive elements have visible `:focus-visible` outlines (2px ring, indigo-500).
- **Keyboard Navigation**: Tab order is logical (left-to-right, top-to-bottom); no keyboard traps.
- **Screen Readers**: Form labels tied to inputs via `<label for>` or `aria-label`; buttons have descriptive text (e.g., "Delete Request" not "Delete").
- **Motion**: `prefers-reduced-motion` is honored; all animations are optional and disable gracefully.
- **Reduced Motion Alternative**: Users who prefer reduced motion see instant transitions or no motion at all.
- **Text Resizing**: Layout doesn't break at 200% zoom; responsive design scales text and spacing.

---

## 11. Performance & Best Practices

- **Font Loading**: Sarabun loaded via Google Fonts with subset=latin,thai and `font-display: swap` for fast initial render.
- **CSS Delivery**: Tailwind CSS via CDN; inline critical styles in `<style>` tags for above-the-fold content.
- **Image Optimization**: Use responsive images (`srcset`, `sizes`) or CDN-hosted images with size hints.
- **Animations**: Use `transform` and `opacity` for 60fps performance; avoid animating layout properties.
- **Bundle Size**: Keep inline CSS to < 50KB; defer non-critical JavaScript.

---

## 12. Future Enhancements (Out of Scope)

- Dark mode toggle (would require separate color palette).
- Right-to-left (RTL) language support (Arabic, Hebrew).
- High-contrast theme for extreme accessibility needs.
- Advanced data visualization (charts, graphs) with color-safe palettes.
