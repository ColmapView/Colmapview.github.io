import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computeSphericalFlyToPose, SPHERICAL_FLYTO_DISTANCE_FACTOR } from './sphericalFlyTo';

describe('computeSphericalFlyToPose', () => {
  it('stops at exactly SPHERICAL_FLYTO_DISTANCE_FACTOR * radius from the sphere center', () => {
    const center = new THREE.Vector3(1, 2, 3);
    const viewer = new THREE.Vector3(1, 2, 13); // 10 units along +Z from center
    const radius = 4;

    const { position, distance } = computeSphericalFlyToPose(center, viewer, radius);

    const expected = SPHERICAL_FLYTO_DISTANCE_FACTOR * radius;
    expect(distance).toBeCloseTo(expected, 10);
    expect(position.distanceTo(center)).toBeCloseTo(expected, 10);
  });

  it('preserves the approach direction: position lies on the center->currentViewer ray', () => {
    const center = new THREE.Vector3(0, 0, 0);
    const viewer = new THREE.Vector3(3, 4, 0); // unit dir (0.6, 0.8, 0)
    const radius = 2;

    const { position } = computeSphericalFlyToPose(center, viewer, radius);

    const dir = position.clone().sub(center).normalize();
    expect(dir.x).toBeCloseTo(0.6, 10);
    expect(dir.y).toBeCloseTo(0.8, 10);
    expect(dir.z).toBeCloseTo(0, 10);

    const D = SPHERICAL_FLYTO_DISTANCE_FACTOR * radius;
    expect(position.x).toBeCloseTo(0.6 * D, 10);
    expect(position.y).toBeCloseTo(0.8 * D, 10);
    expect(position.z).toBeCloseTo(0, 10);
  });

  it('falls back to world +Z when the viewer sits at the sphere center (degenerate)', () => {
    const center = new THREE.Vector3(5, 5, 5);
    const viewer = center.clone(); // exactly at the center
    const radius = 3;

    const { position } = computeSphericalFlyToPose(center, viewer, radius);

    const D = SPHERICAL_FLYTO_DISTANCE_FACTOR * radius;
    expect(position.x).toBeCloseTo(5, 10);
    expect(position.y).toBeCloseTo(5, 10);
    expect(position.z).toBeCloseTo(5 + D, 10); // deterministic +Z fallback
  });

  it('looks at the sphere center (returns a distinct clone, not an alias)', () => {
    const center = new THREE.Vector3(1, 2, 3);
    const viewer = new THREE.Vector3(10, 2, 3);

    const { lookAt } = computeSphericalFlyToPose(center, viewer, 2);

    expect(lookAt.equals(center)).toBe(true);
    expect(lookAt).not.toBe(center);
  });

  it('does not mutate its input vectors', () => {
    const center = new THREE.Vector3(1, 2, 3);
    const viewer = new THREE.Vector3(10, 2, 3);

    computeSphericalFlyToPose(center, viewer, 2);

    expect(center.toArray()).toEqual([1, 2, 3]);
    expect(viewer.toArray()).toEqual([10, 2, 3]);
  });

  it('uses a factor > 1 so the viewer stops strictly outside the sphere', () => {
    expect(SPHERICAL_FLYTO_DISTANCE_FACTOR).toBeGreaterThan(1);
  });
});
