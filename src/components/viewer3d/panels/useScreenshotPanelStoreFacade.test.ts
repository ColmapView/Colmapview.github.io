import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExportStore, useNotificationStore } from '../../../store';
import { useScreenshotPanelStoreFacade } from './useScreenshotPanelStoreFacade';

describe('useScreenshotPanelStoreFacade', () => {
  beforeEach(() => {
    useExportStore.setState(useExportStore.getInitialState(), true);
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
  });

  it('collects screenshot and recording state from the owning stores', () => {
    const getScreenshotBlob = vi.fn().mockResolvedValue(new Blob(['screenshot']));
    const recordGif = vi.fn().mockResolvedValue(new Blob(['gif']));
    const stopRecording = vi.fn();
    useExportStore.setState({
      screenshotSize: '1920x1080',
      screenshotFormat: 'png',
      screenshotHideLogo: true,
      getScreenshotBlob,
      recordGif,
      stopRecording,
      isRecordingGif: true,
      gifRenderProgress: 42,
      gifBlobUrl: 'blob:recording',
      gifDuration: 15,
      gifDownsample: 4,
      gifSpeed: 2,
      recordingFormat: 'mp4',
      recordingQuality: 'ultra',
    });

    const { result } = renderHook(() => useScreenshotPanelStoreFacade());

    expect(result.current.screenshot).toMatchObject({
      size: '1920x1080',
      format: 'png',
      hideLogo: true,
      getScreenshotBlob,
    });
    expect(result.current.recording).toMatchObject({
      recordGif,
      stopRecording,
      isRecordingGif: true,
      gifRenderProgress: 42,
      gifBlobUrl: 'blob:recording',
      gifDuration: 15,
      gifDownsample: 4,
      gifSpeed: 2,
      recordingFormat: 'mp4',
      recordingQuality: 'ultra',
    });
  });

  it('routes facade actions back to export and notification stores', () => {
    const { result } = renderHook(() => useScreenshotPanelStoreFacade());

    act(() => {
      result.current.screenshot.setSize('3840x2160');
      result.current.screenshot.setFormat('webp');
      result.current.screenshot.setHideLogo(true);
      result.current.screenshot.takeScreenshot();
      result.current.recording.setGifDuration(30);
      result.current.recording.setGifDownsample(8);
      result.current.recording.setGifSpeed(4);
      result.current.recording.setRecordingFormat('gif');
      result.current.recording.setRecordingQuality('low');
      result.current.addNotification('info', 'Saved', 500);
    });

    expect(useExportStore.getState()).toMatchObject({
      screenshotSize: '3840x2160',
      screenshotFormat: 'webp',
      screenshotHideLogo: true,
      screenshotTrigger: 1,
      gifDuration: 30,
      gifDownsample: 8,
      gifSpeed: 4,
      recordingFormat: 'gif',
      recordingQuality: 'low',
    });
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({
      type: 'info',
      message: 'Saved',
      duration: 500,
    });
  });
});
