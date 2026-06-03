import { BgIcon } from '../../../icons';
import { controlPanelStyles } from '../../../theme';
import {
  ColorPickerRow,
  ControlButton,
  HueSliderRow,
  SliderRow,
  type PanelType,
} from '../ControlComponents';
import type { HslColor } from '../viewerControlsViewModel';
import {
  BACKGROUND_PANEL_LABELS,
  BACKGROUND_PANEL_TITLE,
  BACKGROUND_PANEL_TOOLTIP,
  formatBackgroundPercentValue,
} from './backgroundPanelViewModel';

const styles = controlPanelStyles;

export interface BackgroundPanelProps {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  backgroundColor: string;
  hsl: HslColor;
  onToggleBackground: () => void;
  onColorPickerChange: (hex: string) => void;
  onHueChange: (hue: number) => void;
  onSaturationChange: (saturation: number) => void;
  onLightnessChange: (lightness: number) => void;
}

export function BackgroundPanel({
  activePanel,
  setActivePanel,
  backgroundColor,
  hsl,
  onToggleBackground,
  onColorPickerChange,
  onHueChange,
  onSaturationChange,
  onLightnessChange,
}: BackgroundPanelProps) {
  return (
    <ControlButton
      panelId="bg"
      activePanel={activePanel}
      setActivePanel={setActivePanel}
      icon={<BgIcon className="w-6 h-6" />}
      tooltip={BACKGROUND_PANEL_TOOLTIP}
      onClick={onToggleBackground}
      panelTitle={BACKGROUND_PANEL_TITLE}
    >
      <div className={styles.panelContent}>
        <ColorPickerRow
          label={BACKGROUND_PANEL_LABELS.color}
          value={backgroundColor}
          onChange={onColorPickerChange}
        />
        <HueSliderRow
          label={BACKGROUND_PANEL_LABELS.hue}
          value={hsl.h}
          onChange={onHueChange}
        />
        <SliderRow
          label={BACKGROUND_PANEL_LABELS.saturation}
          value={hsl.s}
          min={0}
          max={100}
          step={1}
          onChange={onSaturationChange}
          formatValue={formatBackgroundPercentValue}
        />
        <SliderRow
          label={BACKGROUND_PANEL_LABELS.lightness}
          value={hsl.l}
          min={0}
          max={100}
          step={1}
          onChange={onLightnessChange}
          formatValue={formatBackgroundPercentValue}
        />
      </div>
    </ControlButton>
  );
}
