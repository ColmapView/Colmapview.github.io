import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useExportStore,
  usePointPickingStore,
  useReconstructionStore,
  useTransformStore,
  useUIStore,
} from '../../../store';
import type { Sim3dEuler } from '../../../types/sim3d';
import { useGlobalContextMenuActionStoreFacade } from './useGlobalContextMenuActionStoreFacade';

const { reloadFilesMock, processFilesMock } = vi.hoisted(() => ({
  reloadFilesMock: vi.fn(async () => true),
  processFilesMock: vi.fn(async () => true),
}));

vi.mock('../../../hooks/useFileDropzone', () => ({
  useFileDropzone: () => ({ reloadFiles: reloadFilesMock, processFiles: processFilesMock }),
}));

describe('useGlobalContextMenuActionStoreFacade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useExportStore.setState(useExportStore.getInitialState(), true);
    usePointPickingStore.setState(usePointPickingStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects global context-menu action dependencies from owning stores', () => {
    const droppedFiles = new Map<string, File>([
      ['sparse/0/cameras.bin', new File(['camera'], 'cameras.bin')],
    ]);

    useUIStore.setState({ backgroundColor: '#123456' });
    usePointPickingStore.setState({ pickingMode: 'distance-2pt' });
    useReconstructionStore.setState({ droppedFiles });

    const { result } = renderHook(() => useGlobalContextMenuActionStoreFacade());

    expect(result.current).toMatchObject({
      backgroundColor: '#123456',
      pickingMode: 'distance-2pt',
      droppedFiles,
    });
    expect(result.current.reloadFiles).toEqual(expect.any(Function));
    expect(result.current.confirmReload).toEqual(expect.any(Function));
    expect(result.current.applyTransformPreset).toEqual(expect.any(Function));
    expect(result.current.applyTransformToData).toEqual(expect.any(Function));
  });

  it('reloads through the Reload path, which keeps remote splat tiles', async () => {
    const files = new Map([['sparse/0/cameras.bin', new File(['c'], 'cameras.bin')]]);
    const { result } = renderHook(() => useGlobalContextMenuActionStoreFacade());

    await act(async () => { await result.current.reloadFiles(files); });

    expect(reloadFilesMock).toHaveBeenCalledExactlyOnceWith(files);
    expect(processFilesMock).not.toHaveBeenCalled();
  });

  it('routes global context-menu action dependencies back to owning stores', () => {
    const transform: Sim3dEuler = {
      scale: 2,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      translationX: 4,
      translationY: 0,
      translationZ: 0,
    };

    useTransformStore.setState({ transform });

    const { result } = renderHook(() => useGlobalContextMenuActionStoreFacade());

    act(() => {
      result.current.setView('z');
      result.current.setBackgroundColor('#abcdef');
      result.current.toggleGalleryCollapsed();
      result.current.setPickingMode('origin-1pt');
      result.current.resetTransform();
      result.current.takeScreenshot();
      result.current.setExportFormat('ply');
      result.current.triggerExport();
      result.current.openDeletionModal();
      result.current.openFloorDetectionModal();
      result.current.openCameraConversionModal();
    });

    expect(useUIStore.getState()).toMatchObject({
      viewDirection: 'z',
      viewTrigger: 1,
      backgroundColor: '#abcdef',
      galleryCollapsed: true,
      showDeletionModal: true,
      showFloorModal: true,
      showConversionModal: true,
    });
    expect(usePointPickingStore.getState().pickingMode).toBe('origin-1pt');
    expect(useTransformStore.getState().transform).toMatchObject({
      scale: 1,
      translationX: 0,
    });
    expect(useExportStore.getState()).toMatchObject({
      screenshotTrigger: 1,
      exportFormat: 'ply',
      exportTrigger: 1,
    });
  });
});
