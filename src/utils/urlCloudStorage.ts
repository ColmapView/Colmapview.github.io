import type { CloudProvider } from '../types/manifest';

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
 * - s3://bucket/path -> https://bucket.s3.amazonaws.com/path
 * - gs://bucket/path -> https://storage.googleapis.com/bucket/path
 * - GCS console URLs -> direct storage URLs
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
  // -> https://storage.googleapis.com/bucket/path
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'console.cloud.google.com' &&
        parsed.pathname.startsWith('/storage/browser/')) {
      const pathAfterBrowser = parsed.pathname.replace('/storage/browser/', '');
      return `https://storage.googleapis.com/${pathAfterBrowser}`;
    }

    // Handle storage.cloud.google.com URLs (alternative GCS domain)
    // https://storage.cloud.google.com/bucket/path -> https://storage.googleapis.com/bucket/path
    if (parsed.hostname === 'storage.cloud.google.com') {
      return `https://storage.googleapis.com${parsed.pathname}`;
    }

    // Handle Dropbox share URLs
    // https://www.dropbox.com/s/abc123/file.txt?dl=0 -> https://dl.dropboxusercontent.com/s/abc123/file.txt
    // https://www.dropbox.com/scl/fi/abc123/file.txt?rlkey=xyz&dl=0 -> https://dl.dropboxusercontent.com/scl/fi/abc123/file.txt?rlkey=xyz
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
2. Navigate to Permissions -> CORS configuration
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
2. Navigate to Settings -> CORS Policy
3. Add a CORS rule:
   - Allowed Origins: * (or your specific domain)
   - Allowed Methods: GET, HEAD
   - Allowed Headers: *
   - Max Age: 3600
4. Save the configuration`;

    case 'dropbox':
      return `Dropbox Sharing Setup:
1. Right-click the file/folder in Dropbox
2. Select "Share" -> "Copy link"
3. Ensure link access is set to "Anyone with the link"

Note: Dropbox automatically handles CORS for shared links.
If you're getting errors, ensure:
- The file is shared publicly (not restricted)
- The link hasn't expired
- You're using a file link, not a folder link`;
  }
}
