import { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageDetailMatchOpacityControl } from './ImageDetailMatchOpacityControl';

afterEach(() => {
  cleanup();
});

function getOpacityControlContainer(): HTMLElement {
  const container = screen.getByText('Opacity').parentElement;
  if (!(container instanceof HTMLElement)) {
    throw new Error('Expected opacity control to render in an HTMLElement container');
  }
  return container;
}

describe('ImageDetailMatchOpacityControl', () => {
  it('renders touch opacity state and routes slider changes', () => {
    const setMatchLineOpacity = vi.fn();

    render(
      <ImageDetailMatchOpacityControl
        variant="touch"
        matchLineOpacity={0.7}
        setMatchLineOpacity={setMatchLineOpacity}
      />
    );

    expect(screen.getByText('Opacity')).toBeVisible();
    expect(screen.getByText('70%')).toBeVisible();

    fireEvent.change(screen.getByRole('slider'), { target: { value: '0.4' } });
    expect(setMatchLineOpacity).toHaveBeenCalledWith(0.4);
  });

  it('renders desktop display mode and routes wheel and double-click events', () => {
    const onOpacityWheel = vi.fn();
    const onOpacityDoubleClick = vi.fn();

    render(
      <ImageDetailMatchOpacityControl
        variant="desktop"
        matchLineOpacity={0.5}
        setMatchLineOpacity={vi.fn()}
        isEditingOpacity={false}
        opacityInputRef={createRef<HTMLInputElement>()}
        opacityInputValue="50"
        setOpacityInputValue={vi.fn()}
        onOpacityWheel={onOpacityWheel}
        onOpacityDoubleClick={onOpacityDoubleClick}
        onOpacityBlur={vi.fn()}
        onOpacityKeyDown={vi.fn()}
      />
    );

    fireEvent.wheel(getOpacityControlContainer());
    expect(onOpacityWheel).toHaveBeenCalledOnce();

    fireEvent.doubleClick(screen.getByTitle('Double-click to edit'));
    expect(onOpacityDoubleClick).toHaveBeenCalledOnce();
  });

  it('renders desktop edit mode and routes text input events', () => {
    const setOpacityInputValue = vi.fn();
    const onOpacityBlur = vi.fn();
    const onOpacityKeyDown = vi.fn();

    render(
      <ImageDetailMatchOpacityControl
        variant="desktop"
        matchLineOpacity={0.5}
        setMatchLineOpacity={vi.fn()}
        isEditingOpacity
        opacityInputRef={createRef<HTMLInputElement>()}
        opacityInputValue="50"
        setOpacityInputValue={setOpacityInputValue}
        onOpacityWheel={vi.fn()}
        onOpacityDoubleClick={vi.fn()}
        onOpacityBlur={onOpacityBlur}
        onOpacityKeyDown={onOpacityKeyDown}
      />
    );

    const editor = screen.getByRole('textbox');
    expect(editor).toHaveValue('50');

    fireEvent.change(editor, { target: { value: '65' } });
    fireEvent.keyDown(editor, { key: 'Enter' });
    fireEvent.blur(editor);

    expect(setOpacityInputValue).toHaveBeenCalledWith('65');
    expect(onOpacityKeyDown).toHaveBeenCalledOnce();
    expect(onOpacityBlur).toHaveBeenCalledOnce();
  });
});
