import { describe, expect, it } from 'vitest';
import {
  ABOUT_COLMAP_CREDIT_PREFIX,
  ABOUT_COLMAP_LINK,
  ABOUT_LICENSE_LABEL,
  ABOUT_LINK_CLASS_NAME,
  ABOUT_LINK_REST_COLOR,
  ABOUT_PANEL_CLASS,
  ABOUT_PRODUCT_LINE,
  ABOUT_PRODUCT_LINE_CLASS,
  ABOUT_PROJECT_LINKS,
  ABOUT_ROW_CLASS,
  ABOUT_TAB_ID,
  ABOUT_TAB_TITLE,
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
  getHotkeyHelpOverlayStyle,
  getHotkeyHelpPanelStyle,
  getHotkeyHelpSections,
  getHotkeyHelpTabs,
  getHotkeyHelpToggleKeyLabels,
  getAboutLinkHoverColor,
} from './hotkeyHelpViewModel';
import {
  ESSENTIAL_FLY_NAV_ROW_ID,
  ESSENTIAL_HOTKEY_IDS,
  ESSENTIAL_IMAGE_NAV_ROW_ID,
  ESSENTIAL_WASD_ROW_ID,
  type HotkeyRegistry,
} from '../../config/hotkeys';
import { Z_INDEX, contextMenuStyles, modalStyles } from '../../theme';

describe('hotkey help view model', () => {
  it('builds ordered sections and omits empty categories', () => {
    const sections = getHotkeyHelpSections();

    expect(HOTKEY_HELP_TITLE).toBe('Help');
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
    // therefore carry no absolute-position, translate, or fraction utilities
    // that would defeat flex centering.
    // The panel no longer scrolls as one block: it caps at 80vh and clips
    // (overflow-hidden) while the active tab's rows area owns the scroll. No
    // outer p-6: the header is a full-bleed tool-header bar (SplatPicker
    // pattern) and each section carries its own padding.
    expect(HOTKEY_HELP_PANEL_LAYOUT_CLASS).toBe('max-w-lg w-full overflow-hidden');
    expect(HOTKEY_HELP_PANEL_LAYOUT_CLASS).not.toMatch(/\/2/);
    expect(HOTKEY_HELP_PANEL_LAYOUT_CLASS).not.toContain('translate');
    expect(getHotkeyHelpPanelStyle()).toEqual({ maxHeight: '80vh' });
    // Header matches the app's popup idiom (user feedback 2026-07-10/11: the
    // big floating title, the dark bg-ds-secondary bar, and then the hairline
    // under the header were each rejected): a purely flat px-4 py-2 title on
    // the panel surface — no background block, no divider — minus cursor-move
    // (not draggable).
    expect(HOTKEY_HELP_HEADER_CLASS).toBe(
      'flex items-center justify-between gap-2 px-4 py-2 select-none flex-shrink-0'
    );
    // Single source of truth: derived from the shared popup-header token, so a
    // redesign of modalStyles.popupHeader restyles this panel with the rest.
    expect(HOTKEY_HELP_HEADER_CLASS).toBe(`${modalStyles.popupHeader} flex-shrink-0`);
    // The draggable variant is the same token plus cursor-move.
    expect(modalStyles.toolHeader).toBe(`${modalStyles.popupHeader} cursor-move`);
    expect(HOTKEY_HELP_HEADER_CLASS).not.toContain('divider-b');
    expect(HOTKEY_HELP_HEADER_CLASS).not.toContain('bg-ds-secondary');
    expect(HOTKEY_HELP_SECTION_CLASS).toBe('mb-4');
    expect(HOTKEY_HELP_SECTION_TITLE_CLASS).toBe('text-ds-secondary text-sm font-medium mb-2');
    // Rows adopt the context-menu design language: a flat flex row (NOT a table
    // cell / boxed <kbd>) whose key combo mirrors contextMenuStyles.hotkey.
    // px-4 aligns with the header bar; py-1 keeps the list dense enough that
    // Essentials fits without scrolling at common viewport heights.
    expect(HOTKEY_HELP_ROW_CLASS).toBe('flex items-center gap-2 px-4 py-1 text-sm text-ds-primary');
    expect(HOTKEY_HELP_ROW_DESCRIPTION_CLASS).toBe('flex-1 text-left');
    expect(HOTKEY_HELP_ROW_KEY_CLASS).toBe(
      'text-xs font-mono text-ds-muted ml-auto uppercase tracking-wide'
    );
    // The row's key styling is exactly the context menu's hotkey token string.
    expect(HOTKEY_HELP_ROW_KEY_CLASS).toBe(contextMenuStyles.hotkey);
    // No boxed / table utilities linger on the row classes (context-menu flat look).
    for (const cls of [HOTKEY_HELP_ROW_CLASS, HOTKEY_HELP_ROW_DESCRIPTION_CLASS, HOTKEY_HELP_ROW_KEY_CLASS]) {
      expect(cls).not.toContain('bg-ds-secondary');
    }
    // hotkey-help-divider-top, not border-t/border-ds: those utilities blanket
    // border-style across all sides while unset sides keep the 3px `medium`
    // width, which painted a box around the footer.
    expect(HOTKEY_HELP_FOOTER_CLASS).toBe(
      'hotkey-help-divider-top px-4 py-2 text-ds-muted text-xs text-center flex-shrink-0'
    );
    // Footer key chips restyle to the same mono/uppercase hotkey idiom (no boxed chip).
    expect(HOTKEY_HELP_FOOTER_KEY_CLASS).toBe('font-mono uppercase tracking-wide text-ds-muted');
    expect(HOTKEY_HELP_FOOTER_PREFIX).toBe('Press');
    expect(HOTKEY_HELP_FOOTER_SUFFIX).toBe('to toggle this panel');
  });
});

