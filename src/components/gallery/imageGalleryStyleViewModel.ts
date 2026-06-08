import type { CSSProperties } from 'react';
import {
  DELETED_FILTER,
  GAP,
  MODAL_POSITION,
  SIZE,
  Z_INDEX,
} from '../../theme';

interface GalleryBorderStyleOptions {
  isMatched: boolean;
  isSelected: boolean;
  itemBorderColor?: string;
  matchesColor: string;
}

interface GalleryVirtualRowStyleOptions {
  galleryColumns: number;
  start: number;
}

interface MousePosition {
  x: number;
  y: number;
}

export function getGalleryItemFrameStyle({
  isMatched,
  isSelected,
  itemBorderColor,
  matchesColor,
}: GalleryBorderStyleOptions): CSSProperties {
  return {
    position: 'relative',
    ...getItemBorderStyle({ isMatched, isSelected, itemBorderColor, matchesColor }),
  };
}

export function getListItemFrameStyle({
  isMatched,
  isSelected,
  itemBorderColor,
  matchesColor,
}: GalleryBorderStyleOptions): CSSProperties {
  return {
    height: SIZE.listRowHeight,
    ...getItemBorderStyle({ isMatched, isSelected, itemBorderColor, matchesColor }),
  };
}

function getItemBorderStyle({
  isMatched,
  isSelected,
  itemBorderColor,
  matchesColor,
}: GalleryBorderStyleOptions): CSSProperties {
  if (isSelected) return {};
  if (isMatched) return { borderColor: matchesColor };
  return itemBorderColor ? { borderColor: itemBorderColor } : {};
}

export function getDeletionImageStyle(
  isMarkedForDeletion: boolean,
): CSSProperties | undefined {
  return isMarkedForDeletion ? { filter: DELETED_FILTER } : undefined;
}

export function getDeletionPlaceholderStyle(
  isMarkedForDeletion: boolean,
): CSSProperties | undefined {
  return isMarkedForDeletion ? { opacity: 0.5 } : undefined;
}

export function getGalleryItemVignetteStyle(): CSSProperties {
  return {
    background:
      'radial-gradient(ellipse 100% 100% at center, transparent 20%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.7) 80%, rgba(0,0,0,0.9) 100%)',
  };
}

export function getGalleryVirtualizerSizerStyle(totalSize: number): CSSProperties {
  return {
    height: totalSize,
    width: '100%',
    position: 'relative',
  };
}

export function getGalleryVirtualRowStyle({
  galleryColumns,
  start,
}: GalleryVirtualRowStyleOptions): CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    transform: `translateY(${start}px)`,
    display: 'grid',
    gridTemplateColumns: `repeat(${galleryColumns}, 1fr)`,
    gap: GAP.gallery,
    paddingBottom: GAP.gallery,
    willChange: 'transform',
  };
}

export function getListVirtualRowStyle(start: number): CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    transform: `translateY(${start}px)`,
    willChange: 'transform',
  };
}

export function getImageGalleryHoverCardStyle({
  x,
  y,
}: MousePosition): CSSProperties {
  return {
    position: 'fixed',
    left: x + MODAL_POSITION.cursorOffset,
    top: y + MODAL_POSITION.cursorOffset,
    pointerEvents: 'none',
    zIndex: Z_INDEX.mouseTooltip,
  };
}
