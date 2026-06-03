import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWasmReconstructionWrapper } from '../../test/builders';
import { computeSlowPathWasm } from './pointCloudWasmData';

describe('point cloud WASM data builder', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when required WASM arrays are unavailable or invalid', () => {
    expect(computeSlowPathWasm({
      wasmReconstruction: buildWasmReconstructionWrapper({ positions: null }),
      colorMode: 'rgb',
      minTrackLength: 1,
      maxReprojectionError: 10,
      thinning: 0,
      selectedImagePointIds: new Set(),
      showSelectionHighlight: false,
      highlightColor: [1, 0, 0],
      floorColorMode: 'off',
      pointDistances: null,
      distanceThreshold: 0,
    })).toBeNull();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(computeSlowPathWasm({
      wasmReconstruction: buildWasmReconstructionWrapper({
        positions: new Float32Array([NaN, 0, 0]),
        errors: new Float32Array([0]),
        trackLengths: new Uint32Array([1]),
      }),
      colorMode: 'rgb',
      minTrackLength: 1,
      maxReprojectionError: 10,
      thinning: 0,
      selectedImagePointIds: new Set(),
      showSelectionHighlight: false,
      highlightColor: [1, 0, 0],
      floorColorMode: 'off',
      pointDistances: null,
      distanceThreshold: 0,
    })).toBeNull();
    expect(warn).toHaveBeenCalledWith('[PointCloud] WASM slow path: positions array is invalid');
  });

  it('filters WASM points and builds highlight overlay plus picking IDs', () => {
    const result = computeSlowPathWasm({
      wasmReconstruction: buildWasmReconstructionWrapper({
        positions: new Float32Array([
          0, 1, 2,
          3, 4, 5,
          6, 7, 8,
        ]),
        colors: new Float32Array([
          1, 0, 0,
          0, 1, 0,
          0, 0, 1,
        ]),
        errors: new Float32Array([0.2, 0.5, 2]),
        trackLengths: new Uint32Array([1, 2, 3]),
        point3DIds: new BigUint64Array([101n, 102n, 103n]),
      }),
      colorMode: 'rgb',
      minTrackLength: 2,
      maxReprojectionError: 1.5,
      thinning: 0,
      selectedImagePointIds: new Set([102n]),
      showSelectionHighlight: true,
      highlightColor: [0.25, 0.5, 0.75],
      floorColorMode: 'off',
      pointDistances: null,
      distanceThreshold: 0,
    });

    expect(Array.from(result?.positions ?? [])).toEqual([3, 4, 5]);
    expect(Array.from(result?.selectedPositions ?? [])).toEqual([3, 4, 5]);
    expect(Array.from(result?.selectedColors ?? [])).toEqual([0.25, 0.5, 0.75]);
    expect(result?.indexToPoint3DId.get(0)).toBe(102n);
  });

  it('returns empty data when filters remove every point', () => {
    const result = computeSlowPathWasm({
      wasmReconstruction: buildWasmReconstructionWrapper({
        positions: new Float32Array([0, 0, 0]),
        errors: new Float32Array([5]),
        trackLengths: new Uint32Array([1]),
      }),
      colorMode: 'rgb',
      minTrackLength: 10,
      maxReprojectionError: 1,
      thinning: 0,
      selectedImagePointIds: new Set(),
      showSelectionHighlight: false,
      highlightColor: [1, 0, 0],
      floorColorMode: 'off',
      pointDistances: null,
      distanceThreshold: 0,
    });

    expect(result).toEqual({
      positions: null,
      colors: null,
      selectedPositions: null,
      selectedColors: null,
      indexToPoint3DId: new Map(),
    });
  });

  it('applies floor binary coloring to included WASM points', () => {
    const result = computeSlowPathWasm({
      wasmReconstruction: buildWasmReconstructionWrapper({
        positions: new Float32Array([
          0, 0, 0,
          1, 1, 1,
        ]),
        colors: new Float32Array(6),
        errors: new Float32Array([0, 1]),
        trackLengths: new Uint32Array([1, 1]),
      }),
      colorMode: 'rgb',
      minTrackLength: 1,
      maxReprojectionError: 10,
      thinning: 0,
      selectedImagePointIds: new Set(),
      showSelectionHighlight: false,
      highlightColor: [1, 0, 0],
      floorColorMode: 'binary',
      pointDistances: new Float32Array([0.1, 0.4]),
      distanceThreshold: 0.2,
    });

    const colors = Array.from(result?.colors ?? []).map(value => Number(value.toFixed(1)));
    expect(colors).toEqual([
      0.2, 0.9, 0.2,
      0.9, 0.2, 0.2,
    ]);
    expect(result?.indexToPoint3DId.get(0)).toBe(1n);
    expect(result?.indexToPoint3DId.get(1)).toBe(2n);
  });
});
