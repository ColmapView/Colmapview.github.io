import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleDrivePublishButton } from './GoogleDrivePublishButton';
import { isGoogleDriveEnabled, resolveGoogleDriveHostingConfig } from '../../features/googleDrive/config';
import { decodeShareData, encodeShareData } from '../../utils/shareDataCodec';
import type { ColmapManifest } from '../../types/manifest';

vi.mock('../../features/googleDrive/config', async importOriginal => ({
  ...await importOriginal<typeof import('../../features/googleDrive/config')>(),
  isGoogleDriveEnabled: vi.fn(() => true),
}));
vi.mock('../../utils/shareDataCodec', async importOriginal => {
  const codec = await importOriginal<typeof import('../../utils/shareDataCodec')>();
  return { ...codec, encodeShareData: vi.fn(codec.encodeShareData) };
});

const facade = vi.hoisted(() => ({ handoffSource: null as string | object | null }));
vi.mock('./useGoogleDrivePublishButtonStoreFacade', () => ({ useGoogleDrivePublishButtonStoreFacade: () => facade }));
vi.mock('./useControlButtonStoreFacade', () => ({ useControlButtonStoreFacade: () => ({ touchMode: false, contextMenuOpen: false }) }));
vi.mock('./LazyToolModal', () => ({ LazyToolModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => isOpen
  ? <div role="dialog" aria-label="Drive publisher"><button onClick={onClose}>Close publisher</button></div> : null }));
beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '123456-test.apps.googleusercontent.com');
  vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'true');
  vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', '');
  vi.mocked(isGoogleDriveEnabled).mockReturnValue(true);
  facade.handoffSource = null;
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('Google Drive publishing toolbar control', () => {
  it('opens and reopens the publisher directly while closing the active toolbar panel', () => {
    const setActivePanel = vi.fn();
    render(<GoogleDrivePublishButton activePanel="share" setActivePanel={setActivePanel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish to Google Drive' }));
    expect(setActivePanel).toHaveBeenCalledWith(null);
    expect(screen.getByRole('dialog', { name: 'Drive publisher' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close publisher' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Publish to Google Drive' }));
    expect(screen.getByRole('dialog', { name: 'Drive publisher' })).toBeInTheDocument();
  });
  it('stays hidden when the Google client is unconfigured', () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '');
    render(<GoogleDrivePublishButton activePanel={null} setActivePanel={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Publish to Google Drive' })).not.toBeInTheDocument();
  });

  it.each([
    { host: 'GitHub Pages', origin: 'https://colmapview.github.io', flag: 'true' },
    { host: 'Cloudflare preview', origin: 'https://preview.colmapview.pages.dev', flag: 'true' },
    { host: 'disabled custom host', origin: 'https://colmapview.opsiclear.com', flag: 'false' },
  ])('opens Google Drive on $host in a new tab, keeping this scene', ({ origin, flag }) => {
    vi.mocked(isGoogleDriveEnabled).mockReturnValue(resolveGoogleDriveHostingConfig({ origin, development: false,
      env: { VITE_GOOGLE_DRIVE_ENABLED: flag, VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN: 'https://colmapview.opsiclear.com',
        VITE_GOOGLE_DRIVE_CLIENT_ID: '123456-test.apps.googleusercontent.com' },
    }).enabled);
    const setActivePanel = vi.fn();
    render(<GoogleDrivePublishButton activePanel="share" setActivePanel={setActivePanel} />);
    const link = screen.getByRole('link', { name: 'Use Google Drive' });
    expect(link).toHaveAttribute('href', 'https://colmapview.opsiclear.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('button', { name: 'Publish to Google Drive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(setActivePanel).not.toHaveBeenCalled();
  });
  it('hands a remote dataset URL to the Drive host', async () => {
    vi.mocked(isGoogleDriveEnabled).mockReturnValue(false);
    facade.handoffSource = 'https://huggingface.co/datasets/owner/scene/tree/main/sparse';
    render(<GoogleDrivePublishButton activePanel={null} setActivePanel={vi.fn()} />);
    const destination = new URL(screen.getByRole('link', { name: 'Use Google Drive' }).getAttribute('href')!);
    expect(destination.origin + destination.pathname + destination.search).toBe('https://colmapview.opsiclear.com/');
    expect((await decodeShareData(destination.hash))?.manifestUrl).toBe('https://huggingface.co/datasets/owner/scene/tree/main/sparse');
  });
  it('hands an inline manifest to the Drive host', async () => {
    vi.mocked(isGoogleDriveEnabled).mockReturnValue(false);
    const manifest: ColmapManifest = { version: 1, baseUrl: 'https://example.test/scene/',
      files: { cameras: 'sparse/0/cameras.bin', images: 'sparse/0/images.bin', points3D: 'sparse/0/points3D.bin' } };
    facade.handoffSource = manifest;
    render(<GoogleDrivePublishButton activePanel={null} setActivePanel={vi.fn()} />);
    const destination = new URL(screen.getByRole('link', { name: 'Use Google Drive' }).getAttribute('href')!);
    expect((await decodeShareData(destination.hash))?.manifest).toMatchObject(manifest);
  });
  it('builds the hand-off link once per dataset, not on every toolbar re-render', async () => {
    vi.mocked(isGoogleDriveEnabled).mockReturnValue(false);
    vi.mocked(encodeShareData).mockClear();
    facade.handoffSource = 'https://huggingface.co/datasets/owner/scene/tree/main/sparse';
    const setActivePanel = vi.fn();
    const { rerender } = render(<GoogleDrivePublishButton activePanel={null} setActivePanel={setActivePanel} />);
    rerender(<GoogleDrivePublishButton activePanel="share" setActivePanel={setActivePanel} />);
    expect(encodeShareData).toHaveBeenCalledOnce();
    facade.handoffSource = 'https://huggingface.co/datasets/owner/other/tree/main/sparse';
    rerender(<GoogleDrivePublishButton activePanel={null} setActivePanel={setActivePanel} />);
    expect(encodeShareData).toHaveBeenCalledTimes(2);
    const destination = new URL(screen.getByRole('link', { name: 'Use Google Drive' }).getAttribute('href')!);
    expect((await decodeShareData(destination.hash))?.manifestUrl).toBe('https://huggingface.co/datasets/owner/other/tree/main/sparse');
  });

  it.each([
    { host: 'custom host', origin: 'https://colmapview.opsiclear.com', development: false, flag: 'true' },
    { host: 'localhost', origin: 'http://localhost:5173', development: true, flag: undefined },
  ])('offers publishing on configured $host', ({ origin, development, flag }) => {
    const hosting = resolveGoogleDriveHostingConfig({ origin, development,
      env: { VITE_GOOGLE_DRIVE_ENABLED: flag,
        VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN: development ? undefined : 'https://colmapview.opsiclear.com',
        VITE_GOOGLE_DRIVE_CLIENT_ID: '123456-test.apps.googleusercontent.com' },
    });
    vi.mocked(isGoogleDriveEnabled).mockReturnValue(hosting.enabled);
    render(<GoogleDrivePublishButton activePanel={null} setActivePanel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Publish to Google Drive' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Use Google Drive' })).not.toBeInTheDocument();
  });
});
