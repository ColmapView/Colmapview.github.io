# ColmapView Style Reference

A complete guide for matching the visual style of ColmapView in other projects.

---

## Philosophy

- **Dark-only** — no light mode. `color-scheme: dark` on root.
- **Neutral palette** — silver/gray accent, no brand color. Calm, technical feel.
- **Monochromatic UI, vivid data** — UI surfaces are near-black grays; 3D data uses saturated colors.
- **Utility-class CSS** — Tailwind-like classes defined in a single `index.css` file (no Tailwind config). Component style objects compose these classes in TypeScript.
- **Minimalist density** — compact controls, small text, high information density. Designed for desktop power users.

---

## Color Palette

### Backgrounds (darkest to lightest)

| Token              | Hex       | Usage                                    |
|--------------------|-----------|------------------------------------------|
| `--bg-void`        | `#0a0a0a` | Canvas/3D viewport, deepest background   |
| `--bg-primary`     | `#0f0f0f` | Page body, main app background           |
| `--bg-secondary`   | `#161616` | Sidebars, secondary panels               |
| `--bg-tertiary`    | `#1e1e1e` | Cards, control buttons, elevated panels  |
| `--bg-input`       | `#1a1a1a` | Form input fields                        |
| `--bg-elevated`    | `#242424` | Tooltips, popovers, dropdowns            |
| `--bg-hover`       | `#262626` | Hover state for interactive elements     |

### Text

| Token              | Hex       | Usage                                    |
|--------------------|-----------|------------------------------------------|
| `--text-primary`   | `#e8e8e8` | Headings, primary content, active labels |
| `--text-secondary` | `#8a8a8a` | Descriptions, inactive labels, metadata  |
| `--text-muted`     | `#5a5a5a` | Placeholders, disabled text, hints       |

### Borders

| Token              | Hex       | Usage                                    |
|--------------------|-----------|------------------------------------------|
| `--border-subtle`  | `#222222` | Very faint dividers                      |
| `--border-color`   | `#2a2a2a` | Default borders, input borders           |
| `--border-light`   | `#3a3a3a` | Visible borders, hover borders           |

### Accent

| Token              | Value                      | Usage                               |
|--------------------|----------------------------|-------------------------------------|
| `--accent`         | `#b8b8b8`                  | Active states, focus rings, toggles |
| `--accent-hover`   | `#d0d0d0`                  | Accent on hover                     |
| `--accent-dim`     | `rgba(184, 184, 184, 0.12)`| Subtle accent backgrounds           |

### Semantic Colors

| Token        | Hex       | Usage                          |
|--------------|-----------|--------------------------------|
| `--success`  | `#6b9b6b` | Success states, confirmations  |
| `--warning`  | `#b89b6b` | Warnings, cautions             |
| `--error`    | `#b86b6b` | Errors, destructive actions    |
| `--info`     | `#6b8bb8` | Informational, neutral alerts  |

### 3D Visualization Colors

These are intentionally vivid for visibility against the dark viewport:

| Purpose              | Color     |
|----------------------|-----------|
| Frustum default      | `#ff0000` |
| Frustum selected     | `#ff00ff` |
| Frustum hover        | `#6699aa` |
| Point triangulated   | `#00ff00` |
| Point untriangulated | `#ff0000` |
| Match line           | `#ff00ff` |
| Axis X / Y / Z       | Red `#e60000` / Green `#00e600` / Blue `#0000e6` |

---

## Typography

### Font Families

```css
--font-sans: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
```

- **Body text**: `--font-sans` (Roboto)
- **Code, values, stats**: `--font-mono`

### Font Sizes

| Class       | Size      | Usage                                    |
|-------------|-----------|------------------------------------------|
| `text-2xs`  | 0.625rem  | Tiny labels (10px)                       |
| `text-xs`   | 0.75rem   | Metadata, descriptions (12px)            |
| `text-sm`   | 0.875rem  | Control labels, buttons (14px)           |
| `text-base` | 1rem      | Body text (16px)                         |
| `text-lg`   | 1.125rem  | Section headers (18px)                   |
| `text-xl`   | 1.25rem   | Panel titles (20px)                      |
| `text-2xl`  | 1.5rem    | Modal titles (24px)                      |

### Base Text Rendering

```css
line-height: 1.5;
font-weight: 400;
font-synthesis: none;
text-rendering: optimizeLegibility;
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
```

---

## Spacing

### Scale (CSS Custom Properties)

| Token    | Value    | Pixels |
|----------|----------|--------|
| `--sp-1` | 0.25rem  | 4px    |
| `--sp-2` | 0.5rem   | 8px    |
| `--sp-3` | 0.75rem  | 12px   |
| `--sp-4` | 1rem     | 16px   |
| `--sp-6` | 1.5rem   | 24px   |
| `--sp-8` | 2rem     | 32px   |

