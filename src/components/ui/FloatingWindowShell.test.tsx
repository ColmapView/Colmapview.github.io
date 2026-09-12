import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef, type MouseEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { modalStyles } from '../../theme';
import { FloatingWindowShell } from './FloatingWindowShell';

afterEach(() => {
  cleanup();
});

describe('FloatingWindowShell', () => {
  it('forwards an optional panel id and focused keyboard events without adding global Escape behavior', () => {
    const onKeyDown = vi.fn();
    render(<FloatingWindowShell isOpen title="Named tool" onClose={vi.fn()}
      panelId="named-tool" onPanelKeyDown={onKeyDown}><input aria-label="Tool input" /></FloatingWindowShell>);
    expect(screen.getByRole('dialog')).toHaveAttribute('id', 'named-tool');
    fireEvent.keyDown(screen.getByLabelText('Tool input'), { key: 'Escape' });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it('renders non-modal floating chrome with non-modal dialog semantics', () => {
    const onClose = vi.fn();
    const onPanelPointerDown = vi.fn();
    const onHeaderPointerDown = vi.fn();
    const panelRef = createRef<HTMLDivElement>();

    render(
      <FloatingWindowShell
        isOpen
        title="Floating title"
        onClose={onClose}
        panelRef={panelRef}
        overlayStyle={{ zIndex: 1007 }}
        panelStyle={{ left: 12, top: 24, width: 300 }}
        onPanelPointerDown={onPanelPointerDown}
        onHeaderPointerDown={onHeaderPointerDown}
      >
        <div>Body</div>
      </FloatingWindowShell>
    );

    const dialog = screen.getByRole('dialog', { name: 'Floating title' });
    expect(dialog).toBe(panelRef.current);
    expect(dialog).not.toHaveAttribute('aria-modal');
    expect(dialog).toHaveAttribute('tabindex', '-1');
    expect(dialog).toHaveAttribute('aria-labelledby', screen.getByText('Floating title').id);
    expect(screen.getByText('Floating title')).toBeVisible();
    expect(panelRef.current).toHaveClass(...modalStyles.toolPanel.split(' '));
    expect(panelRef.current).toHaveAttribute('data-idle-pause', 'true');
    expect(panelRef.current).toHaveStyle({ left: '12px', top: '24px' });
    // The authored width is handed to the stylesheet as a custom property
    // INSTEAD of an inline width (index.css turns it back into a width, and the
    // compact tier multiplies it). Publishing both would put an unbeatable
    // inline declaration in front of the rule that does the arithmetic, which
    // is what forced an `!important` that collapsed the box when it failed.
    expect(panelRef.current!.style.getPropertyValue('--tool-modal-width')).toBe('300px');
    expect(panelRef.current!.style.width).toBe('');

    fireEvent.pointerDown(panelRef.current!);
    fireEvent.pointerDown(screen.getByText('Floating title').parentElement!);
    fireEvent.click(screen.getByTitle('Close'));

    expect(onPanelPointerDown).toHaveBeenCalledTimes(2);
    expect(onHeaderPointerDown).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('can preserve backdrop click behavior for mixed dialog/tool windows', () => {
    const onBackdropClick = vi.fn();

    render(
      <FloatingWindowShell
        isOpen
        title="With backdrop"
        onClose={vi.fn()}
        renderBackdrop
        onBackdropClick={onBackdropClick}
      >
        <div>Body</div>
      </FloatingWindowShell>
    );

    const backdrop = Array.from(document.querySelectorAll('div'))
      .find((element) => element.classList.contains('bg-ds-void/50'));
    if (!backdrop) throw new Error('expected backdrop');

    fireEvent.click(backdrop);

    expect(onBackdropClick).toHaveBeenCalledTimes(1);
  });

  it('publishes no width property for windows that size to their content', () => {
    // `var(--tool-modal-width)` is then invalid at computed-value time and the
    // width computes to `auto` — the width these windows already had.
    const panelRef = createRef<HTMLDivElement>();

    render(
      <FloatingWindowShell
        isOpen
        title="Content sized"
        onClose={vi.fn()}
        panelRef={panelRef}
        panelStyle={{ maxWidth: '90vw' }}
      >
        <div>Body</div>
      </FloatingWindowShell>
    );

    expect(panelRef.current).toHaveStyle({ maxWidth: '90vw' });
    expect(panelRef.current!.style.getPropertyValue('--tool-modal-width')).toBe('');
    expect(panelRef.current!.style.width).toBe('');
  });

  it('keeps the inline width when the panel class carries no stylesheet hook', () => {
    // The property only becomes a width through `.tool-modal-responsive`. A
    // caller that supplies its own panel class has no such rule, so handing the
    // width over would delete it; the shell leaves it inline instead.
    const panelRef = createRef<HTMLDivElement>();

    render(
      <FloatingWindowShell
        isOpen
        title="Custom class"
        onClose={vi.fn()}
        panelRef={panelRef}
        panelClassName="bg-ds-tertiary rounded-lg"
        panelStyle={{ width: 300 }}
      >
        <div>Body</div>
      </FloatingWindowShell>
    );

    expect(panelRef.current).toHaveStyle({ width: '300px' });
    expect(panelRef.current!.style.getPropertyValue('--tool-modal-width')).toBe('');
  });

  // The stylesheet half of this contract (the rule that turns the published
  // property back into a width) is pinned in toolModalWidthContract.test.ts —
  // it has to read index.css from disk, which only a .ts test can do here.

  it('moves focus into the window on open and back to the opener on close', async () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">Opener</button>
          <FloatingWindowShell isOpen={open} title="Focus target" onClose={vi.fn()}>
            <button type="button">Inside</button>
          </FloatingWindowShell>
        </>
      );
    }

    const { rerender } = render(<Harness open={false} />);
    const opener = screen.getByRole('button', { name: 'Opener' });
    opener.focus();

    rerender(<Harness open />);
    await waitFor(() => expect(screen.getByTitle('Close')).toHaveFocus());

    rerender(<Harness open={false} />);
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('does not close on Escape because the viewer owns global Escape semantics', () => {
    const onClose = vi.fn();

    render(
      <FloatingWindowShell isOpen title="Escape safe" onClose={onClose}>
        <div>Body</div>
      </FloatingWindowShell>
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('forwards panel context-menu events when provided', () => {
    const onPanelContextMenu = vi.fn((event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
    });

    render(
      <FloatingWindowShell
        isOpen
        title="Context surface"
        onClose={vi.fn()}
        onPanelContextMenu={onPanelContextMenu}
      >
        <div>Body</div>
      </FloatingWindowShell>
    );

    fireEvent.contextMenu(screen.getByText('Body'));

    expect(onPanelContextMenu).toHaveBeenCalledTimes(1);
  });
});
