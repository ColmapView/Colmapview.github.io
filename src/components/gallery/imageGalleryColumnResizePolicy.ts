export type ImageGalleryColumnResizeViewMode = 'gallery' | 'list';

interface GalleryColumnResizeOptions {
  currentColumns: number;
  deltaY: number;
  maxColumns: number;
  minColumns: number;
  pendingColumns: number | null;
}

export function shouldHandleGalleryColumnWheel(
  viewMode: ImageGalleryColumnResizeViewMode,
  shiftKey: boolean
): boolean {
  return viewMode === 'gallery' && shiftKey;
}

export function getGalleryColumnWheelDelta(deltaX: number, deltaY: number): number {
  return Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
}

export function getNextGalleryColumnCount({
  currentColumns,
  deltaY,
  maxColumns,
  minColumns,
  pendingColumns,
}: GalleryColumnResizeOptions): number {
  const delta = deltaY > 0 ? 1 : -1;
  const baseColumns = pendingColumns ?? currentColumns;

  return Math.max(minColumns, Math.min(maxColumns, baseColumns + delta));
}
