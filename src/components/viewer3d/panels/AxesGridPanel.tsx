import type { AxesCoordinateSystem, AxisLabelMode } from '../../../store/types';
import { HoverIcon } from '../../../icons';
import { controlPanelStyles } from '../../../theme';
import {
  ControlButton,
  SelectRow,
  SliderRow,
  ToggleRow,
  type PanelType,
} from '../ControlComponents';
import { renderAxesGridButtonIcon } from '../viewerControlButtonIcons';
import { getAxesGridButtonState } from '../viewerControlsViewModel';
import {
  AXES_COORDINATE_SYSTEM_OPTIONS,
  AXIS_LABEL_MODE_OPTIONS,
  formatLogScaleValue,
  logSliderValueToScale,
  scaleToLogSliderValue,
} from './axesGridPanelViewModel';

const styles = controlPanelStyles;

export interface AxesGridPanelProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  showAxes: boolean;
  showGrid: boolean;
  toggleAxes: () => void;
  toggleGrid: () => void;
  axesCoordinateSystem: AxesCoordinateSystem;
  setAxesCoordinateSystem: (system: AxesCoordinateSystem) => void;
  axisLabelMode: AxisLabelMode;
  setAxisLabelMode: (mode: AxisLabelMode) => void;
  axesScale: number;
  setAxesScale: (scale: number) => void;
  gridScale: number;
  setGridScale: (scale: number) => void;
  onCycleAxesGrid: () => void;
}

export function AxesGridPanel({
  activePanel,
  setActivePanel,
  showAxes,
  showGrid,
  toggleAxes,
  toggleGrid,
  axesCoordinateSystem,
  setAxesCoordinateSystem,
  axisLabelMode,
  setAxisLabelMode,
  axesScale,
  setAxesScale,
  gridScale,
  setGridScale,
  onCycleAxesGrid,
}: AxesGridPanelProps) {
  const buttonState = getAxesGridButtonState(showAxes, showGrid);

  return (
    <ControlButton
      panelId="axes"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={
        <HoverIcon
          icon={renderAxesGridButtonIcon(buttonState.icon)}
          label={buttonState.label ?? ''}
        />
      }
      tooltip={buttonState.tooltip}
      isActive={buttonState.isActive}
      onClick={onCycleAxesGrid}
      panelTitle="Axes & Grid (G)"
    >
      <div className={styles.panelContent}>
        <ToggleRow label="Show Axes" checked={showAxes} onChange={toggleAxes} />
        <ToggleRow label="Show Grid" checked={showGrid} onChange={toggleGrid} />
        <SelectRow
          label="System"
          value={axesCoordinateSystem}
          onChange={setAxesCoordinateSystem}
          options={AXES_COORDINATE_SYSTEM_OPTIONS}
        />
        <SelectRow
          label="Labels"
          value={axisLabelMode}
          onChange={setAxisLabelMode}
          options={AXIS_LABEL_MODE_OPTIONS}
        />
        <SliderRow
          label="Axes Scale"
          value={scaleToLogSliderValue(axesScale)}
          min={-3}
          max={3}
          step={0.1}
          onChange={(v) => setAxesScale(logSliderValueToScale(v))}
          formatValue={formatLogScaleValue}
        />
        <SliderRow
          label="Grid Scale"
          value={scaleToLogSliderValue(gridScale)}
          min={-3}
          max={3}
          step={0.1}
          onChange={(v) => setGridScale(logSliderValueToScale(v))}
          formatValue={formatLogScaleValue}
        />
      </div>
    </ControlButton>
  );
}
