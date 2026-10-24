import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCameraVideoCache } from '../../dataset/video/cameraVideoCache';
import type { CameraVideoSource } from '../../dataset/video/types';
import { useCameraVideoWindow } from './useCameraVideoWindow';

vi.mock('../../dataset/video/cameraVideoCache', () => ({ createCameraVideoCache: vi.fn() }));
const lifetime = new AbortController();
const source = (name: string): CameraVideoSource => ({ url: `https://media.test/${name}.mp4`, bytes: 3,
  timestamp: 0, width: 64, height: 80, signal: lifetime.signal });
const [a, b, c] = ['a', 'b', 'c'].map(source);
beforeEach(() => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.mocked(createCameraVideoCache).mockImplementation(() => ({ setWindow: vi.fn(), clear: vi.fn(async () => {}), acquire: vi.fn() }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

it('keeps one cache through camera navigation and clears it when video mode ends', () => {
  const { result, rerender } = renderHook(({ enabled, current }) => useCameraVideoWindow(enabled, current, a, c),
    { initialProps: { enabled: true, current: a } });
  const cache = result.current;
  expect(cache.setWindow).toHaveBeenLastCalledWith(a, [c, a], true);
  rerender({ enabled: true, current: b });
  expect(result.current).toBe(cache); expect(cache.clear).not.toHaveBeenCalled();
  expect(cache.setWindow).toHaveBeenLastCalledWith(b, [c, a], true);
  rerender({ enabled: false, current: b }); expect(cache.clear).toHaveBeenCalledOnce();
});

it('does not prefetch for ordinary still-image details', () => {
  const { result } = renderHook(() => useCameraVideoWindow(false, a, b, c));
  expect(result.current.setWindow).not.toHaveBeenCalled();
  expect(result.current.acquire).not.toHaveBeenCalled();
});

it('pauses only background transfers while hidden and restores the same navigation window', () => {
  const { result } = renderHook(() => useCameraVideoWindow(true, a, b, c));
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  fireEvent(document, new Event('visibilitychange'));
  expect(result.current.setWindow).toHaveBeenLastCalledWith(a, [c, b], false);
  hidden.mockReturnValue(false); fireEvent(document, new Event('visibilitychange'));
  expect(result.current.setWindow).toHaveBeenLastCalledWith(a, [c, b], true);
  expect(result.current.clear).not.toHaveBeenCalled();
});

it('clears the window on scene disposal and creates a separate cache for a new scene', () => {
  const owner = new AbortController(), current = { ...a, signal: owner.signal };
  const { result, rerender } = renderHook(({ item }) => useCameraVideoWindow(true, item, undefined, undefined),
    { initialProps: { item: current } });
  const cache = result.current;
  act(() => owner.abort()); expect(cache.clear).toHaveBeenCalledOnce();
  rerender({ item: a }); expect(result.current).not.toBe(cache);
});

it('establishes the window under StrictMode and clears it on unmount', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
  const { result, unmount } = renderHook(() => useCameraVideoWindow(true, a, b, c), { wrapper });
  expect(result.current.setWindow).toHaveBeenLastCalledWith(a, [c, b], true);
  unmount(); expect(result.current.clear).toHaveBeenCalled();
});
