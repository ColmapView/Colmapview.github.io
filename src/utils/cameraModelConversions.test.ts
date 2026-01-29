import { describe, it, expect } from 'vitest';
import {
  canConvertModel,
  convertCameraModel,
  validateConversion,
  createConvertedCamera,
  getValidTargetModels,
  getConversionPreview,
  ConversionResult,
  PARAM_NAMES,
} from './cameraModelConversions';
import { Camera, CameraModelId } from '../types/colmap';

// Helper to create test cameras
function makeCamera(
  modelId: CameraModelId,
  params: number[],
  width = 1920,
  height = 1080
): Camera {
  return {
    cameraId: 1,
    modelId,
    width,
    height,
    params,
  };
}

describe('canConvertModel', () => {
  describe('same model', () => {
    it('returns exact for same model', () => {
      expect(canConvertModel(CameraModelId.OPENCV, CameraModelId.OPENCV)).toBe('exact');
      expect(canConvertModel(CameraModelId.SIMPLE_PINHOLE, CameraModelId.SIMPLE_PINHOLE)).toBe('exact');
    });
  });

  describe('perspective family expansions', () => {
    it('returns exact for SIMPLE_PINHOLE -> PINHOLE', () => {
      expect(canConvertModel(CameraModelId.SIMPLE_PINHOLE, CameraModelId.PINHOLE)).toBe('exact');
    });

    it('returns exact for SIMPLE_RADIAL -> RADIAL', () => {
      expect(canConvertModel(CameraModelId.SIMPLE_RADIAL, CameraModelId.RADIAL)).toBe('exact');
    });

    it('returns exact for RADIAL -> OPENCV', () => {
      expect(canConvertModel(CameraModelId.RADIAL, CameraModelId.OPENCV)).toBe('exact');
    });

    it('returns exact for SIMPLE_PINHOLE -> OPENCV (multi-step)', () => {
      expect(canConvertModel(CameraModelId.SIMPLE_PINHOLE, CameraModelId.OPENCV)).toBe('exact');
    });
  });

  describe('perspective family reductions', () => {
    it('returns approximate for RADIAL -> SIMPLE_RADIAL', () => {
      expect(canConvertModel(CameraModelId.RADIAL, CameraModelId.SIMPLE_RADIAL)).toBe('approximate');
    });

    it('returns approximate for OPENCV -> RADIAL', () => {
      expect(canConvertModel(CameraModelId.OPENCV, CameraModelId.RADIAL)).toBe('approximate');
    });
  });

  describe('fisheye family expansions', () => {
    it('returns exact for SIMPLE_RADIAL_FISHEYE -> RADIAL_FISHEYE', () => {
      expect(canConvertModel(CameraModelId.SIMPLE_RADIAL_FISHEYE, CameraModelId.RADIAL_FISHEYE)).toBe('exact');
    });

    it('returns exact for RADIAL_FISHEYE -> OPENCV_FISHEYE', () => {
      expect(canConvertModel(CameraModelId.RADIAL_FISHEYE, CameraModelId.OPENCV_FISHEYE)).toBe('exact');
    });

    it('returns exact for OPENCV_FISHEYE -> THIN_PRISM_FISHEYE', () => {
      expect(canConvertModel(CameraModelId.OPENCV_FISHEYE, CameraModelId.THIN_PRISM_FISHEYE)).toBe('exact');
    });
  });

  describe('fisheye family reductions', () => {
    it('returns approximate for OPENCV_FISHEYE -> RADIAL_FISHEYE', () => {
      expect(canConvertModel(CameraModelId.OPENCV_FISHEYE, CameraModelId.RADIAL_FISHEYE)).toBe('approximate');
    });

    it('returns approximate for THIN_PRISM_FISHEYE -> OPENCV_FISHEYE', () => {
      expect(canConvertModel(CameraModelId.THIN_PRISM_FISHEYE, CameraModelId.OPENCV_FISHEYE)).toBe('approximate');
    });
  });

  describe('FULL_OPENCV incompatibilities', () => {
    it('returns approximate for OPENCV -> FULL_OPENCV', () => {
      expect(canConvertModel(CameraModelId.OPENCV, CameraModelId.FULL_OPENCV)).toBe('approximate');
    });

    it('returns incompatible for FULL_OPENCV -> any other', () => {
      expect(canConvertModel(CameraModelId.FULL_OPENCV, CameraModelId.OPENCV)).toBe('incompatible');
      expect(canConvertModel(CameraModelId.FULL_OPENCV, CameraModelId.RADIAL)).toBe('incompatible');
    });

    it('returns approximate for perspective pinhole/radial -> FULL_OPENCV', () => {
      // All perspective pinhole/radial models can be converted to FULL_OPENCV (approximate)
      expect(canConvertModel(CameraModelId.SIMPLE_PINHOLE, CameraModelId.FULL_OPENCV)).toBe('approximate');
      expect(canConvertModel(CameraModelId.PINHOLE, CameraModelId.FULL_OPENCV)).toBe('approximate');
      expect(canConvertModel(CameraModelId.SIMPLE_RADIAL, CameraModelId.FULL_OPENCV)).toBe('approximate');
      expect(canConvertModel(CameraModelId.RADIAL, CameraModelId.FULL_OPENCV)).toBe('approximate');
    });

    it('returns incompatible for FOV -> FULL_OPENCV', () => {
      expect(canConvertModel(CameraModelId.FOV, CameraModelId.FULL_OPENCV)).toBe('incompatible');
    });
  });

  describe('cross-family incompatibilities', () => {
    it('returns incompatible for perspective -> fisheye', () => {
      expect(canConvertModel(CameraModelId.OPENCV, CameraModelId.OPENCV_FISHEYE)).toBe('incompatible');
      expect(canConvertModel(CameraModelId.RADIAL, CameraModelId.RADIAL_FISHEYE)).toBe('incompatible');
    });

    it('returns incompatible for fisheye -> perspective', () => {
      expect(canConvertModel(CameraModelId.OPENCV_FISHEYE, CameraModelId.OPENCV)).toBe('incompatible');
      expect(canConvertModel(CameraModelId.RADIAL_FISHEYE, CameraModelId.RADIAL)).toBe('incompatible');
    });
  });

  describe('FOV model conversions', () => {
    it('returns approximate for FOV <-> polynomial models', () => {
      expect(canConvertModel(CameraModelId.FOV, CameraModelId.RADIAL)).toBe('approximate');
      expect(canConvertModel(CameraModelId.FOV, CameraModelId.SIMPLE_RADIAL)).toBe('approximate');
      expect(canConvertModel(CameraModelId.SIMPLE_RADIAL, CameraModelId.FOV)).toBe('approximate');
      expect(canConvertModel(CameraModelId.RADIAL, CameraModelId.FOV)).toBe('approximate');
    });

    it('returns incompatible for FOV -> OPENCV', () => {
      expect(canConvertModel(CameraModelId.FOV, CameraModelId.OPENCV)).toBe('incompatible');
    });
  });
});

