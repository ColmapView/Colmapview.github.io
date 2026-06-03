import { getNextMaskMode, type MaskMode } from './imageDetailMaskViewModel';

type ScrollHintTargetLabel = 'images' | 'matched images';

interface ImageDetailFrameHintStateOptions {
  showMatchesInModal: boolean;
  connectedImageCount: number;
  hasMask: boolean;
  maskSrc: string | null;
  maskMode: MaskMode;
}

interface MaskCycleHintState {
  currentMode: MaskMode;
  nextMode: MaskMode;
}

interface ImageDetailFrameHintState {
  scrollTargetLabel: ScrollHintTargetLabel;
  maskCycleHint: MaskCycleHintState | null;
}

export function getImageDetailFrameHintState({
  showMatchesInModal,
  connectedImageCount,
  hasMask,
  maskSrc,
  maskMode,
}: ImageDetailFrameHintStateOptions): ImageDetailFrameHintState {
  const hasConnectedMatches = showMatchesInModal && connectedImageCount > 0;
  const canCycleMask = hasMask && Boolean(maskSrc) && !showMatchesInModal;

  return {
    scrollTargetLabel: hasConnectedMatches ? 'matched images' : 'images',
    maskCycleHint: canCycleMask
      ? {
          currentMode: maskMode,
          nextMode: getNextMaskMode(maskMode),
        }
      : null,
  };
}
