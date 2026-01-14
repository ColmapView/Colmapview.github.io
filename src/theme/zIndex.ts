/**
 * Z-index scale for consistent stacking context.
 * Higher values appear on top of lower values.
 */

export const Z_INDEX = {
  controls: 10,       // Viewer controls panel
  dropdown: 100,      // Dropdown menus
  sticky: 200,        // Sticky headers
  overlay: 500,       // Drag overlay, loading states
  modal: 1000,        // Modal dialogs
  toast: 1500,        // Toast notifications
  tooltip: 2000,      // Tooltips (always on top)
} as const;
