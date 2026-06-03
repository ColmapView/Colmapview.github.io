import type { CSSProperties } from 'react';
import type { ImageId } from '../../types/colmap';
import { TOUCH, buttonStyles } from '../../theme';
import type { Position2D } from './imageDetailLayoutViewModel';

export interface TouchGestureStart extends Position2D {
  time: number;
}

export interface TouchGestureOptions {
  tapDistanceThreshold?: number;
  tapDurationThresholdMs?: number;
  swipeDistanceThreshold?: number;
  swipeAxisRatio?: number;
}

export interface MatchedImageCycleOption {
  imageId: ImageId;
}

export type ImageTouchGesture = 'tap' | 'nextImage' | 'previousImage' | 'nextMatch' | 'previousMatch' | null;
export type ImageNavigationDirection = 1 | -1;
export type ImageDetailNavigationButtonDirection = 'previous' | 'next';
export type ImageDetailNavigationButtonVariant = 'touch' | 'desktop';

export type ImageDetailNavigationAction =
  | { type: 'cycleMask' }
  | { type: 'image'; direction: ImageNavigationDirection }
  | { type: 'match'; direction: ImageNavigationDirection };

export interface TouchNavigationActionOptions {
  gesture: ImageTouchGesture;
  hasMask: boolean;
  hasMaskSrc: boolean;
  isMarkedForDeletion: boolean;
  showMatchesInModal: boolean;
}

export interface WheelNavigationPlanOptions {
  deltaY: number;
  now: number;
  lastWheelTime: number;
  throttleMs: number;
  showMatchesInModal: boolean;
  hasConnectedImages: boolean;
}

export interface WheelNavigationPlan {
  action: ImageDetailNavigationAction | null;
  nextLastWheelTime: number;
}

export interface ImageDetailNavigationButtonStateOptions {
  direction: ImageDetailNavigationButtonDirection;
  variant: ImageDetailNavigationButtonVariant;
  hasTarget: boolean;
}

export interface ImageDetailNavigationButtonState {
  label: string;
  disabled: boolean;
  className: string;
}

interface SharedImageDetailNavigationControlsStateOptions {
  hasPrev: boolean;
  hasNext: boolean;
}

export type ImageDetailNavigationControlsStateOptions =
  | (SharedImageDetailNavigationControlsStateOptions & {
    variant: 'touch';
    currentIndex: number;
    imageCount: number;
  })
  | (SharedImageDetailNavigationControlsStateOptions & {
    variant: 'desktop';
  });

export interface ImageDetailNavigationControlsState {
  containerClassName: string;
  previousButton: ImageDetailNavigationButtonState;
  nextButton: ImageDetailNavigationButtonState;
  label: string | null;
  labelClassName: string | null;
  buttonStyle?: CSSProperties;
  showJumpInput: boolean;
}

const TOUCH_NAVIGATION_CONTAINER_CLASS = 'flex items-center gap-1.5 px-2 py-1.5 border-t border-ds';
const TOUCH_NAVIGATION_LABEL_CLASS = 'text-ds-primary text-xs px-1';
const DESKTOP_NAVIGATION_CONTAINER_CLASS = 'flex items-center gap-2';

const TOUCH_NAVIGATION_ENABLED_BUTTON_CLASS =
  'flex-1 px-2 flex items-center justify-center rounded-md text-xs bg-ds-hover text-ds-primary';
const TOUCH_NAVIGATION_DISABLED_BUTTON_CLASS =
  'flex-1 px-2 flex items-center justify-center rounded-md text-xs bg-ds-secondary text-ds-muted';

const DESKTOP_NAVIGATION_ENABLED_BUTTON_CLASS =
  `${buttonStyles.base} ${buttonStyles.sizes.toggleResponsive} ${buttonStyles.variants.toggle}`;
const DESKTOP_NAVIGATION_DISABLED_BUTTON_CLASS =
  `${buttonStyles.base} ${buttonStyles.sizes.toggleResponsive} ${buttonStyles.disabled} bg-ds-secondary text-ds-muted`;

export function getImageDetailNavigationButtonState({
  direction,
  variant,
  hasTarget,
}: ImageDetailNavigationButtonStateOptions): ImageDetailNavigationButtonState {
  const disabled = !hasTarget;
  const className = variant === 'touch'
    ? hasTarget ? TOUCH_NAVIGATION_ENABLED_BUTTON_CLASS : TOUCH_NAVIGATION_DISABLED_BUTTON_CLASS
    : hasTarget ? DESKTOP_NAVIGATION_ENABLED_BUTTON_CLASS : DESKTOP_NAVIGATION_DISABLED_BUTTON_CLASS;

  return {
    label: direction === 'previous' ? '\u2190 Prev' : 'Next \u2192',
    disabled,
    className,
  };
}

