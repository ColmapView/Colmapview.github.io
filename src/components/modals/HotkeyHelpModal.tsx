import { useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  HOTKEYS,
  HOTKEY_CATEGORIES,
  getHotkeysByCategory,
  formatKeyCombo,
  type HotkeyCategory,
} from '../../config/hotkeys';
import { tableStyles, modalStyles, Z_INDEX } from '../../theme';

/**
 * Modal that displays all available keyboard shortcuts.
 * Toggle with Shift+? (question mark).
 */
export function HotkeyHelpModal() {
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

  // Close with Escape when help is open
  useHotkeys(
    'escape',
    () => setIsOpen(false),
    { enabled: isOpen },
    [isOpen]
  );

  if (!isOpen) return null;

  const categories = Object.keys(HOTKEY_CATEGORIES) as HotkeyCategory[];

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: Z_INDEX.modalOverlay }}>
      {/* Backdrop */}
      <div
        className={modalStyles.backdrop}
        onClick={() => setIsOpen(false)}
      />

      {/* Panel */}
      <div className={`${modalStyles.panel} top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-6 max-w-lg w-full max-h-[80vh] overflow-auto`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-ds-primary text-lg font-semibold">Keyboard Shortcuts</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="w-6 h-6 flex items-center justify-center rounded text-ds-muted hover:text-ds-primary hover:bg-ds-tertiary transition-colors"
            title="Close"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Categories */}
        {categories.map((category) => {
          const hotkeys = getHotkeysByCategory(category);
          if (hotkeys.length === 0) return null;

          return (
            <div key={category} className="mb-4">
              <h3 className="text-ds-secondary text-sm font-medium mb-2">
                {HOTKEY_CATEGORIES[category]}
              </h3>
              <table className="w-full text-sm">
                <tbody>
                  {hotkeys.map((hotkey, idx) => (
                    <tr key={idx} className={tableStyles.row}>
                      <td className="py-1.5 text-ds-primary">{hotkey.description}</td>
                      <td className="py-1.5 text-right">
                        <kbd className="px-2 py-0.5 bg-ds-secondary rounded text-ds-primary text-xs font-mono">
                          {formatKeyCombo(hotkey.keys)}
                        </kbd>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        {/* Footer hint */}
        <div className="mt-4 pt-4 border-t border-ds text-ds-muted text-xs text-center">
          Press{' '}
          <kbd className="px-1.5 py-0.5 bg-ds-secondary rounded">?</kbd>{' '}
          to toggle this panel
        </div>
      </div>
    </div>
  );
}