describe('hotkey help toggle labels', () => {
  it('lists both toggle labels for the multi-key help binding', () => {
    expect(getHotkeyHelpToggleKeyLabels()).toEqual(['?', 'I']);
    expect(getHotkeyHelpToggleKeyLabels('shift+/, i')).toEqual(['?', 'I']);
  });

  it('uppercases single-letter labels but keeps the literal help toggle and word keys', () => {
    expect(getHotkeyHelpToggleKeyLabels('shift+/')).toEqual(['?']);
    expect(getHotkeyHelpToggleKeyLabels('escape')).toEqual(['Esc']);
    expect(getHotkeyHelpToggleKeyLabels('i')).toEqual(['I']);
  });

  it('exports no floating info-button view model anymore', async () => {
    // The top-left ⓘ button was dropped once the status bar gained its visible
    // ⌨ Shortcuts entry into this same panel (2026-08-13); its predicate,
    // classes, styles, and labels went with it.
    const viewModel = await import('./hotkeyHelpViewModel');
    for (const removed of [
      'shouldShowHotkeyInfoButton',
      'getHotkeyInfoButtonClassName',
      'getHotkeyInfoButtonStyle',
      'HOTKEY_INFO_BUTTON_CLASS',
      'HOTKEY_INFO_BUTTON_HIDDEN_CLASS',
      'HOTKEY_INFO_BUTTON_ICON_CLASS',
      'HOTKEY_INFO_BUTTON_TITLE',
      'HOTKEY_INFO_BUTTON_ARIA_LABEL',
    ]) {
      expect(viewModel).not.toHaveProperty(removed);
    }
  });
});

