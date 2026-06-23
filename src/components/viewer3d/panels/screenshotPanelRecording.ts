import type { CSSProperties } from 'react';
import type { ScreenshotFormat, ScreenshotSize } from '../../../store/types';

export type PanelRecordingFormat = 'gif' | 'webm' | 'mp4';
export type PanelRecordingQuality = 'low' | 'medium' | 'high' | 'ultra';

type RecordingNotification = (type: 'info' | 'warning', message: string, duration?: number) => void;
type TimerScheduler = (callback: () => void, delay: number) => unknown;

export const SCREENSHOT_SIZE_OPTIONS: { value: ScreenshotSize; label: string }[] = [
  { value: 'current', label: 'Current' },
  { value: '1280x720', label: '1280×720' },
  { value: '1920x1080', label: '1920×1080' },
  { value: '3840x2160', label: '3840×2160' },
  { value: '512x512', label: '512×512' },
  { value: '1024x1024', label: '1024×1024' },
  { value: '2048x2048', label: '2048×2048' },
];

export const SCREENSHOT_FORMAT_OPTIONS: { value: ScreenshotFormat; label: string }[] = [
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
];

export const RECORDING_FORMAT_OPTIONS: { value: PanelRecordingFormat; label: string }[] = [
  { value: 'gif', label: 'GIF' },
  { value: 'webm', label: 'WebM' },
  { value: 'mp4', label: 'MP4' },
];

export const RECORDING_QUALITY_OPTIONS: { value: PanelRecordingQuality; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'ultra', label: 'Ultra' },
];

export const GIF_DOWNSAMPLE_OPTIONS = [
  { value: '1', label: '1× (Full)' },
  { value: '2', label: '½' },
  { value: '4', label: '¼' },
  { value: '8', label: '⅛' },
];

export const GIF_SPEED_OPTIONS = [
  { value: '1', label: '1×' },
  { value: '2', label: '2×' },
  { value: '3', label: '3×' },
  { value: '4', label: '4×' },
];

export interface StartRecordingCountdownOptions {
  addNotification: RecordingNotification;
  downloadGif: () => void;
  isRecordingGif: boolean;
  recordCountdown: number | null;
  recordGif: (() => Promise<Blob | null>) | null;
  schedule?: TimerScheduler;
  setRecordCountdown: (countdown: number | null) => void;
}

export function startRecordingCountdown({
  addNotification,
  downloadGif,
  isRecordingGif,
  recordCountdown,
  recordGif,
  schedule = setTimeout,
  setRecordCountdown,
}: StartRecordingCountdownOptions): boolean {
  if (!recordGif || isRecordingGif || recordCountdown !== null) return false;

  setRecordCountdown(3);
  addNotification('info', 'Countdown (3)', 900);

  const countdown = (count: number) => {
    if (count > 0) {
      setRecordCountdown(count);
      if (count < 3) {
        addNotification('info', `Countdown (${count})`, 900);
      }
      schedule(() => countdown(count - 1), 1000);
      return;
    }

    setRecordCountdown(null);
    addNotification('info', 'Recording started!', 2000);
    recordGif().then(() => {
      addNotification('info', 'Recording complete! Downloading...', 3000);
      schedule(downloadGif, 100);
    }).catch(() => {
      // The recording promise can reject (e.g. a muxer/encoder write failure);
      // surface it instead of leaving an unhandled rejection and no feedback.
      addNotification('warning', 'Recording failed. Please try again.', 4000);
    });
  };

  countdown(3);
  return true;
}

export interface RecordButtonStateOptions {
  gifRenderProgress: number | null;
  hasRecordGif: boolean;
  isRecordingGif: boolean;
  recordCountdown: number | null;
}

export interface RecordButtonState {
  disabled: boolean;
  label: string;
  style: 'default' | 'primary';
}

export function getRecordButtonState({
  gifRenderProgress,
  hasRecordGif,
  isRecordingGif,
  recordCountdown,
}: RecordButtonStateOptions): RecordButtonState {
  return {
    disabled: isRecordingGif || gifRenderProgress !== null || !hasRecordGif || recordCountdown !== null,
    label: getRecordButtonLabel({ gifRenderProgress, isRecordingGif, recordCountdown }),
    style: isRecordingGif || gifRenderProgress !== null || recordCountdown !== null ? 'primary' : 'default',
  };
}

export interface SaveRecordingButtonStateOptions {
  gifBlobUrl: string | null;
  gifRenderProgress: number | null;
  isRecordingGif: boolean;
  recordCountdown: number | null;
}

export interface SaveRecordingButtonState {
  disabled: boolean;
  label: 'Save' | 'Stop';
  style: 'default' | 'disabled' | 'primary';
}

export function getSaveRecordingButtonState({
  gifBlobUrl,
  gifRenderProgress,
  isRecordingGif,
  recordCountdown,
}: SaveRecordingButtonStateOptions): SaveRecordingButtonState {
  const disabled = recordCountdown !== null || gifRenderProgress !== null || (!isRecordingGif && !gifBlobUrl);

  return {
    disabled,
    label: isRecordingGif ? 'Stop' : 'Save',
    style: disabled ? 'disabled' : isRecordingGif ? 'primary' : 'default',
  };
}

function getRecordButtonLabel({
  gifRenderProgress,
  isRecordingGif,
  recordCountdown,
}: Pick<RecordButtonStateOptions, 'gifRenderProgress' | 'isRecordingGif' | 'recordCountdown'>): string {
  if (recordCountdown !== null) return `(${recordCountdown})`;
  if (gifRenderProgress !== null) return `Render ${gifRenderProgress}%`;
  if (isRecordingGif) return 'Recording...';
  return 'Record';
}

export function getRecordingActionButtonStyle(): CSSProperties {
  return { flex: 1, minWidth: 0 };
}
