import {
  useExportStore,
  useNotificationStore,
  type ExportState,
  type NotificationState,
} from '../../store';

interface ScreenshotCaptureDataFacade {
  screenshotTrigger: ExportState['screenshotTrigger'];
  screenshotSize: ExportState['screenshotSize'];
  screenshotFormat: ExportState['screenshotFormat'];
  screenshotHideLogo: ExportState['screenshotHideLogo'];
  gifDuration: ExportState['gifDuration'];
  gifDownsample: ExportState['gifDownsample'];
  gifSpeed: ExportState['gifSpeed'];
  recordingQuality: ExportState['recordingQuality'];
  recordingFormat: ExportState['recordingFormat'];
}

interface ScreenshotCaptureActionsFacade {
  setGetScreenshotBlob: ExportState['setGetScreenshotBlob'];
  setRecordGif: ExportState['setRecordGif'];
  setStopRecording: ExportState['setStopRecording'];
  setIsRecordingGif: ExportState['setIsRecordingGif'];
  setGifRenderProgress: ExportState['setGifRenderProgress'];
  setGifBlobUrl: ExportState['setGifBlobUrl'];
  addNotification: NotificationState['addNotification'];
}

export interface ScreenshotCaptureStoreFacade {
  data: ScreenshotCaptureDataFacade;
  actions: ScreenshotCaptureActionsFacade;
}

export function useScreenshotCaptureStoreFacade(): ScreenshotCaptureStoreFacade {
  const screenshotTrigger = useExportStore((s) => s.screenshotTrigger);
  const screenshotSize = useExportStore((s) => s.screenshotSize);
  const screenshotFormat = useExportStore((s) => s.screenshotFormat);
  const screenshotHideLogo = useExportStore((s) => s.screenshotHideLogo);
  const setGetScreenshotBlob = useExportStore((s) => s.setGetScreenshotBlob);
  const setRecordGif = useExportStore((s) => s.setRecordGif);
  const setStopRecording = useExportStore((s) => s.setStopRecording);
  const setIsRecordingGif = useExportStore((s) => s.setIsRecordingGif);
  const setGifRenderProgress = useExportStore((s) => s.setGifRenderProgress);
  const setGifBlobUrl = useExportStore((s) => s.setGifBlobUrl);
  const gifDuration = useExportStore((s) => s.gifDuration);
  const gifDownsample = useExportStore((s) => s.gifDownsample);
  const gifSpeed = useExportStore((s) => s.gifSpeed);
  const recordingQuality = useExportStore((s) => s.recordingQuality);
  const recordingFormat = useExportStore((s) => s.recordingFormat);
  const addNotification = useNotificationStore((s) => s.addNotification);

  return {
    data: {
      screenshotTrigger,
      screenshotSize,
      screenshotFormat,
      screenshotHideLogo,
      gifDuration,
      gifDownsample,
      gifSpeed,
      recordingQuality,
      recordingFormat,
    },
    actions: {
      setGetScreenshotBlob,
      setRecordGif,
      setStopRecording,
      setIsRecordingGif,
      setGifRenderProgress,
      setGifBlobUrl,
      addNotification,
    },
  };
}
