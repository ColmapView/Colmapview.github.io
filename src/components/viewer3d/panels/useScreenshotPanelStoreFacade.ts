import {
  useExportStore,
  useNotificationStore,
  type ExportState,
  type NotificationState,
} from '../../../store';

interface ScreenshotPanelStaticFacade {
  size: ExportState['screenshotSize'];
  format: ExportState['screenshotFormat'];
  hideLogo: boolean;
  setSize: ExportState['setScreenshotSize'];
  setFormat: ExportState['setScreenshotFormat'];
  setHideLogo: ExportState['setScreenshotHideLogo'];
  takeScreenshot: ExportState['takeScreenshot'];
  getScreenshotBlob: ExportState['getScreenshotBlob'];
}

interface ScreenshotPanelRecordingFacade {
  recordGif: ExportState['recordGif'];
  isRecordingGif: boolean;
  gifRenderProgress: number | null;
  gifBlobUrl: string | null;
  gifDuration: number;
  gifDownsample: number;
  gifSpeed: number;
  recordingFormat: ExportState['recordingFormat'];
  recordingQuality: ExportState['recordingQuality'];
  setGifDuration: ExportState['setGifDuration'];
  setGifDownsample: ExportState['setGifDownsample'];
  setGifSpeed: ExportState['setGifSpeed'];
  setRecordingFormat: ExportState['setRecordingFormat'];
  setRecordingQuality: ExportState['setRecordingQuality'];
  downloadGif: ExportState['downloadGif'];
  stopRecording: ExportState['stopRecording'];
}

export interface ScreenshotPanelStoreFacade {
  screenshot: ScreenshotPanelStaticFacade;
  recording: ScreenshotPanelRecordingFacade;
  addNotification: NotificationState['addNotification'];
}

export function useScreenshotPanelStoreFacade(): ScreenshotPanelStoreFacade {
  const screenshotSize = useExportStore((s) => s.screenshotSize);
  const setScreenshotSize = useExportStore((s) => s.setScreenshotSize);
  const screenshotFormat = useExportStore((s) => s.screenshotFormat);
  const setScreenshotFormat = useExportStore((s) => s.setScreenshotFormat);
  const screenshotHideLogo = useExportStore((s) => s.screenshotHideLogo);
  const setScreenshotHideLogo = useExportStore((s) => s.setScreenshotHideLogo);
  const takeScreenshot = useExportStore((s) => s.takeScreenshot);
  const getScreenshotBlob = useExportStore((s) => s.getScreenshotBlob);

  const recordGif = useExportStore((s) => s.recordGif);
  const isRecordingGif = useExportStore((s) => s.isRecordingGif);
  const gifRenderProgress = useExportStore((s) => s.gifRenderProgress);
  const gifBlobUrl = useExportStore((s) => s.gifBlobUrl);
  const gifDuration = useExportStore((s) => s.gifDuration);
  const setGifDuration = useExportStore((s) => s.setGifDuration);
  const gifDownsample = useExportStore((s) => s.gifDownsample);
  const setGifDownsample = useExportStore((s) => s.setGifDownsample);
  const gifSpeed = useExportStore((s) => s.gifSpeed);
  const setGifSpeed = useExportStore((s) => s.setGifSpeed);
  const recordingFormat = useExportStore((s) => s.recordingFormat);
  const setRecordingFormat = useExportStore((s) => s.setRecordingFormat);
  const recordingQuality = useExportStore((s) => s.recordingQuality);
  const setRecordingQuality = useExportStore((s) => s.setRecordingQuality);
  const downloadGif = useExportStore((s) => s.downloadGif);
  const stopRecording = useExportStore((s) => s.stopRecording);
  const addNotification = useNotificationStore((s) => s.addNotification);

  return {
    screenshot: {
      size: screenshotSize,
      format: screenshotFormat,
      hideLogo: screenshotHideLogo,
      setSize: setScreenshotSize,
      setFormat: setScreenshotFormat,
      setHideLogo: setScreenshotHideLogo,
      takeScreenshot,
      getScreenshotBlob,
    },
    recording: {
      recordGif,
      isRecordingGif,
      gifRenderProgress,
      gifBlobUrl,
      gifDuration,
      gifDownsample,
      gifSpeed,
      recordingFormat,
      recordingQuality,
      setGifDuration,
      setGifDownsample,
      setGifSpeed,
      setRecordingFormat,
      setRecordingQuality,
      downloadGif,
      stopRecording,
    },
    addNotification,
  };
}
