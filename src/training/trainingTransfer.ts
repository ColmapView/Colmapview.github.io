import type { TrainingClient } from './trainingClient';
import { sha256Hex } from './trainingIntegrity';
import { currentTrainingTiming } from './trainingTiming';
import { runTrainingTransferPipeline } from './trainingTransferPipeline';
import type { TrainingSnapshot, TrainingUploadProgress } from './types';

type Dataset = Awaited<ReturnType<TrainingClient['dataset']>>;
const LEGACY_UPLOAD_CONCURRENCY = 2;
const MAX_BROWSER_UPLOAD_CONCURRENCY = 4;

export function normalizeUploadConcurrency(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return LEGACY_UPLOAD_CONCURRENCY;
  return Math.min(value, MAX_BROWSER_UPLOAD_CONCURRENCY);
}

export class TrainingSourceUnavailableError extends Error {
  constructor() {
    super('Original source files are required to resume this interrupted upload. Reload the original reconstruction, then resume preparation.');
    this.name = 'TrainingSourceUnavailableError';
  }
}

export function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

export async function reconcileUploads(
  client: TrainingClient, dataset: Dataset, snapshot: TrainingSnapshot, signal: AbortSignal,
  onProgress: (progress: TrainingUploadProgress) => void,
  uploadConcurrency = LEGACY_UPLOAD_CONCURRENCY,
): Promise<void> {
  const timing = currentTrainingTiming();
  const measure = <T>(name: string, operation: () => Promise<T>) => timing?.measure(name, operation) ?? operation();
  timing?.mark('upload_reconciliation_start');
  if (dataset.client_snapshot_id !== snapshot.id) throw new Error('Upload identity does not match the retained snapshot.');
  if (dataset.files.length !== snapshot.files.length) throw new Error('Upload manifest does not match the retained snapshot.');
  const local = new Map(snapshot.files.map(file => [file.path, file]));
  const missing: Array<{ id: string; entry: TrainingSnapshot['files'][number] }> = [];
  let uploadedBytes = 0;
  let completedFiles = 0;
  const totalBytes = snapshot.files.every(file => file.expectedBytes != null)
    ? snapshot.files.reduce((sum, file) => sum + (file.expectedBytes ?? 0), 0) : 0;
  for (const file of dataset.files) {
    signal.throwIfAborted();
    const entry = local.get(file.path);
    if (!entry || entry.role !== file.role || (entry.image_name ?? null) !== file.image_name) throw new Error(`Upload manifest mismatch: ${file.path}`);
    local.delete(file.path);
    if (!file.receipt) { missing.push({ id: file.file_id, entry }); continue; }
    const receiptSource = entry.file ?? (snapshot.verifyUploadedReceipts ? await entry.read(signal) : null);
    const receiptHash = receiptSource
      ? entry.expectedSha256 ?? await sha256Hex(receiptSource)
      : null;
    if (file.receipt.file_id !== file.file_id || !/^[a-f0-9]{64}$/.test(file.receipt.sha256)
      || (entry.expectedBytes != null && file.receipt.bytes !== entry.expectedBytes)
      || (file.expected_bytes != null && file.receipt.bytes !== file.expected_bytes)
      || (receiptSource && (receiptSource.size !== file.receipt.bytes || receiptHash !== file.receipt.sha256))) {
      throw new Error(`Upload receipt integrity mismatch: ${file.path}`);
    }
    uploadedBytes += file.receipt.bytes;
    completedFiles += 1;
  }
  const progress = (currentFile: string | null) => onProgress({ uploadedBytes, completedFiles, totalBytes, totalFiles: snapshot.files.length, currentFile });
  progress(null);
  const uploadPhase = async (entries: typeof missing) => {
    await runTrainingTransferPipeline(entries, signal, {
      preparations: 4, uploads: normalizeUploadConcurrency(uploadConcurrency),
      waitingFiles: 4, waitingBytes: 64 * 1024 * 1024, residentBytes: 128 * 1024 * 1024,
    }, item => item.entry.expectedBytes ?? item.entry.preparationBytes ?? 64 * 1024 * 1024 + 1,
    async (item, workSignal) => {
      workSignal.throwIfAborted();
      const file = await measure(`${item.entry.role}_prepare`, () => item.entry.read(workSignal));
      workSignal.throwIfAborted();
      return file;
    }, file => file.size, async ({ id, entry }, file, workSignal, failWork) => {
      workSignal.throwIfAborted();
      progress(entry.path);
      // Drain hashing and PUT together even on failure: neither may outlive the
      // payload owner or a cancelled attempt. The pipeline aborts sibling work.
      const observeFailure = <T>(operation: Promise<T>) => operation.catch(error => { failWork(error); throw error; });
      const results = await Promise.allSettled([
        observeFailure(Promise.resolve(entry.expectedSha256 ?? measure('hash', () => sha256Hex(file)))),
        observeFailure(measure('upload', () => client.uploadFile(dataset.dataset_id, id, file, workSignal))),
      ] as const);
      const [hash, upload] = results;
      if (hash.status === 'rejected') throw hash.reason;
      if (upload.status === 'rejected') throw upload.reason;
      workSignal.throwIfAborted();
      const receipt = upload.value;
      if (receipt.file_id !== id || receipt.bytes !== file.size || receipt.sha256 !== hash.value) throw new Error(`Upload receipt integrity mismatch: ${entry.path}`);
      uploadedBytes += receipt.bytes;
      completedFiles += 1;
      timing?.add(`${entry.role}_uploaded_bytes`, receipt.bytes);
      progress(null);
    });
  };
  // Make the small reconstruction/pose payload available before any expensive
  // image decode, JPEG conversion, mask normalization, hashing or image PUT.
  await uploadPhase(missing.filter(item => item.entry.role === 'model'));
  timing?.mark('model_receipts_complete');
  // Start the canonical first image promptly; prioritize declared masks alongside
  // images because scene crop/seed preparation depends on their complete inventory.
  // A fixed 1:4 item cadence lets both roles progress in the SAME bounded pool.
  // No mask work is manufactured for unmasked or partially masked snapshots.
  const images = missing.filter(item => item.entry.role === 'image');
  const masks = missing.filter(item => item.entry.role === 'mask');
  const payloads: typeof missing = [];
  for (let image = 0, mask = 0; image < images.length || mask < masks.length;) {
    if (image < images.length) payloads.push(images[image++]);
    payloads.push(...masks.slice(mask, mask + 4));
    mask += 4;
  }
  await uploadPhase(payloads);
  timing?.mark('all_receipts_verified');
}

