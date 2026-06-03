import { TOUCH, buttonStyles, inputStyles } from '../../theme';
import type { ImageId } from '../../types/colmap';
import {
  parseFiniteNumberString,
  parseSafeIntegerString,
} from '../../utils/numberParsing';

export { formatImageDetailNavigationLabel } from './imageDetailNavigationViewModel';

export type ImageDetailControlVariant = 'touch' | 'desktop';
export type ImageDetailPointToggleKey = 'points2D' | 'points3D';

export type ImageJumpInputKeyAction =
  | { type: 'openAndBlur'; imageId: ImageId }
  | { type: 'resetAndBlur'; value: string }
  | { type: 'blur' }
  | { type: 'none' };

interface ImageJumpInputKeyActionRequest {
  key: string;
  value: string;
  currentImageId: ImageId | null;
  imageExists: (imageId: ImageId) => boolean;
}

export interface ImageJumpInputStateOptions {
  imageDetailId: ImageId | null;
  imageCount: number;
}

export interface ImageJumpInputState {
  containerClassName: string;
  inputClassName: string;
  countClassName: string;
  inputKey: string;
  resetValue: string;
  countLabel: string;
}

export interface ImageDetailPointToggleButtonStateOptions {
  variant: ImageDetailControlVariant;
  isActive: boolean;
  isMarkedForDeletion: boolean;
  inactiveCountClass: string;
}

export interface ImageDetailPointToggleButtonState {
  disabled: boolean;
  className: string;
  countClass: string;
  nextActive: boolean;
  minHeight?: number;
}

export interface ImageDetailPointToggleDescriptor {
  key: ImageDetailPointToggleKey;
  label: string;
  inactiveCountClass: string;
}

export interface ImageDetailMatchesToggleButtonStateOptions {
  variant: ImageDetailControlVariant;
  isActive: boolean;
  isMarkedForDeletion: boolean;
}

export interface ImageDetailMatchesToggleButtonState {
  label: string;
  disabled: boolean;
  className: string;
  nextActive: boolean;
  minHeight?: number;
}

export interface ImageDetailControlVisibilityStateOptions {
  variant: ImageDetailControlVariant;
  showMatchesInModal: boolean;
  isMarkedForDeletion: boolean;
  matchedImageId: ImageId | null;
}

export interface ImageDetailControlVisibilityState {
  showPointToggles: boolean;
  showMatchSelector: boolean;
  showMatchOpacity: boolean;
  showNavigation: boolean;
}

export interface ImageDetailMatchSelectConnectedImage {
  imageId: ImageId;
  matchCount: number;
  name: string;
}

export interface ImageDetailMatchSelectStateOptions {
  variant: ImageDetailControlVariant;
  matchedImageId: ImageId | null;
  connectedImages: readonly ImageDetailMatchSelectConnectedImage[];
}

export interface ImageDetailMatchSelectOptionState {
  value: string;
  label: string;
}

export interface ImageDetailMatchSelectState {
  value: string;
  placeholderLabel: string;
  className: string;
  minHeight?: number;
  options: ImageDetailMatchSelectOptionState[];
}

export interface ImageDetailMatchOpacityControlStateOptions {
  variant: ImageDetailControlVariant;
  opacity: number;
  isEditing?: boolean;
}

export interface ImageDetailMatchOpacityControlState {
  containerClassName: string;
  label: string;
  labelClassName: string;
  sliderClassName: string;
  sliderMin: string;
  sliderMax: string;
  sliderStep: string;
  valueLabel: string;
  valueClassName: string;
  editorInputClassName: string;
  showEditor: boolean;
  showDisplayValue: boolean;
  displayValueTitle?: string;
}

const TOUCH_POINT_TOGGLE_DISABLED_CLASS =
  'flex-1 px-2 flex items-center justify-center rounded-md text-xs bg-ds-secondary text-ds-muted opacity-50';
const TOUCH_POINT_TOGGLE_ACTIVE_CLASS =
  'flex-1 px-2 flex items-center justify-center rounded-md text-xs bg-ds-accent text-ds-void';
const TOUCH_POINT_TOGGLE_INACTIVE_CLASS =
  'flex-1 px-2 flex items-center justify-center rounded-md text-xs bg-ds-hover text-ds-primary';

