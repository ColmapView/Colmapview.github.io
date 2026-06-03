import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useExportStore,
  usePointPickingStore,
  useReconstructionStore,
  useTransformStore,
  useUIStore,
} from '../../../store';
import type { Sim3dEuler } from '../../../types/sim3d';
import { useGlobalContextMenuActionStoreFacade } from './useGlobalContextMenuActionStoreFacade';

describe('useGlobalContextMenuActionStoreFacade', () => {
  beforeEach(() => {
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
    expect(result.current.processFiles).toEqual(expect.any(Function));
    expect(result.current.confirmReload).toEqual(expect.any(Function));
    expect(result.current.applyTransformPreset).toEqual(expect.any(Function));
    expect(result.current.applyTransformToData).toEqual(expect.any(Function));
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
