/**
 * Z-index scale for consistent stacking context.
 * Higher values appear on top of lower values.
 */

export const Z_INDEX = {
  controls: 10,       // Viewer controls panel
  dropdown: 100,      // Dropdown menus
  sticky: 200,        // Sticky headers
  overlay: 500,       // Drag overlay, loading states
  touchDrawerBackdrop: 997, // Touch gallery drawer backdrop
  touchDrawer: 998,         // Touch gallery drawer panel
  fab: 999,           // Reserved floating-action layer (no current consumer)
  modal: 1000,        // Modal dialogs
  contextMenu: 2100,  // Context menus must sit above hover panels and native select popups.
  toast: 1100,        // Notifications stay above tool windows and below blocking dialogs.
  modalOverlay: 1200, // Blocking dialogs keep their headers and controls above notifications.
  tooltip: 2000,      // Tooltips, control panels (always on top)
  mouseTooltip: 9999, // Mouse-following tooltip (always topmost)
} as const;
