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
verified against a real dataset. Check, with a panorama whose content you know:

- [ ] **Upright:** sky/ceiling at the top pole, ground at the bottom pole (not
      upside-down).
- [ ] **Not mirror-flipped:** text or signage in the panorama reads correctly.
      (An outside view of a FrontSide sphere can show the image mirrored
      depending on UV handedness — this is the most likely defect.)
- [ ] **Azimuth plausible:** the panorama's forward direction roughly agrees with
      the camera's orientation relative to the reconstruction (e.g. what the
      camera "faced" lines up with the point cloud).
- [ ] **Seam:** the equirect wrap seam is a single vertical line, not a smear or
      a gap.
- [ ] **Colors match:** the photosphere's colors match the flat image previews of
      pinhole cameras (same tone mapping / color space; no washed-out or
      double-gamma look).

**If orientation is wrong:** the fix point is documented in
`src/components/viewer3d/Photosphere.tsx` (JSDoc) — rotation / UV flip is a
one-spot change there.

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

- Immersive inside-the-sphere view (seam documented in `Photosphere.tsx`).
- Hover-brightening of grid spheres.
- Ultra-narrow portrait windows (aspect < 0.25) can clip the sphere's silhouette
  via the pre-existing FOV clamp.
