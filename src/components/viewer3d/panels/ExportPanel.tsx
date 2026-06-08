/**
 * Export panel extracted from ViewerControls.tsx.
 * Handles exporting reconstruction data in various formats.
 */

import { memo, useState, useMemo, useCallback } from 'react';
import { useFileDropzone } from '../../../hooks/useFileDropzone';
import { controlPanelStyles } from '../../../theme';
import { ExportIcon } from '../../../icons';
import { ControlButton, type PanelType } from '../ControlComponents';
import { exportReconstructionText, exportReconstructionBinary, exportPointsPLY, downloadReconstructionZip, downloadImagesZip, downloadMasksZip } from '../../../parsers';
import { useDataset } from '../../../dataset';
import { createSim3dFromEuler, isIdentityEuler, transformReconstruction } from '../../../utils/sim3dTransforms';
import { requestConfirmation } from '../../../utils/confirmation';
import { appLogger } from '../../../utils/logger';
import { downloadBlob } from '../../../utils/download';
import {
  getCameraModelSummary,
  type ExportFormat,
} from './exportPanelViewModel';
import { runReconstructionExport } from './exportPanelReconstructionExport';
import { runImageZipExport, runMaskZipExport } from './exportPanelMediaExport';
import {
  ExportMediaSection,
  ExportReconstructionSection,
  ExportReloadSection,
} from './ExportPanelSections';
import { useExportPanelStoreFacade } from './useExportPanelStoreFacade';

const styles = controlPanelStyles;

export interface ExportPanelProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  onOpenDeletionModal: () => void;
  onOpenConversionModal: () => void;
}

