/**
 * Spacing constants for consistent layout across the application.
 * Values are in pixels unless otherwise noted.
 */

export const SPACING = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  '3xl': 32,
} as const;

export const GAP = {
  gallery: SPACING.md,      // 8px - ImageGallery grid gap
  list: SPACING.md,         // 8px - List view gap
  controls: SPACING.md,     // 8px - ViewerControls gap
  matchView: SPACING.xl,    // 16px - ImageDetailModal match view
} as const;

export const PADDING = {
  gallery: SPACING.md,      // 8px - matches p-2 Tailwind class
  panel: SPACING.xl,        // 16px - Control panels
  controls: SPACING.lg,     // 12px - ViewerControls
} as const;
