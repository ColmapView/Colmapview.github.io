/**
 * Modal for camera model conversion with parameter preview.
 * Shows source and target parameters side-by-side with conversion characterization.
 */

import { useState, useMemo, useCallback, useEffect, memo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useModalZIndex } from '../../hooks/useModalZIndex';
import { useModalDrag } from '../../hooks/useModalDrag';
import {
  getConversionPreview,
  type ConversionPreview,
} from '../../utils/cameraModelConversions';
import { CameraModelId, type CameraId } from '../../types/colmap';
import { modalStyles, inputStyles, controlPanelStyles } from '../../theme';
import { FloatingWindowShell } from '../ui/FloatingWindowShell';
import { CameraConversionPreview } from './CameraConversionPreview';
import {
  applyCameraModelConversion,
  buildCameraConversionOptions,
  buildCameraConversionParameterRows,
  buildCameraConversionTargetOptions,
  CAMERA_CONVERSION_MODAL_ESTIMATED_HEIGHT,
  CAMERA_CONVERSION_MODAL_ESTIMATED_WIDTH,
  getCameraConversionActionState,
  getCameraConversionModalHeaderDragStyle,
  getCameraConversionModalOverlayStyle,
  getCameraConversionModalPanelStyle,
  getCameraConversionNotificationMessage,
  getCommonConversionTargetModels,
  getEffectiveConversionTargetModelId,
  getReconstructionCameraEntries,
  getSelectedConversionCameras,
  getSourceConversionModelIds,
  parseCameraConversionSelection,
  parseCameraConversionTarget,
} from './cameraConversionModalViewModel';
import { useCameraConversionStoreFacade } from './useCameraConversionStoreFacade';

export interface CameraConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CameraConversionModal = memo(function CameraConversionModal({
  isOpen,
  onClose,
}: CameraConversionModalProps) {
  const {
    data: { reconstruction },
    actions: { setReconstruction, addNotification },
  } = useCameraConversionStoreFacade();

  // State
  const [selectedCameraId, setSelectedCameraId] = useState<CameraId | 'all'>('all');
  const [targetModelId, setTargetModelId] = useState<CameraModelId | null>(null);

  // Position and drag
  const { position, panelRef, handleDragStart, centerModal } = useModalDrag({
    estimatedWidth: CAMERA_CONVERSION_MODAL_ESTIMATED_WIDTH,
    estimatedHeight: CAMERA_CONVERSION_MODAL_ESTIMATED_HEIGHT,
    isOpen,
  });

  // Z-index management for stacking multiple modals
  const { zIndex, bringToFront } = useModalZIndex(isOpen);

  useHotkeys('escape', onClose, { enabled: isOpen }, [isOpen, onClose]);

  // Get cameras from reconstruction
  const cameras = useMemo(() => getReconstructionCameraEntries(reconstruction), [reconstruction]);

  const selectedCameras = useMemo(
    () => getSelectedConversionCameras(reconstruction, selectedCameraId),
    [reconstruction, selectedCameraId]
  );

  const sourceModels = useMemo(() => getSourceConversionModelIds(selectedCameras), [selectedCameras]);

  const validTargetModels = useMemo(
    () => getCommonConversionTargetModels(sourceModels),
    [sourceModels]
  );

  const effectiveTargetModelId = useMemo(() => {
    return getEffectiveConversionTargetModelId(targetModelId, validTargetModels);
  }, [targetModelId, validTargetModels]);
  const targetOptions = useMemo(
    () => buildCameraConversionTargetOptions(validTargetModels),
    [validTargetModels]
  );

  const conversionPreview = useMemo((): ConversionPreview | null => {
    if (effectiveTargetModelId === null || selectedCameras.length === 0) return null;
    return getConversionPreview(selectedCameras[0], effectiveTargetModelId);
  }, [effectiveTargetModelId, selectedCameras]);

  // Recenter when preview appears
  useEffect(() => {
    if (isOpen && conversionPreview) {
      requestAnimationFrame(centerModal);
    }
  }, [isOpen, conversionPreview, centerModal]);

  const applyConversion = useCallback(() => {
    if (!reconstruction || effectiveTargetModelId === null) return;

    const result = applyCameraModelConversion({
      reconstruction,
      selectedCameras,
      targetModelId: effectiveTargetModelId,
    });

    if (!result) {
      addNotification('warning', 'No cameras were converted');
      return;
    }

    setReconstruction(result.reconstruction);
    addNotification('info', getCameraConversionNotificationMessage({
      convertedCount: result.convertedCount,
      approximateCount: result.approximateCount,
      targetModelId: effectiveTargetModelId,
    }));

    onClose();
  }, [reconstruction, selectedCameras, effectiveTargetModelId, setReconstruction, addNotification, onClose]);

  const cameraOptions = useMemo(() => buildCameraConversionOptions(cameras), [cameras]);

  const handleCameraChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextSelection = parseCameraConversionSelection(e.target.value, cameraOptions);
    if (nextSelection !== null) {
      setSelectedCameraId(nextSelection);
      setTargetModelId(null);
    }
  }, [cameraOptions]);

  const handleTargetChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setTargetModelId(parseCameraConversionTarget(e.target.value));
  }, []);

  // Build parameter rows for display
  const parameterRows = useMemo(
    () => buildCameraConversionParameterRows(conversionPreview),
    [conversionPreview]
  );
  const convertAction = getCameraConversionActionState(
    effectiveTargetModelId,
    selectedCameras.length
  );

  if (!isOpen) return null;

  return (
    <FloatingWindowShell
      isOpen={isOpen}
      title="Convert Camera Model"
      onClose={onClose}
      panelRef={panelRef}
      panelTestId="camera-conversion-modal"
      overlayStyle={getCameraConversionModalOverlayStyle(zIndex)}
      panelStyle={getCameraConversionModalPanelStyle(position)}
      headerStyle={getCameraConversionModalHeaderDragStyle()}
      onPanelPointerDown={bringToFront}
      onHeaderPointerDown={handleDragStart}
      renderBackdrop
      onBackdropClick={onClose}
    >
        {/* Content */}
        <div className={modalStyles.toolContent}>
          {/* Selectors */}
          <div className="flex items-center gap-2">
            <select
              value={selectedCameraId === 'all' ? 'all' : String(selectedCameraId)}
              onChange={handleCameraChange}
              className={`${inputStyles.select} ${inputStyles.selectSizes.xs} flex-1`}
            >
              {cameraOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <span className="text-ds-muted text-xs">→</span>
            {targetOptions.length > 0 ? (
              <select
                value={effectiveTargetModelId !== null ? String(effectiveTargetModelId) : ''}
                onChange={handleTargetChange}
                className={`${inputStyles.select} ${inputStyles.selectSizes.xs} flex-1`}
              >
                <option value="">Select...</option>
                {targetOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="flex-1 text-ds-muted text-xs">No targets</span>
            )}
          </div>

          {/* Preview */}
          {conversionPreview && (
            <CameraConversionPreview
              conversionPreview={conversionPreview}
              parameterRows={parameterRows}
            />
          )}

          {/* Actions */}
          <div className={controlPanelStyles.actionGroup}>
            <button
              onClick={applyConversion}
              disabled={!convertAction.canConvert}
              className={convertAction.canConvert ? controlPanelStyles.actionButtonPrimary : controlPanelStyles.actionButtonPrimaryDisabled}
            >
              {convertAction.label}
            </button>
            <button
              onClick={onClose}
              className={controlPanelStyles.actionButton}
            >
              Cancel
            </button>
          </div>
        </div>
    </FloatingWindowShell>
  );
});
