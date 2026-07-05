import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';
import { getWheelAdjustedFov } from './cameraFrustumViewModel';
import { useSphericalLensFovWheel } from './useSphericalLensFovWheel';

function ref<T>(current: T): MutableRefObject<T> {
  return { current };
}

type Options = Parameters<typeof useSphericalLensFovWheel>[0];

// A real canvas in the document: the hook's guard only acts on wheels whose target is the
// canvas (or a descendant), so tests must dispatch through a live element to reach the
// capture-phase window listener.
let canvas: HTMLCanvasElement;

beforeEach(() => {
  canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
});

afterEach(() => {
  canvas.remove();
  vi.restoreAllMocks();
});

function createOptions(overrides: Partial<Options> = {}): Options {
  return {
    enabled: true,
    cameraProjection: 'perspective',
    cameraFov: 60,
    setCameraFov: vi.fn(),
    domElement: canvas,
    lensPointerStateRef: ref({ pointerInsideLens: true, lensActive: true }),
    controls: { wheelHandled: ref(false) },
    onExit: vi.fn(),
    ...overrides,
  };
}

// Dispatch a real, cancelable wheel event on `target` and return it. Dispatching on the
// canvas (in the document) propagates up to the capture-phase window listener with
// `target === canvas`; `event.defaultPrevented` then reflects whether the handler acted.
function dispatchWheelOn(target: EventTarget, deltaY = 10): WheelEvent {
  const event = new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe('useSphericalLensFovWheel', () => {
  it('changes FOV in place when the pointer is inside the lens (no camera move)', () => {
    const options = createOptions();
    renderHook(() => useSphericalLensFovWheel(options));

    const event = dispatchWheelOn(canvas, 10);

    // FOV is adjusted with the SAME contract the pinhole frustum wheel uses.
    expect(options.setCameraFov).toHaveBeenCalledTimes(1);
    expect(options.setCameraFov).toHaveBeenCalledWith(getWheelAdjustedFov(60, 10));
    // Marks the event handled so the trackball canvas wheel handler bails (no dolly).
    expect(options.controls?.wheelHandled?.current).toBe(true);
    // The cancelable wheel was preventDefault'd, so the page/panel never scrolls.
    expect(event.defaultPrevented).toBe(true);
    // Inside the circle is a pure FOV zoom — it must NOT trigger the immersive exit.
    expect(options.onExit).not.toHaveBeenCalled();
  });

  it('exits the immersive lens when scrolling OUT with the pointer outside the circle', () => {
    // The fix: the lens is showing (eye parked at the tiny capture-center distance) but the
    // pointer is OUTSIDE the circle and the user scrolls OUT (deltaY > 0). A dolly from that
    // distance crawls, so instead we exit immediately: deselect; U stays on (onExit).
    const options = createOptions({
      lensPointerStateRef: ref({ pointerInsideLens: false, lensActive: true }),
    });
    renderHook(() => useSphericalLensFovWheel(options));

    const event = dispatchWheelOn(canvas, 10);

    expect(options.onExit).toHaveBeenCalledTimes(1);
    // It is an exit, not a zoom: the FOV is untouched.
    expect(options.setCameraFov).not.toHaveBeenCalled();
    // Handled + preventDefault so the trackball dolly never also fires and the page never scrolls.
    expect(options.controls?.wheelHandled?.current).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does NOT exit when scrolling IN with the pointer outside the circle (dolly closer)', () => {
    // Scroll IN (deltaY < 0) outside the circle is not an exit gesture: it must fall through to
    // the trackball so the user can still dolly toward the sphere as before.
    const options = createOptions({
      lensPointerStateRef: ref({ pointerInsideLens: false, lensActive: true }),
    });
    renderHook(() => useSphericalLensFovWheel(options));

    const event = dispatchWheelOn(canvas, -10);

    expect(options.onExit).not.toHaveBeenCalled();
    expect(options.setCameraFov).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('does NOT exit when the eye is already outside the sphere (lens inactive)', () => {
    // Lens inactive (eye already outside the sphere): even a scroll-OUT must pass through to
    // the trackball's normal dolly — there is no immersive view to leave.
    const options = createOptions({
      lensPointerStateRef: ref({ pointerInsideLens: false, lensActive: false }),
    });
    renderHook(() => useSphericalLensFovWheel(options));

    const event = dispatchWheelOn(canvas, 10);

    expect(options.onExit).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('passes the wheel through untouched when the pointer is OUTSIDE the lens (dolly path)', () => {
    const options = createOptions({
      lensPointerStateRef: ref({ pointerInsideLens: false, lensActive: false }),
    });
    renderHook(() => useSphericalLensFovWheel(options));

    const event = dispatchWheelOn(canvas, 10);

    // No FOV change, no handled-flag, no preventDefault: the event falls through
    // to the trackball canvas listener, which dollies / exits the sphere as before.
    expect(options.setCameraFov).not.toHaveBeenCalled();
    expect(options.controls?.wheelHandled?.current).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores off-canvas wheels even when the stale pointerInsideLens gate reads true', () => {
    // Regression lock: R3F leaves state.pointer stale after the cursor leaves the canvas,
    // so pointerInsideLens can still be true while the user scrolls a side panel or modal.
    // The window capture listener sees those wheels (window is an ancestor of everything),
    // but their target is NOT the canvas, so the FOV must not change and the panel/modal
    // must be free to scroll (no preventDefault).
    const options = createOptions({
      lensPointerStateRef: ref({ pointerInsideLens: true, lensActive: true }),
    });
    renderHook(() => useSphericalLensFovWheel(options));

    // Dispatched on window: target is not the canvas (nor a descendant of it).
    const event = dispatchWheelOn(window, 10);

    expect(options.setCameraFov).not.toHaveBeenCalled();
    expect(options.controls?.wheelHandled?.current).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores wheels over a sibling panel outside the canvas (the literal panel-scroll case)', () => {
    // The real-world hijack: a wheel whose target IS a Node but sits outside the canvas
    // subtree (a side panel / modal div). This exercises the `!domElement.contains(e.target)`
    // clause specifically, complementing the window test above (which trips `instanceof Node`).
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const options = createOptions({
      lensPointerStateRef: ref({ pointerInsideLens: true, lensActive: true }),
    });
    renderHook(() => useSphericalLensFovWheel(options));

    const event = dispatchWheelOn(panel, 10);

    expect(options.setCameraFov).not.toHaveBeenCalled();
    expect(options.controls?.wheelHandled?.current).toBe(false);
    expect(event.defaultPrevented).toBe(false);

    panel.remove();
  });

  it('does nothing (attaches no listener) under orthographic projection', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const options = createOptions({ cameraProjection: 'orthographic' });
    renderHook(() => useSphericalLensFovWheel(options));

    expect(addEventListener).not.toHaveBeenCalledWith('wheel', expect.anything(), expect.anything());

    const event = dispatchWheelOn(canvas, 10);

    expect(options.setCameraFov).not.toHaveBeenCalled();
    expect(options.controls?.wheelHandled?.current).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('does nothing (attaches no listener) when disabled (undistortion off)', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const options = createOptions({ enabled: false });
    renderHook(() => useSphericalLensFovWheel(options));

    expect(addEventListener).not.toHaveBeenCalledWith('wheel', expect.anything(), expect.anything());

    const event = dispatchWheelOn(canvas, 10);

    expect(options.setCameraFov).not.toHaveBeenCalled();
    expect(options.controls?.wheelHandled?.current).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('removes the window wheel listener on unmount', () => {
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const options = createOptions();
    const { unmount } = renderHook(() => useSphericalLensFovWheel(options));

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith('wheel', expect.anything(), { capture: true });

    // After unmount an on-canvas wheel (which WOULD zoom while mounted) has no effect.
    const event = dispatchWheelOn(canvas, 10);
    expect(options.setCameraFov).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
