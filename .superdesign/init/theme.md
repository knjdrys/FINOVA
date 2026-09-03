# Theme Tokens & Design System

## Part 1 — Compact Token Summary

### Color Palette
- **Primary Background**: `#F7F7F2` (Warm neutral light background)
- **Primary Surface / Cards**: `#FFFFFF` (Pure white cards with subtle borders)
- **Primary Dark Emerald**: `#122A1E` (FINOVA signature deep forest emerald)
- **Secondary Emerald**: `#183625` (Medium forest emerald)
- **Accent Neon Lime**: `#D4F63D` (FINOVA signature high-contrast energetic lime)
- **Subtle Emerald Tint**: `#E6F4EA` / `#DCFCE7` (Light green chips and badges)
- **Text Primary**: `#0F172A` / `#1E293B` (Slate 900 / Slate 800)
- **Text Secondary**: `#64748B` / `#94A3B8` (Slate 500 / Slate 400)
- **Danger / Alert**: `#E11D48` / `#BE123C` (Rose 600 / Rose 700)
- **Warning**: `#D97706` / `#B45309` (Amber 600 / Amber 700)
- **Success**: `#059669` / `#047857` (Emerald 600 / Emerald 700)

### Typography
- **Font Family**: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
- **Weights**: Regular (400), Medium (500), SemiBold (600), Bold (700), ExtraBold (800), Black (900)

### Border Radius Scale
- **Pills / Badges**: `rounded-full` (9999px)
- **Buttons / Form Inputs**: `rounded-xl` (12px) to `rounded-2xl` (16px)
- **Cards & Banners**: `rounded-[24px]` to `rounded-[28px]` (24px–28px)
- **Hero Containers / Modals**: `rounded-[32px]` (32px)

### Shadows
- **Cards**: `shadow-xs` / `shadow-sm` with `border border-slate-100` or `border border-slate-200/80`
- **Hero / WaveCard**: `shadow-xl shadow-emerald-950/20`
- **Action Buttons**: `shadow-md shadow-lime-500/20`

---

## Part 2 — Raw Source Dumps

### `src/index.css`
```css
@import "tailwindcss";

@layer base {
  :root {
    --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }

  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    min-height: 100%;
    background-color: #F7F7F2;
    color: #0F172A;
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }
}

.pb-safe {
  padding-bottom: env(safe-area-inset-bottom, 16px);
}

.pt-safe {
  padding-top: env(safe-area-inset-top, 0px);
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
```
