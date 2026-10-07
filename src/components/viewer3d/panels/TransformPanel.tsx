import { memo } from 'react';
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
  getTransformPanelState,
  radiansToDegrees,
  TRANSFORM_PENDING_HINT,
} from './transformPanelViewModel';
import { useTransformPanelStoreFacade } from './useTransformPanelStoreFacade';

const styles = controlPanelStyles;

export interface TransformPanelProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

/**
 * Toolbar entry point for EDITING the Sim3D transform by hand and committing
 * it: the gizmo — the button's own click, the `T` hotkey, and the toggle row —
 * plus the scale/rotate/translate sliders. Operations that COMPUTE a transform
 * from the scene (Center at Origin, Floor Detection, the point-picking tools)
 * live in the Align panel next door, so no control has two homes. Reset/Apply
 * are the exception on purpose: they act on the one pending transform in
 * `transformStore`, which both panels write, so both offer the commit.
 */
export const TransformPanel = memo(function TransformPanel({
  activePanel,
  setActivePanel,
}: TransformPanelProps) {
  const {
    data: {
      reconstruction,
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
    actions: {
      applyTransformToData,
      confirmReload,
    },
  } = useTransformPanelStoreFacade();
  const { reloadFiles } = useFileDropzone();
  const reload = async () => {
    if (!droppedFiles || !await confirmReload()) return;
    resetTransform();
    void reloadFiles(droppedFiles);
  };

  const panelState = getTransformPanelState({
    transform,
    showGizmo,
    hasDroppedFiles: Boolean(droppedFiles),
  });

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

        {/*
          Reset/Apply act on the same pending transform the Align panel's ops
          write, so that panel offers them too. Reload is this panel's alone: it
          re-reads the dropped files rather than touching the transform.
        */}
        <div className={styles.actionGroup}>
          <button
            onClick={resetTransform}
            disabled={!panelState.canResetTransform}
            className={panelState.canResetTransform ? styles.actionButton : styles.actionButtonDisabled}
          >
            Reset
          </button>
          <button
            onClick={() => { void reload(); }}
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
          <div className={styles.hint}>{TRANSFORM_PENDING_HINT}</div>
        )}
      </div>
    </ControlButton>
  );
});
