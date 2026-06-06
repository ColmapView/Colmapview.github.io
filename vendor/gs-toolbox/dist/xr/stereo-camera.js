// Stereo Camera Math
// ==================
// Pure math utilities for computing per-eye view/projection matrices
// from a mono camera. No GPU state — only Float32Array operations.
//
// Two methods are supported:
//
// **Offset** (default, recommended for VR):
//   Translates the view matrix ±IPD/2 along the camera right axis and
//   applies an asymmetric frustum shift to the projection matrix. This
//   preserves parallel view axes and is the standard for VR headsets.
//
// **Toe-in** (alternative):
//   Translates the eye position and rotates the view to converge at a
//   given distance. Simpler but causes vertical parallax distortion.
//
// Usage (non-WebXR stereo preview):
// ```typescript
// const eyes = computeStereoEyes(viewMatrix, projMatrix, camPos, { ipd: 0.063 });
// // Use eyes.left / eyes.right for dual-eye rendering
// ```
//
// In real WebXR, the runtime provides per-eye matrices directly via
// XRView.transform and XRView.projectionMatrix — use those instead.
/**
 * Compute per-eye matrices for a single eye offset from the mono camera.
 *
 * @param viewMatrix - Mono 4x4 view matrix (column-major)
 * @param projMatrix - Mono 4x4 projection matrix (column-major)
 * @param camPos - Mono camera world position
 * @param eyeOffset - Signed offset along right axis (negative=left, positive=right)
 * @param convergence - Convergence distance for frustum shift (Infinity=parallel)
 * @returns Per-eye camera matrices
 */
export function computeEyeMatrices(viewMatrix, projMatrix, camPos, eyeOffset, convergence) {
    // Extract camera right vector from view matrix column 0
    // View matrix is column-major: column 0 = [m0, m1, m2, m3]
    // The right vector in world space is the first row of the 3x3 rotation part
    const rightX = viewMatrix[0];
    const rightY = viewMatrix[4];
    const rightZ = viewMatrix[8];
    // Translate view matrix by eyeOffset along right axis
    // The right vector in world space is row 0 of V: [V[0], V[4], V[8]].
    // The view-space translation is -R * (t + d) = -R*t - eyeOffset * R * right_world.
    // Since R's rows are orthonormal and right_world IS row 0: R * right_world = [1,0,0].
    // Therefore only element [12] changes.
    const eyeView = new Float32Array(viewMatrix);
    eyeView[12] -= eyeOffset;
    // Apply asymmetric frustum shift to projection matrix
    const eyeProj = new Float32Array(projMatrix);
    if (isFinite(convergence) && convergence > 0) {
        // Shift = eyeOffset / convergence, applied to projection matrix element [2][0]
        // In column-major, element (2,0) is at index 8
        eyeProj[8] += eyeOffset / convergence;
    }
    // Compute per-eye world position
    const eyeCamPos = [
        camPos[0] + rightX * eyeOffset,
        camPos[1] + rightY * eyeOffset,
        camPos[2] + rightZ * eyeOffset,
    ];
    return { viewMatrix: eyeView, projMatrix: eyeProj, camPos: eyeCamPos };
}
/**
 * Compute per-eye matrices using toe-in method.
 *
 * Translates the eye position and rotates the view to converge at the
 * given distance. The projection matrix is unchanged.
 */
function computeEyeMatricesToeIn(viewMatrix, projMatrix, camPos, eyeOffset, convergence) {
    // Extract camera axes from view matrix
    const rightX = viewMatrix[0];
    const rightY = viewMatrix[4];
    const rightZ = viewMatrix[8];
    const forwardX = -viewMatrix[2];
    const forwardY = -viewMatrix[6];
    const forwardZ = -viewMatrix[10];
    // Compute eye world position
    const eyeCamPos = [
        camPos[0] + rightX * eyeOffset,
        camPos[1] + rightY * eyeOffset,
        camPos[2] + rightZ * eyeOffset,
    ];
    // Compute convergence target (point on the forward axis at convergence distance)
    const convDist = isFinite(convergence) && convergence > 0 ? convergence : 1000;
    const targetX = camPos[0] + forwardX * convDist;
    const targetY = camPos[1] + forwardY * convDist;
    const targetZ = camPos[2] + forwardZ * convDist;
    // Build lookAt view matrix for this eye
    const eyeView = lookAt(eyeCamPos, [targetX, targetY, targetZ], [0, 1, 0]);
    return { viewMatrix: eyeView, projMatrix: new Float32Array(projMatrix), camPos: eyeCamPos };
}
/**
 * Compute stereo eye matrices from a mono camera.
 *
 * @param viewMatrix - Mono 4x4 view matrix (column-major, 16 floats)
 * @param projMatrix - Mono 4x4 projection matrix (column-major, 16 floats)
 * @param camPos - Mono camera world position [x, y, z]
 * @param options - Stereo options (IPD, convergence, method)
 * @returns Left and right eye matrices
 */
export function computeStereoEyes(viewMatrix, projMatrix, camPos, options) {
    const ipd = options?.ipd ?? 0.063;
    const convergence = options?.convergence ?? Infinity;
    const method = options?.method ?? 'offset';
    const halfIPD = ipd / 2;
    const computeFn = method === 'toe-in' ? computeEyeMatricesToeIn : computeEyeMatrices;
    return {
        left: computeFn(viewMatrix, projMatrix, camPos, -halfIPD, convergence),
        right: computeFn(viewMatrix, projMatrix, camPos, halfIPD, convergence),
    };
}
/** Build a column-major 4x4 lookAt view matrix. */
function lookAt(eye, target, up) {
    // Forward = normalize(target - eye)
    let fx = target[0] - eye[0];
    let fy = target[1] - eye[1];
    let fz = target[2] - eye[2];
    const fLen = Math.sqrt(fx * fx + fy * fy + fz * fz);
    fx /= fLen;
    fy /= fLen;
    fz /= fLen;
    // Right = normalize(forward x up)
    let rx = fy * up[2] - fz * up[1];
    let ry = fz * up[0] - fx * up[2];
    let rz = fx * up[1] - fy * up[0];
    const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
    rx /= rLen;
    ry /= rLen;
    rz /= rLen;
    // True up = right x forward
    const ux = ry * fz - rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy - ry * fx;
    // Column-major view matrix (OpenGL convention: camera looks along -Z)
    const m = new Float32Array(16);
    m[0] = rx;
    m[4] = ry;
    m[8] = rz;
    m[12] = -(rx * eye[0] + ry * eye[1] + rz * eye[2]);
    m[1] = ux;
    m[5] = uy;
    m[9] = uz;
    m[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
    m[2] = -fx;
    m[6] = -fy;
    m[10] = -fz;
    m[14] = (fx * eye[0] + fy * eye[1] + fz * eye[2]);
    m[3] = 0;
    m[7] = 0;
    m[11] = 0;
    m[15] = 1;
    return m;
}
