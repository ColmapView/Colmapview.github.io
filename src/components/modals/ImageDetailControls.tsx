import type { KeyboardEvent, RefObject, WheelEvent } from 'react';
import type { ImageId } from '../../types/colmap';
import { ImageDetailMatchSelect } from './ImageDetailMatchSelect';
import { ImageDetailMatchOpacityControl } from './ImageDetailMatchOpacityControl';
import { ImageDetailMatchesToggleButton } from './ImageDetailMatchesToggleButton';
import { ImageDetailNavigationControls } from './ImageDetailNavigationControls';
import { ImageDetailPointToggleButton } from './ImageDetailPointToggleButton';
import type { ConnectedImageOption } from './imageDetailViewModel';
import {
  getImageDetailControlVisibilityState,
  getImageDetailPointToggleDescriptors,
  type ImageDetailPointToggleKey,
} from './imageDetailControlsViewModel';

interface SharedControlProps {
  isMarkedForDeletion: boolean;
  showPoints2D: boolean;
  showPoints3D: boolean;
  showMatchesInModal: boolean;
  matchedImageId: ImageId | null;
  connectedImages: ConnectedImageOption[];
  numPoints2D: number;
  numPoints3D: number;
  matchLineOpacity: number;
  setShowPoints2D: (show: boolean) => void;
  setShowPoints3D: (show: boolean) => void;
  setShowMatchesInModal: (show: boolean) => void;
  setMatchedImageId: (imageId: ImageId | null) => void;
  setMatchLineOpacity: (opacity: number) => void;
}

interface TouchImageControlsProps extends SharedControlProps {
  hasPrev: boolean;
  hasNext: boolean;
  currentIndex: number;
  imageCount: number;
  onPrev: () => void;
  onNext: () => void;
}

export function TouchImageControls({
  isMarkedForDeletion,
  showPoints2D,
  showPoints3D,
  showMatchesInModal,
  matchedImageId,
  connectedImages,
  numPoints2D,
  numPoints3D,
  matchLineOpacity,
  hasPrev,
  hasNext,
  currentIndex,
  imageCount,
  setShowPoints2D,
  setShowPoints3D,
  setShowMatchesInModal,
  setMatchedImageId,
  setMatchLineOpacity,
  onPrev,
  onNext,
}: TouchImageControlsProps) {
  const visibility = getImageDetailControlVisibilityState({
    variant: 'touch',
    showMatchesInModal,
    isMarkedForDeletion,
    matchedImageId,
  });
  const pointToggleDescriptors = getImageDetailPointToggleDescriptors('touch');

  return (
    <div className="flex-shrink-0 bg-ds-tertiary">
      <div className="flex gap-1.5 px-2 py-1.5 overflow-x-auto">
        {visibility.showPointToggles && (
          <>
            {pointToggleDescriptors.map((descriptor) => (
              <ImageDetailPointToggleButton
                key={descriptor.key}
                variant="touch"
                label={descriptor.label}
                count={getPointToggleCount(descriptor.key, numPoints2D, numPoints3D)}
                inactiveCountClass={descriptor.inactiveCountClass}
                active={getPointToggleActive(descriptor.key, showPoints2D, showPoints3D)}
                isMarkedForDeletion={isMarkedForDeletion}
                onToggle={getPointToggleSetter(descriptor.key, setShowPoints2D, setShowPoints3D)}
              />
            ))}
          </>
        )}
        <ImageDetailMatchesToggleButton
          variant="touch"
          active={showMatchesInModal}
          isMarkedForDeletion={isMarkedForDeletion}
          onToggle={setShowMatchesInModal}
        />
        {visibility.showMatchSelector && (
          <ImageDetailMatchSelect
            variant="touch"
            matchedImageId={matchedImageId}
            connectedImages={connectedImages}
            setMatchedImageId={setMatchedImageId}
          />
        )}
      </div>

      {visibility.showMatchOpacity && (
        <ImageDetailMatchOpacityControl
          variant="touch"
          matchLineOpacity={matchLineOpacity}
          setMatchLineOpacity={setMatchLineOpacity}
        />
      )}

      {visibility.showNavigation && (
        <ImageDetailNavigationControls
          variant="touch"
          hasPrev={hasPrev}
          hasNext={hasNext}
          currentIndex={currentIndex}
          imageCount={imageCount}
          onPrev={onPrev}
          onNext={onNext}
        />
      )}
    </div>
  );
}

