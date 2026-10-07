import { describe, expect, it } from 'vitest';
import type { Sim3dEuler } from '../types/sim3d';
import { createIdentityEuler, isIdentityEuler, isSameEuler } from './sim3dTransforms';

describe('transform comparison', () => {
  const moved: Sim3dEuler = { scale: 1.5, rotationX: 0.1, rotationY: -0.2, rotationZ: 0.3,
    translationX: 4, translationY: -5, translationZ: 6 };

  it.each(Object.keys(moved) as (keyof Sim3dEuler)[])('treats a rounding-sized change of %s as the same transform', key => {
    expect(isSameEuler({ ...moved, [key]: moved[key] + 1e-10 }, moved)).toBe(true);
    expect(isSameEuler({ ...moved, [key]: moved[key] + 1e-6 }, moved)).toBe(false);
  });

  it.each([5e-10, 2e-9])('measures identity with the same tolerance (a change of %s)', change => {
    const nearIdentity = { ...createIdentityEuler(), translationX: change };
    expect(isSameEuler(nearIdentity, createIdentityEuler())).toBe(change < 1e-9);
    expect(isIdentityEuler(nearIdentity)).toBe(change < 1e-9);
  });
});
