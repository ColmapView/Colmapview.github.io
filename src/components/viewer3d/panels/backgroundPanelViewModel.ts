export const BACKGROUND_PANEL_TOOLTIP = 'Background color (B)';
export const BACKGROUND_PANEL_TITLE = 'Background Color (B)';

export const BACKGROUND_PANEL_LABELS = {
  color: 'Color',
  hue: 'Hue',
  saturation: 'Saturation',
  lightness: 'Lightness',
} as const;

export function formatBackgroundPercentValue(value: number): string {
  return `${Math.round(value)}%`;
}
