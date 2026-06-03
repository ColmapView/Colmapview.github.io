import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useFloorPlaneStore,
  useUIStore,
} from '../../store';
import type { Plane } from '../../utils/ransac';
import { useFloorPlaneWidgetStoreFacade } from './useFloorPlaneWidgetStoreFacade';

const plane: Plane = {
  normal: [0, 1, 0],
  d: 0,
  centroid: [0, 0, 0],
  inlierCount: 10,
  radius: 2,
};

describe('useFloorPlaneWidgetStoreFacade', () => {
  beforeEach(() => {
    useFloorPlaneStore.setState(useFloorPlaneStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects floor-plane widget dependencies from owning stores', () => {
    useFloorPlaneStore.setState({
      detectedPlane: plane,
      normalFlipped: true,
      targetAxis: 'Z',
      showFloorModal: true,
    });
    useUIStore.setState({
      axesScale: 2,
      axesCoordinateSystem: 'unreal',
    });

    const { result } = renderHook(() => useFloorPlaneWidgetStoreFacade());

    expect(result.current.floor).toMatchObject({
      detectedPlane: plane,
      normalFlipped: true,
      targetAxis: 'Z',
      showFloorModal: true,
    });
    expect(result.current.ui).toMatchObject({
      axesScale: 2,
      axesCoordinateSystem: 'unreal',
    });
  });

  it('routes floor-plane widget actions back to owning stores', () => {
    const { result } = renderHook(() => useFloorPlaneWidgetStoreFacade());

    act(() => {
      result.current.floor.toggleNormalFlipped();
      result.current.floor.cycleTargetAxis();
      result.current.floor.setShowFloorModal(true);
      result.current.floor.setModalPosition({ x: 12, y: 34 });
    });

    expect(useFloorPlaneStore.getState()).toMatchObject({
      normalFlipped: true,
      targetAxis: 'Z',
      showFloorModal: true,
      modalPosition: { x: 12, y: 34 },
    });
  });
});
