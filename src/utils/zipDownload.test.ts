import { describe, expect, it, vi } from 'vitest';
import { buildResponse } from '../test/builders';
import {
  downloadZip,
  validateDownloadedArchiveSize,
  type ZipProgress,
} from './zipDownload';

function createStreamedResponse(chunks: number[][], contentLength?: number): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new Uint8Array(chunk));
      }
      controller.close();
    },
  }), {
    status: 200,
    headers: contentLength === undefined ? undefined : {
      'content-length': String(contentLength),
    },
  });
}

describe('zip download', () => {
  it('streams archive downloads with bounded progress and concatenates chunks', async () => {
    const progress: ZipProgress[] = [];
    const fetchImpl = vi.fn().mockResolvedValue(createStreamedResponse([
      [1, 2],
      [3, 4],
    ], 4));

    const blob = await downloadZip('https://example.com/data.zip', progress.push.bind(progress), {
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/data.zip', 120000);
    expect(blob.size).toBe(4);
    expect(progress).toEqual([
      { percent: 2, message: 'Starting download...' },
      {
        percent: 21,
        message: 'Downloading archive (0.0 / 0.0 MB)...',
        bytesLoaded: 2,
        bytesTotal: 4,
      },
      {
        percent: 40,
        message: 'Downloading archive (0.0 / 0.0 MB)...',
        bytesLoaded: 4,
        bytesTotal: 4,
      },
    ]);
  });

  it('reports unknown-size streaming progress without total bytes', async () => {
    const progress: ZipProgress[] = [];
    const fetchImpl = vi.fn().mockResolvedValue(createStreamedResponse([[1, 2, 3]]));

    await downloadZip('https://example.com/data.zip', progress.push.bind(progress), {
      fetchImpl,
    });

    expect(progress).toEqual([
      { percent: 2, message: 'Starting download...' },
      {
        percent: 20,
        message: 'Downloading archive (0.0 MB)...',
        bytesLoaded: 3,
      },
    ]);
  });

  it('treats invalid content length headers as unknown-size streaming progress', async () => {
    const progress: ZipProgress[] = [];
    const response = createStreamedResponse([[1, 2, 3]], 3);
    response.headers.set('content-length', '3 bytes');
    const fetchImpl = vi.fn().mockResolvedValue(response);

    await downloadZip('https://example.com/data.zip', progress.push.bind(progress), {
      fetchImpl,
    });

    expect(progress).toEqual([
      { percent: 2, message: 'Starting download...' },
      {
        percent: 20,
        message: 'Downloading archive (0.0 MB)...',
        bytesLoaded: 3,
      },
    ]);
  });

  it('uses blob fallback when streaming is unavailable', async () => {
    const fallbackBlob = new Blob([new Uint8Array([9, 8, 7])]);
    const response = buildResponse({
      blob: vi.fn().mockResolvedValue(fallbackBlob),
    });
    const fetchImpl = vi.fn().mockResolvedValue(response);

    await expect(downloadZip('https://example.com/data.zip', vi.fn(), {
      fetchImpl,
    })).resolves.toBe(fallbackBlob);
    expect(response.blob).toHaveBeenCalledOnce();
  });

  it('rejects failed download responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));

    await expect(downloadZip('https://example.com/data.zip', vi.fn(), {
      fetchImpl,
    })).rejects.toThrow('Failed to download archive (503)');
  });

  it('rejects downloaded archives over the configured size limit', () => {
    const blob = new Blob([new Uint8Array(10)]);

    expect(() => validateDownloadedArchiveSize(blob, 9)).toThrow(
      'Downloaded archive exceeds size limit'
    );
    expect(() => validateDownloadedArchiveSize(blob, 10)).not.toThrow();
  });
});
