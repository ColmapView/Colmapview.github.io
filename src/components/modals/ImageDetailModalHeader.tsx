import type { PointerEvent } from 'react';
import type { Camera, Image, ImageId } from '../../types/colmap';
import { CameraPoseInfoDisplay } from './ImageDetailMedia';
import {
  getCameraDeletionTitle,
  getDeleteScopeButtonClassName,
  getDesktopImageDetailTitle,
  getDesktopHeaderCloseButtonState,
  getDesktopHeaderDragStyle,
  getFrameDeletionTitle,
  getImageDetailHeaderTitleClassName,
  getImageDeletionTitle,
  getTouchHeaderCloseButtonState,
  getTouchImageDetailTitle,
} from './imageDetailModalHeaderViewModel';

interface DeleteScopeButtonProps {
  scopeLabel: 'I' | 'C' | 'F';
  title: string;
  isMarked: boolean;
  onClick: () => void;
}

function DeleteScopeButton({ scopeLabel, title, isMarked, onClick }: DeleteScopeButtonProps) {
  return (
    <button
      onClick={onClick}
      onPointerDown={(event) => event.stopPropagation()}
      className={getDeleteScopeButtonClassName(isMarked)}
      title={title}
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
        <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        <text x="12" y="18" textAnchor="middle" fontSize="11" fill="currentColor" stroke="none" fontWeight="bold">{scopeLabel}</text>
      </svg>
    </button>
  );
}

interface TouchImageDetailHeaderProps {
  camera: Camera;
  closeImageDetail: () => void;
  image: Image;
  isMarkedForDeletion: boolean;
  isMatchViewMode: boolean;
  matchedImage: Image | null;
}

export function TouchImageDetailHeader({
  camera,
  closeImageDetail,
  image,
  isMarkedForDeletion,
  isMatchViewMode,
  matchedImage,
}: TouchImageDetailHeaderProps) {
  const closeButtonState = getTouchHeaderCloseButtonState();

  return (
    <div className="flex flex-col bg-ds-secondary flex-shrink-0">
      <div className="flex items-center justify-between px-3 h-11">
        <span
          className={getImageDetailHeaderTitleClassName({
            variant: 'touch',
            isMarkedForDeletion,
          })}
        >
          {getTouchImageDetailTitle({
            imageName: image.name,
            matchedImageName: matchedImage?.name,
            isMatchViewMode,
          })}
        </span>
        <button
          onClick={closeImageDetail}
          className={closeButtonState.className}
          style={closeButtonState.style}
          title={closeButtonState.title}
        >
          ×
        </button>
      </div>
      {!isMatchViewMode && (
        <div className="px-3 pb-1.5 overflow-x-auto">
          <CameraPoseInfoDisplay camera={camera} qvec={image.qvec} tvec={image.tvec} />
        </div>
      )}
    </div>
  );
}

interface DesktopImageDetailHeaderProps {
  cameraAllMarked: boolean;
  closeImageDetail: () => void;
  currentMatchCount: number;
  frameAllMarked: boolean;
  frameImageIds: ImageId[];
  handleDeleteToggle: () => void;
  handleDragStart: (event: PointerEvent<HTMLElement>) => void;
  handleToggleCamera: () => void;
  handleToggleFrame: () => void;
  image: Image;
  imageDetailId: ImageId;
  isMarkedForDeletion: boolean;
  isMatchViewMode: boolean;
  matchedImage: Image | null;
  multiCamera: boolean;
}

export function DesktopImageDetailHeader({
  cameraAllMarked,
  closeImageDetail,
  currentMatchCount,
  frameAllMarked,
  frameImageIds,
  handleDeleteToggle,
  handleDragStart,
  handleToggleCamera,
  handleToggleFrame,
  image,
  imageDetailId,
  isMarkedForDeletion,
  isMatchViewMode,
  matchedImage,
  multiCamera,
}: DesktopImageDetailHeaderProps) {
  const closeButtonState = getDesktopHeaderCloseButtonState();

  return (
    <div
      className="flex items-center justify-between px-4 py-2 rounded-t-lg bg-ds-secondary text-xs cursor-move select-none"
      onPointerDown={handleDragStart}
      style={getDesktopHeaderDragStyle()}
    >
      <span
        className={getImageDetailHeaderTitleClassName({
          variant: 'desktop',
          isMarkedForDeletion,
        })}
      >
        {getDesktopImageDetailTitle({
          imageName: image.name,
          matchedImageName: matchedImage?.name,
          isMatchViewMode,
          imageDetailId,
          currentMatchCount,
        })}
      </span>
      <div className="flex items-center gap-1">
        <DeleteScopeButton
          scopeLabel="I"
          isMarked={isMarkedForDeletion}
          onClick={handleDeleteToggle}
          title={getImageDeletionTitle(isMarkedForDeletion)}
        />
        {multiCamera && (
          <DeleteScopeButton
            scopeLabel="C"
            isMarked={cameraAllMarked}
            onClick={handleToggleCamera}
            title={getCameraDeletionTitle(cameraAllMarked, image.cameraId)}
          />
        )}
        {frameImageIds.length > 0 && (
          <DeleteScopeButton
            scopeLabel="F"
            isMarked={frameAllMarked}
            onClick={handleToggleFrame}
            title={getFrameDeletionTitle(frameAllMarked)}
          />
        )}
        <button
          onClick={closeImageDetail}
          onPointerDown={(event) => event.stopPropagation()}
          className={closeButtonState.className}
          title={closeButtonState.title}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
