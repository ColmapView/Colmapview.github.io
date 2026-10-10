import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BucketStorageModal } from './BucketStorageModal';
import { bucketConnection } from '../../features/bucketStorage/connection';
import { useDeletionStore, useReconstructionStore } from '../../store';
import { buildCamera, buildReconstruction } from '../../test/builders';

const publication = vi.hoisted(() => ({
  publish: vi.fn(), cancel: vi.fn(), reset: vi.fn(), state: { phase: 'idle', message: '', filesDone: 0, filesTotal: 0, bytesDone: 0 },
}));
vi.mock('../../features/bucketStorage/publicationRuntime', () => ({ publishCurrentDatasetToBucket: publication.publish, bucketPublication: {
  getSnapshot: () => publication.state, subscribe: () => () => {}, cancel: publication.cancel, reset: publication.reset,
} }));
const listing = '<ListBucketResult><Contents><Key>scene +#.tar</Key><Size>10</Size></Contents><CommonPrefixes><Prefix>nested/</Prefix></CommonPrefixes><IsTruncated>false</IsTruncated></ListBucketResult>';
const root = 'https://s3.example/bucket/';
const request = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('fetch', request);
  request.mockReset().mockImplementation(async () => new Response(listing));
  bucketConnection.disconnect();
  useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  useDeletionStore.setState(useDeletionStore.getInitialState(), true);
  publication.publish.mockReset(); publication.cancel.mockReset();
});
afterEach(() => { cleanup(); bucketConnection.disconnect(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function open() {
  const props = { isOpen: true, onClose: vi.fn(), onLoadUrl: vi.fn() };
  const rendered = render(<BucketStorageModal {...props} />);
  return { ...props, ...rendered };
}
function chooseBucket(credentials = false) {
  fireEvent.click(screen.getByRole('button', { name: 'S3 bucket' }));
  fireEvent.change(screen.getByLabelText('Bucket URL'), { target: { value: root } });
  if (credentials) {
    fireEvent.change(screen.getByLabelText('Access key ID'), { target: { value: 'fixture-access' } });
    fireEvent.change(screen.getByLabelText('Secret access key'), { target: { value: 'fixture-secret' } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
}

describe('bucket storage dialog', () => {
  it('opens public objects without connecting or asking for a secret', () => {
    const props = open();
    expect(screen.queryByLabelText('Secret access key')).toBeNull();
    fireEvent.change(screen.getByLabelText('Dataset URL'), { target: { value: 'https://public.example/scene.tar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load dataset' }));
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onLoadUrl).toHaveBeenCalledWith('https://public.example/scene.tar');
    expect(bucketConnection.getSession()).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
  it('browses a public bucket without authorization and loads the exact encoded object key', async () => {
    const props = open(); chooseBucket();
    const load = await screen.findByRole('button', { name: 'Load scene +#.tar' });
    expect(new Headers(request.mock.calls[0][1].headers).has('Authorization')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Upload dataset' })).toBeNull();
    fireEvent.click(load);
    expect(props.onLoadUrl).toHaveBeenCalledWith(root + 'scene%20%2B%23.tar');
  });
  it('clears pasted fields, retains only a tab session, and removes credentials on disconnect', async () => {
    open();
    const persist = vi.spyOn(Storage.prototype, 'setItem');
    chooseBucket(true);
    await screen.findByRole('button', { name: 'Load scene +#.tar' });
    expect(new Headers(request.mock.calls[0][1].headers).has('Authorization')).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    expect(document.body.innerHTML).not.toMatch(/fixture-secret|fixture-access/);
    const session = bucketConnection.getSession()!;
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(session.signal.aborted).toBe(true);
    expect(bucketConnection.getSession()).toBeNull();
    expect(screen.getByLabelText('Secret access key')).toHaveValue('');
    expect(screen.getByLabelText('Access key ID')).toHaveValue('');
  });
  it('keeps direct object reads available when ListBucket access is denied', async () => {
    request.mockImplementation(async () => new Response('<Error>do-not-show-this-secret</Error>', { status: 403 }));
    const props = open(); chooseBucket();
    expect(await screen.findByRole('alert')).toHaveTextContent('access was denied');
    expect(screen.getByRole('alert')).not.toHaveTextContent('do-not-show');
    fireEvent.change(screen.getByRole('textbox', { name: 'Object path' }), { target: { value: 'scene/manifest.json' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load object' }));
    expect(props.onLoadUrl).toHaveBeenCalledWith(root + 'scene/manifest.json');
  });
  it('cancels a pending listing on unmount while retaining the tab connection', async () => {
    request.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    }));
    const props = open(); chooseBucket();
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    const pendingSignal = request.mock.calls[0][1].signal!;
    props.unmount();
    expect(pendingSignal.aborted).toBe(true);
    expect(bucketConnection.getSession()).not.toBeNull();
  });
  it('aborts an old listing when the folder changes and ignores its late response', async () => {
    let resolveListing!: (response: Response) => void;
    request.mockImplementation(() => new Promise(resolve => { resolveListing = resolve; }));
    open(); chooseBucket();
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    const pendingSignal = request.mock.calls[0][1].signal!;
    fireEvent.change(screen.getByRole('textbox', { name: 'Bucket folder' }), { target: { value: 'another/' } });
    expect(pendingSignal.aborted).toBe(true);
    await act(async () => { resolveListing(new Response(listing)); });
    expect(screen.queryByRole('button', { name: 'Load scene +#.tar' })).toBeNull();
    expect(screen.queryByText('Listing objects…')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Bucket folder' })).toHaveValue('another/');
  });
  it('enables upload only for loaded COLMAP data and blocks pending deletions', async () => {
    act(() => bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' }));
    open();
    const button = screen.getByRole('button', { name: 'Upload dataset' });
    expect(button).toBeDisabled();
    act(() => useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }) }));
    expect(button).toBeEnabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Upload folder' }), { target: { value: 'datasets/my-scene' } });
    fireEvent.click(button);
    expect(publication.publish).toHaveBeenCalledExactlyOnceWith('datasets/my-scene');
    act(() => useDeletionStore.setState({ pendingDeletions: new Set([1]) }));
    expect(button).toBeDisabled();
    expect(screen.getByText('Apply or clear pending deletions first.')).toBeVisible();
  });
});
