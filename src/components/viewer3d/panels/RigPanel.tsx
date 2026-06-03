import type { RigColorMode, RigDisplayMode } from '../../../store/types';
import { HoverIcon } from '../../../icons';
import { controlPanelStyles } from '../../../theme';
import {
  ControlButton,
  HueRow,
  SelectRow,
  SliderRow,
  ToggleRow,
  type PanelType,
} from '../ControlComponents';
import { renderRigButtonIcon } from '../viewerControlButtonIcons';
import type { RigButtonIcon, ViewerControlButtonState } from '../viewerControlsViewModel';
import {
  RIG_COLOR_MODE_OPTIONS,
  RIG_DISPLAY_MODE_OPTIONS,
  getDetectedRigHint,
  shouldEnableRigCycle,
  shouldShowRigHueControl,
} from './rigPanelViewModel';

const styles = controlPanelStyles;

export interface RigPanelProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  button: ViewerControlButtonState<RigButtonIcon>;
  hasRigData: boolean;
  showRig: boolean;
  setShowRig: (visible: boolean) => void;
  rigDisplayMode: RigDisplayMode;
  setRigDisplayMode: (mode: RigDisplayMode) => void;
  rigColorMode: RigColorMode;
  setRigColorMode: (mode: RigColorMode) => void;
  rigLineColor: string;
  setRigLineColor: (color: string) => void;
  rigLineOpacity: number;
  setRigLineOpacity: (opacity: number) => void;
  cameraCount: number;
  frameCount: number;
  onCycleRigDisplayMode: () => void;
}

export function RigPanel({
  activePanel,
  setActivePanel,
  button,
  hasRigData,
  showRig,
  setShowRig,
  rigDisplayMode,
  setRigDisplayMode,
  rigColorMode,
  setRigColorMode,
  rigLineColor,
  setRigLineColor,
  rigLineOpacity,
  setRigLineOpacity,
  cameraCount,
  frameCount,
  onCycleRigDisplayMode,
}: RigPanelProps) {
  const canCycleRig = shouldEnableRigCycle(hasRigData);
  const showRigHueControl = shouldShowRigHueControl(rigColorMode);
  const detectedRigHint = getDetectedRigHint(cameraCount, frameCount, showRig);

  return (
    <ControlButton
      panelId="rig"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={
        <HoverIcon
          icon={renderRigButtonIcon(button.icon)}
          label={button.label ?? ''}
        />
      }
      tooltip={button.tooltip}
      isActive={button.isActive}
      onClick={canCycleRig ? onCycleRigDisplayMode : undefined}
      panelTitle="Rig Connections"
      disabled={button.disabled}
    >
      <div className={styles.panelContent}>
        {hasRigData ? (
          <>
            <ToggleRow label="Show Rig" checked={showRig} onChange={setShowRig} />
            {showRig && (
              <SelectRow
                label="Mode"
                value={rigDisplayMode}
                onChange={setRigDisplayMode}
                options={RIG_DISPLAY_MODE_OPTIONS}
              />
            )}
            {showRig && (
              <>
                <SelectRow
                  label="Color"
                  value={rigColorMode}
                  onChange={setRigColorMode}
                  options={RIG_COLOR_MODE_OPTIONS}
                />
                {showRigHueControl && (
                  <HueRow label="Hue" value={rigLineColor} onChange={setRigLineColor} />
                )}
                <SliderRow
                  label="Opacity"
                  value={rigLineOpacity}
                  min={0.1}
                  max={1}
                  step={0.05}
                  onChange={setRigLineOpacity}
                  formatValue={(value) => value.toFixed(2)}
                />
              </>
            )}
            <div className={styles.hint}>
              <div className="mb-1 font-medium">{detectedRigHint.title}</div>
              <div>{detectedRigHint.summary}</div>
              <div className="mt-2">
                <div>{detectedRigHint.statusLine}</div>
              </div>
              {detectedRigHint.lines.map((line) => (
                <div key={`detected-rig-${line}`}>{line}</div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-ds-secondary text-sm">
            <div className="mb-2 font-medium">No Multi-Camera Data</div>
            <div>To use this feature, images</div>
            <div>need directory/filename format:</div>
            <div className="mt-2 font-mono text-xs">
              <div>• cam_1/frame_00.png</div>
              <div>• cam_2/frame_00.png</div>
            </div>
            <div className="mt-2">Images with same filename</div>
            <div>are connected as a rig.</div>
          </div>
        )}
      </div>
    </ControlButton>
  );
}
