import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleDrivePublishModal } from './GoogleDrivePublishModal';
import type { DrivePublicationState } from '../../features/googleDrive/publishDataset';
import { usePublicationPreview } from './usePublicationPreview';

const actions = vi.hoisted(() => ({
  publishDataset: vi.fn(), retry: vi.fn(), reset: vi.fn(), cancel: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), apply: vi.fn(),
  auth: { status: 'connected', error: null } as { status: string; error: string | null },
  publish: { phase: 'idle' } as Partial<DrivePublicationState>, pending: 0, reconstruction: {} as object | null,
  sourceKey: 'current-scene', capture: vi.fn<() => Promise<Blob | null>>(),
  preview: { url: 'blob:current-view' as string | null, busy: false },
  datasetName: 'dataset',
}));
vi.mock('./useGoogleDrivePublishStoreFacade', () => ({ useGoogleDrivePublishStoreFacade: () => ({
  auth: actions.auth, publish: actions.publish, reconstruction: actions.reconstruction, pendingDeletions: actions.pending,
  sourceKey: actions.sourceKey, getScreenshotBlob: actions.capture, datasetName: actions.datasetName,
  publishDataset: actions.publishDataset, applyDeletionsToData: actions.apply,
  publication: { retry: actions.retry, reset: actions.reset, cancel: actions.cancel },
  googleDriveAuth: { connect: actions.connect, disconnect: actions.disconnect },
}) }));
vi.mock('./usePublicationPreview', () => ({ usePublicationPreview: vi.fn(() => actions.preview) }));
vi.mock('../../features/googleDrive/auth', async importOriginal => ({
  ...await importOriginal<typeof import('../../features/googleDrive/auth')>(),
  loadGoogleOAuthSdk: vi.fn().mockResolvedValue({ initTokenClient: vi.fn() }),
}));
const hubLink = vi.hoisted(() => ({ value: { state: { phase: 'idle' }, enabled: true, busy: false, retry: vi.fn() } as Record<string, unknown> }));
vi.mock('../upload/useHubLink', () => ({ useHubLink: () => hubLink.value }));
beforeEach(() => {
  vi.clearAllMocks();
  hubLink.value = { state: { phase: 'idle' }, enabled: true, busy: false, retry: vi.fn() };
  actions.auth = { status: 'connected', error: null }; actions.publish = { phase: 'idle' }; actions.pending = 0; actions.reconstruction = {};
  actions.sourceKey = 'current-scene'; actions.preview = { url: 'blob:current-view', busy: false }; actions.datasetName = 'dataset';
  vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '123456-test.apps.googleusercontent.com');
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

// Opening the dialog loads the Google sign-in SDK; let that load settle inside act.
async function renderOpenDialog(onClose: () => void = vi.fn()) {
  const view = render(<GoogleDrivePublishModal isOpen onClose={onClose} />);
  await act(async () => Promise.resolve());
  return view;
}

describe('Google Drive publishing dialog', () => {
  it('defaults to public without Hub listing controls and still allows private uploads', async () => {
    await renderOpenDialog();
    expect(screen.queryByRole('checkbox', { name: 'List on Hub' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Access' })).toHaveValue('public');
    expect(screen.queryByRole('checkbox', { name: 'Shorten URL' })).toBeNull();
    expect(screen.queryByText(/Public uploads receive|Includes .*images/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Publish shared dataset' }));
    await waitFor(() => expect(actions.publishDataset).toHaveBeenLastCalledWith('dataset.zip', true, 'original', null));
    fireEvent.change(screen.getByRole('combobox', { name: 'Access' }), { target: { value: 'private' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save private dataset' }));
    await waitFor(() => expect(actions.publishDataset).toHaveBeenLastCalledWith('dataset.zip', false, 'original', null));
  });
  it('offers opt-in JPEG copies and forwards the selected encoding without changing public access', async () => {
    await renderOpenDialog();
    expect(screen.getByRole('combobox', { name: 'Images' })).toHaveValue('original');
    fireEvent.change(screen.getByRole('combobox', { name: 'Images' }), { target: { value: 'jpeg' } });
    expect(screen.getByText(/Lossy, full resolution/)).toBeVisible();
    expect(screen.queryByText(/Original image metadata is retained/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Publish shared dataset' }));
    await waitFor(() => expect(actions.publishDataset).toHaveBeenCalledWith('dataset.zip', true, 'jpeg', null));
  });
  it('shows a read-only current-view preview without cover editing or loading controls', async () => {
    await renderOpenDialog();
    expect(screen.getByRole('dialog', { name: 'Publish to Google Drive' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Current dataset view' })).toHaveAttribute('src', 'blob:current-view');
    expect(screen.getByText('Current view')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Replace preview|Choose custom preview|Load dataset|Public URL/ })).toBeNull();
    expect(screen.queryByLabelText('Choose custom preview image')).toBeNull();
    expect(usePublicationPreview).toHaveBeenLastCalledWith('current-scene', true, actions.capture);
  });
  it.each([
    { busy: true, message: 'Preparing preview…' },
    { busy: false, message: 'Preview unavailable' },
  ])('keeps upload available when the optional preview says "$message"', async ({ busy, message }) => {
    actions.preview = { url: null, busy };
    await renderOpenDialog();
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publish shared dataset' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Publish shared dataset' }));
    await waitFor(() => expect(actions.publishDataset).toHaveBeenCalledWith('dataset.zip', true, 'original', null));
  });
  it('asks for a dataset and disables upload before a scene is loaded', async () => {
    actions.reconstruction = null; actions.sourceKey = ''; actions.preview = { url: null, busy: false };
    await renderOpenDialog();
    expect(screen.getByText('Load a COLMAP dataset to preview it.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publish shared dataset' })).toBeDisabled();
  });
  it('retains the preview during upload and stops capture when busy or hidden', async () => {
    const close = vi.fn();
    const { rerender } = await renderOpenDialog(close);
    actions.publish = { phase: 'uploading', message: 'Uploading scene.zip…', bytesDone: 10, bytesTotal: 20 };
    rerender(<GoogleDrivePublishModal isOpen onClose={close} />);
    expect(usePublicationPreview).toHaveBeenLastCalledWith('current-scene', false, actions.capture);
    expect(screen.getByRole('img', { name: 'Current dataset view' })).toBeVisible();
    expect(screen.queryByLabelText('File name')).toBeNull();
    rerender(<GoogleDrivePublishModal isOpen={false} onClose={close} />);
    expect(usePublicationPreview).toHaveBeenLastCalledWith('current-scene', false, actions.capture);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(actions.cancel).not.toHaveBeenCalled();
  });
  it('defaults to public sharing and allows an explicit private choice', async () => {
    render(<GoogleDrivePublishModal isOpen onClose={vi.fn()} />);
    expect(screen.getByLabelText('File name')).toHaveValue('dataset.zip');
    expect(screen.queryByText(/ZIP limit: 2 GiB/)).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Access' })).toHaveValue('public');
    fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'my-scene' } });
    expect(screen.getByText('Link sharing is enabled after the upload is verified.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Publish shared dataset' }));
    await waitFor(() => expect(actions.publishDataset).toHaveBeenLastCalledWith('my-scene', true, 'original', null));
    fireEvent.change(screen.getByRole('combobox', { name: 'Access' }), { target: { value: 'private' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save private dataset' }));
    await waitFor(() => expect(actions.publishDataset).toHaveBeenLastCalledWith('my-scene', false, 'original', null));
  });
  it('keeps upload disabled until sign-in, and does not publish when sign-in starts', async () => {
    actions.auth = { status: 'disconnected', error: null };
    render(<GoogleDrivePublishModal isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Publish shared dataset' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(actions.connect).toHaveBeenCalledOnce();
    expect(actions.publishDataset).not.toHaveBeenCalled();
  });
  it('allows closing the dialog during upload without cancelling the upload', async () => {
    actions.publish = { phase: 'uploading', message: 'Uploading scene.zip…', bytesDone: 10, bytesTotal: 20 };
    const close = vi.fn();
    await renderOpenDialog(close);
    fireEvent.click(screen.getByRole('button', { name: 'Close Drive publication' }));
    expect(close).toHaveBeenCalledOnce();
    expect(actions.cancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel upload' }));
    expect(actions.cancel).toHaveBeenCalledOnce();
  });
  it('cancels publication when signing out and disables upload with unapplied deletions', async () => {
    actions.pending = 2;
    await renderOpenDialog();
    expect(screen.getByRole('button', { name: 'Publish shared dataset' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apply deletions and continue' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(actions.cancel).toHaveBeenCalledOnce();
    expect(actions.disconnect).toHaveBeenCalledOnce();
  });
  it('shows the verified private viewer link with the correct access requirement', async () => {
    actions.publish = { phase: 'completed', receipt: { fileId: 'FILE_ID', driveUrl: 'https://drive.google.com/file/d/FILE_ID/view', viewerUrl: 'https://viewer.example/?url=drive-link', shared: false } };
    const onClose = vi.fn();
    const { rerender } = await renderOpenDialog(onClose);
    expect(screen.getByLabelText('Share link')).toHaveValue('https://viewer.example/?url=drive-link');
    expect(screen.getByText('Private. Viewers need permission to this file. ColmapView may ask them to sign in or choose the archive in Drive.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open link' })).not.toBeInTheDocument();
    const driveLink = screen.getByRole('link', { name: 'Google Drive' });
    expect(driveLink).toHaveAttribute('href', actions.publish.receipt!.driveUrl);
    expect(driveLink.textContent).toBe('');
    expect(driveLink.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Save private dataset' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload another dataset' })).toBeNull();
    rerender(<GoogleDrivePublishModal isOpen={false} onClose={onClose} />);
    rerender(<GoogleDrivePublishModal isOpen onClose={onClose} />);
    await act(async () => Promise.resolve());
    expect(screen.getByLabelText('Share link')).toHaveValue(actions.publish.receipt!.viewerUrl);
    expect(screen.queryByLabelText('File name')).toBeNull();
    expect(actions.reset).not.toHaveBeenCalled();
    expect(actions.publishDataset).not.toHaveBeenCalled();
  });
  it('provides a retry and Drive file link for a partially completed publication', async () => {
    actions.publish = { phase: 'failed', fileUrl: 'https://drive.google.com/file/d/FILE_ID/view', message: 'Upload stopped.', error: 'Sharing was denied.', canRetry: true };
    const { rerender } = await renderOpenDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Check upload and retry' }));
    expect(actions.retry).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: /Review file in Drive/ })).toHaveAttribute('href', actions.publish.fileUrl);
    actions.publish = { ...actions.publish, fileUrl: undefined };
    rerender(<GoogleDrivePublishModal isOpen onClose={vi.fn()} />);
    expect(screen.queryByRole('link', { name: /Review file in Drive/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'File name' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Sharing was denied.');
  });
  it('reports missing setup and leaves the viewer available', () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '');
    render(<GoogleDrivePublishModal isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Google Drive publishing is unavailable in this viewer.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument();
    expect(usePublicationPreview).toHaveBeenLastCalledWith('current-scene', false, actions.capture);
  });

  it('names the ZIP after the dataset until the name is edited', async () => {
    actions.datasetName = 'garden';
    await renderOpenDialog();
    expect(screen.getByLabelText('File name')).toHaveValue('garden.zip');
  });

  it('keeps an edited file name for its dataset only, then returns to the next dataset\'s default', async () => {
    actions.datasetName = 'garden';
    const { rerender } = await renderOpenDialog();
    fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'my-edit.zip' } });
    actions.datasetName = 'garden-renamed';
    rerender(<GoogleDrivePublishModal isOpen onClose={vi.fn()} />);
    expect(screen.getByLabelText('File name')).toHaveValue('my-edit.zip');
    actions.sourceKey = 'next-scene'; actions.datasetName = 'harbor';
    rerender(<GoogleDrivePublishModal isOpen onClose={vi.fn()} />);
    expect(screen.getByLabelText('File name')).toHaveValue('harbor.zip');
  });
  it('discloses the Hub link for the sharing choice and titles results by access', async () => {
    await renderOpenDialog();
    expect(screen.getByText('Also creates a short Spatial Hub link. Anyone with it sees the title, description, preview and dataset link. Original photos can retain metadata, such as location.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publish shared dataset' })).toHaveAccessibleDescription('Also creates a short Spatial Hub link. Anyone with it sees the title, description, preview and dataset link. Original photos can retain metadata, such as location.');
    fireEvent.change(screen.getByRole('combobox', { name: 'Access' }), { target: { value: 'private' } });
    expect(screen.getByText('Also creates an unguessable Spatial Hub link. Anyone with it sees the title, description, preview and dataset link; the data still needs access.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save private dataset' })).toHaveAccessibleDescription('Also creates an unguessable Spatial Hub link. Anyone with it sees the title, description, preview and dataset link; the data still needs access.');
    cleanup();
    const receipt = { fileId: 'f', driveUrl: 'https://drive.google.com/file/d/f/view', viewerUrl: 'https://colmapview.opsiclear.com/?url=x' };
    actions.publish = { phase: 'completed', receipt: { ...receipt, shared: false } };
    await renderOpenDialog();
    expect(screen.getByRole('region', { name: 'Published Drive dataset' })).toHaveTextContent('Saved privately to Google Drive');
    cleanup();
    actions.publish = { phase: 'completed', receipt: { ...receipt, shared: true } };
    await renderOpenDialog();
    expect(screen.getByRole('region', { name: 'Published Drive dataset' })).toHaveTextContent('Published to Google Drive');
  });

  it('shows no Hub disclosure where the Hub is off', async () => {
    hubLink.value = { ...hubLink.value, enabled: false };
    await renderOpenDialog();
    expect(screen.queryByText(/Spatial Hub link/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Publish shared dataset' })).not.toHaveAttribute('aria-describedby');
    fireEvent.change(screen.getByRole('combobox', { name: 'Access' }), { target: { value: 'private' } });
    expect(screen.queryByText(/Spatial Hub link/)).toBeNull();
  });

  it('moves focus to the first field after sign-in', async () => {
    actions.auth = { status: 'disconnected', error: null };
    const onClose = vi.fn();
    const { rerender } = await renderOpenDialog(onClose);
    actions.auth = { status: 'connected', error: null };
    rerender(<GoogleDrivePublishModal isOpen onClose={onClose} />);
    expect(screen.getByRole('combobox', { name: 'Access' })).toHaveFocus();
  });

});
