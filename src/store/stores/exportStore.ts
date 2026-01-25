import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../migration';
import type { ScreenshotSize, ScreenshotFormat, ExportFormat } from '../types';

// Callback type for getting screenshot blob
export type ScreenshotCallback = () => Promise<Blob | null>;
export type GifRecordCallback = () => Promise<Blob | null>;

export interface ExportState {
  screenshotSize: ScreenshotSize;
  screenshotFormat: ScreenshotFormat;
  screenshotHideLogo: boolean;
  screenshotTrigger: number;
  exportFormat: ExportFormat;
  exportTrigger: number;
  isRecordingGif: boolean;
  gifBlobUrl: string | null;
  gifDuration: number; // in seconds
  gifDownsample: number; // 1, 2, 4, or 8
  gifSpeed: number; // 1, 2, 3, or 4
  recordingQuality: 'low' | 'medium' | 'high' | 'ultra';
  recordingFormat: 'gif' | 'webm' | 'mp4';

  // Callback for getting screenshot blob (set by ScreenshotCapture component)
  getScreenshotBlob: ScreenshotCallback | null;
  recordGif: GifRecordCallback | null;

  setScreenshotSize: (size: ScreenshotSize) => void;
  setScreenshotFormat: (format: ScreenshotFormat) => void;
  setScreenshotHideLogo: (hide: boolean) => void;
  takeScreenshot: () => void;
  setExportFormat: (format: ExportFormat) => void;
  triggerExport: () => void;
  setGetScreenshotBlob: (callback: ScreenshotCallback | null) => void;
  setRecordGif: (callback: GifRecordCallback | null) => void;
  setIsRecordingGif: (recording: boolean) => void;
  setGifBlobUrl: (url: string | null) => void;
  setGifDuration: (duration: number) => void;
  setGifDownsample: (downsample: number) => void;
  setGifSpeed: (speed: number) => void;
  setRecordingQuality: (quality: 'low' | 'medium' | 'high' | 'ultra') => void;
  setRecordingFormat: (format: 'gif' | 'webm' | 'mp4') => void;
  downloadGif: () => void;
}

export const useExportStore = create<ExportState>()(
  persist(
    (set, get) => ({
      screenshotSize: 'current',
      screenshotFormat: 'jpeg',
      screenshotHideLogo: false,
      screenshotTrigger: 0,
      exportFormat: 'binary',
      exportTrigger: 0,
      isRecordingGif: false,
      gifBlobUrl: null,
      gifDuration: 2,
      gifDownsample: 2,
      gifSpeed: 1,
      recordingQuality: 'high',
      recordingFormat: 'webm',
      getScreenshotBlob: null,
      recordGif: null,

      setScreenshotSize: (screenshotSize) => set({ screenshotSize }),
      setScreenshotFormat: (screenshotFormat) => set({ screenshotFormat }),
      setScreenshotHideLogo: (screenshotHideLogo) => set({ screenshotHideLogo }),
      takeScreenshot: () => set((state) => ({ screenshotTrigger: state.screenshotTrigger + 1 })),
      setExportFormat: (exportFormat) => set({ exportFormat }),
      triggerExport: () => set((state) => ({ exportTrigger: state.exportTrigger + 1 })),
      setGetScreenshotBlob: (callback) => set({ getScreenshotBlob: callback }),
      setRecordGif: (callback) => set({ recordGif: callback }),
      setIsRecordingGif: (isRecordingGif) => set({ isRecordingGif }),
      setGifBlobUrl: (gifBlobUrl) => {
        // Revoke old URL if exists
        const oldUrl = get().gifBlobUrl;
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        set({ gifBlobUrl });
      },
      setGifDuration: (gifDuration) => set({ gifDuration }),
      setGifDownsample: (gifDownsample) => set({ gifDownsample }),
      setGifSpeed: (gifSpeed) => set({ gifSpeed }),
      setRecordingQuality: (recordingQuality) => set({ recordingQuality }),
      setRecordingFormat: (recordingFormat) => set({ recordingFormat }),
      downloadGif: () => {
        const url = get().gifBlobUrl;
        const format = get().recordingFormat;
        if (!url) return;
        const ext = format === 'webm' ? 'webm' : format === 'mp4' ? 'mp4' : 'gif';
        const link = document.createElement('a');
        link.download = `colmap-view-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.${ext}`;
        link.href = url;
        link.click();
      },
    }),
    {
      name: STORAGE_KEYS.export,
      version: 0,
      partialize: (state) => ({
        screenshotSize: state.screenshotSize,
        screenshotFormat: state.screenshotFormat,
        screenshotHideLogo: state.screenshotHideLogo,
        exportFormat: state.exportFormat,
        gifDuration: state.gifDuration,
        gifDownsample: state.gifDownsample,
        gifSpeed: state.gifSpeed,
        recordingQuality: state.recordingQuality,
        recordingFormat: state.recordingFormat,
      }),
    }
  )
);
