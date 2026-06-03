import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  useCameraStore,
  useDeletionStore,
  useFloorPlaneStore,
  usePointCloudStore,
  usePointPickingStore,
  useReconstructionStore,
} from '../../../store';
import { buildReconstruction } from '../../../test/builders';
import { usePointCloudStoreFacade } from './usePointCloudStoreFacade';

describe('usePointCloudStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useCameraStore.setState(useCameraStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    usePointPickingStore.setState(usePointPickingStore.getInitialState(), true);
    useFloorPlaneStore.setState(useFloorPlaneStore.getInitialState(), true);
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
  });

  it('collects point cloud render dependencies from owning stores and nodes', () => {
    const reconstruction = buildReconstruction();
    const pointDistances = new Float32Array([0.01, 0.2]);
    const pendingDeletions = new Set([3]);

    useReconstructionStore.setState({ reconstruction });
    usePointCloudStore.setState({
      showPointCloud: false,
      pointSize: 5,
      pointOpacity: 0.5,
      colorMode: 'trackLength',
      minTrackLength: 4,
      maxReprojectionError: 2.5,
      thinning: 3,
    });
    useCameraStore.setState({
      selectedImageId: 3,
      showSelectionHighlight: true,
      selectionColorMode: 'blink',
      selectionAnimationSpeed: 2,
      selectionColor: '#aabbcc',
    });
    usePointPickingStore.setState({
      pickingMode: 'distance-2pt',
      selectedPoints: [
        { position: new THREE.Vector3(1, 2, 3), point3DId: 1n },
      ],
    });
    useFloorPlaneStore.setState({
      pointDistances,
      distanceThreshold: 0.12,
      floorColorMode: 'distance',
    });
    useDeletionStore.setState({ pendingDeletions });

    const { result } = renderHook(() => usePointCloudStoreFacade());

    expect(result.current.data).toMatchObject({
      reconstruction,
      wasmReconstruction: null,
      pointPicking: {
        pickingMode: 'distance-2pt',
        selectedPointsLength: 1,
      },
      floor: {
        pointDistances,
        distanceThreshold: 0.12,
        floorColorMode: 'distance',
      },
      deletion: {
        pendingDeletions,
      },
    });
    expect(result.current.data.points).toMatchObject({
      visible: false,
      size: 5,
      opacity: 0.5,
      colorMode: 'trackLength',
      minTrackLength: 4,
      maxReprojectionError: 2.5,
      thinning: 3,
    });
    expect(result.current.data.selection).toMatchObject({
      selectedImageId: 3,
      visible: true,
      colorMode: 'blink',
      animationSpeed: 2,
      color: '#aabbcc',
    });
  });

  it('routes point picking actions back to the point picking store', () => {
    const point = {
      position: new THREE.Vector3(4, 5, 6),
      point3DId: 7n,
    };
    const hoveredPoint = new THREE.Vector3(8, 9, 10);

    usePointPickingStore.setState({ pickingMode: 'distance-2pt' });

    const { result } = renderHook(() => usePointCloudStoreFacade());

    act(() => {
      result.current.actions.addSelectedPoint(point, { x: 11, y: 12 });
      result.current.actions.setHoveredPoint(hoveredPoint);
    });

    expect(usePointPickingStore.getState()).toMatchObject({
      selectedPoints: [point],
      hoveredPoint,
    });
  });
});
