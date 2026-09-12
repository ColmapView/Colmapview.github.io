import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
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

  it('announces failure and retries the loader', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ default: StatefulModal });
    render(<LazyToolModal title="Test" load={load} isOpen onClose={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not load');
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
    expect(await screen.findByRole('textbox')).toHaveValue('draft');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
