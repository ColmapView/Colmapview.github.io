import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BucketPublishModal } from './BucketPublishModal';
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
const hubLink = vi.hoisted(() => ({ value: { state: { phase: 'idle' }, enabled: true, busy: false, retry: vi.fn(), markDeleteLinkSeen: vi.fn() } as Record<string, unknown> }));
vi.mock('../upload/useHubLink', () => ({ useHubLink: () => hubLink.value }));
beforeEach(() => {
  hubLink.value = { state: { phase: 'idle' }, enabled: true, busy: false, retry: vi.fn(), markDeleteLinkSeen: vi.fn() };
  vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('fetch', request);
  request.mockReset().mockImplementation(async () => new Response(listing));
  bucketConnection.disconnect();
  useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  useDeletionStore.setState(useDeletionStore.getInitialState(), true);
  useReconstructionStore.setState({ sourceName: 'dataset' });
  publication.publish.mockReset(); publication.cancel.mockReset();
  publication.reset.mockReset(); publication.state = { phase: 'idle', message: '', filesDone: 0, filesTotal: 0, bytesDone: 0 };
});
afterEach(() => { cleanup(); bucketConnection.disconnect(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function open() {
  const props = { isOpen: true, onClose: vi.fn() };
  const rendered = render(<BucketPublishModal {...props} />);
  return { ...props, ...rendered };
}
vi.mock('../modals/usePublicationPreview', () => ({ usePublicationPreview: () => ({ url: 'blob:current-view', busy: false }) }));

describe('bucket publisher', () => {
  it('uploads without Hub listing controls or extra contents notes', async () => {
    bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }) });
    open();
    expect(screen.queryByText(/Private uploads keep|Includes .*images/)).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'List on Hub' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Shorten URL' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Upload dataset' }));
    await waitFor(() => expect(publication.publish).toHaveBeenLastCalledWith('dataset', 'folder', 'original', null));
  });
  it('waits for the Hub to finish checking access before another upload', () => {
    bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }) });
    hubLink.value = { ...hubLink.value, state: { phase: 'checking', viewerUrl: 'https://viewer.example/?url=old' }, busy: true };
    open();
    expect(screen.getByRole('button', { name: 'Upload dataset' })).toBeDisabled();
  });
  it('offers JPEG copies for ZIPs and keeps Folder uploads on original images', async () => {
    bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }) });
    open();
    expect(screen.queryByRole('combobox', { name: 'Images' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Format' }), { target: { value: 'zip' } });
    expect(screen.getByRole('combobox', { name: 'Images' })).toHaveValue('original');
    fireEvent.change(screen.getByRole('combobox', { name: 'Images' }), { target: { value: 'jpeg' } });
    expect(screen.getByText(/Lossy, full resolution/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Upload dataset' }));
    await waitFor(() => expect(publication.publish).toHaveBeenLastCalledWith('dataset', 'zip', 'jpeg', null));
    fireEvent.change(screen.getByRole('combobox', { name: 'Format' }), { target: { value: 'folder' } });
    expect(screen.queryByRole('combobox', { name: 'Images' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Upload dataset' }));
    await waitFor(() => expect(publication.publish).toHaveBeenLastCalledWith('dataset', 'folder', 'original', null));
  });
  it('defaults to Folder, forwards a ZIP choice to the upload, and shows no Load dataset button', async () => {
    bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }) });
    open();
    expect(screen.getByRole('combobox', { name: 'Format' })).toHaveValue('folder');
    fireEvent.change(screen.getByRole('combobox', { name: 'Format' }), { target: { value: 'zip' } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload dataset' }));
    await waitFor(() => expect(publication.publish).toHaveBeenCalledExactlyOnceWith('dataset', 'zip', 'original', null));
    expect(screen.queryByRole('button', { name: 'Load dataset' })).toBeNull();
  });
  it('opens an upload connection form with a current-view preview and no loading tabs', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Publish to bucket' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Current dataset view' })).toHaveAttribute('src', 'blob:current-view');
    expect(screen.queryByRole('button', { name: 'Public URL' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'S3 bucket' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Load dataset' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Browse files' })).toBeNull();
    expect(screen.getByLabelText('Access key ID')).toBeRequired();
    expect(screen.getByLabelText('Secret key')).toBeRequired();
    expect(screen.getByRole('button', { name: 'Upload dataset' })).toBeDisabled();
  });
  it('upgrades an unsigned read connection without losing its endpoint or persisting keys', () => {
    bucketConnection.connect({ baseUrl: root, region: 'auto' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }) });
    const persist = vi.spyOn(Storage.prototype, 'setItem');
    open();
    expect(screen.getByLabelText('Bucket URL')).toHaveValue(root);
    fireEvent.change(screen.getByLabelText('Access key ID'), { target: { value: 'fixture-access' } });
    fireEvent.change(screen.getByLabelText('Secret key'), { target: { value: 'fixture-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(bucketConnection.getSnapshot().canWrite).toBe(true);
    expect(screen.queryByRole('form', { name: 'Bucket connection' })).toBeNull();
    expect(document.body.innerHTML).not.toMatch(/fixture-access|fixture-secret/);
    expect(persist).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Upload dataset' })).toBeEnabled();
  });
  it('keeps an unsigned connection when upload keys are empty, including whitespace', () => {
    bucketConnection.connect({ baseUrl: root, region: 'auto' });
    const session = bucketConnection.getSession();
    open();
    fireEvent.change(screen.getByLabelText('Access key ID'), { target: { value: ' ' } });
    fireEvent.change(screen.getByLabelText('Secret key'), { target: { value: ' ' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Bucket connection' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an access key and secret to upload.');
    expect(bucketConnection.getSession()).toBe(session);
    expect(screen.getByRole('button', { name: 'Upload dataset' })).toBeDisabled();
  });
  it('cancels the current upload and clears the tab connection from the header', () => {
    bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' });
    const session = bucketConnection.getSession()!;
    publication.state = { phase: 'uploading', message: 'Uploading files', filesDone: 1, filesTotal: 4, bytesDone: 10 };
    open();
    expect(screen.getByRole('progressbar', { name: 'Bucket upload progress' })).toHaveAttribute('value', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(publication.cancel).toHaveBeenCalledOnce();
    expect(bucketConnection.getSession()).toBeNull();
    expect(session.signal.aborted).toBe(true);
  });
  it('keeps an active upload running when the dialog closes', () => {
    bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' });
    publication.state = { phase: 'uploading', message: 'Uploading files', filesDone: 1, filesTotal: 4, bytesDone: 10 };
    const props = open();
    fireEvent.click(screen.getByRole('button', { name: 'Close bucket publication' }));
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(publication.cancel).not.toHaveBeenCalled();
    expect(bucketConnection.getSession()).not.toBeNull();
  });
  it('cancels partial-file inspection when hidden, while keeping the tab connection', async () => {
    bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' });
    publication.state = { phase: 'failed', message: 'Some files remain.', prefix: 'dataset/partial/', filesDone: 1, filesTotal: 4, bytesDone: 10 };
    request.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    }));
    const props = open();
    fireEvent.click(screen.getByRole('button', { name: 'Browse uploaded files' }));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    const signal = request.mock.calls[0][1].signal!;
    props.rerender(<BucketPublishModal isOpen={false} onClose={props.onClose} />);
    expect(signal.aborted).toBe(true);
    expect(bucketConnection.getSession()).not.toBeNull();
    expect(publication.cancel).not.toHaveBeenCalled();
  });
  it('shows the upload destination without a read-only Access row', () => {
    act(() => bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' }));
    act(() => useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }) }));
    open();
    expect(screen.getByLabelText('Upload folder').closest('details')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Access' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Upload dataset' }));
    expect(publication.publish).toHaveBeenCalledExactlyOnceWith('dataset', 'folder', 'original', null);
  });
  it('shows the same viewer link and result actions without claiming the bucket is public', () => {
    hubLink.value = { ...hubLink.value, enabled: false };
    act(() => bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' }));
    publication.state = { phase: 'completed', message: 'Dataset uploaded.', filesDone: 2, filesTotal: 2, bytesDone: 10,
      viewerUrl: 'https://viewer.example/?url=https://s3.example/bucket/dataset/manifest.json' };
    const props = open();
    expect(screen.getByLabelText('Share link')).toHaveValue(publication.state.viewerUrl);
    expect(screen.getByText('Access follows your bucket permissions. Viewers need bucket access for private files.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open link' })).toHaveAttribute('href', publication.state.viewerUrl);
    expect(screen.queryByRole('button', { name: 'Upload another dataset' })).toBeNull();
    props.rerender(<BucketPublishModal isOpen={false} onClose={props.onClose} />);
    props.rerender(<BucketPublishModal isOpen onClose={props.onClose} />);
    expect(screen.getByLabelText('Share link')).toHaveValue(publication.state.viewerUrl);
    expect(screen.queryByLabelText('Upload folder')).toBeNull();
    expect(publication.reset).not.toHaveBeenCalled();
    expect(publication.publish).not.toHaveBeenCalled();
  });
  it.each(['failed', 'cancelled'] as const)('identifies and browses the %s upload folder including source files before reset', async phase => {
    bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' });
    const prefix = 'dataset/partial +#/';
    publication.state = { phase, message: 'Completed objects remain in the new folder.', prefix, filesDone: 2, filesTotal: 4, bytesDone: 10 };
    request.mockImplementation(async url => {
      const listingPrefix = new URL(url).searchParams.get('prefix');
      const contents = listingPrefix === prefix
        ? `<CommonPrefixes><Prefix>${prefix}sparse/</Prefix></CommonPrefixes>`
        : listingPrefix === `${prefix}sparse/`
          ? `<CommonPrefixes><Prefix>${prefix}sparse/0/</Prefix></CommonPrefixes>`
          : `<Contents><Key>${prefix}sparse/0/cameras.bin</Key><Size>8</Size></Contents>`;
      return new Response(`<ListBucketResult>${contents}<IsTruncated>false</IsTruncated></ListBucketResult>`);
    });
    open();
    expect(screen.getByRole('textbox', { name: 'Upload folder' })).toHaveValue(prefix);
    expect(screen.getByRole('textbox', { name: 'Upload folder' })).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: 'Browse uploaded files' }));
    fireEvent.click(await screen.findByRole('button', { name: 'sparse/' }));
    fireEvent.click(await screen.findByRole('button', { name: '0/' }));
    expect(await screen.findByText('cameras.bin')).toBeVisible();
    expect(screen.queryByText('No datasets in this folder.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Load dataset/partial +#/sparse/0/cameras.bin' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Dataset path' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Load dataset' })).toBeNull();
    expect(new URL(request.mock.calls[0][0]).searchParams.get('prefix')).toBe(prefix);
    expect(publication.reset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start a new publication' }));
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
    expect(publication.publish).toHaveBeenCalledExactlyOnceWith('datasets/my-scene', 'folder', 'original', null);
    act(() => useDeletionStore.setState({ pendingDeletions: new Set([1]) }));
    expect(button).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apply deletions and continue' })).toBeVisible();
  });

  it('names the upload folder after the dataset until the name is edited', () => {
    bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }), sourceName: 'garden' });
    open();
    expect(screen.getByLabelText('Upload folder')).toHaveValue('garden');
  });

  it('keeps an edited upload folder for its dataset only, then returns to the next dataset\'s default', () => {
    bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }), sourceName: 'garden' });
    open();
    fireEvent.change(screen.getByLabelText('Upload folder'), { target: { value: 'datasets/my-edit' } });
    expect(screen.getByLabelText('Upload folder')).toHaveValue('datasets/my-edit');
    act(() => useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }), sourceName: 'harbor' }));
    expect(screen.getByLabelText('Upload folder')).toHaveValue('harbor');
  });
  it('drops the read-only Access row, discloses the bucket Hub link, and names fields as they read', () => {
    open();
    expect(screen.getByLabelText('Secret key')).toBeVisible();
    fireEvent.click(screen.getByText('More options'));
    expect(screen.getByLabelText('Public URL (optional)')).toBeVisible();
    expect(screen.getByLabelText('Session token (optional)')).toBeVisible();
    bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }) });
    cleanup();
    open();
    expect(screen.queryByLabelText('Access', { exact: true })).toBeNull();
    expect(screen.getByText('Also creates a ColmapView Hub link (short if the bucket is public). Anyone with it sees the title, description and preview. Original images keep their metadata, such as location.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Upload dataset' })).toHaveAccessibleDescription('Also creates a ColmapView Hub link (short if the bucket is public). Anyone with it sees the title, description and preview. Original images keep their metadata, such as location.');
  });

  it('shows no Hub disclosure where the Hub is off', () => {
    hubLink.value = { ...hubLink.value, enabled: false };
    bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }) });
    open();
    expect(screen.queryByText(/ColmapView Hub link/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Upload dataset' })).not.toHaveAttribute('aria-describedby');
  });

  it.each([
    ['public', 'Anyone can open this link.'],
    ['private', 'Private. Viewers need bucket access.'],
    ['unknown', 'Public access unconfirmed, so the Hub link is unguessable.'],
  ] as const)('states a %s bucket outcome in the result', (bucketAccess, notice) => {
    const viewerUrl = 'https://colmapview.opsiclear.com/?url=https://bucket.example/scene/manifest.json';
    publication.state = { phase: 'completed', message: 'Dataset uploaded.', filesDone: 1, filesTotal: 1, bytesDone: 1, viewerUrl };
    hubLink.value = { ...hubLink.value, state: { phase: 'ready', viewerUrl, bucketAccess, url: 'https://hub.invalid/hub/X', managementUrl: 'https://hub.invalid/hub/manage/X#k' } };
    open();
    expect(screen.getByText(notice)).toBeVisible();
  });

  it('says it is checking public access while the check runs, and moves focus to the first field after connecting', () => {
    const viewerUrl = 'https://colmapview.opsiclear.com/?url=https://bucket.example/scene/manifest.json';
    publication.state = { phase: 'completed', message: 'Dataset uploaded.', filesDone: 1, filesTotal: 1, bytesDone: 1, viewerUrl };
    hubLink.value = { ...hubLink.value, state: { phase: 'checking', viewerUrl } };
    open();
    expect(screen.getByText('Checking public access…')).toBeVisible();
    cleanup();
    publication.state = { phase: 'idle', message: '', filesDone: 0, filesTotal: 0, bytesDone: 0 };
    hubLink.value = { ...hubLink.value, state: { phase: 'idle' } };
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }) });
    open();
    act(() => { bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' }); });
    expect(screen.getByRole('combobox', { name: 'Format' })).toHaveFocus();
  });

});
