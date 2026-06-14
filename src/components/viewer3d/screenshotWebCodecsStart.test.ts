import { describe, expect, it, vi } from 'vitest';
import {
  buildEncodedVideoChunk,
  buildEncodedVideoChunkMetadata,
  buildImageCacheCanvas,
  buildVideoEncoder,
  type TestVideoEncoder,
} from '../../test/builders';
import {
  startScreenshotWebCodecsRecording,
  type WebCodecsMuxer,
} from './screenshotWebCodecsStart';

function ref<T>(current: T) {
  return { current };
}

function createOptions(overrides: Partial<Parameters<typeof startScreenshotWebCodecsRecording>[0]> = {}) {
  let encoder: TestVideoEncoder | null = null;
  const canvas = buildImageCacheCanvas();
  const muxer: WebCodecsMuxer = {
    target: { buffer: new ArrayBuffer(0) },
    start: vi.fn().mockResolvedValue(undefined),
    addVideoChunk: vi.fn().mockResolvedValue(undefined),
    finalize: vi.fn().mockResolvedValue(undefined),
  };

  return {
    options: {
      sourceWidth: 1921,
      sourceHeight: 1081,
      downsample: 2,
      durationMs: 4000,
      speedFactor: 1.5,
      recordingQuality: 'medium' as const,
      videoEncoderRef: ref<VideoEncoder | null>(null),
      muxerRef: ref<WebCodecsMuxer | null>(null),
      webCodecsCanvasRef: ref<HTMLCanvasElement | null>(null),
      webCodecsStartTimeRef: ref(0),
      webCodecsDurationMsRef: ref(0),
      webCodecsSpeedFactorRef: ref(0),
      webCodecsFrameCountRef: ref(8),
      webCodecsLastFrameTimeRef: ref(9),
      isRecordingWebCodecsRef: ref(false),
      webCodecsResolveRef: ref<((blob: Blob | null) => void) | null>(null),
      lastProgressNotificationTimeRef: ref(12),
      setIsRecordingGif: vi.fn(),
      createMuxer: vi.fn(() => muxer),
      createEncoder: vi.fn((init: VideoEncoderInit) => {
        encoder = buildVideoEncoder({ init, configure: vi.fn(), close: vi.fn() });
        return encoder;
      }),
      createCanvas: vi.fn(() => canvas),
      now: vi.fn(() => 1234),
      log: vi.fn(),
      errorLog: vi.fn(),
      ...overrides,
    },
    get encoder() {
      return encoder;
    },
    muxer,
    canvas,
  };
}

describe('screenshot WebCodecs start helper', () => {
  it('configures encoder, starts muxer, creates canvas, and initializes refs', async () => {
    const fixture = createOptions();

    void startScreenshotWebCodecsRecording(fixture.options);
    await Promise.resolve();

    expect(fixture.options.createMuxer).toHaveBeenCalledWith({ width: 960, height: 540 });
    expect(fixture.muxer.start).toHaveBeenCalledOnce();
    expect(fixture.encoder?.configure).toHaveBeenCalledWith({
      codec: 'avc1.64001f',
      width: 960,
      height: 540,
      bitrate: 5_000_000,
      framerate: 30,
    });
    expect(fixture.options.createCanvas).toHaveBeenCalledWith(960, 540);
    expect(fixture.options.videoEncoderRef.current).toBe(fixture.encoder);
    expect(fixture.options.muxerRef.current).toBe(fixture.muxer);
    expect(fixture.options.webCodecsCanvasRef.current).toBe(fixture.canvas);
    expect(fixture.options.webCodecsStartTimeRef.current).toBe(1234);
    expect(fixture.options.webCodecsDurationMsRef.current).toBe(4000);
    expect(fixture.options.webCodecsSpeedFactorRef.current).toBe(1.5);
    expect(fixture.options.webCodecsFrameCountRef.current).toBe(0);
    expect(fixture.options.webCodecsLastFrameTimeRef.current).toBe(0);
    expect(fixture.options.isRecordingWebCodecsRef.current).toBe(true);
    expect(fixture.options.webCodecsResolveRef.current).toBeInstanceOf(Function);
    expect(fixture.options.lastProgressNotificationTimeRef.current).toBe(0);
    expect(fixture.options.setIsRecordingGif).toHaveBeenCalledWith(true);
  });

  it('forwards encoded chunks to the muxer', async () => {
    const fixture = createOptions();
    void startScreenshotWebCodecsRecording(fixture.options);
    await Promise.resolve();
    const chunk = buildEncodedVideoChunk({ byteLength: 12, timestamp: 42 });
    const meta = buildEncodedVideoChunkMetadata();

    fixture.encoder?.init?.output(chunk, meta);

    expect(fixture.muxer.addVideoChunk).toHaveBeenCalledWith(chunk, meta);
  });

  it('clears active recording state and rejects on encoder errors', async () => {
    const error = new Error('encoder failed');
    const fixture = createOptions({
      isRecordingWebCodecsRef: ref(true),
    });

    const promise = startScreenshotWebCodecsRecording(fixture.options);
    await Promise.resolve();
    fixture.encoder?.init?.error(error);

    await expect(promise).rejects.toBe(error);
    expect(fixture.options.errorLog).toHaveBeenCalledWith('VideoEncoder error:', error);
    expect(fixture.options.setIsRecordingGif).toHaveBeenCalledWith(false);
    expect(fixture.options.isRecordingWebCodecsRef.current).toBe(false);
  });

  it('rejects and avoids ref initialization when encoder configuration fails', async () => {
    const error = new Error('unsupported codec');
    const { options } = createOptions({
      createEncoder: vi.fn((init: VideoEncoderInit) =>
        buildVideoEncoder({
          init,
          configure: vi.fn(() => {
            throw error;
          }),
        })
      ),
    });

    await expect(startScreenshotWebCodecsRecording(options)).rejects.toBe(error);
    expect(options.errorLog).toHaveBeenCalledWith('VideoEncoder configure failed:', error);
    expect(options.videoEncoderRef.current).toBeNull();
    expect(options.muxerRef.current).toBeNull();
    expect(options.webCodecsCanvasRef.current).toBeNull();
    expect(options.setIsRecordingGif).not.toHaveBeenCalled();
  });

  it('rejects and avoids ref initialization when muxer start fails', async () => {
    const error = new Error('muxer failed');
    const fixture = createOptions();
    vi.mocked(fixture.muxer.start).mockRejectedValue(error);

    await expect(startScreenshotWebCodecsRecording(fixture.options)).rejects.toBe(error);
    expect(fixture.options.errorLog).toHaveBeenCalledWith('MP4 muxer start failed:', error);
    expect(fixture.encoder?.close).toHaveBeenCalledOnce();
    expect(fixture.options.videoEncoderRef.current).toBeNull();
    expect(fixture.options.muxerRef.current).toBeNull();
    expect(fixture.options.webCodecsCanvasRef.current).toBeNull();
    expect(fixture.options.setIsRecordingGif).not.toHaveBeenCalled();
  });
});
