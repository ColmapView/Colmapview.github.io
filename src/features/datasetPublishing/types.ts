import type { PublishedViewerState } from '../../utils/publishedViewerState';

// Splat files use native Blob transfers and are exempt from this buffer limit.
export const MAX_BUFFERED_PUBLICATION_FILE_BYTES = 128 * 1024 * 1024;
export const MAX_PUBLICATION_BATCH_BYTES = 128 * 1024 * 1024;
export const MAX_PUBLICATION_BATCH_FILES = 49; // Plus one atomic batch receipt.
export interface PublishAsset {
  path: string;
  kind: 'colmap' | 'image' | 'mask' | 'splat' | 'viewer-state' | 'preview';
  size: number | null;
  open: (signal: AbortSignal) => Promise<Blob>;
}
export interface PublicationDetails {
  name: string; title: string; description: string; license: string;
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
}
export interface PublicationReceipt {
  repoId: string; repoUrl: string; dataCommit: string; metadataCommit: string; viewerUrl: string;
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
