import { describe, it, expect } from 'vitest';
import {
  detectCloudProvider,
  isPreSignedUrl,
  normalizeCloudStorageUrl,
  normalizeGitHostingUrl,
  isManifestUrl,
  getCorsInstructions,
} from './urlUtils';

describe('detectCloudProvider', () => {
  describe('S3 URLs', () => {
    it('detects s3:// scheme', () => {
      expect(detectCloudProvider('s3://my-bucket/path/to/file')).toBe('s3');
    });

    it('detects bucket.s3.amazonaws.com format', () => {
      expect(detectCloudProvider('https://my-bucket.s3.amazonaws.com/path')).toBe('s3');
    });

    it('detects regional S3 URLs', () => {
      expect(detectCloudProvider('https://my-bucket.s3.us-west-2.amazonaws.com/path')).toBe('s3');
    });

    it('detects s3.amazonaws.com path-style URLs', () => {
      expect(detectCloudProvider('https://s3.amazonaws.com/my-bucket/path')).toBe('s3');
    });
  });

  describe('GCS URLs', () => {
    it('detects gs:// scheme', () => {
      expect(detectCloudProvider('gs://my-bucket/path/to/file')).toBe('gcs');
    });

    it('detects storage.googleapis.com', () => {
      expect(detectCloudProvider('https://storage.googleapis.com/my-bucket/path')).toBe('gcs');
    });

    it('detects storage.cloud.google.com', () => {
      expect(detectCloudProvider('https://storage.cloud.google.com/my-bucket/path')).toBe('gcs');
    });
  });

  describe('R2 URLs', () => {
    it('detects r2.cloudflarestorage.com', () => {
      expect(detectCloudProvider('https://account-id.r2.cloudflarestorage.com/bucket/path')).toBe('r2');
    });

    it('detects r2.dev URLs', () => {
      expect(detectCloudProvider('https://pub-abc123.r2.dev/path')).toBe('r2');
    });
  });

  describe('Dropbox URLs', () => {
    it('detects www.dropbox.com', () => {
      expect(detectCloudProvider('https://www.dropbox.com/s/abc123/file.txt?dl=0')).toBe('dropbox');
    });

    it('detects dropbox.com without www', () => {
      expect(detectCloudProvider('https://dropbox.com/s/abc123/file.txt?dl=0')).toBe('dropbox');
    });

    it('detects dl.dropboxusercontent.com', () => {
      expect(detectCloudProvider('https://dl.dropboxusercontent.com/s/abc123/file.txt')).toBe('dropbox');
    });

    it('detects new scl format URLs', () => {
      expect(detectCloudProvider('https://www.dropbox.com/scl/fi/abc123/file.txt?rlkey=xyz&dl=0')).toBe('dropbox');
    });
  });

  describe('non-cloud URLs', () => {
    it('returns null for regular HTTPS URLs', () => {
      expect(detectCloudProvider('https://example.com/path')).toBeNull();
    });

    it('returns null for HuggingFace URLs', () => {
      expect(detectCloudProvider('https://huggingface.co/datasets/user/repo')).toBeNull();
    });

    it('returns null for GitHub URLs', () => {
      expect(detectCloudProvider('https://github.com/user/repo')).toBeNull();
    });

    it('returns null for invalid URLs', () => {
      expect(detectCloudProvider('not-a-url')).toBeNull();
    });
  });
});

describe('isPreSignedUrl', () => {
  describe('S3 pre-signed URLs', () => {
    it('detects X-Amz-Signature parameter', () => {
      const url = 'https://bucket.s3.amazonaws.com/file?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc123';
      expect(isPreSignedUrl(url)).toBe(true);
    });

    it('detects legacy Signature parameter', () => {
      const url = 'https://bucket.s3.amazonaws.com/file?Signature=abc123&Expires=12345';
      expect(isPreSignedUrl(url)).toBe(true);
    });
  });

  describe('GCS pre-signed URLs', () => {
    it('detects X-Goog-Signature parameter', () => {
      const url = 'https://storage.googleapis.com/bucket/file?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc123';
      expect(isPreSignedUrl(url)).toBe(true);
    });
  });

  describe('generic signed URLs', () => {
    it('detects token parameter', () => {
      expect(isPreSignedUrl('https://example.com/file?token=abc123')).toBe(true);
    });

    it('detects sig parameter', () => {
      expect(isPreSignedUrl('https://example.com/file?sig=abc123')).toBe(true);
    });

    it('detects signature parameter (lowercase)', () => {
      expect(isPreSignedUrl('https://example.com/file?signature=abc123')).toBe(true);
    });
  });

  describe('non-signed URLs', () => {
    it('returns false for regular URLs', () => {
      expect(isPreSignedUrl('https://bucket.s3.amazonaws.com/file')).toBe(false);
    });

    it('returns false for URLs with unrelated query params', () => {
      expect(isPreSignedUrl('https://example.com/file?page=1&sort=name')).toBe(false);
    });

    it('returns false for invalid URLs', () => {
      expect(isPreSignedUrl('not-a-url')).toBe(false);
    });
  });
});

