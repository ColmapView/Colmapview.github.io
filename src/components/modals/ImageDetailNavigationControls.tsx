import type { ImageId } from '../../types/colmap';
import { ImageDetailImageJumpInput } from './ImageDetailImageJumpInput';
import { getImageDetailNavigationControlsState } from './imageDetailNavigationViewModel';

interface SharedNavigationControlProps {
  hasPrev: boolean;
  hasNext: boolean;
  imageCount: number;
  onPrev: () => void;
  onNext: () => void;
}

interface TouchNavigationControlProps extends SharedNavigationControlProps {
  variant: 'touch';
  currentIndex: number;
}

interface DesktopNavigationControlProps extends SharedNavigationControlProps {
  variant: 'desktop';
  imageDetailId: ImageId | null;
  onOpenImageId: (imageId: ImageId) => void;
  imageExists: (imageId: ImageId) => boolean;
}

type ImageDetailNavigationControlsProps =
  | TouchNavigationControlProps
  | DesktopNavigationControlProps;

export function ImageDetailNavigationControls(props: ImageDetailNavigationControlsProps) {
  if (props.variant === 'touch') {
    const navigationState = getImageDetailNavigationControlsState({
      variant: 'touch',
      hasPrev: props.hasPrev,
      hasNext: props.hasNext,
      currentIndex: props.currentIndex,
      imageCount: props.imageCount,
    });

    return (
      <div className={navigationState.containerClassName}>
        <button
          onClick={props.onPrev}
          disabled={navigationState.previousButton.disabled}
          className={navigationState.previousButton.className}
          style={navigationState.buttonStyle}
        >
          {navigationState.previousButton.label}
        </button>
        <span className={navigationState.labelClassName ?? undefined}>
          {navigationState.label}
        </span>
        <button
          onClick={props.onNext}
          disabled={navigationState.nextButton.disabled}
          className={navigationState.nextButton.className}
          style={navigationState.buttonStyle}
        >
          {navigationState.nextButton.label}
        </button>
      </div>
    );
  }

  const navigationState = getImageDetailNavigationControlsState({
    variant: 'desktop',
    hasPrev: props.hasPrev,
    hasNext: props.hasNext,
  });

  return (
    <div className={navigationState.containerClassName}>
      <button
        onClick={props.onPrev}
        disabled={navigationState.previousButton.disabled}
        className={navigationState.previousButton.className}
      >
        {navigationState.previousButton.label}
      </button>
      {navigationState.showJumpInput && (
        <ImageDetailImageJumpInput
          imageDetailId={props.imageDetailId}
          imageCount={props.imageCount}
          onOpenImageId={props.onOpenImageId}
          imageExists={props.imageExists}
        />
      )}
      <button
        onClick={props.onNext}
        disabled={navigationState.nextButton.disabled}
        className={navigationState.nextButton.className}
      >
        {navigationState.nextButton.label}
      </button>
    </div>
  );
}
