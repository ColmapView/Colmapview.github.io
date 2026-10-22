import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildCamera, buildImage, buildPoint2D, buildReconstruction } from '../../test/builders/colmapBuilders';
import { unavailableObservationIntegrity } from '../../parsers/observationIntegrity';
import { useImageDetailModalData } from './useImageDetailModalData';

describe('image-detail feature integrity', () => {
  it('suppresses stale match selections on an untrusted graph while keeping the selected photo available', () => {
    const images = [1, 2].map(imageId => buildImage({ imageId, points2D: [buildPoint2D({ point3DId: 5n })] }));
    const reconstruction = buildReconstruction({ cameras: [buildCamera()], images });
    const options = { reconstruction, imageDetailId: 1, matchedImageId: 2, showMatchesInModal: true,
      pendingDeletions: new Set<number>(), lazyPoints2D: new Map() };
    const { result, rerender } = renderHook(({reconstruction}) => useImageDetailModalData({ ...options, reconstruction }), { initialProps: {reconstruction} });
    expect(result.current.isMatchViewMode).toBe(true);
    expect(result.current.matchLines.length).toBe(1);
    rerender({reconstruction: { ...reconstruction, observationIntegrity: unavailableObservationIntegrity('Source is not readable.') }});
    expect(result.current.isMatchViewMode).toBe(false);
    expect(result.current.matchLines).toEqual([]);
    expect(result.current.image).toBe(images[0]);
    expect(result.current.effectivePoints2D).toBe(images[0].points2D);
  });
});
