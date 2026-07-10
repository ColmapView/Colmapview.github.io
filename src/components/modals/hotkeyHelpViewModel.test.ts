import { describe, expect, it } from 'vitest';
import {
  ESSENTIALS_TAB_ID,
  ESSENTIALS_TAB_TITLE,
  HOTKEY_HELP_FOOTER_CLASS,
  HOTKEY_HELP_FOOTER_KEY_CLASS,
  HOTKEY_HELP_FOOTER_PREFIX,
  HOTKEY_HELP_FOOTER_SUFFIX,
  HOTKEY_HELP_HEADER_CLASS,
  HOTKEY_HELP_PANEL_LAYOUT_CLASS,
  HOTKEY_HELP_ROW_CLASS,
  HOTKEY_HELP_ROW_DESCRIPTION_CLASS,
  HOTKEY_HELP_ROW_KEY_CLASS,
  HOTKEY_HELP_SECTION_CLASS,
  HOTKEY_HELP_SECTION_TITLE_CLASS,
  HOTKEY_HELP_TAB_ACTIVE_CLASS,
  HOTKEY_HELP_TAB_CLASS,
  HOTKEY_HELP_TAB_LIST_CLASS,
  HOTKEY_HELP_TAB_PANEL_CLASS,
  HOTKEY_HELP_TITLE,
  HOTKEY_INFO_BUTTON_ARIA_LABEL,
  HOTKEY_INFO_BUTTON_CLASS,
  HOTKEY_INFO_BUTTON_ICON_CLASS,
  HOTKEY_INFO_BUTTON_TITLE,
  getHotkeyHelpOverlayStyle,
  getHotkeyHelpPanelStyle,
  getHotkeyHelpSections,
  getHotkeyHelpTabs,
  getHotkeyHelpToggleKeyLabels,
  getHotkeyInfoButtonStyle,
  shouldShowHotkeyInfoButton,
} from './hotkeyHelpViewModel';
import { ESSENTIAL_HOTKEY_IDS, HOTKEYS, type HotkeyRegistry } from '../../config/hotkeys';
import { Z_INDEX, contextMenuStyles } from '../../theme';

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

  it('defines stable render styles for the help panel', () => {
    expect(getHotkeyHelpOverlayStyle()).toEqual({ zIndex: Z_INDEX.modalOverlay });
    expect(getHotkeyHelpOverlayStyle(91)).toEqual({ zIndex: 91 });
    // Centering is done by the overlay's flexbox and the viewport-height cap is
    // applied inline via getHotkeyHelpPanelStyle (arbitrary viewport-unit
    // utilities like max-h-[80vh] are not generated here). The layout class must
    // therefore carry no absolute-position, translate, fraction, or
    // arbitrary-bracket utilities that would defeat flex centering / go silently
    // dead.
    // The panel no longer scrolls as one block: it caps at 80vh and clips
    // (overflow-hidden) while the active tab's rows area owns the scroll.
    expect(HOTKEY_HELP_PANEL_LAYOUT_CLASS).toBe('p-6 max-w-lg w-full overflow-hidden');
    expect(HOTKEY_HELP_PANEL_LAYOUT_CLASS).not.toMatch(/\/2/);
    expect(HOTKEY_HELP_PANEL_LAYOUT_CLASS).not.toContain('[');
    expect(HOTKEY_HELP_PANEL_LAYOUT_CLASS).not.toContain('translate');
    expect(getHotkeyHelpPanelStyle()).toEqual({ maxHeight: '80vh' });
    // Header, tab bar, and footer stay put (flex-shrink-0) so only the rows scroll.
    expect(HOTKEY_HELP_HEADER_CLASS).toBe('flex items-center justify-between mb-4 flex-shrink-0');
    expect(HOTKEY_HELP_SECTION_CLASS).toBe('mb-4');
    expect(HOTKEY_HELP_SECTION_TITLE_CLASS).toBe('text-ds-secondary text-sm font-medium mb-2');
    // Rows adopt the context-menu design language: a flat flex row (NOT a table
    // cell / boxed <kbd>) whose key combo mirrors contextMenuStyles.hotkey.
    expect(HOTKEY_HELP_ROW_CLASS).toBe('flex items-center gap-2 px-3 py-1.5 text-sm text-ds-primary');
    expect(HOTKEY_HELP_ROW_DESCRIPTION_CLASS).toBe('flex-1 text-left');
    expect(HOTKEY_HELP_ROW_KEY_CLASS).toBe(
      'text-xs font-mono text-gray-500 ml-auto uppercase tracking-wide'
    );
    // The row's key styling is exactly the context menu's hotkey token string.
    expect(HOTKEY_HELP_ROW_KEY_CLASS).toBe(contextMenuStyles.hotkey);
    // No boxed / table utilities linger on the row classes (context-menu flat look).
    for (const cls of [HOTKEY_HELP_ROW_CLASS, HOTKEY_HELP_ROW_DESCRIPTION_CLASS, HOTKEY_HELP_ROW_KEY_CLASS]) {
      expect(cls).not.toContain('[');
      expect(cls).not.toContain('hover:');
      expect(cls).not.toContain('bg-ds-secondary');
    }
    expect(HOTKEY_HELP_FOOTER_CLASS).toBe(
      'mt-4 pt-4 border-t border-ds text-ds-muted text-xs text-center flex-shrink-0'
    );
    // Footer key chips restyle to the same mono/uppercase hotkey idiom (no boxed chip).
    expect(HOTKEY_HELP_FOOTER_KEY_CLASS).toBe('font-mono uppercase tracking-wide text-gray-500');
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

  it('pins the info button class string to a transparent, icon-only button', () => {
    // Revision (2026-07-10): the InfoIcon draws its own circle, so the button is
    // transparent (no rounded pill, no background blob) and just brightens the
    // muted icon on hover via an existing utility (hover-ds-text-primary).
    expect(HOTKEY_INFO_BUTTON_CLASS).toBe(
      'fixed top-4 left-4 flex items-center justify-center text-ds-muted hover-ds-text-primary cursor-pointer transition-colors'
    );
    expect(HOTKEY_INFO_BUTTON_CLASS).toContain('top-4 left-4');
    expect(HOTKEY_INFO_BUTTON_CLASS).toContain('text-ds-muted');
    expect(HOTKEY_INFO_BUTTON_CLASS).toContain('hover-ds-text-primary');
    // No background blob / pill anymore.
    expect(HOTKEY_INFO_BUTTON_CLASS).not.toContain('rounded-full');
    expect(HOTKEY_INFO_BUTTON_CLASS).not.toContain('bg-');
    // No Tailwind-only escapes: JIT hover variants or arbitrary bracket utilities.
    expect(HOTKEY_INFO_BUTTON_CLASS).not.toContain('hover:');
    expect(HOTKEY_INFO_BUTTON_CLASS).not.toContain('[');
  });

  it('exposes stable icon size, title, and aria labels', () => {
    expect(HOTKEY_INFO_BUTTON_ICON_CLASS).toBe('w-5 h-5');
    expect(HOTKEY_INFO_BUTTON_TITLE).toBe('Keyboard shortcuts (I)');
    expect(HOTKEY_INFO_BUTTON_ARIA_LABEL).toBe('Show keyboard shortcuts');
  });

  it('sits above the canvas but below modal overlays via the overlay z-index', () => {
    expect(getHotkeyInfoButtonStyle()).toEqual({ zIndex: Z_INDEX.overlay });
    expect(getHotkeyInfoButtonStyle(123)).toEqual({ zIndex: 123 });
    expect(Z_INDEX.overlay).toBeLessThan(Z_INDEX.modalOverlay);
  });
});

