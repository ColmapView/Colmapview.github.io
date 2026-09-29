import type { HubClient, UploadFile } from '../huggingface/hubClient';
import { BATCH_RECEIPT_PATH } from '../huggingface/hubClient';
import { HfError, publicationErrorMessage, errorStatus, delay } from '../huggingface/http';
import { checkAssetSize } from './preparePublication';
import { publicationMetadata, publicationReceipt, validatePublicationDetails } from './publicationMetadata';
import { MAX_PUBLICATION_BATCH_BYTES, MAX_PUBLICATION_BATCH_FILES,
  type PreparedPublication, type PublicationDetails, type PublicationReceipt, type PublicationState } from './types';

interface PendingBatch {
  files: UploadFile[]; parent: string; marker: string; receipt: string; end: number; metadata: boolean;
  /** An upload attempt was sent and the repository has not confirmed its absence since. */
  outcomeUnknown?: boolean;
}
interface Job {
  prepared: PreparedPublication; repoId: string; details: PublicationDetails;
  head?: string; dataCommit?: string; metadataCommit?: string;
  next: number; inventory: Array<{ path: string; size: number }>; pending?: PendingBatch;
}
export const isPublishing = (phase: PublicationState['phase']) =>
  ['preparing', 'creating-repo', 'uploading', 'publishing-metadata', 'verifying', 'reconciling', 'cancelling'].includes(phase);