describe('hotkey help tabs view model', () => {
  it('puts Essentials first, then one tab per non-empty category, then About', () => {
    const tabs = getHotkeyHelpTabs();

    expect(tabs[0].id).toBe(ESSENTIALS_TAB_ID);
    expect(tabs[0].title).toBe(ESSENTIALS_TAB_TITLE);
    expect(ESSENTIALS_TAB_ID).toBe('essentials');
    expect(ESSENTIALS_TAB_TITLE).toBe('Essentials');
    // Essentials, then the categories that actually have rows, in HOTKEY_CATEGORIES order.
    // General is deliberately absent (user feedback 2026-07-10): it held easter
    // eggs and the help toggle, which the footer already documents. Image Modal
    // is absent too — its rows were merged into Essentials.
    expect(tabs.map((tab) => tab.id)).toEqual(['essentials', 'camera', 'about']);
    expect(tabs[tabs.length - 1]).toEqual({
      id: ABOUT_TAB_ID,
      title: ABOUT_TAB_TITLE,
      rows: [],
    });
    expect(ABOUT_TAB_ID).toBe('about');
    expect(ABOUT_TAB_TITLE).toBe('About');
    expect(tabs.some((tab) => tab.id === 'general')).toBe(false);
    expect(tabs.some((tab) => tab.id === 'modal')).toBe(false);
    // navigation has no rows in the registry, so it is not surfaced as a tab.
    expect(tabs.some((tab) => tab.id === 'navigation')).toBe(false);
  });

  it('fills the Essentials tab from ESSENTIAL_HOTKEY_IDS, in order', () => {
    const essentials = getHotkeyHelpTabs().find((tab) => tab.id === ESSENTIALS_TAB_ID);

    expect(essentials?.rows.map((row) => row.id)).toEqual([...ESSENTIAL_HOTKEY_IDS]);
    // Trailing parenthetical detail is trimmed in the compact Essentials view
    // (the full registry text stays in the Camera tab).
    expect(essentials?.rows).toContainEqual({
      id: 'toggleUndistortion',
      description: 'Toggle undistorted view',
      keyCombo: 'u',
    });
    // The WASD fly cluster reads as one combined row (user: "navigate wasd");
    // the row's `uppercase` styling renders the combo as W A S D.
    expect(essentials?.rows).toContainEqual({
      id: ESSENTIAL_WASD_ROW_ID,
      description: 'Navigate',
      keyCombo: 'w a s d',
    });
    expect(essentials?.rows.map((row) => row.description)).not.toContain('Strafe left');
    // The view-control family the user flagged as missing (2026-07-10:
    // "you still miss hotkeys like horizonlock") rides along with its registry text.
    expect(essentials?.rows).toContainEqual({
      id: 'cycleHorizonLock',
      description: 'Cycle horizon lock',
      keyCombo: 'h',
    });
    // Mouse interactions sit with the other pointer rows (user request): left
    // click selects a camera frustum, right click flies into its view.
    expect(essentials?.rows).toContainEqual({
      id: 'mouseSelectCamera',
      description: 'Select camera',
      keyCombo: 'click',
    });
    expect(essentials?.rows).toContainEqual({
      id: 'mouseGoToCamera',
      description: 'Go to camera view',
      keyCombo: 'right click',
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
    // The removed Image Modal tab's rows are merged in at the end: prev/next
    // collapse into one arrows row, and Esc keeps its registry description.
    expect(essentials?.rows).toContainEqual({
      id: ESSENTIAL_IMAGE_NAV_ROW_ID,
      description: 'Previous / next image',
      keyCombo: '← →',
    });
    // Fly-to companion (user request 2026-07-12): shift+arrows fly the camera
    // to the previous/next image; the row uses a compact display combo.
    expect(essentials?.rows).toContainEqual({
      id: ESSENTIAL_FLY_NAV_ROW_ID,
      description: 'Fly to previous / next image',
      keyCombo: 'shift ← →',
    });
    expect(essentials?.rows).toContainEqual({
      id: 'closeModal',
      description: 'Close modal',
      keyCombo: 'Esc',
    });
  });

  it('keeps the Camera tab full except for the WASD collapse (Essentials is an overlay, not a move)', () => {
    const tabs = getHotkeyHelpTabs();
    const cameraTab = tabs.find((tab) => tab.id === 'camera');
    const cameraIds = cameraTab?.rows.map((row) => row.id) ?? [];

    // Essential camera rows still appear in the Camera tab (curated view may repeat rows).
    expect(cameraIds).toContain('toggleUndistortion');
    // Non-essential camera rows remain present too.
    expect(cameraIds).toContain('moveUp');
    expect(cameraIds).toContain('speedBoost');
    // The fly-to registry entries render with arrow glyphs in the combo.
    expect(cameraTab?.rows).toContainEqual({
      id: 'flyToPrevImage',
      description: 'Fly to previous image',
      keyCombo: 'Shift + ←',
    });
  });

  it('collapses the WASD rows in the Camera tab into one Navigate row, in place', () => {
    const tabs = getHotkeyHelpTabs();
    const cameraTab = tabs.find((tab) => tab.id === 'camera');
    const cameraSection = getHotkeyHelpSections().find((section) => section.category === 'camera');
    const cameraIds = cameraTab?.rows.map((row) => row.id) ?? [];

    // Same treatment as Essentials (user request): one combined row instead of
    // four "Move forward / Strafe left / ..." rows.
    expect(cameraTab?.rows).toContainEqual({
      id: ESSENTIAL_WASD_ROW_ID,
      description: 'Navigate',
      keyCombo: 'w a s d',
    });
    for (const id of ['moveForward', 'moveBackward', 'moveLeft', 'moveRight']) {
      expect(cameraIds).not.toContain(id);
    }
    // The composite sits where the first WASD row was: after toggleUndistortion,
    // before moveUp (registry order), and replaces four rows with one.
    expect(cameraIds.indexOf(ESSENTIAL_WASD_ROW_ID)).toBe(
      cameraIds.indexOf('toggleUndistortion') + 1
    );
    expect(cameraIds.indexOf('moveUp')).toBe(cameraIds.indexOf(ESSENTIAL_WASD_ROW_ID) + 1);
    expect(cameraTab?.rows.length).toBe((cameraSection?.rows.length ?? 0) - 3);
  });

  it('pins the tab bar/button class strings to real (non-Tailwind) utilities', () => {
    // Single-side hairline rules (hotkey-help-divider-bottom / hotkey-help-tab-active)
    // instead of border-b/border-b-2 utilities: those blanket border-style across all
    // sides while unset sides keep the 3px `medium` width — on the tab button and the
    // tablist that painted the boxes the user flagged.
    // px-1 indents the px-3 tab buttons to the header bar's px-4 text inset;
    // no mb — the rows area carries its own vertical padding.
    expect(HOTKEY_HELP_TAB_LIST_CLASS).toBe('flex hotkey-help-divider-bottom flex-shrink-0 px-1');
    // Flat text tabs (context-menu idiom): inactive is dimmed text that brightens
    // on hover — no background box.
    expect(HOTKEY_HELP_TAB_CLASS).toBe(
      'px-3 py-1.5 text-sm font-medium transition-colors bg-transparent text-ds-secondary hover-ds-text-primary cursor-pointer hotkey-help-tab'
    );
    // Active tab: brighter text + a 2px accent underline, NO bg-ds-tertiary box.
    expect(HOTKEY_HELP_TAB_ACTIVE_CLASS).toBe(
      'px-3 py-1.5 text-sm font-medium transition-colors bg-transparent text-ds-primary cursor-pointer hotkey-help-tab-active hotkey-help-tab'
    );
    expect(HOTKEY_HELP_TAB_ACTIVE_CLASS).not.toContain('bg-ds-tertiary');
    expect(HOTKEY_HELP_TAB_ACTIVE_CLASS).not.toContain('border-b-2');
    // Both tab classes carry the marker class the focus-suppression rule targets.
    expect(HOTKEY_HELP_TAB_CLASS).toContain('hotkey-help-tab');
    expect(HOTKEY_HELP_TAB_ACTIVE_CLASS).toContain('hotkey-help-tab');
    expect(HOTKEY_HELP_TAB_PANEL_CLASS).toBe('flex-1 min-h-0 overflow-auto py-2');
  });
});

describe('about tab view model', () => {
  it('keeps the project links exactly as the status bar published them', () => {
    expect(ABOUT_PROJECT_LINKS).toEqual([
      {
        label: '★ Star on GitHub',
        href: 'https://github.com/ColmapView/colmapview.github.io',
        title: 'Star on GitHub',
        color: 'github',
      },
      {
        label: 'Report Bugs',
        href: 'https://github.com/ColmapView/colmapview.github.io/issues',
        title: 'Report Bugs',
        color: 'bugs',
      },
    ]);

    expect(ABOUT_COLMAP_LINK).toEqual({
      label: 'COLMAP',
      href: 'https://github.com/colmap/colmap',
      title: 'COLMAP - Structure-from-Motion and Multi-View Stereo',
      color: 'colmap',
    });
  });

  it('keeps the brand, license, and credit strings verbatim', () => {
    expect(ABOUT_PRODUCT_LINE).toBe('ColmapView by OpsiClear');
    expect(ABOUT_LICENSE_LABEL).toBe('AGPL 3.0');
    expect(ABOUT_COLMAP_CREDIT_PREFIX).toBe('Based on');
  });

  it('carries the per-link hover colors the status bar used', () => {
    expect(ABOUT_LINK_CLASS_NAME).toBe('no-underline transition-colors');
    expect(ABOUT_LINK_REST_COLOR).toBe('inherit');
    expect(getAboutLinkHoverColor(ABOUT_PROJECT_LINKS[0])).toBe('#facc15');
    expect(getAboutLinkHoverColor(ABOUT_PROJECT_LINKS[1])).toBe('#ef4444');
    expect(getAboutLinkHoverColor(ABOUT_COLMAP_LINK)).toBe('#60a5fa');
  });

  it('pins the About layout classes to real (non-Tailwind) utilities', () => {
    // text-ds-secondary keeps the links' rest color (inherit) identical to the
    // status bar; px-4 lines the block up with the hotkey rows' inset.
    expect(ABOUT_PANEL_CLASS).toBe('flex flex-col gap-2 px-4 py-1 text-sm text-ds-secondary');
    expect(ABOUT_PRODUCT_LINE_CLASS).toBe('text-ds-primary font-medium');
    expect(ABOUT_ROW_CLASS).toBe('flex items-center gap-4');
  });
});
