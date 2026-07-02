import { describe, it, expect } from 'vitest';
import { distortNormalized, undistortNormalized, type Vec2 } from './cameraUndistortion';
import { CameraModelId, type CameraIntrinsics } from '../types/colmap';

function intr(partial: Partial<CameraIntrinsics>): CameraIntrinsics {
  return {
    fx: 1, fy: 1, cx: 0, cy: 0,
    k1: 0, k2: 0, k3: 0, k4: 0, k5: 0, k6: 0,
    p1: 0, p2: 0, omega: 0, sx1: 0, sy1: 0, sx2: 0, sy2: 0,
    alpha: 0, beta: 0, kDiv: 0,
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

// ── Characterization tests: parity guard for projectionClass strategy refactor ──
// These tests lock in the numeric behavior of the CURRENT implementation.
// They must be GREEN before the refactor and remain GREEN after.

describe('characterization: model 0 SIMPLE_PINHOLE – identity forward/inverse', () => {
  it('forward is identity at a non-origin point', () => {
    const d = distortNormalized({ x: 0.3, y: -0.2 }, intr({}), CameraModelId.SIMPLE_PINHOLE);
    expect(d.x).toBeCloseTo(0.3, 12);
    expect(d.y).toBeCloseTo(-0.2, 12);
  });
  it('round-trip is identity', () => {
    expect(maxRoundTripError(CameraModelId.SIMPLE_PINHOLE, intr({}), disc(0.8))).toBeLessThan(1e-12);
  });
});

describe('characterization: model 2 SIMPLE_RADIAL – forward spot-check (k1·r²)', () => {
  it('distorted x = x*(1+k1·r²), y=0 at (0.3,0)', () => {
    const i = intr({ k1: 0.1 });
    const d = distortNormalized({ x: 0.3, y: 0 }, i, CameraModelId.SIMPLE_RADIAL);
    const r2 = 0.3 * 0.3;
    expect(d.x).toBeCloseTo(0.3 * (1 + i.k1 * r2), 12);
    expect(d.y).toBeCloseTo(0, 12);
  });
  it('round-trip', () => {
    expect(maxRoundTripError(CameraModelId.SIMPLE_RADIAL, intr({ k1: 0.1 }), disc(0.5))).toBeLessThan(1e-9);
  });
});

describe('characterization: model 3 RADIAL – forward spot-check (k1·r²+k2·r⁴)', () => {
  it('distorted x = x*(1+k1·r²+k2·r⁴) at (0.3,0)', () => {
    const i = intr({ k1: 0.1, k2: 0.01 });
    const d = distortNormalized({ x: 0.3, y: 0 }, i, CameraModelId.RADIAL);
    const r2 = 0.3 * 0.3;
    expect(d.x).toBeCloseTo(0.3 * (1 + i.k1 * r2 + i.k2 * r2 * r2), 12);
    expect(d.y).toBeCloseTo(0, 12);
  });
  it('round-trip', () => {
    expect(maxRoundTripError(CameraModelId.RADIAL, intr({ k1: 0.1, k2: 0.01 }), disc(0.5))).toBeLessThan(1e-9);
  });
});

describe('characterization: model 4 OPENCV – forward spot-check (k1·r²+k2·r⁴ + tangential)', () => {
  it('distortNormalized matches radial+tangential formula at (0.4,0.3)', () => {
    const x = 0.4, y = 0.3;
    const i = intr({ k1: 0.1, k2: 0.01, p1: 0.002, p2: -0.001 });
    const d = distortNormalized({ x, y }, i, CameraModelId.OPENCV);
    const r2 = x * x + y * y;
    const r4 = r2 * r2;
    const R = i.k1 * r2 + i.k2 * r4;
    const ex = x + x * R + 2 * i.p1 * x * y + i.p2 * (r2 + 2 * x * x);
    const ey = y + y * R + i.p1 * (r2 + 2 * y * y) + 2 * i.p2 * x * y;
    expect(d.x).toBeCloseTo(ex, 12);
    expect(d.y).toBeCloseTo(ey, 12);
  });
  it('round-trip: undistortNormalized(distortNormalized(p)) ≈ p', () => {
    const i = intr({ k1: 0.1, k2: 0.01, p1: 0.002, p2: -0.001 });
    expect(maxRoundTripError(CameraModelId.OPENCV, i, disc(0.5))).toBeLessThan(1e-9);
  });
});

describe('characterization: model 6 FULL_OPENCV – forward spot-check (rational + tangential)', () => {
  it('matches (1+k1r²+k2r⁴+k3r⁶)/(1+k4r²+k5r⁴+k6r⁶)−1 + tangential at (0.3,0.2)', () => {
    const x = 0.3, y = 0.2;
    const i = intr({ k1: 0.1, k2: 0.01, k3: 0.001, k4: 0.0001, p1: 0.001, p2: -0.001 });
    const d = distortNormalized({ x, y }, i, CameraModelId.FULL_OPENCV);
    const r2 = x * x + y * y;
    const r4 = r2 * r2;
    const r6 = r4 * r2;
    const num = 1 + i.k1 * r2 + i.k2 * r4 + i.k3 * r6;
    const den = 1 + i.k4 * r2 + i.k5 * r4 + i.k6 * r6;
    const R = num / den - 1;
    const ex = x + x * R + 2 * i.p1 * x * y + i.p2 * (r2 + 2 * x * x);
    const ey = y + y * R + i.p1 * (r2 + 2 * y * y) + 2 * i.p2 * x * y;
    expect(d.x).toBeCloseTo(ex, 10);
    expect(d.y).toBeCloseTo(ey, 10);
  });
  it('round-trip', () => {
    const i = intr({ k1: 0.1, k2: 0.01, k3: 0.001, k4: 0.0001, p1: 0.001, p2: -0.001 });
    expect(maxRoundTripError(CameraModelId.FULL_OPENCV, i, disc(0.5))).toBeLessThan(1e-7);
  });
});

describe('characterization: model 7 FOV – forward spot-check', () => {
  it('matches atan(r·2tan(ω/2))/ω formula at (0.3,0)', () => {
    const i = intr({ omega: 0.5 });
    const d = distortNormalized({ x: 0.3, y: 0 }, i, CameraModelId.FOV);
    const r = 0.3;
    const rd = Math.atan(r * 2 * Math.tan(i.omega / 2)) / i.omega;
    expect(d.x).toBeCloseTo(rd, 12);
    expect(d.y).toBeCloseTo(0, 12);
  });
  it('round-trip', () => {
    expect(maxRoundTripError(CameraModelId.FOV, intr({ omega: 0.5 }), disc(0.5))).toBeLessThan(1e-9);
  });
});

describe('characterization: model 8 SIMPLE_RADIAL_FISHEYE – forward spot-check', () => {
  it('matches theta*(1+k1·theta²) formula at (0.3,0)', () => {
    const i = intr({ k1: 0.05 });
    const d = distortNormalized({ x: 0.3, y: 0 }, i, CameraModelId.SIMPLE_RADIAL_FISHEYE);
    const theta = Math.atan(0.3);
    const t2 = theta * theta;
    expect(d.x).toBeCloseTo(theta * (1 + i.k1 * t2), 10);
    expect(d.y).toBeCloseTo(0, 12);
  });
  it('round-trip (scalar Newton → machine precision)', () => {
    const pts = disc(Math.tan((70 * Math.PI) / 180));
    expect(maxRoundTripError(CameraModelId.SIMPLE_RADIAL_FISHEYE, intr({ k1: 0.05 }), pts)).toBeLessThan(1e-9);
  });
});

describe('characterization: model 9 RADIAL_FISHEYE – forward spot-check', () => {
  it('matches theta*(1+k1·t²+k2·t⁴) formula at (0.3,0)', () => {
    const i = intr({ k1: -0.02, k2: 0.003 });
    const d = distortNormalized({ x: 0.3, y: 0 }, i, CameraModelId.RADIAL_FISHEYE);
    const theta = Math.atan(0.3);
    const t2 = theta * theta;
    expect(d.x).toBeCloseTo(theta * (1 + i.k1 * t2 + i.k2 * t2 * t2), 10);
    expect(d.y).toBeCloseTo(0, 12);
  });
  it('round-trip (scalar Newton → machine precision)', () => {
    const pts = disc(Math.tan((70 * Math.PI) / 180));
    expect(maxRoundTripError(CameraModelId.RADIAL_FISHEYE, intr({ k1: -0.02, k2: 0.003 }), pts)).toBeLessThan(1e-9);
  });
});

describe('characterization: model 5 OPENCV_FISHEYE – forward spot-check', () => {
  it('matches full 4-coeff fisheye polynomial at (0.3,0.2)', () => {
    const x = 0.3, y = 0.2;
    const i = intr({ k1: -0.02, k2: 0.003, k3: -1e-4, k4: 1e-5 });
    const d = distortNormalized({ x, y }, i, CameraModelId.OPENCV_FISHEYE);
    const r = Math.hypot(x, y);
    const theta = Math.atan(r);
    const s = theta / r;
    const uux = x * s, uuy = y * s;
    const t2 = uux * uux + uuy * uuy;
    const t4 = t2 * t2, t6 = t4 * t2, t8 = t4 * t4;
    const radial = i.k1 * t2 + i.k2 * t4 + i.k3 * t6 + i.k4 * t8;
    expect(d.x).toBeCloseTo(uux + uux * radial, 10);
    expect(d.y).toBeCloseTo(uuy + uuy * radial, 10);
  });
  it('round-trip (scalar Newton → machine precision)', () => {
    const i = intr({ k1: -0.02, k2: 0.003, k3: -1e-4, k4: 1e-5 });
    const pts = disc(Math.tan((75 * Math.PI) / 180));
    expect(maxRoundTripError(CameraModelId.OPENCV_FISHEYE, i, pts)).toBeLessThan(1e-9);
  });
});

describe('characterization: model 11 RAD_TAN_THIN_PRISM_FISHEYE – forward + round-trip', () => {
  // Representative 16-param lens: k1..k6, p1,p2, sx1,sy1,sx2,sy2 all nonzero.
  // Verified against COLMAP Distortion() math from the task brief.
  const i = intr({
    k1: 0.03, k2: -0.01, k3: 5e-4, k4: -1e-5, k5: 2e-6, k6: -1e-7,
    p1: 1e-3, p2: -5e-4,
    sx1: 2e-4, sy1: -3e-5, sx2: 1e-4, sy2: -2e-5,
  });

  it('distortNormalized changes a non-center point (not identity)', () => {
    const p = { x: 0.3, y: 0.2 };
    const d = distortNormalized(p, i, CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE);
    // The output must differ from the input (distortion is not identity).
    expect(Math.hypot(d.x - p.x, d.y - p.y)).toBeGreaterThan(1e-6);
  });

  it('spot-check: forward matches COLMAP RAD_TAN Distortion formula at (0.2, 0.15)', () => {
    const x = 0.2, y = 0.15;
    const d = distortNormalized({ x, y }, i, CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE);
    const r = Math.hypot(x, y);
    const theta = Math.atan(r);
    const s = theta / r;
    const uux = x * s, uuy = y * s;
    const t2 = uux * uux + uuy * uuy;
    const t4 = t2 * t2, t6 = t4 * t2, t8 = t4 * t4, t10 = t8 * t2, t12 = t10 * t2;
    const thR = 1 + i.k1 * t2 + i.k2 * t4 + i.k3 * t6 + i.k4 * t8 + i.k5 * t10 + i.k6 * t12;
    const rx = thR * uux, ry = thR * uuy;
    const x2 = rx * rx, y2 = ry * ry, xy = rx * ry, r2 = x2 + y2, r4 = r2 * r2;
    // Correct COLMAP formula: i.p1 = COLMAP p0, i.p2 = COLMAP p1
    // COLMAP: dx=2*p1*xy+p0*(r2+2x²), dy=2*p0*xy+p1*(r2+2y²)
    // Substituting: dxTang = i.p1*(r2+2*x2)+2*i.p2*xy, dyTang = 2*i.p1*xy+i.p2*(r2+2*y2)
    const ex = rx + i.p1 * (r2 + 2 * x2) + 2 * i.p2 * xy + i.sx1 * r2 + i.sy1 * r4;
    const ey = ry + 2 * i.p1 * xy + i.p2 * (r2 + 2 * y2) + i.sx2 * r2 + i.sy2 * r4;
    expect(d.x).toBeCloseTo(ex, 10);
    expect(d.y).toBeCloseTo(ey, 10);
  });

  it('round-trip: undistortNormalized(distortNormalized(p)) ≈ p within 1e-5', () => {
    const pts = disc(Math.tan((65 * Math.PI) / 180));
    expect(maxRoundTripError(CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE, i, pts)).toBeLessThan(1e-5);
  });
});

// ── Independent oracle test: proves the p1/p2 swap is CORRECT ─────────────────
// This test does NOT call _radTanApplyDistortion to compute the expected value.
// It derives the expected output INLINE from COLMAP's Distortion() formula
// (models.h, RAD_TAN_THIN_PRISM_FISHEYE), with larger asymmetric p1/p2 so the
// swap changes the result by >> 1e-12 (discriminating old vs. new formula).
//
// COLMAP internal names (models.h): p0=extra_params[6], p1=extra_params[7]
//   dx_tang = 2*p1*xy + p0*(r2+2*x2)
//   dy_tang = 2*p0*xy + p1*(r2+2*y2)
// Our mapping: i.p1 = COLMAP p0, i.p2 = COLMAP p1.  So in our names:
//   dxTang = i.p1*(r2+2*x2) + 2*i.p2*xy
//   dyTang = 2*i.p1*xy      + i.p2*(r2+2*y2)
describe('oracle: RAD_TAN tangential p1/p2 sign – independent COLMAP derivation', () => {
  it('angle-space distortion matches COLMAP formula at uu=(0.20,0.15) with large asymmetric p1,p2', () => {
    // Asymmetric coefficients: p1 ≠ p2 ensures old-swapped ≠ new-correct formula.
    // With p1=0.03, p2=-0.05 and off-axis uu the swap changes ex by ~2.5e-3,
    // ey by ~4.1e-3 — far above the 1e-12 assertion tolerance.
    const iOracle = intr({
      k1: 0.02, k2: 0.01,
      p1: 0.03, p2: -0.05,
      sx1: 0.004, sy1: -0.002, sx2: 0.001, sy2: 0.003,
    });

    // Angle-space input (uu): radius = theta (already angle-space coords, no atan step).
    // The strategy's forward() does FisheyeFromNormal first; we test _radTanApplyDistortion
    // directly by using a pinhole point whose angle == uu exactly.
    // tan(|uu|) is the pinhole radius r such that atan(r)/r * uu == uu.
    // uu = (0.20, 0.15), |uu| = 0.25 (angle in radians).
    const uuX = 0.20, uuY = 0.15;
    const theta = Math.hypot(uuX, uuY); // = 0.25 rad
    const r = Math.tan(theta);           // pinhole radius with this angle
    const pX = uuX * (r / theta);
    const pY = uuY * (r / theta);        // pinhole point → forward() maps it to uu

    // Expected output derived INLINE from COLMAP Distortion() formula.
    // Step 1: theta2 = uuX²+uuY²
    const theta2 = uuX * uuX + uuY * uuY;
    const theta4 = theta2 * theta2;
    // Step 2: 6-coeff radial scale (k3..k6 = 0)
    const thRadial = 1 + iOracle.k1 * theta2 + iOracle.k2 * theta4;
    // Step 3: radially-scaled (x, y)
    const x = thRadial * uuX;
    const y = thRadial * uuY;
    const x2 = x * x, y2 = y * y, xy = x * y;
    const r2 = x2 + y2;
    const r4 = r2 * r2;
    // Step 4: tangential — COLMAP formula (p0=i.p1, p1=i.p2 in our names):
    //   dx_tang = 2*p1*xy + p0*(r2+2*x2)  →  i.p1*(r2+2*x2) + 2*i.p2*xy
    //   dy_tang = 2*p0*xy + p1*(r2+2*y2)  →  2*i.p1*xy + i.p2*(r2+2*y2)
    const dxTang = iOracle.p1 * (r2 + 2 * x2) + 2 * iOracle.p2 * xy;
    const dyTang = 2 * iOracle.p1 * xy + iOracle.p2 * (r2 + 2 * y2);
    // Step 5: thin-prism
    const dxTp = iOracle.sx1 * r2 + iOracle.sy1 * r4;
    const dyTp = iOracle.sx2 * r2 + iOracle.sy2 * r4;
    // Expected distorted angle-space coord:
    const exX = x + dxTang + dxTp;
    const exY = y + dyTang + dyTp;

    // Call the IMPLEMENTATION via the public API (forward distortion in pinhole space).
    const d = distortNormalized({ x: pX, y: pY }, iOracle, CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE);

    // Assert to ~1e-12 (the formula is the same arithmetic, only floating-point rounding differs).
    expect(d.x).toBeCloseTo(exX, 12);
    expect(d.y).toBeCloseTo(exY, 12);
  });
});

describe('characterization: model 10 THIN_PRISM_FISHEYE – forward spot-check', () => {
  it('matches fisheye radial + tangential + thin-prism in angle space at (0.2,0.1)', () => {
    const x = 0.2, y = 0.1;
    const i = intr({ k1: -0.02, k2: 0.003, k3: -1e-4, k4: 1e-5, p1: 5e-4, p2: -5e-4, sx1: 3e-4, sy1: -3e-4 });
    const d = distortNormalized({ x, y }, i, CameraModelId.THIN_PRISM_FISHEYE);
    const r = Math.hypot(x, y);
    const theta = Math.atan(r);
    const s = theta / r;
    const uux = x * s, uuy = y * s;
    const t2 = uux * uux + uuy * uuy;
    const t4 = t2 * t2, t6 = t4 * t2, t8 = t4 * t4;
    const radial = i.k1 * t2 + i.k2 * t4 + i.k3 * t6 + i.k4 * t8;
    const ex = uux + uux * radial + 2 * i.p1 * uux * uuy + i.p2 * (t2 + 2 * uux * uux) + i.sx1 * t2;
    const ey = uuy + uuy * radial + i.p1 * (t2 + 2 * uuy * uuy) + 2 * i.p2 * uux * uuy + i.sy1 * t2;
    expect(d.x).toBeCloseTo(ex, 10);
    expect(d.y).toBeCloseTo(ey, 10);
  });
  it('round-trip', () => {
    const i = intr({ k1: -0.02, k2: 0.003, k3: -1e-4, k4: 1e-5, p1: 5e-4, p2: -5e-4, sx1: 3e-4, sy1: -3e-4 });
    const pts = disc(Math.tan((65 * Math.PI) / 180));
    expect(maxRoundTripError(CameraModelId.THIN_PRISM_FISHEYE, i, pts)).toBeLessThan(1e-5);
  });
});

// ── Task 7: DIVISION / SIMPLE_DIVISION ────────────────────────────────────────
// kDiv=-0.05 (barrel-like distortion). disc2=1-4·rho2·kDiv>1 for all kDiv<0,
// so no valid-disc guard is ever triggered in these tests.

describe('DIVISION (id=13) – closed-form distortion', () => {
  const kDiv = -0.05;
  const modelId = CameraModelId.DIVISION;
  const i = intr({ kDiv });

  it('forward is NOT identity for a non-origin point', () => {
    // This FAILS (RED) while the identity stub is in place.
    const p = { x: 0.3, y: 0.2 };
    const d = distortNormalized(p, i, modelId);
    expect(Math.hypot(d.x - p.x, d.y - p.y)).toBeGreaterThan(1e-6);
  });

  it('inverse spot-check: undistortNormalized(m) = m / (1 + kDiv·|m|²)', () => {
    const m = { x: 0.3, y: 0.0 };
    const r2 = m.x * m.x + m.y * m.y;
    const denom = 1 + kDiv * r2;
    const u = undistortNormalized(m, i, modelId);
    expect(u.valid).toBe(true);
    expect(u.x).toBeCloseTo(m.x / denom, 12);
    expect(u.y).toBeCloseTo(m.y / denom, 12);
  });

  it('round-trip: undistortNormalized(distortNormalized(p)) ≈ p within 1e-9', () => {
    expect(maxRoundTripError(modelId, i, disc(0.7))).toBeLessThan(1e-9);
  });
});

describe('SIMPLE_DIVISION (id=12) – closed-form distortion', () => {
  const kDiv = -0.05;
  const modelId = CameraModelId.SIMPLE_DIVISION;
  const i = intr({ kDiv });

  it('forward is NOT identity for a non-origin point', () => {
    // This FAILS (RED) while the identity stub is in place.
    const p = { x: 0.3, y: 0.2 };
    const d = distortNormalized(p, i, modelId);
    expect(Math.hypot(d.x - p.x, d.y - p.y)).toBeGreaterThan(1e-6);
  });

  it('round-trip: undistortNormalized(distortNormalized(p)) ≈ p within 1e-9', () => {
    expect(maxRoundTripError(modelId, i, disc(0.7))).toBeLessThan(1e-9);
  });
});

// ── Task 9: SIMPLE_FISHEYE (id=14) and FISHEYE (id=15) ──────────────────────
// Pure equidistant fisheye — no polynomial distortion coefficients.
// Forward (FisheyeFromNormal): theta = atan(r); distorted_radius = theta.
// For a point at pinhole-normalized radius r, distorting yields radius atan(r),
// which differs from r for any off-axis ray (atan(r) < r for r > 0).
// Both models dispatch to the 'fisheye' projectionClass strategy with all-zero
// k/p/sx1/sy1 coefficients — the polynomial and tangential/prism terms vanish
// exactly (IEEE 754), leaving only the atan projection.
// SIMPLE_FISHEYE params: f, cx, cy.
// FISHEYE params:        fx, fy, cx, cy.

describe('characterization: model 14 SIMPLE_FISHEYE – pure equidistant fisheye', () => {
  const i = intr({}); // all k=0, p=0, sx=0 — pure equidistant

  it('forward is NOT identity for a non-origin point (atan(r) ≠ r for r > 0)', () => {
    const p = { x: 0.3, y: 0.2 };
    const d = distortNormalized(p, i, CameraModelId.SIMPLE_FISHEYE);
    // pure equidistant: distorted_radius = atan(r) < r, so output differs from input
    expect(Math.hypot(d.x - p.x, d.y - p.y)).toBeGreaterThan(1e-6);
  });

  it('forward maps perspective radius r to distorted radius atan(r)', () => {
    const p = { x: 0.3, y: 0 };
    const d = distortNormalized(p, i, CameraModelId.SIMPLE_FISHEYE);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(Math.atan(0.3), 10);
  });

  it('round-trip: undistortNormalized(distortNormalized(p)) ≈ p within 1e-9', () => {
    const pts = disc(Math.tan((70 * Math.PI) / 180)); // up to ~70 deg half-angle
    expect(maxRoundTripError(CameraModelId.SIMPLE_FISHEYE, i, pts)).toBeLessThan(1e-9);
  });
});

describe('characterization: model 15 FISHEYE – pure equidistant fisheye (fx≠fy form)', () => {
  const i = intr({}); // all k=0, p=0, sx=0 — pure equidistant

  it('forward is NOT identity for a non-origin point (atan(r) ≠ r for r > 0)', () => {
    const p = { x: 0.3, y: 0.2 };
    const d = distortNormalized(p, i, CameraModelId.FISHEYE);
    // pure equidistant: distorted_radius = atan(r) < r, so output differs from input
    expect(Math.hypot(d.x - p.x, d.y - p.y)).toBeGreaterThan(1e-6);
  });

  it('forward maps perspective radius r to distorted radius atan(r)', () => {
    const p = { x: 0.4, y: 0.3 };
    const r = Math.hypot(p.x, p.y);
    const d = distortNormalized(p, i, CameraModelId.FISHEYE);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(Math.atan(r), 10);
  });

  it('round-trip: undistortNormalized(distortNormalized(p)) ≈ p within 1e-9', () => {
    const pts = disc(Math.tan((70 * Math.PI) / 180)); // up to ~70 deg half-angle
    expect(maxRoundTripError(CameraModelId.FISHEYE, i, pts)).toBeLessThan(1e-9);
  });
});

// ── Task 8: EUCM (Extended Unified Camera Model) ─────────────────────────────
// COLMAP id=16, params: fx,fy,cx,cy,alpha,beta.
// forward: den = alpha*sqrt(beta*r²+1) + (1-alpha); distorted = p/den
// inverse: closed-form CamFromImg (see cameraUndistortion.ts)

describe('EUCM (id=16) – closed-form distortion', () => {
  const alpha = 0.6, beta = 1.1;
  const modelId = CameraModelId.EUCM;
  const i = intr({ alpha, beta });

  it('forward is NOT identity for a non-origin point (RED while stub is identity)', () => {
    const p = { x: 0.3, y: 0.2 };
    const d = distortNormalized(p, i, modelId);
    expect(Math.hypot(d.x - p.x, d.y - p.y)).toBeGreaterThan(1e-6);
  });

  it('forward spot-check: matches COLMAP ImgFromCam EUCM formula at (0.3, 0.2)', () => {
    const p = { x: 0.3, y: 0.2 };
    const d = distortNormalized(p, i, modelId);
    const r2 = p.x * p.x + p.y * p.y;
    const den = alpha * Math.sqrt(beta * r2 + 1) + (1 - alpha);
    expect(d.x).toBeCloseTo(p.x / den, 12);
    expect(d.y).toBeCloseTo(p.y / den, 12);
  });

  it('round-trip: undistortNormalized(distortNormalized(p)) ≈ p within 1e-9', () => {
    expect(maxRoundTripError(modelId, i, disc(0.5))).toBeLessThan(1e-9);
  });

  it('inverse returns valid:false when radicand < 0 (ray beyond EUCM FOV)', () => {
    // With alpha=0.6, beta=1.1: radicand = 1 - (2*0.6-1)*1.1*r2 = 1 - 0.22*r2
    // For r=3.0: radicand = 1 - 0.22*9 = -0.98 < 0 → invalid
    const result = undistortNormalized({ x: 3.0, y: 0 }, i, modelId);
    expect(result.valid).toBe(false);
  });
});

// ── Task 2: DIVISION inverse horizon guard ───────────────────────────────────
// The division inverse is undistorted = d / (1 + kDiv·|d|²). For barrel
// distortion (kDiv < 0) the denominator hits zero at the horizon radius
// r_d = 1/√|kDiv| and goes negative beyond it, producing Inf / sign-flipped
// coordinates. Sibling strategies (EUCM, FOV) return valid:false at their domain
// edges; division must too. All boundary values hand-derived (kDiv=-2.5,
// horizon r_d = 1/√2.5 = √0.4 ≈ 0.6324555).

describe('DIVISION inverse horizon guard (Task 2)', () => {
  const i = intr({ kDiv: -2.5 });

  it('stays valid just inside the horizon: d=(0.6,0) → denom=0.1 → u=(6.0,0)', () => {
    // r_d² = 0.36; denom = 1 + (-2.5)(0.36) = 1 - 0.9 = 0.1; u = 0.6/0.1 = 6.0.
    const u = undistortNormalized({ x: 0.6, y: 0 }, i, CameraModelId.DIVISION);
    expect(u.valid).toBe(true);
    expect(u.x).toBeCloseTo(6.0, 6);
    expect(u.y).toBeCloseTo(0, 12);
  });

  it('rejects the exact horizon r_d = 1/√2.5 (denom=0 → Inf) as invalid', () => {
    // Pre-fix: returned { x: Infinity, valid: true }.
    const rd = 1 / Math.sqrt(2.5); // 0.6324555320336759
    const u = undistortNormalized({ x: rd, y: 0 }, i, CameraModelId.DIVISION);
    expect(u.valid).toBe(false);
    expect(Number.isFinite(u.x)).toBe(true); // convention returns input coords, not Inf
  });

  it('rejects points past the horizon r_d=0.7 (denom=-0.225 → sign-flipped) as invalid', () => {
    // r_d² = 0.49; denom = 1 + (-2.5)(0.49) = -0.225; pre-fix u = -3.111 (wrong sign), valid:true.
    const u = undistortNormalized({ x: 0.7, y: 0 }, i, CameraModelId.SIMPLE_DIVISION);
    expect(u.valid).toBe(false);
  });

  it('does not over-reject pincushion (kDiv>0): denom always > 0', () => {
    const pin = intr({ kDiv: 0.5 });
    const u = undistortNormalized({ x: 0.7, y: 0 }, pin, CameraModelId.DIVISION);
    expect(u.valid).toBe(true);
  });
});

// ── Task 2: EUCM inverse NaN boundary guard ──────────────────────────────────
// At alpha=1, beta=1, |m|=1 the radicand is exactly 0 (passes the `<0` guard),
// helperDen = alpha·√0 + (1-alpha) = 0, so helper = 0/0 = NaN. The old
// `helper <= 0` test is false for NaN, so the inverse returned {NaN, NaN,
// valid:true}. The NaN-safe rejection must return valid:false with no NaN.

describe('EUCM inverse NaN boundary guard (Task 2)', () => {
  it('rejects the alpha=1, radicand=0 singularity instead of returning NaN', () => {
    const i = intr({ alpha: 1, beta: 1 });
    const u = undistortNormalized({ x: 1, y: 0 }, i, CameraModelId.EUCM);
    expect(Number.isNaN(u.x)).toBe(false);
    expect(Number.isNaN(u.y)).toBe(false);
    expect(u.valid).toBe(false);
  });
});
