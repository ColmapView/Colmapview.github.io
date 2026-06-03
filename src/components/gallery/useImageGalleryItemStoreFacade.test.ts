import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store';
import { buildCamera, buildReconstruction } from '../../test/builders';
import { useImageGalleryItemStoreFacade } from './useImageGalleryItemStoreFacade';

describe('useImageGalleryItemStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  });

  it('reports whether gallery item labels should include camera ids', () => {
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({
        cameras: [
          buildCamera({ cameraId: 1 }),
          buildCamera({ cameraId: 2 }),
        ],
      }),
    });

    const { result } = renderHook(() => useImageGalleryItemStoreFacade());

    expect(result.current.multiCamera).toBe(true);
  });

  it('keeps single-camera gallery labels compact', () => {
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({
        cameras: [buildCamera({ cameraId: 1 })],
      }),
    });

    const { result } = renderHook(() => useImageGalleryItemStoreFacade());

    expect(result.current.multiCamera).toBe(false);
  });
});
