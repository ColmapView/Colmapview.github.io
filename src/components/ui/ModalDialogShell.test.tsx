import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef, useEffect, useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModalDialogShell } from './ModalDialogShell';
import { getModalDialogFocusableElements } from './modalDialogShellPolicy';

afterEach(() => {
  cleanup();
});

describe('ModalDialogShell', () => {
  it('gives an explicit initial focus target precedence over focus chosen by a child', () => {
    const initialFocusRef = createRef<HTMLButtonElement>();
    function ChildStatus() {
      const ref = useRef<HTMLParagraphElement>(null);
      useEffect(() => { ref.current?.focus(); }, []);
      return <p ref={ref} tabIndex={-1} role="status">Completed</p>;
    }
    render(<ModalDialogShell isOpen onClose={vi.fn()} ariaLabelledBy="publication-title" overlayClassName="overlay" panelClassName="panel"
      initialFocusRef={initialFocusRef}>
      <h2 id="publication-title">Publication</h2>
      <button ref={initialFocusRef} type="button">Requested target</button>
      <ChildStatus />
    </ModalDialogShell>);
    expect(screen.getByRole('button', { name: 'Requested target' })).toHaveFocus();
  });

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

  it('lets only the most recently opened of stacked dialogs answer Escape', () => {
    const closeLower = vi.fn();
    const closeUpper = vi.fn();
    function Stack({ upperOpen, lowerTitle }: { upperOpen: boolean; lowerTitle: string }) {
      return (
        <>
          <ModalDialogShell isOpen onClose={() => closeLower()} ariaLabelledBy="lower-title"
            overlayClassName="fixed inset-0" panelClassName="panel">
            <h2 id="lower-title">{lowerTitle}</h2>
          </ModalDialogShell>
          <ModalDialogShell isOpen={upperOpen} onClose={closeUpper} ariaLabelledBy="upper-title"
            overlayClassName="fixed inset-0" panelClassName="panel">
            <h2 id="upper-title">Upper</h2>
          </ModalDialogShell>
        </>
      );
    }

    const { rerender } = render(<Stack upperOpen={false} lowerTitle="Lower" />);
    rerender(<Stack upperOpen lowerTitle="Lower" />);
    // The dialog underneath re-renders, with a new close handler, after the upper one opened.
    rerender(<Stack upperOpen lowerTitle="Lower again" />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeUpper).toHaveBeenCalledOnce();
    expect(closeLower).not.toHaveBeenCalled();

    rerender(<Stack upperOpen={false} lowerTitle="Lower again" />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeLower).toHaveBeenCalledOnce();
    expect(closeUpper).toHaveBeenCalledOnce();
  });

  it('keeps Tab inside the top dialog of a stack, then inside the one underneath once it closes', () => {
    function Stack({ upperOpen }: { upperOpen: boolean }) {
      return (
        <>
          <ModalDialogShell isOpen onClose={vi.fn()} ariaLabelledBy="lower-tab-title"
            overlayClassName="fixed inset-0" panelClassName="panel">
            <h2 id="lower-tab-title">Lower</h2>
            <button type="button">Lower first</button>
            <button type="button">Lower last</button>
          </ModalDialogShell>
          <ModalDialogShell isOpen={upperOpen} onClose={vi.fn()} ariaLabelledBy="upper-tab-title"
            overlayClassName="fixed inset-0" panelClassName="panel">
            <h2 id="upper-tab-title">Upper</h2>
            <button type="button">Upper first</button>
            <button type="button">Upper last</button>
          </ModalDialogShell>
        </>
      );
    }
    const button = (name: string) => screen.getByRole('button', { name });

    const { rerender } = render(<Stack upperOpen={false} />);
    rerender(<Stack upperOpen />);
    button('Upper last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(button('Upper first')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(button('Upper last')).toHaveFocus();

    rerender(<Stack upperOpen={false} />);
    button('Lower last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(button('Lower first')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(button('Lower last')).toHaveFocus();
  });

  it('keeps Tab inside the top dialog over one with nothing to focus, whose own trap would pull focus back', () => {
    function Stack({ upperOpen }: { upperOpen: boolean }) {
      return (
        <>
          <ModalDialogShell isOpen onClose={vi.fn()} ariaLabelledBy="empty-title"
            overlayClassName="fixed inset-0" panelClassName="panel">
            <h2 id="empty-title">Nothing to focus</h2>
          </ModalDialogShell>
          <ModalDialogShell isOpen={upperOpen} onClose={vi.fn()} ariaLabelledBy="top-title"
            overlayClassName="fixed inset-0" panelClassName="panel">
            <h2 id="top-title">Top</h2>
            <button type="button">Top first</button>
            <button type="button">Top last</button>
          </ModalDialogShell>
        </>
      );
    }

    const { rerender } = render(<Stack upperOpen={false} />);
    rerender(<Stack upperOpen />);
    screen.getByRole('button', { name: 'Top last' }).focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Top first' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Top last' })).toHaveFocus();
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
