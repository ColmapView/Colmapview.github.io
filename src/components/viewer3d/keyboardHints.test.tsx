import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KeyboardHintsProvider, KeyboardOnly, TouchOnly, stripKeyHints } from './keyboardHints';
import { SelectRow, ToggleRow } from './controlRows/BasicRows';

describe('keyboard hints', () => {
  it('strips single-key hotkey hints but keeps other parentheses', () => {
    expect(stripKeyHints('Horizon Lock (H)')).toBe('Horizon Lock');
    expect(stripKeyHints('Transform (T): Off')).toBe('Transform: Off');
    expect(stripKeyHints('Rig (no data loaded)')).toBe('Rig (no data loaded)');
  });

  it('hides keyboard-only content and hotkey suffixes for touch', () => {
    render(
      <KeyboardHintsProvider value={false}>
        <KeyboardOnly><span>WASD Speed</span></KeyboardOnly>
        <TouchOnly><span>About</span></TouchOnly>
        <ToggleRow label="Gizmo (T)" checked={false} onChange={() => {}} />
        <SelectRow label="Horizon Lock (H)" value="a" onChange={() => {}} options={[{ value: 'a', label: 'A' }]} />
      </KeyboardHintsProvider>
    );

    expect(screen.queryByText('WASD Speed')).toBeNull();
    expect(screen.getByText('About')).toBeTruthy();
    expect(screen.getByText('Gizmo')).toBeTruthy();
    expect(screen.getByText('Horizon Lock')).toBeTruthy();
  });

  it('keeps everything by default', () => {
    render(<><KeyboardOnly><span>WASD Speed</span></KeyboardOnly><TouchOnly><span>About</span></TouchOnly><ToggleRow label="Gizmo (T)" checked={false} onChange={() => {}} /></>);

    expect(screen.getByText('WASD Speed')).toBeTruthy();
    expect(screen.queryByText('About')).toBeNull();
    expect(screen.getByText('Gizmo (T)')).toBeTruthy();
  });
});
