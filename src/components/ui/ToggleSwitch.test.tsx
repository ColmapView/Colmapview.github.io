import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToggleSwitch } from './ToggleSwitch';

describe('ToggleSwitch', () => {
  it('handles activation keys once and ignores key repeat', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch label="Show images" checked={false} onChange={onChange} />);
    const control = screen.getByRole('switch');
    fireEvent.keyDown(control, { key: ' ' });
    fireEvent.keyDown(control, { key: ' ', repeat: true });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
    onChange.mockClear();
    fireEvent.keyDown(control, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('activates once when its label is clicked', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch label="Show images" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByText('Show images'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(screen.getByRole('switch', { name: 'Show images' })).toHaveAttribute('aria-checked', 'false');
  });

  it('supports the enclosing editor row as its accessible label and click target', () => {
    const onChange = vi.fn();
    render(<label><span>Reset View</span><ToggleSwitch checked onChange={onChange} /></label>);
    fireEvent.click(screen.getByText('Reset View'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(screen.getByRole('switch', { name: 'Reset View' })).toHaveAttribute('type', 'button');
  });

  it('does not activate a disabled switch through its label', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch label="Show images" checked disabled onChange={onChange} />);
    fireEvent.click(screen.getByText('Show images'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});