describe('normalizeCloudStorageUrl', () => {
  describe('s3:// scheme conversion', () => {
    it('converts s3://bucket/path to HTTPS', () => {
      expect(normalizeCloudStorageUrl('s3://my-bucket/path/to/file'))
        .toBe('https://my-bucket.s3.amazonaws.com/path/to/file');
    });

    it('handles bucket-only URLs', () => {
      expect(normalizeCloudStorageUrl('s3://my-bucket'))
        .toBe('https://my-bucket.s3.amazonaws.com/');
    });

    it('handles bucket with trailing slash', () => {
      expect(normalizeCloudStorageUrl('s3://my-bucket/'))
        .toBe('https://my-bucket.s3.amazonaws.com/');
    });
  });

  describe('gs:// scheme conversion', () => {
    it('converts gs://bucket/path to HTTPS', () => {
      expect(normalizeCloudStorageUrl('gs://my-bucket/path/to/file'))
        .toBe('https://storage.googleapis.com/my-bucket/path/to/file');
    });

    it('handles bucket-only URLs', () => {
      expect(normalizeCloudStorageUrl('gs://my-bucket'))
        .toBe('https://storage.googleapis.com/my-bucket/');
    });
  });

  describe('GCS console URL conversion', () => {
    it('converts console.cloud.google.com URLs', () => {
      expect(normalizeCloudStorageUrl('https://console.cloud.google.com/storage/browser/my-bucket/path'))
        .toBe('https://storage.googleapis.com/my-bucket/path');
    });

    it('converts storage.cloud.google.com URLs', () => {
      expect(normalizeCloudStorageUrl('https://storage.cloud.google.com/my-bucket/path'))
        .toBe('https://storage.googleapis.com/my-bucket/path');
    });
  });

  describe('pre-signed URL preservation', () => {
    it('does not modify pre-signed S3 URLs', () => {
      const signedUrl = 'https://bucket.s3.amazonaws.com/file?X-Amz-Signature=abc123';
      expect(normalizeCloudStorageUrl(signedUrl)).toBe(signedUrl);
    });

    it('does not modify pre-signed GCS URLs', () => {
      const signedUrl = 'https://storage.googleapis.com/bucket/file?X-Goog-Signature=abc123';
      expect(normalizeCloudStorageUrl(signedUrl)).toBe(signedUrl);
    });
  });

  describe('Dropbox URL conversion', () => {
    it('converts www.dropbox.com/s/ share links to direct download', () => {
      expect(normalizeCloudStorageUrl('https://www.dropbox.com/s/abc123/file.txt?dl=0'))
        .toBe('https://dl.dropboxusercontent.com/s/abc123/file.txt');
    });

    it('converts dropbox.com/s/ share links (without www)', () => {
      expect(normalizeCloudStorageUrl('https://dropbox.com/s/abc123/file.txt?dl=0'))
        .toBe('https://dl.dropboxusercontent.com/s/abc123/file.txt');
    });

    it('converts new scl format links preserving rlkey', () => {
      expect(normalizeCloudStorageUrl('https://www.dropbox.com/scl/fi/abc123/file.txt?rlkey=xyz123&dl=0'))
        .toBe('https://dl.dropboxusercontent.com/scl/fi/abc123/file.txt?rlkey=xyz123');
    });

    it('handles links with dl=1 parameter', () => {
      expect(normalizeCloudStorageUrl('https://www.dropbox.com/s/abc123/file.txt?dl=1'))
        .toBe('https://dl.dropboxusercontent.com/s/abc123/file.txt');
    });

    it('handles links without dl parameter', () => {
      expect(normalizeCloudStorageUrl('https://www.dropbox.com/s/abc123/file.txt'))
        .toBe('https://dl.dropboxusercontent.com/s/abc123/file.txt');
    });

    it('returns already-normalized dl.dropboxusercontent.com URLs unchanged', () => {
      const url = 'https://dl.dropboxusercontent.com/s/abc123/file.txt';
      expect(normalizeCloudStorageUrl(url)).toBe(url);
    });
  });

  describe('passthrough for other URLs', () => {
    it('returns HTTPS URLs unchanged', () => {
      const url = 'https://example.com/path/to/file';
      expect(normalizeCloudStorageUrl(url)).toBe(url);
    });

    it('returns already-normalized S3 URLs unchanged', () => {
      const url = 'https://my-bucket.s3.amazonaws.com/path';
      expect(normalizeCloudStorageUrl(url)).toBe(url);
    });

    it('returns already-normalized GCS URLs unchanged', () => {
      const url = 'https://storage.googleapis.com/my-bucket/path';
      expect(normalizeCloudStorageUrl(url)).toBe(url);
    });
  });
});

