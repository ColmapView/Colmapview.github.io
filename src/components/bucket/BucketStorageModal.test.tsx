import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BucketStorageModal } from './BucketStorageModal';
import { bucketConnection } from '../../features/bucketStorage/connection';
import { useDeletionStore, useReconstructionStore } from '../../store';
import { buildCamera, buildReconstruction } from '../../test/builders';
import type { BucketPublicationState } from '../../features/bucketStorage/publishDataset';

const publication = vi.hoisted(() => ({
  publish: vi.fn(), cancel: vi.fn(), reset: vi.fn(), state: { phase: 'idle', message: '', filesDone: 0, filesTotal: 0, bytesDone: 0 } as BucketPublicationState,
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
  publication.reset.mockReset(); publication.state = { phase: 'idle', message: '', filesDone: 0, filesTotal: 0, bytesDone: 0 };
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
    expect(request).not.toHaveBeenCalled();
    expect(screen.queryByRole('list', { name: 'Bucket objects' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Browse files' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Browse files' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Browse files' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('access was denied');
    expect(screen.getByRole('alert')).not.toHaveTextContent('do-not-show');
    fireEvent.change(screen.getByRole('textbox', { name: 'Dataset path' }), { target: { value: 'scene/manifest.json' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load dataset' }));
    expect(props.onLoadUrl).toHaveBeenCalledWith(root + 'scene/manifest.json');
  });
  it('cancels a pending listing on unmount while retaining the tab connection', async () => {
    request.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    }));
    const props = open(); chooseBucket();
    fireEvent.click(screen.getByRole('button', { name: 'Browse files' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Browse files' }));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    const pendingSignal = request.mock.calls[0][1].signal!;
    fireEvent.change(screen.getByRole('textbox', { name: 'Dataset path' }), { target: { value: 'another/' } });
    expect(pendingSignal.aborted).toBe(true);
    await act(async () => { resolveListing(new Response(listing)); });
    expect(screen.queryByRole('button', { name: 'Load scene +#.tar' })).toBeNull();
    expect(screen.queryByText('Listing files…')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Dataset path' })).toHaveValue('another/');
  });
  it.each([
    ['scene', 'scene/'],
    ['scene/', 'scene/'],
    ['', ''],
    [' scene +#.tar ', 'scene%20%2B%23.tar'],
    ['scene/manifest.json', 'scene/manifest.json'],
  ])('loads the folder or object at %j through the same path field', (path, encodedPath) => {
    const props = open(); chooseBucket();
    fireEvent.change(screen.getByRole('textbox', { name: 'Dataset path' }), { target: { value: path } });
    fireEvent.click(screen.getByRole('button', { name: 'Load dataset' }));
    expect(props.onLoadUrl).toHaveBeenCalledExactlyOnceWith(root + encodedPath);
    expect(request).not.toHaveBeenCalled();
  });
  it('browses back to the parent and keeps source files out of the dataset list', async () => {
    request.mockImplementation(async url => {
      const prefix = new URL(url).searchParams.get('prefix');
      return new Response(prefix === 'nested/'
        ? '<ListBucketResult><Contents><Key>nested/cameras.txt</Key><Size>10</Size></Contents><Contents><Key>nested/manifest.json</Key><Size>10</Size></Contents><IsTruncated>false</IsTruncated></ListBucketResult>'
        : listing);
    });
    open(); chooseBucket();
    fireEvent.click(screen.getByRole('button', { name: 'Browse files' }));
    fireEvent.click(await screen.findByRole('button', { name: 'nested/' }));
    await screen.findByRole('button', { name: 'Load nested/manifest.json' });
    expect(screen.getByRole('textbox', { name: 'Dataset path' })).toHaveValue('nested/');
    expect(screen.queryByText('cameras.txt')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Up one folder' }));
    await screen.findByRole('button', { name: 'Load scene +#.tar' });
    expect(screen.getByRole('textbox', { name: 'Dataset path' })).toHaveValue('');
  });
  it('opens the parent folder when browsing from a file path', async () => {
    request.mockImplementation(async () => new Response('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>'));
    open(); chooseBucket();
    fireEvent.change(screen.getByRole('textbox', { name: 'Dataset path' }), { target: { value: 'nested/scene.tar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Browse files' }));
    await screen.findByText('No datasets in this folder.');
    expect(new URL(request.mock.calls[0][0]).searchParams.get('prefix')).toBe('nested/');
    expect(screen.getByRole('textbox', { name: 'Dataset path' })).toHaveValue('nested/');
  });
  it('keeps pagination available when a page contains only source files', async () => {
    request.mockImplementation(async url => new Response(new URL(url).searchParams.has('continuation-token') ? listing
      : '<ListBucketResult><Contents><Key>photo.jpg</Key><Size>10</Size></Contents><NextContinuationToken>next</NextContinuationToken><IsTruncated>true</IsTruncated></ListBucketResult>'));
    open(); chooseBucket();
    fireEvent.click(screen.getByRole('button', { name: 'Browse files' }));
    await screen.findByText('No datasets on this page.');
    expect(screen.queryByText('photo.jpg')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More files' }));
    await screen.findByRole('button', { name: 'Load scene +#.tar' });
    expect(new URL(request.mock.calls[1][0]).searchParams.get('continuation-token')).toBe('next');
  });
  it('aborts a listing when browsing is collapsed and retains the connection', async () => {
    let resolveListing!: (response: Response) => void;
    request.mockImplementation(() => new Promise(resolve => { resolveListing = resolve; }));
    open(); chooseBucket();
    const browse = screen.getByRole('button', { name: 'Browse files' });
    fireEvent.click(browse);
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    fireEvent.click(browse);
    expect(request.mock.calls[0][1].signal!.aborted).toBe(true);
    await act(async () => { resolveListing(new Response(listing)); });
    expect(browse).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Bucket objects' })).toBeNull();
    expect(bucketConnection.getSession()).not.toBeNull();
  });
  it('shows the upload destination and existing bucket permissions directly', () => {
    act(() => bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' }));
    act(() => useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }) }));
    open();
    expect(screen.getByLabelText('Upload folder').closest('details')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Access' })).toHaveValue('Bucket permissions');
    expect(screen.getByRole('textbox', { name: 'Access' })).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: 'Upload dataset' }));
    expect(publication.publish).toHaveBeenCalledExactlyOnceWith('dataset');
  });
  it('shows the same viewer link and result actions without claiming the bucket is public', () => {
    act(() => bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' }));
    publication.state = { phase: 'completed', message: 'Dataset uploaded.', filesDone: 2, filesTotal: 2, bytesDone: 10,
      viewerUrl: 'https://viewer.example/?url=https://s3.example/bucket/dataset/manifest.json' };
    open();
    expect(screen.getByLabelText('Bucket viewer link')).toHaveValue(publication.state.viewerUrl);
    expect(screen.getByText('Access follows your bucket permissions. Viewers need bucket access for private files.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open viewer' })).toHaveAttribute('href', publication.state.viewerUrl);
    fireEvent.click(screen.getByRole('button', { name: 'Upload another dataset' }));
    expect(publication.reset).toHaveBeenCalledOnce();
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
