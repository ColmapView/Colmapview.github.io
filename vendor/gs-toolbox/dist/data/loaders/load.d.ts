import type { GaussianCloud } from '../../types';
export type GaussianFormat = 'ply' | 'splat' | 'spz' | 'rad' | 'unknown';
export interface LoadOptions {
    /** Called with (bytesLoaded, totalBytes) during fetch. totalBytes may be 0 if unknown. */
    onProgress?: (loaded: number, total: number) => void;
}
/** Detect format from filename/URL or magic bytes */
export declare function detectFormat(source: string | ArrayBuffer): GaussianFormat;
/** Auto-detect format and load Gaussian data */
export declare function load(source: File | ArrayBuffer | string, options?: LoadOptions): Promise<GaussianCloud>;
