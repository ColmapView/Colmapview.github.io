import type { MatchesDisplayMode } from '../../../store/types';

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface MatchesPanelHint {
  title: string;
  lines: string[];
}

export const MATCHES_DISPLAY_MODE_OPTIONS: SelectOption<MatchesDisplayMode>[] = [
  { value: 'static', label: 'Static' },
  { value: 'blink', label: 'Blink' },
];

const MATCHES_OFF_HINT: MatchesPanelHint = {
  title: 'Off:',
  lines: ['Match lines hidden.'],
};

const MATCHES_DISPLAY_MODE_HINTS: Record<MatchesDisplayMode, MatchesPanelHint> = {
  static: {
    title: 'Static:',
    lines: ['Show match lines between', 'selected camera and points.'],
  },
  blink: {
    title: 'Blink:',
    lines: ['Match lines animate with', 'blinking effect.'],
  },
};

export function getSupportedMatchesDisplayMode(value: string): MatchesDisplayMode | null {
  if (value === 'static' || value === 'blink') return value;
  return null;
}

export function getMatchesPanelHint(
  showMatches: boolean,
  matchesDisplayMode: MatchesDisplayMode | string
): MatchesPanelHint {
  if (!showMatches) return MATCHES_OFF_HINT;

  const supportedMode = getSupportedMatchesDisplayMode(matchesDisplayMode);
  return MATCHES_DISPLAY_MODE_HINTS[supportedMode ?? 'static'];
}
