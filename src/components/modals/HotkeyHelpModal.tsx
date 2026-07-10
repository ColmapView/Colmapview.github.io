import { Fragment, useId, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { HOTKEYS } from '../../config/hotkeys';
import { tableStyles, modalStyles } from '../../theme';
import { CloseIcon } from '../../icons';
import { ModalDialogShell } from '../ui/ModalDialogShell';
import { useHotkeyHelpStoreFacade } from './useHotkeyHelpStoreFacade';
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
  getHotkeyHelpPanelStyle,
  getHotkeyHelpSections,
  getHotkeyHelpToggleKeyLabels,
  getHotkeyInfoButtonStyle,
  shouldShowHotkeyInfoButton,
} from './hotkeyHelpViewModel';

/**
 * Modal that displays all available keyboard shortcuts.
 * Toggle with Shift+? (question mark) or I; also opened by the desktop
 * top-left info button.
 */
export function HotkeyHelpModal() {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const mode = useHotkeyHelpStoreFacade();

  // Toggle help panel with ? or I (global scope, always available)
  useHotkeys(
    HOTKEYS.showHelp.keys,
    () => setIsOpen((prev) => !prev),
    {
      scopes: HOTKEYS.showHelp.scopes,
      preventDefault: HOTKEYS.showHelp.preventDefault,
    },
    []
  );

  const sections = getHotkeyHelpSections();

  return (
    <>
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
      panelClassName={`bg-ds-tertiary rounded-lg shadow-ds-lg flex flex-col ${HOTKEY_HELP_PANEL_LAYOUT_CLASS}`}
      panelStyle={getHotkeyHelpPanelStyle()}
      initialFocusRef={closeButtonRef}
    >
        {/* Header */}
        <div className={HOTKEY_HELP_HEADER_CLASS}>
          <h2 id={titleId} className="text-ds-primary text-lg font-semibold">{HOTKEY_HELP_TITLE}</h2>
          <button
            ref={closeButtonRef}
            onClick={() => setIsOpen(false)}
            className={modalStyles.toolHeaderClose}
            title="Close"
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Categories */}
        {sections.map((section) => (
          <div key={section.category} className={HOTKEY_HELP_SECTION_CLASS}>
            <h3 className={HOTKEY_HELP_SECTION_TITLE_CLASS}>
              {section.title}
            </h3>
            <table className={HOTKEY_HELP_TABLE_CLASS}>
              <tbody>
                {section.rows.map((row) => (
                  <tr key={row.id} className={tableStyles.row}>
                    <td className={HOTKEY_HELP_DESCRIPTION_CELL_CLASS}>{row.description}</td>
                    <td className={HOTKEY_HELP_KEY_CELL_CLASS}>
                      <kbd className={HOTKEY_HELP_KEY_CLASS}>
                        {row.keyCombo}
                      </kbd>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

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
