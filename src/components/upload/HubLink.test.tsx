import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HubLinkResult } from './HubLink';
import type { HubLinkState } from '../../features/colmapviewHub/publication';

afterEach(cleanup);
const viewerUrl = 'https://colmapview.opsiclear.com/?url=x';
function renderResult(state: HubLinkState) {
  const props = { onRetry: vi.fn() };
  render(<HubLinkResult state={state} {...props} />);
  return props;
}

describe('HubLinkResult', () => {
  it.each([['checking', 'Checking public access…'], ['creating', 'Creating Hub link…']] as const)('shows the %s status', (phase, text) => {
    renderResult({ phase, viewerUrl });
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });

  it.each(['idle', 'ready'] as const)('shows no extra controls for a %s link', phase => {
    const { container } = render(<HubLinkResult state={{ phase, viewerUrl }} onRetry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('explains a failure, says the upload link still works, and offers Retry only when it can help', () => {
    const props = renderResult({ phase: 'failed', viewerUrl, error: "Couldn't reach ColmapView Hub.", retryable: true });
    expect(screen.getByRole('alert')).toHaveTextContent("Hub link not created: Couldn't reach ColmapView Hub. The link above still works.");
    fireEvent.click(screen.getByRole('button', { name: 'Retry Hub link' }));
    expect(props.onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveFocus();
    cleanup();
    renderResult({ phase: 'failed', viewerUrl, error: 'Use a viewer link without access credentials.', retryable: false });
    expect(screen.queryByRole('button', { name: 'Retry Hub link' })).toBeNull();
  });

  it('moves focus to the Hub status line after Retry, as the phase changes', () => {
    const onRetry = vi.fn();
    const props = { onRetry };
    const { rerender } = render(<HubLinkResult state={{ phase: 'failed', viewerUrl, error: "Couldn't reach ColmapView Hub.", retryable: true }} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry Hub link' }));
    rerender(<HubLinkResult state={{ phase: 'creating', viewerUrl }} {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent('Creating Hub link…');
    expect(screen.getByRole('status')).toHaveFocus();
    rerender(<HubLinkResult state={{ phase: 'failed', viewerUrl, error: 'ColmapView Hub is unavailable.', retryable: true }} {...props} />);
    expect(screen.getByRole('alert')).not.toHaveFocus();
  });

  it('keeps Retry disabled until Retry-After passes', () => {
    renderResult({ phase: 'failed', viewerUrl, error: 'Too many requests from your network; try again in 2 min.', retryable: true, coolingDown: true });
    expect(screen.getByRole('button', { name: 'Retry Hub link' })).toBeDisabled();
  });
});
