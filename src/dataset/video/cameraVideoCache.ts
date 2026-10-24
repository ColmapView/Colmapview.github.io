import { anySignal } from '../../utils/abortSignals';
import { awaitWithAbort } from '../../utils/awaitWithAbort';
import { downloadZip, releaseArchiveDownload } from '../../utils/zipDownload';
import { MAX_CACHED_VIDEO_BYTES, type CameraVideoProgress, type CameraVideoSource } from './types';

export const CAMERA_VIDEO_CACHE_BYTES = 512 * 1024 * 1024;
export interface PreparedCameraVideo { blob: Blob; duration: number; mimeType: string; playable?: boolean }
interface Entry {
  source: CameraVideoSource;
  controller: AbortController;
  promise: Promise<Blob>;
  resolve(blob: Blob): void;
  reject(error: unknown): void;
  listeners: Set<(progress: CameraVideoProgress) => void>;
  progress: CameraVideoProgress;
  blob?: Blob;
  prepared?: PreparedCameraVideo;
  references: number;
  retired: boolean;
  started: boolean;
}
const keyOf = (source: CameraVideoSource) => JSON.stringify([source.url, source.bytes, source.width, source.height, source.playbackRate ?? 1]);
const reservation = (entry: Entry) => Math.max(entry.source.bytes * 2,
  entry.source.bytes + (entry.prepared && entry.prepared.blob !== entry.blob ? entry.prepared.blob.size : 0));

/** One open detail's current/next/previous recordings. Background work downloads only, never decodes. */
export function createCameraVideoCache(budgetBytes = CAMERA_VIDEO_CACHE_BYTES, ownerSignal?: AbortSignal) {
  const entries = new Map<string, Entry>();
  let selected: string | undefined, running: Entry | undefined, background = true, cleanup = Promise.resolve();
  const release = (entry: Entry) => {
    if (!entry.retired || entry.references || !entry.blob) return;
    const blob = entry.blob; entry.blob = undefined; entry.prepared = undefined;
    cleanup = cleanup.then(() => releaseArchiveDownload(blob)).catch(() => {});
  };
  const retire = (key: string, entry: Entry) => {
    entries.delete(key); entry.retired = true; entry.controller.abort();
    if (!entry.started) entry.reject(entry.controller.signal.reason);
    release(entry);
  };
  const trim = () => {
    let total = [...entries.values()].reduce((sum, entry) => sum + reservation(entry), 0);
    for (const [key, entry] of [...entries].reverse()) {
      if (total <= budgetBytes) break;
      if (key !== selected) { total -= reservation(entry); retire(key, entry); }
    }
  };
  const drain = () => {
    if (running) return;
    const entry = [entries.get(selected ?? ''), ...(background ? entries.values() : [])].find(value => value && !value.started && !value.retired);
    if (!entry) return;
    running = entry; entry.started = true;
    const signal = anySignal([entry.source.signal, entry.controller.signal, ...(ownerSignal ? [ownerSignal] : [])]);
    void (async () => {
      let blob: Blob | undefined;
      try {
        signal.throwIfAborted();
        blob = await downloadZip(entry.source.url, value => {
          entry.progress = { phase: 'download', percent: Math.min(100, Math.round((value.bytesLoaded ?? 0) / entry.source.bytes * 100)) };
          for (const listener of entry.listeners) listener(entry.progress);
        }, { signal, expectedSize: entry.source.bytes, sizeLimit: MAX_CACHED_VIDEO_BYTES });
        signal.throwIfAborted();
        entry.blob = blob; entry.resolve(blob);
      } catch (error) {
        if (blob) await releaseArchiveDownload(blob).catch(() => {});
        entry.reject(error);
      } finally {
        running = undefined; release(entry); drain();
      }
    })();
  };
  const add = (source: CameraVideoSource) => {
    const key = keyOf(source), existing = entries.get(key);
    if (existing) return existing;
    let resolve!: Entry['resolve'], reject!: Entry['reject'];
    const promise = new Promise<Blob>((done, failed) => { resolve = done; reject = failed; });
    // A failed prefetch is quiet; selecting it retries through acquire.
    void promise.catch(() => {});
    const entry: Entry = { source, controller: new AbortController(), promise, resolve, reject, listeners: new Set(),
      progress: { phase: 'download', percent: 0 }, references: 0, retired: false, started: false };
    entries.set(key, entry); return entry;
  };
  const clear = () => {
    selected = undefined; for (const [key, entry] of entries) retire(key, entry);
    return Promise.all([cleanup, running?.promise.catch(() => {})]).then(() => {});
  };
  const setWindow = (source: CameraVideoSource, neighbors: readonly CameraVideoSource[], prefetch = true) => {
    if (source.signal.aborted || ownerSignal?.aborted || source.bytes > MAX_CACHED_VIDEO_BYTES) { void clear(); return; }
    background = prefetch;
    selected = keyOf(source);
    const desired = new Map([[selected, source]]);
    const current = entries.get(selected);
    let reserved = current ? reservation(current) : source.bytes * 2;
    for (const neighbor of neighbors) {
      const key = keyOf(neighbor);
      const cached = entries.get(key), bytes = cached ? reservation(cached) : neighbor.bytes * 2;
      if (desired.has(key) || desired.size >= 3 || neighbor.bytes > MAX_CACHED_VIDEO_BYTES
          || reserved + bytes > budgetBytes) continue;
      desired.set(key, neighbor); reserved += bytes;
    }
    for (const [key, entry] of entries) if (!desired.has(key)) retire(key, entry);
    // Navigation may select a different clip while a neighbor is downloading.
    if (running && keyOf(running.source) !== selected && (!background || !entries.get(selected)?.blob)) {
      const key = keyOf(running.source);
      if (entries.get(key) === running) retire(key, running);
    }
    // Keep iteration order aligned with current/next/previous priority, including eviction.
    for (const [key, item] of desired) {
      const entry = add(item);
      entries.delete(key); entries.set(key, entry);
    }
    trim(); queueMicrotask(drain);
  };
  return {
    setWindow, clear,
    async acquire(source: CameraVideoSource, signal: AbortSignal, onProgress: (value: CameraVideoProgress) => void) {
      signal.throwIfAborted();
      ownerSignal?.throwIfAborted();
      if (source.bytes > MAX_CACHED_VIDEO_BYTES) throw new Error('This video exceeds the 256 MiB playback cache limit.');
      if (selected !== keyOf(source)) setWindow(source, []);
      let entry = add(source);
      // A selected download can retry a previously failed background request.
      if (entry.started && !entry.blob && entry !== running) { retire(keyOf(source), entry); entry = add(source); }
      entry.references++;
      let released = false;
      const dispose = () => { if (!released) { released = true; entry.references--; release(entry); } return cleanup; };
      entry.listeners.add(onProgress);
      try {
        onProgress(entry.progress); queueMicrotask(drain);
        const blob = await awaitWithAbort(entry.promise, signal);
        signal.throwIfAborted();
        return { blob, getPrepared: () => entry.prepared,
          setPrepared(value: PreparedCameraVideo) { entry.prepared = value; trim(); }, dispose };
      } catch (error) { dispose(); throw error; }
      finally { entry.listeners.delete(onProgress); }
    },
  };
}

export type CameraVideoCache = ReturnType<typeof createCameraVideoCache>;
