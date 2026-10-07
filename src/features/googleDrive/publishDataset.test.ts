import { Blob as NodeBlob } from 'node:buffer';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HfError } from '../huggingface/http';
import { buildCamera, buildDatasetState, buildImage, buildPoint3D, buildReconstruction } from '../../test/builders';
import { createIdentityEuler } from '../../utils/sim3dTransforms';
import { prepareDriveArchive } from './prepareArchive';
import { createDrivePublicationController, normalizeDriveArchiveName } from './publishDataset';
import { DRIVE_UPLOAD_CHUNK_BYTES, GoogleDrivePublishError, type DrivePublishedFile } from './upload';

beforeEach(() => { vi.stubGlobal('Blob', NodeBlob); });
afterEach(() => { vi.unstubAllGlobals(); });
function fixture(size = 20) {
  const blob = new Blob([new Uint8Array(size)]);
  let file: DrivePublishedFile | null = null;
  let operation = '';
  let name = '';
  const uploaded = () => ({ id: 'DRIVE_FILE_123456789', name, size: String(blob.size), mimeType: 'application/zip', md5Checksum: 'fixture-md5', appProperties: { colmapviewOperation: operation }, permissions: [{ type: 'user', role: 'owner' }] });
  const client = {
    owner: vi.fn().mockResolvedValue('account-one'), generateId: vi.fn().mockResolvedValue('DRIVE_FILE_123456789'),
    file: vi.fn().mockImplementation(async () => file),
    start: vi.fn().mockImplementation(async (_id, filename, marker) => { name = filename; operation = marker; return 'session'; }),
    status: vi.fn().mockResolvedValue({ complete: false, offset: 8 }),
    chunk: vi.fn().mockImplementation(async (_url, _blob, _offset, _signal, progress) => { progress(blob.size); file = uploaded(); return { complete: true, offset: blob.size }; }),
    share: vi.fn().mockImplementation(async () => { file!.permissions!.push({ type: 'anyone', role: 'reader', allowFileDiscovery: false }); }),
  };
  const prepare = vi.fn().mockResolvedValue({ blob, md5: 'fixture-md5', viewerBaseUrl: 'https://viewer.example/latest/' });
  return { client, prepare, blob, uploaded, controller: createDrivePublicationController(client), setFile: (value: DrivePublishedFile | null) => { file = value; } };
}

