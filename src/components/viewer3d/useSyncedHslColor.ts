import { useCallback, useReducer } from 'react';
import { hexToHsl } from '../../utils/colorUtils';
import type { HslColor } from './viewerControlsViewModel';
import {
  createSyncedHslColorState,
  getHexForHslColor,
  getSourceSyncedHslColorState,
  syncedHslColorReducer,
} from './syncedHslColorPolicy';

export interface SyncedHslColorControls {
  hsl: HslColor;
  setHslColor: (value: HslColor) => void;
  handleColorPickerChange: (hex: string) => void;
  handleHueChange: (h: number) => void;
  handleSaturationChange: (s: number) => void;
  handleLightnessChange: (l: number) => void;
}

export function useSyncedHslColor(
  hexColor: string,
  setHexColor: (hex: string) => void
): SyncedHslColorControls {
  const [state, dispatch] = useReducer(
    syncedHslColorReducer,
    hexColor,
    createSyncedHslColorState
  );
  let syncedState = state;

  if (state.sourceHexColor !== hexColor) {
    syncedState = getSourceSyncedHslColorState(state, hexColor);
    dispatch({ type: 'sync-source', hexColor });
  }

  const hsl = syncedState.hsl;

  const setHslColor = useCallback((value: HslColor) => {
    dispatch({ type: 'set-local', hsl: value });
    setHexColor(getHexForHslColor(value));
  }, [setHexColor]);

  const handleColorPickerChange = useCallback((hex: string) => {
    setHslColor(hexToHsl(hex));
  }, [setHslColor]);

  const handleHueChange = useCallback((h: number) => {
    setHslColor({ ...hsl, h });
  }, [hsl, setHslColor]);

  const handleSaturationChange = useCallback((s: number) => {
    setHslColor({ ...hsl, s });
  }, [hsl, setHslColor]);

  const handleLightnessChange = useCallback((l: number) => {
    setHslColor({ ...hsl, l });
  }, [hsl, setHslColor]);

  return {
    hsl,
    setHslColor,
    handleColorPickerChange,
    handleHueChange,
    handleSaturationChange,
    handleLightnessChange,
  };
}
