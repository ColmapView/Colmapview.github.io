import {
  formatStatusBarFps,
  getTouchEmptyStatusText,
  shouldShowTouchStatusBar,
} from './statusBarViewModel';
import { shouldHideChromeWithButtons } from './autoHideChromePolicy';
import { useTouchStatusBarStoreFacade } from './useTouchStatusBarStoreFacade';

/**
 * Simplified status bar for touch mode.
 * Shows only FPS - removes histograms, cache stats, and links.
 * Height: 24px (vs 40px desktop status bar)
 * Visibility controlled by touchUI.statusBar.
 */
export function TouchStatusBar() {
  const {
    fps,
    touchUI,
    autoHideButtons,
    isIdle,
    showAutoHideEditor,
    urlLoading,
    reconstruction,
  } = useTouchStatusBarStoreFacade();
  const emptyStatusText = getTouchEmptyStatusText({
    hasReconstruction: Boolean(reconstruction),
    urlLoading,
  });

  // Hide status bar if touchUI.statusBar is false
  if (!shouldShowTouchStatusBar(touchUI.statusBar)) return null;
  if (shouldHideChromeWithButtons({ autoHideButtons, isIdle, showAutoHideEditor })) return null;

  return (
    <footer className="h-6 border-t border-ds bg-ds-tertiary text-ds-secondary text-xs px-3 flex items-center justify-between">
      <span className="text-ds-tertiary">{formatStatusBarFps(fps)}</span>
      {emptyStatusText !== null && (
        <span className="text-ds-muted">
          {emptyStatusText}
        </span>
      )}
    </footer>
  );
}
