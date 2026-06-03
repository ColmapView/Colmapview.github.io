import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UrlInputModal } from './UrlInputModal';
import { URL_INPUT_PLACEHOLDER } from './urlInputModalViewModel';

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
});
