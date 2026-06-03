import { beforeEach, describe, expect, it } from 'vitest';
import {
  markFrustumTap,
  markFrustumTouchDown,
  markSceneObjectTouchDown,
  markSceneObjectTouchDownForTouchPointer,
  POINTER_MISSED_GUARD_MS,
  resetFrustumTouchGuards,
  TOUCH_DOWN_GUARD_MS,
  wasFrustumTapRecent,
  wasFrustumTouchDownRecent,
  wasSceneObjectTouchDownRecent,
} from './frustumTouchGuards';

describe('frustum touch guards', () => {
  beforeEach(() => {
    resetFrustumTouchGuards();
  });

  it('does not report a recent frustum tap before one is marked', () => {
    expect(wasFrustumTapRecent(1_000)).toBe(false);
  });

  it('suppresses pointer-missed selection clearing inside the frustum tap window', () => {
    markFrustumTap(1_000);

    expect(wasFrustumTapRecent(1_000)).toBe(true);
    expect(wasFrustumTapRecent(1_000 + POINTER_MISSED_GUARD_MS - 1)).toBe(true);
    expect(wasFrustumTapRecent(1_000 + POINTER_MISSED_GUARD_MS)).toBe(false);
  });

  it('does not report a recent frustum touch-down before one is marked', () => {
    expect(wasFrustumTouchDownRecent(1_000)).toBe(false);
  });

  it('suppresses scene long-press timers inside the frustum touch-down window', () => {
    markFrustumTouchDown(2_000);

    expect(wasFrustumTouchDownRecent(2_000)).toBe(true);
    expect(wasFrustumTouchDownRecent(2_000 + TOUCH_DOWN_GUARD_MS - 1)).toBe(true);
    expect(wasFrustumTouchDownRecent(2_000 + TOUCH_DOWN_GUARD_MS)).toBe(false);
  });

  it('suppresses scene long-press timers after any scene object touch-down', () => {
    markSceneObjectTouchDown(2_000);

    expect(wasSceneObjectTouchDownRecent(2_000)).toBe(true);
    expect(wasFrustumTouchDownRecent(2_000)).toBe(true);
  });

  it('only marks scene object touch-downs for touch pointers', () => {
    expect(markSceneObjectTouchDownForTouchPointer('mouse', 2_000)).toBe(false);
    expect(wasSceneObjectTouchDownRecent(2_000)).toBe(false);

    expect(markSceneObjectTouchDownForTouchPointer('touch', 2_000)).toBe(true);
    expect(wasSceneObjectTouchDownRecent(2_000)).toBe(true);
  });

  it('resets both guard windows', () => {
    markFrustumTap(1_000);
    markSceneObjectTouchDown(1_000);

    resetFrustumTouchGuards();

    expect(wasFrustumTapRecent(1_001)).toBe(false);
    expect(wasSceneObjectTouchDownRecent(1_001)).toBe(false);
  });
});
