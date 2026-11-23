import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TouchGalleryDrawer } from './TouchGalleryDrawer';

vi.mock('../gallery/ImageGallery', () => ({
  ImageGallery: () => (
    <div>
      <button type="button">First action</button>
      <button type="button">Last action</button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
});

describe('TouchGalleryDrawer', () => {
  it('moves focus into the drawer, traps Tab, closes on Escape, and restores opener focus', async () => {
    const onClose = vi.fn();
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">Open gallery</button>
          {open && <TouchGalleryDrawer onClose={onClose} />}
        </>
      );
    }

    const { rerender } = render(<Harness open={false} />);
    const opener = screen.getByRole('button', { name: 'Open gallery' });
    opener.focus();

    rerender(<Harness open />);
    const first = screen.getByRole('button', { name: 'First action' });
    const last = screen.getByRole('button', { name: 'Last action' });
    await waitFor(() => expect(first).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Harness open={false} />);
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
