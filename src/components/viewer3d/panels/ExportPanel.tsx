/**
 * Export panel extracted from ViewerControls.tsx.
 * Handles exporting reconstruction data in various formats.
 */

import { memo, useState, useMemo, useCallback } from 'react';
import {
  useReconstructionStore,
  useTransformStore,
  useNotificationStore,
  useDeletionStore,
} from '../../../store';
import { useFileDropzone } from '../../../hooks/useFileDropzone';
import { controlPanelStyles } from '../../../theme';
import { ExportIcon } from '../../../icons';
import { ControlButton, SelectRow, SliderRow, type PanelType } from '../ControlComponents';
import { exportReconstructionText, exportReconstructionBinary, exportPointsPLY, downloadReconstructionZip, downloadImagesZip } from '../../../parsers';
import { useDataset } from '../../../dataset';
import { CameraModelId } from '../../../types/colmap';

const styles = controlPanelStyles;

/** Export format options */
type ExportFormat = 'binary' | 'text' | 'ply' | 'zip';

export interface ExportPanelProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  onOpenDeletionModal: () => void;
  onOpenConversionModal: () => void;
}

/** Human-readable names for camera models */
const MODEL_NAMES: Record<CameraModelId, string> = {
  [CameraModelId.SIMPLE_PINHOLE]: 'Simple Pinhole',
  [CameraModelId.PINHOLE]: 'Pinhole',
  [CameraModelId.SIMPLE_RADIAL]: 'Simple Radial',
  [CameraModelId.RADIAL]: 'Radial',
  [CameraModelId.OPENCV]: 'OpenCV',
  [CameraModelId.OPENCV_FISHEYE]: 'OpenCV Fisheye',
  [CameraModelId.FULL_OPENCV]: 'Full OpenCV',
  [CameraModelId.FOV]: 'FOV',
  [CameraModelId.SIMPLE_RADIAL_FISHEYE]: 'Simple Radial Fisheye',
  [CameraModelId.RADIAL_FISHEYE]: 'Radial Fisheye',
  [CameraModelId.THIN_PRISM_FISHEYE]: 'Thin Prism Fisheye',
  [CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE]: 'Rad Tan Thin Prism',
};

