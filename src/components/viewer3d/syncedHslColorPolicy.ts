import { hexToHsl, hslToHex } from '../../utils/colorUtils';
import { syncHslWithHex, type HslColor } from './viewerControlsViewModel';

export interface SyncedHslColorState {
  sourceHexColor: string;
  hsl: HslColor;
}

export type SyncedHslColorAction =
  | { type: 'sync-source'; hexColor: string }
  | { type: 'set-local'; hsl: HslColor };

export function createSyncedHslColorState(hexColor: string): SyncedHslColorState {
  return {
    sourceHexColor: hexColor,
    hsl: hexToHsl(hexColor),
  };
}

export function getSourceSyncedHslColorState(
  state: SyncedHslColorState,
  hexColor: string
): SyncedHslColorState {
  if (state.sourceHexColor === hexColor) {
    return state;
  }

  return {
    sourceHexColor: hexColor,
    hsl: syncHslWithHex(state.hsl, hexColor),
  };
}

export function getLocallyEditedHslColorState(
  state: SyncedHslColorState,
  hsl: HslColor
): SyncedHslColorState {
  return {
    ...state,
    hsl,
  };
}

export function syncedHslColorReducer(
  state: SyncedHslColorState,
  action: SyncedHslColorAction
): SyncedHslColorState {
  if (action.type === 'sync-source') {
    return getSourceSyncedHslColorState(state, action.hexColor);
  }

  return getLocallyEditedHslColorState(state, action.hsl);
}

export function getHexForHslColor(hsl: HslColor): string {
  return hslToHex(hsl.h, hsl.s, hsl.l);
}