describe('convertCameraModel', () => {
  describe('exact expansions', () => {
    it('converts SIMPLE_PINHOLE -> PINHOLE', () => {
      const camera = makeCamera(CameraModelId.SIMPLE_PINHOLE, [1000, 960, 540]);
      const result = convertCameraModel(camera, CameraModelId.PINHOLE);

      expect(result.type).toBe('exact');
      expect(result.params).toEqual([1000, 1000, 960, 540]);
    });

    it('converts SIMPLE_RADIAL -> RADIAL', () => {
      const camera = makeCamera(CameraModelId.SIMPLE_RADIAL, [1000, 960, 540, 0.1]);
      const result = convertCameraModel(camera, CameraModelId.RADIAL);

      expect(result.type).toBe('exact');
      expect(result.params).toEqual([1000, 960, 540, 0.1, 0]);
    });

    it('converts RADIAL -> OPENCV', () => {
      const camera = makeCamera(CameraModelId.RADIAL, [1000, 960, 540, 0.1, 0.05]);
      const result = convertCameraModel(camera, CameraModelId.OPENCV);

      expect(result.type).toBe('exact');
      expect(result.params).toEqual([1000, 1000, 960, 540, 0.1, 0.05, 0, 0]);
    });

    it('converts SIMPLE_RADIAL_FISHEYE -> OPENCV_FISHEYE', () => {
      const camera = makeCamera(CameraModelId.SIMPLE_RADIAL_FISHEYE, [1000, 960, 540, 0.1]);
      const result = convertCameraModel(camera, CameraModelId.OPENCV_FISHEYE);

      expect(result.type).toBe('exact');
      expect(result.params).toEqual([1000, 1000, 960, 540, 0.1, 0, 0, 0]);
    });
  });

  describe('OPENCV_FISHEYE -> THIN_PRISM_FISHEYE index remapping', () => {
    it('correctly remaps k3, k4 indices', () => {
      const camera = makeCamera(CameraModelId.OPENCV_FISHEYE, [
        1000, 1000, 960, 540, // fx, fy, cx, cy
        0.1, 0.05,           // k1, k2
        0.01, 0.005,         // k3, k4 at indices 6-7
      ]);
      const result = convertCameraModel(camera, CameraModelId.THIN_PRISM_FISHEYE);

      expect(result.type).toBe('exact');
      // THIN_PRISM_FISHEYE: k1,k2 at 4-5, p1,p2 at 6-7, k3,k4 at 8-9, sx1,sy1 at 10-11
      expect(result.params).toEqual([
        1000, 1000, 960, 540, // fx, fy, cx, cy
        0.1, 0.05,           // k1, k2
        0, 0,                // p1, p2 (new)
        0.01, 0.005,         // k3, k4 moved to indices 8-9
        0, 0,                // sx1, sy1 (new)
      ]);
    });
  });

  describe('THIN_PRISM_FISHEYE -> OPENCV_FISHEYE index remapping', () => {
    it('correctly extracts k3, k4 from shifted indices', () => {
      const camera = makeCamera(CameraModelId.THIN_PRISM_FISHEYE, [
        1000, 1000, 960, 540, // fx, fy, cx, cy
        0.1, 0.05,           // k1, k2
        0, 0,                // p1, p2 (negligible)
        0.01, 0.005,         // k3, k4 at indices 8-9
        0, 0,                // sx1, sy1 (negligible)
      ]);
      const result = convertCameraModel(camera, CameraModelId.OPENCV_FISHEYE);

      expect(result.type).toBe('exact');
      expect(result.params).toEqual([
        1000, 1000, 960, 540, // fx, fy, cx, cy
        0.1, 0.05,           // k1, k2
        0.01, 0.005,         // k3, k4 moved back to indices 6-7
      ]);
    });

    it('returns approximate when tangential params are non-negligible', () => {
      const camera = makeCamera(CameraModelId.THIN_PRISM_FISHEYE, [
        1000, 1000, 960, 540,
        0.1, 0.05,
        0.001, 0.002, // p1, p2 non-negligible
        0.01, 0.005,
        0, 0,
      ]);
      const result = convertCameraModel(camera, CameraModelId.OPENCV_FISHEYE);

      expect(result.type).toBe('approximate');
      if (result.type === 'approximate') {
        expect(result.warning).toContain('tangential');
      }
    });
  });

  describe('reductions with threshold checks', () => {
    it('converts RADIAL -> SIMPLE_RADIAL exactly when k2 is negligible', () => {
      const camera = makeCamera(CameraModelId.RADIAL, [1000, 960, 540, 0.1, 1e-8]);
      const result = convertCameraModel(camera, CameraModelId.SIMPLE_RADIAL);

      expect(result.type).toBe('exact');
      expect(result.params).toEqual([1000, 960, 540, 0.1]);
    });

    it('converts RADIAL -> SIMPLE_RADIAL approximately when k2 is significant', () => {
      const camera = makeCamera(CameraModelId.RADIAL, [1000, 960, 540, 0.1, 0.05]);
      const result = convertCameraModel(camera, CameraModelId.SIMPLE_RADIAL);

      expect(result.type).toBe('approximate');
      if (result.type === 'approximate') {
        expect(result.warning).toContain('k2');
        expect(result.maxError).toBeGreaterThan(0);
      }
    });

    it('converts OPENCV -> RADIAL exactly when tangential params are negligible', () => {
      const camera = makeCamera(CameraModelId.OPENCV, [1000, 1000, 960, 540, 0.1, 0.05, 1e-8, 1e-8]);
      const result = convertCameraModel(camera, CameraModelId.RADIAL);

      expect(result.type).toBe('exact');
      expect(result.params).toEqual([1000, 960, 540, 0.1, 0.05]);
    });

    it('converts OPENCV -> RADIAL approximately when tangential params are significant', () => {
      const camera = makeCamera(CameraModelId.OPENCV, [1000, 1000, 960, 540, 0.1, 0.05, 0.01, 0.01]);
      const result = convertCameraModel(camera, CameraModelId.RADIAL);

      expect(result.type).toBe('approximate');
      if (result.type === 'approximate') {
        expect(result.warning).toContain('tangential');
      }
    });

    it('uses mean focal length when fx != fy', () => {
      const camera = makeCamera(CameraModelId.OPENCV, [1000, 1100, 960, 540, 0.1, 0.05, 0, 0]);
      const result = convertCameraModel(camera, CameraModelId.RADIAL);

      expect(result.type).toBe('approximate');
      if (result.type === 'approximate') {
        expect(result.warning).toContain('Using mean');
        expect(result.warning).toContain('fx=1000');
        expect(result.warning).toContain('fy=1100');
        // Mean should be 1050
        expect(result.params[0]).toBeCloseTo(1050, 2);
      }
    });
  });

  describe('OPENCV -> FULL_OPENCV approximate conversion', () => {
    it('marks as approximate with formula warning', () => {
      const camera = makeCamera(CameraModelId.OPENCV, [1000, 1000, 960, 540, 0.1, 0.05, 0.01, 0.01]);
      const result = convertCameraModel(camera, CameraModelId.FULL_OPENCV);

      expect(result.type).toBe('approximate');
      if (result.type === 'approximate') {
        expect(result.warning).toContain('rational polynomial');
        expect(result.params).toEqual([1000, 1000, 960, 540, 0.1, 0.05, 0.01, 0.01, 0, 0, 0, 0]);
      }
    });
  });

  describe('incompatible conversions', () => {
    it('rejects FULL_OPENCV -> OPENCV', () => {
      const camera = makeCamera(CameraModelId.FULL_OPENCV, [
        1000, 1000, 960, 540, 0.1, 0.05, 0.01, 0.01, 0, 0, 0, 0,
      ]);
      const result = convertCameraModel(camera, CameraModelId.OPENCV);

      expect(result.type).toBe('incompatible');
      if (result.type === 'incompatible') {
        expect(result.reason).toContain('FULL_OPENCV');
      }
    });

    it('rejects cross-family conversion', () => {
      const camera = makeCamera(CameraModelId.OPENCV, [1000, 1000, 960, 540, 0.1, 0.05, 0, 0]);
      const result = convertCameraModel(camera, CameraModelId.OPENCV_FISHEYE);

      expect(result.type).toBe('incompatible');
      if (result.type === 'incompatible') {
        expect(result.reason).toContain('perspective');
        expect(result.reason).toContain('fisheye');
      }
    });
  });

  describe('FOV model conversions', () => {
    it('converts FOV -> RADIAL with Taylor approximation', () => {
      const omega = 0.1; // Small omega for good approximation
      const camera = makeCamera(CameraModelId.FOV, [1000, 1000, 960, 540, omega]);
      const result = convertCameraModel(camera, CameraModelId.RADIAL);

      expect(result.type).toBe('approximate');
      if (result.type === 'approximate') {
        // k1 ≈ omega² / 3
        const expectedK1 = (omega * omega) / 3;
        expect(result.params[3]).toBeCloseTo(expectedK1, 6);
        expect(result.params[4]).toBe(0); // k2 = 0
        expect(result.warning).toContain('Taylor');
      }
    });

    it('converts SIMPLE_RADIAL -> FOV with positive k', () => {
      const k = 0.01;
      const camera = makeCamera(CameraModelId.SIMPLE_RADIAL, [1000, 960, 540, k]);
      const result = convertCameraModel(camera, CameraModelId.FOV);

      expect(result.type).toBe('approximate');
      if (result.type === 'approximate') {
        // omega ≈ sqrt(3 * k1)
        const expectedOmega = Math.sqrt(3 * k);
        expect(result.params[4]).toBeCloseTo(expectedOmega, 6);
      }
    });

    it('rejects SIMPLE_RADIAL -> FOV with negative k', () => {
      const camera = makeCamera(CameraModelId.SIMPLE_RADIAL, [1000, 960, 540, -0.1]);
      const result = convertCameraModel(camera, CameraModelId.FOV);

      expect(result.type).toBe('incompatible');
      if (result.type === 'incompatible') {
        expect(result.reason).toContain('positive');
      }
    });
  });
});

