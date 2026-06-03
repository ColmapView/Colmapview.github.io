import { describe, expect, it, vi } from 'vitest';
import { startCapturedPointerDrag } from './capturedPointerDrag';

function createPointerDragEvent(element: HTMLElement) {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const setPointerCapture = vi.fn();
  Object.defineProperty(element, 'setPointerCapture', {
    configurable: true,
    value: setPointerCapture,
  });

  return {
    event: {
      currentTarget: element,
      pointerId: 7,
      preventDefault,
      stopPropagation,
    },
    preventDefault,
    setPointerCapture,
    stopPropagation,
  };
}

describe('captured pointer drag', () => {
  it('captures the pointer and wires move/up listeners', () => {
    const element = document.createElement('div');
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const { event, preventDefault, setPointerCapture } = createPointerDragEvent(element);

    startCapturedPointerDrag({ event, onMove, onEnd });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(setPointerCapture).toHaveBeenCalledWith(7);

    element.dispatchEvent(new Event('pointermove'));
    expect(onMove).toHaveBeenCalledTimes(1);

    element.dispatchEvent(new Event('pointerup'));
    expect(onEnd).toHaveBeenCalledTimes(1);

    element.dispatchEvent(new Event('pointermove'));
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('stops propagation only when requested', () => {
    const first = createPointerDragEvent(document.createElement('div'));
    const second = createPointerDragEvent(document.createElement('div'));

    startCapturedPointerDrag({ event: first.event, onMove: vi.fn() });
    startCapturedPointerDrag({
      event: second.event,
      onMove: vi.fn(),
      stopPropagation: true,
    });

    expect(first.stopPropagation).not.toHaveBeenCalled();
    expect(second.stopPropagation).toHaveBeenCalledTimes(1);
  });
});
