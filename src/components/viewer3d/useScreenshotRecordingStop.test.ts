import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type GifEncoder from 'gif.js';
import { useNotificationStore } from '../../store/stores/notificationStore';
import { buildGifEncoder, buildMediaRecorder } from '../../test/builders';
import { useScreenshotRecordingStop } from './useScreenshotRecordingStop';

function ref<T>(current: T) {
  return { current };
}

function createOptions(overrides: Partial<Parameters<typeof useScreenshotRecordingStop>[0]> = {}) {
  return {
    gifRef: ref<GifEncoder | null>(null),
    gifFrameCount: ref(0),
    webCodecsFrameCount: ref(0),
    webmRecorderRef: ref<MediaRecorder | null>(null),
    isRecordingWebCodecs: ref(false),
    isRecordingWebm: ref(false),
    lastProgressNotificationTimeRef: ref(5),
    finishWebCodecsRecording: vi.fn(),
    setGifRenderProgress: vi.fn(),
    setIsRecordingGif: vi.fn(),
    log: vi.fn(),
    errorLog: vi.fn(),
    ...overrides,
  };
}

describe('useScreenshotRecordingStop', () => {
  afterEach(() => {
    useNotificationStore.getState().clearAll();
  });

  it('renders captured GIF frames and clears the active GIF ref', () => {
    const gif = buildGifEncoder({ render: vi.fn() });
    const options = createOptions({
      gifRef: ref(gif),
      gifFrameCount: ref(4),
    });
    const { result } = renderHook(() => useScreenshotRecordingStop(options));

    act(() => result.current());

    expect(options.gifRef.current).toBeNull();
    expect(options.lastProgressNotificationTimeRef.current).toBe(0);
    expect(options.setGifRenderProgress).toHaveBeenCalledWith(0);
    expect(gif.render).toHaveBeenCalledOnce();
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({
      type: 'info',
      message: 'Rendering 4 frames...',
      duration: 3000,
    });
  });

  it('warns when stopping a GIF before any frame was captured', () => {
    const gif = buildGifEncoder({ render: vi.fn() });
    const options = createOptions({ gifRef: ref(gif), gifFrameCount: ref(0) });
    const { result } = renderHook(() => useScreenshotRecordingStop(options));

    act(() => result.current());

    expect(gif.render).not.toHaveBeenCalled();
    expect(options.setIsRecordingGif).toHaveBeenCalledWith(false);
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({
      type: 'warning',
      message: 'No frames captured',
    });
  });

  it('finishes active WebCodecs recording before MediaRecorder fallback', () => {
    const options = createOptions({
      isRecordingWebCodecs: ref(true),
      isRecordingWebm: ref(true),
      webmRecorderRef: ref(buildMediaRecorder({ stop: vi.fn() })),
      webCodecsFrameCount: ref(12),
    });
    const { result } = renderHook(() => useScreenshotRecordingStop(options));

    act(() => result.current());

    expect(options.finishWebCodecsRecording).toHaveBeenCalledOnce();
    expect(options.webmRecorderRef.current?.stop).not.toHaveBeenCalled();
    expect(options.lastProgressNotificationTimeRef.current).toBe(0);
  });

  it('stops active MediaRecorder recording', () => {
    const recorder = buildMediaRecorder({ stop: vi.fn() });
    const options = createOptions({
      isRecordingWebm: ref(true),
      webmRecorderRef: ref(recorder),
    });
    const { result } = renderHook(() => useScreenshotRecordingStop(options));

    act(() => result.current());

    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(options.lastProgressNotificationTimeRef.current).toBe(0);
  });
});
