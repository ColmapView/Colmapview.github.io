/**
 * URL utilities for fetching and normalizing URLs from various Git hosting platforms
 * and cloud storage providers (S3, GCS, R2).
 */

import type { UrlLoadError, CloudProvider } from '../types/manifest';

// Timeout for individual file fetches (30 seconds)
export const FETCH_TIMEOUT = 30000;

/**
 * Fetch with timeout support.
 */
export async function fetchWithTimeout(url: string, timeout: number = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Classify error type from fetch error.
 */
export function classifyFetchError(err: unknown, url?: string): UrlLoadError {
  if (err instanceof Error) {
    // AbortError from timeout
    if (err.name === 'AbortError') {
      return {
        type: 'timeout',
        message: 'Request timed out',
        details: `The request to ${url || 'the server'} took too long to respond.`,
        failedFile: url,
      };
    }

    // CORS errors typically appear as TypeError with network failure message
    if (err.name === 'TypeError' && (
      err.message.includes('Failed to fetch') ||
      err.message.includes('NetworkError') ||
      err.message.includes('CORS')
    )) {
      return {
        type: 'cors',
        message: 'Cross-origin request blocked',
        details: 'This URL does not allow cross-origin requests. The server needs to include CORS headers.',
        failedFile: url,
      };
    }

    // Generic network error
    if (err.name === 'TypeError') {
      return {
        type: 'network',
        message: 'Network error',
        details: err.message,
        failedFile: url,
      };
    }

    return {
      type: 'unknown',
      message: err.message,
      failedFile: url,
    };
  }

  return {
    type: 'unknown',
    message: String(err),
    failedFile: url,
  };
}

/**
 * Create a File object from fetched blob.
 */
export function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type });
}

/**
 * Extract filename from URL path.
 */
export function getFilenameFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  return pathname.split('/').pop() || 'unknown';
}

/**
 * Normalize Git hosting URLs to use raw file endpoints instead of web viewer URLs.
 * Supports: HuggingFace, GitHub, GitLab, Bitbucket, Gitea, Codeberg
 */
export function normalizeGitHostingUrl(url: string): string {
  // HuggingFace: Convert tree/main or blob/main to resolve/main
  if (url.includes('huggingface.co')) {
    return url
      .replace('/tree/main/', '/resolve/main/')
      .replace('/blob/main/', '/resolve/main/');
  }

  // GitHub: Convert to raw.githubusercontent.com
  // https://github.com/user/repo/blob/main/path -> https://raw.githubusercontent.com/user/repo/main/path
  const githubMatch = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(blob|tree)\/([^/]+)\/(.*)$/);
  if (githubMatch) {
    const [, user, repo, , branch, path] = githubMatch;
    return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${path}`;
  }

  // GitLab (including self-hosted): Convert blob/tree to raw
  // https://gitlab.com/user/repo/-/blob/main/path -> https://gitlab.com/user/repo/-/raw/main/path
  if (url.includes('gitlab.com') || url.includes('gitlab.')) {
    return url
      .replace('/-/tree/', '/-/raw/')
      .replace('/-/blob/', '/-/raw/');
  }

  // Bitbucket: Convert src to raw
  // https://bitbucket.org/user/repo/src/main/path -> https://bitbucket.org/user/repo/raw/main/path
  if (url.includes('bitbucket.org')) {
    return url.replace('/src/', '/raw/');
  }

  // Gitea / Codeberg: Convert src/branch to raw/branch
  // https://codeberg.org/user/repo/src/branch/main/path -> https://codeberg.org/user/repo/raw/branch/main/path
  if (url.includes('codeberg.org') || url.includes('gitea.')) {
    return url.replace('/src/branch/', '/raw/branch/');
  }

  return url;
}

/**
 * Check if URL points to a JSON manifest file.
 */
export function isManifestUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith('.json');
  } catch {
    return false;
  }
}

/**
 * Detect cloud storage provider from URL.
 * Returns null if not a recognized cloud storage URL.
 */
export function detectCloudProvider(url: string): CloudProvider | null {
  // Check URI schemes first
  if (url.startsWith('s3://')) return 's3';
  if (url.startsWith('gs://')) return 'gcs';

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // AWS S3 patterns
    if (hostname.endsWith('.s3.amazonaws.com') ||
        hostname.includes('.s3.') && hostname.endsWith('.amazonaws.com') ||
        hostname === 's3.amazonaws.com') {
      return 's3';
    }

    // Google Cloud Storage patterns
    if (hostname === 'storage.googleapis.com' ||
        hostname === 'storage.cloud.google.com' ||
        hostname.endsWith('.storage.googleapis.com')) {
      return 'gcs';
    }

    // Cloudflare R2 patterns (*.r2.cloudflarestorage.com or custom domains with r2)
    if (hostname.endsWith('.r2.cloudflarestorage.com') ||
        hostname.endsWith('.r2.dev')) {
      return 'r2';
    }

    // Dropbox patterns
    if (hostname === 'www.dropbox.com' ||
        hostname === 'dropbox.com' ||
        hostname === 'dl.dropboxusercontent.com') {
      return 'dropbox';
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if URL appears to be a pre-signed URL (has signature parameters).
 * Pre-signed URLs should not be normalized as they already contain authentication.
 */
export function isPreSignedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;

    // AWS S3 pre-signed URL parameters
    if (params.has('X-Amz-Signature') || params.has('Signature')) {
      return true;
    }

    // GCS pre-signed URL parameters
    if (params.has('X-Goog-Signature') || params.has('Signature')) {
      return true;
    }

    // R2 uses the same signature format as S3
    // Generic signed URL indicators
    if (params.has('token') || params.has('sig') || params.has('signature')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Normalize cloud storage URIs and console URLs to direct HTTPS URLs.
 * - s3://bucket/path → https://bucket.s3.amazonaws.com/path
 * - gs://bucket/path → https://storage.googleapis.com/bucket/path
 * - GCS console URLs → direct storage URLs
 *
 * Pre-signed URLs are returned unchanged.
 */
export function normalizeCloudStorageUrl(url: string): string {
  // Don't modify pre-signed URLs
  if (isPreSignedUrl(url)) {
    return url;
  }

  // Handle s3:// scheme
  if (url.startsWith('s3://')) {
    const match = url.match(/^s3:\/\/([^/]+)\/?(.*)?$/);
    if (match) {
      const [, bucket, path] = match;
      return `https://${bucket}.s3.amazonaws.com/${path || ''}`;
    }
  }

  // Handle gs:// scheme
  if (url.startsWith('gs://')) {
    const match = url.match(/^gs:\/\/([^/]+)\/?(.*)?$/);
    if (match) {
      const [, bucket, path] = match;
      return `https://storage.googleapis.com/${bucket}/${path || ''}`;
    }
  }

  // Handle GCS console URLs
  // https://console.cloud.google.com/storage/browser/bucket/path
  // → https://storage.googleapis.com/bucket/path
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'console.cloud.google.com' &&
        parsed.pathname.startsWith('/storage/browser/')) {
      const pathAfterBrowser = parsed.pathname.replace('/storage/browser/', '');
      return `https://storage.googleapis.com/${pathAfterBrowser}`;
    }

    // Handle storage.cloud.google.com URLs (alternative GCS domain)
    // https://storage.cloud.google.com/bucket/path → https://storage.googleapis.com/bucket/path
    if (parsed.hostname === 'storage.cloud.google.com') {
      return `https://storage.googleapis.com${parsed.pathname}`;
    }

    // Handle Dropbox share URLs
    // https://www.dropbox.com/s/abc123/file.txt?dl=0 → https://dl.dropboxusercontent.com/s/abc123/file.txt
    // https://www.dropbox.com/scl/fi/abc123/file.txt?rlkey=xyz&dl=0 → https://dl.dropboxusercontent.com/scl/fi/abc123/file.txt?rlkey=xyz
    if (parsed.hostname === 'www.dropbox.com' || parsed.hostname === 'dropbox.com') {
      // Remove dl parameter and rebuild URL with dl.dropboxusercontent.com
      const params = new URLSearchParams(parsed.search);
      params.delete('dl');
      const queryString = params.toString();
      const newPath = parsed.pathname + (queryString ? `?${queryString}` : '');
      return `https://dl.dropboxusercontent.com${newPath}`;
    }
  } catch {
    // Invalid URL, return as-is
  }

  return url;
}

