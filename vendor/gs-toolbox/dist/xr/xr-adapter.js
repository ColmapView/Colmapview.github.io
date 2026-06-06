// XR Adapter
// ===========
// Stateless bridge from WebXR types to the existing EyeMatrices/StereoEyes
// interfaces. Pure math, no GPU state.
//
// Uses structural interfaces (no dependency on @types/webxr) so the library
// itself stays free of WebXR type dependencies. Consumers pass real WebXR
// objects which satisfy these structural types.
// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------
/**
 * Compute the inverse of a rigid-body transform (rotation + translation).
 *
 * XRRigidTransform.matrix gives world-from-eye; we need eye-from-world
 * (the view matrix). For a rigid body matrix [R|t], the inverse is [R^T | -R^T * t].
 *
 * @param m - 4x4 column-major rigid body transform
 * @returns 4x4 column-major inverse
 */
export function invertRigidBodyTransform(m) {
    const out = new Float32Array(16);
    // Transpose the 3x3 rotation part
    out[0] = m[0];
    out[1] = m[4];
    out[2] = m[8];
    out[4] = m[1];
    out[5] = m[5];
    out[6] = m[9];
    out[8] = m[2];
    out[9] = m[6];
    out[10] = m[10];
    // Translation: -R^T * t
    const tx = m[12], ty = m[13], tz = m[14];
    out[12] = -(out[0] * tx + out[4] * ty + out[8] * tz);
    out[13] = -(out[1] * tx + out[5] * ty + out[9] * tz);
    out[14] = -(out[2] * tx + out[6] * ty + out[10] * tz);
    // Homogeneous row
    out[3] = 0;
    out[7] = 0;
    out[11] = 0;
    out[15] = 1;
    return out;
}
/**
 * Extract focal lengths from a projection matrix.
 *
 * @param projMatrix - 4x4 column-major projection matrix
 * @param width - Viewport width in pixels
 * @param height - Viewport height in pixels
 * @returns Focal lengths in pixel units
 */
export function extractFocalLengths(projMatrix, width, height) {
    return {
        focalX: projMatrix[0] * width / 2,
        focalY: projMatrix[5] * height / 2,
    };
}
/**
 * Extract near and far clip planes from a perspective projection matrix.
 *
 * Assumes WebGPU-style projection where depth maps to [0,1].
 * Does NOT work with OpenGL-style [-1,1] depth range.
 *
 * Formula: near = p[14] / p[10], far = p[14] / (p[10] + 1)
 *
 * @param projMatrix - 4x4 column-major perspective projection matrix
 * @returns Near and far clip plane distances
 */
export function extractClipPlanes(projMatrix) {
    const p10 = projMatrix[10];
    const p14 = projMatrix[14];
    const farDenom = p10 + 1;
    return {
        near: p14 / p10,
        far: Math.abs(farDenom) < 1e-7 ? Infinity : p14 / farDenom,
    };
}
/**
 * Convert an XR view to EyeMatrices.
 *
 * @param view - XR view (structural type, compatible with XRView)
 * @returns EyeMatrices with viewMatrix, projMatrix, and camPos
 */
export function xrViewToEyeMatrices(view) {
    const viewMatrix = invertRigidBodyTransform(view.transform.matrix);
    const projMatrix = new Float32Array(view.projectionMatrix);
    const pos = view.transform.position;
    const camPos = [pos.x, pos.y, pos.z];
    return { viewMatrix, projMatrix, camPos };
}
/**
 * Convert an XR viewer pose to stereo eye matrices.
 *
 * Finds the left and right views by `view.eye` and converts each.
 *
 * @param pose - XR viewer pose (structural type, compatible with XRViewerPose)
 * @returns StereoEyes with left and right EyeMatrices
 * @throws If pose doesn't contain both left and right views
 */
export function xrPoseToStereoEyes(pose) {
    let left;
    let right;
    for (const view of pose.views) {
        if (view.eye === 'left')
            left = xrViewToEyeMatrices(view);
        else if (view.eye === 'right')
            right = xrViewToEyeMatrices(view);
    }
    if (!left || !right) {
        throw new Error('XR pose must contain both left and right views');
    }
    return { left, right };
}
/**
 * Check if an XR viewer pose is a stereo pose (has both left and right views).
 */
export function isStereoPose(pose) {
    let hasLeft = false;
    let hasRight = false;
    for (const view of pose.views) {
        if (view.eye === 'left')
            hasLeft = true;
        else if (view.eye === 'right')
            hasRight = true;
    }
    return hasLeft && hasRight;
}
