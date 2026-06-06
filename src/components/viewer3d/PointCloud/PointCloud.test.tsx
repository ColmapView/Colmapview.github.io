import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  useCameraStore,
  useDeletionStore,
  useFloorPlaneStore,
  usePointCloudStore,
  usePointPickingStore,
  useReconstructionStore,
} from '../../../store';
import type { ColorMode } from '../../../store/types';
import { PointCloud } from './PointCloud';

vi.mock('@react-three/fiber', () => ({
  useFrame: vi.fn(),
  useThree: vi.fn(() => ({
    camera: new THREE.PerspectiveCamera(),
    gl: {
      domElement: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: 800,
          height: 600,
        }),
      },
    },
    raycaster: new THREE.Raycaster(),
  })),
}));

describe('PointCloud', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useCameraStore.setState(useCameraStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    usePointPickingStore.setState(usePointPickingStore.getInitialState(), true);
    useFloorPlaneStore.setState(useFloorPlaneStore.getInitialState(), true);
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps hook order stable when switching between point, splat, and splat point modes', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<PointCloud />);

    for (const colorMode of ['rgb', 'splats', 'splatPoints', 'splatRainbowPoints', 'rgb'] satisfies ColorMode[]) {
      act(() => {
        usePointCloudStore.setState({
          colorMode,
          showPointCloud: true,
          showSplats: colorMode !== 'rgb',
        });
      });
    }

    const hookOrderWarnings = consoleError.mock.calls.filter((call) =>
      String(call[0]).includes('React has detected a change in the order of Hooks called by PointCloud')
    );
    expect(hookOrderWarnings).toEqual([]);
  });
});
