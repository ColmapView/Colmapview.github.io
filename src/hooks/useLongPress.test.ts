import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOUCH } from '../theme/sizing';
import { useLongPress, type LongPressTouchEvent } from './useLongPress';

function touchEvent(points: Array<{ clientX: number; clientY: number }>): LongPressTouchEvent {
  return { touches: points as unknown as React.TouchList };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useLongPress', () => {
  it('fires after the delay for a stationary single touch', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onLongPress }));

    result.current.onTouchStart(touchEvent([{ clientX: 10, clientY: 20 }]));
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when a second touch joins before the delay', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onLongPress }));

    result.current.onTouchStart(touchEvent([{ clientX: 10, clientY: 20 }]));
    // Second finger lands on the same element: this is a gesture, not a press.
    result.current.onTouchStart(touchEvent([
      { clientX: 10, clientY: 20 },
      { clientX: 120, clientY: 220 },
    ]));
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('cancels a pending press when a second finger appears during a move', () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { result } = renderHook(() => useLongPress({ onLongPress }));

    result.current.onTouchStart(touchEvent([{ clientX: 10, clientY: 20 }]));
    // touches lists ALL active screen touches: a second finger may land on a
    // different element, so it only shows up here via a move on this one.
    result.current.onTouchMove(touchEvent([
      { clientX: 11, clientY: 21 },
      { clientX: 120, clientY: 220 },
    ]));
    vi.advanceTimersByTime(TOUCH.longPressDelay);

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