describe('validateConversion', () => {
  it('returns low error for exact pinhole conversions', () => {
    const src = makeCamera(CameraModelId.SIMPLE_PINHOLE, [1000, 960, 540]);
    const dst = makeCamera(CameraModelId.PINHOLE, [1000, 1000, 960, 540]);

    const result = validateConversion(src, dst);

    expect(result.maxError).toBeLessThan(1e-10);
    expect(result.avgError).toBeLessThan(1e-10);
    expect(result.sampleCount).toBeGreaterThan(0);
  });

  it('returns low error for exact radial expansions without distortion', () => {
    const src = makeCamera(CameraModelId.SIMPLE_RADIAL, [1000, 960, 540, 0]);
    const dst = makeCamera(CameraModelId.OPENCV, [1000, 1000, 960, 540, 0, 0, 0, 0]);

    const result = validateConversion(src, dst);

    // Without distortion, projection/unprojection is just linear
    expect(result.maxError).toBeLessThan(1e-10);
  });

  describe('with distortion', () => {
    it('returns low error for exact radial expansion with distortion', () => {
      // SIMPLE_RADIAL -> OPENCV should be exact (same distortion formula)
      const src = makeCamera(CameraModelId.SIMPLE_RADIAL, [1000, 960, 540, 0.1]);
      const dst = makeCamera(CameraModelId.OPENCV, [1000, 1000, 960, 540, 0.1, 0, 0, 0]);

      const result = validateConversion(src, dst, 20);

      // Should be exact - same distortion formula
      expect(result.maxError).toBeLessThan(1e-6);
    });

    it('returns low error for RADIAL -> OPENCV with distortion', () => {
      const src = makeCamera(CameraModelId.RADIAL, [1000, 960, 540, 0.1, 0.05]);
      const dst = makeCamera(CameraModelId.OPENCV, [1000, 1000, 960, 540, 0.1, 0.05, 0, 0]);

      const result = validateConversion(src, dst, 20);

      expect(result.maxError).toBeLessThan(1e-6);
    });

    it('reports measurable error when tangential distortion is dropped', () => {
      // OPENCV with tangential vs RADIAL without
      const src = makeCamera(CameraModelId.OPENCV, [1000, 1000, 960, 540, 0.1, 0.05, 0.01, 0.02]);
      const dst = makeCamera(CameraModelId.RADIAL, [1000, 960, 540, 0.1, 0.05]);

      const result = validateConversion(src, dst, 20);

      // Should have measurable error due to dropped tangential
      expect(result.maxError).toBeGreaterThan(0.1);
    });

    it('returns low error for fisheye expansion with distortion', () => {
      const src = makeCamera(CameraModelId.SIMPLE_RADIAL_FISHEYE, [1000, 960, 540, 0.1]);
      const dst = makeCamera(CameraModelId.OPENCV_FISHEYE, [1000, 1000, 960, 540, 0.1, 0, 0, 0]);

      const result = validateConversion(src, dst, 20);

      expect(result.maxError).toBeLessThan(1e-6);
    });

    it('reports measurable error when k2 is dropped for fisheye', () => {
      const src = makeCamera(CameraModelId.RADIAL_FISHEYE, [1000, 960, 540, 0.1, 0.05]);
      const dst = makeCamera(CameraModelId.SIMPLE_RADIAL_FISHEYE, [1000, 960, 540, 0.1]);

      const result = validateConversion(src, dst, 20);

      // Should have measurable error due to dropped k2
      expect(result.maxError).toBeGreaterThan(0.01);
    });
  });
});

