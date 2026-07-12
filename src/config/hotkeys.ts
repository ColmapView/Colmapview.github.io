/**
 * Centralized hotkey registry and configuration.
 * All keyboard shortcuts are defined here for discoverability and consistency.
 */

export type HotkeyScope = 'global' | 'viewer' | 'modal';

export type HotkeyCategory = 'general' | 'modal' | 'camera' | 'navigation';

export interface HotkeyDefinition {
  /** Key combination (react-hotkeys-hook format) */
  keys: string;
  /** Human-readable description for help panel */
  description: string;
  /** Category for grouping in help panel */
  category: HotkeyCategory;
  /** Scopes where this hotkey is active */
  scopes: HotkeyScope[];
  /** Whether to prevent default browser behavior */
  preventDefault?: boolean;
}

export interface HotkeyRegistry {
  [id: string]: HotkeyDefinition;
}

/**
 * All hotkey definitions.
 * Keys use react-hotkeys-hook format: 'ctrl+s', 'shift+/', 'left', 'escape', etc.
 */
export const HOTKEYS: HotkeyRegistry = {
  // === GENERAL ===
  showHelp: {
    keys: 'shift+/, i',
    description: 'Show keyboard shortcuts',
    category: 'general',
    scopes: ['global'],
    preventDefault: true,
  },
  showJoke: {
    keys: 'shift+z',
    description: 'Show random COLMAP joke',
    category: 'general',
    scopes: ['viewer'],
    preventDefault: true,
  },
  showJokePersistent: {
    keys: 'ctrl+shift+z',
    description: 'Show random COLMAP joke (persistent)',
    category: 'general',
    scopes: ['viewer'],
    preventDefault: true,
  },
  resetGuide: {
    keys: 'shift+0',
    description: 'Reset guide tips',
    category: 'general',
    scopes: ['viewer'],
    preventDefault: true,
  },

  // === MODAL ===
  closeModal: {
    keys: 'escape',
    description: 'Close modal',
    category: 'modal',
    scopes: ['modal'],
  },
  prevImage: {
    keys: 'left',
    description: 'Previous image',
    category: 'modal',
    scopes: ['modal'],
  },
  nextImage: {
    keys: 'right',
    description: 'Next image',
    category: 'modal',
    scopes: ['modal'],
  },

  // === CAMERA ===
  // Note: WASD/QE/Space movement keys are handled manually in TrackballControls
  // for continuous tracking. Only discrete actions are listed here.
  resetView: {
    keys: 'r',
    description: 'Reset view',
    category: 'camera',
    scopes: ['viewer'],
  },
  viewX: {
    keys: '1',
    description: 'X-axis view',
    category: 'camera',
    scopes: ['viewer'],
  },
  viewY: {
    keys: '2',
    description: 'Y-axis view',
    category: 'camera',
    scopes: ['viewer'],
  },
  viewZ: {
    keys: '3',
    description: 'Z-axis view',
    category: 'camera',
    scopes: ['viewer'],
  },
  viewNegX: {
    keys: '4',
    description: '-X axis view',
    category: 'camera',
    scopes: ['viewer'],
  },
  viewNegY: {
    keys: '5',
    description: '-Y axis view',
    category: 'camera',
    scopes: ['viewer'],
  },
  viewNegZ: {
    keys: '6',
    description: '-Z axis view',
    category: 'camera',
    scopes: ['viewer'],
  },
  toggleGrid: {
    keys: 'g',
    description: 'Toggle grid',
    category: 'camera',
    scopes: ['viewer'],
  },
  toggleCameraMode: {
    keys: 'c',
    description: 'Toggle orbit/fly mode',
    category: 'camera',
    scopes: ['viewer'],
  },
  cycleHorizonLock: {
    keys: 'h',
    description: 'Cycle horizon lock',
    category: 'camera',
    scopes: ['viewer'],
  },
  cycleAutoRotate: {
    keys: 'o',
    description: 'Cycle auto orbit',
    category: 'camera',
    scopes: ['viewer'],
  },
  toggleBackground: {
    keys: 'b',
    description: 'Toggle background',
    category: 'camera',
    scopes: ['viewer'],
  },
  // cycleImageLoad was removed (codex release-gate P1): the imageLoadMode
  // feature is long gone (persistedStoreMigrations still deletes its state)
  // and no handler ever bound it, so the entry only advertised a no-op key.
  cyclePointSize: {
    keys: 'p',
    description: 'Cycle point cloud color mode',
    category: 'camera',
    scopes: ['viewer'],
  },
  cycleSplatFile: {
    keys: 'n',
    description: 'Switch to next splat file',
    category: 'camera',
    scopes: ['viewer'],
  },
  cycleCameraDisplay: {
    keys: 'f',
    description: 'Cycle frustum display',
    category: 'camera',
    scopes: ['viewer'],
  },
  cycleMatchesDisplay: {
    keys: 'm',
    description: 'Cycle matches display',
    category: 'camera',
    scopes: ['viewer'],
  },
  toggleGizmo: {
    keys: 't',
    description: 'Toggle transform gizmo',
    category: 'camera',
    scopes: ['viewer'],
  },
  toggleUndistortion: {
    keys: 'u',
    description: 'Toggle undistorted view (steps inside the panorama for 360 cameras)',
    category: 'camera',
    scopes: ['viewer'],
  },
  moveForward: {
    keys: 'w',
    description: 'Move forward',
    category: 'camera',
    scopes: ['viewer'],
  },
  moveBackward: {
    keys: 's',
    description: 'Move backward',
    category: 'camera',
    scopes: ['viewer'],
  },
  moveLeft: {
    keys: 'a',
    description: 'Strafe left',
    category: 'camera',
    scopes: ['viewer'],
  },
  moveRight: {
    keys: 'd',
    description: 'Strafe right',
    category: 'camera',
    scopes: ['viewer'],
  },
  moveUp: {
    keys: 'e, space',
    description: 'Move up',
    category: 'camera',
    scopes: ['viewer'],
  },
  moveDown: {
    keys: 'q',
    description: 'Move down',
    category: 'camera',
    scopes: ['viewer'],
  },
  speedBoost: {
    keys: 'shift',
    description: 'Speed boost (hold)',
    category: 'camera',
    scopes: ['viewer'],
  },
  adjustFrustumSize: {
    keys: 'alt+scroll',
    description: 'Adjust camera frustum size',
    category: 'camera',
    scopes: ['viewer'],
  },
  adjustPointSize: {
    keys: 'ctrl+scroll',
    description: 'Adjust point cloud size',
    category: 'camera',
    scopes: ['viewer'],
  },
  // Fly-to navigation (user request 2026-07-12). The actual binding lives in
  // the gallery keyboard listener (window-level keydown, mounted even while
  // the gallery panel is collapsed — see useImageGalleryKeyboardNavigation);
  // these entries document it so the help panel can advertise the shortcut.
  flyToPrevImage: {
    keys: 'shift+left',
    description: 'Fly to previous image',
    category: 'camera',
    scopes: ['viewer'],
  },
  flyToNextImage: {
    keys: 'shift+right',
    description: 'Fly to next image',
    category: 'camera',
    scopes: ['viewer'],
  },
} as const;

