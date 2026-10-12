import { describe, expect, it } from 'vitest';
import {
  detectCloudProvider,
  getCorsInstructions,
  getStorageCorsOrigins,
  isPreSignedUrl,
  normalizeCloudStorageUrl,
} from './urlCloudStorage';

describe('url cloud storage policy', () => {
  it('detects supported cloud storage providers', () => {
    expect(detectCloudProvider('s3://bucket/path/file.txt')).toBe('s3');
    expect(detectCloudProvider('gs://bucket/path/file.txt')).toBe('gcs');
    expect(detectCloudProvider('https://account.r2.cloudflarestorage.com/bucket/file.txt')).toBe('r2');
    expect(detectCloudProvider('https://www.dropbox.com/s/abc123/file.txt?dl=0')).toBe('dropbox');
    expect(detectCloudProvider('https://example.com/file.txt')).toBeNull();
  });

  it('preserves signed URLs and normalizes cloud share URLs', () => {
    const signedUrl = 'https://bucket.s3.amazonaws.com/file.txt?X-Amz-Signature=abc123';

    expect(isPreSignedUrl(signedUrl)).toBe(true);
    expect(normalizeCloudStorageUrl(signedUrl)).toBe(signedUrl);
    expect(normalizeCloudStorageUrl('s3://bucket/path/file.txt'))
      .toBe('https://bucket.s3.amazonaws.com/path/file.txt');
    expect(normalizeCloudStorageUrl('gs://bucket/path/file.txt'))
      .toBe('https://storage.googleapis.com/bucket/path/file.txt');
    expect(normalizeCloudStorageUrl('https://www.dropbox.com/s/abc123/file.txt?dl=0'))
      .toBe('https://dl.dropboxusercontent.com/s/abc123/file.txt');
  });

  it('provides provider-specific CORS instructions', () => {
    expect(getCorsInstructions('s3')).toContain('AWS S3');
    expect(getCorsInstructions('gcs')).toContain('gsutil cors set');
    expect(getCorsInstructions('r2')).toContain('Cloudflare R2');
    expect(getCorsInstructions('dropbox')).toContain('Anyone with the link');
    for (const provider of ['s3', 'gcs', 'r2'] as const) {
      expect(getCorsInstructions(provider)).toContain('https://colmapview.opsiclear.com');
      expect(getCorsInstructions(provider)).toContain('https://colmapview.github.io');
      expect(getCorsInstructions(provider)).not.toMatch(/"(?:AllowedOrigins|origin)": \["\*"\]/);
    }
  });
  it('includes the current development origin without duplicating deployed origins', () => {
    expect(getStorageCorsOrigins('http://127.0.0.1:5199')).toEqual([
      'https://colmapview.opsiclear.com', 'https://colmapview.github.io', 'http://127.0.0.1:5199',
    ]);
    expect(getStorageCorsOrigins('https://colmapview.opsiclear.com')).toHaveLength(2);
  });
});
