import { describe, expect, it } from 'vitest';
import {
  COARSE_POINTER_QUERY,
  getTouchCapabilitiesFromEnvironment,
  getTouchMediaState,
  NO_HOVER_QUERY,
  shouldUseTouchMode,
  TOUCH_CAPABILITY_MEDIA_QUERIES,
} from './touchDevicePolicy';
import type { TouchMediaMatcher } from './touchDevicePolicy';

function createMatcher(matchesByQuery: Record<string, boolean>): TouchMediaMatcher {
  return (query) => ({ matches: matchesByQuery[query] ?? false });
}

describe('touch device policy', () => {
  it('uses touch mode only when the primary pointer is coarse and cannot hover', () => {
    expect(shouldUseTouchMode({ isCoarsePointer: true, cannotHover: true })).toBe(true);
    expect(shouldUseTouchMode({ isCoarsePointer: true, cannotHover: false })).toBe(false);
    expect(shouldUseTouchMode({ isCoarsePointer: false, cannotHover: true })).toBe(false);
    expect(shouldUseTouchMode({ isCoarsePointer: false, cannotHover: false })).toBe(false);
  });

  it('reads touch media state from the supported media queries', () => {
    const queried: string[] = [];
    const state = getTouchMediaState((query) => {
      queried.push(query);
      return { matches: query === COARSE_POINTER_QUERY };
    });

    expect(state).toEqual({
      isCoarsePointer: true,
      cannotHover: false,
    });
    expect(queried).toEqual([...TOUCH_CAPABILITY_MEDIA_QUERIES]);
  });

  it('defaults to desktop-safe media state when matchMedia is unavailable', () => {
    expect(getTouchMediaState()).toEqual({
      isCoarsePointer: false,
      cannotHover: false,
    });
  });

  it('separates touch capability from touch-mode eligibility', () => {
    const capabilities = getTouchCapabilitiesFromEnvironment({
      matchMedia: createMatcher({
        [COARSE_POINTER_QUERY]: false,
        [NO_HOVER_QUERY]: false,
      }),
      maxTouchPoints: 5,
      hasTouchStart: true,
    });

    expect(capabilities).toEqual({
      hasTouch: true,
      isCoarsePointer: false,
      cannotHover: false,
    });
    expect(shouldUseTouchMode(capabilities)).toBe(false);
  });

  it('derives tablet-style capabilities from coarse pointer and no-hover media', () => {
    expect(getTouchCapabilitiesFromEnvironment({
      matchMedia: createMatcher({
        [COARSE_POINTER_QUERY]: true,
        [NO_HOVER_QUERY]: true,
      }),
      maxTouchPoints: 1,
      hasTouchStart: false,
    })).toEqual({
      hasTouch: true,
      isCoarsePointer: true,
      cannotHover: true,
    });
  });
});
