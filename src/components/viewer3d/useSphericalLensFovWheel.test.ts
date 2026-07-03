import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';
import { buildWheelEvent } from '../../test/builders';
import { getWheelAdjustedFov } from './cameraFrustumViewModel';
import { useSphericalLensFovWheel } from './useSphericalLensFovWheel';

function ref<T>(current: T): MutableRefObject<T> {
  return { current };
}

type Options = Parameters<typeof useSphericalLensFovWheel>[0];

function createOptions(overrides: Partial<Options> = {}): Options {
  return {
    enabled: true,
    cameraProjection: 'perspective',
    cameraFov: 60,
    setCameraFov: vi.fn(),
    lensPointerStateRef: ref({ pointerInsideLens: true }),
    controls: { wheelHandled: ref(false) },
    ...overrides,
  };
}

function dispatchWheel(deltaY = 10): WheelEvent {
  const preventDefault = vi.fn();
  const event = buildWheelEvent({ deltaY, preventDefault });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSphericalLensFovWheel', () => {
  it('changes FOV in place when the pointer is inside the lens (no camera move)', () => {
    const options = createOptions();
    renderHook(() => useSphericalLensFovWheel(options));

    const event = dispatchWheel(10);

    // FOV is adjusted with the SAME contract the pinhole frustum wheel uses.
    expect(options.setCameraFov).toHaveBeenCalledTimes(1);
    expect(options.setCameraFov).toHaveBeenCalledWith(getWheelAdjustedFov(60, 10));
    // Marks the event handled so the trackball canvas wheel handler bails (no dolly).
    expect(options.controls?.wheelHandled?.current).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('passes the wheel through untouched when the pointer is OUTSIDE the lens (dolly path)', () => {
    const options = createOptions({
      lensPointerStateRef: ref({ pointerInsideLens: false }),
    });
    renderHook(() => useSphericalLensFovWheel(options));

    const event = dispatchWheel(10);

    // No FOV change, no handled-flag, no preventDefault: the event falls through
    // to the trackball canvas listener, which dollies / exits the sphere as before.
    expect(options.setCameraFov).not.toHaveBeenCalled();
    expect(options.controls?.wheelHandled?.current).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('does nothing (attaches no listener) under orthographic projection', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const options = createOptions({ cameraProjection: 'orthographic' });
    renderHook(() => useSphericalLensFovWheel(options));

    expect(addEventListener).not.toHaveBeenCalledWith('wheel', expect.anything(), expect.anything());

    const event = dispatchWheel(10);

    expect(options.setCameraFov).not.toHaveBeenCalled();
    expect(options.controls?.wheelHandled?.current).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('does nothing (attaches no listener) when disabled (undistortion off)', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const options = createOptions({ enabled: false });
    renderHook(() => useSphericalLensFovWheel(options));

    expect(addEventListener).not.toHaveBeenCalledWith('wheel', expect.anything(), expect.anything());

    const event = dispatchWheel(10);

    expect(options.setCameraFov).not.toHaveBeenCalled();
    expect(options.controls?.wheelHandled?.current).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('removes the window wheel listener on unmount', () => {
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const options = createOptions();
    const { unmount } = renderHook(() => useSphericalLensFovWheel(options));

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith('wheel', expect.anything(), { capture: true });

    // After unmount a wheel event has no effect.
    const event = dispatchWheel(10);
    expect(options.setCameraFov).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
