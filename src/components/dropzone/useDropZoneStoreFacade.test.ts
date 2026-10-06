import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store/reconstructionStore';
import { useUIStore } from '../../store/stores/uiStore';
import { buildReconstruction } from '../../test/builders/colmapBuilders';
import { useDropZoneStoreFacade } from './useDropZoneStoreFacade';

describe('useDropZoneStoreFacade', () => {
  it('cancels an active URL request and clears its loading state', () => {
    const signal = useReconstructionStore.getState().tryStartUrlLoad()!;
    useReconstructionStore.getState().setUrlLoading(true);
    const { result } = renderHook(() => useDropZoneStoreFacade());
    act(() => { result.current.actions.clear(); });
    expect(signal.aborted).toBe(true);
    expect(useReconstructionStore.getState().urlLoading).toBe(false);
    expect(useReconstructionStore.getState().urlLoadActive).toBe(false);
  });
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });
  afterEach(() => { window.history.replaceState(null, '', '/'); });

  it('restores dataset controls after a private shared link fails, even after its toast clears', () => {
    window.history.replaceState(null, '', '/?url=https%3A%2F%2Fhuggingface.co%2Fdatasets%2Fowner%2Fprivate');
    const { result } = renderHook(() => useDropZoneStoreFacade());
    expect(result.current.data.hasUrlLoadRequest).toBe(true);

    act(() => {
      useReconstructionStore.getState().setUrlError({ type: 'unknown', message: 'Sign in with Hugging Face.' });
    });
    expect(result.current.data.hasUrlLoadRequest).toBe(false);

    act(() => { result.current.actions.setError(null); });
    expect(result.current.data.hasUrlLoadRequest).toBe(false);
    expect(window.location.search).toContain('owner%2Fprivate');

    act(() => { useReconstructionStore.getState().setUrlError(null); });
    expect(result.current.data.hasUrlLoadRequest).toBe(true);
  });

  it('collects drop-zone dependencies from owning stores', () => {
    const reconstruction = buildReconstruction();

    useReconstructionStore.setState({
      error: 'Failed to load data',
      reconstruction,
    });
    useUIStore.setState({ touchMode: true });

    const { result } = renderHook(() => useDropZoneStoreFacade());

    expect(result.current.data).toMatchObject({
      error: 'Failed to load data',
      reconstruction,
      touchMode: true,
    });
    expect(result.current.data.hasUrlLoadRequest).toBe(false);
  });

  it('routes error updates back to the reconstruction store', () => {
    useReconstructionStore.setState({ error: 'Old error' });

    const { result } = renderHook(() => useDropZoneStoreFacade());

    act(() => {
      result.current.actions.setError(null);
    });

    expect(useReconstructionStore.getState().error).toBeNull();
  });
});