const DESKTOP_POINT_TOGGLE_DISABLED_CLASS =
  `${buttonStyles.base} ${buttonStyles.sizes.toggleResponsive} ${buttonStyles.disabled} bg-ds-secondary text-ds-muted`;
const DESKTOP_POINT_TOGGLE_ACTIVE_CLASS =
  `${buttonStyles.base} ${buttonStyles.sizes.toggleResponsive} ${buttonStyles.variants.toggleActive}`;
const DESKTOP_POINT_TOGGLE_INACTIVE_CLASS =
  `${buttonStyles.base} ${buttonStyles.sizes.toggleResponsive} ${buttonStyles.variants.toggle}`;

const POINT_TOGGLE_INACTIVE_COUNT_CLASSES: Record<ImageDetailPointToggleKey, string> = {
  points2D: 'text-ds-success',
  points3D: 'text-ds-error',
};

const TOUCH_MATCHES_TOGGLE_BASE_CLASS =
  'px-3 flex items-center justify-center rounded-md text-xs whitespace-nowrap';
const TOUCH_MATCHES_TOGGLE_DISABLED_CLASS = 'bg-ds-secondary text-ds-muted opacity-50';
const TOUCH_MATCHES_TOGGLE_ACTIVE_CLASS = 'bg-ds-accent text-ds-void';
const TOUCH_MATCHES_TOGGLE_INACTIVE_CLASS = 'bg-ds-hover text-ds-primary';

const DESKTOP_MATCHES_TOGGLE_DISABLED_CLASS =
  `${buttonStyles.base} ${buttonStyles.sizes.toggleResponsive} ${buttonStyles.disabled} bg-ds-secondary text-ds-muted`;
const DESKTOP_MATCHES_TOGGLE_ACTIVE_CLASS =
  `${buttonStyles.base} ${buttonStyles.sizes.toggleResponsive} ${buttonStyles.variants.toggleActive}`;
const DESKTOP_MATCHES_TOGGLE_INACTIVE_CLASS =
  `${buttonStyles.base} ${buttonStyles.sizes.toggleResponsive} ${buttonStyles.variants.toggle}`;

const TOUCH_MATCH_SELECT_CLASS = `${inputStyles.select} flex-1 min-w-0 py-1.5 text-xs`;
const DESKTOP_MATCH_SELECT_CLASS = `${inputStyles.select} py-1 pl-2 pr-1 text-xs`;

const IMAGE_JUMP_INPUT_CONTAINER_CLASS = 'flex items-center text-xs';
const IMAGE_JUMP_INPUT_FIELD_CLASS = `${inputStyles.base} py-1 w-14 rounded-l rounded-r-none text-center text-xs`;
const IMAGE_JUMP_INPUT_COUNT_CLASS =
  'w-14 px-2 py-1 text-center bg-ds-secondary text-ds-muted border-y border-r border-ds rounded-r';

const TOUCH_MATCH_OPACITY_CONTAINER_CLASS = 'flex items-center gap-2 px-2 pb-1.5';
const TOUCH_MATCH_OPACITY_LABEL_CLASS = 'text-ds-secondary text-xs';
const TOUCH_MATCH_OPACITY_SLIDER_CLASS = 'flex-1 accent-ds-success h-6';
const TOUCH_MATCH_OPACITY_VALUE_CLASS = 'text-ds-primary text-xs w-8 text-right';

const DESKTOP_MATCH_OPACITY_CONTAINER_CLASS = 'flex items-center gap-2';
const DESKTOP_MATCH_OPACITY_LABEL_CLASS = 'text-ds-secondary whitespace-nowrap text-xs pl-1';
const DESKTOP_MATCH_OPACITY_SLIDER_CLASS = 'w-14 accent-ds-success';
const DESKTOP_MATCH_OPACITY_VALUE_CLASS =
  'text-ds-primary text-xs w-8 text-right flex-shrink-0 cursor-pointer hover-bg-ds-accent';
const DESKTOP_MATCH_OPACITY_EDITOR_CLASS =
  'bg-transparent text-ds-primary text-xs w-8 text-right flex-shrink-0 border-none p-0 m-0 focus-outline-none';

export function getPointCountClass(
  isMarkedForDeletion: boolean,
  isActive: boolean,
  inactiveClass: string
): string {
  return isMarkedForDeletion || isActive ? '' : inactiveClass;
}

