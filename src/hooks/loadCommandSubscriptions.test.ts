import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReconstructionStore } from '../store/reconstructionStore';
import { useFileDropzone } from './useFileDropzone';
import { useUrlLoadActions, useUrlLoader } from './useUrlLoader';
import { useTransformGizmoStoreFacade } from '../components/viewer3d/useTransformGizmoStoreFacade';

beforeEach(() => useReconstructionStore.setState(useReconstructionStore.getInitialState(), true));
afterEach(() => { cleanup(); useReconstructionStore.getState().clear(); });

describe('load command subscriptions', () => {
  it.each([
    { name: 'file commands', useCommands: useFileDropzone },
    { name: 'URL commands', useCommands: useUrlLoadActions },
    { name: 'transform gizmo', useCommands: useTransformGizmoStoreFacade },
  ])('$name does not render for unrelated loading progress', ({ useCommands }) => {
    const render = vi.fn();
    renderHook(() => { render(); return useCommands(); });
    const initialRenders = render.mock.calls.length;
    for (let percent = 0; percent < 10; percent++) {
      act(() => useReconstructionStore.getState().setUrlProgress({ percent, message: 'Downloading…' }));
    }
    expect(render).toHaveBeenCalledTimes(initialRenders);
  });

  it('keeps UI status reactive while load callbacks stay stable', () => {
    const { result } = renderHook(() => useUrlLoader());
    const { loadFromUrl, loadFromManifest } = result.current;
    const progress = { percent: 23, message: 'Downloading…' };
    act(() => {
      useReconstructionStore.getState().setUrlLoading(true);
      useReconstructionStore.getState().setUrlProgress(progress);
    });
    expect(result.current.urlLoading).toBe(true);
    expect(result.current.urlProgress).toBe(progress);
    expect(result.current.loadFromUrl).toBe(loadFromUrl);
    expect(result.current.loadFromManifest).toBe(loadFromManifest);
  });
});
