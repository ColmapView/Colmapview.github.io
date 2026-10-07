import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useReconstructionStore,
  useTransformStore,
  useUIStore,
} from '../../store';
import type { Sim3dEuler } from '../../types/sim3d';
import { useTransformGizmoStoreFacade } from './useTransformGizmoStoreFacade';

const { reloadFilesMock, processFilesMock } = vi.hoisted(() => ({
  reloadFilesMock: vi.fn(async () => true),
  processFilesMock: vi.fn(async () => true),
}));

vi.mock('../../hooks/useFileDropzone', () => ({
  useFileDropzone: () => ({ reloadFiles: reloadFilesMock, processFiles: processFilesMock }),
}));

describe('useTransformGizmoStoreFacade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(result.current.actions.reloadFiles).toEqual(expect.any(Function));
    expect(result.current.actions.applyTransformToData).toEqual(expect.any(Function));
    expect(result.current.actions.confirmReload).toEqual(expect.any(Function));
  });

  it('reloads through the Reload path, not a fresh load of the same files', async () => {
    const files = new Map([['sparse/0/images.bin', new File(['images'], 'images.bin')]]);
    const { result } = renderHook(() => useTransformGizmoStoreFacade());

    await act(async () => { await result.current.actions.reloadFiles(files); });

    expect(reloadFilesMock).toHaveBeenCalledExactlyOnceWith(files);
    expect(processFilesMock).not.toHaveBeenCalled();
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
