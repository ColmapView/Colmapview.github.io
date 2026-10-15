import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHubPublication, type HubPublication } from './publication';
import { bindHubPublication } from './bindHubPublication';
import { hubShareLinks } from './hubShareLinks';
import { createPublicationController, isPublishing } from '../datasetPublishing/publishDataset';
import { createDrivePublicationController, isDrivePublishing } from '../googleDrive/publishDataset';
import { createBucketPublicationController, isBucketPublishing } from '../bucketStorage/publishDataset';
import type { HubClient } from '../huggingface/hubClient';
import type { DriveUploadClient } from '../googleDrive/upload';
import type { BucketSession } from '../bucketStorage/types';
import type { PreparedPublication, PublicationDetails } from '../datasetPublishing/types';

const HUB = 'https://hub.invalid/hub';
const preview = new File(['preview'], 'preview.png', { type: 'image/png' });
const source = { key: '1:url:https://storage.example/a/:', revision: 0 };
const first = { url: `${HUB}/First`, managementUrl: `${HUB}/manage/First` };
const viewer = 'https://colmapview.opsiclear.com/?url=https://storage.example/a/';
const never = () => new Promise<never>(() => {});

let unbind = () => {};
beforeEach(() => { for (const provider of ['huggingFace', 'googleDrive', 'bucket']) hubShareLinks.set(provider, null); });
afterEach(() => unbind());

/** A Hub controller holding a ready link, as left by the previous upload. */
async function hubWithLink(provider: 'huggingFace' | 'googleDrive' | 'bucket'): Promise<HubPublication> {
  const hub = createHubPublication(provider, { baseUrl: () => HUB, thumbnail: async () => 'jpeg', request: vi.fn().mockResolvedValue(first),
    checkBucket: async () => 'public', notify: vi.fn(), currentSource: () => source });
  await hub.prepare({ title: 'First' }, { access: 'public', preview, source }, async () => { hub.commit(); });
  await hub.finish(viewer);
  return hub;
}

function expectPreviousLink(hub: HubPublication) {
  expect(hub.getSnapshot()).toMatchObject({ phase: 'ready', url: first.url });
  expect(hubShareLinks.match(source, 0)).toBe(first.url);
}

/** Starts an upload that never finishes, which commits its draft, then gives that draft a ready link of its own. */
async function startRunningUpload(hub: HubPublication, start: () => Promise<void>) {
  void hub.prepare({ title: 'Running' }, { access: 'public', preview, source }, start);
  expect(hubShareLinks.match(source, 0)).toBeNull();
  expect(hub.getSnapshot().phase).toBe('idle');
  await hub.finish(viewer);
  expectPreviousLink(hub);
}

describe('an upload its controller refuses keeps the previous Hub link and share link', () => {
  it('on Hugging Face', async () => {
    const hub = await hubWithLink('huggingFace');
    const publication = createPublicationController({} as HubClient, vi.fn());
    unbind = bindHubPublication(publication, hub, state => ({ uploading: isPublishing(state.phase) }));
    const details: PublicationDetails = { name: 'scene', title: 'Scene', description: '', license: 'mit', visibility: 'public' };
    const work = vi.fn(never as () => Promise<PreparedPublication>);
    // A validation error returns the form to idle with the error.
    await hub.prepare({ title: 'Bad' }, { access: 'public', preview, source }, () => publication.publish('not a user!', details, work));
    await hub.prepare({ title: 'Bad' }, { access: 'public', preview, source }, () => publication.publish('user', { ...details, title: ' ' }, work));
    expect(publication.getSnapshot().error).toBeTruthy();
    expectPreviousLink(hub);
    // An upload already running refuses another.
    await startRunningUpload(hub, () => publication.publish('user', details, work));
    await hub.prepare({ title: 'Refused' }, { access: 'public', preview, source }, () => publication.publish('user', details, work));
    expect(work).toHaveBeenCalledOnce();
    expectPreviousLink(hub);
  });

  it('on Google Drive', async () => {
    const hub = await hubWithLink('googleDrive');
    const publication = createDrivePublicationController({} as DriveUploadClient);
    unbind = bindHubPublication(publication, hub, state => ({ uploading: isDrivePublishing(state.phase) }));
    const prepare = vi.fn(never);
    for (const name of ['folder/scene.zip', '   ', '..']) {
      await expect(hub.prepare({ title: name }, { access: 'public', preview, source }, () => publication.publish(name, true, prepare)))
        .rejects.toThrow('Choose a file name without slashes or control characters (up to 180 characters).');
    }
    expectPreviousLink(hub);
    // The dataset changed before the upload started.
    await hub.prepare({ title: 'Stale' }, { access: 'public', preview, source }, () => publication.publish('scene.zip', true, prepare, () => { throw new Error('stale'); }));
    expect(publication.getSnapshot().phase).toBe('failed');
    expectPreviousLink(hub);
    publication.reset();
    await startRunningUpload(hub, () => publication.publish('scene.zip', true, prepare));
    await hub.prepare({ title: 'Refused' }, { access: 'public', preview, source }, () => publication.publish('other.zip', true, prepare));
    expect(prepare).toHaveBeenCalledOnce();
    expectPreviousLink(hub);
  });

  it('on a bucket', async () => {
    const hub = await hubWithLink('bucket');
    const publication = createBucketPublicationController();
    unbind = bindHubPublication(publication, hub, state => ({ uploading: isBucketPublishing(state.phase) }));
    const session = (canWrite: boolean) => ({ canWrite, signal: new AbortController().signal, config: { baseUrl: 'https://bucket.example/', region: 'auto' } }) as unknown as BucketSession;
    const prepare = vi.fn(never as () => Promise<PreparedPublication>);
    const refused = (folder: string, canWrite = true, assertCurrent = () => {}) =>
      hub.prepare({ title: folder }, { access: 'check', preview, source }, () => publication.publish(session(canWrite), folder, prepare, assertCurrent));
    await expect(refused('datasets/scene', false)).rejects.toThrow('Connect with an access key and secret to upload.');
    await expect(refused('  /  ')).rejects.toThrow('Enter a destination folder.');
    await expect(refused('datasets/../scene')).rejects.toThrow('The bucket path is unsupported.');
    await refused('datasets/scene', true, () => { throw new Error('stale'); });
    expect(publication.getSnapshot().phase).toBe('failed');
    expectPreviousLink(hub);
    await startRunningUpload(hub, () => publication.publish(session(true), 'datasets/scene', prepare, () => {}));
    await refused('datasets/other');
    expect(prepare).toHaveBeenCalledOnce();
    expectPreviousLink(hub);
  });
});
