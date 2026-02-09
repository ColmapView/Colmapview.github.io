/**
 * Guards for mobile touch interaction between CameraFrustums and Scene3D.
 *
 * 1. Tap guard: onPointerUp handles the tap (select + fly-to) but R3F's click
 *    raycast may miss the mesh due to touch coordinate drift, firing onPointerMissed
 *    which clears the selection. Scene3D checks this to skip the spurious clear.
 *
 * 2. Touch-down guard: R3F's onPointerDown fires synchronously before the DOM event
 *    bubbles to the container div. Scene3D checks this to avoid starting a competing
 *    long-press timer when a frustum is already handling the touch.
 */
let _frustumTapTime = 0;
let _frustumTouchDownTime = 0;

/** How long after a frustum tap to suppress onPointerMissed selection clearing */
const POINTER_MISSED_GUARD_MS = 200;
/** How long after a frustum touch-down to suppress Scene3D long-press timer start */
const TOUCH_DOWN_GUARD_MS = 50; // same-event sync; 50ms is generous

export function markFrustumTap() { _frustumTapTime = Date.now(); }
export function wasFrustumTapRecent() { return Date.now() - _frustumTapTime < POINTER_MISSED_GUARD_MS; }
export function markFrustumTouchDown() { _frustumTouchDownTime = Date.now(); }
export function wasFrustumTouchDownRecent() { return Date.now() - _frustumTouchDownTime < TOUCH_DOWN_GUARD_MS; }
