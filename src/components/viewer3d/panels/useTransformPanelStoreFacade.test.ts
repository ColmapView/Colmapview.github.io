import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  usePointPickingStore,
  useReconstructionStore,
  useTransformStore,
  useUIStore,
} from '../../../store';
import {
  buildFile,
  buildReconstruction,
  buildWasmReconstructionWrapper,
} from '../../../test/builders';
import { createIdentityEuler } from '../../../utils/sim3dTransforms';
import { useTransformPanelStoreFacade } from './useTransformPanelStoreFacade';

describe('useTransformPanelStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    usePointPickingStore.setState(usePointPickingStore.getInitialState(), true);
  });

  it('collects transform-panel dependencies from owning stores', () => {
    const reconstruction = buildReconstruction();
    const wasmReconstruction = buildWasmReconstructionWrapper({
      positions: new Float32Array([0, 0, 0]),
    });
    const droppedFiles = new Map([['sparse/0/images.bin', buildFile('images.bin')]]);
    const transform = {
      ...createIdentityEuler(),
      scale: 2,
      rotationY: 0.5,
    };
    useReconstructionStore.setState({
      reconstruction,
      wasmReconstruction,
      droppedFiles,
    });
    useTransformStore.setState({ transform });
    useUIStore.setState({ showGizmo: true });
    usePointPickingStore.setState({ pickingMode: 'distance-2pt' });

    const { result } = renderHook(() => useTransformPanelStoreFacade());

    expect(result.current.data).toMatchObject({
      reconstruction,
      wasmReconstruction,
      droppedFiles,
    });
    expect(result.current.transform.transform).toBe(transform);
    expect(result.current.ui.showGizmo).toBe(true);
    expect(result.current.pointPicking.pickingMode).toBe('distance-2pt');
    expect(typeof result.current.actions.applyTransformPreset).toBe('function');
    expect(typeof result.current.actions.applyTransformToData).toBe('function');
  });

  it('routes transform, UI, and point-picking actions back to owning stores', () => {
    const { result } = renderHook(() => useTransformPanelStoreFacade());

    act(() => {
      result.current.transform.setTransform({ scale: 3, translationX: 4 });
      result.current.ui.toggleGizmo();
      result.current.pointPicking.setPickingMode('normal-3pt');
    });

    expect(useTransformStore.getState().transform).toMatchObject({
      scale: 3,
      translationX: 4,
    });
    expect(useUIStore.getState().showGizmo).toBe(true);
    expect(usePointPickingStore.getState().pickingMode).toBe('normal-3pt');

    act(() => {
      result.current.transform.resetTransform();
      result.current.pointPicking.setPickingMode('normal-3pt');
    });

    expect(useTransformStore.getState().transform).toEqual(createIdentityEuler());
    expect(usePointPickingStore.getState()).toMatchObject({
      pickingMode: 'normal-3pt',
      selectedPoints: [],
      targetDistance: null,
    });
  });
});
