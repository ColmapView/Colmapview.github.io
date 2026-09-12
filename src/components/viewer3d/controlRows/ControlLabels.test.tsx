import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToggleRow, SelectRow } from './BasicRows';
import { SliderRow } from './SliderRow';

describe('shared control labels', () => {
  it('activates a switch once from its visible row label', () => {
    const onChange = vi.fn();
    render(<ToggleRow label="Show cameras" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByText('Show cameras'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('associates a select with its visible label', () => {
    render(<SelectRow label="Projection" value="perspective" onChange={vi.fn()}
      options={[{ value: 'perspective', label: 'Perspective' }]} />);
    expect(screen.getByLabelText('Projection')).toBe(screen.getByRole('combobox'));
  });

  it('names the slider and restores focus after editing its value', () => {
    const onChange = vi.fn();
    render(<SliderRow label="Opacity" value={0.5} min={0} max={1} step={0.1} onChange={onChange} />);
    expect(screen.getByLabelText('Opacity')).toBe(screen.getByRole('slider'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Opacity' }));
    const input = screen.getByRole('textbox', { name: 'Opacity' });
    fireEvent.change(input, { target: { value: '0.8' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(0.8);
    expect(screen.getByRole('button', { name: 'Edit Opacity' })).toHaveFocus();
  });
});
