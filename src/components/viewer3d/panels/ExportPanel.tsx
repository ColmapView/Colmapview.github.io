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
import { isByteLessActiveSplatFile } from '../../../utils/splatFileSourcePolicy';
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
import { useCancellableExport } from './useCancellableExport';

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
  const exportSource = useMemo(() => ({ dataset, reconstruction }), [dataset, reconstruction]);
  const { progress: imageExportProgress, run: runImages, cancel: cancelImages } = useCancellableExport(exportSource);
  const { progress: maskExportProgress, run: runMasks, cancel: cancelMasks } = useCancellableExport(exportSource);
  // Applying confirmed deletions changes the reconstruction, but keeps this dataset.
  const { progress: reconstructionExportProgress, run: runModel, cancel: cancelModel } = useCancellableExport(dataset);

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

    await runModel((signal, setProgress) => runReconstructionExport({
      exportFormat,
      loadedImageFiles: loadedFiles?.imageFiles,
      signal,
      onProgress: percent => setProgress(percent),
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
    }));
  }, [
    reconstruction,
    loadedFiles,
    exportFormat,
    getPendingDeletionCount,
    applyDeletionsToData,
    getTransform,
    getLiveReconstruction,
    addNotification,
    runModel,
  ]);

  // Get list of all image names from reconstruction
  const imageNames = useMemo(() => {
    if (!reconstruction) return [];
    return Array.from(reconstruction.images.values()).map(img => img.name);
  }, [reconstruction]);

  // Export images as JPEG ZIP
  const handleExportImages = useCallback(async () => {
    await runImages((signal, setProgress) => runImageZipExport({
      imageNames,
      jpegQualityPercent: jpegQuality,
      signal,
    }, {
      fetchImage: (name, signal) => dataset.getOriginalImage(name, { signal }),
      downloadImagesZip,
      setProgress,
      addNotification,
      logError: appLogger.error,
    }));
  }, [imageNames, dataset, jpegQuality, addNotification, runImages]);

  // Export masks as PNG ZIP
  const handleExportMasks = useCallback(async () => {
    await runMasks((signal, setProgress) => runMaskZipExport({ imageNames, signal }, {
      fetchMask: (name, signal) => dataset.getMask(name, { signal }),
      downloadMasksZip,
      setProgress,
      addNotification,
      logError: appLogger.error,
    }));
  }, [imageNames, dataset, addNotification, runMasks]);

  const handleDownloadSplat = useCallback(() => {
    const splatFile = loadedFiles?.splatFile;
    if (!splatFile) return;

    if (isByteLessActiveSplatFile(loadedFiles)) {
      // Byte-less activation (oversized tile on touch) kept only the decoded
      // cloud; there are no source bytes to write, so a download would produce
      // a useless 0-byte file.
      addNotification(
        'warning',
        'Splat bytes were not kept on this device - reload on desktop to export',
        6000
      );
      return;
    }

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
            exportProgress={reconstructionExportProgress}
            onCancelExport={cancelModel}
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
            onCancelImages={cancelImages}
            onCancelMasks={cancelMasks}
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