### Component Spacing (TypeScript Constants)

```
Gallery gap:    8px
List gap:       8px
Control gap:    8px
Panel padding:  16px
Control padding: 12px
```

---

## Border Radius

| Token           | Value    |
|-----------------|----------|
| `--radius-sm`   | 0.125rem |
| `--radius`      | 0.25rem  |
| `--radius-md`   | 0.375rem |
| `--radius-lg`   | 0.5rem   |
| `--radius-xl`   | 0.75rem  |
| `--radius-2xl`  | 1rem     |
| `--radius-full` | 9999px   |

**Common usage**: Buttons use `rounded` (0.25rem). Control panel buttons use `rounded-lg` (0.5rem). Pills/badges use `rounded-full`.

---

## Shadows

```css
--shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.4);
--shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3);
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.6), 0 4px 8px rgba(0, 0, 0, 0.4);
```

Shadows are heavy (high opacity) because they must be visible on near-black backgrounds.

---

## Transitions

```css
--transition-fast:   0.1s ease-out;    /* Hover states, micro-interactions */
--transition-base:   0.15s ease-out;   /* Default transitions */
--transition-slow:   0.25s ease-out;   /* Panel open/close */
--transition-smooth: 0.3s cubic-bezier(0.4, 0, 0.2, 1);  /* Smooth motion */
```

---

## Z-Index Hierarchy

| Layer      | Value  | Usage                          |
|------------|--------|--------------------------------|
| Controls   | 10     | Viewer control buttons/panels  |
| Dropdown   | 100    | Dropdown menus                 |
| Sticky     | 200    | Sticky headers                 |
| Overlay    | 500    | Drag overlay, loading states   |
| Modal      | 1000   | Modal dialogs                  |
| Toast      | 1500   | Toast notifications            |
| Tooltip    | 2000   | Tooltips (always on top)       |

---

## Component Sizes

| Component         | Size   |
|-------------------|--------|
| Control button    | 40px   |
| Panel min width   | 220px  |
| Label width       | 80px   |
| Value display     | 32px   |
| Slider width      | 112px  |
| Thumbnail         | 48px   |
| List row height   | 72px   |
| Modal min width   | 400px  |
| Scrollbar         | 12px   |
| Range thumb       | 12px   |
| Range track       | 4px    |

---

## Responsive Breakpoints

| Breakpoint | Width   | Behavior                                    |
|------------|---------|---------------------------------------------|
| Phone      | < 640px | Blocked ("Desktop Only" message)            |
| Tablet     | < 1080px| Touch mode UI (larger tap targets, FABs)    |
| Compact    | < 1520px| Controls shrink (36px buttons, smaller text)|
| Desktop    | >= 1520px| Full-size controls                          |

At the 1520px breakpoint, control buttons shrink from 40px to 36px, SVG icons from 24px to 20px, and panel gap reduces.

---

## Button Patterns

### Variants

| Variant     | Background     | Text            | Usage                              |
|-------------|----------------|-----------------|------------------------------------|
| Primary     | `--accent`     | `--bg-void`     | Main actions (Download, Confirm)   |
| Secondary   | `--bg-hover`   | `--text-primary` | Default buttons                   |
| Tertiary    | `--bg-tertiary`| `--text-primary` | Panel action buttons + border     |
| Ghost       | transparent    | `--text-secondary`| Minimal buttons, toolbar items   |
| Danger      | `--error`      | white           | Destructive actions (Delete)       |
| Control     | `--bg-tertiary`| `--text-secondary`| Viewer control buttons + border  |
| Toggle Off  | `--bg-hover`   | `--text-secondary`| Inactive toggle                  |
| Toggle On   | `--accent`     | `--bg-void`     | Active toggle                      |

### Sizes

| Size  | Padding         | Font Size | Usage                    |
|-------|-----------------|-----------|--------------------------|
| xs    | 8px 4px         | 12px      | Compact inline actions   |
| sm    | 10px 6px        | 14px      | Secondary actions        |
| md    | 12px 6px        | 16px      | Default                  |
| lg    | 16px 8px        | 16px      | Prominent actions        |
| icon  | 4px             | —         | Icon-only buttons        |

### States

- **Hover**: Background lightens one step (e.g., tertiary -> hover)
- **Disabled**: `opacity: 0.5; cursor: not-allowed; pointer-events: none`
- **Focus**: `outline: 2px solid var(--accent); outline-offset: 2px`

---

## Form Elements

### Text Inputs

```css
background: var(--bg-input);      /* #1a1a1a */
border: 1px solid var(--border-color);  /* #2a2a2a */
border-radius: 0.25rem;
padding: 0.375rem 0.5rem;
color: var(--text-primary);
/* On focus: border-color changes to --accent */
```

### Select Dropdowns

