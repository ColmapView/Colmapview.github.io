/**
 * Screenshot and recording panel extracted from ViewerControls.tsx.
 * Handles static screenshots and dynamic recording (GIF, WebM, MP4).
 */

import { useState, useCallback, memo } from 'react';
import { useExportStore, useNotificationStore } from '../../../store';
import { controlPanelStyles } from '../../../theme';
import { ScreenshotIcon } from '../../../icons';
import { ControlButton, SliderRow, SelectRow, type PanelType } from '../ControlComponents';
import type { ScreenshotSize, ScreenshotFormat } from '../../../store/types';

const styles = controlPanelStyles;

export interface ScreenshotPanelProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

export const ScreenshotPanel = memo(function ScreenshotPanel({
  activePanel,
  setActivePanel,
}: ScreenshotPanelProps) {
  const [recordCountdown, setRecordCountdown] = useState<number | null>(null);

  // Export store values
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
  const downloadGif = useExportStore((s) => s.downloadGif);
  const stopRecording = useExportStore((s) => s.stopRecording);
  const recordingFormat = useExportStore((s) => s.recordingFormat);
  const setRecordingFormat = useExportStore((s) => s.setRecordingFormat);
  const recordingQuality = useExportStore((s) => s.recordingQuality);
  const setRecordingQuality = useExportStore((s) => s.setRecordingQuality);
  const gifSpeed = useExportStore((s) => s.gifSpeed);
  const setGifSpeed = useExportStore((s) => s.setGifSpeed);

  // Copy screenshot to clipboard
  const copyScreenshotToClipboard = useCallback(async () => {
    if (!getScreenshotBlob) return false;
    try {
      const blob = await getScreenshotBlob();
      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        useNotificationStore.getState().addNotification(
          'info',
          'Screenshot copied! Press Ctrl+V to paste',
          4000
        );
        return true;
      }
    } catch (err) {
      console.error('Failed to copy screenshot to clipboard:', err);
    }
    return false;
  }, [getScreenshotBlob]);

  // Start recording with countdown
  const startRecordingWithCountdown = useCallback(() => {
    if (!recordGif || isRecordingGif || recordCountdown !== null) return;

    setRecordCountdown(3);
    useNotificationStore.getState().addNotification('info', 'Countdown (3)', 900);

    const countdown = (count: number) => {
      if (count > 0) {
        setRecordCountdown(count);
        if (count < 3) {
          useNotificationStore.getState().addNotification('info', `Countdown (${count})`, 900);
        }
        setTimeout(() => countdown(count - 1), 1000);
      } else {
        setRecordCountdown(null);
        useNotificationStore.getState().addNotification('info', 'Recording started!', 2000);
        recordGif().then(() => {
          useNotificationStore.getState().addNotification('info', 'Recording complete! Downloading...', 3000);
          // Auto download after a short delay to ensure blob URL is set
          setTimeout(() => {
            downloadGif();
          }, 100);
        });
      }
    };

    countdown(3);
  }, [recordGif, isRecordingGif, recordCountdown, downloadGif]);

  return (
    <ControlButton
      panelId="screenshot"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={<ScreenshotIcon className="w-6 h-6" />}
      tooltip="Save screenshot"
      onClick={takeScreenshot}
      panelTitle="Screenshot"
    >
      <div className={styles.panelContent}>
        <div className="text-ds-primary text-sm mb-1">Static:</div>
        <SelectRow
          label="Size"
          value={screenshotSize}
          onChange={(v) => setScreenshotSize(v as ScreenshotSize)}
          options={[
            { value: 'current', label: 'Current' },
            { value: '1280x720', label: '1280×720' },
            { value: '1920x1080', label: '1920×1080' },
            { value: '3840x2160', label: '3840×2160' },
            { value: '512x512', label: '512×512' },
            { value: '1024x1024', label: '1024×1024' },
            { value: '2048x2048', label: '2048×2048' },
          ]}
        />
        <SelectRow
          label="Format"
          value={screenshotFormat}
          onChange={(v) => setScreenshotFormat(v as ScreenshotFormat)}
          options={[
            { value: 'jpeg', label: 'JPEG' },
            { value: 'png', label: 'PNG' },
            { value: 'webp', label: 'WebP' },
          ]}
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={takeScreenshot}
            className={styles.actionButton}
            style={{ flex: 1 }}
          >
            Save
          </button>
          <button
            onClick={copyScreenshotToClipboard}
            className={styles.actionButton}
            style={{ flex: 1 }}
          >
            Copy
          </button>
        </div>
        <div className="text-ds-primary text-sm mt-3 mb-1">Dynamic:</div>
        <SelectRow
          label="Format"
          value={recordingFormat}
          onChange={(v) => setRecordingFormat(v as 'gif' | 'webm' | 'mp4')}
          options={[
            { value: 'gif', label: 'GIF' },
            { value: 'webm', label: 'WebM' },
            { value: 'mp4', label: 'MP4' },
          ]}
        />
        <SelectRow
          label="Quality"
          value={recordingQuality}
          onChange={(v) => setRecordingQuality(v as 'low' | 'medium' | 'high' | 'ultra')}
          options={[
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'ultra', label: 'Ultra' },
          ]}
        />
        <SliderRow
          label="Duration"
          value={gifDuration}
          min={5}
          max={120}
          step={5}
          onChange={setGifDuration}
          formatValue={(v) => `${v}s`}
          inputMax={3600}
        />
        <SelectRow
          label="Scale"
          value={String(gifDownsample)}
          onChange={(v) => setGifDownsample(Number(v))}
          options={[
            { value: '1', label: '1× (Full)' },
            { value: '2', label: '½' },
            { value: '4', label: '¼' },
            { value: '8', label: '⅛' },
          ]}
        />
        <SelectRow
          label="Speed"
          value={String(gifSpeed)}
          onChange={(v) => setGifSpeed(Number(v))}
          options={[
            { value: '1', label: '1×' },
            { value: '2', label: '2×' },
            { value: '3', label: '3×' },
            { value: '4', label: '4×' },
          ]}
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={startRecordingWithCountdown}
            disabled={isRecordingGif || gifRenderProgress !== null || !recordGif || recordCountdown !== null}
            className={isRecordingGif || gifRenderProgress !== null || recordCountdown !== null ? styles.actionButtonPrimary : styles.actionButton}
            style={{ flex: 1, minWidth: 0 }}
          >
            {recordCountdown !== null
              ? `(${recordCountdown})`
              : gifRenderProgress !== null
                ? `Render ${gifRenderProgress}%`
                : isRecordingGif
                  ? 'Recording...'
                  : 'Record'}
          </button>
          <button
            onClick={isRecordingGif ? stopRecording ?? undefined : downloadGif}
            disabled={recordCountdown !== null || gifRenderProgress !== null || (!isRecordingGif && !gifBlobUrl)}
            className={
              recordCountdown !== null || gifRenderProgress !== null || (!isRecordingGif && !gifBlobUrl)
                ? styles.actionButtonDisabled
                : isRecordingGif
                  ? styles.actionButtonPrimary
                  : styles.actionButton
            }
            style={{ flex: 1, minWidth: 0 }}
          >
            {isRecordingGif ? 'Stop' : 'Save'}
          </button>
        </div>
        <div
          onClick={() => setScreenshotHideLogo(!screenshotHideLogo)}
          className={`group text-sm mt-3 cursor-pointer ${screenshotHideLogo ? 'text-blue-400' : ''}`}
        >
          <div className="mb-1 font-medium">
            {screenshotHideLogo ? '✓ Watermark Removed!' : <span className="underline">Remove watermark:</span>}
          </div>
          <div className={screenshotHideLogo ? '' : 'text-ds-secondary group-hover:text-gray-300 transition-colors'}>By removing watermark, I agree</div>
          <div className={screenshotHideLogo ? '' : 'text-ds-secondary group-hover:text-gray-300 transition-colors'}>to provide proper attribution to</div>
          <div className={screenshotHideLogo ? '' : 'text-ds-secondary group-hover:text-gray-300 transition-colors'}>"ColmapView by OpsiClear"</div>
          <div className={screenshotHideLogo ? '' : 'text-ds-secondary group-hover:text-gray-300 transition-colors'}>when sharing the image.</div>
        </div>
      </div>
    </ControlButton>
  );
});
