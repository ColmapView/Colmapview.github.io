import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { TrainingClient, trainingDatasetSchema } from './trainingClient';
import { normalizeUploadConcurrency, prepareExistingDataset, reconcileUploads } from './trainingTransfer';
import type { TrainingSnapshot } from './types';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const file = () => new File(['data'], 'source.png');
function fixture() {
  const snapshot: TrainingSnapshot = { id: 'snapshot', sourceId: 'source', sourceLabel: 'source', imageCount: 1, pointCount: 0,
    files: [
      { id: 'model', role: 'model', path: 'sparse/0/cameras.bin', expectedBytes: 4, file: file(), read: vi.fn(async () => file()) },
      { id: 'image', role: 'image', path: 'images/left/same.png', image_name: 'left/same.png', expectedBytes: null, read: vi.fn(async () => file()) },
    ] };
  const dataset = trainingDatasetSchema.parse({ dataset_id: 'dataset', client_snapshot_id: snapshot.id, source_label: 'source', state: 'uploading',
    files: snapshot.files.map((entry, index) => ({ file_id: entry.id, path: entry.path, role: entry.role, image_name: entry.image_name ?? null,
      expected_bytes: entry.expectedBytes, receipt: index === 0 ? { file_id: entry.id, bytes: 4, sha256: sha('data') } : null })), file_ids: {} });
  return { snapshot, dataset, client: new TrainingClient({ baseUrl: 'http://localhost:8787' }) };
}

