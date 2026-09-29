import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HuggingFacePublishButton } from './HuggingFacePublishButton';

vi.mock('./useControlButtonStoreFacade', () => ({ useControlButtonStoreFacade: () => ({ touchMode: false, contextMenuOpen: false }) }));
vi.mock('./LazyToolModal', () => ({ LazyToolModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => isOpen
  ? <div role="dialog" aria-label="Publisher"><button onClick={onClose}>Close publisher</button></div> : null }));

beforeEach(() => {
  vi.stubEnv('VITE_HF_PUBLISH_ENABLED', 'true');
  vi.stubEnv('VITE_HF_OAUTH_CLIENT_ID', 'public-client');
  vi.stubEnv('VITE_HF_OAUTH_REDIRECT_URI', `${window.location.origin}/hf-callback.html`);
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('Hugging Face toolbar button', () => {
  it.each([
    `${window.location.origin}/hf-callback.html`,
    'https://another.example/hf-callback.html',
    '',
  ])('opens directly, including unavailable sign-in at %s', callback => {
    vi.stubEnv('VITE_HF_OAUTH_REDIRECT_URI', callback);
    const setActivePanel = vi.fn();
    render(<HuggingFacePublishButton activePanel="share" setActivePanel={setActivePanel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish to Hugging Face' }));
    expect(setActivePanel).toHaveBeenCalledWith(null);
    expect(screen.getByRole('dialog', { name: 'Publisher' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close publisher' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Publish to Hugging Face' }));
    expect(screen.getByRole('dialog', { name: 'Publisher' })).toBeInTheDocument();
  });

  it('keeps publishing hidden on deployments with the feature disabled', () => {
    vi.stubEnv('VITE_HF_PUBLISH_ENABLED', 'false');
    render(<HuggingFacePublishButton activePanel={null} setActivePanel={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Publish to Hugging Face' })).not.toBeInTheDocument();
  });
});
