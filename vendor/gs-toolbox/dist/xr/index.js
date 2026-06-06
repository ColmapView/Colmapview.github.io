// XR Stereo Module
// =================
// Building blocks for stereo rendering pipelines.
//
// Provides stereo camera math, dual render targets, XR adapter utilities,
// and a pipeline orchestrator for dual-eye Gaussian splatting rendering.
export { computeStereoEyes, computeEyeMatrices } from './stereo-camera';
export { createStereoRenderTargets, destroyStereoRenderTargets } from './stereo-targets';
export { encodeStereoFrame } from './stereo-pipeline';
export { invertRigidBodyTransform, extractFocalLengths, extractClipPlanes, xrViewToEyeMatrices, xrPoseToStereoEyes, isStereoPose, } from './xr-adapter';
