import { describe, expect, it } from 'vitest';
import { MARKER_COLORS_CSS } from '../../theme';
import {
  getPickingCursorColor,
  getPickingCursorContainerStyle,
  getPickingCursorLabel,
  getPickingCursorMarkerStyle,
  getPickingCursorPositionStyle,
  getPickingCursorViewModel,
  PICKING_CURSOR_CONTAINER_CLASS,
  PICKING_CURSOR_OFFSET_PX,
  POINT_LABELS,
  shouldShowPickingCursor,
} from './pickingCursorViewModel';

describe('picking cursor view model', () => {
  it('shows the cursor only while a picking mode needs more points', () => {
    expect(shouldShowPickingCursor('off', 0)).toBe(false);
    expect(shouldShowPickingCursor('origin-1pt', 0)).toBe(true);
    expect(shouldShowPickingCursor('origin-1pt', 1)).toBe(false);
    expect(shouldShowPickingCursor('distance-2pt', 1)).toBe(true);
    expect(shouldShowPickingCursor('distance-2pt', 2)).toBe(false);
    expect(shouldShowPickingCursor('normal-3pt', 2)).toBe(true);
    expect(shouldShowPickingCursor('normal-3pt', 3)).toBe(false);
  });

  it('derives the next point label with a fallback', () => {
    expect(POINT_LABELS).toEqual(['P1', 'P2', 'P3']);
    expect(getPickingCursorLabel(0)).toBe('P1');
    expect(getPickingCursorLabel(1)).toBe('P2');
    expect(getPickingCursorLabel(2)).toBe('P3');
    expect(getPickingCursorLabel(99)).toBe('P1');
  });

  it('derives the next point color with a fallback', () => {
    expect(getPickingCursorColor(0)).toBe(MARKER_COLORS_CSS[0]);
    expect(getPickingCursorColor(1)).toBe(MARKER_COLORS_CSS[1]);
    expect(getPickingCursorColor(2)).toBe(MARKER_COLORS_CSS[2]);
    expect(getPickingCursorColor(99)).toBe(MARKER_COLORS_CSS[0]);
  });

  it('builds the cursor view model from picking state', () => {
    expect(getPickingCursorViewModel('normal-3pt', 2)).toEqual({
      isVisible: true,
      nextPointIndex: 2,
      nextLabel: 'P3',
      nextColor: MARKER_COLORS_CSS[2],
    });
    expect(getPickingCursorViewModel('normal-3pt', 3)).toMatchObject({
      isVisible: false,
      nextPointIndex: 3,
      nextLabel: 'P1',
      nextColor: MARKER_COLORS_CSS[0],
    });
  });

  it('offsets the cursor tooltip from the mouse position', () => {
    expect(getPickingCursorPositionStyle({ x: 10, y: 20 })).toEqual({
      left: 10 + PICKING_CURSOR_OFFSET_PX,
      top: 20 + PICKING_CURSOR_OFFSET_PX,
    });
    expect(getPickingCursorPositionStyle({ x: 10, y: 20 }, 4)).toEqual({
      left: 14,
      top: 24,
    });
  });

  it('builds cursor container and marker styles', () => {
    expect(getPickingCursorContainerStyle({ x: 10, y: 20 }, 4, 123)).toEqual({
      left: 14,
      top: 24,
      zIndex: 123,
    });
    expect(getPickingCursorMarkerStyle('#123456')).toEqual({ backgroundColor: '#123456' });
  });

  it('keeps the cursor container class stable without dynamic Tailwind z-indexes', () => {
    expect(PICKING_CURSOR_CONTAINER_CLASS).toBe('fixed pointer-events-none');
    expect(PICKING_CURSOR_CONTAINER_CLASS).not.toContain('z-[');
  });
});
