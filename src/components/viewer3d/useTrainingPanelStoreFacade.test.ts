import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTrainingStore } from '../../store';
import { subscribeToTrainingPanelOpen, useTrainingPanelStoreFacade } from './useTrainingPanelStoreFacade';
import { useViewerControlPanelState } from './useViewerControlPanelState';

describe('training panel store boundary', () => {
  beforeEach(() => {
    useTrainingStore.setState(useTrainingStore.getInitialState(), true);
  });

  it('exposes reactive popup state and the existing store action', () => {
    const { result } = renderHook(useTrainingPanelStoreFacade);
    expect(result.current.trainingOpen).toBe(false);
    expect(result.current.setTrainingOpen).toBe(useTrainingStore.getState().setDockOpen);
    act(() => result.current.setTrainingOpen(true));
    expect(result.current.trainingOpen).toBe(true);
  });

  it('notifies only on opening transitions and unsubscribes', () => {
    const opened = vi.fn();
    const unsubscribe = subscribeToTrainingPanelOpen(opened);
    useTrainingStore.getState().setDockOpen(true);
    useTrainingStore.getState().setDockOpen(true);
    useTrainingStore.getState().setDockOpen(false);
    expect(opened).toHaveBeenCalledTimes(1);
    unsubscribe();
    useTrainingStore.getState().setDockOpen(true);
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('switches between training and ordinary panels without reviving a stale panel', () => {
    const { result } = renderHook(useViewerControlPanelState);
    act(() => result.current.setActivePanel('settings'));
    expect(result.current.activePanel).toBe('settings');
    act(() => useTrainingStore.getState().setDockOpen(true));
    expect(result.current.activePanel).toBe('training');
    act(() => useTrainingStore.getState().setDockOpen(false));
    expect(result.current.activePanel).toBeNull();
    act(() => result.current.setActivePanel('training'));
    expect(result.current.activePanel).toBe('training');
    act(() => result.current.setActivePanel('settings'));
    expect(result.current.activePanel).toBe('settings');
    expect(useTrainingStore.getState().dockOpen).toBe(false);
  });
});
