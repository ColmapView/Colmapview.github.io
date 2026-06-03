import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useReconstructionStore,
  useTransformStore,
  useUIStore,
} from '../../store';
import type { Sim3dEuler } from '../../types/sim3d';
import { useTransformGizmoStoreFacade } from './useTransformGizmoStoreFacade';

describe('useTransformGizmoStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects transform gizmo dependencies from owning stores', () => {
    const transform: Sim3dEuler = {
      scale: 2,
      rotationX: 0.1,
      rotationY: 0.2,
      rotationZ: 0.3,
      translationX: 4,
      translationY: 5,
      translationZ: 6,
    };
    const droppedFiles = new Map<string, File>([
      ['sparse/0/images.bin', new File(['images'], 'images.bin')],
    ]);

    useTransformStore.setState({ transform });
    useReconstructionStore.setState({ droppedFiles });

    const { result } = renderHook(() => useTransformGizmoStoreFacade());

    expect(result.current.data).toMatchObject({
      transform,
      droppedFiles,
    });
    expect(result.current.actions.processFiles).toEqual(expect.any(Function));
    expect(result.current.actions.applyTransformToData).toEqual(expect.any(Function));
    expect(result.current.actions.confirmReload).toEqual(expect.any(Function));
  });

  it('routes transform and gizmo visibility actions back to owning stores', () => {
    const { result } = renderHook(() => useTransformGizmoStoreFacade());

    act(() => {
      result.current.actions.setTransform({ scale: 3, translationX: 4 });
      result.current.actions.setShowGizmo(false);
    });

    expect(useTransformStore.getState().transform).toMatchObject({
      scale: 3,
      translationX: 4,
    });
    expect(useUIStore.getState().showGizmo).toBe(false);

    act(() => {
      result.current.actions.resetTransform();
    });

    expect(useTransformStore.getState().transform).toMatchObject({
      scale: 1,
      translationX: 0,
    });
  });
});
