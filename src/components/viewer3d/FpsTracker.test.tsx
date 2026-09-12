import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../../store';
import { FpsTracker } from './FpsTracker';
import { subscribeSceneRenderStores } from './useSceneRenderStoreFacade';

const frame = vi.hoisted(() => ({ tick: () => {} }));
vi.mock('@react-three/fiber', () => ({ useFrame: (callback: () => void) => { frame.tick = callback; } }));
afterEach(() => vi.useRealTimers());

describe('FPS observer in a settled scene', () => {
  it('reports zero after idle without generating scene wakes', () => {
    vi.useFakeTimers();
    useUIStore.setState({ fps: 60 });
    const wake = vi.fn();
    const unsubscribe = subscribeSceneRenderStores(wake);
    const { unmount } = render(<FpsTracker />);
    act(() => vi.advanceTimersByTime(2000));
    expect(useUIStore.getState().fps).toBe(0);
    expect(wake).not.toHaveBeenCalled();
    unmount();
    unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
  });
});
