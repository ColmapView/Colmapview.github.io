import { describe, expect, it, vi } from 'vitest';
import { PreviewController, type PreviewResource, type PreviewTarget } from './previewController';
import type { TrainingPreviewFrame } from './types';

function barrier<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function frame(version: number): TrainingPreviewFrame {
  return { file: new File(['ply'], `frame-${version}.ply`), etag: `"job:${version}"`,
    optimizerStep: version, imageExposures: version, capturedAt: null };
}

function target(fetch: PreviewTarget['fetch']): PreviewTarget {
  return { jobId: 'job', snapshotId: 'snapshot', fetch, isCurrent: () => true, onFrame: vi.fn(), onError: vi.fn() };
}

describe('preview resource ownership (VIEW-01/02)', () => {
  it('keeps download and delayed decode in the same single flight', async () => {
    const controller = new PreviewController();
    const decode = barrier<PreviewResource>();
    const fetch = vi.fn(async () => frame(1));
    const resource = { commit: vi.fn(), dispose: vi.fn() };
    controller.setTarget(target(fetch));
    controller.bindRenderer({ decode: () => decode.promise });
    const pending = controller.tick();
    await Promise.resolve();
    expect(controller.tick()).toBe(pending);
    expect(fetch).toHaveBeenCalledTimes(1);
    decode.resolve(resource);
    await pending;
    expect(resource.commit).toHaveBeenCalledTimes(1);
    controller.dispose();
    expect(resource.dispose).toHaveBeenCalledTimes(1);
  });

  it.each(['job', 'renderer', 'source', 'hidden'] as const)('disposes a late decode after %s changes', async (change) => {
    const controller = new PreviewController();
    const decode = barrier<PreviewResource>();
    const resource = { commit: vi.fn(), dispose: vi.fn() };
    let current = true;
    const source = { ...target(async () => frame(1)), isCurrent: () => current };
    const decoding = barrier<void>();
    controller.setTarget(source);
    controller.bindRenderer({ decode: () => { decoding.resolve(); return decode.promise; } });
    const pending = controller.tick();
    await decoding.promise;
    if (change === 'job') controller.setTarget(target(async () => frame(2)));
    if (change === 'renderer') controller.bindRenderer({ decode: async () => resource });
    if (change === 'source') current = false;
    if (change === 'hidden') controller.setEnabled(false);
    decode.resolve(resource);
    await pending;
    expect(resource.commit).not.toHaveBeenCalled();
    expect(resource.dispose).toHaveBeenCalledTimes(1);
  });

  it('waits for stale decode disposal, commits final once, and never fetches preview afterward', async () => {
    const controller = new PreviewController();
    const delayed = barrier<PreviewResource>();
    const stale = { commit: vi.fn(), dispose: vi.fn() };
    const final = { commit: vi.fn(), dispose: vi.fn() };
    const fetch = vi.fn(async () => frame(1));
    const decoding = barrier<void>();
    const decode = vi.fn().mockImplementationOnce(() => { decoding.resolve(); return delayed.promise; }).mockResolvedValue(final);
    controller.setTarget(target(fetch));
    controller.bindRenderer({ decode });
    void controller.tick();
    await decoding.promise;
    const loaded = controller.loadFinal(new File(['ply'], 'final.ply'), () => true);
    void controller.tick();
    expect(decode).toHaveBeenCalledTimes(1);
    delayed.resolve(stale);
    expect(await loaded).toBe(true);
    expect(stale.commit).not.toHaveBeenCalled();
    expect(stale.dispose).toHaveBeenCalledTimes(1);
    expect(final.commit).toHaveBeenCalledTimes(1);
    await controller.tick();
    expect(fetch).toHaveBeenCalledTimes(1);
    controller.dispose();
    expect(final.dispose).toHaveBeenCalledTimes(1);
  });

  it('ignores non-new versions and retains last good frame on decode failure', async () => {
    const controller = new PreviewController();
    const resource = { commit: vi.fn(), dispose: vi.fn() };
    const source = target(vi.fn().mockResolvedValueOnce(frame(2)).mockResolvedValueOnce(frame(1)).mockResolvedValue(frame(3)));
    const decode = vi.fn().mockResolvedValueOnce(resource).mockRejectedValue(new Error('bad geometry'));
    controller.setTarget(source);
    controller.bindRenderer({ decode });
    await controller.tick();
    await controller.tick();
    await controller.tick();
    expect(decode).toHaveBeenCalledTimes(2);
    expect(resource.dispose).not.toHaveBeenCalled();
    expect(source.onError).toHaveBeenCalledWith('bad geometry');
    controller.dispose();
  });

  it('a rejected full cloud preserves the displayed preview and never commits final state', async () => {
    const controller = new PreviewController();
    const resource = { commit: vi.fn(), dispose: vi.fn() };
    const decode = vi.fn().mockResolvedValueOnce(resource).mockRejectedValue(new Error('device binding limit'));
    controller.setTarget(target(async () => frame(1)));
    controller.bindRenderer({ decode });
    await controller.tick();
    await expect(controller.loadFinal(new File(['ply'], 'final.ply'), () => true)).rejects.toThrow('device binding limit');
    expect(controller.inspect()).toMatchObject({ displayedResources: 1, final: false, inFlight: 0 });
    expect(resource.dispose).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('renderer change during final preparation disposes late resources without final adoption', async () => {
    const controller = new PreviewController();
    const delayed = barrier<PreviewResource>();
    const started = barrier<void>();
    const stale = { commit: vi.fn(), dispose: vi.fn() };
    controller.bindRenderer({ decode: () => { started.resolve(); return delayed.promise; } });
    const loading = controller.loadFinal(new File(['ply'], 'final.ply'), () => true);
    await started.promise;
    controller.bindRenderer({ decode: vi.fn() });
    delayed.resolve(stale);
    expect(await loading).toBe(false);
    expect(stale.commit).not.toHaveBeenCalled();
    expect(stale.dispose).toHaveBeenCalledTimes(1);
    expect(controller.inspect().final).toBe(false);
    controller.dispose();
  });

  it('restores the latest terminal publication on renderer bind without restarting network polling', async () => {
    const controller = new PreviewController();
    const first = frame(1);
    const latest = frame(2);
    const firstResource = { commit: vi.fn(), dispose: vi.fn() };
    const latestResource = { commit: vi.fn(), dispose: vi.fn() };
    const restoredResource = { commit: vi.fn(), dispose: vi.fn() };
    const fetch = vi.fn().mockResolvedValueOnce(first).mockResolvedValue(latest);
    const source = target(fetch);
    controller.setTarget(source);
    const unbind = controller.bindRenderer({
      decode: vi.fn().mockResolvedValueOnce(firstResource).mockResolvedValue(latestResource),
    });
    await controller.tick();
    await controller.tick();
    controller.setEnabled(false);
    unbind();
    expect(firstResource.dispose).toHaveBeenCalledTimes(1);
    expect(latestResource.dispose).toHaveBeenCalledTimes(1);

    const started = barrier<void>();
    const decode = vi.fn(async () => { started.resolve(); return restoredResource; });
    controller.bindRenderer({ decode });
    // Binding alone starts restoration; terminal callers need not schedule ticks.
    await started.promise;
    await controller.tick();
    expect(decode).toHaveBeenCalledWith(latest.file, expect.any(Function));
    expect(restoredResource.commit).toHaveBeenCalledTimes(1);
    expect(controller.inspect()).toMatchObject({ displayedResources: 1, version: 2, inFlight: 0 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(source.onFrame).toHaveBeenCalledTimes(2);

    controller.setEnabled(true);
    await controller.tick();
    expect(fetch).toHaveBeenLastCalledWith(latest.etag, expect.any(AbortSignal));
    expect(decode).toHaveBeenCalledTimes(1);
    controller.dispose();
    expect(restoredResource.dispose).toHaveBeenCalledTimes(1);
  });

  it('restores after repeated terminal preview toggles and disposes each renderer resource once', async () => {
    const controller = new PreviewController();
    const publication = frame(1);
    const fetch = vi.fn(async () => publication);
    const resources = Array.from({ length: 4 }, () => ({ commit: vi.fn(), dispose: vi.fn() }));
    controller.setTarget(target(fetch));
    let unbind = controller.bindRenderer({ decode: async () => resources[0] });
    await controller.tick();
    controller.setEnabled(false);
    for (const resource of resources.slice(1)) {
      const oldUnbind = unbind;
      oldUnbind();
      controller.setEnabled(false);
      const decode = vi.fn(async () => resource);
      unbind = controller.bindRenderer({ decode });
      oldUnbind();
      await controller.tick();
      expect(decode).toHaveBeenCalledWith(publication.file, expect.any(Function));
      expect(resource.commit).toHaveBeenCalledTimes(1);
      expect(resource.dispose).not.toHaveBeenCalled();
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    controller.dispose();
    controller.dispose();
    unbind();
    for (const resource of resources) expect(resource.dispose).toHaveBeenCalledTimes(1);
    const decode = vi.fn();
    controller.bindRenderer({ decode });
    await controller.tick();
    expect(decode).not.toHaveBeenCalled();
    controller.dispose();
  });

  it.each(['job', 'snapshot', 'target generation'] as const)('clears retained bytes when the %s changes', async (change) => {
    const controller = new PreviewController();
    const resource = { commit: vi.fn(), dispose: vi.fn() };
    const oldFetch = vi.fn(async () => frame(8));
    controller.setTarget(target(oldFetch));
    const unbind = controller.bindRenderer({ decode: async () => resource });
    await controller.tick();
    controller.setEnabled(false);
    unbind();
    const source = target(vi.fn(async () => frame(1)));
    if (change === 'job') source.jobId = 'another-job';
    if (change === 'snapshot') source.snapshotId = 'another-snapshot';
    controller.setTarget(source);
    const decode = vi.fn(async () => ({ commit: vi.fn(), dispose: vi.fn() }));
    controller.bindRenderer({ decode });
    await controller.tick();
    expect(decode).not.toHaveBeenCalled();
    expect(oldFetch).toHaveBeenCalledTimes(1);
    expect(source.fetch).not.toHaveBeenCalled();
    expect(controller.inspect().version).toBe(-1);
    controller.setEnabled(true);
    await controller.tick();
    expect(source.fetch).toHaveBeenCalledWith(null, expect.any(AbortSignal));
    expect(decode).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it('waits for a blocked newer decode before restoring only the committed publication', async () => {
    const controller = new PreviewController();
    const publication = frame(1);
    const current = { commit: vi.fn(), dispose: vi.fn() };
    const stale = { commit: vi.fn(), dispose: vi.fn() };
    const restored = { commit: vi.fn(), dispose: vi.fn() };
    const delayed = barrier<PreviewResource>();
    const started = barrier<void>();
    const fetch = vi.fn().mockResolvedValueOnce(publication).mockResolvedValue(frame(2));
    controller.setTarget(target(fetch));
    const unbind = controller.bindRenderer({ decode: vi.fn().mockResolvedValueOnce(current)
      .mockImplementationOnce(() => { started.resolve(); return delayed.promise; }) });
    await controller.tick();
    const pending = controller.tick();
    await started.promise;
    controller.setEnabled(false);
    unbind();
    const decode = vi.fn(async () => restored);
    const oldUnbind = controller.bindRenderer({ decode: vi.fn() });
    controller.bindRenderer({ decode });
    oldUnbind();
    expect(controller.tick()).toBe(pending);
    expect(decode).not.toHaveBeenCalled();
    delayed.resolve(stale);
    await pending;
    await controller.tick();
    expect(stale.commit).not.toHaveBeenCalled();
    expect(stale.dispose).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledWith(publication.file, expect.any(Function));
    expect(restored.commit).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(controller.inspect().version).toBe(1);
    controller.dispose();
  });

  it.each(['target', 'snapshot validity', 'dispose'] as const)('rejects a blocked restoration after %s changes', async (change) => {
    const controller = new PreviewController();
    const current = { commit: vi.fn(), dispose: vi.fn() };
    const stale = { commit: vi.fn(), dispose: vi.fn() };
    const delayed = barrier<PreviewResource>();
    const started = barrier<void>();
    let sourceCurrent = true;
    const source = { ...target(async () => frame(1)), isCurrent: () => sourceCurrent };
    controller.setTarget(source);
    const unbind = controller.bindRenderer({ decode: async () => current });
    await controller.tick();
    controller.setEnabled(false);
    unbind();
    controller.bindRenderer({ decode: () => { started.resolve(); return delayed.promise; } });
    const pending = controller.tick();
    await started.promise;
    if (change === 'target') controller.setTarget(target(async () => frame(2)));
    if (change === 'snapshot validity') sourceCurrent = false;
    if (change === 'dispose') { controller.dispose(); controller.dispose(); }
    delayed.resolve(stale);
    await pending;
    expect(stale.commit).not.toHaveBeenCalled();
    expect(stale.dispose).toHaveBeenCalledTimes(1);
    expect(current.dispose).toHaveBeenCalledTimes(1);
    expect(source.onError).not.toHaveBeenCalled();
    expect(controller.inspect()).toMatchObject({ displayedResources: 0, inFlight: 0 });
    controller.dispose();
  });

  it('lets a final load supersede blocked restoration and restores only the final on later mounts', async () => {
    const controller = new PreviewController();
    const current = { commit: vi.fn(), dispose: vi.fn() };
    const stale = { commit: vi.fn(), dispose: vi.fn() };
    const final = { commit: vi.fn(), dispose: vi.fn() };
    const remounted = { commit: vi.fn(), dispose: vi.fn() };
    const delayed = barrier<PreviewResource>();
    const started = barrier<void>();
    const fetch = vi.fn(async () => frame(1));
    controller.setTarget(target(fetch));
    const unbind = controller.bindRenderer({ decode: async () => current });
    await controller.tick();
    unbind();
    const decode = vi.fn().mockImplementationOnce(() => { started.resolve(); return delayed.promise; })
      .mockResolvedValue(final);
    const unbindFinal = controller.bindRenderer({ decode });
    await started.promise;
    const file = new File(['ply'], 'final.ply');
    const loading = controller.loadFinal(file, () => true);
    delayed.resolve(stale);
    expect(await loading).toBe(true);
    expect(stale.commit).not.toHaveBeenCalled();
    expect(stale.dispose).toHaveBeenCalledTimes(1);
    expect(final.commit).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenLastCalledWith(file, expect.any(Function));
    unbindFinal();
    controller.setEnabled(true);
    const restore = vi.fn(async () => remounted);
    controller.bindRenderer({ decode: restore });
    await controller.tick();
    await controller.tick();
    expect(restore).toHaveBeenCalledExactlyOnceWith(file, expect.any(Function));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(final.dispose).toHaveBeenCalledTimes(1);
    controller.dispose();
    expect(remounted.dispose).toHaveBeenCalledTimes(1);
  });

  it('aborts a blocked fetch once and restores the retained frame when the late transport finishes', async () => {
    const controller = new PreviewController();
    const publication = frame(1);
    const current = { commit: vi.fn(), dispose: vi.fn() };
    const restored = { commit: vi.fn(), dispose: vi.fn() };
    const delayed = barrier<TrainingPreviewFrame>();
    const started = barrier<void>();
    const aborted = vi.fn();
    const fetch = vi.fn().mockResolvedValueOnce(publication).mockImplementationOnce((_: string | null, signal: AbortSignal) => {
      signal.addEventListener('abort', aborted);
      started.resolve();
      return delayed.promise;
    });
    controller.setTarget(target(fetch));
    const unbind = controller.bindRenderer({ decode: async () => current });
    await controller.tick();
    const pending = controller.tick();
    await started.promise;
    controller.setEnabled(false);
    controller.setEnabled(false);
    unbind();
    unbind();
    const decode = vi.fn(async () => restored);
    controller.bindRenderer({ decode });
    expect(aborted).toHaveBeenCalledTimes(1);
    expect(decode).not.toHaveBeenCalled();
    delayed.resolve(frame(2));
    await pending;
    await controller.tick();
    expect(decode).toHaveBeenCalledExactlyOnceWith(publication.file, expect.any(Function));
    expect(fetch).toHaveBeenCalledTimes(2);
    controller.dispose();
    expect(current.dispose).toHaveBeenCalledTimes(1);
    expect(restored.dispose).toHaveBeenCalledTimes(1);
  });

  it('retains committed bytes after a failed restore and retries only on another renderer bind', async () => {
    const controller = new PreviewController();
    const publication = frame(1);
    const current = { commit: vi.fn(), dispose: vi.fn() };
    const failed = { commit: vi.fn(() => { throw new Error('upload failed'); }), dispose: vi.fn() };
    const restored = { commit: vi.fn(), dispose: vi.fn() };
    const fetch = vi.fn(async () => publication);
    const source = target(fetch);
    controller.setTarget(source);
    const unbind = controller.bindRenderer({ decode: async () => current });
    await controller.tick();
    controller.setEnabled(false);
    unbind();
    const decode = vi.fn(async () => failed);
    controller.bindRenderer({ decode });
    await controller.tick();
    await controller.tick();
    expect(decode).toHaveBeenCalledTimes(1);
    expect(failed.dispose).toHaveBeenCalledTimes(1);
    expect(source.onError).toHaveBeenCalledExactlyOnceWith('upload failed');
    const retry = vi.fn(async () => restored);
    controller.bindRenderer({ decode: retry });
    await controller.tick();
    expect(retry).toHaveBeenCalledExactlyOnceWith(publication.file, expect.any(Function));
    expect(restored.commit).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it('keeps final precedence after failed restoration even if preview polling is enabled', async () => {
    const controller = new PreviewController();
    const current = { commit: vi.fn(), dispose: vi.fn() };
    const final = { commit: vi.fn(), dispose: vi.fn() };
    const restored = { commit: vi.fn(), dispose: vi.fn() };
    const fetch = vi.fn(async () => frame(1));
    controller.setTarget(target(fetch));
    const unbind = controller.bindRenderer({
      decode: vi.fn().mockResolvedValueOnce(current).mockResolvedValue(final),
    });
    await controller.tick();
    const file = new File(['ply'], 'final.ply');
    expect(await controller.loadFinal(file, () => true)).toBe(true);
    unbind();
    controller.setEnabled(true);
    const failed = vi.fn().mockRejectedValue(new Error('device unavailable'));
    controller.bindRenderer({ decode: failed });
    await controller.tick();
    await controller.tick();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(controller.inspect()).toMatchObject({ final: true, displayedResources: 0, inFlight: 0 });
    const retry = vi.fn(async () => restored);
    controller.bindRenderer({ decode: retry });
    await controller.tick();
    expect(retry).toHaveBeenCalledExactlyOnceWith(file, expect.any(Function));
    expect(restored.commit).toHaveBeenCalledTimes(1);
    controller.dispose();
    expect(current.dispose).toHaveBeenCalledTimes(1);
    expect(final.dispose).toHaveBeenCalledTimes(1);
    expect(restored.dispose).toHaveBeenCalledTimes(1);
  });

  it('bounds growth/prune replacement resources through 100 warmup + 500 soak frames', async () => {
    const controller = new PreviewController();
    let version = 0;
    let alive = 0;
    let peak = 0;
    let displayed = 0;
    controller.setTarget(target(async () => frame(++version)));
    controller.bindRenderer({ async decode() {
      // Alternating topology sizes model growth/prune without retaining frames.
      let rows: Uint8Array | null = new Uint8Array(version % 2 ? 10 : 1000);
      alive++;
      peak = Math.max(peak, alive);
      return { commit() { displayed++; }, dispose() { if (rows) { rows = null; alive--; } } };
    } });
    for (let i = 0; i < 600; i++) {
      await controller.tick();
      expect(alive).toBe(1);
    }
    expect(displayed).toBe(600);
    expect(peak).toBe(2);
    controller.dispose();
    expect(alive).toBe(0);
  });
});
