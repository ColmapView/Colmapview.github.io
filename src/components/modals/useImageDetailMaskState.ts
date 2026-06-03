import { useCallback, useMemo, useState, type MouseEvent } from 'react';
import type { ImageId } from '../../types/colmap';
import {
  getActiveMaskViewState,
  getMaskSplitViewState,
  getNextMaskViewState,
  getResetMaskViewState,
  type MaskViewState,
} from './imageDetailMaskViewModel';

const INITIAL_MASK_STATE: MaskViewState = {
  imageDetailId: null,
  mode: 'hover',
  splitX: 0.5,
};

export function useImageDetailMaskState(imageDetailId: ImageId | null) {
  const [maskState, setMaskState] = useState<MaskViewState>(INITIAL_MASK_STATE);

  const { mode: maskMode, splitX } = useMemo(
    () => getActiveMaskViewState(maskState, imageDetailId),
    [imageDetailId, maskState]
  );

  const cycleMaskMode = useCallback(() => {
    setMaskState((previous) => getNextMaskViewState(previous, imageDetailId));
  }, [imageDetailId]);

  const handleMaskMouseMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMaskState((previous) => getMaskSplitViewState(
      previous,
      imageDetailId,
      (event.clientX - rect.left) / rect.width
    ));
  }, [imageDetailId]);

  const handleMaskMouseLeave = useCallback(() => {
    setMaskState((previous) => getResetMaskViewState(previous, imageDetailId));
  }, [imageDetailId]);

  return {
    cycleMaskMode,
    handleMaskMouseLeave,
    handleMaskMouseMove,
    maskMode,
    splitX,
  };
}
