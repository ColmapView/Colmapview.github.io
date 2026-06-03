import type { ImageId } from '../../types/colmap';

export type MaskMode = 'hover' | 'mask' | 'image' | 'split';

export interface MaskViewState {
  imageDetailId: ImageId | null;
  mode: MaskMode;
  splitX: number;
}

const DEFAULT_MASK_SPLIT_X = 0.5;
const MASK_MODES: MaskMode[] = ['hover', 'mask', 'split', 'image'];

export function getNextMaskMode(mode: MaskMode): MaskMode {
  const currentIndex = MASK_MODES.indexOf(mode);

  return MASK_MODES[(currentIndex + 1) % MASK_MODES.length];
}

export function getActiveMaskViewState(
  state: MaskViewState,
  imageDetailId: ImageId | null
): Pick<MaskViewState, 'mode' | 'splitX'> {
  if (state.imageDetailId !== imageDetailId) {
    return { mode: 'hover', splitX: DEFAULT_MASK_SPLIT_X };
  }

  return { mode: state.mode, splitX: state.splitX };
}

export function getNextMaskViewState(
  state: MaskViewState,
  imageDetailId: ImageId | null
): MaskViewState {
  const { mode, splitX } = getActiveMaskViewState(state, imageDetailId);

  return {
    imageDetailId,
    mode: getNextMaskMode(mode),
    splitX,
  };
}

export function getMaskSplitViewState(
  state: MaskViewState,
  imageDetailId: ImageId | null,
  splitX: number
): MaskViewState {
  return {
    imageDetailId,
    mode: state.imageDetailId === imageDetailId ? state.mode : 'hover',
    splitX: Math.max(0, Math.min(1, splitX)),
  };
}

export function getResetMaskViewState(
  state: MaskViewState,
  imageDetailId: ImageId | null
): MaskViewState {
  return {
    imageDetailId,
    mode: 'hover',
    splitX: state.imageDetailId === imageDetailId ? state.splitX : DEFAULT_MASK_SPLIT_X,
  };
}
