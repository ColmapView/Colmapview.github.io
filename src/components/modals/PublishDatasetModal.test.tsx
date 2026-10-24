import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishDatasetModal } from './PublishDatasetModal';
import type { PublicationState } from '../../features/datasetPublishing/types';

type Auth = { status: string; identity: { username: string } | null; error?: string };
const actions = vi.hoisted(() => ({ publishDataset: vi.fn(), replace: vi.fn(), retry: vi.fn(), reset: vi.fn(), cancel: vi.fn(),
  connect: vi.fn(), disconnect: vi.fn(),
  auth: { status: 'connected', identity: { username: 'publisher' } } as { status: string; identity: { username: string } | null; error?: string },
  publish: { phase: 'idle' } as Partial<PublicationState> }));
vi.mock('./usePublishDatasetStoreFacade', () => ({ usePublishDatasetStoreFacade: () => ({
  auth: actions.auth, publish: actions.publish,
  publication: { retry: actions.retry, reset: actions.reset, cancel: actions.cancel },
  hfAuth: { connect: actions.connect, disconnect: actions.disconnect },
  reconstruction: {}, sourceKey: 'source', pendingDeletions: 0, getScreenshotBlob: vi.fn(),
  publishDataset: actions.publishDataset,
}) }));
vi.mock('./usePublicationPreview', () => ({ usePublicationPreview: () => ({
  file: new File(['preview'], 'preview.png', { type: 'image/png' }), url: 'blob:current-view', busy: false,
  replace: actions.replace,
}) }));

const hubLink = vi.hoisted(() => ({ value: { state: { phase: 'idle' }, enabled: true, busy: false, retry: vi.fn() } as Record<string, unknown> }));
vi.mock('../upload/useHubLink', () => ({ useHubLink: () => hubLink.value }));

