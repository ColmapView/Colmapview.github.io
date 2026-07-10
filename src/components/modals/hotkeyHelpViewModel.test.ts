import { describe, expect, it } from 'vitest';
import {
  HOTKEY_HELP_DESCRIPTION_CELL_CLASS,
  HOTKEY_HELP_FOOTER_CLASS,
  HOTKEY_HELP_FOOTER_KEY_CLASS,
  HOTKEY_HELP_FOOTER_PREFIX,
  HOTKEY_HELP_FOOTER_SUFFIX,
  HOTKEY_HELP_HEADER_CLASS,
  HOTKEY_HELP_KEY_CELL_CLASS,
  HOTKEY_HELP_KEY_CLASS,
  HOTKEY_HELP_PANEL_LAYOUT_CLASS,
  HOTKEY_HELP_SECTION_CLASS,
  HOTKEY_HELP_SECTION_TITLE_CLASS,
  HOTKEY_HELP_TABLE_CLASS,
  HOTKEY_HELP_TITLE,
  HOTKEY_INFO_BUTTON_ARIA_LABEL,
  HOTKEY_INFO_BUTTON_CLASS,
  HOTKEY_INFO_BUTTON_GLYPH,
  HOTKEY_INFO_BUTTON_TITLE,
  getHotkeyHelpOverlayStyle,
  getHotkeyHelpSections,
  getHotkeyHelpToggleKeyLabel,
  getHotkeyHelpToggleKeyLabels,
  getHotkeyInfoButtonStyle,
  shouldShowHotkeyInfoButton,
} from './hotkeyHelpViewModel';
import type { HotkeyRegistry } from '../../config/hotkeys';
import { Z_INDEX } from '../../theme';

describe('hotkey help view model', () => {
  it('builds ordered sections and omits empty categories', () => {
    const sections = getHotkeyHelpSections();

    expect(HOTKEY_HELP_TITLE).toBe('Keyboard Shortcuts');
    expect(sections.map((section) => section.category)).toEqual([
      'general',
      'modal',
      'camera',
    ]);
    expect(sections.some((section) => section.category === 'navigation')).toBe(false);
    expect(sections[0]).toMatchObject({
      category: 'general',
      title: 'General',
    });
  });

  it('formats section rows with stable ids and display key labels', () => {
    const sections = getHotkeyHelpSections();
    const generalRows = sections.find((section) => section.category === 'general')?.rows;
    const modalRows = sections.find((section) => section.category === 'modal')?.rows;
    const cameraRows = sections.find((section) => section.category === 'camera')?.rows;

    expect(generalRows).toContainEqual({
      id: 'showHelp',
      description: 'Show keyboard shortcuts',
      keyCombo: 'Shift + /',
    });
    expect(modalRows).toContainEqual({
      id: 'prevImage',
      description: 'Previous image',
      keyCombo: '←',
    });
    expect(cameraRows).toContainEqual({
      id: 'cycleSplatFile',
      description: 'Switch to next splat file',
      keyCombo: 'n',
    });
  });

  it('supports injected registries for focused tests and custom category labels', () => {
    const hotkeys: HotkeyRegistry = {
      alpha: {
        keys: 'ctrl+a',
        description: 'Alpha action',
        category: 'general',
        scopes: ['global'],
      },
      beta: {
        keys: 'right',
        description: 'Beta action',
        category: 'navigation',
        scopes: ['viewer'],
      },
    };

    expect(getHotkeyHelpSections(hotkeys, {
      general: 'Basics',
      modal: 'Modal',
      camera: 'Camera',
      navigation: 'Travel',
    })).toEqual([
      {
        category: 'general',
        title: 'Basics',
        rows: [
          {
            id: 'alpha',
            description: 'Alpha action',
            keyCombo: 'Ctrl + a',
          },
        ],
      },
      {
        category: 'navigation',
        title: 'Travel',
        rows: [
          {
            id: 'beta',
            description: 'Beta action',
            keyCombo: '→',
          },
        ],
      },
    ]);
  });

  it('uses the literal help toggle label while formatting fallback keys', () => {
    expect(getHotkeyHelpToggleKeyLabel()).toBe('?');
    expect(getHotkeyHelpToggleKeyLabel('escape')).toBe('Esc');
  });

  it('defines stable render styles for the help panel', () => {
    expect(getHotkeyHelpOverlayStyle()).toEqual({ zIndex: Z_INDEX.modalOverlay });
    expect(getHotkeyHelpOverlayStyle(91)).toEqual({ zIndex: 91 });
    expect(HOTKEY_HELP_PANEL_LAYOUT_CLASS).toBe(
      'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-6 max-w-lg w-full max-h-[80vh] overflow-auto'
    );
    expect(HOTKEY_HELP_HEADER_CLASS).toBe('flex items-center justify-between mb-4');
    expect(HOTKEY_HELP_SECTION_CLASS).toBe('mb-4');
    expect(HOTKEY_HELP_SECTION_TITLE_CLASS).toBe('text-ds-secondary text-sm font-medium mb-2');
    expect(HOTKEY_HELP_TABLE_CLASS).toBe('w-full text-sm');
    expect(HOTKEY_HELP_DESCRIPTION_CELL_CLASS).toBe('py-1.5 text-ds-primary');
    expect(HOTKEY_HELP_KEY_CELL_CLASS).toBe('py-1.5 text-right');
    expect(HOTKEY_HELP_KEY_CLASS).toBe(
      'px-2 py-0.5 bg-ds-secondary rounded text-ds-primary text-xs font-mono'
    );
    expect(HOTKEY_HELP_FOOTER_CLASS).toBe(
      'mt-4 pt-4 border-t border-ds text-ds-muted text-xs text-center'
    );
    expect(HOTKEY_HELP_FOOTER_KEY_CLASS).toBe('px-1.5 py-0.5 bg-ds-secondary rounded');
    expect(HOTKEY_HELP_FOOTER_PREFIX).toBe('Press');
    expect(HOTKEY_HELP_FOOTER_SUFFIX).toBe('to toggle this panel');
  });
});