/** Resume the resource's actual state; uploading never falls into a readiness-only poll. */
export async function prepareExistingDataset(
  client: TrainingClient, datasetId: string, snapshot: TrainingSnapshot | null, signal: AbortSignal,
  onProgress: (progress: TrainingUploadProgress) => void, onValidating: () => void,
  initialDataset?: Dataset | null,
  uploadConcurrency = LEGACY_UPLOAD_CONCURRENCY,
): Promise<Dataset> {
  const timing = currentTrainingTiming();
  let dataset = initialDataset ?? await client.dataset(datasetId, signal);
  if (dataset.state === 'uploading') {
    if (!snapshot) throw new TrainingSourceUnavailableError();
    await reconcileUploads(client, dataset, snapshot, signal, onProgress, uploadConcurrency);
    signal.throwIfAborted();
    dataset = await (timing?.measure('finalize_request', () => client.finalizeDataset(datasetId, signal))
      ?? client.finalizeDataset(datasetId, signal));
  }
  const deadline = Date.now() + 120_000;
  let delay = 50;
  while (dataset.state === 'validating') {
    onValidating();
    if (Date.now() >= deadline) throw new Error('Validation is still pending. Retry to reconnect to this dataset.');
    dataset = await client.dataset(datasetId, signal);
    if (dataset.state !== 'validating') break;
    await abortableDelay(delay, signal);
    delay = Math.min(500, delay * 2);
  }
  signal.throwIfAborted();
  if (dataset.state === 'ready') { timing?.mark('dataset_ready_observed'); return dataset; }
  if (dataset.state === 'cancelled' || dataset.state === 'cancelling') throw new Error(`Dataset ${dataset.state}; it cannot be submitted.`);
  if (dataset.state === 'invalid') throw new Error(dataset.errors.map(error => error.detail ?? error.code).join('; ') || 'Server rejected the dataset.');
  throw new Error(`Dataset is ${dataset.state}. Retry preparation to reconcile its files.`);
}
