import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeletionStore, useReconstructionStore } from '../../store';
import { buildCamera, buildReconstruction } from '../../test/builders';
import { publishCurrentDatasetToBucket } from './publicationRuntime';
import type { BucketSession } from './types';

const controller = vi.hoisted(() => ({
  invalidate: vi.fn(), cancel: vi.fn(), publish: vi.fn(() => Promise.resolve()),
  getSnapshot: () => ({ phase: 'idle' }),
  subscribe: () => () => {},
}));
const hub = vi.hoisted(() => ({ finish: vi.fn(), commit: vi.fn(), blocksUnload: vi.fn(() => false),
  prepare: vi.fn((_metadata: unknown, _options: unknown, start: () => Promise<void>) => start()) }));
const connection = vi.hoisted(() => ({ getSession: vi.fn<() => BucketSession | null>() }));
vi.mock('../colmapviewHub/publication', () => ({ hubPublications: { bucket: hub } }));
vi.mock('./connection', () => ({ bucketConnection: connection }));
vi.mock('./publishDataset', async importOriginal => ({
  ...await importOriginal<typeof import('./publishDataset')>(),
  createBucketPublicationController: () => controller,
}));

const session = (canWrite: boolean) => ({ canWrite }) as unknown as BucketSession;

describe('Bucket publication runtime', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }), sourceType: 'url', sourceUrl: 'https://example.test/a/' });
    hub.prepare.mockClear();
    controller.publish.mockClear();
    connection.getSession.mockReturnValue(session(true));
  });

  it('prepares the Hub link from the last folder segment, and starts the upload through it', async () => {
    await publishCurrentDatasetToBucket(' /datasets/scene/ ');
    expect(hub.prepare).toHaveBeenCalledExactlyOnceWith({ title: 'scene' }, expect.objectContaining({ access: 'check', preview: null }), expect.any(Function));
    expect(controller.publish).toHaveBeenCalledExactlyOnceWith(session(true), ' /datasets/scene/ ', expect.any(Function), expect.any(Function));
  });

  it('leaves the folder and write-access checks to the controller, whose refusal keeps the previous Hub link', async () => {
    connection.getSession.mockReturnValue(session(false));
    await publishCurrentDatasetToBucket('  /  ');
    expect(hub.prepare).toHaveBeenCalledExactlyOnceWith({ title: 'Dataset' }, expect.anything(), expect.any(Function));
    expect(controller.publish).toHaveBeenCalledOnce();
  });

  it('rejects JPEG copies outside a ZIP and a missing session before preparing the Hub link', () => {
    expect(() => publishCurrentDatasetToBucket('datasets/scene', 'folder', 'jpeg')).toThrow('JPEG image conversion requires ZIP archive format.');
    connection.getSession.mockReturnValue(null);
    expect(() => publishCurrentDatasetToBucket('datasets/scene')).toThrow('Connect to a bucket before uploading.');
    expect(hub.prepare).not.toHaveBeenCalled();
  });

  it('stops the upload when another dataset loads, the model is edited or deletions are marked', () => {
    controller.invalidate.mockClear();
    useReconstructionStore.setState({ sourceUrl: 'https://example.test/b/' });
    useReconstructionStore.setState(state => ({ reconstructionEditRevision: state.reconstructionEditRevision + 1 }));
    useDeletionStore.setState({ pendingDeletions: new Set([1]) });
    expect(controller.invalidate).toHaveBeenCalledTimes(3);
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
  });
});
