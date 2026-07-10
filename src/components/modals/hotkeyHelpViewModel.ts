import type { CSSProperties } from 'react';
import {
  ESSENTIAL_HOTKEY_IDS,
  ESSENTIAL_MOUSE_ROWS,
  ESSENTIAL_WASD_DESCRIPTION,
  ESSENTIAL_WASD_IDS,
  ESSENTIAL_WASD_ROW_ID,
  HOTKEYS,
  HOTKEY_CATEGORIES,
  formatKeyCombo,
  type HotkeyCategory,
  type HotkeyRegistry,
} from '../../config/hotkeys';
import { Z_INDEX } from '../../theme';

export interface HotkeyHelpRow {
  id: string;
  description: string;
  keyCombo: string;
}

export interface HotkeyHelpSection {
  category: HotkeyCategory;
  title: string;
  rows: HotkeyHelpRow[];
}

/** Id of the curated Essentials tab (always first). */
export const ESSENTIALS_TAB_ID = 'essentials' as const;
export const ESSENTIALS_TAB_TITLE = 'Essentials';

/** A tab in the help panel: the Essentials overlay plus one per non-empty category. */
export type HotkeyHelpTabId = typeof ESSENTIALS_TAB_ID | HotkeyCategory;

export interface HotkeyHelpTab {
  id: HotkeyHelpTabId;
  title: string;
  rows: HotkeyHelpRow[];
}

export const HOTKEY_HELP_TITLE = 'Keyboard Shortcuts';
// Padding, width bound, and internal scroll for the help panel. Centering is
// handled by the overlay's flexbox (see HotkeyHelpModal) and the viewport-height
// cap is applied inline via getHotkeyHelpPanelStyle, so this class intentionally
// carries no absolute-position or translate utilities.
// The panel is a fixed-height flex column: the header, tab bar, and footer stay
// put while the active tab's rows area (HOTKEY_HELP_TAB_PANEL_CLASS) owns the
// scroll. overflow-hidden clips the shell at the inline 80vh cap so the rounded
// corners are preserved and nothing overflows the viewport.
export const HOTKEY_HELP_PANEL_LAYOUT_CLASS = 'p-6 max-w-lg w-full overflow-hidden';
export const HOTKEY_HELP_HEADER_CLASS = 'flex items-center justify-between mb-4 flex-shrink-0';
export const HOTKEY_HELP_SECTION_CLASS = 'mb-4';
export const HOTKEY_HELP_SECTION_TITLE_CLASS = 'text-ds-secondary text-sm font-medium mb-2';
// Rows adopt the app's context-menu design language: a flat flex row (see
// ContextMenuList.tsx) instead of a table + boxed <kbd> badge. The row mirrors
// contextMenuStyles.button minus interactivity (no hover-ds-hover / cursor-pointer,
// since rows are not clickable), the description grows (flex-1), and the key combo
// is styled by HOTKEY_HELP_ROW_KEY_CLASS.
export const HOTKEY_HELP_ROW_CLASS = 'flex items-center gap-2 px-3 py-1.5 text-sm text-ds-primary';
export const HOTKEY_HELP_ROW_DESCRIPTION_CLASS = 'flex-1 text-left';
// Key-combo styling: the EXACT contextMenuStyles.hotkey token string
// (src/theme/componentStyles.ts:544) so the combo reads identically to the context
// menu's shortcut hints. Pinned as a literal here — following this file's
// literal-pin convention (cf. splatPickerViewModel) so the class-string unit test
// guards every utility exists in index.css (no Tailwind JIT here); a colocated test
// also asserts this equals contextMenuStyles.hotkey to keep them in lockstep.
export const HOTKEY_HELP_ROW_KEY_CLASS =
  'text-xs font-mono text-gray-500 ml-auto uppercase tracking-wide';
// hotkey-help-divider-top instead of `border-t border-ds`: those utilities set
// border-style on ALL sides while widths stay at the CSS-initial `medium` (3px),
// which painted a visible box around the footer (repo-wide utility footgun,
// ledgered). The dedicated rule draws only the intended 1px top hairline.
export const HOTKEY_HELP_FOOTER_CLASS =
  'mt-4 pt-4 hotkey-help-divider-top text-ds-muted text-xs text-center flex-shrink-0';

