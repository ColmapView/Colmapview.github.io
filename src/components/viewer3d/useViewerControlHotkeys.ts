import { useCallback } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import type { ViewDirection } from '../../store/stores/uiStore';
import { HOTKEYS } from '../../theme';
import { useViewerControlHotkeyStoreFacade } from './useViewerControlHotkeyStoreFacade';

export const COLMAP_JOKES = [
  "Why did COLMAP break up with the blurry photo? No future together.",
  "COLMAP's dating profile: Looking for matches.",
  "My COLMAP crashed. Guess it couldn't handle my good looks.",
  "COLMAP walked into a bar. The bartender said, 'You look like you've seen some points.'",
  "Why is COLMAP bad at poker? It always shows its hand... and tracks it.",
  "COLMAP's favorite dance? The bundle adjustment shuffle.",
  "I told COLMAP a joke. It took 3 hours to get the point.",
  "COLMAP at therapy: 'I have too many issues... with my features.'",
  "Why did the point cloud go to school? To get more depth.",
  "COLMAP's life motto: When in doubt, RANSAC it out.",
];

export function getColmapJoke(randomValue = Math.random()): string {
  const index = Math.min(COLMAP_JOKES.length - 1, Math.floor(randomValue * COLMAP_JOKES.length));
  return COLMAP_JOKES[index];
}

export interface ViewerControlHotkeysArgs {
  handleResetView: () => void;
  setView: (direction: ViewDirection) => void;
  cycleAxesGrid: () => void;
  toggleCameraMode: () => void;
  toggleBackground: () => void;
  cycleColorMode: () => void;
  cycleCameraDisplayMode: () => void;
  cycleMatchesDisplayMode: () => void;
  cycleHorizonLock: () => void;
  toggleUndistortion: () => void;
}

export function useViewerControlHotkeys({
  handleResetView,
  setView,
  cycleAxesGrid,
  toggleCameraMode,
  toggleBackground,
  cycleColorMode,
  cycleCameraDisplayMode,
  cycleMatchesDisplayMode,
  cycleHorizonLock,
  toggleUndistortion,
}: ViewerControlHotkeysArgs): void {
  const {
    data: { pickingModeActive },
    actions: { addNotification, resetGuide, resetPicking },
  } = useViewerControlHotkeyStoreFacade();

  useHotkeys(
    HOTKEYS.resetView.keys,
    handleResetView,
    { scopes: HOTKEYS.resetView.scopes },
    [handleResetView]
  );

  useHotkeys(
    HOTKEYS.viewX.keys,
    () => setView('x'),
    { scopes: HOTKEYS.viewX.scopes },
    [setView]
  );
  useHotkeys(
    HOTKEYS.viewY.keys,
    () => setView('y'),
    { scopes: HOTKEYS.viewY.scopes },
    [setView]
  );
  useHotkeys(
    HOTKEYS.viewZ.keys,
    () => setView('z'),
    { scopes: HOTKEYS.viewZ.scopes },
    [setView]
  );
  useHotkeys(
    HOTKEYS.viewNegX.keys,
    () => setView('-x'),
    { scopes: HOTKEYS.viewNegX.scopes },
    [setView]
  );
  useHotkeys(
    HOTKEYS.viewNegY.keys,
    () => setView('-y'),
    { scopes: HOTKEYS.viewNegY.scopes },
    [setView]
  );
  useHotkeys(
    HOTKEYS.viewNegZ.keys,
    () => setView('-z'),
    { scopes: HOTKEYS.viewNegZ.scopes },
    [setView]
  );

  useHotkeys(
    HOTKEYS.toggleGrid.keys,
    cycleAxesGrid,
    { scopes: HOTKEYS.toggleGrid.scopes },
    [cycleAxesGrid]
  );

  useHotkeys(
    HOTKEYS.toggleCameraMode.keys,
    toggleCameraMode,
    { scopes: HOTKEYS.toggleCameraMode.scopes },
    [toggleCameraMode]
  );

  useHotkeys(
    HOTKEYS.cycleHorizonLock.keys,
    cycleHorizonLock,
    { scopes: HOTKEYS.cycleHorizonLock.scopes },
    [cycleHorizonLock]
  );

  useHotkeys(
    HOTKEYS.toggleBackground.keys,
    toggleBackground,
    { scopes: HOTKEYS.toggleBackground.scopes },
    [toggleBackground]
  );

  useHotkeys(
    HOTKEYS.cyclePointSize.keys,
    cycleColorMode,
    { scopes: HOTKEYS.cyclePointSize.scopes },
    [cycleColorMode]
  );

  useHotkeys(
    HOTKEYS.cycleCameraDisplay.keys,
    cycleCameraDisplayMode,
    { scopes: HOTKEYS.cycleCameraDisplay.scopes },
    [cycleCameraDisplayMode]
  );

  useHotkeys(
    HOTKEYS.cycleMatchesDisplay.keys,
    cycleMatchesDisplayMode,
    { scopes: HOTKEYS.cycleMatchesDisplay.scopes },
    [cycleMatchesDisplayMode]
  );

  useHotkeys(
    HOTKEYS.toggleUndistortion.keys,
    toggleUndistortion,
    { scopes: HOTKEYS.toggleUndistortion.scopes },
    [toggleUndistortion]
  );

  const showRandomJoke = useCallback(() => {
    addNotification('info', getColmapJoke(), 4000);
  }, [addNotification]);

  const showRandomJokePersistent = useCallback(() => {
    addNotification('warning', getColmapJoke());
  }, [addNotification]);

  useHotkeys(
    HOTKEYS.showJoke.keys,
    showRandomJoke,
    { scopes: HOTKEYS.showJoke.scopes, preventDefault: true },
    [showRandomJoke]
  );

  useHotkeys(
    HOTKEYS.showJokePersistent.keys,
    showRandomJokePersistent,
    { scopes: HOTKEYS.showJokePersistent.scopes, preventDefault: true },
    [showRandomJokePersistent]
  );

  const handleResetGuide = useCallback(() => {
    resetGuide();
    addNotification('info', 'Guide tips reset', 3000);
  }, [addNotification, resetGuide]);

  useHotkeys(
    HOTKEYS.resetGuide.keys,
    handleResetGuide,
    { scopes: HOTKEYS.resetGuide.scopes, preventDefault: true },
    [handleResetGuide]
  );

  useHotkeys(
    'escape',
    resetPicking,
    { enabled: pickingModeActive },
    [resetPicking, pickingModeActive]
  );
}
