import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModalDialogShell } from './ModalDialogShell';
import { getModalDialogFocusableElements } from './modalDialogShellPolicy';

afterEach(() => {
  cleanup();
});

describe('ModalDialogShell', () => {
  it('renders a portal dialog, focuses the requested element, traps focus, and restores focus', async () => {
    const onClose = vi.fn();
    const initialFocusRef = createRef<HTMLInputElement>();

    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">Before</button>
          <ModalDialogShell
            isOpen={open}
            onClose={onClose}
            ariaLabelledBy="dialog-title"
            overlayClassName="fixed inset-0"
            panelClassName="panel"
            initialFocusRef={initialFocusRef}
          >
            <h2 id="dialog-title">Dialog title</h2>
            <input ref={initialFocusRef} aria-label="Name" />
            <button type="button">Done</button>
          </ModalDialogShell>
        </>
      );
    }

    const { rerender } = render(<Harness open={false} />);
    const before = screen.getByRole('button', { name: 'Before' });
    before.focus();

    rerender(<Harness open />);

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'dialog-title');
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Harness open={false} />);
    await waitFor(() => expect(before).toHaveFocus());
  });

  it('honors disabled backdrop and escape close policies', () => {
    const onClose = vi.fn();

    render(
      <ModalDialogShell
        isOpen
        onClose={onClose}
        ariaLabelledBy="locked-dialog-title"
        overlayClassName="fixed inset-0"
        panelClassName="panel"
        panelTestId="locked-panel"
        closeOnBackdrop={false}
        closeOnEscape={false}
      >
        <h2 id="locked-dialog-title">Locked</h2>
        <button type="button">Inside</button>
      </ModalDialogShell>
    );

    fireEvent.click(screen.getByRole('dialog'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses the full focusable selector for dialog descendants', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <button>Button</button>
      <input />
      <select><option>One</option></select>
      <a href="#x">Link</a>
      <button disabled>Disabled</button>
    `;

    expect(getModalDialogFocusableElements(root).map((element) => element.tagName)).toEqual([
      'BUTTON',
      'INPUT',
      'SELECT',
      'A',
    ]);
  });
});
