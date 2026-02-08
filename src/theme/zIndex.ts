/**
 * Z-index scale for consistent stacking context.
 * Higher values appear on top of lower values.
 */

export const Z_INDEX = {
  controls: 10,       // Viewer controls panel
  dropdown: 100,      // Dropdown menus
  sticky: 200,        // Sticky headers
  overlay: 500,       // Drag overlay, loading states
  fab: 999,           // Touch FABs, selection toasts
  modal: 1000,        // Modal dialogs
  contextMenu: 1050,  // Context menus (above modals, below overlays)
  modalOverlay: 1100, // Tool modals above regular modals
  toast: 1500,        // Toast notifications
  tooltip: 2000,      // Tooltips, control panels (always on top)
  mouseTooltip: 9999, // Mouse-following tooltip (always topmost)
} as const;
