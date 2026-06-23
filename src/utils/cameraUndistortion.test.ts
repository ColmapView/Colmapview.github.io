import { describe, it, expect } from 'vitest';
import { distortNormalized, undistortNormalized, type Vec2 } from './cameraUndistortion';
import { CameraModelId, type CameraIntrinsics } from '../types/colmap';

function intr(partial: Partial<CameraIntrinsics>): CameraIntrinsics {
  return {
    fx: 1, fy: 1, cx: 0, cy: 0,
    k1: 0, k2: 0, k3: 0, k4: 0, k5: 0, k6: 0,
    p1: 0, p2: 0, omega: 0, sx1: 0, sy1: 0,
    ...partial,
  };
}

/** Sample normalized points on a disc of the given radius. */
function disc(radius: number, rings = 5, spokes = 8): Vec2[] {
  const pts: Vec2[] = [{ x: 0, y: 0 }];
  for (let i = 1; i <= rings; i++) {
    const r = (radius * i) / rings;
    for (let j = 0; j < spokes; j++) {
      const a = (2 * Math.PI * j) / spokes;
      pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
    }
  }
  return pts;
}

function maxRoundTripError(modelId: CameraModelId, intrins: CameraIntrinsics, pts: Vec2[]): number {
  let max = 0;
  for (const u of pts) {
    const d = distortNormalized(u, intrins, modelId);
    const back = undistortNormalized(d, intrins, modelId);
    expect(back.valid).toBe(true);
    max = Math.max(max, Math.hypot(back.x - u.x, back.y - u.y));
  }
  return max;
}

describe('perspective forward distortion', () => {
  it('PINHOLE is identity', () => {
    const d = distortNormalized({ x: 0.3, y: -0.2 }, intr({}), CameraModelId.PINHOLE);
    expect(d.x).toBeCloseTo(0.3, 12);
    expect(d.y).toBeCloseTo(-0.2, 12);
  });

  it('OPENCV applies the standard radial+tangential formula', () => {
    const i = intr({ k1: -0.2, k2: 0.05, p1: 1e-3, p2: -2e-3 });
    const x = 0.4, y = 0.3;
    const r2 = x * x + y * y;
    const radial = i.k1 * r2 + i.k2 * r2 * r2;
    const dx = x * radial + 2 * i.p1 * x * y + i.p2 * (r2 + 2 * x * x);
    const dy = y * radial + i.p1 * (r2 + 2 * y * y) + 2 * i.p2 * x * y;
    const d = distortNormalized({ x, y }, i, CameraModelId.OPENCV);
    expect(d.x).toBeCloseTo(x + dx, 12);
    expect(d.y).toBeCloseTo(y + dy, 12);
  });
});

describe('Newton inverse recovers undistorted points (the accuracy fix)', () => {
  it('SIMPLE_RADIAL round-trips', () => {
    expect(maxRoundTripError(CameraModelId.SIMPLE_RADIAL, intr({ k1: -0.15 }), disc(0.8))).toBeLessThan(1e-9);
  });

  it('RADIAL round-trips', () => {
    expect(maxRoundTripError(CameraModelId.RADIAL, intr({ k1: -0.2, k2: 0.04 }), disc(0.8))).toBeLessThan(1e-9);
  });

  it('OPENCV round-trips for mild distortion', () => {
    const i = intr({ k1: -0.1, k2: 0.01, p1: 5e-4, p2: -5e-4 });
    expect(maxRoundTripError(CameraModelId.OPENCV, i, disc(0.9))).toBeLessThan(1e-9);
  });

  it('OPENCV round-trips for STRONG distortion where naive fixed-point fails', () => {
    // Agent-3's "strong but convergent" lens: plain 10-iter fixed-point left ~0.27px
    // error here; Newton must drive it to ~0.
    const i = intr({ k1: -0.45, k2: 0.18, p1: 1e-3, p2: 1e-3 });
    expect(maxRoundTripError(CameraModelId.OPENCV, i, disc(0.9))).toBeLessThan(1e-7);
  });

  it('FULL_OPENCV (rational) round-trips', () => {
    const i = intr({ k1: -0.3, k2: 0.1, k3: -0.02, k4: 0.05, k5: -0.01, k6: 0.002, p1: 5e-4, p2: -5e-4 });
    expect(maxRoundTripError(CameraModelId.FULL_OPENCV, i, disc(0.8))).toBeLessThan(1e-7);
  });
});

describe('FOV model uses the exact closed-form inverse', () => {
  it('round-trips to machine precision', () => {
    expect(maxRoundTripError(CameraModelId.FOV, intr({ omega: 0.9 }), disc(0.7))).toBeLessThan(1e-9);
  });
});

