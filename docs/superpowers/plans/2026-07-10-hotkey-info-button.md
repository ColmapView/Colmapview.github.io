# Hotkey Info Button + `i` Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pressing `i` toggles the existing keyboard-shortcut help panel, and a faint gray circular "i" button fixed at the desktop viewer's top-left opens the same panel. Spec: `docs/superpowers/specs/2026-07-10-hotkey-info-button-design.md` (user-approved).

**Architecture:** Reuse `HotkeyHelpModal` wholesale (approach B from the spec): the registry gains the `i` toggle (image-load cycling rebinds to `l`), and the modal component renders its own fixed trigger button gated by a new `useHotkeyHelpStoreFacade` (`!touchMode && !embedMode`). All strings/classes/predicates live in `hotkeyHelpViewModel.ts`.

**Tech Stack:** React 18 + TS, react-hotkeys-hook, Zustand facades, vitest/jsdom, hand-written CSS.

## Global Constraints

- **No Tailwind** — every className must exist as a real rule in `src/index.css`. Known-available: `top-4 left-4` (touchFabPolicy uses them), `rounded-full`? (VERIFY — add the one-line rule if missing), `bg-ds-tertiary/50` (index.css:927, escaped as `.bg-ds-tertiary\/50`), `text-ds-muted` (:955), `hover-ds-hover` (hyphen form; colon `hover:` forms do NOT exist), `w-8 h-8`, `flex items-center justify-center`, `cursor-pointer`. Verify EACH class in the final string; add any missing as a one-line hand-written rule and say so.
- **Store boundary:** the modal reads `touchMode`/`embedMode` ONLY via the new facade (precedent: `useShareButtonStoreFacade` exposes `embedMode`; `touchMode` lives on `useUIStore`).
- **TDD** (RED first, evidence in report); conventional commits ending with blank line + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Recompute/verify every claim** (key availability, class existence, helper behavior) against the repo.
- Full gate before push: `npm run test:run` (baseline 3,013 / 459 files), `npm run lint`, `npm run build`.
- Zustand test reset idiom: `useUIStore.setState(useUIStore.getInitialState(), true)` in `afterEach`.

---

### Task 1: Registry rebind + uniqueness guard

**Files:**
- Modify: `src/config/hotkeys.ts`
- Create: `src/config/hotkeys.test.ts`

