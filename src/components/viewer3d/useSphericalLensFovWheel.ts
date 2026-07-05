import { useEffect, type MutableRefObject } from 'react';
import { getWheelAdjustedFov } from './cameraFrustumViewModel';

interface SphericalLensFovWheelControls {
  wheelHandled?: MutableRefObject<boolean>;
}

interface SphericalLensFovWheelOptions {
  /** Selected spherical camera with (U) undistortion on — the sphere renders as the lens. */
  enabled: boolean;
  cameraProjection: string;
  cameraFov: number;
  setCameraFov: (fov: number) => void;
  /**
   * The R3F canvas element. The capture-phase listener lives on `window` (an ancestor of the
   * whole document), so it also sees wheels over side panels, modals and browser chrome. Those
   * must never be hijacked: R3F leaves state.pointer stale after the cursor leaves the canvas,
   * so the pointerInsideLens gate below can still read true. We therefore reject any wheel whose
   * target is not the canvas (or a descendant of it).
   */
  domElement: HTMLElement;
  /**
   * Live lens gate, written each frame by the Photosphere's useFrame:
   *  - `pointerInsideLens` — eye inside the sphere AND pointer inside the lens circle.
   *  - `lensActive` — the lens is showing at all (eye inside the sphere), regardless of where
   *    the pointer sits.
   * Together they route the wheel: INSIDE the circle changes fov in place; lens active but the
   * pointer OUTSIDE the circle while scrolling out exits the immersive view; otherwise the wheel
   * falls through to the trackball's own dolly handler.
   */
  lensPointerStateRef: MutableRefObject<{ pointerInsideLens: boolean; lensActive: boolean }>;
  /**
   * Called to leave the immersive lens — deselect the camera (U undistortion stays ON so the
   * next selected camera comes up undistorted). Fired when the user scrolls OUT
   * with the pointer outside the lens circle: the eye is parked at the tiny capture-center
   * distance where a plain dolly barely moves, so we bail out of the whole immersive view in one
   * gesture instead of crawling backwards.
   */
  onExit: () => void;
  controls?: SphericalLensFovWheelControls;
}

/**
 * Scroll-to-zoom the panorama lens by FOV, mirroring useSelectedFrustumFovWheel.
 *
 * Inside the circular ground-truth lens, scrolling must change the camera FOV (zoom in
 * place) rather than dolly the eye: the panorama and the reconstruction stay pixel-aligned
 * only while the eye sits at the capture center (fov merely scales direction→pixel for BOTH
 * the sphere and the 3D geometry). Dollying would move the eye off center and break the
 * overlay, eventually ejecting outside the sphere. So we ONLY touch cameraFov here — never
 * the camera position/distance.
 *
 * Like the frustum hook, this installs a capture-phase window wheel listener and sets
 * controls.wheelHandled so the trackball's canvas wheel handler bails (see
 * useTrackballWheelHandlers). The per-event lens gate routes each on-canvas wheel to one of
 * three outcomes:
 *   1. Pointer INSIDE the lens circle → change cameraFov in place (zoom without dollying).
 *   2. Lens active but pointer OUTSIDE the circle and scrolling OUT (deltaY > 0) → onExit():
 *      leave the immersive view (deselect; U stays on). From the capture-center distance
 *      a plain dolly barely moves, so this is the fast way out.
 *   3. Anything else (scroll IN outside the circle, or the eye already outside the sphere) →
 *      return without preventing default so the wheel falls through to the trackball dolly.
 */
export function useSphericalLensFovWheel({
  enabled,
  cameraProjection,
  cameraFov,
  setCameraFov,
  domElement,
  lensPointerStateRef,
  onExit,
  controls,
}: SphericalLensFovWheelOptions): void {
  useEffect(() => {
    if (!enabled || cameraProjection !== 'perspective') return;

    const handleWheel = (e: WheelEvent) => {
      // Off-canvas wheels (side panels, modals, browser chrome) must never be hijacked:
      // R3F leaves state.pointer stale after the cursor leaves the canvas, so the
      // pointerInsideLens gate can read true even when scrolling a panel. Only act on
      // wheels whose target is the canvas (or a descendant).
      if (!(e.target instanceof Node) || !domElement.contains(e.target)) return;

      // Inside the lens circle: change fov in place (zoom without dollying), marking the
      // event handled so the trackball canvas handler bails.
      if (lensPointerStateRef.current.pointerInsideLens) {
        e.preventDefault();
        e.stopPropagation();
        if (controls?.wheelHandled) {
          controls.wheelHandled.current = true;
        }
        setCameraFov(getWheelAdjustedFov(cameraFov, e.deltaY));
        return;
      }

      // Lens showing but the pointer is OUTSIDE the circle and the user scrolls OUT
      // (deltaY > 0): the eye is parked at the tiny capture-center distance where a dolly
      // barely moves it, so leave the immersive view in one gesture instead (onExit:
      // deselect; U stays on). Mark handled so the trackball dolly never also fires.
      if (lensPointerStateRef.current.lensActive && e.deltaY > 0) {
        e.preventDefault();
        e.stopPropagation();
        if (controls?.wheelHandled) {
          controls.wheelHandled.current = true;
        }
        onExit();
        return;
      }

      // Otherwise (scroll IN outside the circle, or the eye already outside the sphere): let
      // the event fall through to the trackball canvas handler so it dollies exactly as before
      // (no preventDefault, no stopPropagation, no wheelHandled flag).
    };

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true });
  }, [enabled, cameraProjection, cameraFov, setCameraFov, domElement, lensPointerStateRef, onExit, controls]);
}
