import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePublicationPreview } from './usePublicationPreview';
import type { ScreenshotCallback } from '../../store/stores/exportStore';

vi.mock('../../features/datasetPublishing/publicationPreview', async importOriginal => {
  const actual = await importOriginal<typeof import('../../features/datasetPublishing/publicationPreview')>();
  return { ...actual, createPublicationPreview: () => actual.createPublicationPreview(async blob => blob as File) };
});
const png = () => new File(['preview'], 'preview.png', { type: 'image/png' });

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${Math.random()}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('usePublicationPreview', () => {
  it('captures on opening and refreshes the current view on reopening', async () => {
    const capture = vi.fn().mockImplementation(async () => png());
    const { result, rerender } = renderHook(({ enabled }) => usePublicationPreview('source', enabled, capture), { initialProps: { enabled: false } });
    expect(capture).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.url).toBeTruthy());
    const first = result.current.file;
    rerender({ enabled: false });
    expect(result.current.file).toBe(first);
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.file).not.toBe(first));
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it('retains a custom image on reopening and resets it for a new source', async () => {
    const capture = vi.fn().mockImplementation(async () => png());
    const { result, rerender } = renderHook(({ source, enabled }) => usePublicationPreview(source, enabled, capture), {
      initialProps: { source: 'first', enabled: true },
    });
    await waitFor(() => expect(result.current.file).toBeTruthy());
    const custom = png();
    await act(async () => result.current.replace(custom));
    rerender({ source: 'first', enabled: false });
    rerender({ source: 'first', enabled: true });
    expect(result.current.file).toBe(custom);
    expect(capture).toHaveBeenCalledOnce();
    rerender({ source: 'second', enabled: true });
    expect(result.current.file).toBeNull();
    await waitFor(() => expect(result.current.file).toBeTruthy());
    expect(result.current.kind).toBe('view');
    expect(result.current.file).not.toBe(custom);
  });

  it('waits for the viewer capture callback and freezes the image while publishing', async () => {
    const capture = vi.fn().mockImplementation(async () => png());
    const { result, rerender } = renderHook(({ enabled, getter }: { enabled: boolean; getter: ScreenshotCallback | null }) =>
      usePublicationPreview('source', enabled, getter), { initialProps: { enabled: true, getter: null } });
    expect(result.current.file).toBeNull();
    rerender({ enabled: true, getter: capture });
    await waitFor(() => expect(result.current.file).toBeTruthy());
    const published = result.current.file;
    const updatedCapture = vi.fn().mockImplementation(async () => png());
    rerender({ enabled: false, getter: updatedCapture });
    expect(result.current.file).toBe(published);
    expect(updatedCapture).not.toHaveBeenCalled();
  });
});
