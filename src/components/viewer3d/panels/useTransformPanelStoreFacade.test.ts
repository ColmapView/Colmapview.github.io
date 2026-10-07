import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  confirmReload,
  useReconstructionStore,
  useTransformStore,
  useUIStore,
} from '../../../store';
import {
  buildFile,
  buildReconstruction,
} from '../../../test/builders';
import { createIdentityEuler } from '../../../utils/sim3dTransforms';
import { useTransformPanelStoreFacade } from './useTransformPanelStoreFacade';

describe('useTransformPanelStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects transform-panel dependencies from owning stores', () => {
    const reconstruction = buildReconstruction();
    const droppedFiles = new Map([['sparse/0/images.bin', buildFile('images.bin')]]);
    const transform = {
      ...createIdentityEuler(),
      scale: 2,
      rotationY: 0.5,
    };
    useReconstructionStore.setState({
      reconstruction,
      droppedFiles,
    });
    useTransformStore.setState({ transform });
    useUIStore.setState({ showGizmo: true });

    const { result } = renderHook(() => useTransformPanelStoreFacade());

    // Exhaustive on purpose: Center at Origin and Floor Detection now live in
    // the Align panel, and they took `wasmReconstruction` with them.
    expect(result.current.data).toEqual({
      reconstruction,
      droppedFiles,
    });
    expect(result.current.transform.transform).toBe(transform);
    expect(result.current.ui.showGizmo).toBe(true);
    // The commit and the Reload confirmation; `applyTransformPreset` moved to Align.
    expect(Object.keys(result.current.actions)).toEqual(['applyTransformToData', 'confirmReload']);
    expect(result.current.actions.confirmReload).toBe(confirmReload);
    expect(typeof result.current.actions.applyTransformToData).toBe('function');
  });

  it('leaves point picking to the align panel and subscribes to neither picking store', () => {
    const { result } = renderHook(() => useTransformPanelStoreFacade());

    expect(Object.keys(result.current).sort()).toEqual(['actions', 'data', 'transform', 'ui']);
  });

  it('routes transform and UI actions back to owning stores', () => {
    const { result } = renderHook(() => useTransformPanelStoreFacade());

    act(() => {
      result.current.transform.setTransform({ scale: 3, translationX: 4 });
      result.current.ui.toggleGizmo();
    });

    expect(useTransformStore.getState().transform).toMatchObject({
      scale: 3,
      translationX: 4,
    });
    expect(useUIStore.getState().showGizmo).toBe(true);

    act(() => {
      result.current.transform.resetTransform();
    });

    expect(useTransformStore.getState().transform).toEqual(createIdentityEuler());
  });
});
