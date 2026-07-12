import { Fragment, useCallback, useId, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { HOTKEYS } from '../../config/hotkeys';
import { modalStyles } from '../../theme';
import { CloseIcon, InfoIcon } from '../../icons';
import { ModalDialogShell } from '../ui/ModalDialogShell';
import { useHotkeyHelpStoreFacade } from './useHotkeyHelpStoreFacade';
import {
  ESSENTIALS_TAB_ID,
  HOTKEY_HELP_FOOTER_CLASS,
  HOTKEY_HELP_FOOTER_KEY_CLASS,
  HOTKEY_HELP_FOOTER_PREFIX,
  HOTKEY_HELP_FOOTER_SUFFIX,
  HOTKEY_HELP_HEADER_CLASS,
  HOTKEY_HELP_PANEL_LAYOUT_CLASS,
  HOTKEY_HELP_ROW_CLASS,
  HOTKEY_HELP_ROW_DESCRIPTION_CLASS,
  HOTKEY_HELP_ROW_KEY_CLASS,
  HOTKEY_HELP_TAB_ACTIVE_CLASS,
  HOTKEY_HELP_TAB_CLASS,
  HOTKEY_HELP_TAB_LIST_CLASS,
  HOTKEY_HELP_TAB_PANEL_CLASS,
  HOTKEY_HELP_TITLE,
  HOTKEY_INFO_BUTTON_ARIA_LABEL,
  HOTKEY_INFO_BUTTON_ICON_CLASS,
  HOTKEY_INFO_BUTTON_TITLE,
  getHotkeyHelpOverlayStyle,
  getHotkeyHelpPanelStyle,
  getHotkeyHelpTabs,
  getHotkeyHelpToggleKeyLabels,
  getHotkeyInfoButtonClassName,
  getHotkeyInfoButtonStyle,
  shouldShowHotkeyInfoButton,
  type HotkeyHelpTabId,
} from './hotkeyHelpViewModel';
import { shouldHideChromeWithButtons } from '../layout/autoHideChromePolicy';

/**
 * Modal that displays all available keyboard shortcuts, split into tabs so the
 * long list no longer floods the page (revision 2026-07-10). The first tab,
 * Essentials, curates the most-used shortcuts and is re-selected every time the
 * panel opens. Toggle with Shift+? (question mark) or I; also opened by the
 * desktop top-left info button.
 */
export function HotkeyHelpModal() {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTabId, setActiveTabId] = useState<HotkeyHelpTabId>(ESSENTIALS_TAB_ID);
  const mode = useHotkeyHelpStoreFacade();
  const hideWithButtons = shouldHideChromeWithButtons({
    autoHideButtons: mode.autoHideButtons,
    isIdle: mode.isIdle,
    showAutoHideEditor: mode.showAutoHideEditor,
  });

  // Toggle the panel and keep the important shortcuts up front by re-selecting
  // Essentials. Done here in the event handler (not a useEffect) to satisfy
  // react-hooks/set-state-in-effect; resetting on the closing edge too is a
  // harmless no-op since the panel content is unmounted while closed.
  const togglePanel = useCallback(() => {
    setIsOpen((prev) => !prev);
    setActiveTabId(ESSENTIALS_TAB_ID);
  }, []);

  // Toggle help panel with ? or I (global scope, always available)
  useHotkeys(
    HOTKEYS.showHelp.keys,
    togglePanel,
    {
      scopes: HOTKEYS.showHelp.scopes,
      preventDefault: HOTKEYS.showHelp.preventDefault,
    },
    [togglePanel]
  );

  const tabs = getHotkeyHelpTabs();
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  return (
    <>
      {shouldShowHotkeyInfoButton(mode) && (
        <button
          onClick={togglePanel}
          // Fades with the auto-hide button chrome (user request 2026-07-12);
          // hidden also means click-through and out of the tab order.
          className={getHotkeyInfoButtonClassName(hideWithButtons)}
          style={getHotkeyInfoButtonStyle()}
          title={HOTKEY_INFO_BUTTON_TITLE}
          aria-label={HOTKEY_INFO_BUTTON_ARIA_LABEL}
          aria-hidden={hideWithButtons || undefined}
          tabIndex={hideWithButtons ? -1 : undefined}
          data-testid="hotkey-info-button"
        >
          <InfoIcon className={HOTKEY_INFO_BUTTON_ICON_CLASS} />
        </button>
      )}
      <ModalDialogShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        ariaLabelledBy={titleId}
        // Flex-center the panel and bake the tint into the overlay (mirrors
        // SplatPickerModal). The overlay captures pointer events, so clicking
        // outside the panel closes it; the panel class deliberately omits
        // modalStyles.panel's `absolute`, which would defeat flex centering.
        overlayClassName="fixed inset-0 flex items-center justify-center bg-ds-void/50"
        overlayStyle={getHotkeyHelpOverlayStyle()}
        // Popup surface mirroring SplatPickerModal exactly (bg-ds-tertiary
        // rounded-lg shadow-ds-lg, no border), kept as a flex column so the
        // header/tabs/footer stay put while the active tab's rows scroll.
        panelClassName={`bg-ds-tertiary rounded-lg shadow-ds-lg flex flex-col ${HOTKEY_HELP_PANEL_LAYOUT_CLASS}`}
        panelStyle={getHotkeyHelpPanelStyle()}
        initialFocusRef={closeButtonRef}
      >
        {/* Header: the app's tool-header bar with its standard title token. */}
        <div className={HOTKEY_HELP_HEADER_CLASS}>
          <h2 id={titleId} className={modalStyles.toolHeaderTitle}>{HOTKEY_HELP_TITLE}</h2>
          <button
            ref={closeButtonRef}
            onClick={() => setIsOpen(false)}
            className={modalStyles.toolHeaderClose}
            title="Close"
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className={HOTKEY_HELP_TAB_LIST_CLASS} role="tablist" aria-label={HOTKEY_HELP_TITLE}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`hotkey-help-tab-${tab.id}`}
              aria-selected={tab.id === activeTab.id}
              aria-controls="hotkey-help-tabpanel"
              className={tab.id === activeTab.id ? HOTKEY_HELP_TAB_ACTIVE_CLASS : HOTKEY_HELP_TAB_CLASS}
              onClick={() => setActiveTabId(tab.id)}
            >
              {tab.title}
            </button>
          ))}
        </div>

        {/* Active tab rows (scrolls independently so the shell stays fixed).
            Flat context-menu-style rows: a description that grows and a right-aligned
            mono key combo — no table, no boxed <kbd>, and not clickable. */}
        <div
          className={HOTKEY_HELP_TAB_PANEL_CLASS}
          role="tabpanel"
          id="hotkey-help-tabpanel"
          aria-labelledby={`hotkey-help-tab-${activeTab.id}`}
        >
          {activeTab.rows.map((row) => (
            <div key={row.id} className={HOTKEY_HELP_ROW_CLASS}>
              <span className={HOTKEY_HELP_ROW_DESCRIPTION_CLASS}>{row.description}</span>
              <span className={HOTKEY_HELP_ROW_KEY_CLASS}>{row.keyCombo}</span>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className={HOTKEY_HELP_FOOTER_CLASS}>
          {HOTKEY_HELP_FOOTER_PREFIX}{' '}
          {getHotkeyHelpToggleKeyLabels().map((label, index) => (
            <Fragment key={label}>
              {index > 0 && <>{' '}or{' '}</>}
              <kbd className={HOTKEY_HELP_FOOTER_KEY_CLASS}>{label}</kbd>
            </Fragment>
          ))}{' '}
          {HOTKEY_HELP_FOOTER_SUFFIX}
        </div>
      </ModalDialogShell>
    </>
  );
}