// Flat text tabs in the context-menu idiom. Pinned as literal strings here so the
// class-string unit test guards that every utility exists in index.css (no Tailwind
// JIT). Inactive is dimmed text (text-ds-secondary) that brightens on hover — no
// background box. Active gets brighter text (text-ds-primary) + a 2px accent
// underline, deliberately WITHOUT bg-ds-tertiary (it read as an extra box against
// the tertiary panel). Both carry the `hotkey-help-tab` marker class that the
// focus-suppression rule in index.css targets so a mouse click shows no focus ring
// while keyboard Tab still does (via the global :focus-visible rule).
// hotkey-help-divider-bottom / hotkey-help-tab-active instead of the border-b /
// border-b-2 utilities: same all-sides `border-style: solid` footgun as the
// footer note above (buttons are hit too — `button { border: none }` leaves
// widths at `medium`). The dedicated rules paint only the bottom edge.
export const HOTKEY_HELP_TAB_LIST_CLASS = 'flex hotkey-help-divider-bottom mb-4 flex-shrink-0';
export const HOTKEY_HELP_TAB_CLASS =
  'px-3 py-1.5 text-sm font-medium transition-colors bg-transparent text-ds-secondary hover-ds-text-primary cursor-pointer hotkey-help-tab';
export const HOTKEY_HELP_TAB_ACTIVE_CLASS =
  'px-3 py-1.5 text-sm font-medium transition-colors bg-transparent text-ds-primary hotkey-help-tab-active cursor-pointer hotkey-help-tab';
// Scrollable rows area for the active tab (flex child; min-h-0 lets it shrink
// below content height so overflow-auto actually scrolls inside the flex column).
export const HOTKEY_HELP_TAB_PANEL_CLASS = 'flex-1 min-h-0 overflow-auto';
// Footer key chips: same mono/uppercase idiom as the row combos (no boxed chip).
export const HOTKEY_HELP_FOOTER_KEY_CLASS = 'font-mono uppercase tracking-wide text-gray-500';
export const HOTKEY_HELP_FOOTER_PREFIX = 'Press';
export const HOTKEY_HELP_FOOTER_SUFFIX = 'to toggle this panel';

export function getHotkeyHelpOverlayStyle(zIndex = Z_INDEX.modalOverlay): CSSProperties {
  return { zIndex };
}

/**
 * Panel sizing for the help modal. maxHeight caps the panel so it scrolls
 * internally (overflow-auto) instead of overflowing the top and bottom of the
 * viewport; horizontal/vertical centering and the width bound come from the
 * overlay's flexbox and the max-w-lg/w-full layout class. Applied inline because
 * this project has no Tailwind, so arbitrary viewport-unit utilities (e.g.
 * max-h-[80vh]) are not generated in src/index.css.
 */
export function getHotkeyHelpPanelStyle(): CSSProperties {
  return { maxHeight: '80vh' };
}

export function getHotkeyHelpSections(
  hotkeys: HotkeyRegistry = HOTKEYS,
  categoryLabels: Record<HotkeyCategory, string> = HOTKEY_CATEGORIES
): HotkeyHelpSection[] {
  const hotkeyEntries = Object.entries(hotkeys);

  return (Object.entries(categoryLabels) as [HotkeyCategory, string][])
    .map(([category, title]) => ({
      category,
      title,
      rows: hotkeyEntries
        .filter(([, hotkey]) => hotkey.category === category)
        .map(([id, hotkey]) => ({
          id,
          description: hotkey.description,
          keyCombo: formatKeyCombo(hotkey.keys),
        })),
    }))
    .filter((section) => section.rows.length > 0);
}

/**
 * Curated rows for the Essentials tab, in ESSENTIAL_HOTKEY_IDS order. Ids that
 * are somehow missing from the registry are skipped defensively (a registry
 * test pins that they all exist, so this is belt-and-suspenders).
 */
/**
 * Trailing parenthetical detail is trimmed in the compact Essentials view
 * (user feedback); the full registry text stays in the category tabs.
 */
function stripTrailingParenthetical(description: string): string {
  return description.replace(/\s*\([^)]*\)\s*$/, '');
}

