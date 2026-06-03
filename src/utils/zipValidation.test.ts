import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  validateZipFile,
  validateZipUrl,
  type ZipUrlValidationOptions,
} from './zipValidation';
import { buildResponse } from '../test/builders';

type FetchImpl = NonNullable<ZipUrlValidationOptions['fetchImpl']>;

function createResponse(status: number, contentLength?: string): Response {
  return buildResponse({
    status,
    headers: contentLength === undefined ? undefined : { 'content-length': contentLength },
  });
}

describe('zip validation', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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
