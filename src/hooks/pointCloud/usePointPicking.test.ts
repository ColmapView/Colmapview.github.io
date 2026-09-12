import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { subscribeSceneRenderInvalidation } from '../../utils/sceneRenderInvalidation';
import { usePointPicking } from './usePointPicking';

const frame = vi.hoisted(() => ({ tick: () => {}, state: {} as Record<string, unknown> }));
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: () => void) => { frame.tick = callback; },
  useThree: () => frame.state,
}));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('point hover demand wake', () => {
  it('completes a throttled final pointer position after pointer movement stops', () => {
    vi.useFakeTimers();
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);
    const raycaster = new THREE.Raycaster();
    const intersect = vi.spyOn(raycaster, 'intersectObject').mockReturnValue([]);
    const camera = new THREE.PerspectiveCamera();
    camera.updateMatrixWorld();
    frame.state = { gl: { domElement: canvas }, camera, raycaster };
    const wake = vi.fn();
    const unsubscribe = subscribeSceneRenderInvalidation(wake);
    const { result, unmount } = renderHook(() => usePointPicking({
      pickingMode: 'distance-2pt', selectedPointsLength: 0, pointSize: 2,
      indexToPoint3DIdRef: { current: new Map() }, addSelectedPoint: vi.fn(), setHoveredPoint: vi.fn(),
    }));
    act(() => { result.current.pointsRef.current = new THREE.Points(); });
    canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 }));
    expect(wake).toHaveBeenCalled();
    act(() => frame.tick());
    expect(intersect).toHaveBeenCalledOnce();
    now += 10;
    canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 30 }));
    act(() => frame.tick());
    expect(intersect).toHaveBeenCalledOnce();
    wake.mockClear();
    now += 70;
    act(() => vi.advanceTimersByTime(70));
    expect(wake).toHaveBeenCalledOnce();
    act(() => frame.tick());
    expect(intersect).toHaveBeenCalledTimes(2);
    unmount();
    unsubscribe();
  });
});
