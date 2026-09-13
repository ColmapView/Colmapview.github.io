import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildPoint3D, buildReconstruction, buildWasmReconstructionWrapper } from '../../test/builders';
import { usePointCloudData, type UsePointCloudDataParams } from './usePointCloudData';

function createParams(wasm: boolean): UsePointCloudDataParams {
  const ids = [10n, 500n, 9007199254741001n];
  return {
    enabled: true,
    reconstruction: buildReconstruction({
      points3D: ids.map((point3DId, index) => buildPoint3D({
        point3DId, xyz: [index * 3, index * 3 + 1, index * 3 + 2],
        rgb: [255, 0, 0], error: index, track: [{ imageId: 1, point2DIdx: 0 }],
      })),
      imageToPoint3DIds: new Map([[1, new Set([ids[0]])], [2, new Set([ids[1], ids[2]])]]),
    }),
    wasmReconstruction: wasm ? buildWasmReconstructionWrapper({
      positions: new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]),
      colors: new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0]),
      errors: new Float32Array([0, 1, 2]), trackLengths: new Uint32Array([1, 1, 1]),
      point3DIds: new BigUint64Array(ids),
    }) : null,
    colorMode: 'rgb', minTrackLength: 1, maxReprojectionError: Infinity, thinning: 0,
    selectedImageId: 1, showSelectionHighlight: true, selectionColor: '#ff0000',
    floorColorMode: 'off', pointDistances: null, distanceThreshold: 0,
  };
}

describe('point-cloud base data and selection ownership', () => {
  it.each(['wasm-fast', 'wasm-filtered', 'map'] as const)('keeps base buffers and picking IDs stable on selection changes (%s)', (path) => {
    const params = createParams(path !== 'map');
    if (path === 'wasm-filtered') params.maxReprojectionError = 1;
    const { result, rerender } = renderHook(usePointCloudData, { initialProps: params });
    const base = result.current;
    rerender({ ...params, selectedImageId: 2 });
    expect(result.current.positions).toBe(base.positions);
    expect(result.current.colors).toBe(base.colors);
    expect(result.current.indexToPoint3DId).toBe(base.indexToPoint3DId);
    expect(Array.from(result.current.selectedPositions!)).toEqual(
      path === 'wasm-filtered' ? [3, 4, 5] : [3, 4, 5, 6, 7, 8]
    );
    expect(result.current.indexToPoint3DId.get(1)).toBe(500n);
    const selectedPositions = result.current.selectedPositions;
    rerender({ ...params, selectedImageId: 2, selectionColor: '#00ff00' });
    expect(result.current.colors).toBe(base.colors);
    expect(result.current.selectedColors).toBeNull();
    expect(result.current.selectedPositions).toBe(selectedPositions);
    rerender({ ...params, showSelectionHighlight: false });
    expect(result.current.positions).toBe(base.positions);
    expect(result.current.selectedPositions).toBeNull();
  });

  it('invalidates for filters, floor colors and replacement reconstructions', () => {
    const params = createParams(true);
    const { result, rerender } = renderHook(usePointCloudData, { initialProps: params });
    const originalColors = result.current.colors;
    rerender({ ...params, floorColorMode: 'binary', pointDistances: new Float32Array([0, 2, 3]), distanceThreshold: 1 });
    expect(result.current.colors).not.toBe(originalColors);
    rerender({ ...params, thinning: 1, selectedImageId: 2 });
    expect(Array.from(result.current.positions!)).toEqual([0, 1, 2, 6, 7, 8]);
    expect(Array.from(result.current.selectedPositions!)).toEqual([6, 7, 8]);
    const replacement = createParams(false);
    replacement.reconstruction!.points3D!.get(10n)!.xyz = [9, 9, 9];
    rerender(replacement);
    expect(Array.from(result.current.selectedPositions!)).toEqual([9, 9, 9]);
  });

  it('allocates when an inactive cloud first becomes needed and releases output when disabled', () => {
    const params = createParams(true);
    const { result, rerender } = renderHook(usePointCloudData, { initialProps: { ...params, enabled: false } });
    expect(result.current.positions).toBeNull();
    act(() => rerender(params));
    expect(result.current.positions).not.toBeNull();
    act(() => rerender({ ...params, enabled: false }));
    expect(result.current.positions).toBeNull();
    expect(result.current.selectedPositions).toBeNull();
  });
});
