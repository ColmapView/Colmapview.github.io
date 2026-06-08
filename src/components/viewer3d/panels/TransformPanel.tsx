import { memo, useCallback } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useFileDropzone } from '../../../hooks/useFileDropzone';
import { TransformIcon } from '../../../icons';
import { controlPanelStyles, HOTKEYS } from '../../../theme';
import {
  ControlButton,
  SliderRow,
  ToggleRow,
  type PanelType,
} from '../ControlComponents';
import {
  degreesToRadians,
  formatTransformDegreesValue,
  formatTransformScaleValue,
  formatTransformTranslationValue,
  getPointCloudStateForPickingMode,
  getTransformPanelState,
  getTransformPickingButtonState,
  radiansToDegrees,
} from './transformPanelViewModel';
import { useTransformPanelStoreFacade } from './useTransformPanelStoreFacade';

const styles = controlPanelStyles;

export interface TransformPanelProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  onOpenFloorModal: () => void;
}

export const TransformPanel = memo(function TransformPanel({
  activePanel,
  setActivePanel,
  onOpenFloorModal,
}: TransformPanelProps) {
  const {
    data: {
      reconstruction,
      wasmReconstruction,
      droppedFiles,
    },
    transform: {
      transform,
      setTransform,
      resetTransform,
    },
    ui: {
      showGizmo,
      toggleGizmo,
    },
    pointPicking: {
      pickingMode,
      setPickingMode,
    },
    pointCloud: {
      showPointCloud,
      colorMode,
      setShowPointCloud,
      setColorMode,
    },
    actions: {
      applyTransformPreset,
      applyTransformToData,
    },
  } = useTransformPanelStoreFacade();
  const { processFiles } = useFileDropzone();

  const hasPoints = wasmReconstruction?.hasPoints() ?? false;
  const panelState = getTransformPanelState({
    transform,
    showGizmo,
    hasPoints,
    hasDroppedFiles: Boolean(droppedFiles),
  });
  const onePointOriginButton = getTransformPickingButtonState(pickingMode, 'origin-1pt');
  const twoPointScaleButton = getTransformPickingButtonState(pickingMode, 'distance-2pt');
  const threePointAlignButton = getTransformPickingButtonState(pickingMode, 'normal-3pt');
  const handlePickingModeClick = useCallback((nextMode: typeof pickingMode) => {
    if (nextMode !== 'off') {
      const nextPointState = getPointCloudStateForPickingMode({
        showPointCloud,
        colorMode,
      });
      if (nextPointState.showPointCloud !== showPointCloud) {
        setShowPointCloud(nextPointState.showPointCloud);
      }
      if (nextPointState.colorMode !== colorMode) {
        setColorMode(nextPointState.colorMode);
      }
    }

    setPickingMode(nextMode);
  }, [colorMode, setColorMode, setPickingMode, setShowPointCloud, showPointCloud]);

  useHotkeys(
    HOTKEYS.toggleGizmo.keys,
    toggleGizmo,
    { scopes: HOTKEYS.toggleGizmo.scopes },
    [toggleGizmo]
  );

  return (
    <ControlButton
      panelId="transform"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={<TransformIcon className="w-6 h-6" />}
      tooltip={panelState.tooltip}
      isActive={showGizmo}
      onClick={toggleGizmo}
      onDoubleClick={panelState.canApplyTransform ? applyTransformToData : undefined}
      panelTitle="Transform"
      disabled={!reconstruction}
    >
      <div className={styles.panelContent}>
        <ToggleRow label="Gizmo (T)" checked={showGizmo} onChange={toggleGizmo} />

        <SliderRow
          label="Scale"
          value={transform.scale}
          min={0.01}
          max={10}
          step={0.01}
          onChange={(v) => setTransform({ scale: v })}
          formatValue={formatTransformScaleValue}
        />

        <SliderRow
          label="Rotate-X"
          value={radiansToDegrees(transform.rotationX)}
          min={-180}
          max={180}
          step={1}
          onChange={(v) => setTransform({ rotationX: degreesToRadians(v) })}
          formatValue={formatTransformDegreesValue}
        />
        <SliderRow
          label="Rotate-Y"
          value={radiansToDegrees(transform.rotationY)}
          min={-180}
          max={180}
          step={1}
          onChange={(v) => setTransform({ rotationY: degreesToRadians(v) })}
          formatValue={formatTransformDegreesValue}
        />
        <SliderRow
          label="Rotate-Z"
          value={radiansToDegrees(transform.rotationZ)}
          min={-180}
          max={180}
          step={1}
          onChange={(v) => setTransform({ rotationZ: degreesToRadians(v) })}
          formatValue={formatTransformDegreesValue}
        />
        <SliderRow
          label="Translate-X"
          value={transform.translationX}
          min={-100}
          max={100}
          step={0.1}
          onChange={(v) => setTransform({ translationX: v })}
          formatValue={formatTransformTranslationValue}
        />
        <SliderRow
          label="Translate-Y"
          value={transform.translationY}
          min={-100}
          max={100}
          step={0.1}
          onChange={(v) => setTransform({ translationY: v })}
          formatValue={formatTransformTranslationValue}
        />
        <SliderRow
          label="Translate-Z"
          value={transform.translationZ}
          min={-100}
          max={100}
          step={0.1}
          onChange={(v) => setTransform({ translationZ: v })}
          formatValue={formatTransformTranslationValue}
        />

        <div className={styles.presetGroup}>
          <button
            onClick={() => applyTransformPreset('centerAtOrigin')}
            className={styles.presetButton}
            data-tooltip="Move scene center to (0,0,0)"
            data-tooltip-pos="bottom"
          >
            Center at Origin
          </button>
        </div>

        <div className={styles.presetGroup}>
          <button
            onClick={() => handlePickingModeClick(onePointOriginButton.nextMode)}
            className={onePointOriginButton.isActive ? styles.actionButtonPrimary : styles.presetButton}
            data-tooltip="{LMB} Click 1 point to set as origin (0,0,0)"
            data-tooltip-pos="bottom"
          >
            1-Point Origin
          </button>
          <button
            onClick={() => handlePickingModeClick(twoPointScaleButton.nextMode)}
            className={twoPointScaleButton.isActive ? styles.actionButtonPrimary : styles.presetButton}
            data-tooltip="{LMB} Click 2 points, set target distance"
            data-tooltip-pos="bottom"
          >
            2-Point Scale
          </button>
          <button
            onClick={() => handlePickingModeClick(threePointAlignButton.nextMode)}
            className={threePointAlignButton.isActive ? styles.actionButtonPrimary : styles.presetButton}
            data-tooltip="{LMB} Click 3 points clockwise to align plane with Y-up"
            data-tooltip-pos="bottom"
          >
            3-Point Align
          </button>
          <button
            onClick={onOpenFloorModal}
            disabled={!panelState.canRunFloorDetection}
            className={panelState.canRunFloorDetection ? styles.presetButton : styles.actionButtonDisabled}
            data-tooltip="RANSAC floor plane detection"
            data-tooltip-pos="bottom"
          >
            Floor Detection
          </button>
        </div>

        <div className={styles.actionGroup}>
          <button
            onClick={resetTransform}
            disabled={!panelState.canResetTransform}
            className={panelState.canResetTransform ? styles.actionButton : styles.actionButtonDisabled}
          >
            Reset
          </button>
          <button
            onClick={() => { if (droppedFiles) { resetTransform(); processFiles(droppedFiles); } }}
            disabled={!panelState.canReloadDroppedFiles}
            className={panelState.canReloadDroppedFiles ? styles.actionButton : styles.actionButtonDisabled}
          >
            Reload
          </button>
          <button
            onClick={applyTransformToData}
            disabled={!panelState.canApplyTransform}
            className={panelState.canApplyTransform ? styles.actionButtonPrimary : styles.actionButtonPrimaryDisabled}
          >
            Apply
          </button>
        </div>

        {panelState.hasChanges && (
          <div className={styles.hint}>
            Transform will be applied to reconstruction data when you click "Apply".
          </div>
        )}
      </div>
    </ControlButton>
  );
});
