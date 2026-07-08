import { TOUCH } from '../../theme/sizing';
import {
  FRUSTUM_TOUCH_TAP_MAX_DISTANCE_SQUARED,
  getSquaredTouchTravel,
} from './frustumPlaneTouchPolicy';
import { isSingleActiveSceneTouchPointer } from './frustumTouchGuards';

export interface FrustumLongPressHandle {
  readonly startX: number;
  readonly startY: number;
  readonly fired: boolean;
  cancel(): void;
}

/**
 * Long-press tracker for frustum hit targets. Listens on window (per-mesh
 * pointermove is unreliable during orbit and costs a raycast per move):
 * - moves of the armed pointer beyond the tap radius cancel the press;
 * - window pointerup/pointercancel of the armed pointer cancels it;
 * - at fire time the press only fires while it is the scene's lone active
 *   touch pointer (see frustumTouchGuards), so pinches and OS-cancelled
 *   gestures can never pop a menu or modal.
 */
export function armFrustumLongPress({
  pointerId,
  x,
  y,
  onFire,
  delayMs = TOUCH.longPressDelay,
  maxTravelSquared = FRUSTUM_TOUCH_TAP_MAX_DISTANCE_SQUARED,
}: {
  pointerId: number;
  x: number;
  y: number;
  onFire: () => void;
  delayMs?: number;
  maxTravelSquared?: number;
}): FrustumLongPressHandle {
  let fired = false;
  let cancelled = false;

  const onWindowPointerMove = (event: Event) => {
    const pointer = event as PointerEvent;
    if (pointer.pointerId !== pointerId) return;
    const travel = getSquaredTouchTravel({ x, y }, { x: pointer.clientX, y: pointer.clientY });
    if (travel > maxTravelSquared) cancel();
  };
  const onWindowPointerEnd = (event: Event) => {
    if ((event as PointerEvent).pointerId !== pointerId) return;
    cancel();
  };

  const detach = () => {
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerEnd);
    window.removeEventListener('pointercancel', onWindowPointerEnd);
  };

  const timer = setTimeout(() => {
    detach();
    if (cancelled || !isSingleActiveSceneTouchPointer()) return;
    fired = true;
    onFire();
  }, delayMs);

  function cancel() {
    if (cancelled) return;
    cancelled = true;
    clearTimeout(timer);
    detach();
  }

  window.addEventListener('pointermove', onWindowPointerMove);
  window.addEventListener('pointerup', onWindowPointerEnd);
  window.addEventListener('pointercancel', onWindowPointerEnd);

  return {
    startX: x,
    startY: y,
    get fired() {
      return fired;
    },
    cancel,
  };
}
