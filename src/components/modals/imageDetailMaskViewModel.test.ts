import { describe, expect, it } from 'vitest';
import {
  getActiveMaskViewState,
  getMaskSplitViewState,
  getNextMaskMode,
  getNextMaskViewState,
  getResetMaskViewState,
} from './imageDetailMaskViewModel';

describe('imageDetailMaskViewModel', () => {
  it('cycles through mask modes in display order', () => {
    expect(getNextMaskMode('hover')).toBe('mask');
    expect(getNextMaskMode('mask')).toBe('split');
    expect(getNextMaskMode('split')).toBe('image');
    expect(getNextMaskMode('image')).toBe('hover');
  });

  it('uses the active image state when cycling and resetting mask views', () => {
    const state = { imageDetailId: 7, mode: 'split' as const, splitX: 0.25 };

    expect(getActiveMaskViewState(state, 7)).toEqual({ mode: 'split', splitX: 0.25 });
    expect(getNextMaskViewState(state, 7)).toEqual({
      imageDetailId: 7,
      mode: 'image',
      splitX: 0.25,
    });
    expect(getResetMaskViewState(state, 7)).toEqual({
      imageDetailId: 7,
      mode: 'hover',
      splitX: 0.25,
    });
  });

  it('resets stale image state and clamps split position', () => {
    const state = { imageDetailId: 7, mode: 'split' as const, splitX: 0.25 };

    expect(getActiveMaskViewState(state, 8)).toEqual({ mode: 'hover', splitX: 0.5 });
    expect(getMaskSplitViewState(state, 8, 1.5)).toEqual({
      imageDetailId: 8,
      mode: 'hover',
      splitX: 1,
    });
    expect(getMaskSplitViewState(state, 7, -0.5)).toEqual({
      imageDetailId: 7,
      mode: 'split',
      splitX: 0,
    });
  });
});
