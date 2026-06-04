import { describe, expect, it } from 'vitest';
import type { ContextMenuAction } from '../../../store';
import {
  CONTEXT_MENU_EDITOR_COLUMN_MIN_WIDTH,
  CONTEXT_MENU_EDITOR_CONTENT_MAX_HEIGHT,
  CONTEXT_MENU_LIST_MIN_WIDTH,
  getActionById,
  getAdjustedContextMenuPosition,
  getContextMenuEditorActionStyle,
  getContextMenuEditorContentStyle,
  getContextMenuEditorOverlayStyle,
  getContextMenuEditorPositionResetKey,
  getContextMenuEditorPopupStyle,
  getContextMenuEditorSectionGridStyle,
  getContextMenuListStyle,
  getContextMenuPositionResetKey,
  getInitialContextMenuEditorPosition,
  getNextBackgroundColor,
  getNextCycleValue,
  getNextFlySpeed,
  getNextImagePlanesMenuState,
  getNextMatchesMenuState,
  getNextMinTrackLength,
  getNextPickingMode,
  getNextPointColorMenuState,
  getNextPointSize,
  getNextSelectionColorMenuState,
  getCenteredPopupPosition,
  getConfigurableActions,
  groupConfigurableActions,
  groupContextMenuActions,
  shouldCloseContextMenuAfterAction,
  splitActionsIntoColumns,
  type ContextMenuActionDescriptor,
} from './globalContextMenuViewModel';

interface TestAction extends ContextMenuActionDescriptor {
  label: string;
}

const actions: TestAction[] = [
  { id: 'resetView', section: 'view', label: 'Reset View' },
  { id: 'toggleAxes', section: 'display', label: 'Toggle Axes' },
  { id: 'takeScreenshot', section: 'export', label: 'Screenshot' },
  { id: 'toggleGizmo', section: 'transform', label: 'Transform Gizmo' },
  { id: 'editMenu', section: 'menu', label: 'Edit Menu' },
];

