import { describe, expect, it } from 'vitest';
import {
  hasSelectedPlaneMarker,
  hasSelectedPlaneIntersection,
  shouldClearExternalFrustumPlaneHover,
  shouldStartFrustumPlaneHover,
  type FrustumPlaneHoverIntersection,
} from './frustumPlaneHoverPolicy';

function intersection(isSelectedPlane?: boolean): FrustumPlaneHoverIntersection {
  return {
    object: {
      userData: isSelectedPlane === undefined ? undefined : { isSelectedPlane },
    },
  };
}

describe('frustum plane hover policy', () => {
  it('detects selected plane intersections', () => {
    expect(hasSelectedPlaneIntersection([
      intersection(false),
      intersection(true),
    ])).toBe(true);
  });

  it('ignores intersections without a selected plane marker', () => {
    expect(hasSelectedPlaneIntersection([
      intersection(false),
      intersection(),
    ])).toBe(false);
  });

  it('ignores malformed intersection-like values', () => {
    expect(hasSelectedPlaneMarker(null)).toBe(false);
    expect(hasSelectedPlaneMarker({})).toBe(false);
    expect(hasSelectedPlaneMarker({ object: null })).toBe(false);
    expect(hasSelectedPlaneMarker({ object: { userData: { isSelectedPlane: 'true' } } })).toBe(false);
    expect(hasSelectedPlaneIntersection([
      null,
      { object: { userData: { isSelectedPlane: true } } },
    ])).toBe(true);
  });

  it('blocks hover while dragging', () => {
    expect(shouldStartFrustumPlaneHover({
      isDragging: true,
      isSelected: true,
      isTopIntersection: true,
      selectedPlaneIntersected: false,
    })).toBe(false);
  });

  it('allows selected planes even when another object is the top intersection', () => {
    expect(shouldStartFrustumPlaneHover({
      isDragging: false,
      isSelected: true,
      isTopIntersection: false,
      selectedPlaneIntersected: true,
    })).toBe(true);
  });

  it('blocks non-selected planes when a selected plane is also intersected', () => {
    expect(shouldStartFrustumPlaneHover({
      isDragging: false,
      isSelected: false,
      isTopIntersection: true,
      selectedPlaneIntersected: true,
    })).toBe(false);
  });

  it('blocks non-selected planes behind another intersection', () => {
    expect(shouldStartFrustumPlaneHover({
      isDragging: false,
      isSelected: false,
      isTopIntersection: false,
      selectedPlaneIntersected: false,
    })).toBe(false);
  });

  it('allows non-selected planes when they are the top non-selected intersection', () => {
    expect(shouldStartFrustumPlaneHover({
      isDragging: false,
      isSelected: false,
      isTopIntersection: true,
      selectedPlaneIntersected: false,
    })).toBe(true);
  });

  it('clears local hover when another image owns the external hover state', () => {
    expect(shouldClearExternalFrustumPlaneHover({
      hovered: true,
      hoveredImageId: 2,
      imageId: 1,
    })).toBe(true);
  });

  it('keeps local hover when inactive or still externally selected', () => {
    expect(shouldClearExternalFrustumPlaneHover({
      hovered: false,
      hoveredImageId: 2,
      imageId: 1,
    })).toBe(false);
    expect(shouldClearExternalFrustumPlaneHover({
      hovered: true,
      hoveredImageId: 1,
      imageId: 1,
    })).toBe(false);
  });
});
