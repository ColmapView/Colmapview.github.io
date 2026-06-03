import { parseSafeIntegerString } from './numberParsing';

/** Maximum archive file size (2GB) */
export const ARCHIVE_SIZE_LIMIT = 2 * 1024 * 1024 * 1024;

/** Timeout for archive size validation HEAD requests (5 seconds) */
const SIZE_CHECK_TIMEOUT = 5000;

/** Archive validation result */
export interface ZipValidationResult {
  valid: boolean;
  size?: number;
  error?: string;
}

export interface ZipValidationOptions {
  sizeLimit?: number;
}

export interface ZipUrlValidationOptions extends ZipValidationOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Validate an archive URL by checking its size with a HEAD request.
 */
export async function validateZipUrl(
  url: string,
  options: ZipUrlValidationOptions = {}
): Promise<ZipValidationResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sizeLimit = options.sizeLimit ?? ARCHIVE_SIZE_LIMIT;
  const timeoutMs = options.timeoutMs ?? SIZE_CHECK_TIMEOUT;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        valid: false,
        error: `Failed to access archive (${response.status})`,
      };
    }

    const contentLength = response.headers.get('content-length');
    if (!contentLength) {
      return { valid: true };
    }

    const size = parseSafeIntegerString(contentLength);
    if (size === null) {
      return { valid: true };
    }

    return validateArchiveSize(size, sizeLimit);
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error && err.name === 'AbortError') {
      return { valid: false, error: 'Size check timed out' };
    }

    // On HEAD failure (CORS, etc.), allow the download attempt.
    return { valid: true };
  }
}

/**
 * Validate a local archive file by checking its size.
 */
export function validateZipFile(
  file: File,
  options: ZipValidationOptions = {}
): ZipValidationResult {
  const sizeLimit = options.sizeLimit ?? ARCHIVE_SIZE_LIMIT;
  return validateArchiveSize(file.size, sizeLimit);
}

function validateArchiveSize(size: number, sizeLimit: number): ZipValidationResult {
  if (size > sizeLimit) {
    return {
      valid: false,
      size,
      error: formatArchiveSizeError(size, sizeLimit),
    };
  }

  return { valid: true, size };
}

function formatArchiveSizeError(size: number, sizeLimit: number): string {
  const sizeMB = (size / (1024 * 1024)).toFixed(1);
  const limitMB = (sizeLimit / (1024 * 1024)).toFixed(0);
  return `Archive exceeds ${limitMB}MB limit (actual: ${sizeMB}MB)`;
}
