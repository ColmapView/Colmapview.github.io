import type { SelectionColorMode } from '../../../store/types';
import { controlPanelStyles } from '../../../theme';
import {
  ControlButton,
  HueRow,
  SelectRow,
  SliderRow,
  ToggleRow,
  type PanelType,
} from '../ControlComponents';
import { renderSelectionButtonIcon } from '../viewerControlButtonIcons';
import type { SelectionButtonIcon, ViewerControlButtonState } from '../viewerControlsViewModel';
import {
  SELECTION_COLOR_MODE_OPTIONS,
  getSelectionHighlightHint,
  shouldShowSelectionColorControl,
  shouldShowSelectionSpeedControl,
} from './selectionHighlightPanelViewModel';

const styles = controlPanelStyles;

export interface SelectionHighlightPanelProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  button: ViewerControlButtonState<SelectionButtonIcon>;
  showSelectionHighlight: boolean;
  setShowSelectionHighlight: (visible: boolean) => void;
  selectionColorMode: SelectionColorMode;
  setSelectionColorMode: (mode: SelectionColorMode) => void;
  selectionColor: string;
  setSelectionColor: (color: string) => void;
  selectionAnimationSpeed: number;
  setSelectionAnimationSpeed: (speed: number) => void;
  onCycleSelectionColorMode: () => void;
}

export function SelectionHighlightPanel({
  activePanel,
  setActivePanel,
  button,
  showSelectionHighlight,
  setShowSelectionHighlight,
  selectionColorMode,
  setSelectionColorMode,
  selectionColor,
  setSelectionColor,
  selectionAnimationSpeed,
  setSelectionAnimationSpeed,
  onCycleSelectionColorMode,
}: SelectionHighlightPanelProps) {
  const showColorControl = shouldShowSelectionColorControl(selectionColorMode);
  const showSpeedControl = shouldShowSelectionSpeedControl(selectionColorMode);
  const hint = getSelectionHighlightHint(selectionColorMode);

  return (
    <ControlButton
      panelId="selectionColor"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={renderSelectionButtonIcon(button.icon)}
      tooltip={button.tooltip}
      isActive={button.isActive}
      onClick={onCycleSelectionColorMode}
      panelTitle="Selection Highlight"
    >
      <div className={styles.panelContent}>
        <ToggleRow
          label="Show Highlight"
          checked={showSelectionHighlight}
          onChange={setShowSelectionHighlight}
        />
        {showSelectionHighlight && (
          <>
            <SelectRow
              label="Mode"
              value={selectionColorMode}
              onChange={setSelectionColorMode}
              options={SELECTION_COLOR_MODE_OPTIONS}
            />
            {showColorControl && (
              <HueRow label="Color" value={selectionColor} onChange={setSelectionColor} />
            )}
            {showSpeedControl && (
              <SliderRow
                label="Speed"
                value={selectionAnimationSpeed}
                min={0.1}
                max={5}
                step={0.1}
                onChange={setSelectionAnimationSpeed}
                formatValue={(value) => value.toFixed(1)}
              />
            )}
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
