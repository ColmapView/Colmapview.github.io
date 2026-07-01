# Distortion Model Manual GPU Check

This document describes the manual GPU visual checks required to validate the distortion model hardening effort (Tasks 1–11). Automated tests (`undistortionParity.test.ts`) guarantee that the GLSL transcription matches the CPU canonical implementation, but this manual check confirms that the executed shader (single-precision GPU) renders correctly on real hardware.

## Prerequisites

- `npm run dev` running locally at `http://localhost:5173`
- Test reconstructions with cameras of each model type (see dataset suggestions below)
- Enable **Undistortion** in the UI (full-frame and cropped modes)

## Test Cases

### 1. Regression: OPENCV / FULL_OPENCV (Existing Models)

**Objective:** Verify no visual regression for pre-existing distortion models.

1. Load a reconstruction with an **OPENCV** or **FULL_OPENCV** camera.
2. Enable **Undistortion** and switch between **full-frame** and **cropped** modes.
3. Verify that:
   - The undistorted image plane looks identical to the version before this change.
   - No distortion artifacts appear.
   - Edge handling (vignetting/off-axis behavior) is smooth.

**Dataset:** Any standard COLMAP reconstruction using OPENCV intrinsics.

---

### 2. Model-11 Fix: RAD_TAN_THIN_PRISM_FISHEYE

**Objective:** Confirm that the RAD_TAN_THIN_PRISM_FISHEYE model now renders properly undistorted images (previously it rendered the raw distorted image).

1. Load a reconstruction with a **RAD_TAN_THIN_PRISM_FISHEYE** camera.
2. Enable **Undistortion**.
3. Verify that:
   - The image plane shows the undistorted image (corrected perspective).
   - Prism distortion (tangential) is removed.
   - The image is no longer raw/identity-mapped.

**Known Limitation:** The full-frame vertex-shader inverse for RAD_TAN is a simplified fixed-point approximation. Fisheye models (including RAD_TAN_THIN_PRISM_FISHEYE) downgrade to cropped mode; this is expected behavior.

**Dataset:** COLMAP reconstruction with RAD_TAN_THIN_PRISM_FISHEYE intrinsics.

---

### 3. New Models: EUCM, DIVISION

**Objective:** Verify that newly added distortion models render correctly undistorted image planes.

#### 3a. EUCM (Extended Unified Camera Model)

1. Load a reconstruction with an **EUCM** camera.
2. Enable **Undistortion** (cropped mode expected).
3. Verify that:
   - The undistorted image shows a geometrically correct perspective.
   - The image is not raw or identity-mapped.
   - Radial distortion is properly removed.

#### 3b. DIVISION

1. Load a reconstruction with a **DIVISION** camera.
2. Enable **Undistortion** (cropped mode expected).
3. Verify that:
   - The undistorted image shows the corrected perspective.
   - The division-model radial distortion is removed.
   - The image is not raw or identity-mapped.

**Dataset:** Custom test reconstructions with EUCM or DIVISION intrinsics, or convert existing datasets using COLMAP model conversion tools.

---

### 4. Fisheye Models: SIMPLE_FISHEYE, FISHEYE

**Objective:** Confirm that SIMPLE_FISHEYE and FISHEYE models now undistort correctly (previously they were silently identity in GLSL).

1. Load a reconstruction with a **SIMPLE_FISHEYE** or **FISHEYE** camera.
2. Enable **Undistortion** (cropped mode expected).
3. Verify that:
   - The image shows a properly undistorted perspective (typically rectilinear from fisheye).
   - Fisheye barrel distortion is removed.
   - The image is not raw or identity-mapped.

**Dataset:** Fisheye camera reconstructions from COLMAP or standard fisheye datasets.

---

## Parity Check

- The automated contract test `undistortionParity.test.ts` verifies that the GLSL transcription matches the TypeScript canonical implementation.
- This manual check confirms that **executed GPU code** (single-precision, real hardware) also matches expectations.
- If visual quality differs from the canonical TS implementation, suspect single-precision rounding or GPU vendor-specific math function differences.

---

## Known Limitations

1. **RAD_TAN full-frame vertex-shader inverse:** Uses a simplified fixed-point approximation. Fisheye models (which include RAD_TAN_THIN_PRISM_FISHEYE) downgrade to cropped mode to avoid this approximation.

2. **Cropped vs. Full-Frame:** Most new models (EUCM, DIVISION, SIMPLE_FISHEYE, FISHEYE) use cropped-mode undistortion. Full-frame undistortion is reserved for classical models (OPENCV, FULL_OPENCV, PINHOLE).

---

## Reporting Issues

If any test case fails:

1. Note the camera model and reconstructionDataset name.
2. Screenshot the undistorted and distorted images side-by-side.
3. Check the browser console for shader compilation errors or WebGL warnings.
4. Verify that the `undistortionParity.test.ts` contract test still passes (canonical TS ↔ GLSL transcription parity).
5. If the contract test passes but GPU output differs, suspect GPU vendor-specific precision or math library behavior.

---

## Summary Checklist

- [ ] OPENCV/FULL_OPENCV: no visual regression, undistortion works as before
- [ ] RAD_TAN_THIN_PRISM_FISHEYE: now shows undistorted image (previously raw)
- [ ] EUCM: undistorted image renders correctly (not identity)
- [ ] DIVISION: undistorted image renders correctly (not identity)
- [ ] SIMPLE_FISHEYE: undistorted image renders correctly (previously identity in GLSL)
- [ ] FISHEYE: undistorted image renders correctly (previously identity in GLSL)
- [ ] All checks completed with no WebGL errors in console
