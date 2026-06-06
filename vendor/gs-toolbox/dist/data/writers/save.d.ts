import type { GaussianCloud } from '../../types';
export type SaveFormat = 'ply' | 'splat' | 'spz';
/** Save a GaussianCloud to the specified format. */
export declare function save(cloud: GaussianCloud, format: SaveFormat): ArrayBuffer;
/** Trigger browser download of an ArrayBuffer as a file. */
export declare function downloadBlob(data: ArrayBuffer, filename: string): void;
