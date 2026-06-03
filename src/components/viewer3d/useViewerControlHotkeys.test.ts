import { describe, expect, it } from 'vitest';
import { COLMAP_JOKES, getColmapJoke } from './useViewerControlHotkeys';

describe('viewer control hotkey helpers', () => {
  it('selects a COLMAP joke from a random value', () => {
    expect(getColmapJoke(0)).toBe(COLMAP_JOKES[0]);
    expect(getColmapJoke(0.99999)).toBe(COLMAP_JOKES[COLMAP_JOKES.length - 1]);
    expect(getColmapJoke(1)).toBe(COLMAP_JOKES[COLMAP_JOKES.length - 1]);
  });
});
