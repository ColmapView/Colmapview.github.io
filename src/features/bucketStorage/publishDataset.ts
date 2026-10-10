import type { ColmapManifest } from '../../types/manifest';
import { DATASET_VIEWER_SETTINGS_FILE } from '../../utils/datasetViewerSettings';
import { readBoundedResponse } from '../../utils/publishedViewerState';
import type { PreparedPublication } from '../datasetPublishing/types';
import { bucketObjectUrl, bucketFolder } from './paths';
import { bucketRequest } from './client';
import { BucketError, bucketErrorMessage, type BucketSession } from './types';
import { uploadBucketObject } from './upload';

export type BucketPublicationPhase = 'idle' | 'preparing' | 'uploading' | 'verifying' | 'cancelling' | 'cancelled' | 'failed' | 'completed';
export interface BucketPublicationState {
  phase: BucketPublicationPhase;
  message: string;
  filesDone: number;
  filesTotal: number;
  bytesDone: number;
  prefix?: string;
  viewerUrl?: string;
  manifestUrl?: string;
  error?: string;
}
export const isBucketPublishing = (phase: BucketPublicationPhase) => ['preparing', 'uploading', 'verifying', 'cancelling'].includes(phase);
const initial = (): BucketPublicationState => ({ phase: 'idle', message: '', filesDone: 0, filesTotal: 0, bytesDone: 0 });

export function bucketPublicationManifest(prepared: PreparedPublication, baseUrl: string, title: string): ColmapManifest {
  const colmap = new Set(prepared.assets.filter(asset => asset.kind === 'colmap').map(asset => asset.path));
  return {
    version: 1, name: title, baseUrl,
    files: { cameras: 'sparse/0/cameras.bin', images: 'sparse/0/images.bin', points3D: 'sparse/0/points3D.bin',
      ...(colmap.has('sparse/0/rigs.bin') ? { rigs: 'sparse/0/rigs.bin' } : {}),
      ...(colmap.has('sparse/0/frames.bin') ? { frames: 'sparse/0/frames.bin' } : {}) },
    imagesPath: 'images/',
    ...(prepared.assets.some(asset => asset.kind === 'mask') ? { masksPath: 'masks/' } : {}),
    imageNameToPath: prepared.imageNameToPath,
    viewerStatePath: DATASET_VIEWER_SETTINGS_FILE,
    splats: prepared.splatPaths,
  };
}

type Prepare = (signal: AbortSignal, progress: (message: string) => void) => Promise<PreparedPublication>;
interface PublishDeps {
  upload?: typeof uploadBucketObject;
  verify?: (session: BucketSession, url: string, signal: AbortSignal) => Promise<string>;
}

/** A fresh prefix and manifest-last publication leave previous datasets untouched. */
export function createBucketPublicationController(deps: PublishDeps = {}) {
  let state = initial();
  let active: AbortController | null = null;
  const listeners = new Set<() => void>();
  const set = (next: Partial<BucketPublicationState>) => { state = { ...state, ...next }; listeners.forEach(listener => listener()); };
  const upload = deps.upload ?? uploadBucketObject;
  const verify = deps.verify ?? (async (session, url, signal) => (await readBoundedResponse(
    await bucketRequest(session, url, { signal }), 8 * 1024 * 1024)).text());
  const cancel = () => { if (active) { set({ phase: 'cancelling', message: 'Cancelling upload…' }); active.abort(); } };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancel,
    reset: () => { if (!active) { state = initial(); listeners.forEach(listener => listener()); } },
    invalidate: () => { if (active) cancel(); else { state = initial(); listeners.forEach(listener => listener()); } },
    async publish(session: BucketSession, folder: string, prepare: Prepare, assertCurrent: () => void) {
      if (active) return;
      if (!session.canWrite) throw new BucketError('Connect with an access key and secret to upload.');
      const destination = bucketFolder(folder);
      const prefix = `${destination}/${crypto.randomUUID()}/`;
      const controller = new AbortController();
      active = controller;
      const disconnected = () => controller.abort(new DOMException('Bucket disconnected', 'AbortError'));
      session.signal.addEventListener('abort', disconnected, { once: true });
      if (session.signal.aborted) disconnected();
      const signal = controller.signal;
      let prepared: PreparedPublication | undefined;
      const check = () => { signal.throwIfAborted(); assertCurrent(); };
      state = initial();
      try {
        check();
        set({ phase: 'preparing', message: 'Preparing dataset…', prefix });
        prepared = await prepare(signal, message => { check(); set({ message }); });
        check();
        const baseUrl = bucketObjectUrl(session.config.publicBaseUrl ?? session.config.baseUrl, prefix);
        const manifestKey = prefix + 'manifest.json';
        const manifest = JSON.stringify(bucketPublicationManifest(prepared, baseUrl, destination.split('/').at(-1)!));
        // Validate every key before the first mutation, including long original filenames.
        for (const asset of prepared.assets) bucketObjectUrl(session.config.baseUrl, prefix + asset.path);
        const total = prepared.assets.length + 1;
        set({ phase: 'uploading', filesTotal: total });
        let bytesDone = 0;
        for (const [index, asset] of prepared.assets.entries()) {
          check();
          set({ message: `Uploading ${asset.path}…`, filesDone: index });
          const blob = await asset.open(signal);
          check();
          if (asset.size !== null && blob.size !== asset.size) throw new BucketError('A source file changed. Prepare the dataset again.');
          await upload(session, prefix + asset.path, blob, signal, loaded => { if (!signal.aborted) set({ bytesDone: bytesDone + loaded }); });
          check();
          bytesDone += blob.size;
          asset.release?.();
          delete asset.release;
          set({ filesDone: index + 1, bytesDone });
        }
        check();
        set({ message: 'Publishing manifest…' });
        const blob = new Blob([manifest], { type: 'application/json' });
        await upload(session, manifestKey, blob, signal);
        check();
        set({ phase: 'verifying', message: 'Verifying manifest…', filesDone: total, bytesDone: bytesDone + blob.size });
        const readBack = await verify(session, bucketObjectUrl(session.config.baseUrl, manifestKey), signal);
        check();
        if (readBack !== manifest) throw new BucketError('The bucket did not confirm the published manifest.');
        const manifestUrl = bucketObjectUrl(session.config.publicBaseUrl ?? session.config.baseUrl, manifestKey);
        const viewer = new URL(prepared.viewerBaseUrl);
        viewer.search = ''; viewer.hash = '';
        viewer.searchParams.set('url', manifestUrl);
        set({ phase: 'completed', message: 'Dataset uploaded.', viewerUrl: viewer.href, manifestUrl });
      } catch (error) {
        set({ phase: signal.aborted ? 'cancelled' : 'failed', message: signal.aborted
          ? 'Upload cancelled. Completed objects remain in the new folder.' : 'Upload could not finish. Completed objects remain in the new folder.',
          error: signal.aborted ? undefined : bucketErrorMessage(error) });
      } finally {
        prepared?.assets.forEach(asset => asset.release?.());
        session.signal.removeEventListener('abort', disconnected);
        active = null;
      }
    },
  };
}