export function createPublicationController(client: HubClient,
  verify: (receipt: PublicationReceipt, prepared: PreparedPublication, inventory: Job['inventory'], signal: AbortSignal) => Promise<void>) {
  let state: PublicationState = { phase: 'idle', message: '', filesDone: 0, filesTotal: 0, bytesDone: 0, canRetry: false };
  let job: Job | null = null;
  let controller: AbortController | null = null;
  let invalidated = false;
  const listeners = new Set<() => void>();
  const set = (change: Partial<PublicationState>) => {
    state = { ...state, ...change, canRetry: job !== null };
    listeners.forEach(listener => listener());
  };
  const record = (current: Job, oid: string) => {
    const batch = current.pending!;
    current.head = oid;
    if (batch.metadata) current.metadataCommit = oid;
    else {
      current.next = batch.end;
      current.inventory.push(...batch.files.filter(file => file.path !== BATCH_RECEIPT_PATH).map(file => ({ path: file.path, size: file.content.size })));
    }
    current.pending = undefined;
    set({ uncertain: false, filesDone: current.next, bytesDone: current.inventory.reduce((sum, file) => sum + file.size, 0) });
  };
  const commit = async (current: Job, signal: AbortSignal, retry: boolean) => {
    const batch = current.pending!;
    if (retry) {
      set({ phase: 'reconciling', message: 'Checking the previous upload…' });
      const existing = await client.reconcile(current.repoId, batch.parent, batch.marker, batch.receipt, signal);
      if (existing) { record(current, existing); return; }
      batch.outcomeUnknown = false;
    }
    signal.throwIfAborted();
    set({ phase: batch.metadata ? 'publishing-metadata' : 'uploading', message: batch.metadata ? 'Publishing dataset description and viewer link…' : 'Uploading selected files…', uncertain: true });
    for (let attempt = 0; ; attempt++) {
      try {
        batch.outcomeUnknown = true;
        record(current, await client.upload(current.repoId, batch.files, batch.parent, batch.marker, signal,
          message => { if (!signal.aborted) set({ message }); }));
        return;
      } catch (error) {
        set({ phase: 'reconciling', message: 'Checking whether the upload completed…' });
        const existing = await client.reconcile(current.repoId, batch.parent, batch.marker, batch.receipt, AbortSignal.timeout(20_000));
        if (existing) { record(current, existing); return; }
        batch.outcomeUnknown = false;
        const status = errorStatus(error);
        if (signal.aborted || attempt >= 2 || !(status === 429 || (status !== undefined && status >= 500) || error instanceof TypeError)) throw error;
        set({ message: 'Waiting before retrying the upload…' });
        await delay(1000 * 2 ** attempt + Math.random() * 250, signal);
      }
    }
  };
  const setPending = (current: Job, files: UploadFile[], end: number, metadata: boolean) => {
    const marker = `${current.prepared.operationId}:${metadata ? 'metadata' : current.next}`;
    const receipt = JSON.stringify({ marker, parent: current.head, files: files.map(file => ({ path: file.path, size: file.content.size })) });
    current.pending = { files: [...files, { path: BATCH_RECEIPT_PATH, content: new Blob([receipt]) }], parent: current.head!, marker, receipt, end, metadata };
  };
  const run = async () => {
    if (!job || controller) return;
    const current = job;
    const owner = new AbortController(); controller = owner;
    const signal = owner.signal;
    set({ error: undefined });
    try {
      if (invalidated) {
        if (current.pending) {
          set({ phase: 'reconciling', message: 'Checking the stopped publication…' });
          const batch = current.pending;
          const existing = await client.reconcile(current.repoId, batch.parent, batch.marker, batch.receipt, signal);
          if (existing) record(current, existing);
          current.pending = undefined;
        }
        job = null;
        set({ phase: 'cancelled', uncertain: false, message: 'The previous publication is stopped. Start a new publication for the current dataset.' });
        return;
      }
      if (!current.head) {
        set({ phase: 'creating-repo', message: 'Creating your public dataset repository…', repoUrl: `https://huggingface.co/datasets/${current.repoId}` });
        current.head = await client.create(current.repoId, current.prepared.operationId, signal);
      }
      signal.throwIfAborted();
      if (current.pending) await commit(current, signal, true);
      let carried: { index: number; content: Blob } | undefined;
      while (current.next < current.prepared.assets.length) {
        signal.throwIfAborted();
        const files: UploadFile[] = [];
        let bytes = 0;
        let end = current.next;
        while (end < current.prepared.assets.length && files.length < MAX_PUBLICATION_BATCH_FILES) {
          const asset = current.prepared.assets[end];
          // An unknown-size splat may be many gigabytes; never download one alongside a batch.
          const unbounded = asset.size === null && asset.kind === 'splat';
          if (files.length && (unbounded || (asset.size !== null && bytes + asset.size > MAX_PUBLICATION_BATCH_BYTES))) break;
          let content = carried?.index === end ? carried.content : undefined;
          if (!content) {
            set({ phase: 'uploading', message: `Preparing ${asset.path}…` });
            content = await asset.open(signal);
            signal.throwIfAborted(); checkAssetSize(content.size, asset.path, asset.kind);
            if (asset.size !== null && content.size !== asset.size) throw new HfError(`The size of ${asset.path} changed. Start a new publication.`);
          }
          // Other unknown-size files batch by their opened size; one that does not fit starts the next batch.
          if (files.length && bytes + content.size > MAX_PUBLICATION_BATCH_BYTES) { carried = { index: end, content }; break; }
          carried = undefined;
          files.push({ path: asset.path, content }); bytes += content.size; end++;
          // A large native File/Blob is one batch; never aggregate it with others.
          if (unbounded || bytes >= MAX_PUBLICATION_BATCH_BYTES) break;
        }
        setPending(current, files, end, false);
        await commit(current, signal, false);
      }
      signal.throwIfAborted();
      current.dataCommit ??= current.head!;
      if (!current.metadataCommit) {
        setPending(current, publicationMetadata(current.prepared, current.details, current.repoId, current.dataCommit, current.inventory), current.next, true);
        await commit(current, signal, false);
      }
      signal.throwIfAborted();
      const receipt = publicationReceipt(current.prepared, current.repoId, current.dataCommit, current.metadataCommit!);
      set({ phase: 'verifying', message: 'Checking that recipients can open the dataset without signing in…' });
      await verify(receipt, current.prepared, current.inventory, signal);
      signal.throwIfAborted();
      job = null;
      set({ phase: 'completed', message: 'Your dataset is ready to share.', receipt, error: undefined, uncertain: false });
    } catch (error) {
      if (errorStatus(error) === 409 && !current.head && !invalidated) {
        // The name is taken and nothing was uploaded: back to the form so only the name changes.
        job = null;
        set({ phase: 'failed', message: '', uncertain: false, repoUrl: undefined, error: publicationErrorMessage(error) });
        return;
      }
      if (errorStatus(error) === 409) {
        // A confirmed foreign head cannot be resumed. Allow a new destination.
        current.pending = undefined;
        job = null; invalidated = true;
      }
      // A cancelled batch the repository confirmed absent can be abandoned; a retry still reconciles it first.
      set({ phase: signal.aborted ? 'cancelled' : 'failed',
        uncertain: signal.aborted ? Boolean(current.pending?.outcomeUnknown) : Boolean(current.pending),
        message: signal.aborted ? 'Publication stopped. Files already committed remain on Hugging Face.' : '',
        error: signal.aborted ? undefined : publicationErrorMessage(error) });
    } finally { if (controller === owner) controller = null; }
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** Check the details, prepare a snapshot of the current dataset, and upload it in one cancellable run. */
    async publish(username: string, details: PublicationDetails,
      work: (signal: AbortSignal, progress: (message: string) => void) => Promise<PreparedPublication>) {
      // A publication that reached Hugging Face must be retried or reset first.
      if (controller || job || state.uncertain) return;
      let checked: PublicationDetails;
      try {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(username)) throw new HfError('Connect a Hugging Face account first.');
        checked = validatePublicationDetails(details);
      } catch (error) { set({ phase: 'idle', error: publicationErrorMessage(error) }); return; }
      const owner = new AbortController(); controller = owner;
      invalidated = false;
      set({ phase: 'preparing', message: 'Preparing dataset…', error: undefined, receipt: undefined, uncertain: false,
        repoUrl: undefined, filesDone: 0, filesTotal: 0, bytesDone: 0 });
      let prepared: PreparedPublication;
      try {
        prepared = await work(owner.signal, message => { if (!owner.signal.aborted) set({ message }); });
        owner.signal.throwIfAborted();
      } catch (error) {
        set({ phase: owner.signal.aborted ? 'cancelled' : 'failed', message: '', error: owner.signal.aborted ? undefined : publicationErrorMessage(error) });
        return;
      } finally { if (controller === owner) controller = null; }
      job = { prepared, repoId: `${username}/${checked.name}`, details: checked, next: 0, inventory: [] };
      set({ filesTotal: prepared.assets.length });
      await run();
    },
    retry: run,
    cancel() { if (controller) { set({ phase: 'cancelling', message: 'Stopping publication…' }); controller.abort(); } },
    invalidate() {
      if (!job && !controller) return;
      invalidated = true; controller?.abort();
      if (!controller) set({ phase: 'cancelled', message: 'The source dataset changed. Start a new publication for the current dataset.' });
    },
    reset() {
      if (controller || state.uncertain) return;
      job = null; invalidated = false;
      state = { phase: 'idle', message: '', filesDone: 0, filesTotal: 0, bytesDone: 0, canRetry: false }; listeners.forEach(listener => listener());
    },
  };
}
