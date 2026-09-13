import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { subscribeSceneRenderInvalidation } from '../../utils/sceneRenderInvalidation';
import { useFrustumPlaneViewAngleCulling } from './useFrustumPlaneViewAngleCulling';

const frame = vi.hoisted(() => ({ tick: () => {} }));
vi.mock('@react-three/fiber', () => ({ useFrame: (callback: () => void) => { frame.tick = callback; } }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('plane culling under demand rendering', () => {
  it('updates the last dirty pose after the deadline even when no further control frames arrive', () => {
    vi.useFakeTimers();
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, -10);
    const setViewAngleOk = vi.fn();
    const wake = vi.fn();
    const unsubscribe = subscribeSceneRenderInvalidation(wake);
    const { unmount } = renderHook(() => useFrustumPlaneViewAngleCulling({
      enabled: true, isSelected: false, camera, groupRef: { current: new THREE.Group() },
      scale: 1, cullAngleThreshold: 0.5, viewAngleOk: true, setViewAngleOk, frameSeed: 4,
    }));
    act(() => frame.tick());
    expect(setViewAngleOk).not.toHaveBeenCalled();
    camera.position.z = 10;
    now += 20;
    wake.mockClear();
    act(() => frame.tick());
    expect(setViewAngleOk).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    now += 60;
    act(() => vi.advanceTimersByTime(60));
    expect(wake).toHaveBeenCalledOnce();
    act(() => frame.tick());
    expect(setViewAngleOk).toHaveBeenCalledWith(false);
    unmount();
    unsubscribe();
  });
});