describe('hotkey info button view model', () => {
  it('lists both toggle labels for the multi-key help binding', () => {
    expect(getHotkeyHelpToggleKeyLabels()).toEqual(['?', 'I']);
    expect(getHotkeyHelpToggleKeyLabels('shift+/, i')).toEqual(['?', 'I']);
  });

  it('uppercases single-letter labels but keeps the literal help toggle and word keys', () => {
    expect(getHotkeyHelpToggleKeyLabels('shift+/')).toEqual(['?']);
    expect(getHotkeyHelpToggleKeyLabels('escape')).toEqual(['Esc']);
    expect(getHotkeyHelpToggleKeyLabels('i')).toEqual(['I']);
  });

  it('shows the info button only on non-touch, non-embed (desktop) views', () => {
    expect(shouldShowHotkeyInfoButton({ touchMode: false, embedMode: false })).toBe(true);
    expect(shouldShowHotkeyInfoButton({ touchMode: true, embedMode: false })).toBe(false);
    expect(shouldShowHotkeyInfoButton({ touchMode: false, embedMode: true })).toBe(false);
    expect(shouldShowHotkeyInfoButton({ touchMode: true, embedMode: true })).toBe(false);
  });

  it('pins the info button class string to real (non-Tailwind) utilities', () => {
    expect(HOTKEY_INFO_BUTTON_CLASS).toBe(
      'fixed top-4 left-4 w-8 h-8 rounded-full flex items-center justify-center bg-ds-tertiary/50 text-ds-muted hover-ds-hover cursor-pointer text-sm'
    );
    expect(HOTKEY_INFO_BUTTON_CLASS).toContain('rounded-full');
    expect(HOTKEY_INFO_BUTTON_CLASS).toContain('bg-ds-tertiary/50');
    expect(HOTKEY_INFO_BUTTON_CLASS).toContain('top-4 left-4');
    // No Tailwind-only escapes: JIT hover variants or arbitrary bracket utilities.
    expect(HOTKEY_INFO_BUTTON_CLASS).not.toContain('hover:');
    expect(HOTKEY_INFO_BUTTON_CLASS).not.toContain('[');
  });

  it('exposes stable glyph, title, and aria labels', () => {
    expect(HOTKEY_INFO_BUTTON_GLYPH).toBe('i');
    expect(HOTKEY_INFO_BUTTON_TITLE).toBe('Keyboard shortcuts (I)');
    expect(HOTKEY_INFO_BUTTON_ARIA_LABEL).toBe('Show keyboard shortcuts');
  });

  it('sits above the canvas but below modal overlays via the overlay z-index', () => {
    expect(getHotkeyInfoButtonStyle()).toEqual({ zIndex: Z_INDEX.overlay });
    expect(getHotkeyInfoButtonStyle(123)).toEqual({ zIndex: 123 });
    expect(Z_INDEX.overlay).toBeLessThan(Z_INDEX.modalOverlay);
  });
});
