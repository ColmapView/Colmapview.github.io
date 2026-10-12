import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SharePanel } from './SharePanel';
import type { PanelType } from '../ControlComponents';
import { hfAuth } from '../../../features/huggingface/auth';
import { isGoogleDriveEnabled, resolveGoogleDriveHostingConfig } from '../../../features/googleDrive/config';
import { decodeShareData, encodeShareData } from '../../../utils/shareDataCodec';
import { buildReconstruction } from '../../../test/builders';

const facade = vi.hoisted(() => ({ data: {
  hasEdits: false, publicationActive: false, reconstruction: null as ReturnType<typeof buildReconstruction> | null,
  sourceUrl: null as string | null, sourceManifest: null as object | null,
  currentViewState: null,
}, addNotification: vi.fn() }));
const urlActions = vi.hoisted(() => ({
  generateShareableUrl: vi.fn(() => 'https://viewer.example/shared'),
  generateEmbedUrl: vi.fn(() => 'https://viewer.example/embed'),
  generateIframeHtml: vi.fn(() => '<iframe></iframe>'),
  copyWithFeedback: vi.fn(async (_value: string, copied: (value: boolean) => void) => copied(true)),
}));
vi.mock('./useSharePanelStoreFacade', () => ({ useSharePanelStoreFacade: () => facade }));
vi.mock('../../../hooks/useUrlState', () => urlActions);
vi.mock('../useControlButtonStoreFacade', () => ({ useControlButtonStoreFacade: () => ({ touchMode: false, contextMenuOpen: false }) }));
vi.mock('../../../features/googleDrive/config', async importOriginal => ({
  ...await importOriginal<typeof import('../../../features/googleDrive/config')>(), isGoogleDriveEnabled: vi.fn(() => true),
}));
vi.mock('../../../utils/shareDataCodec', async importOriginal => {
  const codec = await importOriginal<typeof import('../../../utils/shareDataCodec')>();
  return { ...codec, encodeShareData: vi.fn(codec.encodeShareData) };
});
vi.mock('../LazyToolModal', async () => {
  const { ModalDialogShell } = await import('../../ui/ModalDialogShell');
  return { LazyToolModal: ({ title, isOpen, onClose }: { title: string; isOpen: boolean; onClose: () => void }) =>
    <ModalDialogShell isOpen={isOpen} onClose={onClose} ariaLabelledBy="test-publisher-title" overlayClassName="" panelClassName="">
      <h2 id="test-publisher-title">{title}</h2>
      <button onClick={onClose}>Close publisher</button>
    </ModalDialogShell> };
});

function ShareHarness({ initiallyOpen = true }: { initiallyOpen?: boolean }) {
  const [activePanel, setActivePanel] = useState<PanelType>(initiallyOpen ? 'share' : null);
  return <SharePanel activePanel={activePanel} setActivePanel={setActivePanel} />;
}
const share = () => screen.getByRole('button', { name: 'Share' });
const reopen = () => fireEvent.click(share());

