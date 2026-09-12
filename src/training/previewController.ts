import type { TrainingPreviewFrame } from './types';

/** A prepared renderer resource. Commit is synchronous; disposal is idempotent. */
export interface PreviewResource {
  commit(): void;
  dispose(): void;
}

export interface PreviewTarget {
  jobId: string;
  snapshotId: string;
  fetch(etag: string | null, signal: AbortSignal): Promise<TrainingPreviewFrame>;
  isCurrent(): boolean;
  onFrame(frame: TrainingPreviewFrame): void;
  onError(message: string): void;
}

export interface PreviewRenderer {
  decode(file: File, isCurrent: () => boolean): Promise<PreviewResource>;
  inspect?(): Record<string, unknown>;
}

/** One fetch + decode/upload operation, even across renderer or source changes. */
export class PreviewController {
  private generation = 0;
  private target: PreviewTarget | null = null;
  private renderer: PreviewRenderer | null = null;
  private current: PreviewResource | null = null;
  private abort: AbortController | null = null;
  private pending: Promise<void> | null = null;
  private etag: string | null = null;
  private version = -1;
  private enabled = true;
  // Keep only the latest committed publication, independent of its GPU resource.
  private live: { file: File; target: PreviewTarget } | null = null;
  private final: { file: File; isCurrent: () => boolean } | null = null;
  private restoreRequested = false;
  private rendererWaiters = new Set<() => void>();

  inspect() {
    return { displayedResources: this.current ? 1 : 0, inFlight: this.pending ? 1 : 0,
      version: this.version, final: Boolean(this.final), renderer: this.renderer?.inspect?.() ?? null };
  }

  waitForRenderer(timeoutMs = 10000): Promise<void> {
    if (this.renderer) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const ready = () => { clearTimeout(timer); this.rendererWaiters.delete(ready); resolve(); };
      const timer = setTimeout(() => {
        this.rendererWaiters.delete(ready);
        reject(new Error('No supported preview renderer became ready.'));
      }, timeoutMs);
      this.rendererWaiters.add(ready);
    });
  }

  setTarget(target: PreviewTarget | null): void {
    this.invalidate(true);
    this.final = null;
    this.target = target;
  }

  bindRenderer(renderer: PreviewRenderer): () => void {
    this.invalidate(false);
    this.clearCurrent();
    this.renderer = renderer;
    for (const ready of this.rendererWaiters) ready();
    this.requestRestore();
    return () => {
      if (this.renderer !== renderer) return;
      this.invalidate(false);
      this.clearCurrent();
      this.renderer = null;
    };
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.invalidate(false);
    this.requestRestore();
  }

  /** Stop late work while retaining the last good terminal/hidden frame. */
  invalidate(clear: boolean): void {
    this.generation++;
    this.abort?.abort();
    this.abort = null;
    this.restoreRequested = false;
    if (clear) {
      this.clearCurrent();
      this.live = null;
      this.etag = null;
      this.version = -1;
    }
  }

  dispose(): void {
    this.setTarget(null);
    this.renderer = null;
  }

  private clearCurrent(): void {
    this.current?.dispose();
    this.current = null;
  }

  private finish(operation: Promise<void>): void {
    if (this.pending !== operation) return;
    this.pending = null;
    if (this.restoreRequested) void this.restoreRetained();
  }

  private requestRestore(): void {
    this.restoreRequested = true;
    void this.restoreRetained();
  }

  /** Renderer restoration is local work, including after terminal polling stops. */
  private restoreRetained(): Promise<void> {
    if (this.pending) return this.pending;
    this.restoreRequested = false;
    const renderer = this.renderer;
    const final = this.final;
    const live = this.live;
    const target = this.target;
    const file = final?.file ?? live?.file;
    if (this.current || !renderer || !file) return Promise.resolve();
    const generation = this.generation;
    const isCurrent = () => generation === this.generation && this.renderer === renderer
      && (final ? this.final === final && final.isCurrent()
        : !this.final && this.live === live && this.target === live?.target && Boolean(live?.target.isCurrent()));
    const operation = Promise.resolve().then(async () => {
      let resource: PreviewResource | null = null;
      try {
        if (!isCurrent()) return;
        resource = await renderer.decode(file, isCurrent);
        if (!isCurrent()) return;
        resource.commit();
        this.current = resource;
        resource = null;
      } catch (error) {
        if (isCurrent()) {
          target?.onError(error instanceof Error ? error.message : 'Preview could not be restored.');
        }
      } finally {
        resource?.dispose();
        this.finish(operation);
      }
    });
    this.pending = operation;
    return operation;
  }

  loadFinal(file: File, isCurrent: () => boolean): Promise<boolean> {
    // Cancellation of transport does not mean a non-abortable decode has ended.
    this.invalidate(false);
    this.enabled = false;
    const previous = this.pending;
    const generation = this.generation;
    let committed = false;
    const operation = (async () => {
      await previous?.catch(() => undefined);
      const renderer = this.renderer;
      if (!renderer || !isCurrent() || generation !== this.generation) return;
      const valid = () => generation === this.generation && this.renderer === renderer && isCurrent();
      const resource = await renderer.decode(file, valid);
      if (!valid()) { resource.dispose(); return; }
      try { resource.commit(); } catch (error) { resource.dispose(); throw error; }
      this.current?.dispose();
      this.current = resource;
      this.live = null;
      this.final = { file, isCurrent };
      committed = true;
    })().finally(() => { this.finish(operation); });
    this.pending = operation;
    return operation.then(() => committed);
  }

  tick(): Promise<void> {
    if (this.pending) return this.pending;
    // A committed final remains authoritative even if restoring its resource fails.
    if (this.final) return Promise.resolve();
    const target = this.target;
    const renderer = this.renderer;
    if (!this.enabled || !target || !renderer || !target.isCurrent()) return Promise.resolve();
    const generation = this.generation;
    const abort = new AbortController();
    this.abort = abort;
    const isCurrent = () => this.enabled && generation === this.generation
      && this.target === target && this.renderer === renderer && target.isCurrent();
    const operation = Promise.resolve().then(async () => {
      let resource: PreviewResource | null = null;
      try {
        const frame = await target.fetch(this.etag, abort.signal);
        if (!isCurrent() || !frame.file) return;
        if ((frame.jobId && frame.jobId !== target.jobId) || (frame.snapshotId && frame.snapshotId !== target.snapshotId)) {
          throw new Error('Preview publication belongs to another job or snapshot.');
        }
        // The service's strong validator is "job-id:version".
        const version = Number(/:(\d+)"?$/.exec(frame.etag ?? '')?.[1]);
        if (!Number.isSafeInteger(version)) throw new Error('Preview has no valid publication version.');
        if (version <= this.version) return;
        resource = await renderer.decode(frame.file, isCurrent);
        if (!isCurrent()) return;
        resource.commit();
        this.current?.dispose();
        this.current = resource;
        resource = null;
        this.etag = frame.etag;
        this.version = version;
        this.live = { file: frame.file, target };
        target.onFrame(frame);
      } catch (error) {
        if (isCurrent() && !abort.signal.aborted) {
          target.onError(error instanceof Error ? error.message : 'Could not decode preview.');
        }
      } finally {
        resource?.dispose();
        if (this.abort === abort) this.abort = null;
        this.finish(operation);
      }
    });
    this.pending = operation;
    return operation;
  }
}

// The application has one training scene and one app-mounted session owner.
// GPU objects live here, never in persisted Zustand state.
export const trainingPreviewController = new PreviewController();
export const TRAINING_PREVIEW_FILE = new File([], 'training-preview.ply');
