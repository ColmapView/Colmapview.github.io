import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCancellableExport } from './useCancellableExport';

describe('export run ownership', () => {
  it('starts only one operation when download is invoked twice before a render', async () => {
    const source = {};
    const { result } = renderHook(() => useCancellableExport(source));
    let finish!: () => void;
    const operation = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    let first!: Promise<void>;
    act(() => {
      first = result.current.run(operation);
      void result.current.run(operation);
    });
    expect(operation).toHaveBeenCalledOnce();
    await act(async () => { finish(); await first; });
    expect(result.current.progress).toBeNull();
  });

  it('cancels immediately, allows a retry, and ignores progress and completion from the cancelled run', async () => {
    const source = {};
    const { result } = renderHook(() => useCancellableExport(source));
    let oldSignal!: AbortSignal;
    let oldProgress!: (percent: number | null) => void;
    let finishOld!: () => void;
    let finishNew!: () => void;
    let oldRun!: Promise<void>;
    let newRun!: Promise<void>;
    act(() => {
      oldRun = result.current.run((signal, progress) => {
        oldSignal = signal;
        oldProgress = progress;
        return new Promise(resolve => { finishOld = resolve; });
      });
    });
    expect(result.current.progress).toBe(0);
    act(() => result.current.cancel());
    expect(oldSignal.aborted).toBe(true);
    expect(result.current.progress).toBeNull();
    act(() => {
      newRun = result.current.run((_signal, progress) => {
        progress(40);
        return new Promise(resolve => { finishNew = resolve; });
      });
    });
    await act(async () => { oldProgress(90); finishOld(); await oldRun; });
    expect(result.current.progress).toBe(40);
    await act(async () => { finishNew(); await newRun; });
    expect(result.current.progress).toBeNull();
  });

  it('cancels on source replacement and unmount', () => {
    const signals: AbortSignal[] = [];
    const { result, rerender, unmount } = renderHook(useCancellableExport, { initialProps: {} });
    const start = () => act(() => {
      void result.current.run(signal => { signals.push(signal); return new Promise(() => {}); });
    });
    start();
    rerender({});
    expect(signals[0].aborted).toBe(true);
    expect(result.current.progress).toBeNull();
    start();
    unmount();
    expect(signals[1].aborted).toBe(true);
  });
});