beforeEach(() => {
  vi.stubEnv('VITE_HF_PUBLISH_ENABLED', 'true');
  vi.stubEnv('VITE_HF_AUTH_ENABLED', 'false');
  vi.stubEnv('VITE_HF_OAUTH_CLIENT_ID', 'public-client');
  vi.stubEnv('VITE_HF_OAUTH_REDIRECT_URI', `${window.location.origin}/hf-callback.html`);
  vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '123456-test.apps.googleusercontent.com');
  vi.mocked(isGoogleDriveEnabled).mockReturnValue(true);
  Object.assign(facade.data, { hasEdits: false, publicationActive: false, reconstruction: null, sourceUrl: null, sourceManifest: null });
  vi.mocked(encodeShareData).mockClear();
  Object.values(urlActions).forEach(action => action.mockClear());
  facade.addNotification.mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Share destinations and dialog lifetime', () => {
  it('exposes one Share control with destinations inside its popup', () => {
    render(<ShareHarness initiallyOpen={false} />);
    expect(screen.getAllByRole('button')).toEqual([share()]);
    reopen();
    const panel = screen.getByRole('region', { name: 'Share' });
    expect(panel.querySelector('details')).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Share to X' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Share to LinkedIn' })).toBeInTheDocument();
    expect(within(panel).queryByRole('switch', { name: 'Copy screenshot' })).toBeNull();
    for (const name of ['Bucket storage', 'Publish to Hugging Face', 'Publish to Google Drive']) {
      expect(within(panel).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([
    ['Bucket storage', 'Publish to bucket'],
    ['Publish to Hugging Face', 'Publish dataset'],
    ['Publish to Google Drive', 'Publish to Google Drive'],
  ])('keeps %s open when the popup closes and restores focus on close', async (button, dialog) => {
    render(<ShareHarness />);
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(await screen.findByRole('dialog', { name: dialog })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Share' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close publisher' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(share()).toHaveFocus();
    reopen();
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(await screen.findByRole('dialog', { name: dialog })).toBeInTheDocument();
  });

  it.each(['', 'https://another.example/hf-callback.html'])('keeps the publishing dialog reachable with unavailable sign-in at %s', callback => {
    vi.stubEnv('VITE_HF_OAUTH_REDIRECT_URI', callback);
    render(<ShareHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish to Hugging Face' }));
    expect(screen.getByRole('dialog', { name: 'Publish dataset' })).toBeInTheDocument();
  });

  it('hides Hugging Face when neither publishing nor account access is enabled', () => {
    vi.stubEnv('VITE_HF_PUBLISH_ENABLED', 'false');
    render(<ShareHarness />);
    expect(screen.queryByRole('button', { name: /Hugging Face/ })).toBeNull();
  });

  it('keeps read-only sign-in available after the account expires', () => {
    vi.stubEnv('VITE_HF_PUBLISH_ENABLED', 'false'); vi.stubEnv('VITE_HF_AUTH_ENABLED', 'true');
    vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue({ status: 'disconnected', identity: null, error: 'Your connection expired. Sign in again.' });
    const connect = vi.spyOn(hfAuth, 'connect').mockResolvedValue(undefined);
    render(<ShareHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Hugging Face account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('connection expired');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Hugging Face' }));
    expect(connect).toHaveBeenCalledExactlyOnceWith({ clientId: 'public-client', redirectUri: `${window.location.origin}/hf-callback.html`, readOnly: true });
  });

  it('shows and disconnects the signed-in reader', () => {
    vi.stubEnv('VITE_HF_PUBLISH_ENABLED', 'false'); vi.stubEnv('VITE_HF_AUTH_ENABLED', 'true');
    vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue({ status: 'connected', identity: { username: 'reader' }, error: null });
    const disconnect = vi.spyOn(hfAuth, 'disconnect').mockImplementation(() => undefined);
    render(<ShareHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Hugging Face account' }));
    expect(screen.getByRole('status')).toHaveTextContent('Connected as reader');
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('cancels pending read-only sign-in on Escape', () => {
    vi.stubEnv('VITE_HF_PUBLISH_ENABLED', 'false'); vi.stubEnv('VITE_HF_AUTH_ENABLED', 'true');
    vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue({ status: 'connecting', identity: null, error: null });
    const disconnect = vi.spyOn(hfAuth, 'disconnect').mockImplementation(() => undefined);
    render(<ShareHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Hugging Face account' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(share()).toHaveFocus();
  });

  it('hides Drive publishing when its OAuth client is missing', () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '');
    render(<ShareHarness />);
    expect(screen.queryByRole('button', { name: 'Publish to Google Drive' })).toBeNull();
  });

  it.each([
    ['GitHub', 'https://colmapview.github.io', 'true'],
    ['preview', 'https://preview.colmapview.pages.dev', 'true'],
    ['disabled custom host', 'https://colmapview.opsiclear.com', 'false'],
  ])('keeps the safe Drive handoff on %s', (_host, origin, flag) => {
    vi.mocked(isGoogleDriveEnabled).mockReturnValue(resolveGoogleDriveHostingConfig({ origin, development: false,
      env: { VITE_GOOGLE_DRIVE_ENABLED: flag, VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN: 'https://colmapview.opsiclear.com', VITE_GOOGLE_DRIVE_CLIENT_ID: '123456-test.apps.googleusercontent.com' },
    }).enabled);
    render(<ShareHarness />);
    const link = screen.getByRole('link', { name: 'Use Google Drive' });
    expect(link).toHaveAttribute('href', 'https://colmapview.opsiclear.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('button', { name: 'Publish to Google Drive' })).toBeNull();
  });

  it.each(['url', 'manifest'])('reopens a remote %s on the Drive host without rebuilding its link on each hover', async kind => {
    vi.mocked(isGoogleDriveEnabled).mockReturnValue(false);
    const source = kind === 'url' ? 'https://example.test/scene/' : { version: 1, baseUrl: 'https://example.test/scene/', files: { cameras: 'cameras.bin', images: 'images.bin', points3D: 'points3D.bin' } };
    if (typeof source === 'string') facade.data.sourceUrl = source; else facade.data.sourceManifest = source;
    render(<ShareHarness />);
    const destination = new URL(screen.getByRole('link', { name: 'Use Google Drive' }).getAttribute('href')!);
    expect(await decodeShareData(destination.hash)).toMatchObject(typeof source === 'string' ? { manifestUrl: source } : { manifest: source });
    fireEvent.keyDown(share(), { key: 'Escape' }); reopen();
    expect(encodeShareData).toHaveBeenCalledOnce();
  });

  it('keeps the Share indicator active while a publication is pending', () => {
    facade.data.publicationActive = true;
    render(<ShareHarness initiallyOpen={false} />);
    expect(share()).toHaveClass('viewer-control-selected');
  });
});

describe('Share links and social actions', () => {
  const clipboard = { writeText: vi.fn(async (_text: string) => undefined), write: vi.fn() };
  let originalClipboard: PropertyDescriptor | undefined;
  beforeEach(() => {
    facade.data.reconstruction = buildReconstruction();
    facade.data.sourceUrl = 'https://example.test/scene/';
    clipboard.writeText.mockReset().mockResolvedValue(undefined);
    clipboard.write.mockClear();
    originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
  });
  afterEach(() => {
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
  });
  it('copies the existing source link', async () => {
    render(<ShareHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(urlActions.generateShareableUrl).toHaveBeenCalledWith(facade.data.sourceUrl, null, undefined);
    expect(urlActions.copyWithFeedback).toHaveBeenCalledWith('https://viewer.example/shared', expect.any(Function));
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });
  it('labels edited source links as original and omits current edits', () => {
    facade.data.hasEdits = true;
    render(<ShareHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy original dataset link' }));
    expect(urlActions.generateShareableUrl).toHaveBeenCalledWith(facade.data.sourceUrl, null, null);
  });
  it('offers both embed formats directly', () => {
    render(<ShareHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Embed URL' }));
    expect(urlActions.copyWithFeedback).toHaveBeenCalledWith('https://viewer.example/embed', expect.any(Function));
    fireEvent.click(screen.getByRole('button', { name: 'Embed HTML' }));
    expect(urlActions.generateIframeHtml).toHaveBeenCalledWith('https://viewer.example/embed');
    expect(urlActions.copyWithFeedback).toHaveBeenCalledWith('<iframe></iframe>', expect.any(Function));
  });

  it('shares to X from Share without copying a screenshot', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<ShareHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Share to X' }));
    expect(open).toHaveBeenCalledOnce();
    const target = new URL(String(open.mock.calls[0][0]));
    expect(target.origin + target.pathname).toBe('https://twitter.com/intent/tweet');
    expect(target.searchParams.get('url')).toBe('https://viewer.example/shared');
    expect(clipboard.write).not.toHaveBeenCalled();
    expect(clipboard.writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole('switch', { name: 'Copy screenshot' })).toBeNull();
  });

  it('keeps the link option when the Share panel closes and reopens', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<ShareHarness />);
    fireEvent.click(screen.getByRole('switch', { name: 'Include link' }));
    fireEvent.keyDown(share(), { key: 'Escape' });
    reopen();
    fireEvent.click(screen.getByRole('button', { name: 'Share to X' }));
    expect(open).toHaveBeenCalledOnce();
    expect(new URL(String(open.mock.calls[0][0])).searchParams.has('url')).toBe(false);
    expect(clipboard.write).not.toHaveBeenCalled();
  });

  it('shares to LinkedIn from Share and copies only the message', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<ShareHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Share to LinkedIn' }));
    expect(open).toHaveBeenCalledWith('https://www.linkedin.com/feed/', '_blank', expect.any(String));
    expect(clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('https://viewer.example/shared'));
    expect(clipboard.write).not.toHaveBeenCalled();
    await waitFor(() => expect(facade.addNotification).toHaveBeenCalledWith('info', 'Message copied! Paste in LinkedIn post', 4000));
  });

  it('opens LinkedIn while clipboard access is pending and survives a denial', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    let rejectClipboard!: (reason: Error) => void;
    clipboard.writeText.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectClipboard = reject; }));
    render(<ShareHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Share to LinkedIn' }));
    expect(open).toHaveBeenCalledWith('https://www.linkedin.com/feed/', '_blank', expect.any(String));
    rejectClipboard(new Error('Clipboard permission denied'));
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledOnce());
    expect(facade.addNotification).not.toHaveBeenCalled();
  });
});
