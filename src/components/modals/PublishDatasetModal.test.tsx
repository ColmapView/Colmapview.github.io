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

beforeEach(() => {
  vi.clearAllMocks();
  actions.publish = { phase: 'idle' };
  actions.auth = { status: 'connected', identity: { username: 'publisher' } } satisfies Auth;
  vi.stubEnv('VITE_HF_PUBLISH_ENABLED', 'true');
  vi.stubEnv('VITE_HF_OAUTH_CLIENT_ID', 'public-client');
  vi.stubEnv('VITE_HF_OAUTH_REDIRECT_URI', `${window.location.origin}/hf-callback.html`);
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const header = () => screen.getByRole('button', { name: 'Close publish dataset' }).closest('header')!;

describe('PublishDatasetModal', () => {
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

  it('publishes straight from the form, with the public notice by the button and no review step', async () => {
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review dataset' })).not.toBeInTheDocument();
    expect(screen.getByText(/public, discoverable dataset/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Repository name'), { target: { value: 'scene' } });
    fireEvent.change(screen.getByLabelText('Dataset title'), { target: { value: 'Current scene' } });
    fireEvent.change(screen.getByLabelText('Dataset license'), { target: { value: 'cc0-1.0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish public dataset' }));
    await waitFor(() => expect(actions.publishDataset).toHaveBeenCalledWith('publisher',
      expect.objectContaining({ name: 'scene', title: 'Current scene', license: 'cc0-1.0' }), expect.any(File)));
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
    expect(screen.getByRole('button', { name: 'Cancel publication' })).toBeEnabled();
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

  it('shows a tidy result: copy beside the link, matching link buttons, and one repository link', () => {
    const viewerUrl = 'https://viewer.example/?url=https://huggingface.co/datasets/publisher/scene';
    actions.publish = { phase: 'completed', repoUrl, canRetry: false,
      receipt: { repoId: 'publisher/scene', repoUrl, dataCommit: 'd'.repeat(40), metadataCommit: 'e'.repeat(40), viewerUrl } };
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Published publisher/scene');
    const field = screen.getByLabelText('Viewer link');
    expect(field).toHaveValue(viewerUrl);
    expect(within(field.parentElement!).getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open viewer' })).toHaveAttribute('href', viewerUrl);
    expect(repositoryLinks()).toHaveLength(1);
    expect(repositoryLinks()[0]).toHaveAccessibleName('Hugging Face page');
    // A new publication starts from the next dataset loaded; the result screen offers no restart.
    expect(screen.queryByRole('button', { name: 'Publish another dataset' })).toBeNull();
  });
});

const repoUrl = 'https://huggingface.co/datasets/publisher/scene';
const repositoryLinks = () => screen.queryAllByRole('link').filter(link => link.getAttribute('href') === repoUrl);
