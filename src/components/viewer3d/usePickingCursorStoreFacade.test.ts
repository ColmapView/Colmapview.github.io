import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { usePointPickingStore } from '../../store';
import { usePickingCursorStoreFacade } from './usePickingCursorStoreFacade';

describe('usePickingCursorStoreFacade', () => {
  beforeEach(() => {
    usePointPickingStore.setState(usePointPickingStore.getInitialState(), true);
  });

  it('collects picking mode and selected-point count only', () => {
    usePointPickingStore.setState({
      pickingMode: 'normal-3pt',
      selectedPoints: [
        { point3DId: 1n, position: new THREE.Vector3(1, 2, 3) },
        { point3DId: 2n, position: new THREE.Vector3(4, 5, 6) },
      ],
    });

    const { result } = renderHook(() => usePickingCursorStoreFacade());

    expect(result.current).toEqual({
      pickingMode: 'normal-3pt',
      selectedPointsLength: 2,
    });
  });
});
