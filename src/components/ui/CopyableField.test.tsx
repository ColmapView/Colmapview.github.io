import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyableField } from './CopyableField';

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const commandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');
const writeText = vi.fn<(value: string) => Promise<void>>();
const execCommand = vi.fn();
beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  execCommand.mockReset().mockReturnValue(false);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
});
afterEach(() => {
  cleanup();
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
  if (commandDescriptor) Object.defineProperty(document, 'execCommand', commandDescriptor);
  else Reflect.deleteProperty(document, 'execCommand');
});

describe('CopyableField', () => {
  it('copies the exact value and reports success only for that value', async () => {
    const view = render(<CopyableField label="Viewer link" value="https://viewer.example/?url=scene" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeVisible();
    expect(writeText).toHaveBeenCalledExactlyOnceWith('https://viewer.example/?url=scene');
    expect(execCommand).not.toHaveBeenCalled();
    view.rerender(<CopyableField label="Viewer link" value="https://viewer.example/?url=another" />);
    expect(screen.getByRole('button', { name: 'Copy' })).toBeVisible();
  });

  it.each([
    ['Viewer link', 'https://viewer.example/?url=scene'],
    ['Upload folder', 'dataset/failed-upload/'],
  ])('explains a denied copy and selects the %s for manual copying', async (label, value) => {
    writeText.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    render(<CopyableField label={label} value={value} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not copy. Copy the selected text manually.');
    expect(writeText).toHaveBeenCalledExactlyOnceWith(value);
    expect(execCommand).toHaveBeenCalledExactlyOnceWith('copy');
    const input = screen.getByRole('textbox', { name: label }) as HTMLInputElement;
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(value.length);
    expect(input).toHaveAttribute('aria-describedby', screen.getByRole('alert').id);
    expect(screen.getByRole('button', { name: 'Copy' })).toBeVisible();
  });

  it('clears failed-copy feedback after a successful subsequent copy', async () => {
    writeText.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    render(<CopyableField label="Viewer link" value="https://viewer.example/" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-describedby');
  });

  it('announces repeated copies in a pre-mounted status beside the button', async () => {
    render(<CopyableField label="Viewer link" value="https://viewer.example/" />);
    const button = screen.getByRole('button', { name: 'Copy' });
    const status = button.nextElementSibling as HTMLElement;
    expect(button).not.toHaveAttribute('aria-live');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toBeEmptyDOMElement();

    fireEvent.click(button);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBe(button);
    expect(status.textContent).toBe('Copied');

    fireEvent.click(button);
    await waitFor(() => expect(status.textContent).toBe('Copied\u00A0'));
    expect(button).toHaveTextContent('Copied');
  });

  it('resets the button and status after 2500 ms', async () => {
    vi.useFakeTimers();
    try {
      render(<CopyableField label="Viewer link" value="https://viewer.example/" />);
      const button = screen.getByRole('button', { name: 'Copy' });
      const status = button.nextElementSibling as HTMLElement;
      await act(async () => {
        fireEvent.click(button);
      });

      act(() => {
        vi.advanceTimersByTime(2499);
      });
      expect(button).toHaveTextContent('Copied');
      expect(status).toHaveTextContent('Copied');

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(button).toHaveTextContent('Copy');
      expect(status).toBeEmptyDOMElement();
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });
});
