import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReconstructionStore } from '../../store';
import { buildCamera, buildReconstruction } from '../../test/builders';
import { publishCurrentDatasetToBucket } from './publicationRuntime';
import type { BucketSession } from './types';

const controller = vi.hoisted(() => ({
  invalidate: vi.fn(), cancel: vi.fn(), publish: vi.fn(() => Promise.resolve()),
  getSnapshot: () => ({ phase: 'idle' }),
  subscribe: () => () => {},
}));
const hub = vi.hoisted(() => ({ finish: vi.fn(), prepare: vi.fn(), blocksUnload: vi.fn(() => false) }));
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

  it('prepares the Hub link from the normalized folder, then publishes', async () => {
    await publishCurrentDatasetToBucket('/datasets/scene/');
    expect(hub.prepare).toHaveBeenCalledExactlyOnceWith({ title: 'scene' }, expect.objectContaining({ access: 'check', preview: null }));
    expect(controller.publish).toHaveBeenCalledOnce();
  });

  it.each([
    ['an empty folder', '  /  ', 'Enter a destination folder.'],
    ['a folder with dot segments', 'datasets/../scene', 'The bucket path is unsupported.'],
  ])('rejects %s before touching the Hub link, so the previous upload keeps its link', (_, folder, message) => {
    expect(() => publishCurrentDatasetToBucket(folder)).toThrow(message);
    expect(hub.prepare).not.toHaveBeenCalled();
    expect(controller.publish).not.toHaveBeenCalled();
  });

  it('rejects a read-only session before touching the Hub link', () => {
    connection.getSession.mockReturnValue(session(false));
    expect(() => publishCurrentDatasetToBucket('datasets/scene')).toThrow('Connect with an access key and secret to upload.');
    expect(hub.prepare).not.toHaveBeenCalled();
  });
});
