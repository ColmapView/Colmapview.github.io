import type { SelectionColorMode } from '../../../store/types';

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectionHighlightHint {
  title: string;
  lines: [string, string];
}

export const SELECTION_COLOR_MODE_OPTIONS: SelectOption<SelectionColorMode>[] = [
  { value: 'static', label: 'Static' },
  { value: 'blink', label: 'Blink' },
  { value: 'rainbow', label: 'Rainbow' },
];

const SELECTION_HIGHLIGHT_HINTS: Record<SelectionColorMode, SelectionHighlightHint> = {
  static: {
    title: 'Static:',
    lines: ['Solid color highlight', 'for selected camera.'],
  },
  blink: {
    title: 'Blink:',
    lines: ['Selected camera pulses', 'to draw attention.'],
  },
  rainbow: {
    title: 'Rainbow:',
    lines: ['Selected camera cycles', 'through all colors.'],
  },
};

export function getSupportedSelectionColorMode(value: string): SelectionColorMode | null {
  if (value === 'static' || value === 'blink' || value === 'rainbow') return value;
  return null;
}

export function shouldShowSelectionColorControl(selectionColorMode: SelectionColorMode | string): boolean {
  const supportedMode = getSupportedSelectionColorMode(selectionColorMode);
  return supportedMode === 'static' || supportedMode === 'blink';
}

export function shouldShowSelectionSpeedControl(selectionColorMode: SelectionColorMode | string): boolean {
  const supportedMode = getSupportedSelectionColorMode(selectionColorMode);
  return supportedMode === 'blink' || supportedMode === 'rainbow';
}

export function getSelectionHighlightHint(
  selectionColorMode: SelectionColorMode | string
): SelectionHighlightHint {
  return SELECTION_HIGHLIGHT_HINTS[getSupportedSelectionColorMode(selectionColorMode) ?? 'rainbow'];
}
