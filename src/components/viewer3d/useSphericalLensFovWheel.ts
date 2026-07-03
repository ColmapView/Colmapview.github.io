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
   * Live pointer-in-lens gate, written each frame by the Photosphere's useFrame. True ONLY
   * while the eye is inside the sphere AND the pointer is inside the lens circle — so a wheel
   * INSIDE the circle changes fov in place, while a wheel OUTSIDE it falls through to the
   * trackball's own dolly handler (which is how you zoom back out of the sphere).
   */
  lensPointerStateRef: MutableRefObject<{ pointerInsideLens: boolean }>;
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
 * useTrackballWheelHandlers). The per-event pointer-in-lens gate is what keeps scroll
 * OUTSIDE the circle on the normal dolly/exit path (we return without preventing default).
 */
export function useSphericalLensFovWheel({
  enabled,
  cameraProjection,
  cameraFov,
  setCameraFov,
  lensPointerStateRef,
  controls,
}: SphericalLensFovWheelOptions): void {
  useEffect(() => {
    if (!enabled || cameraProjection !== 'perspective') return;

    const handleWheel = (e: WheelEvent) => {
      // Outside the lens circle: let the event fall through to the trackball canvas
      // handler so it dollies / exits the sphere exactly as before (no preventDefault,
      // no stopPropagation, no wheelHandled flag).
      if (!lensPointerStateRef.current.pointerInsideLens) return;

      e.preventDefault();
      e.stopPropagation();
      if (controls?.wheelHandled) {
        controls.wheelHandled.current = true;
      }
      setCameraFov(getWheelAdjustedFov(cameraFov, e.deltaY));
    };

    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true });
  }, [enabled, cameraProjection, cameraFov, setCameraFov, lensPointerStateRef, controls]);
}
