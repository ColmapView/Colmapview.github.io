import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { useFrustumTextureCachePause } from './useFrustumTextureCachePause';

const frame = vi.hoisted(() => ({ tick: () => {}, pause: vi.fn(), resume: vi.fn() }));
vi.mock('@react-three/fiber', () => ({ useFrame: (callback: () => void) => { frame.tick = callback; } }));
vi.mock('../../hooks/useFrustumTexture', () => ({ pauseFrustumTextureCache: frame.pause, resumeFrustumTextureCache: frame.resume }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('texture prefetch pause lifecycle', () => {
  it('resumes after the last movement without requiring a settling render', () => {
    vi.useFakeTimers();
    const camera = new THREE.PerspectiveCamera();
    const { unmount } = renderHook(() => useFrustumTextureCachePause({ camera, debounceMs: 100 }));
    camera.position.x = 1;
    act(() => frame.tick());
    expect(frame.pause).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(90));
    camera.position.x = 2;
    act(() => frame.tick());
    act(() => vi.advanceTimersByTime(90));
    expect(frame.resume).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(10));
    expect(frame.resume).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    unmount();
    expect(frame.resume).toHaveBeenCalledOnce();
  });

  it('releases its pause and timer on unmount', () => {
    vi.useFakeTimers();
    const camera = new THREE.PerspectiveCamera();
    const { unmount } = renderHook(() => useFrustumTextureCachePause({ camera, debounceMs: 100 }));
    camera.position.x = 1;
    act(() => frame.tick());
    unmount();
    expect(frame.resume).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
