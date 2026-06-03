/**
 * Screenshot and recording panel extracted from ViewerControls.tsx.
 * Handles static screenshots and dynamic recording (GIF, WebM, MP4).
 */

import { useState, useCallback, memo } from 'react';
import { controlPanelStyles } from '../../../theme';
import { ScreenshotIcon } from '../../../icons';
import { ControlButton, SliderRow, SelectRow, type PanelType } from '../ControlComponents';
import { copyScreenshotToClipboard } from '../../../utils/clipboard';
import {
  GIF_DOWNSAMPLE_OPTIONS,
  GIF_SPEED_OPTIONS,
  RECORDING_FORMAT_OPTIONS,
  RECORDING_QUALITY_OPTIONS,
  SCREENSHOT_FORMAT_OPTIONS,
  SCREENSHOT_SIZE_OPTIONS,
  getRecordButtonState,
  getRecordingActionButtonStyle,
  getSaveRecordingButtonState,
  startRecordingCountdown,
} from './screenshotPanelRecording';
import { useScreenshotPanelStoreFacade } from './useScreenshotPanelStoreFacade';

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
  const {
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
      setGifDuration,
      gifDownsample,
      setGifDownsample,
      downloadGif,
      stopRecording,
      recordingFormat,
      setRecordingFormat,
      recordingQuality,
      setRecordingQuality,
      gifSpeed,
      setGifSpeed,
    },
    addNotification,
  } = useScreenshotPanelStoreFacade();

  const handleCopyScreenshotToClipboard = useCallback(async () => {
    return copyScreenshotToClipboard(getScreenshotBlob, {
      addNotification,
    });
  }, [addNotification, getScreenshotBlob]);

  // Start recording with countdown
  const startRecordingWithCountdown = useCallback(() => {
    startRecordingCountdown({
      addNotification,
      downloadGif,
      isRecordingGif,
      recordCountdown,
      recordGif,
      setRecordCountdown,
    });
  }, [addNotification, recordGif, isRecordingGif, recordCountdown, downloadGif]);

  const recordButtonState = getRecordButtonState({
    gifRenderProgress,
    hasRecordGif: Boolean(recordGif),
    isRecordingGif,
    recordCountdown,
  });
  const saveRecordingButtonState = getSaveRecordingButtonState({
    gifBlobUrl,
    gifRenderProgress,
    isRecordingGif,
    recordCountdown,
  });

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
          onChange={setScreenshotSize}
          options={SCREENSHOT_SIZE_OPTIONS}
        />
        <SelectRow
          label="Format"
          value={screenshotFormat}
          onChange={setScreenshotFormat}
          options={SCREENSHOT_FORMAT_OPTIONS}
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={takeScreenshot}
            className={`${styles.actionButton} flex-1`}
          >
            Save
          </button>
          <button
            onClick={handleCopyScreenshotToClipboard}
            className={`${styles.actionButton} flex-1`}
          >
            Copy
          </button>
        </div>
        <div className="text-ds-primary text-sm mt-3 mb-1">Dynamic:</div>
        <SelectRow
          label="Format"
          value={recordingFormat}
          onChange={setRecordingFormat}
          options={RECORDING_FORMAT_OPTIONS}
        />
        <SelectRow
          label="Quality"
          value={recordingQuality}
          onChange={setRecordingQuality}
          options={RECORDING_QUALITY_OPTIONS}
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
          options={GIF_DOWNSAMPLE_OPTIONS}
        />
        <SelectRow
          label="Speed"
          value={String(gifSpeed)}
          onChange={(v) => setGifSpeed(Number(v))}
          options={GIF_SPEED_OPTIONS}
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={startRecordingWithCountdown}
            disabled={recordButtonState.disabled}
            className={recordButtonState.style === 'primary' ? styles.actionButtonPrimary : styles.actionButton}
            style={getRecordingActionButtonStyle()}
          >
            {recordButtonState.label}
          </button>
          <button
            onClick={isRecordingGif ? stopRecording ?? undefined : downloadGif}
            disabled={saveRecordingButtonState.disabled}
            className={
              saveRecordingButtonState.style === 'disabled'
                ? styles.actionButtonDisabled
                : saveRecordingButtonState.style === 'primary'
                  ? styles.actionButtonPrimary
                  : styles.actionButton
            }
            style={getRecordingActionButtonStyle()}
          >
            {saveRecordingButtonState.label}
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
