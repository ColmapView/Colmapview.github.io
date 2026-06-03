import type { CSSProperties } from 'react';
import { TOUCH } from '../../theme/sizing';
import { Z_INDEX } from '../../theme/zIndex';

export type TouchFabPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type TouchFabSize = 'primary' | 'secondary';

export const TOUCH_FAB_POSITION_CLASSES: Record<TouchFabPosition, string> = {
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
};

export const TOUCH_FAB_BASE_CLASS =
  'fixed rounded-full shadow-lg flex items-center justify-center transition-all duration-200 active:scale-95';
export const TOUCH_FAB_PRIMARY_CLASS = 'bg-ds-accent text-ds-void hover:bg-ds-accent/90';
export const TOUCH_FAB_SECONDARY_CLASS = 'bg-ds-tertiary text-ds-primary border border-ds hover:bg-ds-hover';
export const TOUCH_FAB_PRIMARY_ICON_CLASS = 'w-5 h-5';
export const TOUCH_FAB_SECONDARY_ICON_CLASS = 'w-4 h-4';

export function getTouchFabDiameter(size: TouchFabSize): number {
  return size === 'primary' ? TOUCH.minTapTarget : TOUCH.fabSecondarySize;
}

export function getTouchFabVariantClassName(size: TouchFabSize): string {
  return size === 'primary' ? TOUCH_FAB_PRIMARY_CLASS : TOUCH_FAB_SECONDARY_CLASS;
}

export function getTouchFabIconClassName(size: TouchFabSize): string {
  return size === 'primary' ? TOUCH_FAB_PRIMARY_ICON_CLASS : TOUCH_FAB_SECONDARY_ICON_CLASS;
}

export function getTouchFabClassName({
  position,
  size,
  className = '',
}: {
  position: TouchFabPosition;
  size: TouchFabSize;
  className?: string;
}): string {
  return [
    TOUCH_FAB_BASE_CLASS,
    TOUCH_FAB_POSITION_CLASSES[position],
    getTouchFabVariantClassName(size),
    className,
  ].filter(Boolean).join(' ');
}

export function getTouchFabStyle(size: TouchFabSize): CSSProperties {
  const diameter = getTouchFabDiameter(size);

  return {
    width: diameter,
    height: diameter,
    zIndex: Z_INDEX.fab,
  };
}
