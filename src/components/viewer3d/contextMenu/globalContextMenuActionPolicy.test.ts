import { describe, expect, it } from 'vitest';
import {
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
  shouldCloseContextMenuAfterAction,
} from './globalContextMenuActionPolicy';

describe('global context menu action policy', () => {
  it('keeps toggle actions open and closes one-shot actions', () => {
    expect(shouldCloseContextMenuAfterAction('toggleAxes')).toBe(false);
    expect(shouldCloseContextMenuAfterAction('flySpeedUp')).toBe(false);
    expect(shouldCloseContextMenuAfterAction('editMenu')).toBe(false);
    expect(shouldCloseContextMenuAfterAction('takeScreenshot')).toBe(true);
  });

  it('cycles scalar menu values with clamps', () => {
    expect(getNextCycleValue(['a', 'b', 'c'] as const, 'a')).toBe('b');
    expect(getNextCycleValue(['a', 'b', 'c'] as const, 'c')).toBe('a');

    expect(getNextBackgroundColor('#ffffff', { lightColor: '#fff', darkColor: '#111' })).toBe('#111');
    expect(getNextBackgroundColor('#222', { lightColor: '#fff', darkColor: '#111' })).toBe('#fff');

    expect(getNextPointSize(19, 'up')).toBe(20);
    expect(getNextPointSize(20, 'up')).toBe(20);
    expect(getNextPointSize(2, 'down')).toBe(1);
    expect(getNextPointSize(1, 'down')).toBe(1);
    expect(getNextMinTrackLength(2)).toBe(3);
    expect(getNextMinTrackLength(7)).toBe(2);

    expect(getNextFlySpeed(10, 'up')).toBe(15);
    expect(getNextFlySpeed(20, 'up')).toBe(20);
    expect(getNextFlySpeed(3, 'down')).toBe(2);
    expect(getNextFlySpeed(0.5, 'down')).toBe(0.5);
  });

  it('cycles point cloud color visibility state', () => {
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
      showPointCloud: false,
      colorMode: 'splats',
    });
  });

  it('cycles match, selection, image-plane, and picking states', () => {
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

    expect(getNextSelectionColorMenuState({ showSelectionHighlight: false, colorMode: 'rainbow' })).toEqual({
      showSelectionHighlight: true,
      colorMode: 'static',
    });
    expect(getNextSelectionColorMenuState({ showSelectionHighlight: true, colorMode: 'static' })).toEqual({
      showSelectionHighlight: true,
      colorMode: 'blink',
    });
    expect(getNextSelectionColorMenuState({ showSelectionHighlight: true, colorMode: 'rainbow' })).toEqual({
      showSelectionHighlight: false,
      colorMode: 'rainbow',
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

    expect(getNextPickingMode('off', 'origin-1pt')).toBe('origin-1pt');
    expect(getNextPickingMode('origin-1pt', 'origin-1pt')).toBe('off');
    expect(getNextPickingMode('origin-1pt', 'distance-2pt')).toBe('distance-2pt');
  });
});
