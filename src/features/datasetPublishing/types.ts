import type { PublishedViewerState } from '../../utils/publishedViewerState';

// Splats and ZIPs use native Blob transfers; the exported COLMAP model is already in memory. These are exempt.
export const MAX_BUFFERED_PUBLICATION_FILE_BYTES = 128 * 1024 * 1024;
export const MAX_PUBLICATION_BATCH_BYTES = 128 * 1024 * 1024;
export const MAX_PUBLICATION_BATCH_FILES = 49; // Plus one atomic batch receipt.
export interface PublishAsset {
  path: string;
  kind: 'colmap' | 'image' | 'mask' | 'splat' | 'viewer-state' | 'preview' | 'archive';
  /** The exact byte count, checked against the opened file; null when unknown. */
  size: number | null;
  /** A size read when the dataset loaded: it plans batches and the ZIP limit, but the source may have changed since, so it is never checked. */
  estimatedSize?: number;
  open: (signal: AbortSignal) => Promise<Blob>;
  /** Drop preparation-owned buffers after consumption or when ZIP packaging ends. */
  release?: () => void;
}
export type PublicationVisibility = 'private' | 'public';
export type PublicationFormat = 'folder' | 'zip';
export interface PublicationDetails {
  name: string; title: string; description: string; license: string;
  visibility: PublicationVisibility;
  format?: PublicationFormat;
  licenseName?: string; licenseUrl?: string;
}
export interface PreparedPublication {
  operationId: string;
  sourceKey: string;
  modelRevision: number;
  assets: PublishAsset[];
  viewerState: PublishedViewerState;
  counts: { cameras: number; images: number; points: number };
  imageNameToPath: Record<string, string>;
  splatPaths: string[];
  viewerBaseUrl: string;
  previewPath?: string;
  /** ZIP payload inventory; assets contain the ZIP and repository sidecars instead of loose dataset files. */
  archive?: { path: string; size: number; files: Array<{ path: string; size: number }> };
}
export interface PublicationReceipt {
  repoId: string; repoUrl: string; dataCommit: string; metadataCommit: string; viewerUrl: string;
  visibility: PublicationVisibility;
}
export type PublicationPhase = 'idle' | 'preparing' | 'creating-repo' | 'uploading'
  | 'publishing-metadata' | 'verifying' | 'reconciling' | 'cancelling' | 'cancelled' | 'failed' | 'completed';
export interface PublicationState {
  phase: PublicationPhase;
  message: string;
  filesDone: number;
  filesTotal: number;
  bytesDone: number;
  repoUrl?: string;
  receipt?: PublicationReceipt;
  error?: string;
  uncertain?: boolean;
  canRetry: boolean;
}
