/**
 * URL utilities for fetching and normalizing URLs from various Git hosting platforms.
 */

import type { UrlLoadError } from '../types/manifest';

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
