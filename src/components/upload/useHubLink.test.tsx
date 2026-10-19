import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hubPublications } from '../../features/colmapviewHub/publication';
import { useHubLink } from './useHubLink';

afterEach(() => { vi.restoreAllMocks(); });

describe('useHubLink', () => {
  it('tells the controller whether the dialog is open, so a finished link toasts only while it is closed', () => {
    const setDialogOpen = vi.spyOn(hubPublications.bucket, 'setDialogOpen');
    const { rerender, unmount } = renderHook(({ open }) => useHubLink('bucket', open), { initialProps: { open: true } });
    expect(setDialogOpen).toHaveBeenLastCalledWith(true);
    rerender({ open: false });
    expect(setDialogOpen).toHaveBeenLastCalledWith(false);
    rerender({ open: true });
    unmount();
    expect(setDialogOpen).toHaveBeenLastCalledWith(false);
  });

  it('reports the controller busy while it checks access or creates a link, so Publish waits', () => {
    vi.spyOn(hubPublications.googleDrive, 'getSnapshot').mockReturnValue({ phase: 'checking', viewerUrl: 'https://viewer.example/' });
    const isBusy = vi.spyOn(hubPublications.googleDrive, 'isBusy').mockReturnValue(true);
    const { result } = renderHook(() => useHubLink('googleDrive', true));
    expect(result.current.busy).toBe(true);
    expect(result.current.state.phase).toBe('checking');
    isBusy.mockReturnValue(false);
    expect(renderHook(() => useHubLink('googleDrive', true)).result.current.busy).toBe(false);
  });

  it('passes the retry action through', () => {
    const { result } = renderHook(() => useHubLink('huggingFace', false));
    expect(result.current.retry).toBe(hubPublications.huggingFace.retry);
  });
});
