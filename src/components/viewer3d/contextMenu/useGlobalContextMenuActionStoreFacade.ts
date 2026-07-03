import { useCallback, useMemo } from 'react';
import {
  applyTransformPreset,
  applyTransformToData,
  confirmReload,
  useExportStore,
  usePointPickingStore,
  useReconstructionStore,
  useTransformStore,
  useUIStore,
} from '../../../store';
import { useFileDropzone } from '../../../hooks/useFileDropzone';
import { loadedFilesHaveSplatData } from '../../../utils/splatFileSourcePolicy';
import type { GlobalContextMenuActionExecutorDeps } from './globalContextMenuActionExecutor';

type GlobalContextMenuActionStoreFacade = Pick<
  GlobalContextMenuActionExecutorDeps,
  | 'resetView'
  | 'setView'
  | 'backgroundColor'
  | 'setBackgroundColor'
  | 'toggleGalleryCollapsed'
  | 'applyTransformPreset'
  | 'pickingMode'
  | 'setPickingMode'
  | 'resetTransform'
  | 'applyTransformToData'
  | 'droppedFiles'
  | 'confirmReload'
  | 'processFiles'
  | 'takeScreenshot'
  | 'setExportFormat'
  | 'triggerExport'
  | 'openDeletionModal'
  | 'openFloorDetectionModal'
  | 'openCameraConversionModal'
  | 'hasSplatData'
>;

export function useGlobalContextMenuActionStoreFacade(): GlobalContextMenuActionStoreFacade {
  const setView = useUIStore((s) => s.setView);
  const resetView = useUIStore((s) => s.resetView);
  const backgroundColor = useUIStore((s) => s.backgroundColor);
  const setBackgroundColor = useUIStore((s) => s.setBackgroundColor);
  const toggleGalleryCollapsed = useUIStore((s) => s.toggleGalleryCollapsed);
  const setShowDeletionModal = useUIStore((s) => s.setShowDeletionModal);
  const setShowFloorModal = useUIStore((s) => s.setShowFloorModal);
  const setShowConversionModal = useUIStore((s) => s.setShowConversionModal);

  const resetTransform = useTransformStore((s) => s.resetTransform);
  const droppedFiles = useReconstructionStore((s) => s.droppedFiles);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);
  const hasSplatData = loadedFilesHaveSplatData(loadedFiles);
  const { processFiles } = useFileDropzone();

  const takeScreenshot = useExportStore((s) => s.takeScreenshot);
  const setExportFormat = useExportStore((s) => s.setExportFormat);
  const triggerExport = useExportStore((s) => s.triggerExport);

  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const setPickingMode = usePointPickingStore((s) => s.setPickingMode);

  const openDeletionModal = useCallback(() => {
    setShowDeletionModal(true);
  }, [setShowDeletionModal]);

  const openFloorDetectionModal = useCallback(() => {
    setShowFloorModal(true);
  }, [setShowFloorModal]);

  const openCameraConversionModal = useCallback(() => {
    setShowConversionModal(true);
  }, [setShowConversionModal]);

  return useMemo(
    () => ({
      resetView,
      setView,
      backgroundColor,
      setBackgroundColor,
      toggleGalleryCollapsed,
      applyTransformPreset,
      pickingMode,
      setPickingMode,
      resetTransform,
      applyTransformToData,
      droppedFiles,
      confirmReload,
      processFiles,
      takeScreenshot,
      setExportFormat,
      triggerExport,
      openDeletionModal,
      openFloorDetectionModal,
      openCameraConversionModal,
      hasSplatData,
    }),
    [
      resetView,
      setView,
      backgroundColor,
      setBackgroundColor,
      toggleGalleryCollapsed,
      pickingMode,
      setPickingMode,
      resetTransform,
      droppedFiles,
      processFiles,
      takeScreenshot,
      setExportFormat,
      triggerExport,
      openDeletionModal,
      openFloorDetectionModal,
      openCameraConversionModal,
      hasSplatData,
    ]
  );
}
