import { describe, expect, it } from 'vitest';
import type { AutoHideElement } from '../../store/stores/uiStore';
import {
  AUTO_HIDE_MODAL_BODY_MAX_HEIGHT,
  AUTO_HIDE_MODAL_DESCRIPTION,
  AUTO_HIDE_MODAL_DONE_LABEL,
  AUTO_HIDE_MODAL_ELEMENTS,
  AUTO_HIDE_MODAL_ESTIMATED_HEIGHT,
  AUTO_HIDE_MODAL_TITLE,
  AUTO_HIDE_MODAL_WIDTH,
  getAutoHideModalBodyStyle,
  getAutoHideModalHeaderDragStyle,
  getAutoHideModalOverlayStyle,
  getAutoHideModalPanelStyle,
  getAutoHideModalRows,
  getNextAutoHideElementValue,
} from './autoHideModalViewModel';

function buildAutoHideElements(
  enabled: AutoHideElement[] = []
): Record<AutoHideElement, boolean> {
  return {
    buttons: enabled.includes('buttons'),
    axes: enabled.includes('axes'),
    grid: enabled.includes('grid'),
    gizmo: enabled.includes('gizmo'),
    points: enabled.includes('points'),
    cameras: enabled.includes('cameras'),
    matches: enabled.includes('matches'),
    rigs: enabled.includes('rigs'),
  };
}

describe('auto-hide modal view model', () => {
  it('defines stable modal copy and dimensions', () => {
    expect(AUTO_HIDE_MODAL_TITLE).toBe('Auto-hide Elements');
    expect(AUTO_HIDE_MODAL_DESCRIPTION).toBe('Select which elements hide when idle.');
    expect(AUTO_HIDE_MODAL_DONE_LABEL).toBe('Done');
    expect(AUTO_HIDE_MODAL_WIDTH).toBe(240);
    expect(AUTO_HIDE_MODAL_ESTIMATED_HEIGHT).toBe(400);
    expect(AUTO_HIDE_MODAL_BODY_MAX_HEIGHT).toBe('calc(100vh - 120px)');
  });

  it('defines stable element order, labels, and icon ids', () => {
    expect(AUTO_HIDE_MODAL_ELEMENTS).toEqual([
      { key: 'buttons', label: 'Buttons', iconId: 'settings' },
      { key: 'axes', label: 'Axes', iconId: 'axes' },
      { key: 'grid', label: 'Grid', iconId: 'grid' },
      { key: 'gizmo', label: 'Gizmo', iconId: 'gizmo' },
      { key: 'points', label: 'Points', iconId: 'points' },
      { key: 'cameras', label: 'Cameras', iconId: 'cameras' },
      { key: 'matches', label: 'Matches', iconId: 'matches' },
      { key: 'rigs', label: 'Rigs', iconId: 'rigs' },
    ]);
  });

  it('combines element metadata with checked state', () => {
    const rows = getAutoHideModalRows(buildAutoHideElements(['buttons', 'grid', 'matches']));

    expect(rows.map((row) => ({ key: row.key, checked: row.checked }))).toEqual([
      { key: 'buttons', checked: true },
      { key: 'axes', checked: false },
      { key: 'grid', checked: true },
      { key: 'gizmo', checked: false },
      { key: 'points', checked: false },
      { key: 'cameras', checked: false },
      { key: 'matches', checked: true },
      { key: 'rigs', checked: false },
    ]);
  });

  it('computes the next toggle value from current state', () => {
    const autoHideElements = buildAutoHideElements(['axes']);

    expect(getNextAutoHideElementValue(autoHideElements, 'axes')).toBe(false);
    expect(getNextAutoHideElementValue(autoHideElements, 'rigs')).toBe(true);
  });

  it('derives modal render styles from stable dimensions and drag policy', () => {
    expect(getAutoHideModalOverlayStyle(53)).toEqual({ zIndex: 53 });
    expect(getAutoHideModalPanelStyle({ x: 16, y: 24 })).toEqual({
      left: 16,
      top: 24,
      width: AUTO_HIDE_MODAL_WIDTH,
    });
    expect(getAutoHideModalHeaderDragStyle()).toEqual({ touchAction: 'none' });
    expect(getAutoHideModalBodyStyle()).toEqual({
      maxHeight: AUTO_HIDE_MODAL_BODY_MAX_HEIGHT,
    });
  });
});
