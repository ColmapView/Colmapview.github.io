import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type RefObject } from 'react';
import { useClickOutside } from './useClickOutside';

function createRef(element: HTMLElement | null): RefObject<HTMLElement | null> {
  return { current: element };
}

function flushDelayedListeners(): void {
  act(() => {
    vi.runOnlyPendingTimers();
  });
}

describe('useClickOutside', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('closes after the delayed listener sees an outside mousedown', () => {
    vi.useFakeTimers();
    const menu = document.createElement('div');
    const child = document.createElement('button');
    const outside = document.createElement('button');
    const onClose = vi.fn();
    menu.appendChild(child);
    document.body.append(menu, outside);

    renderHook(() => useClickOutside(createRef(menu), onClose));

    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();

    flushDelayedListeners();
    child.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();

    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);

    menu.remove();
    outside.remove();
  });

  it('closes on Escape after listeners are attached', () => {
    vi.useFakeTimers();
    const menu = document.createElement('div');
    const onClose = vi.fn();
    document.body.append(menu);

    renderHook(() => useClickOutside(createRef(menu), onClose));
    flushDelayedListeners();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);

    menu.remove();
  });

  it('does not attach listeners while disabled', () => {
    vi.useFakeTimers();
    const addSpy = vi.spyOn(document, 'addEventListener');
    const menu = document.createElement('div');

    renderHook(() => useClickOutside(createRef(menu), vi.fn(), false));
    flushDelayedListeners();

    expect(addSpy).not.toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(addSpy).not.toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('removes listeners and cancels pending attachment on unmount', () => {
    vi.useFakeTimers();
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const menu = document.createElement('div');
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useClickOutside(createRef(menu), onClose));

    unmount();
    flushDelayedListeners();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(onClose).not.toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
