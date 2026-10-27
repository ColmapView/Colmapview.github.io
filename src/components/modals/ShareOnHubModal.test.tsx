// @vitest-environment-options {"url":"https://colmapview.github.io/latest/"}
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareOnHubModal } from './ShareOnHubModal';
import { useDeletionStore, useReconstructionStore } from '../../store';
import { buildReconstruction } from '../../test/builders';
import type { PublicHubDataset } from '../../features/colmapviewHub/publication';

vi.mock('./usePublicationPreview', () => ({ usePublicationPreview: () => ({ file: new File(['preview'], 'preview.png', { type: 'image/png' }),
  url: 'blob:preview', busy: false, error: null }) }));
vi.mock('../upload/HubBotCheck', () => ({ HubBotCheck: ({ onToken }: { onToken: (token: string) => void }) =>
  <button type="button" onClick={() => onToken('one-use-test-token')}>Complete bot check</button> }));
vi.mock('../../features/colmapviewHub/thumbnail', () => ({ makeHubThumbnail: vi.fn(async () => 'jpeg-preview') }));

const base = 'https://hub.invalid/hub';
const id = 'HappyTree-LAAAAAAAAAAAAAAAA';
const source = 'https://huggingface.co/datasets/owner/scene';
let posts: Record<string, unknown>[];
let result: Record<string, unknown>;

beforeEach(() => {
  posts = []; result = { status: 'published', id, shareUrl: `https://hub.invalid/s/${id}`, catalogUrl: `${base}/datasets/#shared-datasets` };
  vi.stubEnv('VITE_HUB_BASE_URL', base);
  useReconstructionStore.setState({ ...useReconstructionStore.getInitialState(), reconstruction: buildReconstruction(), sourceType: 'url', sourceUrl: source, sourceName: 'Scene' }, true);
  useDeletionStore.setState(useDeletionStore.getInitialState(), true);
  vi.stubGlobal('fetch', vi.fn(async (_value: string, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return new Response(JSON.stringify(result), { status: result.status === 'pending' ? 202 : 201 }); }
    return new Response(JSON.stringify({ enabled: true, siteKey: 'public-site-key' }));
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function confirmAndShare() {
  fireEvent.click(screen.getByRole('checkbox', { name: /Make the dataset link/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Complete bot check' }));
  fireEvent.click(screen.getByRole('button', { name: 'Share on Hub' }));
}

describe('Share on Hub', () => {
  it('requires public-listing consent and a bot token before submitting an existing URL', async () => {
    render(<ShareOnHubModal isOpen onClose={vi.fn()} />);
    const share = screen.getByRole('button', { name: 'Share on Hub' });
    expect(share).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Make the dataset link/ }));
    expect(share).toBeDisabled();
    fireEvent.click(await screen.findByRole('button', { name: 'Complete bot check' }));
    expect(share).toBeEnabled(); fireEvent.click(share);
    await screen.findByText('Shared on Hub.');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ title: 'Scene', listingAcknowledged: true, publicAcknowledged: true, turnstileToken: 'one-use-test-token' });
    const viewer = new URL(String(posts[0].viewerUrl));
    expect(viewer.searchParams.getAll('url')).toEqual([source]); expect(viewer.hash).not.toContain('d=');
    expect(posts[0]).not.toHaveProperty('license');
    expect(screen.getByLabelText('Hub dataset link')).toHaveValue(`https://hub.invalid/s/${id}`);
    expect(screen.getByRole('link', { name: 'View on Hub ↗' })).toHaveAttribute('href', `${base}/#shared-datasets`);
  });
  it.each([`${base}/#shared-datasets`, `${base}/datasets/#shared-datasets`])('opens the canonical gallery for the known receipt %s', async catalogUrl => {
    result.catalogUrl = catalogUrl;
    render(<ShareOnHubModal isOpen onClose={vi.fn()} />);
    await confirmAndShare(); await screen.findByText('Shared on Hub.');
    expect(screen.getByRole('link', { name: 'View on Hub ↗' })).toHaveAttribute('href', `${base}/#shared-datasets`);
  });
  it('keeps the GitHub frontend after validating a production backend publication receipt', async () => {
    const backend = 'https://colmapview.opsiclear.com/hub';
    vi.stubEnv('VITE_HUB_BASE_URL', backend);
    result.shareUrl = `https://colmapview.opsiclear.com/s/${id}`;
    result.catalogUrl = `${backend}/datasets/#shared-datasets`;
    render(<ShareOnHubModal isOpen onClose={vi.fn()} />);
    await confirmAndShare(); await screen.findByText('Shared on Hub.');
    expect(screen.getByRole('link', { name: 'View on Hub ↗' })).toHaveAttribute('href', 'https://colmapview.github.io/hub/#shared-datasets');
    expect(screen.getByLabelText('Hub dataset link')).toHaveValue(`https://colmapview.opsiclear.com/s/${id}`);
  });
  it('rejects a publication receipt pointing outside the known gallery routes', async () => {
    result.catalogUrl = 'https://other.invalid/hub/#shared-datasets';
    render(<ShareOnHubModal isOpen onClose={vi.fn()} />);
    await confirmAndShare(); await screen.findByText('Hub returned an invalid publication.');
    expect(screen.queryByRole('link', { name: 'View on Hub ↗' })).not.toBeInTheDocument();
  });
  it('explains that local files must be uploaded first', async () => {
    useReconstructionStore.setState({ sourceType: 'local', sourceUrl: null });
    render(<ShareOnHubModal isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Upload this dataset to Hugging Face, Google Drive or a bucket first.')).toBeVisible();
    await waitFor(() => expect(fetch).toHaveBeenCalled()); expect(posts).toEqual([]);
  });
  it('requires an upload for local edits instead of listing a mismatched source', async () => {
    useReconstructionStore.setState({ reconstructionEditRevision: 1 });
    render(<ShareOnHubModal isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Upload the current edits before sharing them on Hub.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Share on Hub' })).not.toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });
  it('lists the exact completed public upload using its captured preview and metadata', async () => {
    const target: PublicHubDataset = { viewerUrl: 'https://colmapview.opsiclear.com/?url=https://bucket.example/saved.zip',
      metadata: { title: 'Saved scene', description: 'Uploaded model', license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' } },
      thumbnailBase64: 'saved-preview', source: { key: 'upload', revision: 4 } };
    render(<ShareOnHubModal isOpen onClose={vi.fn()} target={target} />);
    await confirmAndShare(); await screen.findByText('Shared on Hub.');
    expect(posts[0]).toMatchObject({ viewerUrl: target.viewerUrl, title: 'Saved scene', description: 'Uploaded model', thumbnailBase64: 'saved-preview', license: target.metadata.license });
  });
  it('shows a pending submission without claiming it is publicly listed', async () => {
    result = { status: 'pending', id };
    render(<ShareOnHubModal isOpen onClose={vi.fn()} />);
    await confirmAndShare(); await screen.findByText('Submitted for review. It will appear on Hub after its source is verified.');
    expect(screen.queryByRole('link', { name: 'View on Hub ↗' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hub dataset link')).not.toBeInTheDocument();
    expect(screen.getByText(`Submission ID: ${id}`)).toBeVisible();
  });
});
