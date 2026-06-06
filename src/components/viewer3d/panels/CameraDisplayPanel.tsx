import type {
  CameraDisplayMode,
  CameraScaleFactor,
  FrustumColorMode,
} from '../../../store/types';
import { HoverIcon } from '../../../icons';
import { controlPanelStyles } from '../../../theme';
import { ToggleSwitch } from '../../ui/ToggleSwitch';
import {
  ColorPickerRow,
  ControlButton,
  HueSliderRow,
  MouseScrollIcon,
  SelectRow,
  SliderRow,
  ToggleRow,
  type PanelType,
} from '../ControlComponents';
import { renderCameraDisplayButtonIcon } from '../viewerControlButtonIcons';
import {
  getCameraDisplayButtonState,
  type HslColor,
} from '../viewerControlsViewModel';
import {
  CAMERA_DISPLAY_MODE_OPTIONS,
  CAMERA_SCALE_FACTOR_OPTIONS,
  getCameraDisplayHint,
  getFrustumColorModeOptions,
} from './cameraDisplayPanelViewModel';

const styles = controlPanelStyles;

export interface CameraDisplayPanelProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  showCameras: boolean;
  setShowCameras: (visible: boolean) => void;
  cameraDisplayMode: CameraDisplayMode;
  setCameraDisplayMode: (mode: CameraDisplayMode) => void;
  frustumColorMode: FrustumColorMode;
  setFrustumColorMode: (mode: FrustumColorMode) => void;
  hasRigData: boolean;
  frustumSingleColor: string;
  onFrustumColorPickerChange: (hex: string) => void;
  frustumHsl: HslColor;
  onFrustumHueChange: (hue: number) => void;
  onFrustumSaturationChange: (saturation: number) => void;
  onFrustumLightnessChange: (lightness: number) => void;
  cameraScaleFactor: CameraScaleFactor;
  setCameraScaleFactor: (factor: CameraScaleFactor) => void;
  cameraScale: number;
  setCameraScale: (scale: number) => void;
  frustumStandbyOpacity: number;
  setFrustumStandbyOpacity: (opacity: number) => void;
  frustumLineWidth: number;
  setFrustumLineWidth: (lineWidth: number) => void;
  selectionPlaneOpacity: number;
  setSelectionPlaneOpacity: (opacity: number) => void;
  unselectedCameraOpacity: number;
  setUnselectedCameraOpacity: (opacity: number) => void;
  undistortionEnabled: boolean;
  setUndistortionEnabled: (enabled: boolean) => void;
  autoFovEnabled: boolean;
  setAutoFovEnabled: (enabled: boolean) => void;
  splatPsnrFrameReady: boolean;
  splatPsnrComputing: boolean;
  splatPsnrReadyCount: number;
  splatPsnrTotalCount: number;
  splatPsnrUnavailableReason: string | null;
  onCycleCameraDisplayMode: () => void;
}