export const ExportPanel = memo(function ExportPanel({
  activePanel,
  setActivePanel,
  onOpenDeletionModal,
  onOpenConversionModal,
}: ExportPanelProps) {
  // Store values
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);
  const droppedFiles = useReconstructionStore((s) => s.droppedFiles);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const resetTransform = useTransformStore((s) => s.resetTransform);
  const pendingDeletions = useDeletionStore((s) => s.pendingDeletions);
  const dataset = useDataset();
  const { processFiles } = useFileDropzone();

  const hasPendingDeletions = pendingDeletions.size > 0;

  // Image export state
  const [jpegQuality, setJpegQuality] = useState(85);
  const [imageExportProgress, setImageExportProgress] = useState<number | null>(null);

  // Format export state
  const [exportFormat, setExportFormat] = useState<ExportFormat>('binary');

  // Get cameras from reconstruction
  const cameras = useMemo(() => {
    if (!reconstruction) return [];
    return Array.from(reconstruction.cameras.entries());
  }, [reconstruction]);

  // Get camera model summary for display
  const cameraModelSummary = useMemo(() => {
    if (cameras.length === 0) return null;
    const modelCounts = new Map<CameraModelId, number>();
    for (const [, camera] of cameras) {
      modelCounts.set(camera.modelId, (modelCounts.get(camera.modelId) ?? 0) + 1);
    }
    if (modelCounts.size === 1) {
      const entries = Array.from(modelCounts.entries());
      const [modelId, count] = entries[0];
      const name = MODEL_NAMES[modelId] ?? `Unknown`;
      return count > 1 ? `${count}x ${name}` : name;
    }
    return `${cameras.length} cameras (mixed)`;
  }, [cameras]);

  // Format export options
  const formatOptions = useMemo(() => [
    { value: 'binary', label: 'Binary (.bin)' },
    { value: 'text', label: 'Text (.txt)' },
    { value: 'ply', label: 'Points (.ply)' },
    { value: 'zip', label: 'ZIP (.zip)' },
  ], []);

  // Format descriptions
  const formatDescriptions: Record<ExportFormat, string> = {
    binary: 'COLMAP binary format. Compact and fast to load.',
    text: 'COLMAP text format. Human-readable, useful for debugging.',
    ply: 'Point cloud only. Compatible with MeshLab, CloudCompare.',
    zip: 'Binary files (.bin) in a single archive.',
  };

  // Handle format export
  const handleExportFormat = useCallback(async () => {
    if (!reconstruction) return;

    try {
      switch (exportFormat) {
        case 'binary':
          exportReconstructionBinary(reconstruction, wasmReconstruction);
          break;
        case 'text':
          exportReconstructionText(reconstruction, wasmReconstruction);
          break;
        case 'ply':
          exportPointsPLY(reconstruction, wasmReconstruction);
          break;
        case 'zip':
          await downloadReconstructionZip(
            reconstruction,
            { format: 'binary' },
            loadedFiles?.imageFiles,
            wasmReconstruction
          );
          break;
      }
    } catch (err) {
      console.error('Export failed:', err);
      addNotification('warning', 'Export failed');
    }
  }, [reconstruction, wasmReconstruction, loadedFiles, exportFormat, addNotification]);

  // Get list of all image names from reconstruction
  const imageNames = useMemo(() => {
    if (!reconstruction) return [];
    return Array.from(reconstruction.images.values()).map(img => img.name);
  }, [reconstruction]);

  // Export images as JPEG ZIP
  const handleExportImages = useCallback(async () => {
    if (imageNames.length === 0) return;

    setImageExportProgress(0);
    try {
      const fetchImage = async (name: string) => dataset.getImage(name);

      await downloadImagesZip(
        imageNames,
        fetchImage,
        { jpegQuality: jpegQuality / 100 },
        (percent) => setImageExportProgress(percent)
      );
      addNotification('info', 'Images exported successfully');
    } catch (err) {
      console.error('Image export failed:', err);
      addNotification('warning', 'Image export failed');
    } finally {
      setImageExportProgress(null);
    }
  }, [imageNames, dataset, jpegQuality, addNotification]);

  // Default export action (binary)
  const handleDefaultExport = () => {
    if (reconstruction) {
      exportReconstructionBinary(reconstruction, wasmReconstruction);
    }
  };

  // Reload data from original files
  const handleReload = useCallback(() => {
    if (droppedFiles) {
      resetTransform();
      processFiles(droppedFiles);
    }
  }, [droppedFiles, resetTransform, processFiles]);

  const hasCameras = cameras.length > 0;
  const isExportingImages = imageExportProgress !== null;
  const hasImages = imageNames.length > 0 && dataset.hasImages();

  return (
    <>
      <ControlButton
        panelId="export"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={<ExportIcon className="w-6 h-6" />}
        tooltip="Export"
        onClick={handleDefaultExport}
        panelTitle="Export"
        disabled={!reconstruction}
      >
        <div className={styles.panelContent}>
          {/* Export formats */}
          <div className="text-ds-primary text-sm mb-1">Reconstruction:</div>
          <SelectRow
            label="Format"
            value={exportFormat}
            onChange={(value) => setExportFormat(value as ExportFormat)}
            options={formatOptions}
          />
          <div className="text-ds-tertiary text-xs mb-2">
            {formatDescriptions[exportFormat]}
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
              Delete Images{hasPendingDeletions ? ` (${pendingDeletions.size})` : ''}
            </button>
            <button
              onClick={handleExportFormat}
              disabled={!reconstruction}
              className={reconstruction ? styles.actionButton : styles.actionButtonDisabled}
            >
              Download
            </button>
          </div>

          {/* Images export */}
          <div className="text-ds-primary text-sm mb-1 mt-3">Images:</div>
          {hasImages ? (
            <>
              <SliderRow
                label="JPEG Quality"
                value={jpegQuality}
                min={10}
                max={100}
                step={5}
                onChange={setJpegQuality}
                formatValue={(v) => `${v}%`}
              />
              <div className="flex flex-col gap-2">
                {isExportingImages ? (
                  <div>
                    <div className="h-2 bg-ds-tertiary rounded overflow-hidden">
                      <div
                        className="h-full bg-ds-accent transition-all"
                        style={{ width: `${imageExportProgress}%` }}
                      />
                    </div>
                    <div className="text-ds-secondary text-xs mt-1 text-center">
                      {imageExportProgress}%
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleExportImages}
                    className={styles.actionButton}
                  >
                    Download
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="text-ds-tertiary text-xs">
              No images available
            </div>
          )}

          {/* Reload */}
          <div className="flex flex-col gap-2 mt-3">
            <button
              onClick={handleReload}
              disabled={!droppedFiles}
              className={droppedFiles ? styles.actionButton : styles.actionButtonDisabled}
            >
              Reload
            </button>
          </div>
        </div>
      </ControlButton>
    </>
  );
});
