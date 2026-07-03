/**
 * Depth/order flags for the photosphere mesh + material, keyed on the background mode.
 *
 * Kept as a pure module (not inline in Photosphere.tsx) so the spec-load-bearing
 * "background ⇒ crop lens" contract is unit-pinned without a WebGL renderer, and
 * so the component file only exports a component (react-refresh constraint).
 */
export interface PhotosphereRenderConfig {
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
 * When `background` is true the viewer is INSIDE the photosphere (U undistortion flew to
 * the capture center): the sphere renders as a viewport-centered circular ground-truth
 * lens. INSIDE the circle the panorama photo wins; OUTSIDE, the crop shader discards so
 * the live scene (gaussian splats / points) shows through — the circle boundary is a
 * direct ground-truth-vs-reconstruction seam. The lens draws late (renderOrder above the
 * splats), ignores depth, and is transparent so it can cover the transparent-pass splats.
 * Off (default) is the opaque, depth-tested inspection sphere seen from outside.
 */
export function getPhotosphereRenderConfig(background: boolean): PhotosphereRenderConfig {
  return background
    ? {
        renderOrder: PANORAMA_CROP_RENDER_ORDER,
        depthWrite: false,
        depthTest: false,
        transparent: true,
      }
    : { renderOrder: 0, depthWrite: true, depthTest: true, transparent: false };
}