export function CameraDisplayPanel({
  activePanel,
  setActivePanel,
  showCameras,
  setShowCameras,
  cameraDisplayMode,
  setCameraDisplayMode,
  frustumColorMode,
  setFrustumColorMode,
  hasRigData,
  frustumSingleColor,
  onFrustumColorPickerChange,
  frustumHsl,
  onFrustumHueChange,
  onFrustumSaturationChange,
  onFrustumLightnessChange,
  cameraScaleFactor,
  setCameraScaleFactor,
  cameraScale,
  setCameraScale,
  frustumStandbyOpacity,
  setFrustumStandbyOpacity,
  frustumLineWidth,
  setFrustumLineWidth,
  selectionPlaneOpacity,
  setSelectionPlaneOpacity,
  unselectedCameraOpacity,
  setUnselectedCameraOpacity,
  undistortionEnabled,
  setUndistortionEnabled,
  autoFovEnabled,
  setAutoFovEnabled,
  splatPsnrFrameReady,
  splatPsnrComputing,
  splatPsnrReadyCount,
  splatPsnrTotalCount,
  splatPsnrUnavailableReason,
  onCycleCameraDisplayMode,
}: CameraDisplayPanelProps) {
  const buttonState = getCameraDisplayButtonState(showCameras, cameraDisplayMode);
  const frustumColorModeOptions = getFrustumColorModeOptions({
    hasRigData,
    hasSplatPsnr: splatPsnrFrameReady,
  });
  const hint = getCameraDisplayHint(cameraDisplayMode);

  return (
    <ControlButton
      panelId="scale"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={
        <HoverIcon
          icon={renderCameraDisplayButtonIcon(buttonState.icon)}
          label={buttonState.label ?? ''}
        />
      }
      tooltip={buttonState.tooltip}
      isActive={buttonState.isActive}
      onClick={onCycleCameraDisplayMode}
      panelTitle="Camera Display (F)"
    >
      <div className={styles.panelContent}>
        <ToggleRow label="Show Cameras" checked={showCameras} onChange={setShowCameras} />
        <SelectRow
          label="Mode"
          value={cameraDisplayMode}
          onChange={setCameraDisplayMode}
          options={CAMERA_DISPLAY_MODE_OPTIONS}
        />
        {showCameras && (
          <>
            <SelectRow
              label="Color"
              value={frustumColorMode}
              onChange={setFrustumColorMode}
              options={frustumColorModeOptions}
            />
            {splatPsnrFrameReady && (
              <div className={styles.row}>
                <label className={styles.label}>PSNR</label>
                <div className="flex flex-1 items-center justify-end gap-1">
                  <span className="text-ds-muted text-xs tabular-nums">
                    {splatPsnrComputing ? 'Computing ' : ''}
                    {splatPsnrReadyCount}/{splatPsnrTotalCount}
                  </span>
                </div>
              </div>
            )}
            {!splatPsnrFrameReady && splatPsnrUnavailableReason && (
              <div className={styles.row}>
                <label className={styles.label}>PSNR</label>
                <div className="text-ds-muted flex-1 text-right text-xs">
                  {splatPsnrUnavailableReason}
                </div>
              </div>
            )}
            {frustumColorMode === 'single' && (
              <>
                <ColorPickerRow
                  label="Frustum"
                  value={frustumSingleColor}
                  onChange={onFrustumColorPickerChange}
                />
                <HueSliderRow
                  label="Hue"
                  value={frustumHsl.h}
                  onChange={onFrustumHueChange}
                />
                <SliderRow
                  label="Saturation"
                  value={frustumHsl.s}
                  min={0}
                  max={100}
                  step={1}
                  onChange={onFrustumSaturationChange}
                  formatValue={(v) => `${Math.round(v)}%`}
                />
                <SliderRow
                  label="Lightness"
                  value={frustumHsl.l}
                  min={0}
                  max={100}
                  step={1}
                  onChange={onFrustumLightnessChange}
                  formatValue={(v) => `${Math.round(v)}%`}
                />
              </>
            )}
            <SelectRow
              label="Scale ×"
              value={cameraScaleFactor}
              onChange={setCameraScaleFactor}
              options={CAMERA_SCALE_FACTOR_OPTIONS}
            />
            <SliderRow
              label={<>Scale <span className="text-ds-muted text-xs inline-flex items-center gap-0.5">(Alt+<MouseScrollIcon className="w-3 h-3 inline" />)</span></>}
              value={cameraScale}
              min={0.05}
              max={1}
              step={0.05}
              onChange={setCameraScale}
              formatValue={(v) => v.toFixed(2)}
            />
            <SliderRow
              label="Standby α"
              value={frustumStandbyOpacity}
              min={0}
              max={1}
              step={0.05}
              onChange={setFrustumStandbyOpacity}
              formatValue={(v) => v.toFixed(2)}
            />
            <SliderRow
              label="Line Width"
              value={frustumLineWidth}
              min={1}
              max={6}
              step={0.5}
              onChange={setFrustumLineWidth}
              formatValue={(v) => v.toFixed(1)}
            />
            <SliderRow
              label="Selection α"
              value={selectionPlaneOpacity}
              min={0}
              max={1}
              step={0.05}
              onChange={setSelectionPlaneOpacity}
              formatValue={(v) => v.toFixed(2)}
            />
            <SliderRow
              label="Unselected α"
              value={unselectedCameraOpacity}
              min={0}
              max={1}
              step={0.05}
              onChange={setUnselectedCameraOpacity}
              formatValue={(v) => v.toFixed(2)}
            />
            <div className={styles.row}>
              <label className={styles.label}>Undistort (U)</label>
              <span className="flex-1" />
              <ToggleSwitch checked={undistortionEnabled} onChange={setUndistortionEnabled} />
            </div>
            <div className={styles.row}>
              <label className={styles.label}>Auto FOV</label>
              <span className="flex-1" />
              <ToggleSwitch checked={autoFovEnabled} onChange={setAutoFovEnabled} />
            </div>
          </>
        )}
        <div className={styles.hint}>
          <div className="mb-1 font-medium">{hint.title}</div>
          {hint.lines.map((line) => (
            <div key={`${hint.title}-${line}`}>{line}</div>
          ))}
        </div>
      </div>
    </ControlButton>
  );
}
