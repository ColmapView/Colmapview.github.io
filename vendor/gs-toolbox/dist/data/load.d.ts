import type { GaussianCloud } from '../types';
export type GaussianFormat = 'ply' | 'splat' | 'spz' | 'unknown';
/** Detect format from filename/URL or magic bytes */
export declare function detectFormat(source: string | ArrayBuffer): GaussianFormat;
/** Auto-detect format and load Gaussian data */
export declare function load(source: File | ArrayBuffer | string): Promise<GaussianCloud>;