/**
 * Curated "Essentials" shortcuts surfaced first in the help panel.
 *
 * User feedback (2026-07-10): the flat shortcut list "spams the page"; keep the
 * important shortcuts up front. Order matches the user's request — u, b, a, o, p
 * followed by the modifier+scroll combos. These ids are the single source of
 * truth for the Essentials tab; a registry test pins that every id exists and
 * resolves to the expected key combo, so a rename/removal here fails at test
 * time instead of silently dropping a row.
 */
/**
 * The WASD fly cluster, rendered as one combined "Navigate" row in the
 * Essentials tab (user feedback: a lone "Strafe left - a" row reads wrong).
 * A registry test pins these ids and their w/a/s/d keys.
 */
export const ESSENTIAL_WASD_IDS = [
  'moveForward', //  w
  'moveLeft', //     a
  'moveBackward', // s
  'moveRight', //    d
] as const satisfies readonly (keyof typeof HOTKEYS)[];

/**
 * Synthetic row id + label for the combined WASD row. Used by the Essentials
 * tab and reused by the Camera Controls tab, which collapses its four
 * move/strafe rows into this same row (user request).
 */
export const ESSENTIAL_WASD_ROW_ID = 'navigateWasd';
export const ESSENTIAL_WASD_DESCRIPTION = 'Navigate';

/**
 * The image-modal prev/next pair, rendered as one combined arrows row in
 * Essentials. The Image Modal tab was merged into Essentials (user request),
 * so these rows live here now; the bindings themselves are unchanged.
 */
export const ESSENTIAL_IMAGE_NAV_IDS = [
  'prevImage', // left
  'nextImage', // right
] as const satisfies readonly (keyof typeof HOTKEYS)[];

/** Synthetic row id + label for the combined prev/next image row in Essentials. */
export const ESSENTIAL_IMAGE_NAV_ROW_ID = 'imageNavArrows';
export const ESSENTIAL_IMAGE_NAV_DESCRIPTION = 'Previous / next image';

