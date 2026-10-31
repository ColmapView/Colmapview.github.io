import {
  TOUCH_STATUS_BAR_HELP_BUTTON_CLASS,
  TOUCH_STATUS_BAR_HELP_LABEL,
  TOUCH_STATUS_BAR_HELP_TITLE,
  getTouchEmptyStatusText,
  shouldShowTouchStatusBar,
} from './statusBarViewModel';
import { shouldHideChromeWithButtons } from './autoHideChromePolicy';
import { useTouchStatusBarStoreFacade } from './useTouchStatusBarStoreFacade';

/**
 * Simplified status bar for touch mode, shown only until a dataset loads: once
 * the scene is up it gives the canvas the full screen, and Settings carries the
 * About entry instead. Removes FPS, histograms, cache stats, and links.
 * Height: h-11 is a 44px BORDER box (`* { box-sizing: border-box }`), and the
 * 1px border-t comes out of it, so the stretched Help button gets the 43px
 * content box — comfortably above the 40px desktop status bar and within 1px of
 * the 44px guideline, which is close enough that no synthetic tap box is worth
 * the canvas it would steal (see TOUCH_STATUS_BAR_HELP_BUTTON_CLASS).
 * Visibility controlled by touchUI.statusBar.
 *
 * The entry opens HotkeyHelpModal on its About tab (links and policies): the
 * shortcut tabs need a keyboard.
 */
export function TouchStatusBar() {
  const {
    touchUI,
    autoHideButtons,
    isIdle,
    showAutoHideEditor,
    urlLoading,
    reconstruction,
    setShowHotkeyHelp,
  } = useTouchStatusBarStoreFacade();
  const emptyStatusText = getTouchEmptyStatusText({
    hasReconstruction: Boolean(reconstruction),
    urlLoading,
  });

  // Hide status bar if touchUI.statusBar is false
  if (!shouldShowTouchStatusBar(touchUI.statusBar)) return null;
  if (emptyStatusText === null) return null;
  if (shouldHideChromeWithButtons({ autoHideButtons, isIdle, showAutoHideEditor })) return null;

  return (
    <footer className="h-11 border-t border-ds bg-ds-tertiary text-ds-secondary text-xs px-3 flex items-center justify-between">
      <span className="text-ds-muted">
        {emptyStatusText}
      </span>
      {/* self-stretch is what gives the button the bar's 43px content box as
          its OWN box: the row is `items-center`, which would otherwise shrink
          the button to one line of text-xs (~16px) and leave the bar's height
          purely decorative. */}
      <button
        type="button"
        onClick={() => setShowHotkeyHelp(true, 'about')}
        className={`${TOUCH_STATUS_BAR_HELP_BUTTON_CLASS} self-stretch`}
        title={TOUCH_STATUS_BAR_HELP_TITLE}
        aria-label={TOUCH_STATUS_BAR_HELP_TITLE}
      >
        {TOUCH_STATUS_BAR_HELP_LABEL}
      </button>
    </footer>
  );
}
