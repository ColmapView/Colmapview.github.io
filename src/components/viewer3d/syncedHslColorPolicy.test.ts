import { describe, expect, it } from 'vitest';
import {
  createSyncedHslColorState,
  getHexForHslColor,
  getLocallyEditedHslColorState,
  getSourceSyncedHslColorState,
  syncedHslColorReducer,
} from './syncedHslColorPolicy';

describe('syncedHslColorPolicy', () => {
  it('creates HSL state from the source hex color', () => {
    expect(createSyncedHslColorState('#ff0000')).toEqual({
      sourceHexColor: '#ff0000',
      hsl: { h: 0, s: 100, l: 50 },
    });
  });

  it('syncs only when the source hex changes', () => {
    const state = createSyncedHslColorState('#ffffff');

    expect(getSourceSyncedHslColorState(state, '#ffffff')).toBe(state);
    expect(getSourceSyncedHslColorState(state, '#0000ff')).toEqual({
      sourceHexColor: '#0000ff',
      hsl: { h: 240, s: 100, l: 50 },
    });
  });

  it('preserves the last source hex across local HSL edits', () => {
    const state = createSyncedHslColorState('#000000');
    const edited = getLocallyEditedHslColorState(state, { h: 0, s: 0, l: 100 });

    expect(edited).toEqual({
      sourceHexColor: '#000000',
      hsl: { h: 0, s: 0, l: 100 },
    });
    expect(getSourceSyncedHslColorState(edited, '#000000')).toBe(edited);
  });

  it('reduces source sync and local edit actions', () => {
    const state = createSyncedHslColorState('#000000');
    const edited = syncedHslColorReducer(state, {
      type: 'set-local',
      hsl: { h: 120, s: 100, l: 50 },
    });

    expect(getHexForHslColor(edited.hsl)).toBe('#00ff00');
    expect(syncedHslColorReducer(edited, {
      type: 'sync-source',
      hexColor: '#00ff00',
    })).toEqual({
      sourceHexColor: '#00ff00',
      hsl: { h: 120, s: 100, l: 50 },
    });
  });
});
