import type { MatchesDisplayMode } from '../../../store/types';
import { controlPanelStyles } from '../../../theme';
import {
  ControlButton,
  HueRow,
  SelectRow,
  SliderRow,
  ToggleRow,
  type PanelType,
} from '../ControlComponents';
import { renderMatchesButtonIcon } from '../viewerControlButtonIcons';
import type { MatchesButtonIcon, ViewerControlButtonState } from '../viewerControlsViewModel';
import {
  MATCHES_DISPLAY_MODE_OPTIONS,
  getMatchesPanelHint,
} from './matchesPanelViewModel';

const styles = controlPanelStyles;

export interface MatchesPanelProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  button: ViewerControlButtonState<MatchesButtonIcon>;
  showMatches: boolean;
  setShowMatches: (visible: boolean) => void;
  matchesDisplayMode: MatchesDisplayMode;
  setMatchesDisplayMode: (mode: MatchesDisplayMode) => void;
  matchesOpacity: number;
  setMatchesOpacity: (opacity: number) => void;
  matchesColor: string;
  setMatchesColor: (color: string) => void;
  onCycleMatchesDisplayMode: () => void;
}

export function MatchesPanel({
  activePanel,
  setActivePanel,
  button,
  showMatches,
  setShowMatches,
  matchesDisplayMode,
  setMatchesDisplayMode,
  matchesOpacity,
  setMatchesOpacity,
  matchesColor,
  setMatchesColor,
  onCycleMatchesDisplayMode,
}: MatchesPanelProps) {
  const hint = getMatchesPanelHint(showMatches, matchesDisplayMode);

  return (
    <ControlButton
      panelId="matches"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={renderMatchesButtonIcon(button.icon)}
      tooltip={button.tooltip}
      isActive={button.isActive}
      onClick={onCycleMatchesDisplayMode}
      panelTitle="Show Matches (M)"
    >
      <div className={styles.panelContent}>
        <ToggleRow label="Show Matches" checked={showMatches} onChange={setShowMatches} />
        {showMatches && (
          <SelectRow
            label="Mode"
            value={matchesDisplayMode}
            onChange={setMatchesDisplayMode}
            options={MATCHES_DISPLAY_MODE_OPTIONS}
          />
        )}
        {showMatches && (
          <>
            <SliderRow
              label="Opacity"
              value={matchesOpacity}
              min={0.5}
              max={1}
              step={0.05}
              onChange={setMatchesOpacity}
              formatValue={(value) => value.toFixed(2)}
            />
            <HueRow label="Color" value={matchesColor} onChange={setMatchesColor} />
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
