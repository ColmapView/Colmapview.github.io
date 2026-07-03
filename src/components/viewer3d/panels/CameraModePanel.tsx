import type {
  AutoRotateMode,
  CameraMode,
  HorizonLockMode,
} from '../../../store/types';
import { HoverIcon } from '../../../icons';
import { controlPanelStyles } from '../../../theme';
import { ToggleSwitch } from '../../ui/ToggleSwitch';
import {
  ControlButton,
  SelectRow,
  SliderRow,
  type PanelType,
} from '../ControlComponents';
import { renderCameraModeButtonIcon } from '../viewerControlButtonIcons';
import { getCameraModeButtonState } from '../viewerControlsViewModel';
import {
  AUTO_ROTATE_MODE_OPTIONS,
  CAMERA_MODE_KEYBOARD_HINT_LINES,
  CAMERA_MODE_MODIFIER_HINT_LINES,
  CAMERA_MODE_OPTIONS,
  HORIZON_LOCK_OPTIONS,
  formatFlyTransitionDuration,
  getCameraModeMouseHintLines,
  shouldShowAutoRotateControls,
} from './cameraModePanelViewModel';

const styles = controlPanelStyles;

export interface CameraModePanelProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  cameraMode: CameraMode;
  setCameraMode: (mode: CameraMode) => void;
  flySpeed: number;
  setFlySpeed: (speed: number) => void;
  flyTransitionDuration: number;
  setFlyTransitionDuration: (duration: number) => void;
  pointerLock: boolean;
  setPointerLock: (enabled: boolean) => void;
  horizonLock: HorizonLockMode;
  setHorizonLock: (mode: HorizonLockMode) => void;
  autoRotateMode: AutoRotateMode;
  setAutoRotateMode: (mode: AutoRotateMode) => void;
  autoRotateSpeed: number;
  setAutoRotateSpeed: (speed: number) => void;
  onToggleCameraMode: () => void;
}

export function CameraModePanel({
  activePanel,
  setActivePanel,
  cameraMode,
  setCameraMode,
  flySpeed,
  setFlySpeed,
  flyTransitionDuration,
  setFlyTransitionDuration,
  pointerLock,
  setPointerLock,
  horizonLock,
  setHorizonLock,
  autoRotateMode,
  setAutoRotateMode,
  autoRotateSpeed,
  setAutoRotateSpeed,
  onToggleCameraMode,
}: CameraModePanelProps) {
  const buttonState = getCameraModeButtonState(cameraMode);
  const showAutoRotateControls = shouldShowAutoRotateControls(cameraMode);
  const mouseHintLines = getCameraModeMouseHintLines(cameraMode);

  return (
    <ControlButton
      panelId="camera"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={
        <HoverIcon
          icon={renderCameraModeButtonIcon(buttonState.icon)}
          label={buttonState.label ?? ''}
        />
      }
      tooltip={buttonState.tooltip}
      onClick={onToggleCameraMode}
      panelTitle="Camera Mode (C)"
    >
      <div className={styles.panelContent}>
        <SelectRow
          label="Mode"
          value={cameraMode}
          onChange={setCameraMode}
          options={CAMERA_MODE_OPTIONS}
        />
        <SliderRow
          label="Speed"
          value={flySpeed}
          min={0.1}
          max={5}
          step={0.1}
          onChange={setFlySpeed}
          formatValue={(v) => v.toFixed(1)}
        />
        <SliderRow
          label="Goto Anim"
          value={flyTransitionDuration}
          min={0}
          max={2000}
          step={100}
          onChange={setFlyTransitionDuration}
          formatValue={formatFlyTransitionDuration}
        />
        <div className={styles.row}>
          <label className={styles.label}>Pointer Lock</label>
          <span className="flex-1" />
          <ToggleSwitch checked={pointerLock} onChange={setPointerLock} />
        </div>
        <SelectRow
          label="Horizon Lock (H)"
          value={horizonLock}
          onChange={setHorizonLock}
          options={HORIZON_LOCK_OPTIONS}
        />
        {showAutoRotateControls && (
          <>
            <SelectRow
              label="Auto Orbit"
              value={autoRotateMode}
              onChange={setAutoRotateMode}
              options={AUTO_ROTATE_MODE_OPTIONS}
            />
            <SliderRow
              label="Rotate Speed"
              value={autoRotateSpeed}
              min={0.1}
              max={2}
              step={0.1}
              onChange={setAutoRotateSpeed}
              formatValue={(v) => v.toFixed(1)}
            />
          </>
        )}
        <div className={styles.hint}>
          <div className="mb-1 font-medium">Mouse:</div>
          {mouseHintLines.map((line) => (
            <div key={`mouse-${line}`}>{line}</div>
          ))}
          <div className="mt-2 font-medium">Keyboard:</div>
          {CAMERA_MODE_KEYBOARD_HINT_LINES.map((line) => (
            <div key={`keyboard-${line}`}>{line}</div>
          ))}
          <div className="mt-2 font-medium">Modifiers:</div>
          {CAMERA_MODE_MODIFIER_HINT_LINES.map((line) => (
            <div key={`modifier-${line}`}>{line}</div>
          ))}
        </div>
      </div>
    </ControlButton>
  );
}
