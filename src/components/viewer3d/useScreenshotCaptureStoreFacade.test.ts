import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useExportStore,
  useNotificationStore,
} from '../../store';
import type {
  GifRecordCallback,
  ScreenshotCallback,
  StopRecordingCallback,
} from '../../store/stores/exportStore';
import { useScreenshotCaptureStoreFacade } from './useScreenshotCaptureStoreFacade';

describe('useScreenshotCaptureStoreFacade', () => {
  beforeEach(() => {
    useExportStore.setState(useExportStore.getInitialState(), true);
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
  });

  it('collects screenshot capture dependencies from the export store', () => {
    useExportStore.setState({
      screenshotTrigger: 3,
      screenshotSize: '1920x1080',
      screenshotFormat: 'png',
      screenshotHideLogo: true,
      gifDuration: 7,
      gifDownsample: 4,
      gifSpeed: 2,
      recordingQuality: 'ultra',
      recordingFormat: 'mp4',
    });

    const { result } = renderHook(() => useScreenshotCaptureStoreFacade());

    expect(result.current.data).toEqual({
      screenshotTrigger: 3,
      screenshotSize: '1920x1080',
      screenshotFormat: 'png',
      screenshotHideLogo: true,
      gifDuration: 7,
      gifDownsample: 4,
      gifSpeed: 2,
      recordingQuality: 'ultra',
      recordingFormat: 'mp4',
    });
  });

  it('routes capture callbacks, recording state, and notifications to owning stores', () => {
    const screenshotCallback: ScreenshotCallback = vi.fn().mockResolvedValue(new Blob(['shot']));
    const recordGif: GifRecordCallback = vi.fn().mockResolvedValue(new Blob(['gif']));
    const stopRecording: StopRecordingCallback = vi.fn();

    const { result } = renderHook(() => useScreenshotCaptureStoreFacade());

    act(() => {
      result.current.actions.setGetScreenshotBlob(screenshotCallback);
      result.current.actions.setRecordGif(recordGif);
      result.current.actions.setStopRecording(stopRecording);
      result.current.actions.setIsRecordingGif(true);
      result.current.actions.setGifRenderProgress(42);
      result.current.actions.setGifBlobUrl('blob:screenshot');
      result.current.actions.addNotification('info', 'Rendering video', 4500);
    });

    expect(useExportStore.getState()).toMatchObject({
      getScreenshotBlob: screenshotCallback,
      recordGif,
      stopRecording,
      isRecordingGif: true,
      gifRenderProgress: 42,
      gifBlobUrl: 'blob:screenshot',
    });
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({
      type: 'info',
      message: 'Rendering video',
      duration: 4500,
    });
  });
});
