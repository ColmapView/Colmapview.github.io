import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DELETED_FILTER } from '../../theme';
import { DeletionModalListItem } from './DeletionModalListItem';

vi.mock('../../hooks/useThumbnail', () => ({
  useThumbnail: () => 'blob:deletion-thumbnail',
}));

afterEach(() => {
  cleanup();
});

describe('DeletionModalListItem', () => {
  it('renders deleted thumbnail state and routes item actions', () => {
    const onView = vi.fn();
    const onRestore = vi.fn();

    render(
      <table>
        <tbody>
          <DeletionModalListItem
            id={7}
            label="#1:7"
            name="deleted.jpg"
            file={undefined}
            onView={onView}
            onRestore={onRestore}
          />
        </tbody>
      </table>
    );

    expect(screen.getByRole('img', { name: 'deleted.jpg' })).toHaveAttribute(
      'src',
      'blob:deletion-thumbnail'
    );
    expect(screen.getByRole('img', { name: 'deleted.jpg' })).toHaveStyle({
      filter: DELETED_FILTER,
    });

    expect(screen.getByText('#1:7')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View deleted.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore deleted.jpg' }));

    expect(onView).toHaveBeenCalledWith(7);
    expect(onRestore).toHaveBeenCalledWith(7);
  });
});
