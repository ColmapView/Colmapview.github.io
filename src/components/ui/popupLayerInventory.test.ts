import { describe, expect, it } from 'vitest';
import { POPUP_LAYER_INVENTORY } from './popupLayerInventory';

describe('popup layer inventory', () => {
  it('classifies every known popup surface by behavior instead of one generic modal type', () => {
    expect(POPUP_LAYER_INVENTORY.map((item) => item.id)).toEqual([
      'confirmation-host',
      'url-input-modal',
      'hotkey-help-modal',
      'auto-hide-modal',
      'deletion-modal',
      'floor-detection-modal',
      'camera-conversion-modal',
      'context-menu-editor',
      'image-detail-modal',
      'distance-input-modal',
      'floor-align-modal',
      'touch-gallery-drawer',
      'global-context-menu',
      'camera-frustum-context-menu',
      'transform-gizmo-context-menu',
      'origin-axes-context-menus',
      'profile-dropdowns',
      'profile-selector-dropdown',
      'drop-zone-hover-cards',
      'gallery-hover-card',
      'viewer-3d-hover-cards',
      'frustum-plane-hover-card',
      'notification-toast',
      'status-bar-tooltips',
      'mouse-tooltip',
    ]);

    expect(new Set(POPUP_LAYER_INVENTORY.map((item) => item.id)).size)
      .toBe(POPUP_LAYER_INVENTORY.length);
    expect(POPUP_LAYER_INVENTORY.find((item) => item.id === 'auto-hide-modal')).toMatchObject({
      kind: 'floating-tool-window',
      firstPassMigration: true,
    });
    expect(POPUP_LAYER_INVENTORY.find((item) => item.id === 'distance-input-modal')).toMatchObject({
      kind: 'inline-mini-popup',
      firstPassMigration: false,
    });
    expect(POPUP_LAYER_INVENTORY.find((item) => item.id === 'camera-conversion-modal')).toMatchObject({
      kind: 'mixed-dialog-tool',
      firstPassMigration: true,
    });
    expect(POPUP_LAYER_INVENTORY.find((item) => item.id === 'profile-selector-dropdown')).toMatchObject({
      kind: 'dropdown',
      layerSource: 'Z_INDEX.dropdown',
    });
    expect(POPUP_LAYER_INVENTORY.find((item) => item.id === 'viewer-3d-hover-cards')).toMatchObject({
      kind: 'hover-card',
      firstPassMigration: false,
    });
    expect(POPUP_LAYER_INVENTORY.find((item) => item.id === 'notification-toast')).toMatchObject({
      kind: 'toast',
      layerSource: 'notificationStyles.container (z-toast)',
    });
  });
});