interface DesktopImageControlsProps extends SharedControlProps {
  hasPrev: boolean;
  hasNext: boolean;
  imageDetailId: ImageId | null;
  imageCount: number;
  isEditingOpacity: boolean;
  opacityInputRef: RefObject<HTMLInputElement | null>;
  opacityInputValue: string;
  setOpacityInputValue: (value: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onMatchedImageWheel: (event: WheelEvent<HTMLSelectElement>) => void;
  onOpacityWheel: (event: WheelEvent<HTMLDivElement>) => void;
  onOpacityDoubleClick: () => void;
  onOpacityBlur: () => void;
  onOpacityKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onOpenImageId: (imageId: ImageId) => void;
  imageExists: (imageId: ImageId) => boolean;
}

export function DesktopImageControls({
  isMarkedForDeletion,
  showPoints2D,
  showPoints3D,
  showMatchesInModal,
  matchedImageId,
  connectedImages,
  numPoints2D,
  numPoints3D,
  matchLineOpacity,
  hasPrev,
  hasNext,
  imageDetailId,
  imageCount,
  isEditingOpacity,
  opacityInputRef,
  opacityInputValue,
  setOpacityInputValue,
  setShowPoints2D,
  setShowPoints3D,
  setShowMatchesInModal,
  setMatchedImageId,
  setMatchLineOpacity,
  onPrev,
  onNext,
  onMatchedImageWheel,
  onOpacityWheel,
  onOpacityDoubleClick,
  onOpacityBlur,
  onOpacityKeyDown,
  onOpenImageId,
  imageExists,
}: DesktopImageControlsProps) {
  const visibility = getImageDetailControlVisibilityState({
    variant: 'desktop',
    showMatchesInModal,
    isMarkedForDeletion,
    matchedImageId,
  });
  const pointToggleDescriptors = getImageDetailPointToggleDescriptors('desktop');

  return (
    <div className="mt-2 flex items-center justify-between text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        {visibility.showPointToggles && (
          <>
            {pointToggleDescriptors.map((descriptor) => (
              <ImageDetailPointToggleButton
                key={descriptor.key}
                variant="desktop"
                label={descriptor.label}
                count={getPointToggleCount(descriptor.key, numPoints2D, numPoints3D)}
                inactiveCountClass={descriptor.inactiveCountClass}
                active={getPointToggleActive(descriptor.key, showPoints2D, showPoints3D)}
                isMarkedForDeletion={isMarkedForDeletion}
                onToggle={getPointToggleSetter(descriptor.key, setShowPoints2D, setShowPoints3D)}
              />
            ))}
          </>
        )}

        <ImageDetailMatchesToggleButton
          variant="desktop"
          active={showMatchesInModal}
          isMarkedForDeletion={isMarkedForDeletion}
          onToggle={setShowMatchesInModal}
        />

        {visibility.showMatchSelector && (
          <ImageDetailMatchSelect
            variant="desktop"
            matchedImageId={matchedImageId}
            connectedImages={connectedImages}
            setMatchedImageId={setMatchedImageId}
            onWheel={onMatchedImageWheel}
          />
        )}

        {visibility.showMatchOpacity && (
          <ImageDetailMatchOpacityControl
            variant="desktop"
            matchLineOpacity={matchLineOpacity}
            setMatchLineOpacity={setMatchLineOpacity}
            isEditingOpacity={isEditingOpacity}
            opacityInputRef={opacityInputRef}
            opacityInputValue={opacityInputValue}
            setOpacityInputValue={setOpacityInputValue}
            onOpacityWheel={onOpacityWheel}
            onOpacityDoubleClick={onOpacityDoubleClick}
            onOpacityBlur={onOpacityBlur}
            onOpacityKeyDown={onOpacityKeyDown}
          />
        )}
      </div>

      {visibility.showNavigation && (
        <ImageDetailNavigationControls
          variant="desktop"
          hasPrev={hasPrev}
          hasNext={hasNext}
          imageDetailId={imageDetailId}
          imageCount={imageCount}
          onPrev={onPrev}
          onNext={onNext}
          onOpenImageId={onOpenImageId}
          imageExists={imageExists}
        />
      )}
    </div>
  );
}

function getPointToggleCount(key: ImageDetailPointToggleKey, points2DCount: number, points3DCount: number): number {
  return key === 'points2D' ? points2DCount : points3DCount;
}

function getPointToggleActive(key: ImageDetailPointToggleKey, showPoints2D: boolean, showPoints3D: boolean): boolean {
  return key === 'points2D' ? showPoints2D : showPoints3D;
}

function getPointToggleSetter(
  key: ImageDetailPointToggleKey,
  setShowPoints2D: (show: boolean) => void,
  setShowPoints3D: (show: boolean) => void
): (show: boolean) => void {
  return key === 'points2D' ? setShowPoints2D : setShowPoints3D;
}
