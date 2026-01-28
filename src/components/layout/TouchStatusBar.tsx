import { useUIStore } from '../../store';
import { useReconstructionStore } from '../../store';

/**
 * Simplified status bar for touch mode.
 * Shows only FPS - removes histograms, cache stats, and links.
 * Height: 24px (vs 40px desktop status bar)
 * Visibility controlled by touchUI.statusBar.
 */
export function TouchStatusBar() {
  const fps = useUIStore((s) => s.fps);
  const touchUI = useUIStore((s) => s.touchUI);
  const urlLoading = useReconstructionStore((s) => s.urlLoading);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);

  // Hide status bar if touchUI.statusBar is false
  if (!touchUI.statusBar) return null;

  return (
    <footer className="h-6 border-t border-ds bg-ds-tertiary text-ds-secondary text-xs px-3 flex items-center justify-between">
      <span className="text-ds-tertiary">{fps} FPS</span>
      {!reconstruction && (
        <span className="text-ds-muted">
          {urlLoading ? 'Loading...' : ''}
        </span>
      )}
    </footer>
  );
}
