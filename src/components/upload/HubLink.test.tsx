import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HubLinkResult } from './HubLink';
import type { HubLinkState } from '../../features/colmapviewHub/publication';

afterEach(cleanup);
const viewerUrl = 'https://colmapview.opsiclear.com/?url=x';
function renderResult(state: HubLinkState) {
  const props = { onRetry: vi.fn(), onDeleteLinkShown: vi.fn() };
  render(<HubLinkResult state={state} {...props} />);
  return props;
}

describe('HubLinkResult', () => {
  it.each([['checking', 'Checking public access…'], ['creating', 'Creating Hub link…']] as const)('shows the %s status', (phase, text) => {
    renderResult({ phase, viewerUrl });
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });

  it('shows the private delete link with a link to the delete page, and reports it shown', () => {
    const managementUrl = 'https://hub.invalid/hub/manage/HappyTree#secret';
    const props = renderResult({ phase: 'ready', viewerUrl, url: 'https://hub.invalid/hub/HappyTree', managementUrl });
    expect(screen.getByText("Private delete link (don't share)")).toBeVisible();
    expect(screen.getByLabelText('Private delete link')).toHaveValue(managementUrl);
    expect(screen.getByRole('link', { name: 'Delete Hub link' })).toHaveAttribute('href', managementUrl);
    expect(screen.getByRole('link', { name: 'Delete Hub link' })).toHaveAttribute('target', '_blank');
    expect(props.onDeleteLinkShown).toHaveBeenCalledOnce();
  });

  it('explains a failure, says the upload link still works, and offers Retry only when it can help', () => {
    const props = renderResult({ phase: 'failed', viewerUrl, error: "Couldn't reach ColmapView Hub.", retryable: true });
    expect(screen.getByRole('alert')).toHaveTextContent("Hub link not created: Couldn't reach ColmapView Hub. The link above still works.");
    fireEvent.click(screen.getByRole('button', { name: 'Retry Hub link' }));
    expect(props.onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert').parentElement).toHaveFocus();
    cleanup();
    renderResult({ phase: 'failed', viewerUrl, error: 'Use a viewer link without access credentials.', retryable: false });
    expect(screen.queryByRole('button', { name: 'Retry Hub link' })).toBeNull();
  });

  it('keeps Retry disabled until Retry-After passes', () => {
    renderResult({ phase: 'failed', viewerUrl, error: 'Too many requests from your network; try again in 2 min.', retryable: true, retryAfter: Date.now() + 120_000 });
    expect(screen.getByRole('button', { name: 'Retry Hub link' })).toBeDisabled();
  });
});
