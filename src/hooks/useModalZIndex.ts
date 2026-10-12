/**
 * Hook for managing z-index of multiple tool modals.
 * Ensures clicked/opened modals appear on top of others.
 */

import { useState, useCallback, useEffect } from 'react';
import { Z_INDEX } from '../theme';

/** Tool windows stack in [Z_INDEX.modal, Z_INDEX.toast). The clamp keeps
 * a long session from pushing tool windows above notifications or blocking
 * dialogs. At the cap, ties resolve by DOM order.
 * It is a backstop rather than the usual bound: the counter rewinds whenever the
 * last open window closes, so only a session that keeps at least one window open
 * continuously can walk all 99 steps up to the cap. */
export function nextModalZIndex(counter: number): number {
  return Math.min(counter + 1, Z_INDEX.toast - 1);
}

// Global counter shared across all modal instances.
// Annotated `number` because Z_INDEX is `as const`, so Z_INDEX.modal is the
// literal type 1000 and would not widen on its own.
let globalZIndexCounter: number = Z_INDEX.modal;

// How many tool windows are open right now. At zero no assigned z-index is on
// screen anywhere, which is the only moment the counter can rewind without
// reordering anything.
let openWindowCount = 0;

// Takes the setter as a parameter rather than reading state: react-hooks forbids
// setting state in an effect body from a value this module owns.
function assignTopZIndex(setZIndex: (zIndex: number) => void): void {
  globalZIndexCounter = nextModalZIndex(globalZIndexCounter);
  setZIndex(globalZIndexCounter);
}

// Claims the top slot for a window that just opened and returns its release.
// The increment and its matching decrement live together so the refcount cannot
// drift: rewinding while a window is still open would hand the next opened
// window a LOWER z-index than the survivor, i.e. the exact stacking bug this
// module exists to prevent.
function registerOpenWindow(setZIndex: (zIndex: number) => void): () => void {
  openWindowCount += 1;
  assignTopZIndex(setZIndex);
  return () => {
    openWindowCount = Math.max(0, openWindowCount - 1);
    if (openWindowCount === 0) globalZIndexCounter = Z_INDEX.modal;
  };
}

/**
 * Returns a z-index value and a function to bring the modal to front.
 * Call bringToFront() on mousedown/click to ensure the modal appears on top.
 */
export function useModalZIndex(isOpen: boolean) {
  const [zIndex, setZIndex] = useState<number>(Z_INDEX.modal);

  // When modal opens, bring it to front. Unguarded on purpose: before any window
  // has opened, several can share the initial Z_INDEX.modal value, so an
  // already-on-top check here would let a newly opened window fail to claim top.
  // Keyed on isOpen rather than on mount because ViewerToolModals keeps every
  // tool modal mounted permanently and only toggles isOpen — a mount-keyed
  // refcount would never come back down.
  useEffect(() => {
    if (!isOpen) return;
    return registerOpenWindow(setZIndex);
  }, [isOpen]);

  const bringToFront = useCallback(() => {
    // Already the top window: advancing would only burn counter headroom.
    if (zIndex === globalZIndexCounter) return;
    assignTopZIndex(setZIndex);
  }, [zIndex]);

  return { zIndex, bringToFront };
}
