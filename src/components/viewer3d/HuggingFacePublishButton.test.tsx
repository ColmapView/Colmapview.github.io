import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HuggingFacePublishButton } from './HuggingFacePublishButton';
import { hfAuth } from '../../features/huggingface/auth';

vi.mock('./useControlButtonStoreFacade', () => ({ useControlButtonStoreFacade: () => ({ touchMode: false, contextMenuOpen: false }) }));
vi.mock('./LazyToolModal', () => ({ LazyToolModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => isOpen
  ? <div role="dialog" aria-label="Publisher"><button onClick={onClose}>Close publisher</button></div> : null }));

beforeEach(() => {
  vi.stubEnv('VITE_HF_PUBLISH_ENABLED', 'true');
  vi.stubEnv('VITE_HF_OAUTH_CLIENT_ID', 'public-client');
  vi.stubEnv('VITE_HF_OAUTH_REDIRECT_URI', `${window.location.origin}/hf-callback.html`);
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

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
    expect(screen.queryByRole('button', { name: 'Hugging Face account' })).not.toBeInTheDocument();
  });

  it('lets a read-only viewer sign in again inside a loaded scene once the session expired', () => {
    vi.stubEnv('VITE_HF_PUBLISH_ENABLED', 'false');
    vi.stubEnv('VITE_HF_AUTH_ENABLED', 'true');
    vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue({
      status: 'disconnected', identity: null, error: 'Your Hugging Face connection expired. Sign in again.' });
    const connect = vi.spyOn(hfAuth, 'connect').mockResolvedValue(undefined);
    const setActivePanel = vi.fn();
    render(<HuggingFacePublishButton activePanel={null} setActivePanel={setActivePanel} />);
    expect(screen.queryByRole('button', { name: 'Publish to Hugging Face' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hugging Face account' }));
    expect(setActivePanel).toHaveBeenCalledWith(null);
    expect(screen.getByRole('alert')).toHaveTextContent('connection expired');
    expect(screen.getByText('Allows reading your repositories, including private datasets.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Hugging Face' }));
    expect(connect).toHaveBeenCalledExactlyOnceWith({
      clientId: 'public-client', redirectUri: `${window.location.origin}/hf-callback.html`, readOnly: true });
  });

  it('shows the signed-in reader and disconnects from the scene', () => {
    vi.stubEnv('VITE_HF_PUBLISH_ENABLED', 'false');
    vi.stubEnv('VITE_HF_AUTH_ENABLED', 'true');
    vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue({ status: 'connected', identity: { username: 'reader' }, error: null });
    const disconnect = vi.spyOn(hfAuth, 'disconnect').mockImplementation(() => undefined);
    render(<HuggingFacePublishButton activePanel={null} setActivePanel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hugging Face: reader' }));
    expect(screen.getByRole('status')).toHaveTextContent('Connected as reader');
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('closes the account dialog on Escape and abandons a pending sign-in', () => {
    vi.stubEnv('VITE_HF_PUBLISH_ENABLED', 'false');
    vi.stubEnv('VITE_HF_AUTH_ENABLED', 'true');
    vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue({ status: 'connecting', identity: null, error: null });
    const disconnect = vi.spyOn(hfAuth, 'disconnect').mockImplementation(() => undefined);
    render(<HuggingFacePublishButton activePanel={null} setActivePanel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hugging Face account' }));
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for sign-in');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
