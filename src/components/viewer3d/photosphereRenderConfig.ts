/**
 * Depth/order flags for the photosphere mesh + material, keyed on the background mode.
 *
 * Kept as a pure module (not inline in Photosphere.tsx) so the spec-load-bearing
 * "background ⇒ non-occluding" contract is unit-pinned without a WebGL renderer, and
 * so the component file only exports a component (react-refresh constraint).
 */
export interface PhotosphereRenderConfig {
  /** Mesh draw order: background draws first (before points/scene). */
  renderOrder: number;
  /** Depth write: background writes no depth so nothing is occluded behind it. */
  depthWrite: boolean;
  /** Depth test: background ignores the depth buffer and always draws. */
  depthTest: boolean;
}

/**
 * When `background` is true the viewer is INSIDE the photosphere (U undistortion flew to
 * the capture center): the sphere must never hide the points/scene, so it draws first
 * (renderOrder −1) and ignores depth entirely. Off (default) is the opaque, depth-tested
 * inspection sphere seen from outside.
 */
export function getPhotosphereRenderConfig(background: boolean): PhotosphereRenderConfig {
  return background
    ? { renderOrder: -1, depthWrite: false, depthTest: false }
    : { renderOrder: 0, depthWrite: true, depthTest: true };
}
