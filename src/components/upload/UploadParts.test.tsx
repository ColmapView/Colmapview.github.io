import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviousUpload, UploadDialog, UploadProgress, UploadResult } from './UploadParts';
import type { HubLink } from './useHubLink';
import type { HubLinkState } from '../../features/colmapviewHub/publication';

afterEach(cleanup);
const viewerUrl = 'https://colmapview.opsiclear.com/?url=https://huggingface.co/datasets/u/scene';
const ready: HubLinkState = { phase: 'ready', viewerUrl, url: 'https://hub.invalid/hub/HappyTree' };
const hub = (state: HubLinkState, enabled = true): HubLink => ({ state, enabled, busy: state.phase === 'checking' || state.phase === 'creating',
  retry: vi.fn(async () => {}), getPublicDataset: () => null });
const provider = { url: 'https://huggingface.co/datasets/u/scene', label: 'Hugging Face page', icon: '🤗' };

describe('UploadResult', () => {
  it.each([
    ['a result', () => <UploadResult label="Published dataset" title="Published u/scene" viewerUrl={viewerUrl} />],
    ['progress', () => <UploadProgress label="Upload progress" message="Uploading…" progressLabel="Upload" max={2} value={1} onCancel={vi.fn()} />],
  ])('focuses %s when reopening a dialog and restores the opener when closing', (_name, content) => {
    const view = (isOpen: boolean) => <>
      <button type="button">Share</button>
      <UploadDialog isOpen={isOpen} onClose={vi.fn()} title="Publish" closeLabel="Close">{content()}</UploadDialog>
    </>;
    const { rerender } = render(view(false));
    const opener = screen.getByRole('button', { name: 'Share' });
    opener.focus();
    rerender(view(true));
    expect(screen.getByRole('status')).toHaveFocus();
    rerender(view(false));
    expect(opener).toHaveFocus();
  });

  it('shares the viewer link until the Hub link is ready, then the Hub link', () => {
    const { rerender } = render(<UploadResult label="Published dataset" title="Published u/scene" notice="Anyone can open this link."
      viewerUrl={viewerUrl} providerLink={provider} hub={hub({ phase: 'creating', viewerUrl })} />);
    expect(screen.getByLabelText('Share link')).toHaveValue(viewerUrl);
    expect(screen.getByText('Creating Hub link…')).toBeVisible();
    rerender(<UploadResult label="Published dataset" title="Published u/scene" notice="Anyone can open this link." viewerUrl={viewerUrl} providerLink={provider} hub={hub(ready)} />);
    expect(screen.getByLabelText('Share link')).toHaveValue(ready.url);
    expect(screen.queryByRole('link', { name: 'Open link' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hugging Face page' })).toHaveAttribute('href', provider.url);
    expect(screen.getByRole('link', { name: 'Hugging Face page' })).toHaveTextContent(/^🤗$/);
    expect(screen.queryByLabelText('Private delete link')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Delete Hub link' })).toBeNull();
  });

  it('moves focus to the result title', () => {
    render(<UploadResult label="Published dataset" title="Saved u/scene privately" viewerUrl={viewerUrl} />);
    expect(screen.getByText('Saved u/scene privately').closest('p')).toHaveFocus();
  });

  it('shows no Hub part when the Hub is off or its state belongs to another upload', () => {
    render(<UploadResult label="Published dataset" title="Published" viewerUrl={viewerUrl} hub={hub(ready, false)} />);
    expect(screen.getByLabelText('Share link')).toHaveValue(viewerUrl);
    cleanup();
    render(<UploadResult label="Published dataset" title="Published" viewerUrl={viewerUrl} hub={hub({ phase: 'creating', viewerUrl: 'https://other.example/' })} />);
    expect(screen.queryByText('Creating Hub link…')).toBeNull();
  });
});

describe('UploadProgress', () => {
  it('moves focus to the progress status', () => {
    render(<UploadProgress label="Publication progress" message="Uploading images…" progressLabel="Files" max={2} value={1} onCancel={vi.fn()} />);
    expect(screen.getByText('Uploading images…')).toHaveFocus();
  });
});

describe('PreviousUpload', () => {
  it('keeps the last share link after the upload result resets without deletion controls', () => {
    render(<PreviousUpload hub={hub(ready)} />);
    const block = screen.getByRole('region', { name: 'Previous upload' });
    expect(within(block).getByRole('heading', { name: 'Previous upload' })).toBeVisible();
    expect(within(block).getByLabelText('Share link')).toHaveValue(ready.url);
    expect(within(block).queryByLabelText('Private delete link')).toBeNull();
    expect(within(block).queryByRole('link', { name: 'Delete Hub link' })).toBeNull();
  });

  it('keeps a failure with Retry, and shows nothing before any upload or when the Hub is off', () => {
    render(<PreviousUpload hub={hub({ phase: 'failed', viewerUrl, error: 'ColmapView Hub is unavailable.', retryable: true })} />);
    expect(screen.getByRole('button', { name: 'Retry Hub link' })).toBeVisible();
    expect(screen.getByLabelText('Share link')).toHaveValue(viewerUrl);
    cleanup();
    expect(render(<PreviousUpload hub={hub({ phase: 'idle' })} />).container).toBeEmptyDOMElement();
    cleanup();
    expect(render(<PreviousUpload hub={hub(ready, false)} />).container).toBeEmptyDOMElement();
  });
});
