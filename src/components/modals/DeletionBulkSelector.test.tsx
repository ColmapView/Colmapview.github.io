import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeletionBulkSelector } from './DeletionBulkSelector';
import type { DeletionBulkSelectOption } from './deletionModalViewModel';

const OPTIONS: DeletionBulkSelectOption[] = [
  { value: '1', label: 'Camera 1' },
  { value: '2', label: 'Camera 2' },
];

afterEach(() => {
  cleanup();
});

describe('DeletionBulkSelector', () => {
  it('routes selection changes and disables add while no option is selected', () => {
    const onChange = vi.fn();
    const onAdd = vi.fn();

    const { rerender } = render(
      <DeletionBulkSelector
        label="Select by camera:"
        value=""
        options={OPTIONS}
        placeholder="Choose camera..."
        addTitle="Add all images from this camera"
        onChange={onChange}
        onAdd={onAdd}
      />
    );

    const select = screen.getByRole('combobox', { name: 'Select by camera' });
    const addButton = screen.getByRole('button', { name: 'Add all images from this camera' });

    expect(select).toHaveClass('min-w-0');
    expect(select).toHaveClass('max-w-full');
    expect(addButton).toBeDisabled();

    fireEvent.change(select, { target: { value: '2' } });

    expect(onChange).toHaveBeenCalledWith('2');
    expect(onAdd).not.toHaveBeenCalled();

    rerender(
      <DeletionBulkSelector
        label="Select by camera:"
        value="2"
        options={OPTIONS}
        placeholder="Choose camera..."
        addTitle="Add all images from this camera"
        onChange={onChange}
        onAdd={onAdd}
      />
    );

    expect(screen.getByRole('button', { name: 'Add all images from this camera' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Add all images from this camera' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when there are no options', () => {
    const { container } = render(
      <DeletionBulkSelector
        label="Select by frame:"
        value=""
        options={[]}
        placeholder="Choose frame..."
        addTitle="Add all images from this frame"
        onChange={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
