import { Blob as NodeBlob } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeletionStore, useReconstructionStore } from '../../store';
import { buildReconstruction } from '../../test/builders';
import { assertPublicationInputCurrent, capturePublicationInput } from '../datasetPublishing/publicationSnapshot';
import { GoogleDrivePublishError } from './upload';
import { drivePublication } from './publicationRuntime';

const client = vi.hoisted(() => {
  const files = new Map<string, Record<string, unknown>>();
  let ids = 0;
  let upload = { id: '', name: '', operation: '' };
  const hooks = { beforeChunk: () => {} };
  return {
    hooks,
    owner: async () => 'account', generateId: async () => `DRIVE_FILE_${String(++ids).padStart(9, '0')}`,
    file: async (id: string) => files.get(id) ?? null,
    start: async (id: string, name: string, operation: string) => { upload = { id, name, operation }; return 'session'; },
    status: async () => ({ complete: false, offset: 0 }),
    chunk: async (_url: string, blob: Blob) => {
      hooks.beforeChunk();
      files.set(upload.id, { id: upload.id, name: upload.name, size: String(blob.size), mimeType: 'application/zip', md5Checksum: 'md5',
        appProperties: { colmapviewOperation: upload.operation }, permissions: [] });
      return { complete: true, offset: blob.size };
    },
    share: async () => {},
  };
});
vi.mock('./upload', async importOriginal => ({ ...await importOriginal<typeof import('./upload')>(), createDriveUploadClient: () => client }));

const archive = async () => ({ blob: new Blob(['zip']), md5: 'md5', viewerBaseUrl: 'https://viewer.example/' });

describe('Drive publication receipt', () => {
  beforeEach(() => {
    vi.stubGlobal('Blob', NodeBlob);
    drivePublication.reset();
    client.hooks.beforeChunk = () => {};
    useDeletionStore.setState({ pendingDeletions: new Set() });
    useReconstructionStore.setState({ ...useReconstructionStore.getInitialState(),
      reconstruction: buildReconstruction(), sourceType: 'url', sourceUrl: 'https://example.test/fixture/' }, true);
  });

  it('clears a finished Drive receipt when another dataset loads', async () => {
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), sourceType: 'url', sourceUrl: 'https://example.test/a/' });
    await drivePublication.publish('a', false, archive);
    expect(drivePublication.getSnapshot().phase).toBe('completed');
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), sourceUrl: 'https://example.test/b/' });
    expect(drivePublication.getSnapshot().phase).toBe('idle');
    expect(drivePublication.getSnapshot().receipt).toBeUndefined();
  });
  it('clears a failed Drive publication when another dataset loads', async () => {
    client.hooks.beforeChunk = () => { client.hooks.beforeChunk = () => {}; throw new GoogleDrivePublishError('Interrupted'); };
    await drivePublication.publish('b', false, archive);
    expect(drivePublication.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: true, error: 'Interrupted' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), sourceUrl: 'https://example.test/c/' });
    expect(drivePublication.getSnapshot()).toMatchObject({ phase: 'idle', canRetry: false });
    expect(drivePublication.getSnapshot().error).toBeUndefined();
  });
  it.each([
    ['the model is edited', () => useReconstructionStore.setState(state => ({ reconstructionEditRevision: state.reconstructionEditRevision + 1 }))],
    ['an image is marked for deletion', () => useDeletionStore.setState({ pendingDeletions: new Set([1]) })],
  ])('clears a finished Drive receipt when %s', async (_, change) => {
    try {
      await drivePublication.publish('d', false, archive);
      expect(drivePublication.getSnapshot()).toMatchObject({ phase: 'completed', fileUrl: expect.any(String), receipt: { shared: false } });
      change();
      expect(drivePublication.getSnapshot()).toMatchObject({ phase: 'idle', canRetry: false });
      expect(drivePublication.getSnapshot().receipt).toBeUndefined();
      expect(drivePublication.getSnapshot().fileUrl).toBeUndefined();
    } finally {
      useDeletionStore.setState({ pendingDeletions: new Set() });
    }
  });
  it('finishes uploading a built ZIP when an image is marked for deletion', async () => {
    const input = capturePublicationInput();
    client.hooks.beforeChunk = () => { useDeletionStore.setState({ pendingDeletions: new Set([1]) }); };
    try {
      await drivePublication.publish('c', false, archive, () => assertPublicationInputCurrent(input));
      expect(drivePublication.getSnapshot()).toMatchObject({ phase: 'completed', receipt: { shared: false } });
    } finally {
      client.hooks.beforeChunk = () => {};
      useDeletionStore.setState({ pendingDeletions: new Set() });
    }
  });
});
