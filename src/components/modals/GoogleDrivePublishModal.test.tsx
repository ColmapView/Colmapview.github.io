import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleDrivePublishModal } from './GoogleDrivePublishModal';
import type { DrivePublicationState } from '../../features/googleDrive/publishDataset';

const actions = vi.hoisted(() => ({
  publishDataset: vi.fn(), retry: vi.fn(), reset: vi.fn(), cancel: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), apply: vi.fn(),
  auth: { status: 'connected', error: null } as { status: string; error: string | null },
  publish: { phase: 'idle' } as Partial<DrivePublicationState>, pending: 0, reconstruction: {} as object | null,
}));
vi.mock('./useGoogleDrivePublishStoreFacade', () => ({ useGoogleDrivePublishStoreFacade: () => ({
  auth: actions.auth, publish: actions.publish, reconstruction: actions.reconstruction, pendingDeletions: actions.pending,
  publishDataset: actions.publishDataset, applyDeletionsToData: actions.apply,
  publication: { retry: actions.retry, reset: actions.reset, cancel: actions.cancel },
  googleDrivePublishAuth: { connect: actions.connect, disconnect: actions.disconnect },
}) }));
vi.mock('../../features/googleDrive/auth', async importOriginal => ({
  ...await importOriginal<typeof import('../../features/googleDrive/auth')>(),
  loadGoogleOAuthSdk: vi.fn().mockResolvedValue({ initTokenClient: vi.fn() }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  actions.auth = { status: 'connected', error: null }; actions.publish = { phase: 'idle' }; actions.pending = 0; actions.reconstruction = {};
  vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '123456-test.apps.googleusercontent.com');
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('Google Drive publishing dialog', () => {
  it('defaults to private and requires an explicit choice for public link sharing', async () => {
    render(<GoogleDrivePublishModal isOpen onClose={vi.fn()} />);
    expect(screen.getByLabelText('File name')).toHaveValue('dataset.zip');
    expect(screen.getByText(/ZIP limit: 2 GiB/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Anyone with the link can view' })).not.toBeChecked();
    fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'my-scene' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save private dataset' }));
    await waitFor(() => expect(actions.publishDataset).toHaveBeenCalledWith('my-scene', false));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Anyone with the link can view' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish shared dataset' }));
    await waitFor(() => expect(actions.publishDataset).toHaveBeenLastCalledWith('my-scene', true));
  });
  it('keeps upload disabled until sign-in, and does not publish when sign-in starts', async () => {
    actions.auth = { status: 'disconnected', error: null };
    render(<GoogleDrivePublishModal isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save private dataset' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(actions.connect).toHaveBeenCalledOnce();
    expect(actions.publishDataset).not.toHaveBeenCalled();
  });
  it('allows closing the dialog during upload without cancelling the upload', () => {
    actions.publish = { phase: 'uploading', message: 'Uploading scene.zip…', bytesDone: 10, bytesTotal: 20 };
    const close = vi.fn();
    render(<GoogleDrivePublishModal isOpen onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close Drive publication' }));
    expect(close).toHaveBeenCalledOnce();
    expect(actions.cancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel upload' }));
    expect(actions.cancel).toHaveBeenCalledOnce();
  });
  it('cancels publication when signing out and disables upload with unapplied deletions', () => {
    actions.pending = 2;
    render(<GoogleDrivePublishModal isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save private dataset' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apply deletions and continue' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(actions.cancel).toHaveBeenCalledOnce();
    expect(actions.disconnect).toHaveBeenCalledOnce();
  });
  it('shows the verified private viewer link with the correct access requirement', () => {
    actions.publish = { phase: 'completed', receipt: { fileId: 'FILE_ID', driveUrl: 'https://drive.google.com/file/d/FILE_ID/view', viewerUrl: 'https://viewer.example/?url=drive-link', shared: false } };
    render(<GoogleDrivePublishModal isOpen onClose={vi.fn()} />);
    expect(screen.getByLabelText('Viewer link')).toHaveValue('https://viewer.example/?url=drive-link');
    expect(screen.getByText('Private. Viewers need permission to this file and must choose it in the Drive picker.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open viewer/ })).toHaveAttribute('href', actions.publish.receipt!.viewerUrl);
    expect(screen.queryByRole('button', { name: 'Save private dataset' })).not.toBeInTheDocument();
  });
  it('provides a retry and Drive file link for a partially completed publication', () => {
    actions.publish = { phase: 'failed', fileUrl: 'https://drive.google.com/file/d/FILE_ID/view', message: 'Upload stopped.', error: 'Sharing was denied.', canRetry: true };
    const { rerender } = render(<GoogleDrivePublishModal isOpen onClose={vi.fn()} />);
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
  });
});