/**
 * The shift+arrow fly-to pair, rendered as one combined row in Essentials
 * with a compact display combo ('shift ← →' — joining the two formatted
 * combos would read as 'Shift + ← Shift + →').
 */
export const ESSENTIAL_FLY_NAV_IDS = [
  'flyToPrevImage', // shift+left
  'flyToNextImage', // shift+right
] as const satisfies readonly (keyof typeof HOTKEYS)[];

export const ESSENTIAL_FLY_NAV_ROW_ID = 'flyToImageArrows';
export const ESSENTIAL_FLY_NAV_DESCRIPTION = 'Fly to previous / next image';
export const ESSENTIAL_FLY_NAV_COMBO = 'shift ← →';

/**
 * Mouse interactions surfaced in the Essentials tab (user request: click
 * semantics belong beside the key shortcuts). Display-only rows — the actual
 * pointer bindings live in the viewer's event handlers
 * (useCameraFrustumNavigationHandlers: click selects a frustum, right click
 * flies into that camera's view), not in this registry.
 */
export const ESSENTIAL_MOUSE_ROWS = [
  { id: 'mouseSelectCamera', description: 'Select camera', keyCombo: 'click' },
  { id: 'mouseGoToCamera', description: 'Go to camera view', keyCombo: 'right click' },
] as const;

type EssentialMouseRowId = (typeof ESSENTIAL_MOUSE_ROWS)[number]['id'];

export const ESSENTIAL_HOTKEY_IDS = [
  'toggleUndistortion', //       u  - Toggle undistorted view
  'toggleBackground', //         b  - Toggle background
  ESSENTIAL_WASD_ROW_ID, //      w a s d - Navigate (composite of ESSENTIAL_WASD_IDS)
  'cycleAutoRotate', //          o  - Cycle auto orbit
  'cyclePointSize', //           p  - Cycle point cloud color mode
  'resetView', //                r  - Reset view
  'toggleCameraMode', //         c  - Toggle orbit/fly mode
  'cycleHorizonLock', //         h  - Cycle horizon lock
  'toggleGrid', //               g  - Toggle grid
  'mouseSelectCamera', //        click - Select camera
  'mouseGoToCamera', //          right click - Go to camera view
  'adjustFrustumSize', //        alt+scroll  - Adjust camera frustum size
  'adjustPointSize', //          ctrl+scroll - Adjust point cloud size
  ESSENTIAL_IMAGE_NAV_ROW_ID, // left right - Previous / next image (composite)
  ESSENTIAL_FLY_NAV_ROW_ID, //   shift+left shift+right - Fly to previous / next image (composite)
  'closeModal', //               escape - Close modal
] as const satisfies readonly (
  | keyof typeof HOTKEYS
  | typeof ESSENTIAL_WASD_ROW_ID
  | typeof ESSENTIAL_IMAGE_NAV_ROW_ID
  | typeof ESSENTIAL_FLY_NAV_ROW_ID
  | EssentialMouseRowId
)[];

/**
 * Category labels for display in help panel.
 * Order determines display order.
 */
export const HOTKEY_CATEGORIES: Record<HotkeyCategory, string> = {
  general: 'General',
  modal: 'Image Modal',
  camera: 'Camera Controls',
  navigation: 'Navigation',
} as const;

/**
 * Get hotkeys filtered by scope.
 */
export function getHotkeysByScope(scope: HotkeyScope): HotkeyDefinition[] {
  return Object.values(HOTKEYS).filter((h) => h.scopes.includes(scope));
}

/**
 * Get hotkeys filtered by category.
 */
export function getHotkeysByCategory(category: HotkeyCategory): HotkeyDefinition[] {
  return Object.values(HOTKEYS).filter((h) => h.category === category);
}

/**
 * Format key combination for display.
 */
export function formatKeyCombo(keys: string): string {
  return keys
    .split(', ')[0] // Take first option if multiple
    .replace(/ctrl/gi, 'Ctrl')
    .replace(/cmd/gi, '⌘')
    .replace(/shift/gi, 'Shift')
    .replace(/alt/gi, 'Alt')
    .replace(/\+/g, ' + ')
    // Word-boundary (not whole-string) so arrows render inside modifier
    // combos too: 'shift+left' -> 'Shift + ←'.
    .replace(/\bleft\b/gi, '←')
    .replace(/\bright\b/gi, '→')
    .replace(/\bup\b/gi, '↑')
    .replace(/\bdown\b/gi, '↓')
    .replace(/^escape$/gi, 'Esc')
    .replace(/^enter$/gi, 'Enter')
    .replace(/^space$/gi, 'Space');
}
