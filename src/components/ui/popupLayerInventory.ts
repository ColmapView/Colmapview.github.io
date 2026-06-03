export type PopupSurfaceKind =
  | 'blocking-dialog'
  | 'floating-tool-window'
  | 'mixed-dialog-tool'
  | 'media-detail-modal'
  | 'inline-mini-popup'
  | 'drawer'
  | 'context-menu'
  | 'dropdown'
  | 'hover-card'
  | 'toast'
  | 'tooltip';

export interface PopupSurfaceInventoryItem {
  id: string;
  kind: PopupSurfaceKind;
  ownerPath: string;
  layerSource: string;
  firstPassMigration: boolean;
}

export const POPUP_LAYER_INVENTORY: PopupSurfaceInventoryItem[] = [
  {
    id: 'confirmation-host',
    kind: 'blocking-dialog',
    ownerPath: 'src/components/ui/ConfirmationHost.tsx',
    layerSource: 'Z_INDEX.mouseTooltip + 1',
    firstPassMigration: false,
  },
  {
    id: 'url-input-modal',
    kind: 'blocking-dialog',
    ownerPath: 'src/components/modals/UrlInputModal.tsx',
    layerSource: 'getUrlInputModalOverlayStyle()',
    firstPassMigration: true,
  },
  {
    id: 'hotkey-help-modal',
    kind: 'blocking-dialog',
    ownerPath: 'src/components/modals/HotkeyHelpModal.tsx',
    layerSource: 'getHotkeyHelpOverlayStyle()',
    firstPassMigration: true,
  },
  {
    id: 'auto-hide-modal',
    kind: 'floating-tool-window',
    ownerPath: 'src/components/modals/AutoHideModal.tsx',
    layerSource: 'useModalZIndex(isOpen)',
    firstPassMigration: true,
  },
  {
    id: 'deletion-modal',
    kind: 'floating-tool-window',
    ownerPath: 'src/components/modals/DeletionModal.tsx',
    layerSource: 'useModalZIndex(isOpen)',
    firstPassMigration: true,
  },
  {
    id: 'floor-detection-modal',
    kind: 'floating-tool-window',
    ownerPath: 'src/components/modals/FloorDetectionModal.tsx',
    layerSource: 'useModalZIndex(isOpen)',
    firstPassMigration: true,
  },
  {
    id: 'camera-conversion-modal',
    kind: 'mixed-dialog-tool',
    ownerPath: 'src/components/modals/CameraConversionModal.tsx',
    layerSource: 'useModalZIndex(isOpen)',
    firstPassMigration: true,
  },
  {
    id: 'context-menu-editor',
    kind: 'floating-tool-window',
    ownerPath: 'src/components/viewer3d/contextMenu/ContextMenuEditor.tsx',
    layerSource: 'useModalZIndex(showEditPopup)',
    firstPassMigration: true,
  },
  {
    id: 'image-detail-modal',
    kind: 'media-detail-modal',
    ownerPath: 'src/components/modals/ImageDetailModal.tsx',
    layerSource: 'z-[1000]',
    firstPassMigration: false,
  },
  {
    id: 'distance-input-modal',
    kind: 'inline-mini-popup',
    ownerPath: 'src/components/modals/DistanceInputModal.tsx',
    layerSource: 'Z_INDEX.modalOverlay',
    firstPassMigration: false,
  },
  {
    id: 'floor-align-modal',
    kind: 'inline-mini-popup',
    ownerPath: 'src/components/modals/FloorAlignModal.tsx',
    layerSource: 'Z_INDEX.modalOverlay',
    firstPassMigration: false,
  },
  {
    id: 'touch-gallery-drawer',
    kind: 'drawer',
    ownerPath: 'src/components/layout/TouchGalleryDrawer.tsx',
    layerSource: 'z-[997]/z-[998]',
    firstPassMigration: false,
  },
  {
    id: 'global-context-menu',
    kind: 'context-menu',
    ownerPath: 'src/components/viewer3d/contextMenu/GlobalContextMenu.tsx',
    layerSource: 'Z_INDEX.contextMenu',
    firstPassMigration: false,
  },
  {
    id: 'camera-frustum-context-menu',
    kind: 'context-menu',
    ownerPath: 'src/components/viewer3d/contextMenu/FrustumContextMenu.tsx',
    layerSource: 'Drei Html overlay DOM order via getPointerEnabledHtmlStyle()',
    firstPassMigration: false,
  },
  {
    id: 'transform-gizmo-context-menu',
    kind: 'context-menu',
    ownerPath: 'src/components/viewer3d/TransformGizmoOverlays.tsx',
    layerSource: 'Drei Html overlay DOM order via getFixedContextMenuHtmlStyle()',
    firstPassMigration: false,
  },
  {
    id: 'origin-axes-context-menus',
    kind: 'context-menu',
    ownerPath: 'src/components/viewer3d/OriginAxesMenus.tsx',
    layerSource: 'Drei Html overlay DOM order via getFixedContextMenuHtmlStyle()',
    firstPassMigration: false,
  },
  {
    id: 'profile-dropdowns',
    kind: 'dropdown',
    ownerPath: 'src/components/dropzone/ProfileDropdown.tsx',
    layerSource: 'Z_INDEX.dropdown',
    firstPassMigration: false,
  },
  {
    id: 'profile-selector-dropdown',
    kind: 'dropdown',
    ownerPath: 'src/components/dropzone/ProfileSelector.tsx',
    layerSource: 'Z_INDEX.dropdown',
    firstPassMigration: false,
  },
  {
    id: 'drop-zone-hover-cards',
    kind: 'hover-card',
    ownerPath: 'src/components/dropzone/DropZoneHoverCards.tsx',
    layerSource: 'Z_INDEX.dropdown',
    firstPassMigration: false,
  },
  {
    id: 'gallery-hover-card',
    kind: 'hover-card',
    ownerPath: 'src/components/gallery/ImageGalleryItemHoverCard.tsx',
    layerSource: 'Z_INDEX.mouseTooltip',
    firstPassMigration: false,
  },
  {
    id: 'viewer-3d-hover-cards',
    kind: 'hover-card',
    ownerPath: 'src/components/viewer3d/HoverCard3D.tsx',
    layerSource: 'Drei Html overlay DOM order via getFixedCursorHtmlStyle()',
    firstPassMigration: false,
  },
  {
    id: 'frustum-plane-hover-card',
    kind: 'hover-card',
    ownerPath: 'src/components/viewer3d/FrustumPlaneHoverCard.tsx',
    layerSource: 'Drei Html overlay DOM order',
    firstPassMigration: false,
  },
  {
    id: 'notification-toast',
    kind: 'toast',
    ownerPath: 'src/components/ui/NotificationContainer.tsx',
    layerSource: 'notificationStyles.container (z-toast)',
    firstPassMigration: false,
  },
  {
    id: 'status-bar-tooltips',
    kind: 'tooltip',
    ownerPath: 'src/components/layout/CacheStatsIndicator.tsx; src/components/layout/StatHistogramTooltip.tsx',
    layerSource: 'Z_INDEX.tooltip via z-tooltip classes',
    firstPassMigration: false,
  },
  {
    id: 'mouse-tooltip',
    kind: 'tooltip',
    ownerPath: 'src/components/ui/MouseTooltip.tsx',
    layerSource: 'Z_INDEX.mouseTooltip',
    firstPassMigration: false,
  },
];