describe('hotkey help tabs view model', () => {
  it('puts Essentials first, then one tab per non-empty category in registry order', () => {
    const tabs = getHotkeyHelpTabs();

    expect(tabs[0].id).toBe(ESSENTIALS_TAB_ID);
    expect(tabs[0].title).toBe(ESSENTIALS_TAB_TITLE);
    expect(ESSENTIALS_TAB_ID).toBe('essentials');
    expect(ESSENTIALS_TAB_TITLE).toBe('Essentials');
    // Essentials, then the categories that actually have rows, in HOTKEY_CATEGORIES order.
    expect(tabs.map((tab) => tab.id)).toEqual(['essentials', 'general', 'modal', 'camera']);
    // navigation has no rows in the registry, so it is not surfaced as a tab.
    expect(tabs.some((tab) => tab.id === 'navigation')).toBe(false);
  });

  it('fills the Essentials tab from ESSENTIAL_HOTKEY_IDS, in order', () => {
    const essentials = getHotkeyHelpTabs().find((tab) => tab.id === ESSENTIALS_TAB_ID);

    expect(essentials?.rows.map((row) => row.id)).toEqual([...ESSENTIAL_HOTKEY_IDS]);
    expect(essentials?.rows).toContainEqual({
      id: 'toggleUndistortion',
      description: HOTKEYS.toggleUndistortion.description,
      keyCombo: 'u',
    });
    // Modifier+scroll combos are formatted for display.
    expect(essentials?.rows).toContainEqual({
      id: 'adjustFrustumSize',
      description: 'Adjust camera frustum size',
      keyCombo: 'Alt + scroll',
    });
    expect(essentials?.rows).toContainEqual({
      id: 'adjustPointSize',
      description: 'Adjust point cloud size',
      keyCombo: 'Ctrl + scroll',
    });
  });

  it('keeps each category tab at its full row set (Essentials is a curated overlay, not a move)', () => {
    const tabs = getHotkeyHelpTabs();
    const cameraIds = tabs.find((tab) => tab.id === 'camera')?.rows.map((row) => row.id) ?? [];

    // Essential camera rows still appear in the Camera tab (curated view may repeat rows).
    expect(cameraIds).toContain('toggleUndistortion');
    // Non-essential camera rows remain present too.
    expect(cameraIds).toContain('moveForward');
  });

  it('reuses getHotkeyHelpSections rows for the category tabs', () => {
    const tabs = getHotkeyHelpTabs();
    const sections = getHotkeyHelpSections();
    const generalTab = tabs.find((tab) => tab.id === 'general');
    const generalSection = sections.find((section) => section.category === 'general');

    expect(generalTab?.title).toBe(generalSection?.title);
    expect(generalTab?.rows).toEqual(generalSection?.rows);
  });

  it('pins the tab bar/button class strings to real (non-Tailwind) utilities', () => {
    expect(HOTKEY_HELP_TAB_LIST_CLASS).toBe('flex border-b border-ds mb-4 flex-shrink-0');
    // Flat text tabs (context-menu idiom): inactive is dimmed text that brightens
    // on hover — no background box.
    expect(HOTKEY_HELP_TAB_CLASS).toBe(
      'px-3 py-1.5 text-sm font-medium transition-colors bg-transparent text-ds-secondary hover-ds-text-primary cursor-pointer hotkey-help-tab'
    );
    // Active tab: brighter text + a 2px accent underline, NO bg-ds-tertiary box.
    expect(HOTKEY_HELP_TAB_ACTIVE_CLASS).toBe(
      'px-3 py-1.5 text-sm font-medium transition-colors bg-transparent text-ds-primary border-b-2 border-ds-accent cursor-pointer hotkey-help-tab'
    );
    expect(HOTKEY_HELP_TAB_ACTIVE_CLASS).not.toContain('bg-ds-tertiary');
    expect(HOTKEY_HELP_TAB_ACTIVE_CLASS).toContain('border-b-2 border-ds-accent');
    // Both tab classes carry the marker class the focus-suppression rule targets.
    expect(HOTKEY_HELP_TAB_CLASS).toContain('hotkey-help-tab');
    expect(HOTKEY_HELP_TAB_ACTIVE_CLASS).toContain('hotkey-help-tab');
    expect(HOTKEY_HELP_TAB_PANEL_CLASS).toBe('flex-1 min-h-0 overflow-auto');
    for (const cls of [
      HOTKEY_HELP_TAB_LIST_CLASS,
      HOTKEY_HELP_TAB_CLASS,
      HOTKEY_HELP_TAB_ACTIVE_CLASS,
      HOTKEY_HELP_TAB_PANEL_CLASS,
    ]) {
      expect(cls).not.toContain('[');
      expect(cls).not.toContain('hover:');
    }
  });
});
