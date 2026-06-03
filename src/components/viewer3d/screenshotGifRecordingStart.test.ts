import { describe, expect, it, vi } from 'vitest';
import type GifEncoder from 'gif.js';
import { buildGifEncoderWithHandlers } from '../../test/builders';
import {
  startScreenshotGifRecording,
  type GifRecorderOptions,
} from './screenshotGifRecordingStart';

function ref<T>(current: T) {
  return { current };
}

function createOptions(overrides: Partial<Parameters<typeof startScreenshotGifRecording>[0]> = {}) {
  const { gif, handlers, registrations } = buildGifEncoderWithHandlers();

  return {
    options: {
      sourceWidth: 1920,
      sourceHeight: 1080,
      downsample: 2,
      durationMs: 5000,
      speedFactor: 1.5,
      recordingQuality: 'high' as const,
      hardwareConcurrency: 12,
      workerScript: '/gif.worker.js',
      gifRef: ref<GifEncoder | null>(null),
      gifStartTimeRef: ref(0),
      gifLastFrameTimeRef: ref(9),
      gifResolveRef: ref<((blob: Blob | null) => void) | null>(null),
      gifDurationMsRef: ref(0),
      gifDownsampleFactorRef: ref(0),
      gifSpeedFactorRef: ref(0),
      gifFrameCountRef: ref(7),
      lastProgressNotificationTimeRef: ref(11),
      setGifBlobUrl: vi.fn(),
      setGifRenderProgress: vi.fn(),
      setIsRecordingGif: vi.fn(),
      createGifRecorder: vi.fn(() => gif),
      createObjectUrl: vi.fn(() => 'blob:gif'),
      now: vi.fn(() => 1234),
      ...overrides,
    },
    gif,
    handlers,
    registrations,
  };
}

describe('screenshot GIF recording start helper', () => {
  it('initializes the encoder and GIF recording refs', async () => {
    const { options, gif, handlers, registrations } = createOptions();

    const promise = startScreenshotGifRecording(options);

    expect(options.createGifRecorder).toHaveBeenCalledWith({
      workers: 8,
      quality: 5,
      width: 960,
      height: 540,
      workerScript: '/gif.worker.js',
    } satisfies GifRecorderOptions);
    expect(registrations).toEqual(['finished', 'progress', 'abort']);
    expect(options.gifRef.current).toBe(gif);
    expect(options.gifStartTimeRef.current).toBe(1234);
    expect(options.gifLastFrameTimeRef.current).toBe(0);
    expect(options.gifResolveRef.current).toBeInstanceOf(Function);
    expect(options.gifDurationMsRef.current).toBe(5000);
    expect(options.gifDownsampleFactorRef.current).toBe(2);
    expect(options.gifSpeedFactorRef.current).toBe(1.5);
    expect(options.gifFrameCountRef.current).toBe(0);
    expect(options.lastProgressNotificationTimeRef.current).toBe(0);
    expect(options.setGifRenderProgress).toHaveBeenCalledWith(null);
    expect(options.setIsRecordingGif).toHaveBeenCalledWith(true);

    handlers.abort?.();
    await promise;
  });

  it('updates render progress as the encoder reports progress', async () => {
    const { options, handlers } = createOptions();

    const promise = startScreenshotGifRecording(options);
    handlers.progress?.(0.426);
    handlers.abort?.();

    expect(options.setGifRenderProgress).toHaveBeenCalledWith(43);
    await promise;
  });

  it('stores the GIF blob URL and resolves when encoding finishes', async () => {
    const { options, handlers } = createOptions();
    const blob = new Blob(['gif'], { type: 'image/gif' });

    const promise = startScreenshotGifRecording(options);
    handlers.finished?.(blob, new Uint8Array());

    await expect(promise).resolves.toBe(blob);
    expect(options.createObjectUrl).toHaveBeenCalledWith(blob);
    expect(options.setGifBlobUrl).toHaveBeenCalledWith('blob:gif');
    expect(options.setGifRenderProgress).toHaveBeenLastCalledWith(null);
    expect(options.setIsRecordingGif).toHaveBeenLastCalledWith(false);
  });

  it('clears render progress and resolves null when encoding aborts', async () => {
    const { options, handlers } = createOptions();

    const promise = startScreenshotGifRecording(options);
    handlers.abort?.();

    await expect(promise).resolves.toBeNull();
    expect(options.setGifRenderProgress).toHaveBeenLastCalledWith(null);
    expect(options.setIsRecordingGif).toHaveBeenLastCalledWith(false);
  });
});
