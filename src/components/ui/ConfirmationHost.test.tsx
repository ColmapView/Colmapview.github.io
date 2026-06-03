import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmationHost } from './ConfirmationHost';
import { registerConfirmationHandler, requestConfirmation } from '../../utils/confirmation';

afterEach(() => {
  cleanup();
  registerConfirmationHandler(null);
});

describe('ConfirmationHost', () => {
  it('focuses the cancel action and restores prior focus when cancelled', async () => {
    render(
      <>
        <button type="button">Before</button>
        <ConfirmationHost />
      </>
    );

    const beforeButton = screen.getByRole('button', { name: 'Before' });
    beforeButton.focus();

    let confirmation!: Promise<boolean>;
    await act(async () => {
      confirmation = requestConfirmation({
        title: 'Delete profile?',
        message: 'Delete profile "Test"?',
        confirmLabel: 'Delete',
        tone: 'danger',
      });
    });

    const cancelButton = await screen.findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(cancelButton).toHaveFocus());

    fireEvent.click(cancelButton);

    await expect(confirmation).resolves.toBe(false);
    await waitFor(() => expect(beforeButton).toHaveFocus());
  });

  it('traps tab focus inside the dialog and resolves on confirm', async () => {
    render(<ConfirmationHost />);

    let confirmation!: Promise<boolean>;
    await act(async () => {
      confirmation = requestConfirmation({
        title: 'Bake transform into export?',
        message: 'Bake the transform into the exported poses and 3D points?',
        confirmLabel: 'Bake and export',
      });
    });

    const cancelButton = await screen.findByRole('button', { name: 'Cancel' });
    const confirmButton = screen.getByRole('button', { name: 'Bake and export' });

    await waitFor(() => expect(cancelButton).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(confirmButton).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(cancelButton).toHaveFocus();

    fireEvent.click(confirmButton);

    await expect(confirmation).resolves.toBe(true);
  });

  it('resolves queued confirmations in order', async () => {
    render(<ConfirmationHost />);

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = requestConfirmation({
        title: 'First?',
        message: 'First confirmation',
        confirmLabel: 'First',
      });
      second = requestConfirmation({
        title: 'Second?',
        message: 'Second confirmation',
        confirmLabel: 'Second',
      });
    });

    fireEvent.click(await screen.findByRole('button', { name: 'First' }));
    await expect(first).resolves.toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    await expect(second).resolves.toBe(false);
  });
});
