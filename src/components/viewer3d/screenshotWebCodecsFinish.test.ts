import { describe, expect, it, vi } from 'vitest';
import { buildImageCacheCanvas, buildVideoEncoder } from '../../test/builders';
import type { WebCodecsMuxer } from './screenshotWebCodecsStart';
import { finishScreenshotWebCodecsRecording } from './screenshotWebCodecsFinish';

function ref<T>(current: T) {
  return { current };
}

function createOptions(overrides: Partial<Parameters<typeof finishScreenshotWebCodecsRecording>[0]> = {}) {
  const buffer = new ArrayBuffer(8);
  const blob = new Blob(['mp4'], { type: 'video/mp4' });
  const encoder = buildVideoEncoder({
    flush: vi.fn().mockResolvedValue(undefined),
  });
  const muxer: WebCodecsMuxer = {
    target: { buffer },
    start: vi.fn().mockResolvedValue(undefined),
    addVideoChunk: vi.fn().mockResolvedValue(undefined),
    finalize: vi.fn().mockResolvedValue(undefined),
  };
  const resolve = vi.fn();

  return {
    options: {
      videoEncoderRef: ref<VideoEncoder | null>(encoder),
      muxerRef: ref<WebCodecsMuxer | null>(muxer),
      webCodecsCanvasRef: ref<HTMLCanvasElement | null>(buildImageCacheCanvas()),
      isRecordingWebCodecsRef: ref(true),
      webCodecsFrameCountRef: ref(12),
      webCodecsResolveRef: ref<((blob: Blob | null) => void) | null>(resolve),
      setGifBlobUrl: vi.fn(),
      setIsRecordingGif: vi.fn(),
      createObjectUrl: vi.fn(() => 'blob:mp4'),
      createBlob: vi.fn(() => blob),
      log: vi.fn(),
      errorLog: vi.fn(),
      ...overrides,
    },
    encoder,
    muxer,
    buffer,
    blob,
    resolve,
  };
}

describe('screenshot WebCodecs finish helper', () => {
  it('flushes the encoder, finalizes the muxer, stores the blob URL, and resolves the blob', async () => {
    const { options, encoder, muxer, buffer, blob, resolve } = createOptions();

    await finishScreenshotWebCodecsRecording(options);

    expect(options.log).toHaveBeenCalledWith('WebCodecs recording complete: 12 frames');
    expect(options.videoEncoderRef.current).toBeNull();
    expect(options.muxerRef.current).toBeNull();
    expect(options.webCodecsCanvasRef.current).toBeNull();
    expect(options.isRecordingWebCodecsRef.current).toBe(false);
    expect(encoder.flush).toHaveBeenCalledOnce();
    expect(muxer.finalize).toHaveBeenCalledOnce();
    expect(options.createBlob).toHaveBeenCalledWith(buffer);
    expect(options.createObjectUrl).toHaveBeenCalledWith(blob);
    expect(options.setGifBlobUrl).toHaveBeenCalledWith('blob:mp4');
    expect(options.setIsRecordingGif).toHaveBeenCalledWith(false);
    expect(resolve).toHaveBeenCalledWith(blob);
  });

  it('does nothing when finish is already in progress or completed', async () => {
    const { options } = createOptions({
      videoEncoderRef: ref<VideoEncoder | null>(null),
    });

    await finishScreenshotWebCodecsRecording(options);

    expect(options.log).toHaveBeenCalledWith('finishWebCodecsRecording: refs already null');
    expect(options.setGifBlobUrl).not.toHaveBeenCalled();
    expect(options.setIsRecordingGif).not.toHaveBeenCalled();
  });

  it('clears recording state and resolves null when finalization fails', async () => {
    const error = new Error('flush failed');
    const { options, encoder, resolve } = createOptions();
    vi.mocked(encoder.flush).mockRejectedValue(error);

    await finishScreenshotWebCodecsRecording(options);

    expect(options.videoEncoderRef.current).toBeNull();
    expect(options.muxerRef.current).toBeNull();
    expect(options.webCodecsCanvasRef.current).toBeNull();
    expect(options.isRecordingWebCodecsRef.current).toBe(false);
    expect(options.errorLog).toHaveBeenCalledWith('Error finalizing WebCodecs recording:', error);
    expect(options.setIsRecordingGif).toHaveBeenCalledWith(false);
    expect(resolve).toHaveBeenCalledWith(null);
  });

  it('resolves null when finalized muxer has no output buffer', async () => {
    const { options, resolve } = createOptions({
      muxerRef: ref<WebCodecsMuxer | null>({
        target: { buffer: null },
        start: vi.fn().mockResolvedValue(undefined),
        addVideoChunk: vi.fn().mockResolvedValue(undefined),
        finalize: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await finishScreenshotWebCodecsRecording(options);

    expect(options.errorLog).toHaveBeenCalledWith(
      'Error finalizing WebCodecs recording:',
      expect.any(Error)
    );
    expect(options.setIsRecordingGif).toHaveBeenCalledWith(false);
    expect(resolve).toHaveBeenCalledWith(null);
  });
});
