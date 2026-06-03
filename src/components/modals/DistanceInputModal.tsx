import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { controlPanelStyles, modalStyles } from '../../theme';
import { CloseIcon } from '../../icons';
import { useModalDrag } from '../../hooks/useModalDrag';
import { useResetKeyedState } from '../../hooks/useResetKeyedState';
import { useDistanceInputStoreFacade } from './useDistanceInputStoreFacade';
import {
  DISTANCE_INPUT_MODAL_ESTIMATED_HEIGHT,
  DISTANCE_INPUT_MODAL_ESTIMATED_WIDTH,
  getDistanceInputApplyResult,
  getDistanceInputModalPanelStyle,
  getDistanceInputTargetUp,
  getInitialDistanceInputValue,
  shouldApplyDistanceInputKey,
  shouldShowDistanceValueInput,
} from './distanceInputModalViewModel';

/**
 * Confirmation popup for point picking tools.
 * - 2-point scale: shows distance input + tick/retry/cancel
 * - 3-point align: shows tick/retry/cancel (no input)
 *
 * tick = confirm (apply transform)
 * X = retry (clear points, stay in picking mode)
 * click outside = cancel (exit picking mode)
 */
export function DistanceInputModal() {
  const {
    pointPicking: {
      showDistanceModal,
      modalPosition,
      selectedPoints,
      pickingMode,
      normalFlipped,
      targetAxis,
      setShowDistanceModal,
      setTargetDistance,
      clearSelectedPoints,
      reset,
    },
    transform: {
      transform,
      setTransform,
    },
    ui: {
      axesCoordinateSystem,
    },
  } = useDistanceInputStoreFacade();

  const targetUp = useMemo(() => {
    return getDistanceInputTargetUp(axesCoordinateSystem, targetAxis);
  }, [axesCoordinateSystem, targetAxis]);
  const showDistanceInput = shouldShowDistanceValueInput(pickingMode);

  const initialInputValue = getInitialDistanceInputValue(showDistanceModal, selectedPoints);
  const [inputValue, setInputValue] = useResetKeyedState(showDistanceModal, initialInputValue);
  const inputRef = useRef<HTMLInputElement>(null);

  const { position, panelRef, handleDragStart } = useModalDrag({
    estimatedWidth: DISTANCE_INPUT_MODAL_ESTIMATED_WIDTH,
    estimatedHeight: DISTANCE_INPUT_MODAL_ESTIMATED_HEIGHT,
    isOpen: showDistanceModal,
    initialPosition: modalPosition,
  });

  // Focus input when modal opens
  useEffect(() => {
    if (showDistanceModal && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [showDistanceModal]);

  // Cancel: exit picking mode entirely
  const handleCancel = useCallback(() => {
    setShowDistanceModal(false);
    reset();
  }, [setShowDistanceModal, reset]);

  // Close with Escape - cancels picking mode
  useHotkeys(
    'escape',
    () => handleCancel(),
    { enabled: showDistanceModal },
    [showDistanceModal, handleCancel]
  );

  // Retry: clear points but stay in picking mode
  const handleRetry = useCallback(() => {
    setShowDistanceModal(false);
    clearSelectedPoints();
  }, [setShowDistanceModal, clearSelectedPoints]);

  // Apply: compute and apply the transform
  const handleApply = useCallback(() => {
    const result = getDistanceInputApplyResult({
      pickingMode,
      selectedPoints,
      inputValue,
      normalFlipped,
      targetUp,
      transform,
    });
    if (!result) return;

    setTransform(result.transform);
    if (result.targetDistance !== null) {
      setTargetDistance(result.targetDistance);
    }
    setShowDistanceModal(false);
    reset();
  }, [pickingMode, inputValue, selectedPoints, normalFlipped, targetUp, transform, setTransform, setTargetDistance, setShowDistanceModal, reset]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (shouldApplyDistanceInputKey(e.key)) {
      handleApply();
    }
  }, [handleApply]);

  if (!showDistanceModal) return null;

  return (
    <div
      ref={panelRef}
      className="fixed bg-ds-tertiary border border-ds rounded shadow-ds-lg p-1"
      style={getDistanceInputModalPanelStyle(position)}
      onPointerDown={handleDragStart}
    >
        <div className="flex items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
          {/* Distance input only for 2-point mode (not for 1-point origin or 3-point align) */}
          {showDistanceInput && (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onPointerDown={(e) => e.stopPropagation()}
              className={`${controlPanelStyles.valueInput} w-14 font-mono`}
              title="Target distance"
            />
          )}
          {/* Confirm button (tick) */}
          <button
            onClick={handleApply}
            className={modalStyles.iconButtonConfirm}
            title="Confirm"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </button>
          {/* Retry button - clear points but stay in mode */}
          <button
            onClick={handleRetry}
            className={modalStyles.iconButtonRetry}
            title="Retry"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
          {/* Cancel button (X) - exit picking mode */}
          <button
            onClick={handleCancel}
            className={modalStyles.iconButtonCancel}
            title="Cancel"
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>
    </div>
  );
}
