import { describe, expect, it, vi } from 'vitest';
import type GifEncoder from 'gif.js';
import * as THREE from 'three';
import {
  buildGifEncoder,
  buildImageCacheCanvas,
  buildMediaRecorder,
  buildRecordingRenderer,
  buildVideoEncoder,
  buildVideoFrame,
} from '../../test/builders';
import {
  tickGifRecordingFrame,
  tickMediaRecorderRecordingFrame,
  tickWebCodecsRecordingFrame,
} from './screenshotRecordingFrameTicks';

function ref<T>(current: T) {
  return { current };
}

function createBaseOptions(overrides: Record<string, unknown> = {}) {
  return {
    gl: buildRecordingRenderer({
      domElement: buildImageCacheCanvas(),
      render: vi.fn(),
    }),
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    addLogoToCanvas: vi.fn(),
    screenshotHideLogo: false,
    lastProgressNotificationTimeRef: ref(0),
    showProgressNotification: vi.fn(),
    now: vi.fn(() => 1040),
    warn: vi.fn(),
    ...overrides,
  };
}

describe('screenshot recording frame ticks', () => {
  it('captures due GIF frames with downsample and speed-adjusted delay', () => {
    const gif = buildGifEncoder({
      addFrame: vi.fn(),
      render: vi.fn(),
    });
    const canvas = buildImageCacheCanvas();
    const captureDownsampledFrame = vi.fn(() => canvas);
    const options = {
      ...createBaseOptions(),
      gifRef: ref<GifEncoder | null>(gif),
      gifStartTimeRef: ref(1000),
      gifLastFrameTimeRef: ref(0),
      gifDurationMsRef: ref(5000),
      gifDownsampleFactorRef: ref(2),
      gifSpeedFactorRef: ref(2),
      gifFrameCountRef: ref(0),
      setGifRenderProgress: vi.fn(),
      setIsRecordingGif: vi.fn(),
      addNotification: vi.fn(),
      errorLog: vi.fn(),
      captureDownsampledFrame,
    };

    tickGifRecordingFrame(options);

    expect(captureDownsampledFrame).toHaveBeenCalledWith(expect.objectContaining({
      downsample: 2,
      screenshotHideLogo: false,
    }));
    expect(gif.addFrame).toHaveBeenCalledWith(canvas, { delay: 17, copy: true });
    expect(options.gifFrameCountRef.current).toBe(1);
    expect(options.gifLastFrameTimeRef.current).toBe(40);
    expect(options.setGifRenderProgress).not.toHaveBeenCalled();
  });

  it('finishes GIF recording before trying to capture another frame', () => {
    const gif = buildGifEncoder({
      addFrame: vi.fn(),
      render: vi.fn(),
    });
    const captureDownsampledFrame = vi.fn();
    const addNotification = vi.fn();
    const options = {
      ...createBaseOptions({
        now: vi.fn(() => 2500),
        lastProgressNotificationTimeRef: ref(5),
      }),
      gifRef: ref<GifEncoder | null>(gif),
      gifStartTimeRef: ref(1000),
      gifLastFrameTimeRef: ref(1200),
      gifDurationMsRef: ref(1000),
      gifDownsampleFactorRef: ref(2),
      gifSpeedFactorRef: ref(1),
      gifFrameCountRef: ref(4),
      setGifRenderProgress: vi.fn(),
      setIsRecordingGif: vi.fn(),
      addNotification,
      errorLog: vi.fn(),
      captureDownsampledFrame,
    };

    tickGifRecordingFrame(options);

    expect(options.gifRef.current).toBeNull();
    expect(options.lastProgressNotificationTimeRef.current).toBe(0);
    expect(options.setGifRenderProgress).toHaveBeenCalledWith(0);
    expect(addNotification).toHaveBeenCalledWith('info', 'Rendering 4 frames...', 3000);
    expect(gif.render).toHaveBeenCalledOnce();
    expect(captureDownsampledFrame).not.toHaveBeenCalled();
  });

  it('encodes due WebCodecs frames with speed-adjusted timestamps and keyframes', () => {
    const encoder = buildVideoEncoder({ encode: vi.fn() });
    const canvas = buildImageCacheCanvas();
    const frame = buildVideoFrame({ close: vi.fn() });
    const drawFrameToCanvas = vi.fn();
    const createVideoFrame = vi.fn(() => frame);
    const options = {
      ...createBaseOptions(),
      videoEncoderRef: ref<VideoEncoder | null>(encoder),
      webCodecsCanvasRef: ref<HTMLCanvasElement | null>(canvas),
      webCodecsStartTimeRef: ref(1000),
      webCodecsDurationMsRef: ref(5000),
      webCodecsSpeedFactorRef: ref(2),
      webCodecsFrameCountRef: ref(30),
      webCodecsLastFrameTimeRef: ref(0),
      isRecordingWebCodecsRef: ref(true),
      finishWebCodecsRecording: vi.fn(),
      createVideoFrame,
      drawFrameToCanvas,
      log: vi.fn(),
    };

    tickWebCodecsRecordingFrame(options);

    expect(drawFrameToCanvas).toHaveBeenCalledWith(expect.objectContaining({ canvas }));
    expect(createVideoFrame).toHaveBeenCalledWith(canvas, 500000);
    expect(encoder.encode).toHaveBeenCalledWith(frame, { keyFrame: true });
    expect(frame.close).toHaveBeenCalledOnce();
    expect(options.webCodecsFrameCountRef.current).toBe(31);
    expect(options.webCodecsLastFrameTimeRef.current).toBe(40);
  });

  it('finishes WebCodecs recording when duration is reached', () => {
    const finishWebCodecsRecording = vi.fn();
    const drawFrameToCanvas = vi.fn();
    const options = {
      ...createBaseOptions({ now: vi.fn(() => 6000) }),
      videoEncoderRef: ref<VideoEncoder | null>(buildVideoEncoder({ encode: vi.fn() })),
      webCodecsCanvasRef: ref<HTMLCanvasElement | null>(buildImageCacheCanvas()),
      webCodecsStartTimeRef: ref(1000),
      webCodecsDurationMsRef: ref(5000),
      webCodecsSpeedFactorRef: ref(1),
      webCodecsFrameCountRef: ref(12),
      webCodecsLastFrameTimeRef: ref(100),
      isRecordingWebCodecsRef: ref(true),
      finishWebCodecsRecording,
      drawFrameToCanvas,
      log: vi.fn(),
    };

    tickWebCodecsRecordingFrame(options);

    expect(options.showProgressNotification).toHaveBeenCalledWith(5000, 5000);
    expect(options.lastProgressNotificationTimeRef.current).toBe(0);
    expect(finishWebCodecsRecording).toHaveBeenCalledOnce();
    expect(drawFrameToCanvas).not.toHaveBeenCalled();
  });

  it('captures MediaRecorder frames and reports progress at the configured cadence', () => {
    const recorder = buildMediaRecorder({ stop: vi.fn() });
    const canvas = buildImageCacheCanvas();
    const drawFrameToCanvas = vi.fn();
    const options = {
      ...createBaseOptions({ now: vi.fn(() => 5000) }),
      webmRecorderRef: ref<MediaRecorder | null>(recorder),
      webmCanvasRef: ref<HTMLCanvasElement | null>(canvas),
      webmStartTimeRef: ref(0),
      webmDurationMsRef: ref(10000),
      isRecordingWebmRef: ref(true),
      webmSpeedFactorRef: ref(1),
      webmLastFrameTimeRef: ref(0),
      drawFrameToCanvas,
    };

    tickMediaRecorderRecordingFrame(options);

    expect(options.showProgressNotification).toHaveBeenCalledWith(5000, 10000);
    expect(options.lastProgressNotificationTimeRef.current).toBe(5);
    expect(drawFrameToCanvas).toHaveBeenCalledWith(expect.objectContaining({ canvas }));
    expect(options.webmLastFrameTimeRef.current).toBe(5000);
    expect(recorder.stop).not.toHaveBeenCalled();
  });

  it('stops MediaRecorder when the speed-adjusted duration is reached', () => {
    const recorder = buildMediaRecorder({ stop: vi.fn() });
    const drawFrameToCanvas = vi.fn();
    const options = {
      ...createBaseOptions({ now: vi.fn(() => 1000) }),
      webmRecorderRef: ref<MediaRecorder | null>(recorder),
      webmCanvasRef: ref<HTMLCanvasElement | null>(buildImageCacheCanvas()),
      webmStartTimeRef: ref(0),
      webmDurationMsRef: ref(2000),
      isRecordingWebmRef: ref(true),
      webmSpeedFactorRef: ref(2),
      webmLastFrameTimeRef: ref(0),
      drawFrameToCanvas,
    };

    tickMediaRecorderRecordingFrame(options);

    expect(options.lastProgressNotificationTimeRef.current).toBe(0);
    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(drawFrameToCanvas).not.toHaveBeenCalled();
  });
});
