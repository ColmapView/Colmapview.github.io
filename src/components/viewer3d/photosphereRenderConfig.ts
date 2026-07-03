/**
 * Depth/order flags for the photosphere mesh + material, keyed on the background mode.
 *
 * Kept as a pure module (not inline in Photosphere.tsx) so the spec-load-bearing
 * "background ⇒ crop lens" contract is unit-pinned without a WebGL renderer, and
 * so the component file only exports a component (react-refresh constraint).
 */
export interface PhotosphereRenderConfig {
  /** Whether the mesh is rendered this frame. false = the mesh is skipped (mesh.visible = false). */
  visible: boolean;
  /** Mesh draw order. */
  renderOrder: number;
  /** Depth write: the crop lens writes no depth so it never occludes via the depth buffer. */
  depthWrite: boolean;
  /** Depth test: the crop lens ignores the depth buffer and always draws. */
  depthTest: boolean;
  /**
   * Whether the material joins the transparent render pass. The crop lens is transparent
   * so it sorts AFTER in-scene (Spark) splats — which are transparent — and can therefore
   * cover them inside the circle (an opaque photosphere would always be drawn before the
   * transparent pass and so could never cover them). See photosphereCropShader.ts.
   */
  transparent: boolean;
}

/**
 * Draw order for the panorama crop lens when the viewer is INSIDE the photosphere.
 *
 * Above the in-scene splats (SPARK_SPLAT_RENDER_ORDER = 2) and the splat point overlay
 * (SPLAT_POINT_OVERLAY_RENDER_ORDER = 3) so the photo covers them inside the circle, yet
 * below the camera-match overlays / gizmo (renderOrder 999) so those keep drawing on top.
 * This is the single render-order knob for the lens (Photosphere.test.ts pins the bounds).
 */
export const PANORAMA_CROP_RENDER_ORDER = 4;

/**
 * Draw order for the non-occluding backdrop: U mode is on but the eye has moved OUTSIDE
 * the sphere (e.g. zoomed out from inside). Drawn before everything and writing no depth,
 * the panorama can never cover scene content from out there — the lens would otherwise
 * float as a screen-locked photo disk over the scene.
 */
export const PANORAMA_BACKDROP_RENDER_ORDER = -1;

/**
 * Three states:
 * - `background && insideSphere` — the viewer stands at/near the capture center
 *   (U undistortion flew inside): render the viewport-centered circular ground-truth
 *   lens. INSIDE the circle the panorama photo wins; OUTSIDE, the crop shader discards
 *   so the live scene (gaussian splats / points) shows through — the circle boundary is
 *   a direct ground-truth-vs-reconstruction seam. Draws late (above the splats), ignores
 *   depth, and is transparent so it can cover the transparent-pass Spark splats.
 * - `background && !insideSphere` — U (undistorted) still on but the eye is OUTSIDE the
 *   sphere: the photosphere is HIDDEN (visible: false). Because a right-click fly-to keeps
 *   the camera outside the target sphere for the whole flight — and a zoom-out leaves it
 *   outside too — hiding here means neither ever flashes the full uncropped panorama on the
 *   sphere surface. Only the circular crop shows, and only from inside; zooming/flying back
 *   in re-engages the lens. (This intentionally replaces the previous non-occluding-backdrop
 *   behavior.) The other returned fields are moot while hidden and kept as-is to avoid churn.
 * - `!background` — the opaque, depth-tested inspection sphere seen from outside.
 */
export function getPhotosphereRenderConfig(
  background: boolean,
  insideSphere: boolean
): PhotosphereRenderConfig {
  if (!background) {
    return { visible: true, renderOrder: 0, depthWrite: true, depthTest: true, transparent: false };
  }
  if (insideSphere) {
    return {
      visible: true,
      renderOrder: PANORAMA_CROP_RENDER_ORDER,
      depthWrite: false,
      depthTest: false,
      transparent: true,
    };
  }
  return {
    visible: false,
    renderOrder: PANORAMA_BACKDROP_RENDER_ORDER,
    depthWrite: false,
    depthTest: false,
    transparent: false,
  };
}
