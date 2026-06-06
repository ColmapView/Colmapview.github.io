import type { GaussianCloud } from '../../types';
export interface StreamingLoadOptions {
    /** Called with partial cloud as data streams in. Cloud grows over time. */
    onChunk?: (cloud: GaussianCloud, loadedCount: number, totalCount: number) => void;
    /** Minimum number of new Gaussians before triggering onChunk (default: 10000). */
    chunkSize?: number;
}
/**
 * Load PLY with streaming — calls onChunk as data arrives.
 *
 * Only supports URL sources (File/ArrayBuffer are already in memory).
 * Only supports standard (non-compressed) PLY format for streaming.
 *
 * @param source - URL to fetch
 * @param options - Streaming options with onChunk callback
 * @returns Complete GaussianCloud when done
 */
export declare function loadPLYStreaming(source: string, options?: StreamingLoadOptions): Promise<GaussianCloud>;
