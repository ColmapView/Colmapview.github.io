import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildImage, buildPoint2D, buildReconstruction } from '../../test/builders';
import type { ImageId, Point2D } from '../../types/colmap';
import { WasmReconstructionWrapper } from '../../wasm/reconstruction';
import { useLazyImagePoints2D } from './useLazyImagePoints2D';

type HookOptions = Parameters<typeof useLazyImagePoints2D>[0];

function createWasm(pointsByImageId: Map<ImageId, Point2D[]>) {
  const wasm = new WasmReconstructionWrapper();
  const getImagePoints2DArray = vi
    .spyOn(wasm, 'getImagePoints2DArray')
    .mockImplementation((imageId) => pointsByImageId.get(imageId) ?? []);

  return { wasm, getImagePoints2DArray };
}

function createOptions(overrides: Partial<HookOptions> = {}): HookOptions {
  const image = buildImage({ imageId: 1, points2D: [], numPoints2D: 1 });

  return {
    reconstruction: buildReconstruction({ images: [image] }),
    wasmReconstruction: null,
    imageDetailId: image.imageId,
    matchedImageId: null,
    showPoints2D: true,
    showPoints3D: false,
    showMatchesInModal: false,
    ...overrides,
  };
}

describe('useLazyImagePoints2D', () => {
  it('loads missing current-image points from the active WASM reconstruction', async () => {
    const imagePoints = [buildPoint2D({ xy: [1, 2], point3DId: 10n })];
    const { wasm, getImagePoints2DArray } = createWasm(new Map([[1, imagePoints]]));

    const { result } = renderHook((options: HookOptions) => useLazyImagePoints2D(options), {
      initialProps: createOptions({ wasmReconstruction: wasm }),
    });

    await waitFor(() => expect(result.current.get(1)).toBe(imagePoints));
    expect(getImagePoints2DArray).toHaveBeenCalledWith(1);
  });

  it('hides cached points when the WASM reconstruction changes before reloading them', async () => {
    const firstPoints = [buildPoint2D({ xy: [1, 2], point3DId: 10n })];
    const secondPoints = [buildPoint2D({ xy: [3, 4], point3DId: 20n })];
    const firstWasm = createWasm(new Map([[1, firstPoints]]));
    const secondWasm = createWasm(new Map([[1, secondPoints]]));
    const initialOptions = createOptions({ wasmReconstruction: firstWasm.wasm });

    const { result, rerender } = renderHook((options: HookOptions) => useLazyImagePoints2D(options), {
      initialProps: initialOptions,
    });

    await waitFor(() => expect(result.current.get(1)).toBe(firstPoints));

    rerender({
      ...initialOptions,
      wasmReconstruction: secondWasm.wasm,
      showPoints2D: false,
    });

    expect(result.current.size).toBe(0);
    expect(secondWasm.getImagePoints2DArray).not.toHaveBeenCalled();

    rerender({
      ...initialOptions,
      wasmReconstruction: secondWasm.wasm,
    });

    await waitFor(() => expect(result.current.get(1)).toBe(secondPoints));
    expect(secondWasm.getImagePoints2DArray).toHaveBeenCalledWith(1);
  });
});