export function getImageDetailPointToggleDescriptors(
  variant: ImageDetailControlVariant
): ImageDetailPointToggleDescriptor[] {
  return [
    {
      key: 'points2D',
      label: variant === 'touch' ? '2D' : 'Points2D',
      inactiveCountClass: POINT_TOGGLE_INACTIVE_COUNT_CLASSES.points2D,
    },
    {
      key: 'points3D',
      label: variant === 'touch' ? '3D' : 'Points3D',
      inactiveCountClass: POINT_TOGGLE_INACTIVE_COUNT_CLASSES.points3D,
    },
  ];
}

export function getImageDetailPointToggleButtonState({
  variant,
  isActive,
  isMarkedForDeletion,
  inactiveCountClass,
}: ImageDetailPointToggleButtonStateOptions): ImageDetailPointToggleButtonState {
  const disabled = isMarkedForDeletion;
  const className = variant === 'touch'
    ? disabled
      ? TOUCH_POINT_TOGGLE_DISABLED_CLASS
      : isActive ? TOUCH_POINT_TOGGLE_ACTIVE_CLASS : TOUCH_POINT_TOGGLE_INACTIVE_CLASS
    : disabled
      ? DESKTOP_POINT_TOGGLE_DISABLED_CLASS
      : isActive ? DESKTOP_POINT_TOGGLE_ACTIVE_CLASS : DESKTOP_POINT_TOGGLE_INACTIVE_CLASS;

  return {
    disabled,
    className,
    countClass: getPointCountClass(isMarkedForDeletion, isActive, inactiveCountClass),
    nextActive: !isActive,
    minHeight: variant === 'touch' ? TOUCH.compactButtonHeight : undefined,
  };
}

export function getImageDetailMatchesToggleButtonState({
  variant,
  isActive,
  isMarkedForDeletion,
}: ImageDetailMatchesToggleButtonStateOptions): ImageDetailMatchesToggleButtonState {
  const disabled = isMarkedForDeletion;
  const className = variant === 'touch'
    ? `${isActive ? '' : 'flex-1'} ${TOUCH_MATCHES_TOGGLE_BASE_CLASS} ${
      disabled
        ? TOUCH_MATCHES_TOGGLE_DISABLED_CLASS
        : isActive ? TOUCH_MATCHES_TOGGLE_ACTIVE_CLASS : TOUCH_MATCHES_TOGGLE_INACTIVE_CLASS
    }`.trim()
    : disabled
      ? DESKTOP_MATCHES_TOGGLE_DISABLED_CLASS
      : isActive ? DESKTOP_MATCHES_TOGGLE_ACTIVE_CLASS : DESKTOP_MATCHES_TOGGLE_INACTIVE_CLASS;

  return {
    label: variant === 'touch' ? 'Matches' : 'Show Matches',
    disabled,
    className,
    nextActive: !isActive,
    minHeight: variant === 'touch' ? TOUCH.compactButtonHeight : undefined,
  };
}

export function parseOptionalImageId(value: string): ImageId | null {
  if (value === '') return null;

  return parseSafeIntegerString(value);
}

export function parseMatchLineOpacityValue(value: string): number | null {
  return parseFiniteNumberString(value);
}

export function formatImageDetailMatchSelectOptionLabel(
  variant: ImageDetailControlVariant,
  name: string,
  matchCount: number
): string {
  return `${name} (${matchCount}${variant === 'touch' ? '' : ' matches'})`;
}

export function getImageDetailMatchSelectState({
  variant,
  matchedImageId,
  connectedImages,
}: ImageDetailMatchSelectStateOptions): ImageDetailMatchSelectState {
  const isTouch = variant === 'touch';

  return {
    value: matchedImageId === null ? '' : String(matchedImageId),
    placeholderLabel: isTouch ? 'Select image...' : 'Select connected image...',
    className: isTouch ? TOUCH_MATCH_SELECT_CLASS : DESKTOP_MATCH_SELECT_CLASS,
    minHeight: isTouch ? TOUCH.compactButtonHeight : undefined,
    options: connectedImages.map(({ imageId, matchCount, name }) => ({
      value: String(imageId),
      label: formatImageDetailMatchSelectOptionLabel(variant, name, matchCount),
    })),
  };
}

export function formatImageDetailOpacityPercent(opacity: number): string {
  return `${Math.round(opacity * 100)}%`;
}