describe('normalizeGitHostingUrl', () => {
  describe('HuggingFace URLs', () => {
    it('converts tree/main to resolve/main', () => {
      expect(normalizeGitHostingUrl('https://huggingface.co/datasets/user/repo/tree/main/path'))
        .toBe('https://huggingface.co/datasets/user/repo/resolve/main/path');
    });

    it('converts blob/main to resolve/main', () => {
      expect(normalizeGitHostingUrl('https://huggingface.co/datasets/user/repo/blob/main/path'))
        .toBe('https://huggingface.co/datasets/user/repo/resolve/main/path');
    });
  });

  describe('GitHub URLs', () => {
    it('converts blob URLs to raw.githubusercontent.com', () => {
      expect(normalizeGitHostingUrl('https://github.com/user/repo/blob/main/path/file.txt'))
        .toBe('https://raw.githubusercontent.com/user/repo/main/path/file.txt');
    });

    it('converts tree URLs to raw.githubusercontent.com', () => {
      expect(normalizeGitHostingUrl('https://github.com/user/repo/tree/main/path'))
        .toBe('https://raw.githubusercontent.com/user/repo/main/path');
    });
  });

  describe('GitLab URLs', () => {
    it('converts blob to raw', () => {
      expect(normalizeGitHostingUrl('https://gitlab.com/user/repo/-/blob/main/path'))
        .toBe('https://gitlab.com/user/repo/-/raw/main/path');
    });

    it('converts tree to raw', () => {
      expect(normalizeGitHostingUrl('https://gitlab.com/user/repo/-/tree/main/path'))
        .toBe('https://gitlab.com/user/repo/-/raw/main/path');
    });
  });

  describe('Bitbucket URLs', () => {
    it('converts src to raw', () => {
      expect(normalizeGitHostingUrl('https://bitbucket.org/user/repo/src/main/path'))
        .toBe('https://bitbucket.org/user/repo/raw/main/path');
    });
  });

  describe('passthrough', () => {
    it('returns non-git URLs unchanged', () => {
      const url = 'https://example.com/path';
      expect(normalizeGitHostingUrl(url)).toBe(url);
    });
  });
});

describe('isManifestUrl', () => {
  it('returns true for .json URLs', () => {
    expect(isManifestUrl('https://example.com/manifest.json')).toBe(true);
  });

  it('returns true for .JSON URLs (case insensitive)', () => {
    expect(isManifestUrl('https://example.com/MANIFEST.JSON')).toBe(true);
  });

  it('returns false for non-JSON URLs', () => {
    expect(isManifestUrl('https://example.com/path/')).toBe(false);
    expect(isManifestUrl('https://example.com/file.txt')).toBe(false);
  });

  it('returns false for invalid URLs', () => {
    expect(isManifestUrl('not-a-url')).toBe(false);
  });
});

describe('getCorsInstructions', () => {
  it('returns S3 instructions for s3 provider', () => {
    const instructions = getCorsInstructions('s3');
    expect(instructions).toContain('AWS S3');
    expect(instructions).toContain('AllowedOrigins');
  });

  it('returns GCS instructions for gcs provider', () => {
    const instructions = getCorsInstructions('gcs');
    expect(instructions).toContain('Google Cloud Storage');
    expect(instructions).toContain('gsutil cors set');
  });

  it('returns R2 instructions for r2 provider', () => {
    const instructions = getCorsInstructions('r2');
    expect(instructions).toContain('Cloudflare R2');
    expect(instructions).toContain('CORS Policy');
  });

  it('returns Dropbox instructions for dropbox provider', () => {
    const instructions = getCorsInstructions('dropbox');
    expect(instructions).toContain('Dropbox');
    expect(instructions).toContain('Anyone with the link');
  });
});
