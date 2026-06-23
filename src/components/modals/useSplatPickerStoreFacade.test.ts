import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store';
import { useSplatPickerStoreFacade } from './useSplatPickerStoreFacade';

describe('useSplatPickerStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  });

  it('exposes splat picker state and toggling', () => {
    const { result } = renderHook(() => useSplatPickerStoreFacade());
    expect(result.current.showSplatPicker).toBe(false);
    expect(result.current.splatFileSources).toEqual([]);

    act(() => result.current.setShowSplatPicker(true));

    expect(useReconstructionStore.getState().showSplatPicker).toBe(true);
    expect(result.current.showSplatPicker).toBe(true);
  });

  it('reflects splat sources from loadedFiles', () => {
    useReconstructionStore.setState({
      loadedFiles: {
        imageFiles: new Map(),
        hasMasks: false,
        splatFileSources: [{ id: 'a', path: 'a.ply', url: 'u/a' }],
      },
    });

    const { result } = renderHook(() => useSplatPickerStoreFacade());

    expect(result.current.splatFileSources.map((s) => s.id)).toEqual(['a']);
  });

  it('invokes selectSplatSource through the facade (COLMAP-only clears the splat)', async () => {
    const splatFile = new File(['a'], 'a.ply');
    useReconstructionStore.setState({
      loadedFiles: {
        imageFiles: new Map(),
        hasMasks: false,
        splatFile,
        splatFiles: [splatFile],
        splatFileSources: [{ id: 'a', path: 'a.ply', url: 'u/a', file: splatFile }],
      },
      urlLoading: true,
    });

    const { result } = renderHook(() => useSplatPickerStoreFacade());
    await act(async () => {
      await result.current.selectSplatSource('');
    });

    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(useReconstructionStore.getState().urlLoading).toBe(false);
  });
});
