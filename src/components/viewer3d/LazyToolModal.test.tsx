import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LazyToolModal, type ToolModalProps } from './LazyToolModal';
import { FloatingWindowShell } from '../ui/FloatingWindowShell';

function StatefulModal({ isOpen, onClose }: ToolModalProps) {
  const [value, setValue] = useState('draft');
  return <FloatingWindowShell isOpen={isOpen} onClose={onClose} title="Loaded tool">
    <input aria-label="Draft" value={value} onChange={event => setValue(event.target.value)} />
  </FloatingWindowShell>;
}

describe('LazyToolModal', () => {
  it('defers import, retains component state, and restores opener focus after load and close', async () => {
    const load = vi.fn(async () => ({ default: StatefulModal }));
    const close = vi.fn();
    const view = render(<><button>Open tool</button><LazyToolModal title="Test" load={load} isOpen={false} onClose={close} /></>);
    const opener = screen.getByRole('button', { name: 'Open tool' });
    opener.focus();
    expect(load).not.toHaveBeenCalled();
    view.rerender(<><button>Open tool</button><LazyToolModal title="Test" load={load} isOpen onClose={close} /></>);
    await screen.findByRole('textbox', { name: 'Draft' });
    // The loaded content can mount before its passive focus effect runs.
    await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'retained edit' } });
    view.rerender(<><button>Open tool</button><LazyToolModal title="Test" load={load} isOpen={false} onClose={close} /></>);
    expect(opener).toHaveFocus();
    view.rerender(<><button>Open tool</button><LazyToolModal title="Test" load={load} isOpen onClose={close} /></>);
    expect(screen.getByRole('textbox')).toHaveValue('retained edit');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('allows Escape while pending and safely finishes loading while closed', async () => {
    let resolve!: (value: { default: typeof StatefulModal }) => void;
    const load = vi.fn(() => new Promise<{ default: typeof StatefulModal }>(done => { resolve = done; }));
    const close = vi.fn();
    const view = render(<LazyToolModal title="Test" load={load} isOpen onClose={close} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading test');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
    view.rerender(<LazyToolModal title="Test" load={load} isOpen={false} onClose={close} />);
    await act(async () => resolve({ default: StatefulModal }));
    expect(screen.queryByRole('dialog')).toBeNull();
    view.rerender(<LazyToolModal title="Test" load={load} isOpen onClose={close} />);
    expect(screen.getByRole('textbox')).toBeVisible();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('offers explicit reload recovery instead of retrying the cached import, including after reopening', async () => {
    const load = vi.fn().mockRejectedValue(new Error('offline'));
    const close = vi.fn();
    const view = render(<LazyToolModal title="Test" load={load} isOpen onClose={close} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not load');
    expect(screen.getByRole('button', { name: 'Reload viewer' })).toBeEnabled();
    expect(screen.getByText(/Unsaved changes will be lost/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Retry loading' })).toBeNull();
    view.rerender(<LazyToolModal title="Test" load={load} isOpen={false} onClose={close} />);
    view.rerender(<LazyToolModal title="Test" load={load} isOpen onClose={close} />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not load');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps the modal focus policy while loading and after failure, then restores the opener', async () => {
    let reject!: (error: Error) => void;
    const load = () => new Promise<{ default: typeof StatefulModal }>((_resolve, fail) => { reject = fail; });
    const close = vi.fn();
    const view = render(<><button>Before</button><LazyToolModal modal title="Test" load={load} isOpen={false} onClose={close} /></>);
    const opener = screen.getByRole('button', { name: 'Before' });
    opener.focus();
    view.rerender(<><button>Before</button><LazyToolModal modal title="Test" load={load} isOpen onClose={close} /></>);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    const closeButton = screen.getByRole('button', { name: 'Close test' });
    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(closeButton).toHaveFocus();
    await act(async () => reject(new Error('offline')));
    const reload = screen.getByRole('button', { name: 'Reload viewer' });
    reload.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(reload).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    view.rerender(<><button>Before</button><LazyToolModal modal title="Test" load={load} isOpen={false} onClose={close} /></>);
    expect(opener).toHaveFocus();
  });
});