/**
 * Get provider-specific CORS setup instructions.
 */
export function getCorsInstructions(provider: CloudProvider): string {
  switch (provider) {
    case 's3':
      return `AWS S3 CORS Configuration:
1. Go to your S3 bucket in the AWS Console
2. Navigate to Permissions → CORS configuration
3. Add a CORS rule allowing your origin:
   [
     {
       "AllowedOrigins": ["*"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["Content-Length", "Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
4. Save the configuration`;

    case 'gcs':
      return `Google Cloud Storage CORS Configuration:
1. Create a cors.json file:
   [
     {
       "origin": ["*"],
       "method": ["GET", "HEAD"],
       "responseHeader": ["Content-Type", "Content-Length"],
       "maxAgeSeconds": 3600
     }
   ]
2. Apply using gsutil:
   gsutil cors set cors.json gs://YOUR_BUCKET_NAME`;

    case 'r2':
      return `Cloudflare R2 CORS Configuration:
1. Go to your R2 bucket in Cloudflare Dashboard
2. Navigate to Settings → CORS Policy
3. Add a CORS rule:
   - Allowed Origins: * (or your specific domain)
   - Allowed Methods: GET, HEAD
   - Allowed Headers: *
   - Max Age: 3600
4. Save the configuration`;

    case 'dropbox':
      return `Dropbox Sharing Setup:
1. Right-click the file/folder in Dropbox
2. Select "Share" → "Copy link"
3. Ensure link access is set to "Anyone with the link"

Note: Dropbox automatically handles CORS for shared links.
If you're getting errors, ensure:
- The file is shared publicly (not restricted)
- The link hasn't expired
- You're using a file link, not a folder link`;
  }
}

/**
 * Enhanced error classification with cloud provider-specific CORS messages.
 */
export function classifyFetchErrorWithCloudContext(
  err: unknown,
  url?: string
): UrlLoadError {
  const baseError = classifyFetchError(err, url);

  // Enhance CORS errors with provider-specific instructions
  if (baseError.type === 'cors' && url) {
    const provider = detectCloudProvider(url);
    if (provider) {
      const instructions = getCorsInstructions(provider);
      baseError.details = `This ${provider.toUpperCase()} bucket does not allow cross-origin requests.\n\n${instructions}`;
    }
  }

  return baseError;
}
