import type { ColorMode, Reconstruction } from '../../../types/colmap';
import { HoverIcon } from '../../../icons';
import { controlPanelStyles } from '../../../theme';
import {
  ControlButton,
  HueRow,
  MouseScrollIcon,
  SelectRow,
  SliderRow,
  ToggleRow,
  type PanelType,
} from '../ControlComponents';
import { renderPointCloudButtonIcon } from '../viewerControlButtonIcons';
import { getPointCloudButtonState } from '../viewerControlsViewModel';
import {
  POINT_COLOR_MODE_OPTIONS,
  formatMaxReprojectionError,
  getMaxReprojectionErrorFromSliderValue,
  getMaxReprojectionErrorSliderValue,
  getPointCloudColorHint,
  getPointCloudMaxErrorLimit,
  shouldShowSplatPointOverlayColorControl,
  shouldShowSplatPointOverlaySpeedControl,
} from './pointCloudPanelViewModel';

const styles = controlPanelStyles;

export interface PointCloudPanelProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  showPointCloud: boolean;
  togglePointCloud: () => void;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  pointSize: number;
  setPointSize: (size: number) => void;
  pointOpacity: number;
  setPointOpacity: (opacity: number) => void;
  minTrackLength: number;
  setMinTrackLength: (length: number) => void;
  thinning: number;
  setThinning: (thinning: number) => void;
  maxReprojectionError: number | null;
  setMaxReprojectionError: (error: number | null) => void;
  reconstruction: Reconstruction | null;
  selectionColor: string;
  setSelectionColor: (color: string) => void;
  selectionAnimationSpeed: number;
  setSelectionAnimationSpeed: (speed: number) => void;
  onCycleColorMode: () => void;
}

export function PointCloudPanel({
  activePanel,
  setActivePanel,
  showPointCloud,
  togglePointCloud,
  colorMode,
  setColorMode,
  pointSize,
  setPointSize,
  pointOpacity,
  setPointOpacity,
  minTrackLength,
  setMinTrackLength,
  thinning,
  setThinning,
  maxReprojectionError,
  setMaxReprojectionError,
  reconstruction,
  selectionColor,
  setSelectionColor,
  selectionAnimationSpeed,
  setSelectionAnimationSpeed,
  onCycleColorMode,
}: PointCloudPanelProps) {
  const buttonState = getPointCloudButtonState(showPointCloud, colorMode);
  const maxError = getPointCloudMaxErrorLimit(reconstruction?.globalStats.maxError);
  const colorHint = getPointCloudColorHint(colorMode);
  const showSplatPointOverlayColorControl = shouldShowSplatPointOverlayColorControl(colorMode);
  const showSplatPointOverlaySpeedControl = shouldShowSplatPointOverlaySpeedControl(colorMode);

  return (
    <ControlButton
      panelId="points"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={
        <HoverIcon
          icon={renderPointCloudButtonIcon(buttonState.icon)}
          label={buttonState.label ?? ''}
        />
      }
      tooltip={buttonState.tooltip}
      isActive={buttonState.isActive}
      onClick={onCycleColorMode}
      panelTitle="Point Cloud (P)"
    >
      <div className={styles.panelContent}>
        <ToggleRow label="Show Points" checked={showPointCloud} onChange={togglePointCloud} />
        <SelectRow
          label="Color"
          value={colorMode}
          onChange={setColorMode}
          options={POINT_COLOR_MODE_OPTIONS}
        />
        <SliderRow
          label={<>Size <span className="text-ds-muted text-xs inline-flex items-center gap-0.5">(Ctrl+<MouseScrollIcon className="w-3 h-3 inline" />)</span></>}
          value={pointSize}
          min={1}
          max={10}
          step={0.5}
          onChange={setPointSize}
        />
        <SliderRow
          label="Opacity"
          value={pointOpacity}
          min={0}
          max={1}
          step={0.05}
          onChange={setPointOpacity}
          formatValue={(v) => `${Math.round(v * 100)}%`}
        />
        {showSplatPointOverlayColorControl && (
          <HueRow label="Point Color" value={selectionColor} onChange={setSelectionColor} />
        )}
        {showSplatPointOverlaySpeedControl && (
          <SliderRow
            label="Blink Speed"
            value={selectionAnimationSpeed}
            min={0.1}
            max={5}
            step={0.1}
            onChange={setSelectionAnimationSpeed}
            formatValue={(value) => value.toFixed(1)}
          />
        )}
        <SliderRow
          label="Min Track"
          value={minTrackLength}
          min={0}
          max={20}
          step={1}
          onChange={(v) => setMinTrackLength(Math.round(v))}
        />
        <SliderRow
          label="Thinning"
          value={thinning}
          min={0}
          max={99}
          step={1}
          onChange={(v) => setThinning(Math.round(v))}
        />
        <SliderRow
          label="Max Error"
          value={getMaxReprojectionErrorSliderValue(maxReprojectionError, maxError)}
          min={0}
          max={maxError}
          step={0.1}
          onChange={(v) => {
            setMaxReprojectionError(getMaxReprojectionErrorFromSliderValue(v, maxError));
          }}
          formatValue={(v) => formatMaxReprojectionError(maxReprojectionError, v)}
        />

        <div className={styles.hint}>
          <div className="mb-1 font-medium">{colorHint.title}</div>
          {colorHint.lines.map((line) => (
            <div key={`${colorHint.title}-${line}`}>{line}</div>
          ))}
        </div>
      </div>
    </ControlButton>
  );
}
