import type { CSSProperties } from 'react';
import { TOUCH, modalStyles } from '../../theme';
import type { ImageId } from '../../types/colmap';

interface TouchImageDetailTitleOptions {
  imageName: string;
  matchedImageName: string | undefined;
  isMatchViewMode: boolean;
}

interface DesktopImageDetailTitleOptions extends TouchImageDetailTitleOptions {
  imageDetailId: ImageId;
  currentMatchCount: number;
}

export type ImageDetailHeaderVariant = 'touch' | 'desktop';

interface ImageDetailHeaderTitleStateOptions {
  variant: ImageDetailHeaderVariant;
  isMarkedForDeletion: boolean;
}

interface HeaderButtonRenderState {
  className: string;
  style?: CSSProperties;
  title?: string;
}

const TOUCH_TITLE_CLASS = 'text-ds-primary text-sm truncate flex-1 mr-2';
const DESKTOP_TITLE_CLASS = 'text-ds-primary';
const MARKED_TITLE_CLASS = 'line-through text-ds-error';
const TOUCH_CLOSE_BUTTON_CLASS =
  'w-10 h-10 flex items-center justify-center text-ds-muted hover:text-ds-primary text-2xl';

export function getTouchImageDetailTitle({
  imageName,
  matchedImageName,
  isMatchViewMode,
}: TouchImageDetailTitleOptions): string {
  return isMatchViewMode ? `${imageName} ↔ ${matchedImageName}` : imageName;
}

export function getDesktopImageDetailTitle({
  imageName,
  matchedImageName,
  isMatchViewMode,
  imageDetailId,
  currentMatchCount,
}: DesktopImageDetailTitleOptions): string {
  return isMatchViewMode
    ? `Image Matches: ${imageName} ↔ ${matchedImageName} (${currentMatchCount} matches)`
    : `Image #${imageDetailId}: ${imageName}`;
}

export function getImageDeletionTitle(isMarkedForDeletion: boolean): string {
  return isMarkedForDeletion ? 'Restore image' : 'Delete image from model';
}

export function getCameraDeletionTitle(cameraAllMarked: boolean, cameraId: number): string {
  return cameraAllMarked ? `Restore camera ${cameraId}` : `Delete camera ${cameraId}`;
}

export function getFrameDeletionTitle(frameAllMarked: boolean): string {
  return frameAllMarked ? 'Restore frame' : 'Delete frame';
}

export function getImageDetailHeaderTitleClassName({
  variant,
  isMarkedForDeletion,
}: ImageDetailHeaderTitleStateOptions): string {
  const baseClassName = variant === 'touch' ? TOUCH_TITLE_CLASS : DESKTOP_TITLE_CLASS;
  return isMarkedForDeletion ? `${baseClassName} ${MARKED_TITLE_CLASS}` : baseClassName;
}

export function getDeleteScopeButtonClassName(isMarked: boolean): string {
  const statusClassName = isMarked
    ? 'text-ds-success hover:bg-ds-success/20'
    : 'text-ds-muted hover:text-ds-error hover:bg-ds-error/20';

  return `${modalStyles.headerIconButton} ${statusClassName}`;
}

export function getTouchHeaderCloseButtonState(): HeaderButtonRenderState {
  return {
    className: TOUCH_CLOSE_BUTTON_CLASS,
    style: { minWidth: TOUCH.minTapTarget, minHeight: TOUCH.minTapTarget },
    title: 'Close',
  };
}

export function getDesktopHeaderCloseButtonState(): HeaderButtonRenderState {
  return {
    className: modalStyles.toolHeaderClose,
    title: 'Close',
  };
}

export function getDesktopHeaderDragStyle(): CSSProperties {
  return { touchAction: 'none' };
}