export const ExportPanel = memo(function ExportPanel({
  activePanel,
  setActivePanel,
  onOpenDeletionModal,
  onOpenConversionModal,
}: ExportPanelProps) {
  const {
    data: {
      reconstruction,
      loadedFiles,
      droppedFiles,
      getLiveReconstruction,
    },
    transform: {
      resetTransform,
      getTransform,
      getSplatTransform,
    },
    deletion: {
      pendingDeletions,
      getPendingDeletionCount,
      applyDeletionsToData,
    },
    actions: {
      addNotification,
      confirmReload,
    },
  } = useExportPanelStoreFacade();
  const dataset = useDataset();
  const { processFiles } = useFileDropzone();

  const hasPendingDeletions = pendingDeletions.size > 0;

  // Image export state
  const [jpegQuality, setJpegQuality] = useState(85);
  const [imageExportProgress, setImageExportProgress] = useState<number | null>(null);

  // Mask export state
  const [maskExportProgress, setMaskExportProgress] = useState<number | null>(null);

  // Format export state
  const [exportFormat, setExportFormat] = useState<ExportFormat>('binary');

  // Get cameras from reconstruction
  const cameras = useMemo(() => {
    if (!reconstruction) return [];
    return Array.from(reconstruction.cameras.entries());
  }, [reconstruction]);

  const cameraModelSummary = useMemo(() => {
    return getCameraModelSummary(cameras);
  }, [cameras]);

  const handleExportFormat = useCallback(async () => {
    if (!reconstruction) return;

    await runReconstructionExport({
      exportFormat,
      loadedImageFiles: loadedFiles?.imageFiles,
    }, {
      getPendingDeletionCount,
      confirmPendingDeletions: (count) => requestConfirmation({
        title: 'Apply pending deletions?',
        message: `You have ${count} image(s) marked for deletion but not applied.\n\nApply the deletions now, then export?`,
        confirmLabel: 'Apply and export',
        tone: 'danger',
      }),
      applyDeletionsToData,
      getTransform,
      isIdentityTransform: isIdentityEuler,
      confirmBakeTransform: () => requestConfirmation({
        title: 'Bake transform into export?',
        message: 'You have an unapplied transform active in the viewer.\n\nBake the transform into the exported poses and 3D points?',
        confirmLabel: 'Bake and export',
      }),
      getLiveReconstruction,
      transformReconstruction: (transform, liveRecon, liveWasm) =>
        transformReconstruction(createSim3dFromEuler(transform), liveRecon, liveWasm),
      writers: {
        exportBinary: exportReconstructionBinary,
        exportText: exportReconstructionText,
        exportPly: exportPointsPLY,
        downloadZip: downloadReconstructionZip,
      },
      addNotification,
      logError: appLogger.error,
    });
  }, [
    reconstruction,
    loadedFiles,
    exportFormat,
    getPendingDeletionCount,
    applyDeletionsToData,
    getTransform,
    getLiveReconstruction,
    addNotification,
  ]);

  // Get list of all image names from reconstruction
  const imageNames = useMemo(() => {
    if (!reconstruction) return [];
    return Array.from(reconstruction.images.values()).map(img => img.name);
  }, [reconstruction]);

  // Export images as JPEG ZIP
  const handleExportImages = useCallback(async () => {
    await runImageZipExport({
      imageNames,
      jpegQualityPercent: jpegQuality,
    }, {
      fetchImage: (name) => dataset.getImage(name),
      downloadImagesZip,
      setProgress: setImageExportProgress,
      addNotification,
      logError: appLogger.error,
    });
  }, [imageNames, dataset, jpegQuality, addNotification]);

  // Export masks as PNG ZIP
  const handleExportMasks = useCallback(async () => {
    await runMaskZipExport({ imageNames }, {
      fetchMask: (name) => dataset.getMask(name),
      downloadMasksZip,
      setProgress: setMaskExportProgress,
      addNotification,
      logError: appLogger.error,
    });
  }, [imageNames, dataset, addNotification]);

  const handleDownloadSplat = useCallback(() => {
    const splatFile = loadedFiles?.splatFile;
    if (!splatFile) return;

    downloadBlob(splatFile, splatFile.name);
    if (!isIdentityEuler(getTransform()) || !isIdentityEuler(getSplatTransform())) {
      addNotification(
        'warning',
        'Downloaded original splat file; transforms are not baked into splat exports.',
        6000
      );
    }
  }, [addNotification, getSplatTransform, getTransform, loadedFiles]);

  // Reload data from original files
  const handleReload = useCallback(async () => {
    if (!droppedFiles) return;
    if (!await confirmReload()) return;
    resetTransform();
    processFiles(droppedFiles);
  }, [droppedFiles, confirmReload, resetTransform, processFiles]);

  const hasCameras = cameras.length > 0;
  const hasImages = imageNames.length > 0 && dataset.hasImages();
  const hasMasks = dataset.hasMasks();

  return (
    <>
      <ControlButton
        panelId="export"
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        icon={<ExportIcon className="w-6 h-6" />}
        tooltip="Export"
        onClick={handleExportFormat}
        panelTitle="Export"
        disabled={!reconstruction}
      >
        <div className={styles.panelContent}>
          <ExportReconstructionSection
            exportFormat={exportFormat}
            hasCameras={hasCameras}
            hasPendingDeletions={hasPendingDeletions}
            hasReconstruction={Boolean(reconstruction)}
            cameraModelSummary={cameraModelSummary}
            pendingDeletionCount={pendingDeletions.size}
            onExportFormatChange={setExportFormat}
            onOpenConversionModal={onOpenConversionModal}
            onOpenDeletionModal={onOpenDeletionModal}
            onDownload={handleExportFormat}
            onDownloadSplat={handleDownloadSplat}
            hasSplatFile={Boolean(loadedFiles?.splatFile)}
          />
          <ExportMediaSection
            hasImages={hasImages}
            hasMasks={hasMasks}
            imageExportProgress={imageExportProgress}
            jpegQuality={jpegQuality}
            maskExportProgress={maskExportProgress}
            onExportImages={handleExportImages}
            onExportMasks={handleExportMasks}
            onJpegQualityChange={setJpegQuality}
          />
          <ExportReloadSection
            canReload={Boolean(droppedFiles)}
            onReload={handleReload}
          />
        </div>
      </ControlButton>
    </>
  );
});
