export type { EyeMatrices, StereoEyes, StereoCameraOptions, StereoRenderTargets, StereoStrategy, StereoColorTargets, } from './types';
export { computeStereoEyes, computeEyeMatrices } from './stereo-camera';
export { createStereoRenderTargets, destroyStereoRenderTargets } from './stereo-targets';
export type { StereoFrameUniforms } from './stereo-pipeline';
export { encodeStereoFrame } from './stereo-pipeline';
export type { Vec3Like, XRTransformLike, XRViewLike, XRViewerPoseLike, } from './xr-adapter';
export { invertRigidBodyTransform, extractFocalLengths, extractClipPlanes, xrViewToEyeMatrices, xrPoseToStereoEyes, isStereoPose, } from './xr-adapter';