describe('round-trip parameter conversions', () => {
  it('SIMPLE_RADIAL -> RADIAL -> SIMPLE_RADIAL preserves params when k2=0', () => {
    const original = makeCamera(CameraModelId.SIMPLE_RADIAL, [1000, 960, 540, 0.1]);

    // Expand: SIMPLE_RADIAL -> RADIAL
    const expanded = convertCameraModel(original, CameraModelId.RADIAL);
    expect(expanded.type).toBe('exact');
    expect(expanded.params).toEqual([1000, 960, 540, 0.1, 0]);

    // Reduce: RADIAL -> SIMPLE_RADIAL (k2=0, so exact)
    const expandedCam = makeCamera(CameraModelId.RADIAL, expanded.params);
    const reduced = convertCameraModel(expandedCam, CameraModelId.SIMPLE_RADIAL);
    expect(reduced.type).toBe('exact');
    expect(reduced.params).toEqual(original.params);
  });

  it('RADIAL -> OPENCV -> RADIAL preserves params when tangential=0', () => {
    const original = makeCamera(CameraModelId.RADIAL, [1000, 960, 540, 0.1, 0.05]);

    // Expand: RADIAL -> OPENCV
    const expanded = convertCameraModel(original, CameraModelId.OPENCV);
    expect(expanded.type).toBe('exact');
    expect(expanded.params).toEqual([1000, 1000, 960, 540, 0.1, 0.05, 0, 0]);

    // Reduce: OPENCV -> RADIAL (p1=p2=0, so exact)
    const expandedCam = makeCamera(CameraModelId.OPENCV, expanded.params);
    const reduced = convertCameraModel(expandedCam, CameraModelId.RADIAL);
    expect(reduced.type).toBe('exact');
    expect(reduced.params).toEqual(original.params);
  });

  it('SIMPLE_PINHOLE -> OPENCV -> RADIAL -> SIMPLE_RADIAL preserves focal length', () => {
    const original = makeCamera(CameraModelId.SIMPLE_PINHOLE, [1000, 960, 540]);

    // Chain: SIMPLE_PINHOLE -> OPENCV
    const toOpencv = convertCameraModel(original, CameraModelId.OPENCV);
    expect(toOpencv.type).toBe('exact');

    // OPENCV -> RADIAL
    const opencvCam = makeCamera(CameraModelId.OPENCV, toOpencv.params);
    const toRadial = convertCameraModel(opencvCam, CameraModelId.RADIAL);
    expect(toRadial.type).toBe('exact');

    // RADIAL -> SIMPLE_RADIAL
    const radialCam = makeCamera(CameraModelId.RADIAL, toRadial.params);
    const toSimpleRadial = convertCameraModel(radialCam, CameraModelId.SIMPLE_RADIAL);
    expect(toSimpleRadial.type).toBe('exact');

    // Should preserve original intrinsics with k=0
    expect(toSimpleRadial.params).toEqual([1000, 960, 540, 0]);
  });

  it('SIMPLE_RADIAL_FISHEYE -> RADIAL_FISHEYE -> SIMPLE_RADIAL_FISHEYE preserves params when k2=0', () => {
    const original = makeCamera(CameraModelId.SIMPLE_RADIAL_FISHEYE, [1000, 960, 540, 0.1]);

    // Expand
    const expanded = convertCameraModel(original, CameraModelId.RADIAL_FISHEYE);
    expect(expanded.type).toBe('exact');
    expect(expanded.params).toEqual([1000, 960, 540, 0.1, 0]);

    // Reduce
    const expandedCam = makeCamera(CameraModelId.RADIAL_FISHEYE, expanded.params);
    const reduced = convertCameraModel(expandedCam, CameraModelId.SIMPLE_RADIAL_FISHEYE);
    expect(reduced.type).toBe('exact');
    expect(reduced.params).toEqual(original.params);
  });

  it('OPENCV_FISHEYE -> THIN_PRISM_FISHEYE -> OPENCV_FISHEYE preserves params when extra=0', () => {
    const originalParams = [1000, 1000, 960, 540, 0.1, 0.05, 0.01, 0.005];
    const original = makeCamera(CameraModelId.OPENCV_FISHEYE, originalParams);

    // Expand with index remapping
    const expanded = convertCameraModel(original, CameraModelId.THIN_PRISM_FISHEYE);
    expect(expanded.type).toBe('exact');
    // Verify k3,k4 moved to indices 8-9
    expect(expanded.params[8]).toBe(0.01);
    expect(expanded.params[9]).toBe(0.005);
    // Verify p1,p2,sx1,sy1 are zero
    expect(expanded.params[6]).toBe(0);
    expect(expanded.params[7]).toBe(0);
    expect(expanded.params[10]).toBe(0);
    expect(expanded.params[11]).toBe(0);

    // Reduce - should get original back
    const expandedCam = makeCamera(CameraModelId.THIN_PRISM_FISHEYE, expanded.params);
    const reduced = convertCameraModel(expandedCam, CameraModelId.OPENCV_FISHEYE);
    expect(reduced.type).toBe('exact');
    expect(reduced.params).toEqual(originalParams);
  });

  it('RADIAL_FISHEYE -> OPENCV_FISHEYE -> RADIAL_FISHEYE preserves params when k3=k4=0', () => {
    const original = makeCamera(CameraModelId.RADIAL_FISHEYE, [1000, 960, 540, 0.1, 0.05]);

    // Expand
    const expanded = convertCameraModel(original, CameraModelId.OPENCV_FISHEYE);
    expect(expanded.type).toBe('exact');
    expect(expanded.params).toEqual([1000, 1000, 960, 540, 0.1, 0.05, 0, 0]);

    // Reduce
    const expandedCam = makeCamera(CameraModelId.OPENCV_FISHEYE, expanded.params);
    const reduced = convertCameraModel(expandedCam, CameraModelId.RADIAL_FISHEYE);
    expect(reduced.type).toBe('exact');
    expect(reduced.params).toEqual(original.params);
  });

  it('round-trip validates with low reprojection error', () => {
    // Test that after round-trip, reprojection error is minimal
    const original = makeCamera(CameraModelId.SIMPLE_RADIAL, [1000, 960, 540, 0.1]);

    // Expand and reduce
    const expanded = convertCameraModel(original, CameraModelId.OPENCV);
    const expandedCam = makeCamera(CameraModelId.OPENCV, expanded.params);
    const reduced = convertCameraModel(expandedCam, CameraModelId.SIMPLE_RADIAL);
    const roundTripped = makeCamera(CameraModelId.SIMPLE_RADIAL, reduced.params);

    // Validate reprojection between original and round-tripped
    // Tolerance accounts for numeric precision in iterative undistortion
    const result = validateConversion(original, roundTripped, 20);
    expect(result.maxError).toBeLessThan(1e-6);
  });
});

