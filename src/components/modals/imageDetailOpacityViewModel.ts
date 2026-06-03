import { parseFiniteNumberString } from '../../utils/numberParsing';

export interface OpacityInputApplyResult {
  opacity: number;
  applied: boolean;
}

export type OpacityInputKeyAction = 'apply' | 'cancel' | 'none';

export function getOpacityInputValue(opacity: number): string {
  return String(Math.round(opacity * 100));
}

export function applyOpacityInputValue(inputValue: string, currentOpacity: number): OpacityInputApplyResult {
  const parsed = parseFiniteNumberString(inputValue);
  if (parsed === null) {
    return { opacity: currentOpacity, applied: false };
  }

  return {
    opacity: Math.min(100, Math.max(0, parsed)) / 100,
    applied: true,
  };
}

export function getWheelAdjustedOpacity(opacity: number, deltaY: number, step = 0.05): number {
  const delta = deltaY > 0 ? -step : step;
  return Math.min(1, Math.max(0, opacity + delta));
}

export function getOpacityInputKeyAction(key: string): OpacityInputKeyAction {
  if (key === 'Enter') return 'apply';
  if (key === 'Escape') return 'cancel';
  return 'none';
}