describe('global context menu view-model helpers', () => {
  it('looks up actions and excludes editMenu from configurable actions', () => {
    expect(getActionById(actions, 'toggleAxes')?.label).toBe('Toggle Axes');
    expect(getActionById(actions, 'cyclePointColor')).toBeUndefined();
    expect(getConfigurableActions(actions).map(action => action.id)).toEqual([
      'resetView',
      'toggleAxes',
      'takeScreenshot',
      'toggleGizmo',
    ]);
  });

  it('groups visible actions by section and canonical action order', () => {
    const groups = groupContextMenuActions(actions, [
      'takeScreenshot',
      'toggleAxes',
      'resetView',
      'toggleGizmo',
      'cyclePointColor' as ContextMenuAction,
    ]);

    expect(groups).toEqual([
      { section: 'view', actions: [actions[0]] },
      { section: 'display', actions: [actions[1]] },
      { section: 'transform', actions: [actions[3]] },
      { section: 'export', actions: [actions[2]] },
    ]);
  });

  it('groups configurable actions with section labels', () => {
    expect(groupConfigurableActions(actions)).toEqual([
      { section: 'view', label: 'View & Navigation', actions: [actions[0]] },
      { section: 'display', label: 'Display & Points', actions: [actions[1]] },
      { section: 'transform', label: 'Transform', actions: [actions[3]] },
      { section: 'export', label: 'Export', actions: [actions[2]] },
    ]);
  });

  it('keeps toggle actions open and closes one-shot actions', () => {
    expect(shouldCloseContextMenuAfterAction('toggleAxes')).toBe(false);
    expect(shouldCloseContextMenuAfterAction('flySpeedUp')).toBe(false);
    expect(shouldCloseContextMenuAfterAction('editMenu')).toBe(false);
    expect(shouldCloseContextMenuAfterAction('takeScreenshot')).toBe(true);
  });

  it('cycles scalar action values and clamps menu increments', () => {
    expect(getNextCycleValue(['perspective', 'orthographic'] as const, 'perspective')).toBe('orthographic');
    expect(getNextCycleValue(['perspective', 'orthographic'] as const, 'orthographic')).toBe('perspective');
    expect(getNextCycleValue(['a', 'b'] as const, 'missing' as 'a')).toBe('a');

    expect(getNextBackgroundColor('#ffffff', { lightColor: '#fff', darkColor: '#111' })).toBe('#111');
    expect(getNextBackgroundColor('#222', { lightColor: '#fff', darkColor: '#111' })).toBe('#fff');

    expect(getNextPointSize(19, 'up')).toBe(20);
    expect(getNextPointSize(20, 'up')).toBe(20);
    expect(getNextPointSize(2, 'down')).toBe(1);
    expect(getNextPointSize(1, 'down')).toBe(1);
    expect(getNextMinTrackLength(2)).toBe(3);
    expect(getNextMinTrackLength(4)).toBe(2);

    expect(getNextFlySpeed(10, 'up')).toBe(15);
    expect(getNextFlySpeed(20, 'up')).toBe(20);
    expect(getNextFlySpeed(3, 'down')).toBe(2);
    expect(getNextFlySpeed(0.5, 'down')).toBe(0.5);
  });

  it('derives next visibility and display states for compound toggle actions', () => {
    expect(getNextPointColorMenuState({ showPointCloud: false, colorMode: 'trackLength' })).toEqual({
      showPointCloud: true,
      colorMode: 'rgb',
    });
    expect(getNextPointColorMenuState({ showPointCloud: true, colorMode: 'rgb' })).toEqual({
      showPointCloud: true,
      colorMode: 'error',
    });
    expect(getNextPointColorMenuState({ showPointCloud: true, colorMode: 'error' })).toEqual({
      showPointCloud: true,
      colorMode: 'trackLength',
    });
    expect(getNextPointColorMenuState({ showPointCloud: true, colorMode: 'trackLength' })).toEqual({
      showPointCloud: true,
      colorMode: 'splats',
    });
    expect(getNextPointColorMenuState({ showPointCloud: true, colorMode: 'splats' })).toEqual({
      showPointCloud: true,
      colorMode: 'splatPoints',
    });
    expect(getNextPointColorMenuState({ showPointCloud: true, colorMode: 'splatPoints' })).toEqual({
      showPointCloud: true,
      colorMode: 'splatRainbowPoints',
    });
    expect(getNextPointColorMenuState({ showPointCloud: true, colorMode: 'splatRainbowPoints' })).toEqual({
      showPointCloud: false,
      colorMode: 'splatRainbowPoints',
    });

    expect(getNextMatchesMenuState({ showMatches: false, displayMode: 'blink' })).toEqual({
      showMatches: true,
      displayMode: 'static',
    });
    expect(getNextMatchesMenuState({ showMatches: true, displayMode: 'static' })).toEqual({
      showMatches: true,
      displayMode: 'blink',
    });
    expect(getNextMatchesMenuState({ showMatches: true, displayMode: 'blink' })).toEqual({
      showMatches: false,
      displayMode: 'blink',
    });

    expect(getNextImagePlanesMenuState({ showCameras: false, displayMode: 'arrow' })).toEqual({
      showCameras: true,
      displayMode: 'frustum',
    });
    expect(getNextImagePlanesMenuState({ showCameras: true, displayMode: 'frustum' })).toEqual({
      showCameras: true,
      displayMode: 'imageplane',
    });
    expect(getNextImagePlanesMenuState({ showCameras: true, displayMode: 'imageplane' })).toEqual({
      showCameras: false,
      displayMode: 'imageplane',
    });
  });

  it('derives selection color and point-picking cycles', () => {
    expect(getNextSelectionColorMenuState({ showSelectionHighlight: false, colorMode: 'rainbow' })).toEqual({
      showSelectionHighlight: true,
      colorMode: 'static',
    });
    expect(getNextSelectionColorMenuState({ showSelectionHighlight: true, colorMode: 'static' })).toEqual({
      showSelectionHighlight: true,
      colorMode: 'blink',
    });
    expect(getNextSelectionColorMenuState({ showSelectionHighlight: true, colorMode: 'blink' })).toEqual({
      showSelectionHighlight: true,
      colorMode: 'rainbow',
    });
    expect(getNextSelectionColorMenuState({ showSelectionHighlight: true, colorMode: 'rainbow' })).toEqual({
      showSelectionHighlight: false,
      colorMode: 'rainbow',
    });

    expect(getNextPickingMode('off', 'origin-1pt')).toBe('origin-1pt');
    expect(getNextPickingMode('origin-1pt', 'origin-1pt')).toBe('off');
    expect(getNextPickingMode('origin-1pt', 'distance-2pt')).toBe('distance-2pt');
  });

  it('splits actions into column-first groups', () => {
    expect(splitActionsIntoColumns([1, 2, 3, 4, 5], 3)).toEqual([[1, 2], [3, 4], [5]]);
    expect(splitActionsIntoColumns([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
  });

  it('centers edit popups with a minimum margin', () => {
    expect(getCenteredPopupPosition({
      viewportWidth: 1000,
      viewportHeight: 800,
      popupWidth: 600,
      popupHeight: 500,
    })).toEqual({ x: 200, y: 150 });

    expect(getCenteredPopupPosition({
      viewportWidth: 320,
      viewportHeight: 240,
      popupWidth: 600,
      popupHeight: 500,
    })).toEqual({ x: 20, y: 20 });
  });

  it('derives initial editor positions from open state and estimated size', () => {
    expect(getInitialContextMenuEditorPosition({
      showEditPopup: false,
      viewportWidth: 1000,
      viewportHeight: 800,
    })).toEqual({ x: 0, y: 0 });

    expect(getInitialContextMenuEditorPosition({
      showEditPopup: true,
      viewportWidth: 1000,
      viewportHeight: 800,
    })).toEqual({ x: 200, y: 150 });

    expect(getInitialContextMenuEditorPosition({
      showEditPopup: true,
      viewportWidth: 1000,
      viewportHeight: 800,
      estimatedPopupWidth: 500,
      estimatedPopupHeight: 400,
    })).toEqual({ x: 250, y: 200 });
  });

  it('derives stable reset keys for editor and menu positions', () => {
    expect(getContextMenuEditorPositionResetKey(false)).toBe('editor:closed');
    expect(getContextMenuEditorPositionResetKey(true)).toBe('editor:open');

    expect(getContextMenuPositionResetKey({
      position: null,
      actionIds: ['resetView'],
      galleryCollapsed: false,
    })).toBe('menu:closed');

    expect(getContextMenuPositionResetKey({
      position: { x: 10, y: 20 },
      actionIds: ['resetView', 'toggleAxes'],
      galleryCollapsed: true,
    })).toBe('menu:10:20:collapsed:resetView,toggleAxes');
  });

  it('keeps context menus inside the available viewport area', () => {
    expect(getAdjustedContextMenuPosition({
      position: { x: 780, y: 580 },
      menuWidth: 200,
      menuHeight: 200,
      viewportWidth: 1000,
      viewportHeight: 700,
      galleryCollapsed: true,
    })).toEqual({ x: 780, y: 380 });

    expect(getAdjustedContextMenuPosition({
      position: { x: 720, y: 120 },
      menuWidth: 180,
      menuHeight: 200,
      viewportWidth: 1000,
      viewportHeight: 700,
      galleryCollapsed: false,
    })).toEqual({ x: 540, y: 120 });
  });

  it('builds the fixed context-menu list style for measuring and visible states', () => {
    expect(CONTEXT_MENU_LIST_MIN_WIDTH).toBe('160px');
    expect(getContextMenuListStyle({
      position: null,
      isPositionAdjusted: false,
      zIndex: 99,
    })).toEqual({
      position: 'fixed',
      left: 0,
      top: 0,
      zIndex: 99,
      minWidth: '160px',
      visibility: 'hidden',
    });

    expect(getContextMenuListStyle({
      position: { x: 42, y: 84 },
      isPositionAdjusted: true,
      zIndex: 99,
    })).toEqual({
      position: 'fixed',
      left: 42,
      top: 84,
      zIndex: 99,
      minWidth: '160px',
      visibility: 'visible',
    });
  });

  it('builds context-menu editor layout styles from named policy helpers', () => {
    expect(CONTEXT_MENU_EDITOR_COLUMN_MIN_WIDTH).toBe(180);
    expect(CONTEXT_MENU_EDITOR_CONTENT_MAX_HEIGHT).toBe('calc(100vh - 120px)');
    expect(getContextMenuEditorActionStyle()).toEqual({ breakInside: 'avoid' });
    expect(getContextMenuEditorSectionGridStyle(3)).toEqual({
      gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))',
    });
    expect(getContextMenuEditorSectionGridStyle(0)).toEqual({
      gridTemplateColumns: 'repeat(1, minmax(180px, 1fr))',
    });
    expect(getContextMenuEditorOverlayStyle(123)).toEqual({ zIndex: 123 });
    expect(getContextMenuEditorPopupStyle({ x: 30, y: 40 })).toEqual({ left: 30, top: 40 });
    expect(getContextMenuEditorContentStyle()).toEqual({ maxHeight: 'calc(100vh - 120px)' });
  });
});
