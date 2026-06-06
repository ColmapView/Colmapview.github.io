import type { EyeMatrices, StereoEyes } from './types';
export interface Vec3Like {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}
export interface XRTransformLike {
    readonly matrix: Float32Array;
    readonly position: Vec3Like;
}
export interface XRViewLike {
    readonly projectionMatrix: Float32Array;
    readonly transform: XRTransformLike;
    readonly eye: 'left' | 'right' | 'none';
}
export interface XRViewerPoseLike {
    readonly views: readonly XRViewLike[];
}
/**
 * Compute the inverse of a rigid-body transform (rotation + translation).
 *
 * XRRigidTransform.matrix gives world-from-eye; we need eye-from-world
 * (the view matrix). For a rigid body matrix [R|t], the inverse is [R^T | -R^T * t].
 *
 * @param m - 4x4 column-major rigid body transform
 * @returns 4x4 column-major inverse
 */
export declare function invertRigidBodyTransform(m: Float32Array): Float32Array;
/**
 * Extract focal lengths from a projection matrix.
 *
 * @param projMatrix - 4x4 column-major projection matrix
 * @param width - Viewport width in pixels
 * @param height - Viewport height in pixels
 * @returns Focal lengths in pixel units
 */
export declare function extractFocalLengths(projMatrix: Float32Array, width: number, height: number): {
    focalX: number;
    focalY: number;
};
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
export declare function extractClipPlanes(projMatrix: Float32Array): {
    near: number;
    far: number;
};
/**
 * Convert an XR view to EyeMatrices.
 *
 * @param view - XR view (structural type, compatible with XRView)
 * @returns EyeMatrices with viewMatrix, projMatrix, and camPos
 */
export declare function xrViewToEyeMatrices(view: XRViewLike): EyeMatrices;
/**
 * Convert an XR viewer pose to stereo eye matrices.
 *
 * Finds the left and right views by `view.eye` and converts each.
 *
 * @param pose - XR viewer pose (structural type, compatible with XRViewerPose)
 * @returns StereoEyes with left and right EyeMatrices
 * @throws If pose doesn't contain both left and right views
 */
export declare function xrPoseToStereoEyes(pose: XRViewerPoseLike): StereoEyes;
/**
 * Check if an XR viewer pose is a stereo pose (has both left and right views).
 */
export declare function isStereoPose(pose: XRViewerPoseLike): boolean;
