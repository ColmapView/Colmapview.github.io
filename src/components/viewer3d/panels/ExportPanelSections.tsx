import { memo } from 'react';
import { controlPanelStyles } from '../../../theme';
import { SelectRow, SliderRow } from '../ControlComponents';
import {
  EXPORT_FORMAT_DESCRIPTIONS,
  EXPORT_FORMAT_OPTIONS,
  getExportProgressStyle,
  type ExportFormat,
} from './exportPanelViewModel';

const styles = controlPanelStyles;

export interface ExportReconstructionSectionProps {
  exportFormat: ExportFormat;
  hasCameras: boolean;
  hasPendingDeletions: boolean;
  hasReconstruction: boolean;
  cameraModelSummary: string | null;
  pendingDeletionCount: number;
  onExportFormatChange: (format: ExportFormat) => void;
  onOpenConversionModal: () => void;
  onOpenDeletionModal: () => void;
  onDownload: () => void;
  onDownloadSplat: () => void;
  hasSplatFile: boolean;
}

export const ExportReconstructionSection = memo(function ExportReconstructionSection({
  exportFormat,
  hasCameras,
  hasPendingDeletions,
  hasReconstruction,
  cameraModelSummary,
  pendingDeletionCount,
  onExportFormatChange,
  onOpenConversionModal,
  onOpenDeletionModal,
  onDownload,
  onDownloadSplat,
  hasSplatFile,
}: ExportReconstructionSectionProps) {
  return (
    <>
      <div className="text-ds-primary text-sm mb-1">Reconstruction:</div>
      <SelectRow
        label="Format"
        value={exportFormat}
        onChange={onExportFormatChange}
        options={EXPORT_FORMAT_OPTIONS}
      />
      <div className="text-ds-tertiary text-xs mb-2">
        {EXPORT_FORMAT_DESCRIPTIONS[exportFormat]}
      </div>
      <div className="flex flex-col gap-2">
        {hasCameras && (
          <button
            onClick={onOpenConversionModal}
            className={styles.actionButton}
            title={cameraModelSummary ?? undefined}
          >
            Convert Camera Model
          </button>
        )}
        <button
          onClick={onOpenDeletionModal}
          className={styles.actionButton}
        >
          Delete Images from Model{hasPendingDeletions ? ` (${pendingDeletionCount})` : ''}
        </button>
        <button
          onClick={onDownload}
          disabled={!hasReconstruction}
          className={hasReconstruction ? styles.actionButton : styles.actionButtonDisabled}
        >
          Download COLMAP
        </button>
        {hasSplatFile && (
          <button
            onClick={onDownloadSplat}
            className={styles.actionButton}
          >
            Download Splat File
          </button>
        )}
      </div>
    </>
  );
});

export interface ExportMediaSectionProps {
  hasImages: boolean;
  hasMasks: boolean;
  imageExportProgress: number | null;
  jpegQuality: number;
  maskExportProgress: number | null;
  onExportImages: () => void;
  onExportMasks: () => void;
  onJpegQualityChange: (quality: number) => void;
}

export const ExportMediaSection = memo(function ExportMediaSection({
  hasImages,
  hasMasks,
  imageExportProgress,
  jpegQuality,
  maskExportProgress,
  onExportImages,
  onExportMasks,
  onJpegQualityChange,
}: ExportMediaSectionProps) {
  const isExportingImages = imageExportProgress !== null;
  const isExportingMasks = maskExportProgress !== null;

  return (
    <>
      <div className="text-ds-primary text-sm mb-1 mt-3">Images:</div>
      {hasImages ? (
        <>
          <SliderRow
            label="JPEG Quality"
            value={jpegQuality}
            min={10}
            max={100}
            step={5}
            onChange={onJpegQualityChange}
            formatValue={(value) => `${value}%`}
          />
          <div className="flex flex-col gap-2">
            {isExportingImages ? (
              <ExportProgress label="images" progress={imageExportProgress} />
            ) : (
              <button
                onClick={onExportImages}
                className={styles.actionButton}
              >
                Download Images
              </button>
            )}
            {hasMasks && (
              isExportingMasks ? (
                <ExportProgress label="masks" progress={maskExportProgress} />
              ) : (
                <button
                  onClick={onExportMasks}
                  className={styles.actionButton}
                >
                  Download Masks
                </button>
              )
            )}
          </div>
        </>
      ) : (
        <div className="text-ds-tertiary text-xs">
          No images available
        </div>
      )}
    </>
  );
});

export interface ExportReloadSectionProps {
  canReload: boolean;
  onReload: () => void;
}

export const ExportReloadSection = memo(function ExportReloadSection({
  canReload,
  onReload,
}: ExportReloadSectionProps) {
  return (
    <div className="flex flex-col gap-2 mt-3">
      <button
        onClick={onReload}
        disabled={!canReload}
        className={canReload ? styles.actionButton : styles.actionButtonDisabled}
      >
        Reload
      </button>
    </div>
  );
});

interface ExportProgressProps {
  label: 'images' | 'masks';
  progress: number;
}

function ExportProgress({ label, progress }: ExportProgressProps) {
  return (
    <div>
      <div className="h-2 bg-ds-tertiary rounded overflow-hidden">
        <div
          className="h-full bg-ds-accent transition-all"
          style={getExportProgressStyle(progress)}
        />
      </div>
      <div className="text-ds-secondary text-xs mt-1 text-center">
        Exporting {label}... {progress}%
      </div>
    </div>
  );
}
