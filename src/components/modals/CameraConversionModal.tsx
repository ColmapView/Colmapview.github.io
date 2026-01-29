/**
 * Modal for camera model conversion with parameter preview.
 * Shows source and target parameters side-by-side with conversion characterization.
 */

import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  useReconstructionStore,
  useNotificationStore,
} from '../../store';
import {
  convertCameraModel,
  getValidTargetModels,
  getConversionPreview,
  type ConversionCompatibility,
  type ConversionPreview,
} from '../../utils/cameraModelConversions';
import { CameraModelId, type Camera, type CameraId } from '../../types/colmap';
import { modalStyles, inputStyles, buttonStyles } from '../../theme';

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

/** Get model name with fallback */
function getModelName(modelId: CameraModelId): string {
  return MODEL_NAMES[modelId] ?? `Unknown (${modelId})`;
}

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
  exact: { text: 'text-green-400', label: 'Exact' },
  expansion: { text: 'text-blue-400', label: 'Expansion' },
  lossy: { text: 'text-amber-400', label: 'Lossy' },
  approximation: { text: 'text-orange-400', label: 'Approx' },
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

  // Position and drag state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Center modal function
  const centerModal = useCallback(() => {
    if (panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      setPosition({
        x: (viewportW - rect.width) / 2,
        y: Math.max(20, (viewportH - rect.height) / 2),
      });
    }
  }, []);

  // Center modal when opened
  useEffect(() => {
    if (isOpen) {
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      setPosition({
        x: (viewportW - 360) / 2,
        y: Math.max(20, (viewportH - 160) / 2),
      });
      requestAnimationFrame(centerModal);
    }
  }, [isOpen, centerModal]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  }, [position]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: dragStart.current.posX + e.clientX - dragStart.current.x,
          y: dragStart.current.posY + e.clientY - dragStart.current.y,
        });
      }
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

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
    <div className="fixed inset-0 z-[1000] pointer-events-none">
      <div className={modalStyles.backdrop} onClick={onClose} />

      <div
        ref={panelRef}
        className={modalStyles.panel}
        style={{ left: position.x, top: position.y }}
      >
        {/* Header - same pattern as ImageDetailModal */}
        <div
          className="flex items-center justify-between px-4 py-2 rounded-t-lg bg-ds-secondary text-xs cursor-move select-none"
          onMouseDown={handleDragStart}
        >
          <span className="text-ds-primary">Convert Camera Model</span>
          <button
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
            className={modalStyles.closeButton}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-3 space-y-3">
          {/* Selectors */}
          <div className="flex items-center gap-2 text-xs">
            <select
              value={selectedCameraId === 'all' ? 'all' : String(selectedCameraId)}
              onChange={handleCameraChange}
              className={`${inputStyles.select} flex-1 py-1 text-xs`}
            >
              {cameraOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <span className="text-ds-muted">→</span>
            {validTargetModels.length > 0 ? (
              <select
                value={effectiveTargetModelId !== null ? String(effectiveTargetModelId) : ''}
                onChange={handleTargetChange}
                className={`${inputStyles.select} flex-1 py-1 text-xs`}
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
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className={`${buttonStyles.base} ${buttonStyles.sizes.xs} ${buttonStyles.variants.ghost}`}>
              Cancel
            </button>
            <button
              onClick={applyConversion}
              disabled={!canConvert}
              className={`${buttonStyles.base} ${buttonStyles.sizes.xs} ${canConvert ? buttonStyles.variants.primary : buttonStyles.disabled}`}
            >
              Convert{selectedCameras.length > 1 ? ` (${selectedCameras.length})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