**Interfaces:**
- `HOTKEYS.cycleImageLoad.keys`: `'i'` → `'l'` (verify `l` unbound by the new uniqueness test itself).
- `HOTKEYS.showHelp.keys`: `'shift+/'` → `'shift+/, i'` (registry's existing comma idiom, cf. `flyThrough`-style `'e, space'`). Scopes/preventDefault unchanged.
- Uniqueness rule the test enforces: split every definition's `keys` on `', '`, normalize case; two definitions may not share a key combo when their `scopes` arrays intersect. (`escape` is scoped `['modal']` only; `showHelp` is `['global']` — verify the real scope arrays and encode the rule accordingly rather than special-casing.)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { HOTKEYS } from './hotkeys';

function comboScopePairs() {
  return Object.entries(HOTKEYS).flatMap(([id, def]) =>
    def.keys.split(',').map((k) => ({ id, combo: k.trim().toLowerCase(), scopes: def.scopes }))
  );
}

describe('HOTKEYS registry', () => {
  it('binds i to the help panel and l to image-load cycling', () => {
    expect(HOTKEYS.showHelp.keys).toBe('shift+/, i');
    expect(HOTKEYS.cycleImageLoad.keys).toBe('l');
  });

  it('never binds the same combo twice within overlapping scopes', () => {
    const pairs = comboScopePairs();
    const collisions: string[] = [];
    for (let a = 0; a < pairs.length; a++) {
      for (let b = a + 1; b < pairs.length; b++) {
        const sameCombo = pairs[a].combo === pairs[b].combo;
        const scopesOverlap = pairs[a].scopes.some((s) => pairs[b].scopes.includes(s));
        if (sameCombo && scopesOverlap) {
          collisions.push(`${pairs[a].id} vs ${pairs[b].id}: ${pairs[a].combo}`);
        }
      }
    }
    expect(collisions).toEqual([]);
  });
});
```

(If the pre-rebind registry already contains a legitimate overlapping duplicate the second test would flag, STOP and report it — do not special-case silently. Note: 'global' scope conceptually overlaps everything only if the scope arrays literally intersect; encode exactly the literal-intersection rule above and verify it passes on the post-rebind registry.)

- [ ] **Step 2: RED** — `npx vitest run src/config/hotkeys.test.ts` fails on the rebind pins (registry still has `i`/`shift+/`).
- [ ] **Step 3: Implement the two registry edits.**
- [ ] **Step 4: GREEN** — same command; then `npx vitest run src/components/modals/hotkeyHelpViewModel.test.ts` (footer-label test there still special-cases `'shift+/'` → may now FAIL; if it does, leave it failing and note it — Task 2 owns that fix — or if the suite must stay green to commit, fold Tasks 1+2 into one commit and say so).
- [ ] **Step 5: Commit** — `feat(hotkeys): i toggles the shortcut panel; image-load cycling rebinds to l`

---

### Task 2: View model + facade

**Files:**
- Modify: `src/components/modals/hotkeyHelpViewModel.ts` (+ its test)
- Create: `src/components/modals/useHotkeyHelpStoreFacade.ts` (+ test)

**Interfaces:**
- `getHotkeyHelpToggleKeyLabels(keys = HOTKEYS.showHelp.keys): string[]` — splits the comma list, maps `'shift+/'` → `'?'`, everything else through `formatKeyCombo`; for `'shift+/, i'` returns `['?', 'I']` (verify what `formatKeyCombo('i')` returns — if it yields lowercase `'i'`, uppercase single letters the way the help table already renders them; match the table's convention). Keep or delete the old singular `getHotkeyHelpToggleKeyLabel` per remaining usages (grep; the footer is likely the only consumer — replace it).
- `shouldShowHotkeyInfoButton({ touchMode, embedMode }: { touchMode: boolean; embedMode: boolean }): boolean` — `!touchMode && !embedMode`.
- Class/label constants:
  ```ts
  export const HOTKEY_INFO_BUTTON_CLASS =
    'fixed top-4 left-4 w-8 h-8 rounded-full flex items-center justify-center bg-ds-tertiary/50 text-ds-muted hover-ds-hover cursor-pointer text-sm';
  export const HOTKEY_INFO_BUTTON_GLYPH = 'i';
  export const HOTKEY_INFO_BUTTON_TITLE = 'Keyboard shortcuts (I)';
  export const HOTKEY_INFO_BUTTON_ARIA_LABEL = 'Show keyboard shortcuts';
  export function getHotkeyInfoButtonStyle(zIndex = Z_INDEX.overlay): CSSProperties { return { zIndex }; }
  ```
  (Verify `Z_INDEX.overlay` exists and sits above the canvas, below `Z_INDEX.modalOverlay` — pick the repo's actual token for chrome-above-canvas if named differently. Verify every class in `HOTKEY_INFO_BUTTON_CLASS` exists in index.css; add missing ones as one-line rules.)
- Facade: `useHotkeyHelpStoreFacade(): { touchMode: boolean; embedMode: boolean }` — two `useUIStore` selectors, mirroring `useShareButtonStoreFacade`'s style.

- [ ] **Step 1: Failing tests** — labels (`['?', 'I']` for the new default; single-key fallback), predicate truth table (desktop true; touch false; embed false; both false), class-string pins (contains `rounded-full`, `bg-ds-tertiary/50`, `top-4 left-4`; no `hover:`/bracket utilities), facade test (renderHook against real `useUIStore`, flips with `setTouchMode`/`setEmbedMode`, afterEach full-reset idiom).
- [ ] **Step 2: RED**, **Step 3: implement**, **Step 4: GREEN** (`npx vitest run src/components/modals/ && npx tsc -b --force`).
- [ ] **Step 5: Commit** — `feat(viewer): hotkey-help info button view model and facade`

---

### Task 3: Trigger button + footer in the modal

**Files:**
- Modify: `src/components/modals/HotkeyHelpModal.tsx`
- Create: `src/components/modals/HotkeyHelpModal.test.tsx`

**Interfaces:**
- The component renders, as a sibling BEFORE `ModalDialogShell` (wrap both in a fragment):
  ```tsx
  {shouldShowHotkeyInfoButton(mode) && (
    <button
      onClick={() => setIsOpen((prev) => !prev)}
      className={HOTKEY_INFO_BUTTON_CLASS}
      style={getHotkeyInfoButtonStyle()}
      title={HOTKEY_INFO_BUTTON_TITLE}
      aria-label={HOTKEY_INFO_BUTTON_ARIA_LABEL}
      data-testid="hotkey-info-button"
    >
      {HOTKEY_INFO_BUTTON_GLYPH}
    </button>
  )}
  ```
  where `const mode = useHotkeyHelpStoreFacade();`.
- Footer renders one `<kbd>` per label from `getHotkeyHelpToggleKeyLabels()`, joined by the word `or` (keep `HOTKEY_HELP_FOOTER_PREFIX`/`SUFFIX` copy; only the key area becomes a list).
- Hotkey wiring is UNCHANGED (it already reads `HOTKEYS.showHelp.keys`, which now contains `i`).

- [ ] **Step 1: Failing tests** (`@testing-library/react` render; reset stores in afterEach; drive keys with `fireEvent.keyDown(document.body, ...)` or the library's userEvent — check how other component tests in the repo simulate hotkeys, if none do, use react-hotkeys-hook's documented test pattern):
  1. desktop (touchMode=false, embedMode=false): button renders; clicking it opens the panel (`Keyboard Shortcuts` heading visible); clicking again closes.
  2. `i` keydown toggles the panel open; `Escape` closes it.
  3. touchMode=true → no button; embedMode=true → no button (hotkey still functional — assert `i` opens even with the button hidden).
  4. footer shows both `?` and `I` kbd labels.
- [ ] **Step 2: RED**, **Step 3: implement**, **Step 4: GREEN** — modal suite + `npx vitest run src/components/modals/` + `npx tsc -b --force` + eslint.
- [ ] **Step 5: Commit** — `feat(viewer): top-left info button opens the shortcut panel`

---

### Task 4: Gates, Codex gate, release v0.9.6

- [ ] **Step 1:** FULL `npm run test:run` + `npm run lint` + `npm run build`.
- [ ] **Step 2:** Visual smoke on the production build (desktop viewport): the faint circle renders top-left over the viewer, click opens the panel listing `L` for image-load cycling and footer "? or I"; screenshot for the user.
- [ ] **Step 3:** Codex diff gate on the branch (per this machine's invocation quirks: three MCP-server disables, repo-file diff for large prompts). Fix any [P1]; re-review to PASS.
- [ ] **Step 4:** Merge ff to main, bump `package.json` to 0.9.6, full suite on merged main, tag `v0.9.6`, push with tags, watch both deploys, live-verify `/latest/`.
