import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createIdentityEuler } from '../../utils/sim3dTransforms';
import type { SelectedPoint } from '../../store/stores/pointPickingStore';
import {
  DISTANCE_INPUT_MODAL_ESTIMATED_HEIGHT,
  DISTANCE_INPUT_MODAL_ESTIMATED_WIDTH,
  getDistanceInputApplyResult,
  getDistanceInputModalPanelStyle,
  getDistanceInputTargetUp,
  getInitialDistanceInputValue,
  shouldApplyDistanceInputKey,
  shouldShowDistanceValueInput,
} from './distanceInputModalViewModel';
import { Z_INDEX } from '../../theme';

function point(x: number, y: number, z: number, id: bigint): SelectedPoint {
  return {
    position: new THREE.Vector3(x, y, z),
    point3DId: id,
  };
}

describe('distance input modal view model', () => {
  it('formats the initial distance input only for open two-point selections', () => {
    const points = [
      point(0, 0, 0, 1n),
      point(3, 4, 0, 2n),
    ];

    expect(getInitialDistanceInputValue(true, points)).toBe('5.0000');
    expect(getInitialDistanceInputValue(false, points)).toBe('');
    expect(getInitialDistanceInputValue(true, points.slice(0, 1))).toBe('');
  });

  it('derives input visibility and target-up vectors from modal mode and coordinate system', () => {
    expect(shouldShowDistanceValueInput('origin-1pt')).toBe(false);
    expect(shouldShowDistanceValueInput('normal-3pt')).toBe(false);
    expect(shouldShowDistanceValueInput('distance-2pt')).toBe(true);

    expect(getDistanceInputTargetUp('blender', 'Z').toArray()).toEqual([0, 1, 0]);
    expect(getDistanceInputTargetUp('unreal', 'X').toArray()).toEqual([0, 0, -1]);
  });

  it('derives modal dimensions, panel style, and apply key policy', () => {
    expect(DISTANCE_INPUT_MODAL_ESTIMATED_WIDTH).toBe(200);
    expect(DISTANCE_INPUT_MODAL_ESTIMATED_HEIGHT).toBe(80);
    expect(getDistanceInputModalPanelStyle({ x: 12, y: 34 })).toEqual({
      left: 12,
      top: 34,
      zIndex: Z_INDEX.modalOverlay,
    });
    expect(getDistanceInputModalPanelStyle({ x: 12, y: 34 }, 91)).toEqual({
      left: 12,
      top: 34,
      zIndex: 91,
    });
    expect(shouldApplyDistanceInputKey('Enter')).toBe(true);
    expect(shouldApplyDistanceInputKey('Escape')).toBe(false);
  });

  it('plans one-point origin translation transforms', () => {
    const result = getDistanceInputApplyResult({
      pickingMode: 'origin-1pt',
      selectedPoints: [point(1, 2, 3, 1n)],
      inputValue: '',
      normalFlipped: false,
      targetUp: new THREE.Vector3(0, 1, 0),
      transform: createIdentityEuler(),
    });

    if (!result) throw new Error('expected origin transform result');
    expect(result.targetDistance).toBeNull();
    expect(result.transform.translationX).toBeCloseTo(-1);
    expect(result.transform.translationY).toBeCloseTo(-2);
    expect(result.transform.translationZ).toBeCloseTo(-3);
  });

  it('plans two-point scale transforms for strict finite numeric input', () => {
    const result = getDistanceInputApplyResult({
      pickingMode: 'distance-2pt',
      selectedPoints: [
        point(0, 0, 0, 1n),
        point(2, 0, 0, 2n),
      ],
      inputValue: '4',
      normalFlipped: false,
      targetUp: new THREE.Vector3(0, 1, 0),
      transform: createIdentityEuler(),
    });

    if (!result) throw new Error('expected scale transform result');
    expect(result.targetDistance).toBe(4);
    expect(result.transform.scale).toBeCloseTo(2);
    expect(result.transform.translationX).toBeCloseTo(-1);
    expect(result.transform.translationY).toBeCloseTo(0);
    expect(result.transform.translationZ).toBeCloseTo(0);

    expect(getDistanceInputApplyResult({
      pickingMode: 'distance-2pt',
      selectedPoints: [
        point(0, 0, 0, 1n),
        point(2, 0, 0, 2n),
      ],
      inputValue: '4m',
      normalFlipped: false,
      targetUp: new THREE.Vector3(0, 1, 0),
      transform: createIdentityEuler(),
    })).toBeNull();

    expect(getDistanceInputApplyResult({
      pickingMode: 'distance-2pt',
      selectedPoints: [
        point(0, 0, 0, 1n),
        point(2, 0, 0, 2n),
      ],
      inputValue: '0',
      normalFlipped: false,
      targetUp: new THREE.Vector3(0, 1, 0),
      transform: createIdentityEuler(),
    })).toBeNull();
  });

  it('plans three-point normal alignment transforms', () => {
    const result = getDistanceInputApplyResult({
      pickingMode: 'normal-3pt',
      selectedPoints: [
        point(0, 0, 0, 1n),
        point(0, 0, 1, 2n),
        point(1, 0, 0, 3n),
      ],
      inputValue: '',
      normalFlipped: false,
      targetUp: new THREE.Vector3(0, 1, 0),
      transform: createIdentityEuler(),
    });

    if (!result) throw new Error('expected normal alignment transform result');
    expect(result.targetDistance).toBeNull();
    expect(result.transform.scale).toBeCloseTo(1);
    expect(result.transform.rotationX).toBeCloseTo(0);
    expect(result.transform.rotationY).toBeCloseTo(0);
    expect(result.transform.rotationZ).toBeCloseTo(0);
    expect(result.transform.translationX).toBeCloseTo(0);
    expect(result.transform.translationY).toBeCloseTo(0);
    expect(result.transform.translationZ).toBeCloseTo(0);
  });
});
