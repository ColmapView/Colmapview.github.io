import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useDeletionStore,
  useNotificationStore,
  useReconstructionStore,
  useTransformStore,
} from '../../../store';
import {
  buildFile,
  buildLoadedFiles,
  buildReconstruction,
  buildWasmReconstructionWrapper,
} from '../../../test/builders';
import { createIdentityEuler } from '../../../utils/sim3dTransforms';
import { useExportPanelStoreFacade } from './useExportPanelStoreFacade';

describe('useExportPanelStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
  });

  it('collects export-panel dependencies from owning stores', () => {
    const reconstruction = buildReconstruction();
    const wasmReconstruction = buildWasmReconstructionWrapper({
      positions: new Float32Array([0, 0, 0]),
    });
    const loadedFiles = buildLoadedFiles({
      imageFiles: [buildFile('image.jpg')],
    });
    const droppedFiles = new Map([['sparse/0/images.bin', buildFile('images.bin')]]);

    useReconstructionStore.setState({
      reconstruction,
      wasmReconstruction,
      loadedFiles,
      droppedFiles,
    });
    useDeletionStore.setState({ pendingDeletions: new Set([1, 2]) });

    const { result } = renderHook(() => useExportPanelStoreFacade());

    expect(result.current.data).toMatchObject({
      reconstruction,
      loadedFiles,
      droppedFiles,
    });
    expect(result.current.data.getLiveReconstruction()).toEqual({
      reconstruction,
      wasmReconstruction,
    });
    expect(result.current.deletion.pendingDeletions).toEqual(new Set([1, 2]));
    expect(result.current.deletion.getPendingDeletionCount()).toBe(2);
    expect(typeof result.current.deletion.applyDeletionsToData).toBe('function');
    expect(typeof result.current.actions.confirmReload).toBe('function');
  });

  it('routes transform and notification actions back to owning stores', () => {
    const { result } = renderHook(() => useExportPanelStoreFacade());

    act(() => {
      useTransformStore.setState({
        transform: {
          ...createIdentityEuler(),
          scale: 3,
          translationX: 4,
        },
      });
    });

    expect(result.current.transform.getTransform()).toMatchObject({
      scale: 3,
      translationX: 4,
    });

    act(() => {
      result.current.transform.resetTransform();
      result.current.actions.addNotification('info', 'Export ready', 2500);
    });

    expect(useTransformStore.getState().transform).toEqual(createIdentityEuler());
    expect(useNotificationStore.getState().notifications).toMatchObject([
      {
        type: 'info',
        message: 'Export ready',
        duration: 2500,
      },
    ]);
  });
});
