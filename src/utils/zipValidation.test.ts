import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  validateZipFile,
  validateZipUrl,
  getArchiveReadSizeLimit,
  ARCHIVE_SIZE_LIMIT,
  type ZipUrlValidationOptions,
} from './zipValidation';
import { buildResponse } from '../test/builders';
import { HfError } from '../features/huggingface/http';

type FetchImpl = NonNullable<ZipUrlValidationOptions['fetchImpl']>;

function createResponse(status: number, contentLength?: string): Response {
  return buildResponse({
    status,
    headers: contentLength === undefined ? undefined : { 'content-length': contentLength },
  });
}

describe('zip validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('accepts indexed ZIP and TAR containers over 2 GiB while preserving compatibility limits', () => {
    for (const name of ['large.zip', 'large.tar']) {
      const file = new File(['placeholder'], name);
      Object.defineProperty(file, 'size', { value: 3 * 1024 * 1024 * 1024 });
      expect(validateZipFile(file).valid).toBe(true);
    }
    expect(getArchiveReadSizeLimit('large.tar.xz')).toBe(ARCHIVE_SIZE_LIMIT);
    vi.stubGlobal('navigator', { storage: { getDirectory() {} } });
    vi.stubGlobal('DecompressionStream', class {});
    expect(getArchiveReadSizeLimit('large.tar.gz')).toBe(Number.MAX_SAFE_INTEGER);
    vi.stubGlobal('DecompressionStream', undefined);
    expect(getArchiveReadSizeLimit('large.tar.gz')).toBe(ARCHIVE_SIZE_LIMIT);
  });

  it('validates local archive files against the configured size limit', () => {
    const file = new File(['small'], 'dataset.zip');

    expect(validateZipFile(file, { sizeLimit: 10 })).toEqual({
      valid: true,
      size: file.size,
    });

    expect(validateZipFile(file, { sizeLimit: 2 })).toMatchObject({
      valid: false,
      size: file.size,
      error: expect.stringContaining('Archive exceeds'),
    });
  });

  it('accepts URL archives with missing or bounded content length', async () => {
    const fetchImpl = vi.fn<FetchImpl>()
      .mockResolvedValueOnce(createResponse(200))
      .mockResolvedValueOnce(createResponse(200, '1024'));

    await expect(validateZipUrl('https://example.com/a.zip', { fetchImpl })).resolves.toEqual({
      valid: true,
    });
    await expect(validateZipUrl('https://example.com/b.zip', { fetchImpl })).resolves.toEqual({
      valid: true,
      size: 1024,
    });
  });

  it('accepts URL archives with malformed content length without trusting partial numbers', async () => {
    const fetchImpl = vi.fn<FetchImpl>()
      .mockResolvedValueOnce(createResponse(200, '1024 bytes'))
      .mockResolvedValueOnce(createResponse(200, '-1'));

    await expect(validateZipUrl('https://example.com/partial.zip', { fetchImpl })).resolves.toEqual({
      valid: true,
    });
    await expect(validateZipUrl('https://example.com/negative.zip', { fetchImpl })).resolves.toEqual({
      valid: true,
    });
  });

  it('rejects URL archives that are inaccessible or too large', async () => {
    const fetchImpl = vi.fn<FetchImpl>()
      .mockResolvedValueOnce(createResponse(404))
      .mockResolvedValueOnce(createResponse(200, '2048'));

    await expect(validateZipUrl('https://example.com/missing.zip', { fetchImpl })).resolves.toEqual({
      valid: false,
      error: 'Failed to access archive (404)',
    });
    await expect(validateZipUrl('https://example.com/large.zip', {
      fetchImpl,
      sizeLimit: 1024,
    })).resolves.toMatchObject({
      valid: false,
      size: 2048,
      error: expect.stringContaining('Archive exceeds'),
    });
  });

  it('allows URL downloads to proceed when HEAD fails for reasons other than timeout', async () => {
    const fetchImpl = vi.fn<FetchImpl>().mockRejectedValue(new TypeError('CORS'));

    await expect(validateZipUrl('https://example.com/cors.zip', { fetchImpl })).resolves.toEqual({
      valid: true,
    });
  });

  it('rethrows a Hugging Face account answer from the size check', async () => {
    const error = new HfError('Your Hugging Face connection expired. Sign in again to open private datasets.', 401);
    const fetchImpl = vi.fn<FetchImpl>().mockRejectedValue(error);
    await expect(validateZipUrl('https://huggingface.co/datasets/owner/private/resolve/main/a.zip', { fetchImpl }))
      .rejects.toBe(error);
  });

  it('reports URL size-check timeouts', async () => {
    vi.useFakeTimers();

    const fetchImpl = vi.fn<FetchImpl>((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    });

    const validation = validateZipUrl('https://example.com/slow.zip', {
      fetchImpl,
      timeoutMs: 50,
    });

    await vi.advanceTimersByTimeAsync(50);

    await expect(validation).resolves.toEqual({
      valid: false,
      error: 'Size check timed out',
    });
  });
});
