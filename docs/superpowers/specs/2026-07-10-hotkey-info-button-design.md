# Hotkey Info Button + `i` Toggle — Design

**Goal:** Make the keyboard-shortcut summary discoverable: pressing `i` toggles the existing hotkey help panel, and a standalone faint-gray circular "i" button at the top-left of the desktop viewer opens the same panel.

**User decisions (2026-07-10):** `cycleImageLoad` rebinds from `i` to `l` so plain `i` becomes the info toggle; the button is desktop-only (hidden in touch mode, where the hamburger FAB owns top-left, and in embed mode).

## What already exists (reused, not rebuilt)

- `HotkeyHelpModal` (`src/components/modals/HotkeyHelpModal.tsx`) renders the full shortcut summary — sections auto-generated from the `HOTKEYS` registry via `getHotkeyHelpSections()` — toggled today by `shift+/` (`?`). Its open state is component-local (`useState`).
- `hotkeyHelpViewModel.ts` holds all its class strings and the footer toggle-key label.
- `HOTKEYS` registry (`src/config/hotkeys.ts`) is the single source of truth; downstream tooltips/rows derive from it via `formatKeyCombo`.

## Changes

### 1. Registry (`src/config/hotkeys.ts`)
- `cycleImageLoad.keys`: `'i'` → `'l'` (`l` is unbound; mnemonic for "load"). Description/category/scopes unchanged.
- `showHelp.keys`: `'shift+/'` → `'shift+/, i'` (comma-separated combos are the registry's existing multi-key idiom, e.g. `'e, space'`). Scope stays `global`, `preventDefault` stays true.
- New regression guard: a registry-wide **key-uniqueness test** — no two hotkey definitions whose scopes overlap may share a key combo (split comma lists before comparing). This catches the next `i`-style collision at test time.

### 2. Trigger button (approach B: no store surface added)
`HotkeyHelpModal` renders BOTH the trigger button and the dialog (it is mounted at the App root, so `position: fixed` works):
- **Look:** faint grayish circle (~32px, `rounded-full`, translucent gray background, muted "i" glyph — a bare lowercase letter, NOT `InfoIcon`, which is itself a circled-i and would double-circle), subtle hover brightening, `title="Keyboard shortcuts (I)"`, `aria-label="Show keyboard shortcuts"`.
- **Position:** fixed top-left (same `top-4 left-4` inset the touch FAB grid uses), z-index above the canvas and below modal overlays (reuse an existing `Z_INDEX` token).
- **Visibility:** rendered only when `!touchMode && !embedMode`, read through a new `useHotkeyHelpStoreFacade` (componentStoreBoundary: components never call `use*Store` directly).
- **Behavior:** click toggles the same local `isOpen` the hotkeys drive.
- All class strings and the visibility predicate live in `hotkeyHelpViewModel.ts` (pure, unit-tested); any CSS utility the class strings need that doesn't exist yet (e.g. a translucent gray background) is added as a real hand-written rule in `src/index.css` (this repo has NO Tailwind).

### 3. Footer label
`getHotkeyHelpToggleKeyLabel()` currently renders the single toggle key; update it (and the footer copy if needed) to present both toggles — "?" and "I" — so the panel's own hint stays truthful.

## Edge cases
- Typing `i`/`l` in text inputs: react-hotkeys-hook ignores form fields by default — unchanged, but the uniqueness test plus existing modal-scope behavior are the guards.
- Escape/backdrop close, focus trap: unchanged (`ModalDialogShell`).
- Touch/embed: the button does not render; `?` and `i` still work on a hardware keyboard if one is attached (hotkey scope unchanged).
- Existing users' muscle memory: `i` no longer cycles image load — `l` does; the help panel row updates automatically from the registry.

## Testing
- Registry: rebind pins (`cycleImageLoad === 'l'`, `showHelp` contains both `shift+/` and `i`) + the new uniqueness test.
- View model: class-string pins (all utilities exist in `index.css`), visibility predicate (desktop true; touch/embed false), footer label "?"+"I".
- Component (`HotkeyHelpModal.test`): `i` toggles the panel; button click opens it; button absent when touch or embed; `?` still works.

## Non-goals
- No store-lifted modal state, no popup-layer inventory changes, no touch-mode button, no toolbar entry, no redesign of the panel's content.

## Revision (2026-07-10, user feedback after first build)

1. **Button design "not clean"** → replace the translucent-circle-with-text-glyph with the existing `InfoIcon` (a stroked circled-i SVG): transparent button, icon ~w-5 h-5 in `text-ds-muted`, hover brightens (`hover` state via existing utilities), same fixed top-left position, tooltip/aria/testid unchanged. The icon draws its own circle — no background blob.
2. **Panel "spams the page"** → tabbed layout instead of one long scroll. First tab **Essentials** (default): the curated rows for `u` (Toggle undistorted view), `b` (Toggle background), `a` (Strafe left), `o` (Cycle auto orbit), `p` (Cycle point cloud color mode), plus the control/alt combos `alt+scroll` (frustum size) and `ctrl+scroll` (point size). Remaining tabs = the existing categories (General, Camera, Navigation, ... — whatever `HOTKEY_CATEGORIES` yields), one per tab, reusing the repo's tab pattern (see `DataPanel.tsx`). Curated list lives as an exported id list in `config/hotkeys.ts` so it's registry-checked (a test pins every essential id exists).
3. Panel keeps the centered shell + `maxHeight: 80vh` + per-tab `overflow-auto` from the centering fix.