Custom chevron via inline SVG background-image. Same colors as text inputs. `appearance: none` for cross-browser consistency.

### Checkboxes / Radio Buttons

- Custom styled, `appearance: none`
- 18px square, `border: 1.5px solid var(--border-light)`
- Checked: `background: var(--accent)`, white checkmark/dot
- Animated with 0.15s ease-out scale transition

### Range Sliders

- Track: 4px height, `--bg-tertiary` background
- Thumb: 12px circle, `--accent` background, `--shadow-sm`
- Container: 20px height for click area

---

## Panel / Card Layout

### Control Panel Pattern

```
┌──────────────────────────┐
│ Section Label (text-sm)  │  ← text-ds-primary, mb-1
├──────────────────────────┤
│ [Label] [Control]        │  ← flex row, label 80px, gap 8px
│ [Label] [Slider]         │
│ [Description text]       │  ← text-ds-tertiary text-xs
│                          │
│ ┌──────────────────────┐ │
│ │   Action Button      │ │  ← full-width, tertiary variant
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │   Action Button      │ │
│ └──────────────────────┘ │
│                          │
│ Section Label (text-sm)  │  ← mt-3 for section spacing
│ ...                      │
└──────────────────────────┘
```

- Background: `--bg-secondary` or `--bg-tertiary`
- Border: `1px solid var(--border-color)`
- Border radius: `--radius-lg` (0.5rem)
- Padding: 12-16px
- Min width: 220px
- Section gap: `mt-3` (12px) between sections

### Modal Pattern

- Backdrop: `rgba(0, 0, 0, 0.5)` (50% black overlay)
- Panel: `--bg-secondary` background, `--border-color` border
- Max: 85% viewport width/height
- Shadow: `--shadow-lg`
- Header: title + close button (X)
- Footer: action buttons, right-aligned

---

## Notification / Toast

- Position: top-right corner
- Animation: `slide-in-right` (0.3s ease-out)
- Background: `--bg-elevated`
- Left border: 3px colored by type (success/warning/error/info)
- Auto-dismiss: 5 seconds for errors
- Shadow: `--shadow-md`

---

## Tooltip System

```css
[data-tooltip]::after {
  padding: 6px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  box-shadow: var(--shadow-md);
  z-index: 2000;
}
```

Positions: `data-tooltip-pos="top|bottom|left|right"` (default: top).

---

## Scrollbar

```css
::-webkit-scrollbar        { width: 12px; }
::-webkit-scrollbar-track  { background: var(--bg-secondary); }
::-webkit-scrollbar-thumb  { background: var(--border-light); border-radius: 9999px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
```

---

## Animations

| Name               | Duration | Easing                        | Usage                  |
|--------------------|----------|-------------------------------|------------------------|
| `spin`             | 1s       | linear infinite               | Loading spinners       |
| `pulse`            | 2s       | cubic-bezier(0.4, 0, 0.6, 1) | Attention pulse        |
| `bounce`           | 1s       | custom cubic-bezier           | Loading dots           |
| `slide-in-right`   | 0.3s     | ease-out                      | Toast notifications    |
| `fade-out`         | 0.2s     | ease-out                      | Dismissing elements    |
| `matches-blink`    | 2s       | ease-in-out                   | Highlighting matches   |
| `checkmark`        | 0.15s    | ease-out                      | Checkbox check appear  |

---

## Accessibility

- **Focus visible**: 2px solid accent outline with 2px offset
- **Reduced motion**: All animations/transitions set to 0.01ms
- **Screen reader**: `.sr-only` class for visually hidden content
- **Touch targets**: Minimum 44px, preferred 48px
- **User select**: Disabled globally (`user-select: none`), enabled on inputs (`user-select: text`)

---

## Key Design Decisions

1. **No brand color** — the accent is neutral silver (`#b8b8b8`). This keeps the UI invisible and lets the 3D data be the visual focus.

2. **Near-black backgrounds** — The darkest surfaces (`#0a0a0a`-`#0f0f0f`) make the 3D viewport feel immersive. UI panels are slightly lighter (`#161616`-`#1e1e1e`) for separation.

3. **Heavy shadows** — Shadow opacity is 40-60% (vs typical 10-20%) because they must be visible against dark backgrounds.

4. **Semantic colors are muted** — Success/warning/error use desaturated pastels (`#6b9b6b`, `#b89b6b`, `#b86b6b`) rather than vivid red/green to avoid clashing with 3D visualization colors.

5. **Component styles in TypeScript** — Style objects (`buttonStyles`, `controlPanelStyles`, etc.) compose utility classes. This gives type-safe, consistent styling without CSS-in-JS runtime cost.

6. **Single CSS file** — All utility classes, animations, form resets, and custom properties live in one `index.css` (1600 lines). No Tailwind config, no PostCSS plugins beyond autoprefixer.
