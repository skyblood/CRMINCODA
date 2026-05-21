# DESIGN.md — CRM Blackmoon Design System

Source of truth for colors, typography, spacing, and component patterns.
All overrides live in the `<style>` block in `index.html` — do NOT create separate CSS files.

---

## Color Palette

| Token | Hex | Usage |
|---|---|---|
| `bm-700` | `#25024C` | Hover states, dark backgrounds |
| `bm-600` | `#410074` | Primary — buttons, links, active nav |
| `bm-200` | `#B9B7C9` | Borders (medium emphasis) |
| `bm-100` | `#E5E4F0` | Hover backgrounds, subtle fills |
| `bm-50`  | `#E5E4F0` | Light backgrounds, tag fills |

### Semantic mappings (Tailwind override)
All `blue-*` and `indigo-*` Tailwind classes are remapped to the Blackmoon palette via `!important` in `index.html`. Use standard Tailwind classes — the overrides apply automatically.

```
bg-blue-600    → #410074  (bm-600)
bg-blue-700    → #25024C  (bm-700)
bg-blue-50/100 → #E5E4F0  (bm-50)
text-blue-600  → #410074
border-blue-600 → #410074
border-blue-200 → #B9B7C9
focus:ring     → #41007433
```

### Neutral grays (unchanged from Tailwind)
Use standard `gray-*` classes. Do not override.

---

## Typography

- **Font**: Inter (loaded via `@fontsource/inter`)
- **Body**: `text-sm` (14px) — all data-dense views
- **Headings**: `text-lg font-semibold` (section titles), `text-base font-medium` (card titles)
- **Labels**: `text-xs text-gray-500` (field labels, metadata)
- **Monospace**: `font-mono text-xs` (IDs, tokens)

---

## Spacing

- **Card padding**: `p-4` (16px) standard, `p-6` (24px) modals
- **Section gap**: `space-y-4` between form groups, `space-y-6` between sections
- **Grid gap**: `gap-4` default, `gap-6` for dashboard cards
- **Sidebar width**: `w-64` (256px) desktop, hidden mobile

---

## Component Patterns

### Buttons
```tsx
// Primary
<button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">

// Secondary
<button className="border border-gray-200 hover:bg-blue-50 text-gray-700 px-4 py-2 rounded-lg text-sm">

// Danger
<button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm">

// Ghost/icon
<button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
```

### Cards
```tsx
<div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
```

### Form inputs
```tsx
<input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-blue-600" />
```

### Badges / stage pills
```tsx
<span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
```

### Modal overlay
```tsx
<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
  <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
```

### Table
```tsx
<table className="w-full text-sm">
  <thead><tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide"></tr></thead>
  <tbody className="divide-y divide-gray-50">
```

---

## Icons

Library: **Lucide React** (`lucide-react`). Use `size={16}` for inline icons, `size={18}` for buttons, `size={20}` for nav items.

---

## Dark Mode

Not implemented. All components assume light background (`bg-white`, `bg-gray-50`). Do not add `dark:` variants until a dark mode toggle is added.

---

## Adding New Colors

1. Add hex value to this file under the palette table.
2. Add the Tailwind override `!important` rule to the `<style>` block in `index.html`.
3. Do NOT create a `tailwind.config.js` color extension — the CDN override approach is intentional until PostCSS migration is complete.