export function formatImageDetailNavigationLabel(currentIndex: number, imageCount: number): string {
  return `${currentIndex + 1} / ${imageCount}`;
}

export function getImageDetailNavigationControlsState(
  options: ImageDetailNavigationControlsStateOptions
): ImageDetailNavigationControlsState {
  const previousButton = getImageDetailNavigationButtonState({
    direction: 'previous',
    variant: options.variant,
    hasTarget: options.hasPrev,
  });
  const nextButton = getImageDetailNavigationButtonState({
    direction: 'next',
    variant: options.variant,
    hasTarget: options.hasNext,
  });

  if (options.variant === 'touch') {
    return {
      containerClassName: TOUCH_NAVIGATION_CONTAINER_CLASS,
      previousButton,
      nextButton,
      label: formatImageDetailNavigationLabel(options.currentIndex, options.imageCount),
      labelClassName: TOUCH_NAVIGATION_LABEL_CLASS,
      buttonStyle: { minHeight: TOUCH.compactButtonHeight },
      showJumpInput: false,
    };
  }

  return {
    containerClassName: DESKTOP_NAVIGATION_CONTAINER_CLASS,
    previousButton,
    nextButton,
    label: null,
    labelClassName: null,
    showJumpInput: true,
  };
}

export function getCycledMatchedImageId(
  connectedImages: readonly MatchedImageCycleOption[],
  matchedImageId: ImageId | null,
  direction: ImageNavigationDirection
): ImageId | null {
  if (connectedImages.length === 0) return null;

  const currentIndex = matchedImageId !== null
    ? connectedImages.findIndex((image) => image.imageId === matchedImageId)
    : -1;
  const nextIndex = direction > 0
    ? Math.min(currentIndex + 1, connectedImages.length - 1)
    : Math.max(currentIndex - 1, 0);

  return connectedImages[nextIndex]?.imageId ?? null;
}

export function shouldPreventTouchScroll(
  start: Position2D | null,
  current: Position2D,
  movementThreshold = 10
): boolean {
  if (!start) return false;

  const dx = Math.abs(current.x - start.x);
  const dy = Math.abs(current.y - start.y);
  return dx > movementThreshold || dy > movementThreshold;
}

export function getImageTouchGesture(
  start: TouchGestureStart,
  end: Position2D,
  currentTime: number,
  showMatchesInModal: boolean,
  {
    tapDistanceThreshold = 15,
    tapDurationThresholdMs = 300,
    swipeDistanceThreshold = 50,
    swipeAxisRatio = 1.5,
  }: TouchGestureOptions = {}
): ImageTouchGesture {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const elapsed = currentTime - start.time;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < tapDistanceThreshold && elapsed < tapDurationThresholdMs) {
    return 'tap';
  }

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx > swipeDistanceThreshold && absDx > absDy * swipeAxisRatio) {
    return dx < 0 ? 'nextImage' : 'previousImage';
  }

  if (showMatchesInModal && absDy > swipeDistanceThreshold && absDy > absDx * swipeAxisRatio) {
    return dy < 0 ? 'nextMatch' : 'previousMatch';
  }

  return null;
}

export function getImageTouchNavigationAction({
  gesture,
  hasMask,
  hasMaskSrc,
  isMarkedForDeletion,
  showMatchesInModal,
}: TouchNavigationActionOptions): ImageDetailNavigationAction | null {
  if (gesture === 'tap') {
    return hasMask && hasMaskSrc && !isMarkedForDeletion && !showMatchesInModal
      ? { type: 'cycleMask' }
      : null;
  }

  if (gesture === 'nextImage') return { type: 'image', direction: 1 };
  if (gesture === 'previousImage') return { type: 'image', direction: -1 };
  if (gesture === 'nextMatch') return { type: 'match', direction: 1 };
  if (gesture === 'previousMatch') return { type: 'match', direction: -1 };
  return null;
}

export function getImageWheelNavigationPlan({
  deltaY,
  now,
  lastWheelTime,
  throttleMs,
  showMatchesInModal,
  hasConnectedImages,
}: WheelNavigationPlanOptions): WheelNavigationPlan {
  if (now - lastWheelTime < throttleMs) {
    return { action: null, nextLastWheelTime: lastWheelTime };
  }

  if (showMatchesInModal && hasConnectedImages) {
    return {
      action: { type: 'match', direction: deltaY > 0 ? 1 : -1 },
      nextLastWheelTime: now,
    };
  }

  if (deltaY > 0) {
    return { action: { type: 'image', direction: 1 }, nextLastWheelTime: now };
  }

  if (deltaY < 0) {
    return { action: { type: 'image', direction: -1 }, nextLastWheelTime: now };
  }

  return { action: null, nextLastWheelTime: now };
}