describe('FOV omega=0 degenerate guard (F13)', () => {
  it('forward distortion is identity (no NaN) when omega is 0', () => {
    const d = distortNormalized({ x: 0.3, y: -0.2 }, intr({ omega: 0 }), CameraModelId.FOV);
    expect(Number.isNaN(d.x)).toBe(false);
    expect(d.x).toBeCloseTo(0.3, 12);
    expect(d.y).toBeCloseTo(-0.2, 12);
  });

  it('inverse is identity and valid (no NaN) when omega is 0', () => {
    const u = undistortNormalized({ x: 0.3, y: -0.2 }, intr({ omega: 0 }), CameraModelId.FOV);
    expect(u.valid).toBe(true);
    expect(Number.isNaN(u.x)).toBe(false);
    expect(u.x).toBeCloseTo(0.3, 12);
    expect(u.y).toBeCloseTo(-0.2, 12);
  });
});

describe('perspective Newton rejects non-physical roots (F14)', () => {
  it('flags a distorted point with no valid pre-image (folded barrel map) as invalid', () => {
    // k1=-0.6 folds the forward map; its max distorted radius is ~0.497, so a
    // distorted radius of 0.65 has no real inverse. Newton would otherwise return
    // a wrong root with valid=true.
    const result = undistortNormalized({ x: 0.65, y: 0 }, intr({ k1: -0.6 }), CameraModelId.SIMPLE_RADIAL);
    expect(result.valid).toBe(false);
  });

  it('does not false-negative in-range points under strong barrel distortion', () => {
    const i = intr({ k1: -0.45, k2: 0.18, p1: 1e-3, p2: 1e-3 });
    for (const u of disc(0.9)) {
      const d = distortNormalized(u, i, CameraModelId.OPENCV);
      expect(undistortNormalized(d, i, CameraModelId.OPENCV).valid).toBe(true);
    }
  });
});

describe('fisheye forward + inverse', () => {
  it('equidistant fisheye (k=0) maps perspective radius tan(theta) to angle theta', () => {
    const theta = 1.0; // radians (~57 deg)
    const d = distortNormalized({ x: Math.tan(theta), y: 0 }, intr({}), CameraModelId.OPENCV_FISHEYE);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(theta, 9);
  });

  it('OPENCV_FISHEYE round-trips within the valid FOV', () => {
    const i = intr({ k1: -0.02, k2: 0.003, k3: -1e-4, k4: 1e-5 });
    // perspective points whose angle theta = atan(r) stays well below 90 deg
    const pts = disc(Math.tan((75 * Math.PI) / 180)); // up to ~75 deg
    expect(maxRoundTripError(CameraModelId.OPENCV_FISHEYE, i, pts)).toBeLessThan(1e-6);
  });

  it('RADIAL_FISHEYE and SIMPLE_RADIAL_FISHEYE round-trip', () => {
    const pts = disc(Math.tan((70 * Math.PI) / 180));
    expect(maxRoundTripError(CameraModelId.RADIAL_FISHEYE, intr({ k1: -0.03, k2: 0.004 }), pts)).toBeLessThan(1e-6);
    expect(maxRoundTripError(CameraModelId.SIMPLE_RADIAL_FISHEYE, intr({ k1: -0.03 }), pts)).toBeLessThan(1e-6);
  });

  it('THIN_PRISM_FISHEYE round-trips', () => {
    const i = intr({ k1: -0.02, k2: 0.003, k3: -1e-4, k4: 1e-5, p1: 5e-4, p2: -5e-4, sx1: 3e-4, sy1: -3e-4 });
    const pts = disc(Math.tan((65 * Math.PI) / 180));
    expect(maxRoundTripError(CameraModelId.THIN_PRISM_FISHEYE, i, pts)).toBeLessThan(1e-5);
  });
});

describe('fisheye >= 90 deg guard (the nonsense fix)', () => {
  it('marks rays at theta >= 90 deg invalid instead of flipping sign', () => {
    // equidistant fisheye: distorted normalized radius == theta (radians)
    const i = intr({});
    // theta ~= 103 deg > 90 deg -> cannot map onto a flat pinhole plane
    const beyond = undistortNormalized({ x: 1.8, y: 0 }, i, CameraModelId.OPENCV_FISHEYE);
    expect(beyond.valid).toBe(false);
  });

  it('still recovers rays just inside 90 deg with the correct tan(theta) radius', () => {
    const i = intr({});
    const theta = 1.0; // ~57 deg, well inside
    const inside = undistortNormalized({ x: theta, y: 0 }, i, CameraModelId.OPENCV_FISHEYE);
    expect(inside.valid).toBe(true);
    expect(inside.x).toBeCloseTo(Math.tan(theta), 6); // pinhole-normalized radius
    expect(inside.y).toBeCloseTo(0, 9);
  });
});
