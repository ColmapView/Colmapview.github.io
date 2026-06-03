import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildKeyboardEvent } from '../../test/builders';
import {
  handleTrackballBlur,
  handleTrackballKeyDown,
  handleTrackballKeyUp,
  useTrackballKeyboardHandlers,
} from './useTrackballKeyboardHandlers';

function ref<T>(current: T) {
  return { current };
}

function createOptions() {
  return {
    enabledRef: ref(true),
    keysPressedRef: ref(new Set<string>()),
    animationTargetRef: ref<object | null>({ target: true }),
    navActions: {
      clearNavigationHistory: vi.fn(),
    },
  };
}

function createKeyEvent(key: string, target: EventTarget = document.body): KeyboardEvent {
  return buildKeyboardEvent({
    key,
    target,
    preventDefault: vi.fn(),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('trackball keyboard handlers', () => {
  it('captures movement keys, clears navigation history, and cancels fly-to animation', () => {
    const options = createOptions();
    const event = createKeyEvent('W');

    handleTrackballKeyDown({ event, ...options });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(options.keysPressedRef.current.has('w')).toBe(true);
    expect(options.navActions.clearNavigationHistory).toHaveBeenCalledOnce();
    expect(options.animationTargetRef.current).toBeNull();
  });

  it('tracks shift without clearing navigation history or cancelling animation', () => {
    const options = createOptions();
    const animationTarget = options.animationTargetRef.current;
    const event = createKeyEvent('Shift');

    handleTrackballKeyDown({ event, ...options });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(options.keysPressedRef.current.has('shift')).toBe(true);
    expect(options.navActions.clearNavigationHistory).not.toHaveBeenCalled();
    expect(options.animationTargetRef.current).toBe(animationTarget);
  });

  it('ignores disabled controls, shortcut chords, and text-entry targets', () => {
    const options = createOptions();
    options.enabledRef.current = false;
    const disabledEvent = createKeyEvent('w');

    handleTrackballKeyDown({ event: disabledEvent, ...options });
    expect(disabledEvent.preventDefault).not.toHaveBeenCalled();
    expect(options.keysPressedRef.current.size).toBe(0);

    options.enabledRef.current = true;
    const shortcutEvent = buildKeyboardEvent({ key: 'w', ctrlKey: true, preventDefault: vi.fn() });
    handleTrackballKeyDown({ event: shortcutEvent, ...options });
    expect(shortcutEvent.preventDefault).not.toHaveBeenCalled();

    const input = document.createElement('input');
    const inputEvent = createKeyEvent('w', input);
    handleTrackballKeyDown({ event: inputEvent, ...options });
    expect(inputEvent.preventDefault).not.toHaveBeenCalled();
    expect(options.keysPressedRef.current.size).toBe(0);
  });

  it('removes released keys and clears all pressed keys on blur', () => {
    const keysPressedRef = ref(new Set(['w', 'shift']));

    handleTrackballKeyUp(createKeyEvent('W'), keysPressedRef);
    expect(keysPressedRef.current.has('w')).toBe(false);
    expect(keysPressedRef.current.has('shift')).toBe(true);

    handleTrackballBlur(keysPressedRef);
    expect(keysPressedRef.current.size).toBe(0);
  });

  it('registers and unregisters window listeners', () => {
    const options = createOptions();
    const { unmount } = renderHook(() => useTrackballKeyboardHandlers(options));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    });

    expect(options.keysPressedRef.current.has('d')).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd' }));
    });

    expect(options.keysPressedRef.current.has('d')).toBe(false);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      window.dispatchEvent(new Event('blur'));
    });

    expect(options.keysPressedRef.current.size).toBe(0);

    unmount();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    });

    expect(options.keysPressedRef.current.size).toBe(0);
  });
});
