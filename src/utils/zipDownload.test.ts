import { describe, expect, it, vi } from 'vitest';
import { buildResponse, readBlobAsArrayBuffer } from '../test/builders';
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
  it('uses metadata for progress when Content-Length is hidden', async () => {
    const onProgress = vi.fn();
    const blob = await downloadZip('https://www.googleapis.com/drive/v3/files/file123?alt=media', onProgress, {
      expectedSize: 4, fetchImpl: vi.fn().mockResolvedValue(createStreamedResponse([[1, 2], [3, 4]])),
    });
    expect(blob.size).toBe(4);
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ bytesLoaded: 4, bytesTotal: 4, percent: 40 }));
  });

  it('rejects truncated downloads instead of handing a partial archive to the parser', async () => {
    await expect(downloadZip('https://www.googleapis.com/drive/v3/files/file123?alt=media', vi.fn(), {
      expectedSize: 4, fetchImpl: vi.fn().mockResolvedValue(createStreamedResponse([[1, 2]])),
    })).rejects.toThrow('incomplete or the file changed');
  });
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
    expect(Array.from(new Uint8Array(await readBlobAsArrayBuffer(blob)))).toEqual([1, 2, 3, 4]);
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

  it.each([undefined, 4])('stops an oversized stream even when its declared length is %s', async (contentLength) => {
    const cancel = vi.fn();
    let produced = 0;
    const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
      if (produced++ < 2) controller.enqueue(new Uint8Array([1, 2, 3, 4]));
      else controller.close();
    });
    const response = new Response(new ReadableStream({ pull, cancel }, { highWaterMark: 0 }), {
      headers: contentLength === undefined ? undefined : { 'content-length': String(contentLength) },
    });

    // The stream is still open at the limit; reject before requesting EOF.
    await expect(downloadZip('https://example.com/data.zip', vi.fn(), {
      fetchImpl: vi.fn().mockResolvedValue(response),
      sizeLimit: 5,
    })).rejects.toThrow('Downloaded archive exceeds size limit');

    expect(pull).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects an oversized declared length before consuming its body', async () => {
    const cancel = vi.fn();
    const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => controller.close());
    const response = new Response(new ReadableStream({ pull, cancel }, { highWaterMark: 0 }), {
      headers: { 'content-length': '6' },
    });

    await expect(downloadZip('https://example.com/data.zip', vi.fn(), {
      fetchImpl: vi.fn().mockResolvedValue(response),
      sizeLimit: 5,
    })).rejects.toThrow('Downloaded archive exceeds size limit');

    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('validates the size of the non-streaming fallback', async () => {
    const response = buildResponse({ blob: vi.fn().mockResolvedValue(new Blob([new Uint8Array(6)])) });

    await expect(downloadZip('https://example.com/data.zip', vi.fn(), {
      fetchImpl: vi.fn().mockResolvedValue(response),
      sizeLimit: 5,
    })).rejects.toThrow('Downloaded archive exceeds size limit');
  });

  it('keeps download progress within its phase when the server undercounts the length', async () => {
    const onProgress = vi.fn();
    await downloadZip('https://example.com/data.zip', onProgress, {
      fetchImpl: vi.fn().mockResolvedValue(createStreamedResponse([[1, 2], [3, 4]], 2)),
    });

    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      percent: 40,
      bytesLoaded: 4,
      bytesTotal: 2,
    }));
  });

  it('rejects downloaded archives over the configured size limit', () => {
    const blob = new Blob([new Uint8Array(10)]);

    expect(() => validateDownloadedArchiveSize(blob, 9)).toThrow(
      'Downloaded archive exceeds size limit'
    );
    expect(() => validateDownloadedArchiveSize(blob, 10)).not.toThrow();
  });
});