describe('createConvertedCamera', () => {
  it('returns new camera object for valid conversion', () => {
    const src = makeCamera(CameraModelId.SIMPLE_PINHOLE, [1000, 960, 540]);
    const converted = createConvertedCamera(src, CameraModelId.PINHOLE);

    expect(converted).not.toBeNull();
    expect(converted!.modelId).toBe(CameraModelId.PINHOLE);
    expect(converted!.params).toEqual([1000, 1000, 960, 540]);
    expect(converted!.width).toBe(src.width);
    expect(converted!.height).toBe(src.height);
    expect(converted!.cameraId).toBe(src.cameraId);
  });

  it('returns null for incompatible conversion', () => {
    const src = makeCamera(CameraModelId.OPENCV, [1000, 1000, 960, 540, 0.1, 0.05, 0, 0]);
    const converted = createConvertedCamera(src, CameraModelId.OPENCV_FISHEYE);

    expect(converted).toBeNull();
  });
});

describe('getValidTargetModels', () => {
  it('returns correct targets for SIMPLE_PINHOLE', () => {
    const targets = getValidTargetModels(CameraModelId.SIMPLE_PINHOLE);

    const exactTargets = targets.filter((t) => t.compatibility === 'exact');
    const approxTargets = targets.filter((t) => t.compatibility === 'approximate');

    // Exact: PINHOLE, SIMPLE_RADIAL, RADIAL, OPENCV
    expect(exactTargets.map((t) => t.modelId)).toContain(CameraModelId.PINHOLE);
    expect(exactTargets.map((t) => t.modelId)).toContain(CameraModelId.RADIAL);
    expect(exactTargets.map((t) => t.modelId)).toContain(CameraModelId.OPENCV);

    // Approximate: FULL_OPENCV
    expect(approxTargets.map((t) => t.modelId)).toContain(CameraModelId.FULL_OPENCV);
  });

  it('returns correct targets for OPENCV_FISHEYE', () => {
    const targets = getValidTargetModels(CameraModelId.OPENCV_FISHEYE);

    const exactTargets = targets.filter((t) => t.compatibility === 'exact');
    const approxTargets = targets.filter((t) => t.compatibility === 'approximate');

    // Exact: THIN_PRISM_FISHEYE
    expect(exactTargets.map((t) => t.modelId)).toContain(CameraModelId.THIN_PRISM_FISHEYE);

    // Approximate: SIMPLE_RADIAL_FISHEYE, RADIAL_FISHEYE
    expect(approxTargets.map((t) => t.modelId)).toContain(CameraModelId.SIMPLE_RADIAL_FISHEYE);
    expect(approxTargets.map((t) => t.modelId)).toContain(CameraModelId.RADIAL_FISHEYE);

    // No perspective models
    const perspectiveModels = [
      CameraModelId.SIMPLE_PINHOLE,
      CameraModelId.PINHOLE,
      CameraModelId.SIMPLE_RADIAL,
      CameraModelId.RADIAL,
      CameraModelId.OPENCV,
      CameraModelId.FULL_OPENCV,
      CameraModelId.FOV,
    ];
    for (const model of perspectiveModels) {
      expect(targets.map((t) => t.modelId)).not.toContain(model);
    }
  });

  it('returns empty for FULL_OPENCV', () => {
    const targets = getValidTargetModels(CameraModelId.FULL_OPENCV);

    // FULL_OPENCV cannot be converted to anything
    expect(targets.length).toBe(0);
  });
});

