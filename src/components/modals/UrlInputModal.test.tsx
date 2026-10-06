import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UrlInputModal } from './UrlInputModal';
import { URL_INPUT_PLACEHOLDER } from './urlInputModalViewModel';
import { isGoogleDriveEnabled, resolveGoogleDriveHostingConfig } from '../../features/googleDrive/config';

vi.mock('../../features/googleDrive/config', async importOriginal => ({
  ...await importOriginal<typeof import('../../features/googleDrive/config')>(),
  isGoogleDriveEnabled: vi.fn(() => true),
}));

beforeEach(() => vi.mocked(isGoogleDriveEnabled).mockReturnValue(true));

afterEach(() => {
  cleanup();
});

describe('UrlInputModal', () => {
  it('loads the trimmed URL and renders supported format help', () => {
    const onClose = vi.fn();
    const onLoad = vi.fn();

    render(<UrlInputModal isOpen={true} onClose={onClose} onLoad={onLoad} />);

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby');

    const input = screen.getByPlaceholderText(URL_INPUT_PLACEHOLDER);
    const loadButton = screen.getByRole('button', { name: 'Load' });

    expect(loadButton).toBeDisabled();

    fireEvent.change(input, { target: { value: '  https://example.com/reconstruction.zip  ' } });
    fireEvent.click(loadButton);

    expect(onLoad).toHaveBeenCalledWith('https://example.com/reconstruction.zip');

    fireEvent.click(screen.getByRole('button', { name: 'Supported URL formats' }));

    expect(screen.getByText('ZIP Files')).toBeVisible();
    expect(screen.getByText('Cloud Storage URLs')).toBeVisible();
    expect(screen.getByText('CORS Requirements')).toBeVisible();
  });

  it('blocks load and backdrop close while loading', () => {
    const onClose = vi.fn();
    const onLoad = vi.fn();

    render(
      <UrlInputModal
        isOpen={true}
        onClose={onClose}
        onLoad={onLoad}
        loading={true}
      />
    );

    const modal = screen.getByTestId('url-modal');
    const backdrop = modal.parentElement;

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();

    if (!backdrop) throw new Error('expected modal backdrop');
    fireEvent.click(backdrop);
    fireEvent.keyDown(screen.getByPlaceholderText(URL_INPUT_PLACEHOLDER), { key: 'Enter' });

    expect(onClose).not.toHaveBeenCalled();
    expect(onLoad).not.toHaveBeenCalled();
  });

  it.each([
    { host: 'GitHub Pages', origin: 'https://colmapview.github.io', flag: 'true' },
    { host: 'Cloudflare preview', origin: 'https://preview.colmapview.pages.dev', flag: 'true' },
    { host: 'disabled custom host', origin: 'https://colmapview.opsiclear.com', flag: 'false' },
  ])('offers a safe Drive handoff on $host and keeps Hugging Face loading here', ({ origin, flag }) => {
    vi.mocked(isGoogleDriveEnabled).mockReturnValue(resolveGoogleDriveHostingConfig({ origin, development: false,
      env: { VITE_GOOGLE_DRIVE_ENABLED: flag, VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN: 'https://colmapview.opsiclear.com',
        VITE_GOOGLE_DRIVE_API_KEY: 'test-key' },
    }).enabled);
    const onLoad = vi.fn();
    const onClose = vi.fn();
    render(<UrlInputModal isOpen onClose={onClose} onLoad={onLoad} />);
    const input = screen.getByPlaceholderText(URL_INPUT_PLACEHOLDER);
    fireEvent.change(input, { target: { value: 'https://drive.google.com/open?id=FILE_123&resourcekey=KEY_456&access_token=secret#token=secret' } });
    const handoff = screen.getByRole('link', { name: 'Use Google Drive' });
    const destination = new URL(handoff.getAttribute('href')!);
    expect(destination.origin).toBe('https://colmapview.opsiclear.com');
    expect(destination.searchParams.get('url')).toBe('https://drive.google.com/file/d/FILE_123/view?resourcekey=KEY_456');
    expect(handoff.getAttribute('href')).not.toContain('secret');
    expect(screen.queryByRole('button', { name: 'Load' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    handoff.focus();
    expect(handoff).toHaveFocus();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onLoad).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Supported URL formats' }));
    expect(screen.getByText(/Use Google Drive on colmapview.opsiclear.com to open/)).toBeVisible();
    expect(screen.queryByText(/Google Drive account icon/)).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'https://huggingface.co/datasets/user/data/tree/main/reconstruction' } });
    expect(screen.queryByRole('link', { name: 'Use Google Drive' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    expect(onLoad).toHaveBeenCalledExactlyOnceWith('https://huggingface.co/datasets/user/data/tree/main/reconstruction');
  });

  it('loads a public Drive URL here when Google Drive is enabled', () => {
    const onLoad = vi.fn();
    render(<UrlInputModal isOpen onClose={vi.fn()} onLoad={onLoad} />);
    const url = 'https://drive.google.com/file/d/FILE_123/view?resourcekey=KEY_456';
    fireEvent.change(screen.getByPlaceholderText(URL_INPUT_PLACEHOLDER), { target: { value: url } });
    expect(screen.queryByRole('link', { name: 'Use Google Drive' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    expect(onLoad).toHaveBeenCalledExactlyOnceWith(url);
  });
});
