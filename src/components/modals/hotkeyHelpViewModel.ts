import type { CSSProperties } from 'react';
import {
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

export const HOTKEY_HELP_TITLE = 'Keyboard Shortcuts';
export const HOTKEY_HELP_PANEL_LAYOUT_CLASS =
  'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-6 max-w-lg w-full max-h-[80vh] overflow-auto';
export const HOTKEY_HELP_HEADER_CLASS = 'flex items-center justify-between mb-4';
export const HOTKEY_HELP_SECTION_CLASS = 'mb-4';
export const HOTKEY_HELP_SECTION_TITLE_CLASS = 'text-ds-secondary text-sm font-medium mb-2';
export const HOTKEY_HELP_TABLE_CLASS = 'w-full text-sm';
export const HOTKEY_HELP_DESCRIPTION_CELL_CLASS = 'py-1.5 text-ds-primary';
export const HOTKEY_HELP_KEY_CELL_CLASS = 'py-1.5 text-right';
export const HOTKEY_HELP_KEY_CLASS =
  'px-2 py-0.5 bg-ds-secondary rounded text-ds-primary text-xs font-mono';
export const HOTKEY_HELP_FOOTER_CLASS =
  'mt-4 pt-4 border-t border-ds text-ds-muted text-xs text-center';
export const HOTKEY_HELP_FOOTER_KEY_CLASS = 'px-1.5 py-0.5 bg-ds-secondary rounded';
export const HOTKEY_HELP_FOOTER_PREFIX = 'Press';
export const HOTKEY_HELP_FOOTER_SUFFIX = 'to toggle this panel';

export function getHotkeyHelpOverlayStyle(zIndex = Z_INDEX.modalOverlay): CSSProperties {
  return { zIndex };
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

export function getHotkeyHelpToggleKeyLabel(keys = HOTKEYS.showHelp.keys): string {
  return getHotkeyHelpToggleKeyLabels(keys)[0];
}

export const HOTKEY_INFO_BUTTON_CLASS =
  'fixed top-4 left-4 w-8 h-8 rounded-full flex items-center justify-center bg-ds-tertiary/50 text-ds-muted hover-ds-hover cursor-pointer text-sm';
export const HOTKEY_INFO_BUTTON_GLYPH = 'i';
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
