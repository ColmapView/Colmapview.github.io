import { useState, useEffect } from 'react';

/**
 * Detect if the device has touch capability.
 * This is different from useIsMobile which only checks viewport width.
 *
 * Detection methods (in priority order):
 * 1. navigator.maxTouchPoints > 0 (most reliable)
 * 2. 'ontouchstart' in window (legacy fallback)
 * 3. (pointer: coarse) media query (primary input is imprecise)
 * 4. (hover: none) media query (device cannot hover)
 */

interface TouchCapabilities {
  hasTouch: boolean;       // Device has touch capability
  isCoarsePointer: boolean; // Primary pointer is coarse (finger vs mouse)
  cannotHover: boolean;     // Device cannot hover (true for most tablets)
}

/**
 * Detect if device should use touch mode (non-reactive, for initial detection).
 *
 * Only returns true for true tablets/phones - NOT touchscreen laptops.
 * Requires BOTH:
 * - Primary pointer is coarse (touch, not mouse)
 * - Device cannot hover (no mouse/trackpad)
 *
 * Touchscreen laptops have mouse as primary pointer and can hover,
 * so they get desktop mode with full gallery.
 */
export function detectTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;

  // Only enable touch mode if:
  // 1. Primary pointer is coarse (touch) - excludes devices with mouse as primary
  // 2. Device cannot hover - excludes laptops with trackpads
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const cannotHover = window.matchMedia('(hover: none)').matches;

  // Both conditions must be true for touch mode
  return isCoarsePointer && cannotHover;
}

/**
 * Get detailed touch capabilities
 */
export function getTouchCapabilities(): TouchCapabilities {
  if (typeof window === 'undefined') {
    return { hasTouch: false, isCoarsePointer: false, cannotHover: false };
  }

  const hasTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const cannotHover = window.matchMedia('(hover: none)').matches;

  return { hasTouch, isCoarsePointer, cannotHover };
}

/**
 * Hook to detect if the device has touch capability.
 * Returns true if the device supports touch input.
 *
 * Note: This detects capability, not current input method.
 * A laptop with touchscreen will return true even when using mouse.
 */
export function useIsTouchDevice(): boolean {
  const [isTouchDevice, setIsTouchDevice] = useState(detectTouchDevice);

  useEffect(() => {
    // Listen for changes in pointer type (e.g., connecting external mouse)
    const coarseQuery = window.matchMedia('(pointer: coarse)');
    const hoverQuery = window.matchMedia('(hover: none)');

    const handleChange = () => {
      setIsTouchDevice(detectTouchDevice());
    };

    coarseQuery.addEventListener('change', handleChange);
    hoverQuery.addEventListener('change', handleChange);

    return () => {
      coarseQuery.removeEventListener('change', handleChange);
      hoverQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return isTouchDevice;
}

/**
 * Hook to get detailed touch capabilities with reactive updates.
 */
export function useTouchCapabilities(): TouchCapabilities {
  const [capabilities, setCapabilities] = useState(getTouchCapabilities);

  useEffect(() => {
    const coarseQuery = window.matchMedia('(pointer: coarse)');
    const hoverQuery = window.matchMedia('(hover: none)');

    const handleChange = () => {
      setCapabilities(getTouchCapabilities());
    };

    coarseQuery.addEventListener('change', handleChange);
    hoverQuery.addEventListener('change', handleChange);

    return () => {
      coarseQuery.removeEventListener('change', handleChange);
      hoverQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return capabilities;
}

/**
 * Hook that returns true if touch mode should be active.
 * Combines device detection with store state for URL override support.
 *
 * Priority:
 * 1. URL override (?touch=1 or ?touch=0)
 * 2. Auto-detection based on device capabilities
 */
export function useShouldUseTouchMode(): boolean {
  const isTouchDevice = useIsTouchDevice();

  // This will be used with store state once touchMode is added to uiStore
  // For now, just return device detection
  return isTouchDevice;
}
