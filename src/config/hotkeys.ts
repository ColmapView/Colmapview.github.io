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
    keys: 'shift+/',
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
  toggleBackground: {
    keys: 'b',
    description: 'Toggle background',
    category: 'camera',
    scopes: ['viewer'],
  },
  cycleImageLoad: {
    keys: 'i',
    description: 'Cycle image load mode',
    category: 'camera',
    scopes: ['viewer'],
  },
  cyclePointSize: {
    keys: 'p',
    description: 'Cycle point cloud color mode',
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
    description: 'Toggle image undistortion',
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
} as const;

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
    .replace(/^left$/gi, '←')
    .replace(/^right$/gi, '→')
    .replace(/^up$/gi, '↑')
    .replace(/^down$/gi, '↓')
    .replace(/^escape$/gi, 'Esc')
    .replace(/^enter$/gi, 'Enter')
    .replace(/^space$/gi, 'Space');
}