export function getImageDetailMatchOpacityControlState({
  variant,
  opacity,
  isEditing = false,
}: ImageDetailMatchOpacityControlStateOptions): ImageDetailMatchOpacityControlState {
  const isTouch = variant === 'touch';
  const showEditor = !isTouch && isEditing;

  return {
    containerClassName: isTouch ? TOUCH_MATCH_OPACITY_CONTAINER_CLASS : DESKTOP_MATCH_OPACITY_CONTAINER_CLASS,
    label: 'Opacity',
    labelClassName: isTouch ? TOUCH_MATCH_OPACITY_LABEL_CLASS : DESKTOP_MATCH_OPACITY_LABEL_CLASS,
    sliderClassName: isTouch ? TOUCH_MATCH_OPACITY_SLIDER_CLASS : DESKTOP_MATCH_OPACITY_SLIDER_CLASS,
    sliderMin: '0',
    sliderMax: '1',
    sliderStep: isTouch ? '0.1' : '0.05',
    valueLabel: formatImageDetailOpacityPercent(opacity),
    valueClassName: isTouch ? TOUCH_MATCH_OPACITY_VALUE_CLASS : DESKTOP_MATCH_OPACITY_VALUE_CLASS,
    editorInputClassName: DESKTOP_MATCH_OPACITY_EDITOR_CLASS,
    showEditor,
    showDisplayValue: !showEditor,
    displayValueTitle: isTouch ? undefined : 'Double-click to edit',
  };
}

export function shouldShowImageDetailPointToggles(showMatchesInModal: boolean): boolean {
  return !showMatchesInModal;
}

export function shouldShowImageDetailMatchSelector(
  showMatchesInModal: boolean,
  isMarkedForDeletion: boolean
): boolean {
  return showMatchesInModal && !isMarkedForDeletion;
}

export function shouldShowImageDetailMatchOpacity(
  showMatchesInModal: boolean,
  isMarkedForDeletion: boolean,
  matchedImageId: ImageId | null
): boolean {
  return showMatchesInModal && !isMarkedForDeletion && matchedImageId !== null;
}

export function shouldShowImageDetailNavigation(showMatchesInModal: boolean): boolean {
  return !showMatchesInModal;
}

export function getImageDetailControlVisibilityState({
  variant,
  showMatchesInModal,
  isMarkedForDeletion,
  matchedImageId,
}: ImageDetailControlVisibilityStateOptions): ImageDetailControlVisibilityState {
  const showMatchSelector = shouldShowImageDetailMatchSelector(showMatchesInModal, isMarkedForDeletion);

  return {
    showPointToggles: shouldShowImageDetailPointToggles(showMatchesInModal),
    showMatchSelector,
    showMatchOpacity: variant === 'touch'
      ? shouldShowImageDetailMatchOpacity(showMatchesInModal, isMarkedForDeletion, matchedImageId)
      : showMatchSelector,
    showNavigation: variant === 'touch'
      ? shouldShowImageDetailNavigation(showMatchesInModal)
      : true,
  };
}

export function getImageJumpInputResetValue(imageDetailId: ImageId | null): string {
  return String(imageDetailId ?? '');
}

export function getImageJumpInputState({
  imageDetailId,
  imageCount,
}: ImageJumpInputStateOptions): ImageJumpInputState {
  return {
    containerClassName: IMAGE_JUMP_INPUT_CONTAINER_CLASS,
    inputClassName: IMAGE_JUMP_INPUT_FIELD_CLASS,
    countClassName: IMAGE_JUMP_INPUT_COUNT_CLASS,
    inputKey: String(imageDetailId ?? 'none'),
    resetValue: getImageJumpInputResetValue(imageDetailId),
    countLabel: String(imageCount),
  };
}

export function getImageJumpInputKeyAction({
  key,
  value,
  currentImageId,
  imageExists,
}: ImageJumpInputKeyActionRequest): ImageJumpInputKeyAction {
  if (key === 'Enter') {
    const imageId = parseOptionalImageId(value);
    if (imageId !== null && imageExists(imageId)) {
      return { type: 'openAndBlur', imageId };
    }
    return { type: 'blur' };
  }

  if (key === 'Escape') {
    return {
      type: 'resetAndBlur',
      value: getImageJumpInputResetValue(currentImageId),
    };
  }

  return { type: 'none' };
}
