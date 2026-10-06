import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleDrivePublishButton } from './GoogleDrivePublishButton';
import { isGoogleDriveEnabled, resolveGoogleDriveHostingConfig } from '../../features/googleDrive/config';

vi.mock('../../features/googleDrive/config', async importOriginal => ({
  ...await importOriginal<typeof import('../../features/googleDrive/config')>(),
  isGoogleDriveEnabled: vi.fn(() => true),
}));

vi.mock('./useControlButtonStoreFacade', () => ({ useControlButtonStoreFacade: () => ({ touchMode: false, contextMenuOpen: false }) }));
vi.mock('./LazyToolModal', () => ({ LazyToolModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => isOpen
  ? <div role="dialog" aria-label="Drive publisher"><button onClick={onClose}>Close publisher</button></div> : null }));
beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_DRIVE_CLIENT_ID', '123456-test.apps.googleusercontent.com');
  vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'true');
  vi.stubEnv('VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN', '');
  vi.mocked(isGoogleDriveEnabled).mockReturnValue(true);
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
  ])('links to Google Drive on $host without opening a publisher', ({ origin, flag }) => {
    vi.mocked(isGoogleDriveEnabled).mockReturnValue(resolveGoogleDriveHostingConfig({ origin, development: false,
      env: { VITE_GOOGLE_DRIVE_ENABLED: flag, VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN: 'https://colmapview.opsiclear.com',
        VITE_GOOGLE_DRIVE_CLIENT_ID: '123456-test.apps.googleusercontent.com' },
    }).enabled);
    const setActivePanel = vi.fn();
    render(<GoogleDrivePublishButton activePanel="share" setActivePanel={setActivePanel} />);
    expect(screen.getByRole('link', { name: 'Use Google Drive' })).toHaveAttribute('href', 'https://colmapview.opsiclear.com');
    expect(screen.queryByRole('button', { name: 'Publish to Google Drive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(setActivePanel).not.toHaveBeenCalled();
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
