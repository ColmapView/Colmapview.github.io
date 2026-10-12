import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Z_INDEX } from '../theme';
import { nextModalZIndex, useModalZIndex } from './useModalZIndex';

describe('nextModalZIndex', () => {
  it('increments within the tool-window band', () => {
    expect(nextModalZIndex(Z_INDEX.modal)).toBe(Z_INDEX.modal + 1);
  });

  it('never reaches notifications or blocking dialogs, even after repeated activation', () => {
    let z: number = Z_INDEX.modal;
    for (let i = 0; i < 500; i++) z = nextModalZIndex(z);
    expect(z).toBeLessThan(Z_INDEX.toast);
    expect(z).toBeLessThan(Z_INDEX.modalOverlay);
  });
});

describe('useModalZIndex', () => {
  it('keeps the hook-assigned z-index inside the tool-window band', () => {
    const { result } = renderHook(() => useModalZIndex(true));
    const onOpen = result.current.zIndex;
    expect(onOpen).toBeGreaterThan(Z_INDEX.modal);
    expect(onOpen).toBeLessThan(Z_INDEX.modalOverlay);

    // Already the top window: bringToFront burns no counter headroom.
    act(() => result.current.bringToFront());
    expect(result.current.zIndex).toBe(onOpen);

    // A second window opens above it; clicking the first raises it back to top.
    renderHook(() => useModalZIndex(true));
    act(() => result.current.bringToFront());

    expect(result.current.zIndex).toBeGreaterThan(onOpen);
    expect(result.current.zIndex).toBeLessThan(Z_INDEX.modalOverlay);
  });

  it('rewinds the shared counter once every window has closed', () => {
    // Walk the counter forward, then close everything. Unmounts are explicit
    // rather than left to testing-library's afterEach so the rewind under test
    // is the hook's own cleanup, not teardown ordering.
    const first = renderHook(() => useModalZIndex(true));
    const second = renderHook(() => useModalZIndex(true));
    expect(second.result.current.zIndex).toBeGreaterThan(first.result.current.zIndex);
    first.unmount();
    second.unmount();

    const reopened = renderHook(() => useModalZIndex(true));
    expect(reopened.result.current.zIndex).toBe(Z_INDEX.modal + 1);
    reopened.unmount();
  });

  it('does not rewind while another window is still open', () => {
    const survivor = renderHook(() => useModalZIndex(true));
    const closed = renderHook(() => useModalZIndex(true));
    const survivorZ = survivor.result.current.zIndex;
    closed.unmount();

    // One window is still on screen holding survivorZ, so a newly opened window
    // has to land above it instead of restarting at the bottom of the band.
    const opened = renderHook(() => useModalZIndex(true));
    expect(opened.result.current.zIndex).toBeGreaterThan(survivorZ);
    opened.unmount();
    survivor.unmount();
  });

  it('releases its slot when isOpen goes false without unmounting', () => {
    // ViewerToolModals renders all four tool modals unconditionally and only
    // toggles isOpen, so closing a window never unmounts its hook.
    const { result, rerender, unmount } = renderHook(
      ({ isOpen }) => useModalZIndex(isOpen),
      { initialProps: { isOpen: true } },
    );
    expect(result.current.zIndex).toBeGreaterThan(Z_INDEX.modal);
    rerender({ isOpen: false });

    const reopened = renderHook(() => useModalZIndex(true));
    expect(reopened.result.current.zIndex).toBe(Z_INDEX.modal + 1);
    reopened.unmount();
    unmount();
  });
});
