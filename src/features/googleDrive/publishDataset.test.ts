import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  it.each(['', '../dataset', 'folder/name', 'line\nname', '.'])('validates file names before any API call: %s', name => {
    expect(() => normalizeDriveArchiveName(name)).toThrow('file name');
  });
});