beforeEach(() => {
  vi.clearAllMocks();
  hubLink.value = { state: { phase: 'idle' }, enabled: true, busy: false, retry: vi.fn() };
  actions.publish = { phase: 'idle' };
  actions.auth = { status: 'connected', identity: { username: 'publisher' } } satisfies Auth;
  vi.stubEnv('VITE_HF_PUBLISH_ENABLED', 'true');
  vi.stubEnv('VITE_HF_OAUTH_CLIENT_ID', 'public-client');
  vi.stubEnv('VITE_HF_OAUTH_REDIRECT_URI', `${window.location.origin}/hf-callback.html`);
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const header = () => screen.getByRole('button', { name: 'Close publish dataset' }).closest('header')!;

describe('PublishDatasetModal', () => {
  it('defaults to public without Hub listing controls and still allows private uploads', async () => {
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(screen.queryByRole('checkbox', { name: 'List on Hub' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Access' })).toHaveValue('public');
    expect(screen.queryByRole('checkbox', { name: 'Shorten URL' })).toBeNull();
    expect(screen.queryByText(/Public uploads receive|Includes .*images/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Repository name'), { target: { value: 'scene' } });
    fireEvent.change(screen.getByLabelText('Dataset license'), { target: { value: 'cc0-1.0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish public dataset' }));
    await waitFor(() => expect(actions.publishDataset).toHaveBeenLastCalledWith('publisher',
      expect.objectContaining({ visibility: 'public' }), expect.any(File)));
    fireEvent.change(screen.getByRole('combobox', { name: 'Access' }), { target: { value: 'private' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save private dataset' }));
    await waitFor(() => expect(actions.publishDataset).toHaveBeenLastCalledWith('publisher',
      expect.objectContaining({ visibility: 'private' }), expect.any(File)));
  });
  it('offers JPEG copies only for ZIPs and returns to originals when Folder is selected', async () => {
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Access' }), { target: { value: 'private' } });
    expect(screen.queryByRole('combobox', { name: 'Images' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Format' }), { target: { value: 'zip' } });
    expect(screen.getByRole('combobox', { name: 'Images' })).toHaveValue('original');
    fireEvent.change(screen.getByRole('combobox', { name: 'Images' }), { target: { value: 'jpeg' } });
    expect(screen.getByText(/Lossy, full resolution/)).toBeVisible();
    expect(screen.queryByText(/Original image metadata is retained/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Repository name'), { target: { value: 'scene' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save private dataset' }));
    await waitFor(() => expect(actions.publishDataset).toHaveBeenLastCalledWith('publisher',
      expect.objectContaining({ format: 'zip', imageFormat: 'jpeg' }), expect.any(File)));
    fireEvent.change(screen.getByRole('combobox', { name: 'Format' }), { target: { value: 'folder' } });
    expect(screen.queryByRole('combobox', { name: 'Images' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save private dataset' }));
    await waitFor(() => expect(actions.publishDataset).toHaveBeenLastCalledWith('publisher',
      expect.objectContaining({ format: 'folder', imageFormat: 'original' }), expect.any(File)));
  });
  it.each(['private', 'public'] as const)('offers ZIP independently of %s access, with Folder as the default', async visibility => {
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Format' })).toHaveValue('folder');
    fireEvent.change(screen.getByRole('combobox', { name: 'Format' }), { target: { value: 'zip' } });
    expect(screen.getByRole('combobox', { name: 'Access' })).toHaveValue('public');
    fireEvent.change(screen.getByRole('combobox', { name: 'Access' }), { target: { value: visibility } });
    fireEvent.change(screen.getByLabelText('Repository name'), { target: { value: 'scene' } });
    if (visibility === 'public') fireEvent.change(screen.getByLabelText('Dataset license'), { target: { value: 'cc0-1.0' } });
    fireEvent.click(screen.getByRole('button', { name: visibility === 'private' ? 'Save private dataset' : 'Publish public dataset' }));
    await waitFor(() => expect(actions.publishDataset).toHaveBeenCalledWith('publisher',
      expect.objectContaining({ format: 'zip', visibility }), expect.any(File)));
  });
  it('replaces the preview by clicking the image, without separate image buttons', () => {
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    const preview = screen.getByRole('region', { name: 'Dataset preview' });
    const details = screen.getByRole('region', { name: 'Dataset details' });
    expect(preview.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(preview).getByRole('img')).toHaveAttribute('src', 'blob:current-view');
    expect(within(preview).queryByRole('button', { name: 'Retake' })).not.toBeInTheDocument();
    expect(within(preview).queryByRole('button', { name: 'Replace image' })).not.toBeInTheDocument();
    const pick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    fireEvent.click(within(preview).getByRole('button', { name: 'Replace preview image' }));
    expect(pick).toHaveBeenCalledOnce();
    const file = new File(['custom'], 'cover.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Choose custom preview image'), { target: { files: [file] } });
    expect(actions.replace).toHaveBeenCalledWith(file);
  });

  it('offers the Creative Commons 4.0 family with readable labels', () => {
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    const license = screen.getByLabelText('Dataset license');
    expect(within(license).getByRole('option', { name: 'CC BY-NC 4.0 (non-commercial)' })).toHaveValue('cc-by-nc-4.0');
    expect(within(license).getByRole('option', { name: 'CC BY-NC-ND 4.0 (non-commercial, no derivatives)' })).toHaveValue('cc-by-nc-nd-4.0');
  });

  it('shows the account and signs out from the header next to the close button', () => {
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(header()).toHaveTextContent('publisher');
    fireEvent.click(within(header()).getByRole('button', { name: 'Sign out' }));
    expect(actions.cancel).toHaveBeenCalledOnce();
    expect(actions.disconnect).toHaveBeenCalledOnce();
  });

  it('signs in from the header and keeps publishing disabled until connected', () => {
    actions.auth = { status: 'disconnected', identity: null };
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Publish public dataset' })).toBeDisabled();
    expect(screen.getByText('Sign in to publish.')).toBeInTheDocument();
    fireEvent.click(within(header()).getByRole('button', { name: 'Sign in' }));
    expect(actions.connect).toHaveBeenCalledOnce();
  });

  it('cancels a sign-in in progress from the header and reports sign-in errors', () => {
    actions.auth = { status: 'connecting', identity: null, error: 'Hugging Face sign-in was declined.' };
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    fireEvent.click(within(header()).getByRole('button', { name: 'Cancel sign-in' }));
    expect(actions.disconnect).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent('Hugging Face sign-in was declined.');
  });

  it('publishes straight from the public form with an access hint and no review step', async () => {
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Access' })).toHaveValue('public');
    expect(screen.queryByRole('checkbox', { name: 'Shorten URL' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'List on Hub' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review dataset' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Dataset title')).not.toBeInTheDocument();
    expect(screen.getByText(/public, discoverable dataset/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Repository name'), { target: { value: 'scene' } });
    fireEvent.change(screen.getByLabelText('Dataset license'), { target: { value: 'cc0-1.0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish public dataset' }));
    await waitFor(() => expect(actions.publishDataset).toHaveBeenCalledWith('publisher',
      expect.objectContaining({ name: 'scene', license: 'cc0-1.0', visibility: 'public' }), expect.any(File)));
  });

  it.each(['public', 'private'] as const)('allows a %s upload with no license selected', async visibility => {
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Access' }), { target: { value: visibility } });
    expect(screen.getByRole('combobox', { name: 'Dataset license' })).toHaveValue('');
    expect(screen.getByRole('option', { name: 'No license specified' })).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Repository name'), { target: { value: 'scene' } });
    fireEvent.click(screen.getByRole('button', { name: visibility === 'private' ? 'Save private dataset' : 'Publish public dataset' }));
    await waitFor(() => expect(actions.publishDataset).toHaveBeenCalledWith('publisher',
      expect.objectContaining({ name: 'scene', visibility, license: '' }), expect.any(File)));
  });

  it('keeps the editable form with the error when nothing reached Hugging Face', () => {
    actions.publish = { phase: 'failed', canRetry: false, error: 'The repository already exists or changed during publication.' };
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(screen.getByLabelText('Repository name')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('already exists');
    expect(screen.getByRole('button', { name: 'Publish public dataset' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Start a new publication' })).not.toBeInTheDocument();
  });

  it('shows preparation as the first progress step', () => {
    actions.publish = { phase: 'preparing', message: 'Preparing dataset…', filesTotal: 0, filesDone: 0, bytesDone: 0 };
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Preparing dataset…');
    expect(screen.getByRole('button', { name: 'Cancel upload' })).toBeEnabled();
    expect(screen.queryByLabelText('Access')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Repository name')).not.toBeInTheDocument();
    expect(screen.queryByText(/files committed/)).not.toBeInTheDocument();
  });

  it.each([false, true])('offers retry only when the failed publication can resume: %s', canRetry => {
    actions.publish = { phase: 'failed', repoUrl: 'https://huggingface.co/datasets/publisher/scene', canRetry };
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    const retry = screen.queryByRole('button', { name: 'Retry publication' });
    if (canRetry) {
      expect(retry).toBeEnabled();
      fireEvent.click(retry!);
      expect(actions.retry).toHaveBeenCalledOnce();
    } else {
      expect(retry).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Start a new publication' }));
    expect(actions.reset).toHaveBeenCalledOnce();
    expect(repositoryLinks()).toHaveLength(1);
  });

  it('links the repository once while uploading', () => {
    actions.publish = { phase: 'uploading', repoUrl, message: 'Uploading selected files…', filesTotal: 3, filesDone: 1, bytesDone: 0 };
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(repositoryLinks()).toHaveLength(1);
    expect(repositoryLinks()[0]).toHaveTextContent('publisher/scene');
    expect(screen.queryByText(/Open on Hugging Face/)).not.toBeInTheDocument();
  });

  it.each(['private', 'public'] as const)('shows a consistent %s result using the verified access choice', visibility => {
    const viewerUrl = 'https://viewer.example/?url=https://huggingface.co/datasets/publisher/scene';
    actions.publish = { phase: 'completed', repoUrl, canRetry: false,
      receipt: { repoId: 'publisher/scene', repoUrl, dataCommit: 'd'.repeat(40), metadataCommit: 'e'.repeat(40), viewerUrl, visibility } };
    const onClose = vi.fn();
    const { rerender } = render(<PublishDatasetModal isOpen onClose={onClose} />);
    expect(screen.getByRole('status')).toHaveTextContent(visibility === 'private' ? 'Saved publisher/scene privately' : 'Published publisher/scene');
    const field = screen.getByLabelText('Share link');
    expect(field).toHaveValue(viewerUrl);
    expect(within(field.parentElement!).getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open link' })).not.toBeInTheDocument();
    expect(repositoryLinks()).toHaveLength(1);
    expect(repositoryLinks()[0]).toHaveAccessibleName('Hugging Face page');
    expect(repositoryLinks()[0]).toHaveTextContent(/^🤗$/);
    expect(screen.getByText(visibility === 'private'
      ? 'Private. Viewers must sign in to Hugging Face with an account that has access.' : 'Anyone can open this link without signing in.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload another dataset' })).toBeNull();
    rerender(<PublishDatasetModal isOpen={false} onClose={onClose} />);
    rerender(<PublishDatasetModal isOpen onClose={onClose} />);
    expect(screen.getByLabelText('Share link')).toHaveValue(viewerUrl);
    expect(screen.queryByLabelText('Repository name')).toBeNull();
    expect(actions.reset).not.toHaveBeenCalled();
    expect(actions.publishDataset).not.toHaveBeenCalled();
  });

  it('strips control characters as you type and limits the custom license fields like the Hub', () => {
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Sce\u0007ne\nnotes' } });
    expect(screen.getByLabelText('Description')).toHaveValue('Scene\nnotes');
    fireEvent.change(screen.getByLabelText('Dataset license'), { target: { value: 'other' } });
    expect(screen.getByLabelText('Custom license name')).toHaveAttribute('maxLength', '160');
    expect(screen.getByLabelText('Custom license URL')).toHaveAttribute('maxLength', '2048');
  });
  it('shows the disclosure for the chosen access beside the publish button', () => {
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    const row = screen.getByRole('button', { name: 'Publish public dataset' }).parentElement!;
    expect(within(row).getByText('Also creates a short ColmapView Hub link. Anyone with it sees the title, description, preview and dataset link. Original photos can retain metadata, such as location.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publish public dataset' })).toHaveAccessibleDescription('Also creates a short ColmapView Hub link. Anyone with it sees the title, description, preview and dataset link. Original photos can retain metadata, such as location.');
    fireEvent.change(screen.getByRole('combobox', { name: 'Access' }), { target: { value: 'private' } });
    expect(screen.getByText('Also creates an unguessable ColmapView Hub link. Anyone with it sees the title, description, preview and dataset link; the data still needs access.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save private dataset' })).toHaveAccessibleDescription('Also creates an unguessable ColmapView Hub link. Anyone with it sees the title, description, preview and dataset link; the data still needs access.');
    fireEvent.change(screen.getByRole('combobox', { name: 'Access' }), { target: { value: 'public' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Format' }), { target: { value: 'zip' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Images' }), { target: { value: 'jpeg' } });
    expect(screen.getByText('Also creates a short ColmapView Hub link. Anyone with it sees the title, description, preview and dataset link.')).toBeVisible();
  });

  it('shows no disclosure where the Hub is off, and waits while a Hub link is being made', () => {
    hubLink.value = { ...hubLink.value, enabled: false };
    const { unmount } = render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(screen.queryByText(/ColmapView Hub link/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Publish public dataset' })).not.toHaveAttribute('aria-describedby');
    unmount();
    hubLink.value = { ...hubLink.value, enabled: true, busy: true };
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Publish public dataset' })).toBeDisabled();
  });

  it('titles a private result "Saved … privately" and a public one "Published …"', () => {
    const receipt = { repoId: 'publisher/scene', repoUrl: 'https://huggingface.co/datasets/publisher/scene', dataCommit: 'a', metadataCommit: 'b',
      viewerUrl: 'https://colmapview.opsiclear.com/?url=https://huggingface.co/datasets/publisher/scene' };
    actions.publish = { phase: 'completed', receipt: { ...receipt, visibility: 'private' } };
    const { unmount } = render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Published dataset' })).toHaveTextContent('Saved publisher/scene privately');
    unmount();
    actions.publish = { phase: 'completed', receipt: { ...receipt, visibility: 'public' } };
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Published dataset' })).toHaveTextContent('Published publisher/scene');
  });

  it('keeps the previous Hub link above the form after the result resets', () => {
    hubLink.value = { ...hubLink.value, state: { phase: 'ready', viewerUrl: 'https://colmapview.opsiclear.com/?url=x', url: 'https://hub.invalid/hub/HappyTree' } };
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(within(screen.getByRole('region', { name: 'Previous upload' })).getByLabelText('Share link')).toHaveValue('https://hub.invalid/hub/HappyTree');
  });

  it('moves focus to the first field after sign-in', () => {
    actions.auth = { status: 'disconnected', identity: null };
    const onClose = vi.fn();
    const { rerender } = render(<PublishDatasetModal isOpen onClose={onClose} />);
    actions.auth = { status: 'connected', identity: { username: 'publisher' } };
    rerender(<PublishDatasetModal isOpen onClose={onClose} />);
    expect(screen.getByRole('combobox', { name: 'Access' })).toHaveFocus();
  });

});

const repoUrl = 'https://huggingface.co/datasets/publisher/scene';
const repositoryLinks = () => screen.queryAllByRole('link').filter(link => link.getAttribute('href') === repoUrl);
