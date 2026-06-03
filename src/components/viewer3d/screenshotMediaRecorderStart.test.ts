import { describe, expect, it, vi } from 'vitest';
import {
  buildBlobEvent,
  buildCaptureStreamCanvas,
  buildMediaRecorder,
  buildMediaStream,
} from '../../test/builders';
import { startScreenshotMediaRecorderRecording } from './screenshotMediaRecorderStart';

function ref<T>(current: T) {
  return { current };
}

function createOptions(overrides: Partial<Parameters<typeof startScreenshotMediaRecorderRecording>[0]> = {}) {
  const stream = buildMediaStream();
  const recorder = buildMediaRecorder({ start: vi.fn() });
  const canvas = buildCaptureStreamCanvas({
    captureStream: vi.fn(() => stream),
  });

  return {
    options: {
      format: 'webm' as const,
      sourceWidth: 1920,
      sourceHeight: 1080,
      downsample: 2,
      durationMs: 3000,
      speedFactor: 1.5,
      recordingQuality: 'medium' as const,
      webmRecorderRef: ref<MediaRecorder | null>(null),
      webmCanvasRef: ref<HTMLCanvasElement | null>(null),
      webmStartTimeRef: ref(0),
      webmDurationMsRef: ref(0),
      webmChunksRef: ref<Blob[]>([new Blob(['stale'])]),
      webmResolveRef: ref<((blob: Blob | null) => void) | null>(null),
      isRecordingWebmRef: ref(false),
      webmSpeedFactorRef: ref(0),
      webmFrameCounterRef: ref(5),
      webmLastFrameTimeRef: ref(7),
      lastProgressNotificationTimeRef: ref(9),
      setGifBlobUrl: vi.fn(),
      setIsRecordingGif: vi.fn(),
      createCanvas: vi.fn(() => canvas),
      createRecorder: vi.fn(() => recorder),
      isTypeSupported: vi.fn((mimeType: string) => mimeType === 'video/webm;codecs=vp9'),
      createObjectUrl: vi.fn(() => 'blob:recording'),
      now: vi.fn(() => 1234),
      log: vi.fn(),
      warn: vi.fn(),
      ...overrides,
    },
    recorder,
    canvas,
    stream,
  };
}

describe('screenshot MediaRecorder start helper', () => {
  it('initializes recorder state and starts recording with derived dimensions', async () => {
    const { options, recorder, canvas, stream } = createOptions();

    const promise = startScreenshotMediaRecorderRecording(options);

    expect(options.createCanvas).toHaveBeenCalledWith(960, 540);
    expect(canvas.captureStream).toHaveBeenCalledWith(30);
    expect(options.createRecorder).toHaveBeenCalledWith(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 5_000_000,
    });
    expect(recorder.start).toHaveBeenCalledOnce();
    expect(options.setIsRecordingGif).toHaveBeenCalledWith(true);
    expect(options.webmCanvasRef.current).toBe(canvas);
    expect(options.webmRecorderRef.current).toBe(recorder);
    expect(options.webmStartTimeRef.current).toBe(1234);
    expect(options.webmDurationMsRef.current).toBe(3000);
    expect(options.webmSpeedFactorRef.current).toBe(1.5);
    expect(options.webmFrameCounterRef.current).toBe(0);
    expect(options.webmLastFrameTimeRef.current).toBe(0);
    expect(options.lastProgressNotificationTimeRef.current).toBe(0);

    recorder.onstop?.(new Event('stop'));
    await expect(promise).resolves.toBeInstanceOf(Blob);
  });

  it('collects recorder chunks and resolves a blob URL when stopped', async () => {
    const { options, recorder } = createOptions();
    const promise = startScreenshotMediaRecorderRecording(options);
    const firstChunk = new Blob(['first'], { type: 'video/webm' });
    const emptyChunk = new Blob([]);
    const secondChunk = new Blob(['second'], { type: 'video/webm' });

    recorder.ondataavailable?.(buildBlobEvent(firstChunk));
    recorder.ondataavailable?.(buildBlobEvent(emptyChunk));
    recorder.ondataavailable?.(buildBlobEvent(secondChunk));
    recorder.onstop?.(new Event('stop'));

    const blob = await promise;
    expect(blob?.type).toBe('video/webm');
    expect(options.webmChunksRef.current).toEqual([firstChunk, secondChunk]);
    expect(options.createObjectUrl).toHaveBeenCalledWith(blob);
    expect(options.setGifBlobUrl).toHaveBeenCalledWith('blob:recording');
    expect(options.setIsRecordingGif).toHaveBeenLastCalledWith(false);
    expect(options.isRecordingWebmRef.current).toBe(false);
    expect(options.webmRecorderRef.current).toBeNull();
    expect(options.webmCanvasRef.current).toBeNull();
  });

  it('warns and falls back to WebM MIME when MP4 recording is unsupported', async () => {
    const { options, recorder, stream } = createOptions({
      format: 'mp4',
      isTypeSupported: vi.fn((mimeType: string) => mimeType === 'video/webm'),
    });

    const promise = startScreenshotMediaRecorderRecording(options);

    expect(options.warn).toHaveBeenCalledWith('MP4 not supported, falling back to WebM');
    expect(options.createRecorder).toHaveBeenCalledWith(stream, {
      mimeType: 'video/webm',
      videoBitsPerSecond: 5_000_000,
    });

    recorder.onstop?.(new Event('stop'));
    await promise;
  });
});
