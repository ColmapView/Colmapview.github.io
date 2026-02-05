/**
 * Hook for managing z-index of multiple tool modals.
 * Ensures clicked/opened modals appear on top of others.
 */

import { useState, useCallback, useEffect } from 'react';

// Global counter shared across all modal instances
let globalZIndexCounter = 1000;

/**
 * Returns a z-index value and a function to bring the modal to front.
 * Call bringToFront() on mousedown/click to ensure the modal appears on top.
 */
export function useModalZIndex(isOpen: boolean) {
  const [zIndex, setZIndex] = useState(1000);

  // When modal opens, bring it to front
  useEffect(() => {
    if (isOpen) {
      setZIndex(++globalZIndexCounter);
    }
  }, [isOpen]);

  const bringToFront = useCallback(() => {
    setZIndex(++globalZIndexCounter);
  }, []);

  return { zIndex, bringToFront };
}
