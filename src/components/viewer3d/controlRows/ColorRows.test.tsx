import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ColorPickerRow, HueRow, HueSliderRow } from './ColorRows';
afterEach(cleanup);
it('exposes hex editing as a button and commits keyboard input', () => {
  const onChange = vi.fn();
  render(<ColorPickerRow label="Background" value="#ffffff" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit hex color' }));
  const input = screen.getByRole('textbox', { name: 'Background' });
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: '#112233' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onChange).toHaveBeenCalledWith('#112233');
  expect(screen.getByRole('button', { name: 'Edit hex color' })).toHaveFocus();
});
it.each(['color', 'numeric'])('supports canceling %s hue edits', (kind) => {
  const onChange = vi.fn();
  render(kind === 'color' ? <HueRow label="Hue" value="#ff0000" onChange={onChange} /> : <HueSliderRow label="Hue" value={0} onChange={onChange} />);
  expect(screen.getByRole('slider', { name: 'Hue' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit Hue' }));
  const input = screen.getByRole('textbox', { name: 'Hue' });
  fireEvent.change(input, { target: { value: '120' } });
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Edit Hue' })).toHaveFocus();
});
