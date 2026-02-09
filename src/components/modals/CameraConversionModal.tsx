/**
 * Modal for camera model conversion with parameter preview.
 * Shows source and target parameters side-by-side with conversion characterization.
 */

import { useState, useMemo, useCallback, useEffect, memo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  useReconstructionStore,
  useNotificationStore,
} from '../../store';
import { useModalZIndex } from '../../hooks/useModalZIndex';
import { useModalDrag } from '../../hooks/useModalDrag';
import {
  convertCameraModel,
  getValidTargetModels,
  getConversionPreview,
  type ConversionCompatibility,
  type ConversionPreview,
} from '../../utils/cameraModelConversions';
import { CameraModelId, type Camera, type CameraId } from '../../types/colmap';
import { modalStyles, inputStyles, controlPanelStyles, STATUS_COLORS } from '../../theme';
import { CloseIcon } from '../../icons';
import { getCameraModelName as getModelName } from '../../utils/cameraModelNames';

/** Format a parameter value for display */
function formatParamValue(value: number): string {
  if (Math.abs(value) < 1e-10) return '0';
  if (Math.abs(value) >= 100 || (Math.abs(value) < 0.01 && Math.abs(value) > 0)) {
    return value.toExponential(2);
  }
  return value.toPrecision(5).replace(/\.?0+$/, '');
}

/** Characterization styles */
const CHAR_STYLES: Record<string, { text: string; label: string }> = {
  exact: { text: STATUS_COLORS.success, label: 'Exact' },
  expansion: { text: STATUS_COLORS.info, label: 'Expansion' },
  lossy: { text: STATUS_COLORS.warning, label: 'Lossy' },
  approximation: { text: STATUS_COLORS.caution, label: 'Approx' },
};

