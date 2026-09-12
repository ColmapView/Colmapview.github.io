import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore, useTrainingStore, useUIStore } from '../../store';
import { useTrainingDockStoreFacade, useTrainingToggleStoreFacade } from './useTrainingStoreFacade';

describe('training presentation store facades', () => {
  beforeEach(() => {
    useTrainingStore.setState(useTrainingStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });
  it('subscribes to recovery receipts and exposes explicit actions', () => {
    const { result } = renderHook(useTrainingDockStoreFacade);
    act(() => useTrainingStore.setState({ datasetId: 'dataset', attemptSnapshotId: 'snapshot' }));
    expect(result.current.datasetId).toBe('dataset');
    expect(result.current.attemptSnapshotId).toBe('snapshot');
    expect(result.current.resetAttempt).toBe(useTrainingStore.getState().resetAttempt);
    expect(result.current.pointCount).toBe(0);
  });
  it('toggles the dock and observes embed restrictions', () => {
    const { result } = renderHook(useTrainingToggleStoreFacade);
    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);
    act(() => useUIStore.setState({ embedMode: true }));
    expect(result.current.embedMode).toBe(true);
  });
});
