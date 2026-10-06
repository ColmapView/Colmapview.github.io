import { Fragment, useId, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { HOTKEYS } from '../../config/hotkeys';
import { modalStyles, floatingPanelStyles, panelStyles } from '../../theme';
import { CloseIcon } from '../../icons';
import { ModalDialogShell } from '../ui/ModalDialogShell';
import { PolicyLinks } from '../PolicyLinks';
import { useHotkeyHelpStoreFacade } from './useHotkeyHelpStoreFacade';
import './hotkeyHelp.css';
import {
  ABOUT_COLMAP_CREDIT_PREFIX,
  ABOUT_COLMAP_LINK,
  ABOUT_LICENSE_LABEL,
  ABOUT_LINK_CLASS_NAME,
  ABOUT_LINK_REST_COLOR,
  ABOUT_PANEL_CLASS,
  ABOUT_MAINTAINER_LINE,
  ABOUT_PRODUCT_NAME,
  ABOUT_PRODUCT_LINE_CLASS,
  ABOUT_PROJECT_LINKS,
  ABOUT_TAB_ID,
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
  getAboutLinkHoverColor,
  getHotkeyHelpOverlayStyle,
  getHotkeyHelpPanelStyle,
  getHotkeyHelpTabs,
  getHotkeyHelpToggleKeyLabels,
  type AboutLink,
  type HotkeyHelpTabId,
} from './hotkeyHelpViewModel';

/** Project link with its per-link hover color, as the status bar rendered it. */
function AboutLinkAnchor({ link }: { link: AboutLink }) {
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className={ABOUT_LINK_CLASS_NAME}
      style={{ color: ABOUT_LINK_REST_COLOR }}
      title={link.title}
      onMouseEnter={(e) => { e.currentTarget.style.color = getAboutLinkHoverColor(link); }}
      onMouseLeave={(e) => { e.currentTarget.style.color = ABOUT_LINK_REST_COLOR; }}
    >
      {link.label}
    </a>
  );
}

/** About tab body: identity, project links, credits, and public policies. */
function HotkeyHelpAboutPanel() {
  return (
    <div className={`${ABOUT_PANEL_CLASS} hotkey-help-about`}>
      <div className="hotkey-help-about-heading">
        <div className="flex flex-col gap-1">
          <h3 className={`${ABOUT_PRODUCT_LINE_CLASS} hotkey-help-about-title`}>{ABOUT_PRODUCT_NAME}</h3>
          <span className="text-xs">{ABOUT_MAINTAINER_LINE}</span>
        </div>
        <span className="text-xs font-mono flex-shrink-0">v{__APP_VERSION__}</span>
      </div>
      <dl className="hotkey-help-about-details">
        <dt>Project</dt>
        <dd><AboutLinkAnchor link={ABOUT_PROJECT_LINKS[0]} /></dd>
        <dt>Issues</dt>
        <dd><AboutLinkAnchor link={ABOUT_PROJECT_LINKS[1]} /></dd>
        <dt>License</dt>
        <dd>{ABOUT_LICENSE_LABEL}</dd>
        <dt>{ABOUT_COLMAP_CREDIT_PREFIX}</dt>
        <dd><AboutLinkAnchor link={ABOUT_COLMAP_LINK} /></dd>
      </dl>
      <PolicyLinks includeAbout aboutLabel="Website" align="start" className="hotkey-help-about-policies" />
    </div>
  );
}

function HotkeyHelpFooter() {
  return (
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
  );
}

/**
 * Tab bar plus the active tab's body. Mounted only while the panel is open
 * (ModalDialogShell renders nothing when closed), so the selected tab resets to
 * the requested entry tab on every open. Shortcuts defaults to Essentials;
 * the status bar version opens About.
 */
function HotkeyHelpTabs() {
  const { hotkeyHelpInitialTab: initialTabId } = useHotkeyHelpStoreFacade();
  const [activeTabId, setActiveTabId] = useState<HotkeyHelpTabId>(initialTabId);
  const tabs = getHotkeyHelpTabs();
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  return (
    <>
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

      {/* Active tab body (scrolls independently so the shell stays fixed).
          Hotkey tabs use flat context-menu-style rows: a description that grows and
          a right-aligned mono key combo — no table, no boxed <kbd>, and not
          clickable. About has no rows and renders its own block. */}
      <div
        className={HOTKEY_HELP_TAB_PANEL_CLASS}
        role="tabpanel"
        id="hotkey-help-tabpanel"
        aria-labelledby={`hotkey-help-tab-${activeTab.id}`}
      >
        {activeTab.id === ABOUT_TAB_ID ? (
          <HotkeyHelpAboutPanel />
        ) : (
          activeTab.rows.map((row) => (
            <div key={row.id} className={HOTKEY_HELP_ROW_CLASS}>
              <span className={HOTKEY_HELP_ROW_DESCRIPTION_CLASS}>{row.description}</span>
              <span className={HOTKEY_HELP_ROW_KEY_CLASS}>{row.keyCombo}</span>
            </div>
          ))
        )}
      </div>
      <HotkeyHelpFooter />
    </>
  );
}

/**
 * Modal that displays all available keyboard shortcuts, split into tabs so the
 * long list no longer floods the page (revision 2026-07-10). The first tab,
 * Essentials, curates the most-used shortcuts and is re-selected every time the
 * panel opens. Toggle with Shift+? (question mark) or I; also opened by the
 * desktop status bar's ⌨ Shortcuts entry and, in touch mode where no keyboard
 * is available, the touch status bar's Help entry — the two pointer paths in.
 *
 * The component renders nothing at all while the panel is closed.
 */
export function HotkeyHelpModal() {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const {
    showHotkeyHelp: isOpen,
    setShowHotkeyHelp,
    toggleHotkeyHelp,
  } = useHotkeyHelpStoreFacade();

  // Toggle help panel with ? or I (global scope, always available)
  useHotkeys(
    HOTKEYS.showHelp.keys,
    toggleHotkeyHelp,
    {
      scopes: HOTKEYS.showHelp.scopes,
      preventDefault: HOTKEYS.showHelp.preventDefault,
    },
    [toggleHotkeyHelp]
  );

  return (
    <ModalDialogShell
      isOpen={isOpen}
      onClose={() => setShowHotkeyHelp(false)}
      ariaLabelledBy={titleId}
      // Flex-center the panel and bake the tint into the overlay (mirrors
      // SplatPickerModal). The overlay captures pointer events, so clicking
      // outside the panel closes it; the panel class deliberately omits
      // modalStyles.panel's `absolute`, which would defeat flex centering.
      overlayClassName={panelStyles.overlay}
      overlayStyle={getHotkeyHelpOverlayStyle()}
      // Shared Load Dataset surface, kept as a flex column so the
      // header/tabs/footer stay put while the active tab's rows scroll.
      panelClassName={`${floatingPanelStyles.dialog} ${HOTKEY_HELP_PANEL_LAYOUT_CLASS}`}
      panelStyle={getHotkeyHelpPanelStyle()}
      initialFocusRef={closeButtonRef}
    >
      {/* Header: the app's tool-header bar with its standard title token. */}
      <div className={HOTKEY_HELP_HEADER_CLASS}>
        <h2 id={titleId} className={modalStyles.toolHeaderTitle}>{HOTKEY_HELP_TITLE}</h2>
        <button
          ref={closeButtonRef}
          onClick={() => setShowHotkeyHelp(false)}
          className={modalStyles.toolHeaderClose}
          title="Close"
        >
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      <HotkeyHelpTabs />

    </ModalDialogShell>
  );
}