export function getHotkeyHelpEssentialRows(
  hotkeys: HotkeyRegistry = HOTKEYS,
  ids: readonly string[] = ESSENTIAL_HOTKEY_IDS
): HotkeyHelpRow[] {
  return ids
    .map((id) => {
      if (id === ESSENTIAL_WASD_ROW_ID) {
        // The WASD fly cluster reads as one row (user: "navigate wasd"); the
        // row's `uppercase` styling renders the combo as W A S D.
        const combo = ESSENTIAL_WASD_IDS
          .map((wasdId) => hotkeys[wasdId]?.keys)
          .filter((keys): keys is string => Boolean(keys))
          .map((keys) => formatKeyCombo(keys))
          .join(' ');
        return combo
          ? { id, description: ESSENTIAL_WASD_DESCRIPTION, keyCombo: combo }
          : null;
      }
      const mouseRow = ESSENTIAL_MOUSE_ROWS.find((row) => row.id === id);
      if (mouseRow) {
        // Display-only pointer rows (user request); combos like 'right click'
        // are already display strings, so no formatKeyCombo pass.
        return { id, description: mouseRow.description, keyCombo: mouseRow.keyCombo };
      }
      const hotkey = hotkeys[id];
      if (!hotkey) {
        return null;
      }
      return {
        id,
        description: stripTrailingParenthetical(hotkey.description),
        keyCombo: formatKeyCombo(hotkey.keys),
      };
    })
    .filter((row): row is HotkeyHelpRow => row !== null);
}

/**
 * Tabbed view model for the help panel. Essentials comes first (curated rows
 * kept up front per user feedback), followed by one tab per non-empty category
 * in HOTKEY_CATEGORIES order. The category tabs reuse getHotkeyHelpSections, so
 * they keep their FULL row set — Essentials is a curated overlay that may repeat
 * rows, not a move that removes them from their category tab.
 */
export function getHotkeyHelpTabs(
  hotkeys: HotkeyRegistry = HOTKEYS,
  categoryLabels: Record<HotkeyCategory, string> = HOTKEY_CATEGORIES,
  essentialIds: readonly string[] = ESSENTIAL_HOTKEY_IDS
): HotkeyHelpTab[] {
  const essentialsTab: HotkeyHelpTab = {
    id: ESSENTIALS_TAB_ID,
    title: ESSENTIALS_TAB_TITLE,
    rows: getHotkeyHelpEssentialRows(hotkeys, essentialIds),
  };

  const categoryTabs: HotkeyHelpTab[] = getHotkeyHelpSections(hotkeys, categoryLabels)
    // General is not worth a tab (user feedback 2026-07-10): it held the joke
    // easter eggs, the guide reset, and the help toggle — and the footer
    // already documents the toggle. The bindings themselves stay active.
    .filter((section) => section.category !== 'general')
    .map((section) => ({
      id: section.category,
      title: section.title,
      rows: section.rows,
    }));

  return [essentialsTab, ...categoryTabs];
}

/**
 * Labels for every combo that toggles the help panel (comma-separated in the
 * registry, e.g. 'shift+/, i'). '?' is shown for the shift+/ combo; single
 * letters are uppercased ('i' -> 'I') so the footer hint reads cleanly.
 */
export function getHotkeyHelpToggleKeyLabels(keys = HOTKEYS.showHelp.keys): string[] {
  return keys.split(',').map((rawCombo) => {
    const combo = rawCombo.trim();
    if (combo === 'shift+/') {
      return '?';
    }
    const label = formatKeyCombo(combo);
    return label.length === 1 ? label.toUpperCase() : label;
  });
}

// Transparent, icon-only trigger. The InfoIcon is itself a stroked circled-i,
// so the button needs no background blob or rounded pill; it just brightens the
// muted icon on hover via an existing utility (hover-ds-text-primary changes
// text color, which the SVG inherits through currentColor).
export const HOTKEY_INFO_BUTTON_CLASS =
  'fixed top-4 left-4 flex items-center justify-center text-ds-muted hover-ds-text-primary cursor-pointer transition-colors';
export const HOTKEY_INFO_BUTTON_ICON_CLASS = 'w-5 h-5';
export const HOTKEY_INFO_BUTTON_TITLE = 'Keyboard shortcuts (I)';
export const HOTKEY_INFO_BUTTON_ARIA_LABEL = 'Show keyboard shortcuts';

export function getHotkeyInfoButtonStyle(zIndex = Z_INDEX.overlay): CSSProperties {
  return { zIndex };
}

export function shouldShowHotkeyInfoButton({
  touchMode,
  embedMode,
}: {
  touchMode: boolean;
  embedMode: boolean;
}): boolean {
  return !touchMode && !embedMode;
}
