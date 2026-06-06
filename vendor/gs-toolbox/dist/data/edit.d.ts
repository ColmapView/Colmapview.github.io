import type { GaussianCloud } from '../types';
/** Deep clone a GaussianCloud. */
export declare function cloneCloud(cloud: GaussianCloud): GaussianCloud;
/** Filter Gaussians by predicate. Returns new cloud with only matching Gaussians. */
export declare function filterCloud(cloud: GaussianCloud, predicate: (index: number) => boolean): GaussianCloud;
/** Keep only Gaussians inside an axis-aligned bounding box. */
export declare function cropCloud(cloud: GaussianCloud, min: [number, number, number], max: [number, number, number]): GaussianCloud;
/** Merge multiple GaussianClouds into one. SH degree = min of all inputs. */
export declare function mergeClouds(clouds: GaussianCloud[]): GaussianCloud;
/**
 * Apply a 4x4 affine transform (column-major) to positions and rotations.
 * Handles uniform scaling. For non-uniform scale, only the uniform component is applied.
 */
export declare function transformCloud(cloud: GaussianCloud, matrix: Float32Array): GaussianCloud;
/** Random subsample by ratio (0-1). Returns ~ratio * count Gaussians. */
export declare function subsampleCloud(cloud: GaussianCloud, ratio: number, seed?: number): GaussianCloud;
/** Remove Gaussians with opacity below threshold. */
export declare function pruneByOpacity(cloud: GaussianCloud, minOpacity: number): GaussianCloud;
/** Remove Gaussians with scale magnitude above threshold (outlier removal). */
export declare function pruneByScale(cloud: GaussianCloud, maxScale: number): GaussianCloud;
