import type { ImageId } from '../../types/colmap';

export interface FrustumPlaneHoverIntersection {
  object: {
    userData?: {
      isSelectedPlane?: boolean;
    };
  };
}

export interface FrustumPlaneHoverStartOptions {
  isDragging: boolean;
  isSelected: boolean;
  isTopIntersection: boolean;
  selectedPlaneIntersected: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function hasSelectedPlaneMarker(intersection: unknown): boolean {
  if (!isRecord(intersection)) return false;
  const { object } = intersection;
  if (!isRecord(object)) return false;
  const { userData } = object;
  return isRecord(userData) && userData.isSelectedPlane === true;
}

export function hasSelectedPlaneIntersection(intersections: readonly unknown[]): boolean {
  return intersections.some(hasSelectedPlaneMarker);
}

export function shouldStartFrustumPlaneHover({
  isDragging,
  isSelected,
  isTopIntersection,
  selectedPlaneIntersected,
}: FrustumPlaneHoverStartOptions): boolean {
  if (isDragging) return false;
  if (isSelected) return true;

  return !selectedPlaneIntersected && isTopIntersection;
}

export function shouldClearExternalFrustumPlaneHover({
  hovered,
  hoveredImageId,
  imageId,
}: {
  hovered: boolean;
  hoveredImageId: ImageId | null;
  imageId: ImageId;
}): boolean {
  return hovered && hoveredImageId !== imageId;
}
