import { HfError } from '../huggingface/http';

export interface BucketConfig {
  /** Complete bucket root: a virtual-hosted AWS URL, or an endpoint with /bucket/. */
  baseUrl: string;
  region: string;
  /** Optional public/custom domain for unsigned viewer links. */
  publicBaseUrl?: string;
}

export interface BucketCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface BucketSession {
  readonly config: Readonly<BucketConfig>;
  readonly canWrite: boolean;
  readonly signal: AbortSignal;
  request: (url: string, init?: RequestInit) => Promise<Response>;
  /** Cancellation may outlive disconnect; only this exact multipart cleanup can still be signed. */
  abortMultipart: (key: string, uploadId: string, signal: AbortSignal) => Promise<void>;
}

export interface BucketObject { key: string; size: number }
export interface BucketPage { objects: BucketObject[]; directories: string[]; nextToken: string | null }

export class BucketError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) { super(message); this.name = 'BucketError'; this.status = status; }
}

/** Remote errors may contain credentials; show only messages owned by this application. */
export function bucketErrorMessage(error: unknown): string {
  return error instanceof BucketError || error instanceof HfError ? error.message : 'Bucket request failed. Check the connection and try again.';
}
