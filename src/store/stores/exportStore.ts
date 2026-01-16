import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../migration';
import type { ScreenshotSize, ScreenshotFormat, ExportFormat } from '../types';

export interface ExportState {
  screenshotSize: ScreenshotSize;
  screenshotFormat: ScreenshotFormat;
  screenshotHideLogo: boolean;
  screenshotTrigger: number;
  exportFormat: ExportFormat;
  exportTrigger: number;

  setScreenshotSize: (size: ScreenshotSize) => void;
  setScreenshotFormat: (format: ScreenshotFormat) => void;
  setScreenshotHideLogo: (hide: boolean) => void;
  takeScreenshot: () => void;
  setExportFormat: (format: ExportFormat) => void;
  triggerExport: () => void;
}

export const useExportStore = create<ExportState>()(
  persist(
    (set) => ({
      screenshotSize: 'current',
      screenshotFormat: 'jpeg',
      screenshotHideLogo: false,
      screenshotTrigger: 0,
      exportFormat: 'binary',
      exportTrigger: 0,

      setScreenshotSize: (screenshotSize) => set({ screenshotSize }),
      setScreenshotFormat: (screenshotFormat) => set({ screenshotFormat }),
      setScreenshotHideLogo: (screenshotHideLogo) => set({ screenshotHideLogo }),
      takeScreenshot: () => set((state) => ({ screenshotTrigger: state.screenshotTrigger + 1 })),
      setExportFormat: (exportFormat) => set({ exportFormat }),
      triggerExport: () => set((state) => ({ exportTrigger: state.exportTrigger + 1 })),
    }),
    {
      name: STORAGE_KEYS.export,
      version: 0,
      partialize: (state) => ({
        screenshotSize: state.screenshotSize,
        screenshotFormat: state.screenshotFormat,
        screenshotHideLogo: state.screenshotHideLogo,
        exportFormat: state.exportFormat,
      }),
    }
  )
);