export interface CameraConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CameraConversionModal = memo(function CameraConversionModal({
  isOpen,
  onClose,
}: CameraConversionModalProps) {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const setReconstruction = useReconstructionStore((s) => s.setReconstruction);
  const addNotification = useNotificationStore((s) => s.addNotification);

  // State
  const [selectedCameraId, setSelectedCameraId] = useState<CameraId | 'all'>('all');
  const [targetModelId, setTargetModelId] = useState<CameraModelId | null>(null);

  // Position and drag
  const { position, panelRef, handleDragStart, centerModal } = useModalDrag({
    estimatedWidth: 360, estimatedHeight: 160, isOpen,
  });

  // Z-index management for stacking multiple modals
  const { zIndex, bringToFront } = useModalZIndex(isOpen);

  useHotkeys('escape', onClose, { enabled: isOpen }, [isOpen, onClose]);

  // Get cameras from reconstruction
  const cameras = useMemo(() => {
    if (!reconstruction) return [];
    return Array.from(reconstruction.cameras.entries());
  }, [reconstruction]);

  const selectedCameras = useMemo((): Camera[] => {
    if (!reconstruction) return [];
    if (selectedCameraId === 'all') {
      return Array.from(reconstruction.cameras.values());
    }
    const camera = reconstruction.cameras.get(selectedCameraId);
    return camera ? [camera] : [];
  }, [reconstruction, selectedCameraId]);

  const sourceModels = useMemo(() => {
    const models = new Set<CameraModelId>();
    for (const camera of selectedCameras) {
      models.add(camera.modelId);
    }
    return Array.from(models);
  }, [selectedCameras]);

  const validTargetModels = useMemo(() => {
    if (sourceModels.length === 0) return [];

    const targetSets = sourceModels.map(model =>
      new Map(getValidTargetModels(model).map(t => [t.modelId, t.compatibility]))
    );

    if (targetSets.length === 1) {
      return Array.from(targetSets[0].entries()).map(([modelId, compatibility]) => ({
        modelId,
        compatibility,
      }));
    }

    const firstSet = targetSets[0];
    const commonTargets: Array<{ modelId: CameraModelId; compatibility: ConversionCompatibility }> = [];

    for (const [modelId, compatibility] of firstSet) {
      let isCommon = true;
      let worstCompatibility: ConversionCompatibility = compatibility;

      for (let i = 1; i < targetSets.length; i++) {
        const otherCompatibility = targetSets[i].get(modelId);
        if (!otherCompatibility) {
          isCommon = false;
          break;
        }
        if (otherCompatibility === 'approximate') {
          worstCompatibility = 'approximate';
        }
      }

      if (isCommon) {
        commonTargets.push({ modelId, compatibility: worstCompatibility });
      }
    }

    return commonTargets;
  }, [sourceModels]);

  const effectiveTargetModelId = useMemo(() => {
    if (targetModelId === null) return null;
    return validTargetModels.some(t => t.modelId === targetModelId) ? targetModelId : null;
  }, [targetModelId, validTargetModels]);

  const conversionPreview = useMemo((): ConversionPreview | null => {
    if (!effectiveTargetModelId || selectedCameras.length === 0) return null;
    return getConversionPreview(selectedCameras[0], effectiveTargetModelId);
  }, [effectiveTargetModelId, selectedCameras]);

  // Recenter when preview appears
  useEffect(() => {
    if (isOpen && conversionPreview) {
      requestAnimationFrame(centerModal);
    }
  }, [isOpen, conversionPreview, centerModal]);

  const applyConversion = useCallback(() => {
    if (!reconstruction || !effectiveTargetModelId) return;

    const newCameras = new Map(reconstruction.cameras);
    let convertedCount = 0;
    let approximateCount = 0;

    for (const camera of selectedCameras) {
      const result = convertCameraModel(camera, effectiveTargetModelId);
      if (result.type !== 'incompatible') {
        newCameras.set(camera.cameraId, {
          ...camera,
          modelId: effectiveTargetModelId,
          params: result.params,
        });
        convertedCount++;
        if (result.type === 'approximate') approximateCount++;
      }
    }

    if (convertedCount === 0) {
      addNotification('warning', 'No cameras were converted');
      return;
    }

    setReconstruction({ ...reconstruction, cameras: newCameras });

    const targetName = getModelName(effectiveTargetModelId);
    const message = approximateCount > 0
      ? `Converted ${convertedCount} camera(s) to ${targetName} (~)`
      : `Converted ${convertedCount} camera(s) to ${targetName}`;
    addNotification('info', message);

    onClose();
  }, [reconstruction, selectedCameras, effectiveTargetModelId, setReconstruction, addNotification, onClose]);

  const cameraOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    if (cameras.length > 1) {
      options.push({ value: 'all', label: `All (${cameras.length})` });
    }
    for (const [id, camera] of cameras) {
      options.push({
        value: String(id),
        label: `#${id}: ${getModelName(camera.modelId)}`,
      });
    }
    return options;
  }, [cameras]);

  const handleCameraChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedCameraId(value === 'all' ? 'all' : parseInt(value, 10));
    setTargetModelId(null);
  }, []);

  const handleTargetChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setTargetModelId(value === '' ? null : parseInt(value, 10) as CameraModelId);
  }, []);

  // Build parameter rows for display
  const parameterRows = useMemo(() => {
    if (!conversionPreview) return [];

    const rows: Array<{
      name: string;
      sourceValue: number | null;
      targetValue: number;
      status: 'unchanged' | 'changed' | 'new' | 'removed';
    }> = [];

    const allNames = new Set([
      ...conversionPreview.sourceParamNames,
      ...conversionPreview.targetParamNames,
    ]);

    for (const name of allNames) {
      const sourceIdx = conversionPreview.sourceParamNames.indexOf(name);
      const targetIdx = conversionPreview.targetParamNames.indexOf(name);

      if (sourceIdx !== -1 && targetIdx !== -1) {
        const srcVal = conversionPreview.sourceParams[sourceIdx];
        const tgtVal = conversionPreview.targetParams[targetIdx];
        rows.push({
          name,
          sourceValue: srcVal,
          targetValue: tgtVal,
          status: Math.abs(srcVal - tgtVal) > 1e-10 ? 'changed' : 'unchanged',
        });
      } else if (sourceIdx !== -1) {
        rows.push({
          name,
          sourceValue: conversionPreview.sourceParams[sourceIdx],
          targetValue: 0,
          status: 'removed',
        });
      } else {
        rows.push({
          name,
          sourceValue: null,
          targetValue: conversionPreview.targetParams[targetIdx],
          status: 'new',
        });
      }
    }

    return rows;
  }, [conversionPreview]);

  const canConvert = effectiveTargetModelId !== null && selectedCameras.length > 0;
  const charStyle = conversionPreview ? CHAR_STYLES[conversionPreview.characterization] : null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex }}>
      <div className={modalStyles.backdrop} onClick={onClose} />

      <div
        ref={panelRef}
        className={modalStyles.toolPanel}
        style={{ left: position.x, top: position.y }}
        onPointerDown={bringToFront}
      >
        {/* Header */}
        <div
          className={modalStyles.toolHeader}
          onPointerDown={handleDragStart}
          style={{ touchAction: 'none' }}
        >
          <span className={modalStyles.toolHeaderTitle}>Convert Camera Model</span>
          <button
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            className={modalStyles.toolHeaderClose}
            title="Close"
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>

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
            {validTargetModels.length > 0 ? (
              <select
                value={effectiveTargetModelId !== null ? String(effectiveTargetModelId) : ''}
                onChange={handleTargetChange}
                className={`${inputStyles.select} ${inputStyles.selectSizes.xs} flex-1`}
              >
                <option value="">Select...</option>
                {validTargetModels.map(({ modelId, compatibility }) => (
                  <option key={modelId} value={String(modelId)}>
                    {getModelName(modelId)}{compatibility === 'approximate' ? ' ~' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <span className="flex-1 text-ds-muted text-xs">No targets</span>
            )}
          </div>

          {/* Preview */}
          {conversionPreview && (
            <div className="text-xs space-y-2">
              {/* Characterization */}
              <div className="flex items-center gap-2">
                <span className={charStyle?.text}>{charStyle?.label}</span>
                <span className="text-ds-muted truncate">{conversionPreview.description}</span>
              </div>

              {/* Parameters table */}
              <div className="font-mono">
                {parameterRows.map((row, i) => (
                  <div key={i} className="flex items-center">
                    <span className={`w-16 text-right ${row.status === 'removed' ? 'text-red-400 line-through' : 'text-ds-primary'}`}>
                      {row.sourceValue !== null ? formatParamValue(row.sourceValue) : '—'}
                    </span>
                    <span className={`flex-1 text-center px-2 ${
                      row.status === 'new' ? 'text-blue-400' :
                      row.status === 'removed' ? 'text-red-400' :
                      'text-ds-muted'
                    }`}>
                      {row.name}
                    </span>
                    <span className={`w-16 text-left ${
                      row.status === 'new' ? 'text-blue-400' :
                      row.status === 'changed' ? 'text-amber-400' :
                      row.status === 'removed' ? 'text-ds-muted' :
                      'text-ds-primary'
                    }`}>
                      {row.status === 'removed' ? '—' : formatParamValue(row.targetValue)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Warning */}
              {conversionPreview.warning && (
                <div className="text-amber-400">{conversionPreview.warning}</div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className={controlPanelStyles.actionGroup}>
            <button
              onClick={applyConversion}
              disabled={!canConvert}
              className={canConvert ? controlPanelStyles.actionButtonPrimary : controlPanelStyles.actionButtonPrimaryDisabled}
            >
              Convert{selectedCameras.length > 1 ? ` (${selectedCameras.length})` : ''}
            </button>
            <button
              onClick={onClose}
              className={controlPanelStyles.actionButton}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
