import { useEffect, useState } from 'react';
import {
  getTouchCapabilitiesFromEnvironment,
  getTouchMediaState,
  NO_TOUCH_CAPABILITIES,
  shouldUseTouchMode,
  TOUCH_CAPABILITY_MEDIA_QUERIES,
} from './touchDevicePolicy';
import type { TouchCapabilities, TouchEnvironment } from './touchDevicePolicy';

// Browser adapter for touch-mode detection. Decision logic lives in touchDevicePolicy.
function getCurrentTouchEnvironment(): TouchEnvironment {
  if (typeof window === 'undefined') {
    return {};
  }

  return {
    matchMedia: typeof window.matchMedia === 'function'
      ? window.matchMedia.bind(window)
      : undefined,
    maxTouchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
    hasTouchStart: 'ontouchstart' in window,
  };
}

function subscribeToTouchMediaChanges(onChange: () => void): () => void {
  const mediaQueries = TOUCH_CAPABILITY_MEDIA_QUERIES.map((query) =>
    window.matchMedia(query)
  );

  mediaQueries.forEach((query) => query.addEventListener('change', onChange));

  return () => {
    mediaQueries.forEach((query) => query.removeEventListener('change', onChange));
  };
}

function useTouchMediaSnapshot<T>(readSnapshot: () => T): T {
  const [snapshot, setSnapshot] = useState(readSnapshot);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    return subscribeToTouchMediaChanges(() => setSnapshot(readSnapshot()));
  }, [readSnapshot]);

  return snapshot;
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
  return shouldUseTouchMode(
    getTouchMediaState(getCurrentTouchEnvironment().matchMedia)
  );
}

/**
 * Get detailed touch capabilities
 */
export function getTouchCapabilities(): TouchCapabilities {
  if (typeof window === 'undefined') {
    return NO_TOUCH_CAPABILITIES;
  }

  return getTouchCapabilitiesFromEnvironment(getCurrentTouchEnvironment());
}

/**
 * Hook to detect whether touch mode should be active.
 * This intentionally differs from generic touchscreen capability.
 */
export function useIsTouchDevice(): boolean {
  return useTouchMediaSnapshot(detectTouchDevice);
}

/**
 * Hook to get detailed touch capabilities with reactive updates.
 */
export function useTouchCapabilities(): TouchCapabilities {
  return useTouchMediaSnapshot(getTouchCapabilities);
}

/**
 * Facade for touch-mode selection.
 * Keep callers here if URL or store overrides are added later.
 */
export function useShouldUseTouchMode(): boolean {
  return useIsTouchDevice();
}
