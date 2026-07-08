/**
 * Guards for mobile touch interaction between interactive scene objects and Scene3D.
 *
 * 1. Tap guard: onPointerUp handles the tap (select + fly-to) but R3F's click
 *    raycast may miss the mesh due to touch coordinate drift, firing onPointerMissed
 *    which clears the selection. Scene3D checks this to skip the spurious clear.
 *
 * 2. Touch-down guard: R3F's onPointerDown fires synchronously before the DOM event
 *    bubbles to the container div. Scene3D checks this to avoid starting a competing
 *    long-press timer when an object is already handling the touch.
 */
let _frustumTapTime = Number.NEGATIVE_INFINITY;
let _sceneObjectTouchDownTime = Number.NEGATIVE_INFINITY;

/** How long after a frustum tap to suppress onPointerMissed selection clearing */
export const POINTER_MISSED_GUARD_MS = 200;
/** How long after a frustum touch-down to suppress Scene3D long-press timer start */
export const TOUCH_DOWN_GUARD_MS = 50; // same-event sync; 50ms is generous

export function markFrustumTap(now = Date.now()) {
  _frustumTapTime = now;
}

export function wasFrustumTapRecent(now = Date.now()) {
  return now - _frustumTapTime < POINTER_MISSED_GUARD_MS;
}

export function markSceneObjectTouchDown(now = Date.now()) {
  _sceneObjectTouchDownTime = now;
}

export function markSceneObjectTouchDownForTouchPointer(pointerType: string | undefined, now = Date.now()) {
  if (pointerType !== 'touch') {
    return false;
  }

  markSceneObjectTouchDown(now);
  return true;
}

export function wasSceneObjectTouchDownRecent(now = Date.now()) {
  return now - _sceneObjectTouchDownTime < TOUCH_DOWN_GUARD_MS;
}

export function markFrustumTouchDown(now = Date.now()) {
  markSceneObjectTouchDown(now);
}

export function wasFrustumTouchDownRecent(now = Date.now()) {
  return wasSceneObjectTouchDownRecent(now);
}

/**
 * Active touch pointers on the scene, maintained by useSceneContextMenuController
 * (the container sees every scene touch via bubbling). Mesh-level long-press
 * timers cannot see fingers on other meshes; they gate on this instead: a
 * long-press may only fire while it is the lone active touch pointer.
 */
let _activeSceneTouchPointers = 0;

export function setActiveSceneTouchPointerCount(count: number) {
  _activeSceneTouchPointers = count;
}

export function getActiveSceneTouchPointerCount(): number {
  return _activeSceneTouchPointers;
}

export function isSingleActiveSceneTouchPointer(): boolean {
  return _activeSceneTouchPointers === 1;
}

export function resetFrustumTouchGuards() {
  _frustumTapTime = Number.NEGATIVE_INFINITY;
  _sceneObjectTouchDownTime = Number.NEGATIVE_INFINITY;
  _activeSceneTouchPointers = 0;
}
