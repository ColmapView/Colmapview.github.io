# Spherical Camera Rendering — Manual Visual Check

The `feature/spherical-camera-rendering` branch is code-complete and reviewed, but
jsdom tests cannot execute WebGL: panorama **orientation** and on-GPU compositing
need one human pass with a real EQUIRECTANGULAR dataset before the branch merges.
This is the checklist for that pass.

**Setup:** `npm run dev`, load a COLMAP reconstruction containing EQUIRECTANGULAR
(model 17) cameras — ideally a mixed dataset that also has pinhole cameras.
The registered images should be 2:1 equirectangular panoramas.

## 1. Fly-to and framing (the T8 fix)

- [ ] Click a spherical camera (its grid sphere / hit sphere). The viewer must fly
      to a point **outside** the sphere (2.5× its radius), looking at its center —
      with auto-FOV enabled the sphere frames at roughly ~87–89% of the viewport
      height. **Regression to watch:** landing *inside* an invisible sphere (only
      grid lines visible, panorama nowhere) — that was the bug; it must not
      reproduce.
- [ ] Orbiting after selection pivots around the sphere's center.
- [ ] Selecting a *pinhole* camera still flies into it exactly as before (see
      through the camera). Nothing about pinhole fly-to may have changed.

## 2. Photosphere orientation (the open unknown — the main reason for this check)

The photosphere textures the selected camera's equirect image onto the sphere,
viewed from outside (`THREE.FrontSide`). The mapping convention has **not** been
verified against a real dataset. Check, with a panorama whose content you know.

STATUS 2026-07-02: all items below were verified live (campus parterre, 37
panos, + the labeled synthetic card) after two convention fixes — the sphere
is built with `phiStart = −π/2` so the image-center column faces camera
forward (COLMAP convention; stock three.js puts it at +X, a 90° azimuth
rotation), and the selected photosphere renders BackSide (look through at the
far inner wall — reads un-mirrored, tracks the view). Keep this list for
regressions:

- [x] **Upright:** sky/ceiling toward scene-up, ground toward scene-down
      (validated; the vertical mapping is algebraically identical to COLMAP's
      latitude convention under flipY=false textures).
- [x] **Azimuth:** the panorama's content directions match the points (image
      center = camera forward; verified with the labeled synthetic card —
      bands land on the matching colored axis points).
- [x] **Seam:** a single clean vertical line at camera-back.
- [x] **Colors match** the flat pinhole previews (same color-space handling).

### (U) step inside the panorama

Pressing **U** with a spherical camera selected flies the viewer INSIDE the
photosphere to the capture center C and renders the panorama as a non-occluding
background (BackSide sphere, depth test/write off, drawn first). At C the eye
coincides with the camera that captured the panorama, so every 3D point overlays
its imagery **exactly** — at every depth and every look direction — with zero
parallax. This is the point-cloud-overlay mode, and it is exact where the old
portal disk could only be exact at one anchor depth. Check:

- [ ] On U (spherical selected) the viewer dives to the sphere center; the
      panorama surrounds the scene and the points sit exactly on their imagery,
      staying glued while you look around (orbit) from the center.
- [ ] Zooming OUT while inside pulls the eye off-center and **progressively
      reintroduces parallax** (points begin to drift off their imagery) —
      expected; it is the single-viewpoint limit. Zoom back in / re-press U to
      recenter.
- [ ] U off pops back to the outside inspection stop (2.5× radius, opaque
      BackSide sphere). Toggling U with a spherical camera selected re-flies
      between inside/outside; pinhole cameras are unaffected by U's fly-to (U
      only swaps their plane material).
- [ ] The panorama background never occludes the point cloud or scene from
      inside; the grid sphere lines stay visible (fine).

**Convention anchors (do not "fix" without re-running this check):**
`getImageWorldQuaternion` returns the RAW COLMAP cam-to-world rotation (no
axis flip); frustum textures load with `flipY=false`; the equirect UV formula
and sphere geometry are pinned to each other vertex-for-vertex by
`sphericalUndistortion.test.ts`.

## 3. Grid spheres in a mixed scene

- [ ] Unselected spherical cameras render as lat/long grid spheres alongside
      pinhole frustums; poles look clean (no spikes), sphere size follows the
      camera-size slider.
- [ ] Dragging the camera-size slider is smooth with many spherical cameras
      (hit-target geometry no longer rebuilds per tick; the visible grid lines
      still rebuild — pre-existing, matching pinhole — so judge smoothness
      directly).
- [ ] With a camera selected, unselected grid spheres **dim** to the same
      opacity as unselected pinhole frustums; with nothing selected they use the
      standby opacity (T11). Known nuance: a one-frame full-opacity flash on
      first mount is possible; hovering a sphere does not brighten it (pinhole
      does — deferred for v1).
- [ ] Hovering a spherical camera never shows the flat image hover-preview
      (that stays pinhole-only); hover/click still select the right camera
      (T10 rewired picking — verify a few, including after deleting one).

## 4. PSNR notifications (T9), mixed dataset with a splat loaded

- [ ] On load/auto-compute: one info toast — `Skipped N spherical image(s) for
      PSNR; only pinhole cameras are supported.` N = spherical *images* (not
      cameras). It appears once; transforming the scene or changing selection
      must not re-toast.
- [ ] PSNR values still appear for pinhole cameras.

## 5. Sanity extras

- [ ] Sim3D transform / scale moves and scales grid spheres + photosphere
      consistently with everything else.
- [ ] Deleting the selected spherical image while its photosphere is shown:
      photosphere disappears, no crash.
- [ ] Non-2:1 equirect images will stretch to fit the sphere (known/accepted);
      confirm your datasets are 2:1.

## Explicitly deferred (do not fail the check for these)

- Panorama seam: a single hairline column at camera-back can show when looking
  across the seam from inside (documented in `Photosphere.tsx`); accepted for v1.
- Hover-brightening of grid spheres.
- Ultra-narrow portrait windows (aspect < 0.25) can clip the sphere's silhouette
  via the pre-existing FOV clamp.
