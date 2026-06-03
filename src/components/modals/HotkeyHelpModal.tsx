import { useId, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { HOTKEYS } from '../../config/hotkeys';
import { tableStyles, modalStyles } from '../../theme';
import { CloseIcon } from '../../icons';
import { ModalDialogShell } from '../ui/ModalDialogShell';
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
  getHotkeyHelpOverlayStyle,
  getHotkeyHelpSections,
  getHotkeyHelpToggleKeyLabel,
} from './hotkeyHelpViewModel';

/**
 * Modal that displays all available keyboard shortcuts.
 * Toggle with Shift+? (question mark).
 */
export function HotkeyHelpModal() {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Toggle help panel with ? key (global scope, always available)
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
    <ModalDialogShell
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      ariaLabelledBy={titleId}
      overlayClassName="fixed inset-0 pointer-events-none"
      overlayStyle={getHotkeyHelpOverlayStyle()}
      panelClassName={`${modalStyles.panel} ${HOTKEY_HELP_PANEL_LAYOUT_CLASS}`}
      renderBackdrop
      backdropClassName={modalStyles.backdrop}
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
          <kbd className={HOTKEY_HELP_FOOTER_KEY_CLASS}>{getHotkeyHelpToggleKeyLabel()}</kbd>{' '}
          {HOTKEY_HELP_FOOTER_SUFFIX}
        </div>
    </ModalDialogShell>
  );
}
