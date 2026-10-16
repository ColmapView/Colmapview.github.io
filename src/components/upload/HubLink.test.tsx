import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HubLinkResult } from './HubLink';
import type { HubLinkState } from '../../features/colmapviewHub/publication';

const observers: VisibilityObserver[] = [];
class VisibilityObserver {
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }
  intersect(isIntersecting: boolean, intersectionRatio: number) {
    const target = this.observe.mock.calls[0][0] as Element;
    act(() => this.callback([{ target, isIntersecting, intersectionRatio } as IntersectionObserverEntry], this as unknown as IntersectionObserver));
  }
}

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('IntersectionObserver', VisibilityObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
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

  it('reports the private delete link shown only after the field is fully visible', () => {
    const managementUrl = 'https://hub.invalid/hub/manage/HappyTree#secret';
    const props = renderResult({ phase: 'ready', viewerUrl, url: 'https://hub.invalid/hub/HappyTree', managementUrl });
    expect(screen.getByText("Private delete link (don't share)")).toBeVisible();
    expect(screen.getByLabelText('Private delete link')).toHaveValue(managementUrl);
    expect(screen.getByRole('link', { name: 'Delete Hub link' })).toHaveAttribute('href', managementUrl);
    expect(screen.getByRole('link', { name: 'Delete Hub link' })).toHaveAttribute('target', '_blank');
    expect(props.onDeleteLinkShown).not.toHaveBeenCalled();
    expect(observers).toHaveLength(1);
    expect(observers[0].observe).toHaveBeenCalledWith(screen.getByLabelText('Private delete link').parentElement?.parentElement);
    observers[0].intersect(false, 0);
    observers[0].intersect(true, 0.5);
    expect(props.onDeleteLinkShown).not.toHaveBeenCalled();
    observers[0].intersect(true, 1);
    expect(props.onDeleteLinkShown).toHaveBeenCalledOnce();
    expect(observers[0].disconnect).toHaveBeenCalled();
    observers[0].intersect(true, 1);
    expect(props.onDeleteLinkShown).toHaveBeenCalledOnce();
  });

  it('ignores queued visibility callbacks after another upload replaces the delete link', () => {
    const props = { onRetry: vi.fn(), onDeleteLinkShown: vi.fn() };
    const state: HubLinkState = { phase: 'ready', viewerUrl, managementUrl: 'https://hub.invalid/hub/manage/First#secret' };
    const { rerender, unmount } = render(<HubLinkResult state={state} {...props} />);
    rerender(<HubLinkResult state={{ ...state, managementUrl: 'https://hub.invalid/hub/manage/Second#secret' }} {...props} />);
    expect(observers).toHaveLength(2);
    expect(observers[0].disconnect).toHaveBeenCalled();
    observers[0].intersect(true, 1);
    expect(props.onDeleteLinkShown).not.toHaveBeenCalled();
    observers[1].intersect(true, 1);
    expect(props.onDeleteLinkShown).toHaveBeenCalledOnce();
    unmount();
    expect(observers[1].disconnect).toHaveBeenCalled();
  });

  it('keeps the warning when visibility cannot be observed, and skips links already seen', () => {
    const state: HubLinkState = { phase: 'ready', viewerUrl, managementUrl: 'https://hub.invalid/hub/manage/HappyTree#secret' };
    renderResult({ ...state, deleteLinkSeen: true });
    expect(observers).toHaveLength(0);
    cleanup();
    vi.stubGlobal('IntersectionObserver', undefined);
    const props = renderResult(state);
    expect(props.onDeleteLinkShown).not.toHaveBeenCalled();
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
    const props = { onRetry, onDeleteLinkShown: vi.fn() };
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