describe('Drive publication lifecycle', () => {
  it('saves privately, verifies the committed archive and produces credential-free Drive/viewer links', async () => {
    const { controller, client, prepare } = fixture();
    await controller.publish('scene', false, prepare);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'completed', bytesDone: 20, receipt: { shared: false,
      driveUrl: 'https://drive.google.com/file/d/DRIVE_FILE_123456789/view', viewerUrl: 'https://viewer.example/latest/?url=https%3A%2F%2Fdrive.google.com%2Ffile%2Fd%2FDRIVE_FILE_123456789%2Fview' } });
    expect(client.share).not.toHaveBeenCalled();
    expect(client.file).toHaveBeenCalledTimes(2);
    await controller.retry();
    expect(client.chunk).toHaveBeenCalledOnce();
  });
  it('shares only after upload and checksum verification, then verifies reader permission', async () => {
    const { controller, client, prepare } = fixture();
    await controller.publish('scene.zip', true, prepare);
    expect(client.file.mock.invocationCallOrder[1]).toBeLessThan(client.share.mock.invocationCallOrder[0]);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'completed', receipt: { shared: true } });
    expect(client.file).toHaveBeenCalledTimes(3);
  });
  it('resumes from the server offset after a network interruption without generating another ID or repackaging', async () => {
    const { controller, client, prepare } = fixture();
    client.chunk.mockRejectedValueOnce(new GoogleDrivePublishError('Network interrupted.'));
    await controller.publish('scene', false, prepare);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: true });
    // Reserving an ID does not create a Drive file or a usable Drive link.
    expect(controller.getSnapshot().fileUrl).toBeUndefined();
    await controller.retry();
    expect(client.status).toHaveBeenCalledOnce();
    expect(client.chunk.mock.calls[1][2]).toBe(8);
    expect(client.start).toHaveBeenCalledOnce();
    expect(client.generateId).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().phase).toBe('completed');
  });
  it('reconciles a lost final upload response without transferring or sharing twice', async () => {
    const { controller, client, prepare, setFile, uploaded } = fixture();
    client.chunk.mockImplementationOnce(async () => { setFile(uploaded()); throw new GoogleDrivePublishError('Lost final response'); });
    await controller.publish('scene', true, prepare);
    await controller.retry();
    expect(client.chunk).toHaveBeenCalledOnce();
    expect(client.share).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().phase).toBe('completed');
  });
  it('rechecks an applied sharing change when the permission response is lost', async () => {
    const { controller, client, prepare, setFile, uploaded } = fixture();
    client.share.mockImplementationOnce(async () => { setFile({ ...uploaded(), permissions: [{ type: 'anyone', role: 'reader', allowFileDiscovery: false }] }); throw new GoogleDrivePublishError('Lost sharing response'); });
    await controller.publish('scene', true, prepare);
    expect(controller.getSnapshot().receipt).toBeUndefined();
    await controller.retry();
    expect(client.share).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().receipt?.shared).toBe(true);
  });
  it('restarts an expired session using the same file ID', async () => {
    const { controller, client, prepare } = fixture();
    client.chunk.mockRejectedValueOnce(new GoogleDrivePublishError('Interrupted'));
    client.status.mockRejectedValueOnce(new GoogleDrivePublishError('Session expired', 404));
    await controller.publish('scene', false, prepare);
    await controller.retry();
    expect(client.start).toHaveBeenCalledTimes(2);
    expect(client.start.mock.calls[0][0]).toBe(client.start.mock.calls[1][0]);
    expect(client.generateId).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().phase).toBe('completed');
  });
  it('stops a retry under a different Google account before touching its files', async () => {
    const { controller, client, prepare } = fixture();
    client.chunk.mockRejectedValueOnce(new GoogleDrivePublishError('Interrupted'));
    await controller.publish('scene', false, prepare);
    client.owner.mockResolvedValue('different-account');
    await controller.retry();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', error: expect.stringContaining('account that started') });
    expect(client.chunk).toHaveBeenCalledOnce();
  });
  it.each(['operation', 'checksum', 'name'])('rejects a file changed outside publication (%s), leaving sharing untouched', async change => {
    const { controller, client, prepare, setFile, uploaded } = fixture();
    client.chunk.mockImplementationOnce(async () => {
      const file = uploaded();
      if (change === 'operation') file.appProperties = { colmapviewOperation: 'different' };
      if (change === 'checksum') file.md5Checksum = 'different';
      if (change === 'name') file.name = 'other.zip';
      setFile(file); return { complete: true, offset: 20 };
    });
    await controller.publish('scene', true, prepare);
    expect(controller.getSnapshot().phase).toBe('failed');
    expect(controller.getSnapshot().receipt).toBeUndefined();
    expect(client.share).not.toHaveBeenCalled();
  });
  it('cancels an in-flight chunk and retries after checking server state', async () => {
    const { controller, client, prepare } = fixture();
    let started!: () => void;
    const pending = new Promise<void>(resolve => { started = resolve; });
    client.chunk.mockImplementationOnce(async (_url, _blob, _offset, signal) => { started(); return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); });
    const attempt = controller.publish('scene', false, prepare);
    await pending;
    controller.cancel(); await attempt;
    expect(controller.getSnapshot()).toMatchObject({ phase: 'cancelled', canRetry: true });
    await controller.retry();
    expect(controller.getSnapshot().phase).toBe('completed');
  });
  it('invalidates a changed dataset during preparation and prevents a late upload or retry', async () => {
    const { controller, client } = fixture();
    let resolve!: (value: unknown) => void;
    const prepare = vi.fn().mockImplementation(() => new Promise(result => { resolve = result; }));
    const attempt = controller.publish('scene', false, prepare);
    controller.invalidate();
    resolve({ blob: new Blob(['late']), md5: 'md5', viewerBaseUrl: 'https://viewer.example/' });
    await attempt; await controller.retry();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'cancelled', canRetry: false });
    expect(client.generateId).not.toHaveBeenCalled();
  });
  it('rejects stalled and forward-jumping acknowledgements without declaring success', async () => {
    const { controller, client, prepare } = fixture(DRIVE_UPLOAD_CHUNK_BYTES + 10);
    client.chunk.mockResolvedValueOnce({ complete: false, offset: 0 });
    await controller.publish('scene', false, prepare);
    expect(controller.getSnapshot().error).toContain('did not confirm');
    client.status.mockResolvedValueOnce({ complete: false, offset: 0 });
    client.chunk.mockResolvedValueOnce({ complete: false, offset: DRIVE_UPLOAD_CHUNK_BYTES + 1 });
    await controller.retry();
    expect(controller.getSnapshot().error).toContain('inconsistent');
  });
  it('does not claim sharing succeeded when the organization denies it', async () => {
    const { controller, client, prepare } = fixture();
    client.share.mockRejectedValueOnce(new GoogleDrivePublishError('Organization denied sharing', 403));
    await controller.publish('scene', true, prepare);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', fileUrl: expect.stringContaining('drive.google.com'), canRetry: true });
    expect(controller.getSnapshot().receipt).toBeUndefined();
  });
  it('keeps offering a retry after a transient Hugging Face read failure', async () => {
    const { controller, prepare } = fixture();
    prepare.mockRejectedValueOnce(new HfError('x', 503));
    await controller.publish('scene', false, prepare);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: true, error: 'x' });
    await controller.retry();
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().phase).toBe('completed');
  });
  it('ends a publication whose image folder has 10,000 files', async () => {
    const { controller, client } = fixture();
    const images = Array.from({ length: 10_000 }, (_, index) => buildImage({ imageId: index + 1, name: `${index}.jpg` }));
    const input = { sourceKey: 'remote', modelRevision: 0, source: null, activeSplatId: null,
      reconstruction: buildReconstruction({ cameras: [buildCamera()], images, points3D: [buildPoint3D()] }),
      dataset: buildDatasetState({ sourceType: 'url', imageUrlBase: 'https://bucket.example/images/' }),
      transform: createIdentityEuler(), splatTransform: createIdentityEuler(), config: {}, viewState: null, appVersion: 'test', viewerBaseUrl: 'https://viewer.example/' };
    await controller.publish('scene', false, (signal, progress) => prepareDriveArchive(input, signal, progress, () => {}));
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: false, error: 'A dataset folder has too many files for publication.' });
    expect(client.owner).not.toHaveBeenCalled();
  });
  it('keeps a cancelled publication retryable even when the cancelled step hit a size limit', async () => {
    const { controller } = fixture();
    await controller.publish('scene', false, async () => { controller.cancel(); throw new HfError('Limit', undefined, true); });
    expect(controller.getSnapshot()).toMatchObject({ phase: 'cancelled', canRetry: true });
  });
  it.each(['', '../dataset', 'folder/name', 'line\nname', '.'])('validates file names before any API call: %s', name => {
    expect(() => normalizeDriveArchiveName(name)).toThrow('file name');
  });
});