describe('C8 dataset recovery', () => {
  beforeEach(() => { vi.stubGlobal('crypto', webcrypto); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('reconciles completed receipts, uploads only the missing original and finalizes the same dataset', async () => {
    const { snapshot, dataset, client } = fixture();
    vi.spyOn(client, 'dataset').mockResolvedValue(dataset);
    const put = vi.spyOn(client, 'uploadFile').mockResolvedValue({ file_id: 'image', bytes: 4, sha256: sha('data') });
    const finalize = vi.spyOn(client, 'finalizeDataset').mockResolvedValue({ ...dataset, state: 'ready' });
    const progress = vi.fn();
    await prepareExistingDataset(client, 'dataset', snapshot, new AbortController().signal, progress, vi.fn());
    expect(snapshot.files[0].read).not.toHaveBeenCalled();
    expect(snapshot.files[1].read).toHaveBeenCalledOnce();
    expect(snapshot.files[1].read).toHaveBeenCalledWith(put.mock.calls[0][3]);
    expect(put.mock.calls[0].slice(0, 2)).toEqual(['dataset', 'image']);
    expect(finalize.mock.calls[0][0]).toBe('dataset');
    expect(progress.mock.lastCall?.[0]).toMatchObject({ completedFiles: 2, uploadedBytes: 8, totalBytes: 0 });
  });
  it('prepares four waiting images while four uploads are blocked', async () => {
    const sources = Array.from({ length: 9 }, (_, index) => ({
      id: `source-${index}`,
      role: 'image' as const,
      path: `images/source-${index}.jpg`,
      expectedBytes: 4,
      file: file(),
      read: vi.fn(async () => file()),
    }));
    const snapshot: TrainingSnapshot = {
      id: 'snapshot', sourceId: 'source', sourceLabel: 'source', imageCount: 1, pointCount: 0, files: sources,
    };
    const dataset = trainingDatasetSchema.parse({
      dataset_id: 'dataset', client_snapshot_id: snapshot.id, source_label: 'source', state: 'uploading',
      files: sources.map(entry => ({ file_id: entry.id, path: entry.path, role: entry.role,
        expected_bytes: entry.expectedBytes, receipt: null })), file_ids: {},
    });
    const client = new TrainingClient({ baseUrl: 'http://localhost:8787' });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let active = 0;
    let maximumActive = 0;
    const put = vi.spyOn(client, 'uploadFile').mockImplementation(async (_datasetId, fileId, source) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await gate;
      active -= 1;
      return { file_id: fileId, bytes: source.size, sha256: sha('data') };
    });

    const pending = reconcileUploads(client, dataset, snapshot, new AbortController().signal, vi.fn(), 16);
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(4));
    // Four PUTs are blocked, but their next four images are already prepared.
    expect(sources.filter(source => source.read.mock.calls.length > 0)).toHaveLength(8);
    expect(sources[8].read).not.toHaveBeenCalled();
    release();
    await pending;

    expect(normalizeUploadConcurrency(undefined)).toBe(2);
    expect(maximumActive).toBe(4);
    expect(put).toHaveBeenCalledTimes(9);
  });
  it('finishes every reconstruction upload before reading image payloads', async () => {
    const modelEntries = Array.from({ length: 2 }, (_, index) => ({
      id: `model-${index}`, role: 'model' as const, path: `sparse/0/model-${index}.bin`,
      expectedBytes: 4, file: file(), read: vi.fn(async () => file()),
    }));
    const imageEntries = Array.from({ length: 2 }, (_, index) => ({
      id: `image-${index}`, role: 'image' as const, path: `images/image-${index}.jpg`,
      image_name: `image-${index}.jpg`, expectedBytes: null, read: vi.fn(async () => file()),
    }));
    const sources = [...modelEntries, ...imageEntries];
    const snapshot: TrainingSnapshot = {
      id: 'snapshot', sourceId: 'source', sourceLabel: 'source', imageCount: 2, pointCount: 0, files: sources,
    };
    const dataset = trainingDatasetSchema.parse({
      dataset_id: 'dataset', client_snapshot_id: snapshot.id, source_label: 'source', state: 'uploading',
      files: sources.map(entry => ({ file_id: entry.id, path: entry.path, role: entry.role,
        image_name: 'image_name' in entry ? entry.image_name : null, expected_bytes: entry.expectedBytes,
        receipt: null })), file_ids: {},
    });
    const client = new TrainingClient({ baseUrl: 'http://localhost:8787' });
    let releaseModels!: () => void;
    const modelGate = new Promise<void>((resolve) => { releaseModels = resolve; });
    const put = vi.spyOn(client, 'uploadFile').mockImplementation(async (_datasetId, fileId, source) => {
      if (fileId.startsWith('model-')) await modelGate;
      return { file_id: fileId, bytes: source.size, sha256: sha('data') };
    });

    const pending = reconcileUploads(client, dataset, snapshot, new AbortController().signal, vi.fn(), 4);
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put.mock.calls.map(call => call[1])).toEqual(['model-0', 'model-1']);
    expect(imageEntries.every(entry => entry.read.mock.calls.length === 0)).toBe(true);
    releaseModels();
    await pending;

    expect(put.mock.calls.map(call => call[1])).toEqual(['model-0', 'model-1', 'image-0', 'image-1']);
  });
  it('uploads declared masks while an image is still in flight, after poses', async () => {
    const entries = [
      { id: 'model', role: 'model' as const, path: 'sparse/0/images.bin', expectedBytes: 4,
        file: file(), read: vi.fn(async () => file()) },
      { id: 'image-0', role: 'image' as const, path: 'images/0.jpg', image_name: '0.jpg',
        expectedBytes: null, read: vi.fn(async () => file()) },
      { id: 'mask-0', role: 'mask' as const, path: 'masks/0.jpg.png', image_name: '0.jpg',
        expectedBytes: null, read: vi.fn(async () => file()) },
      { id: 'image-1', role: 'image' as const, path: 'images/1.jpg', image_name: '1.jpg',
        expectedBytes: null, read: vi.fn(async () => file()) },
    ];
    const snapshot: TrainingSnapshot = {
      id: 'snapshot', sourceId: 'source', sourceLabel: 'source', imageCount: 2, pointCount: 0, files: entries,
    };
    const dataset = trainingDatasetSchema.parse({
      dataset_id: 'dataset', client_snapshot_id: snapshot.id, source_label: 'source', state: 'uploading',
      files: entries.map(entry => ({ file_id: entry.id, path: entry.path, role: entry.role,
        image_name: 'image_name' in entry ? entry.image_name : null, expected_bytes: entry.expectedBytes,
        receipt: null })), file_ids: {},
    });
    const client = new TrainingClient({ baseUrl: 'http://localhost:8787' });
    const order: string[] = [];
    let releaseImage!: () => void;
    const imageGate = new Promise<void>(resolve => { releaseImage = resolve; });
    vi.spyOn(client, 'uploadFile').mockImplementation(async (_datasetId, fileId, source) => {
      order.push(fileId);
      if (fileId === 'image-0') await imageGate;
      return { file_id: fileId, bytes: source.size, sha256: sha('data') };
    });

    const pending = reconcileUploads(client, dataset, snapshot, new AbortController().signal, vi.fn(), 4);
    await vi.waitFor(() => expect(order).toContain('mask-0'));
    expect(order.slice(0, 3)).toEqual(['model', 'image-0', 'mask-0']);
    releaseImage();
    await pending;
    expect(order).toEqual(['model', 'image-0', 'mask-0', 'image-1']);
  });
  it('rejects a forged completed receipt instead of skipping changed model bytes', async () => {
    const { snapshot, dataset, client } = fixture();
    dataset.files[0].receipt!.sha256 = sha('different');
    await expect(reconcileUploads(client, dataset, snapshot, new AbortController().signal, vi.fn())).rejects.toThrow('integrity mismatch');
    expect(snapshot.files[1].read).not.toHaveBeenCalled();
  });
  it('rejects missing handles after refresh without readiness polling', async () => {
    const { dataset, client } = fixture();
    const poll = vi.spyOn(client, 'dataset').mockResolvedValue(dataset);
    await expect(prepareExistingDataset(client, 'dataset', null, new AbortController().signal, vi.fn(), vi.fn())).rejects.toThrow('Original source files');
    expect(poll).toHaveBeenCalledOnce();
  });
  it('verifies received lazy files when rebuilding an interrupted snapshot', async () => {
    const { snapshot, dataset, client } = fixture();
    snapshot.verifyUploadedReceipts = true;
    dataset.files[1].receipt = { file_id: 'image', bytes: 4, sha256: sha('data') };
    vi.spyOn(client, 'dataset').mockResolvedValue(dataset);
    const put = vi.spyOn(client, 'uploadFile');
    vi.spyOn(client, 'finalizeDataset').mockResolvedValue({ ...dataset, state: 'ready' });

    await prepareExistingDataset(client, 'dataset', snapshot, new AbortController().signal, vi.fn(), vi.fn());

    expect(snapshot.files[1].read).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
  });
  it('checks readiness immediately after finalization without a fixed polling delay', async () => {
    const { snapshot, dataset, client } = fixture();
    vi.spyOn(client, 'uploadFile').mockResolvedValue({ file_id: 'image', bytes: 4, sha256: sha('data') });
    vi.spyOn(client, 'finalizeDataset').mockResolvedValue({ ...dataset, state: 'validating' });
    const status = vi.spyOn(client, 'dataset').mockResolvedValue({ ...dataset, state: 'ready' });
    const timer = vi.spyOn(globalThis, 'setTimeout');

    await prepareExistingDataset(
      client, 'dataset', snapshot, new AbortController().signal, vi.fn(), vi.fn(), dataset,
    );

    expect(status).toHaveBeenCalledOnce();
    expect(timer).not.toHaveBeenCalled();
  });
  it('rejects a changed lazy source instead of mixing it with prior receipts', async () => {
    const { snapshot, dataset } = fixture();
    snapshot.verifyUploadedReceipts = true;
    snapshot.files[1].read = vi.fn(async () => new File(['changed'], 'source.png'));
    dataset.files[1].receipt = { file_id: 'image', bytes: 4, sha256: sha('data') };

    await expect(reconcileUploads(
      new TrainingClient({ baseUrl: 'http://localhost:8787' }),
      dataset,
      snapshot,
      new AbortController().signal,
      vi.fn(),
    )).rejects.toThrow('integrity mismatch');
  });
  it.each(['ready', 'invalid', 'cancelled', 'cancelling'] as const)('recovers %s without uploading or finalizing', async state => {
    const { dataset, client } = fixture();
    vi.spyOn(client, 'dataset').mockResolvedValue({ ...dataset, state });
    const put = vi.spyOn(client, 'uploadFile');
    const finalize = vi.spyOn(client, 'finalizeDataset');
    const pending = prepareExistingDataset(client, 'dataset', null, new AbortController().signal, vi.fn(), vi.fn());
    if (state === 'ready') await pending;
    else await expect(pending).rejects.toThrow();
    expect(put).not.toHaveBeenCalled(); expect(finalize).not.toHaveBeenCalled();
  });
  it('waits for its blocked read to settle after cancellation and never sends the file', async () => {
    const { snapshot, dataset, client } = fixture();
    let release!: (value: File) => void;
    snapshot.files[1].read = vi.fn(() => new Promise<File>(resolve => { release = resolve; }));
    const put = vi.spyOn(client, 'uploadFile');
    const abort = new AbortController();
    const pending = reconcileUploads(client, dataset, snapshot, abort.signal, vi.fn());
    await vi.waitFor(() => expect(snapshot.files[1].read).toHaveBeenCalled());
    abort.abort(); release(file());
    await expect(pending).rejects.toThrow();
    expect(put).not.toHaveBeenCalled();
  });

  it('propagates cancellation to a pending source read and retries with a fresh worker signal', async () => {
    const { snapshot, dataset, client } = fixture();
    const read = vi.fn<(signal?: AbortSignal) => Promise<File>>()
      .mockImplementationOnce(signal => new Promise((_resolve, reject) => {
        signal!.addEventListener('abort', () => reject(signal!.reason), { once: true });
      }))
      .mockResolvedValue(file());
    snapshot.files[1].read = read;
    const put = vi.spyOn(client, 'uploadFile').mockResolvedValue({ file_id: 'image', bytes: 4, sha256: sha('data') });
    const initial = new AbortController();
    const pending = reconcileUploads(client, dataset, snapshot, initial.signal, vi.fn());
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    initial.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(read.mock.calls[0][0]?.aborted).toBe(true);
    expect(put).not.toHaveBeenCalled();
    await reconcileUploads(client, dataset, snapshot, new AbortController().signal, vi.fn());
    expect(read.mock.calls[1][0]?.aborted).toBe(false);
    expect(read.mock.calls[1][0]).toBe(put.mock.calls[0][3]);
    expect(put).toHaveBeenCalledOnce();
  });

  it('cancels a sibling source read when another upload worker fails', async () => {
    const { snapshot, dataset, client } = fixture();
    dataset.files[0].receipt = null;
    snapshot.files[1].role = 'model';
    snapshot.files[1].preparationBytes = 4;
    dataset.files[1].role = 'model';
    const failure = new Error('Original source failed');
    snapshot.files[0].read = vi.fn(async () => { throw failure; });
    const read = vi.fn<(signal?: AbortSignal) => Promise<File>>(signal => new Promise((_resolve, reject) => {
      signal!.addEventListener('abort', () => reject(signal!.reason), { once: true });
    }));
    snapshot.files[1].read = read;
    const put = vi.spyOn(client, 'uploadFile');
    await expect(reconcileUploads(client, dataset, snapshot, new AbortController().signal, vi.fn())).rejects.toBe(failure);
    expect(read).toHaveBeenCalledOnce();
    expect(read.mock.calls[0][0]?.aborted).toBe(true);
    expect(read.mock.calls[0][0]?.reason).toBe(failure);
    expect(put).not.toHaveBeenCalled();
  });
});
