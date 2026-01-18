/**
 * Timing constants for animations, debouncing, and camera settings.
 * Values are in milliseconds unless otherwise noted.
 */

export const TIMING = {
  // Debounce
  wheelDebounce: 100,       // ms - column zoom debounce
  resizeDebounce: 16,       // ms - modal resize (one frame)

  // Animation transitions
  transitionFast: 100,
  transitionBase: 150,
  transitionSlow: 250,
  transitionSmooth: 300,

  // Virtualization overscan (row/item counts, not ms)
  galleryOverscan: 3,
  listOverscan: 5,

  // Texture loading
  textureUploadTimeout: 150,   // Snappier idle processing (reduced from 500)
  textureUploadFallback: 16,   // Single frame fallback for non-idle browsers
  idleDeadlineBuffer: 5,       // Only process if >= 5ms remaining (avoid jank)

  // Toast
  errorToastDuration: 5000,

  // Animation delays (bouncing dots)
  bounceDelays: [0, 150, 300] as const,
} as const;

export const CAMERA = {
  fov: 60,
  nearPlane: 0.001,
  farPlane: 10000,
  initialDistanceMultiplier: 2.5,
  zoomTransitionFactor: 0.2,
  velocitySmoothingFactor: 0.5,
  frameTimeMs: 16,          // 60fps target
} as const;

export const CONTROLS = {
  // Rotation/pan/zoom speeds
  rotateSpeed: 0.003,
  panSpeed: 0.002,
  zoomSpeed: 0.0005,

  // Inertia and damping
  damping: 0.92,
  flyDamping: 0.85,
  minVelocity: 0.0001,

  // Movement multipliers
  moveSpeedMultiplier: 0.02,
  wheelMoveMultiplier: 0.001,
  shiftSpeedBoost: 3,

  // Distance constraints
  minDistance: 0.1,

  // Auto-rotate
  autoRotateSpeed: 0.5, // radians per second
} as const;
