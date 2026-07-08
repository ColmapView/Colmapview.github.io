import { afterEach, describe, expect, it, vi } from 'vitest';
import { armFrustumLongPress } from './frustumLongPress';
import { resetFrustumTouchGuards, setActiveSceneTouchPointerCount } from './frustumTouchGuards';
import { TOUCH } from '../../theme/sizing';

function dispatchWindowPointer(type: 'pointermove' | 'pointerup' | 'pointercancel', pointerId: number, clientX = 0, clientY = 0) {
  const event = new Event(type);
  Object.assign(event, { pointerId, clientX, clientY });
  window.dispatchEvent(event);
}

afterEach(() => {
  vi.useRealTimers();
  resetFrustumTouchGuards();
});

describe('armFrustumLongPress', () => {
  it('fires after the delay while the lone touch pointer holds still', () => {
    vi.useFakeTimers();
    setActiveSceneTouchPointerCount(1);
    const onFire = vi.fn();
    const handle = armFrustumLongPress({ pointerId: 1, x: 10, y: 20, onFire });

    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onFire).toHaveBeenCalledTimes(1);
    expect(handle.fired).toBe(true);
  });

  it('cancels when the armed pointer moves past the tap threshold', () => {
    vi.useFakeTimers();
    setActiveSceneTouchPointerCount(1);
    const onFire = vi.fn();
    const handle = armFrustumLongPress({ pointerId: 1, x: 10, y: 20, onFire });

    dispatchWindowPointer('pointermove', 1, 40, 20); // 30px > 15px tap radius
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onFire).not.toHaveBeenCalled();
    expect(handle.fired).toBe(false);
  });

  it('ignores moves from other pointers', () => {
    vi.useFakeTimers();
    setActiveSceneTouchPointerCount(1);
    const onFire = vi.fn();
    armFrustumLongPress({ pointerId: 1, x: 10, y: 20, onFire });

    dispatchWindowPointer('pointermove', 2, 500, 500);
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('does not fire when a second scene touch pointer is active at fire time (pinch)', () => {
    vi.useFakeTimers();
    setActiveSceneTouchPointerCount(1);
    const onFire = vi.fn();
    armFrustumLongPress({ pointerId: 1, x: 10, y: 20, onFire });

    setActiveSceneTouchPointerCount(2); // second finger landed anywhere in the scene
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onFire).not.toHaveBeenCalled();
  });

  it('cancels on window pointerup / pointercancel of the armed pointer', () => {
    vi.useFakeTimers();
    setActiveSceneTouchPointerCount(1);
    const onFire = vi.fn();
    armFrustumLongPress({ pointerId: 1, x: 10, y: 20, onFire });
    dispatchWindowPointer('pointercancel', 1);
    vi.advanceTimersByTime(TOUCH.longPressDelay);
    expect(onFire).not.toHaveBeenCalled();
  });

  it('cancel() is idempotent and removes window listeners', () => {
    vi.useFakeTimers();
    setActiveSceneTouchPointerCount(1);
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const handle = armFrustumLongPress({ pointerId: 1, x: 10, y: 20, onFire: vi.fn() });
    handle.cancel();
    handle.cancel();
    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function));
  });
});