/** Force collection: V8 keeps WeakRef targets alive until the current task ends. */
async function collected(ref: WeakRef<object>): Promise<boolean> {
  setFlagsFromString('--expose-gc');
  const gc = runInNewContext('gc') as () => void;
  for (let attempt = 0; attempt < 10 && ref.deref(); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 0));
    gc();
  }
  return ref.deref() === undefined;
}
/** Publishes with closures that are the only references to a stand-in for the captured PublicationInput. */
function publishTracked(controller: ReturnType<typeof fixture>['controller'], prepare: (signal: AbortSignal) => Promise<unknown>) {
  let ref!: WeakRef<object>;
  const attempt = (() => {
    const input = { reconstruction: new Uint8Array(1024) };
    ref = new WeakRef(input);
    return controller.publish('scene', false, async signal => { void input; return await prepare(signal) as never; }, () => { void input; });
  })();
  return { attempt, ref };
}

describe('Drive publication memory', () => {
  it('releases the published dataset once the upload completes', async () => {
    const { controller, blob } = fixture();
    const { attempt, ref } = publishTracked(controller, async () => ({ blob, md5: 'fixture-md5', viewerBaseUrl: 'https://viewer.example/latest/' }));
    await attempt;
    expect(controller.getSnapshot().phase).toBe('completed');
    expect(await collected(ref)).toBe(true);
  });
  it('releases a failed publication’s dataset when the dataset changes, and never retries it', async () => {
    const { controller, client, blob } = fixture();
    client.chunk.mockRejectedValueOnce(new GoogleDrivePublishError('Interrupted'));
    const { attempt, ref } = publishTracked(controller, async () => ({ blob, md5: 'fixture-md5', viewerBaseUrl: 'https://viewer.example/latest/' }));
    await attempt;
    controller.invalidate();
    await controller.retry();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: false });
    expect(client.chunk).toHaveBeenCalledOnce();
    expect(await collected(ref)).toBe(true);
  });
  it('drops a ZIP that finishes preparing after the dataset changed', async () => {
    const { controller, client } = fixture();
    let finish!: () => void;
    let late!: WeakRef<object>;
    const { attempt, ref } = publishTracked(controller, () => new Promise(resolve => {
      finish = () => { const blob = new Blob(['late']); late = new WeakRef(blob); resolve({ blob, md5: 'md5', viewerBaseUrl: 'https://viewer.example/' }); };
    }));
    controller.invalidate();
    finish();
    // The resolver would otherwise keep the settled promise, and so the ZIP, reachable from this test.
    finish = () => {};
    await attempt;
    expect(controller.getSnapshot()).toMatchObject({ phase: 'cancelled', canRetry: false });
    expect(client.owner).not.toHaveBeenCalled();
    expect(await collected(ref)).toBe(true);
    expect(await collected(late)).toBe(true);
  });
  it('ends a publication that failed a size limit instead of offering a retry', async () => {
    const { controller, client } = fixture();
    const limit = new GoogleDrivePublishError('The mask for photo.jpg exceeds the 128 MiB publication limit for non-splat files.', undefined, true);
    const { attempt, ref } = publishTracked(controller, async () => { throw limit; });
    await attempt;
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: false, error: limit.message });
    await controller.retry();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: false, error: limit.message });
    expect(client.owner).not.toHaveBeenCalled();
    expect(await collected(ref)).toBe(true);
  });
  it('ends a publication that failed a Hugging Face size limit the same way', async () => {
    const { controller, client } = fixture();
    const limit = new HfError('The file images/photo.jpg exceeds the 128 MiB publication limit.', undefined, true);
    let prepares = 0;
    const { attempt, ref } = publishTracked(controller, async () => { prepares++; throw limit; });
    await attempt;
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: false, error: limit.message });
    await controller.retry();
    expect(prepares).toBe(1);
    expect(client.owner).not.toHaveBeenCalled();
    expect(await collected(ref)).toBe(true);
  });
});
