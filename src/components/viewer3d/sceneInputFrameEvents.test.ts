import { describe, expect, it, vi } from 'vitest';
import { subscribeSceneInputFrames } from './sceneInputFrameEvents';

describe('native scene input wakes', () => {
  it('wakes pointer, wheel, touch, keyboard, resize and visibility events even when claimed', () => {
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const wake = vi.fn();
    const unsubscribe = subscribeSceneInputFrames(canvas, wake);
    const claim = (event: Event) => event.stopPropagation();
    canvas.addEventListener('wheel', claim);
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave',
      'wheel', 'touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      wake.mockClear();
      canvas.dispatchEvent(new Event(type, { bubbles: true }));
      expect(wake).toHaveBeenCalled();
    }
    for (const type of ['keydown', 'keyup', 'blur', 'focus', 'resize']) {
      wake.mockClear();
      window.dispatchEvent(new Event(type));
      expect(wake).toHaveBeenCalledOnce();
    }
    wake.mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(wake).toHaveBeenCalledOnce();
    unsubscribe();
    wake.mockClear();
    canvas.dispatchEvent(new Event('wheel'));
    window.dispatchEvent(new Event('keydown'));
    expect(wake).not.toHaveBeenCalled();
    canvas.remove();
  });

  it('wakes dragging outside the canvas without waking ordinary UI pointer movement', () => {
    const canvas = document.createElement('canvas');
    const wake = vi.fn();
    const unsubscribe = subscribeSceneInputFrames(canvas, wake);
    document.dispatchEvent(new MouseEvent('pointermove', { buttons: 0 }));
    expect(wake).not.toHaveBeenCalled();
    document.dispatchEvent(new MouseEvent('pointermove', { buttons: 1 }));
    expect(wake).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
