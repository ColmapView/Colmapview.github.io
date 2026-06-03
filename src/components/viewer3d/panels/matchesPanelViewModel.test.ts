import { describe, expect, it } from 'vitest';
import {
  MATCHES_DISPLAY_MODE_OPTIONS,
  getMatchesPanelHint,
  getSupportedMatchesDisplayMode,
} from './matchesPanelViewModel';

describe('matches panel view-model helpers', () => {
  it('defines stable matches display mode labels', () => {
    expect(MATCHES_DISPLAY_MODE_OPTIONS).toEqual([
      { value: 'static', label: 'Static' },
      { value: 'blink', label: 'Blink' },
    ]);
  });

  it('returns the hidden hint when matches are off', () => {
    expect(getMatchesPanelHint(false, 'static')).toEqual({
      title: 'Off:',
      lines: ['Match lines hidden.'],
    });
    expect(getMatchesPanelHint(false, 'blink')).toEqual({
      title: 'Off:',
      lines: ['Match lines hidden.'],
    });
  });

  it('returns the static matches hint when matches are visible and static', () => {
    expect(getMatchesPanelHint(true, 'static')).toEqual({
      title: 'Static:',
      lines: ['Show match lines between', 'selected camera and points.'],
    });
  });

  it('returns the blink matches hint when matches are visible and blinking', () => {
    expect(getMatchesPanelHint(true, 'blink')).toEqual({
      title: 'Blink:',
      lines: ['Match lines animate with', 'blinking effect.'],
    });
  });

  it('falls back to the static hint for stale persisted display modes', () => {
    expect(getSupportedMatchesDisplayMode('off')).toBeNull();
    expect(getMatchesPanelHint(true, 'off')).toEqual({
      title: 'Static:',
      lines: ['Show match lines between', 'selected camera and points.'],
    });
  });
});