describe('PARAM_NAMES', () => {
  it('has parameter names for all camera models', () => {
    const allModels = Object.values(CameraModelId).filter(
      (v): v is CameraModelId => typeof v === 'number'
    );

    for (const modelId of allModels) {
      expect(PARAM_NAMES[modelId]).toBeDefined();
      expect(PARAM_NAMES[modelId].length).toBeGreaterThan(0);
    }
  });
});

describe('getConversionPreview', () => {
  it('returns null for incompatible conversions', () => {
    const camera = makeCamera(CameraModelId.OPENCV, [500, 500, 320, 240, 0, 0, 0, 0]);
    const preview = getConversionPreview(camera, CameraModelId.OPENCV_FISHEYE);

    expect(preview).toBeNull();
  });

  it('returns expansion characterization for SIMPLE_PINHOLE -> OPENCV', () => {
    const camera = makeCamera(CameraModelId.SIMPLE_PINHOLE, [500, 320, 240]);
    const preview = getConversionPreview(camera, CameraModelId.OPENCV);

    expect(preview).not.toBeNull();
    expect(preview!.characterization).toBe('expansion');
    expect(preview!.isExpansion).toBe(true);
    expect(preview!.isLossy).toBe(false);
    expect(preview!.sourceParamNames).toEqual(['f', 'cx', 'cy']);
    expect(preview!.targetParamNames).toEqual(['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'p1', 'p2']);
    expect(preview!.targetParams).toEqual([500, 500, 320, 240, 0, 0, 0, 0]);
  });

  it('returns exact characterization for RADIAL -> SIMPLE_RADIAL when k2 is zero', () => {
    const camera = makeCamera(CameraModelId.RADIAL, [500, 320, 240, 0.1, 0]);
    const preview = getConversionPreview(camera, CameraModelId.SIMPLE_RADIAL);

    expect(preview).not.toBeNull();
    expect(preview!.characterization).toBe('exact');
    expect(preview!.isLossy).toBe(false);
    expect(preview!.targetParams).toEqual([500, 320, 240, 0.1]);
  });

  it('returns lossy characterization for RADIAL -> SIMPLE_RADIAL when k2 is non-zero', () => {
    const camera = makeCamera(CameraModelId.RADIAL, [500, 320, 240, 0.1, 0.05]);
    const preview = getConversionPreview(camera, CameraModelId.SIMPLE_RADIAL);

    expect(preview).not.toBeNull();
    expect(preview!.characterization).toBe('lossy');
    expect(preview!.isLossy).toBe(true);
    expect(preview!.description).toContain('k2');
  });

  it('returns approximation characterization for FOV -> SIMPLE_RADIAL', () => {
    const camera = makeCamera(CameraModelId.FOV, [500, 500, 320, 240, 0.5]);
    const preview = getConversionPreview(camera, CameraModelId.SIMPLE_RADIAL);

    expect(preview).not.toBeNull();
    expect(preview!.characterization).toBe('approximation');
    expect(preview!.isLossy).toBe(true);
    expect(preview!.warning).toContain('Taylor');
  });

  it('returns approximation characterization for OPENCV -> FULL_OPENCV', () => {
    const camera = makeCamera(CameraModelId.OPENCV, [500, 500, 320, 240, 0.1, 0.05, 0, 0]);
    const preview = getConversionPreview(camera, CameraModelId.FULL_OPENCV);

    expect(preview).not.toBeNull();
    expect(preview!.characterization).toBe('approximation');
    expect(preview!.isExpansion).toBe(true);
    expect(preview!.warning).toContain('rational polynomial');
  });

  it('includes correct source and target parameter names', () => {
    const camera = makeCamera(CameraModelId.PINHOLE, [500, 520, 320, 240]);
    const preview = getConversionPreview(camera, CameraModelId.OPENCV);

    expect(preview).not.toBeNull();
    expect(preview!.sourceParamNames).toEqual(['fx', 'fy', 'cx', 'cy']);
    expect(preview!.targetParamNames).toEqual(['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'p1', 'p2']);
  });
});
