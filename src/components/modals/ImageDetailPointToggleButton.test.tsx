import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageDetailPointToggleButton } from './ImageDetailPointToggleButton';

afterEach(() => {
  cleanup();
});

describe('ImageDetailPointToggleButton', () => {
  it('routes the next point visibility state and applies touch sizing', () => {
    const onToggle = vi.fn();
    render(
      <ImageDetailPointToggleButton
        variant="touch"
        label="2D"
        count={5}
        inactiveCountClass="text-ds-success"
        active={false}
        isMarkedForDeletion={false}
        onToggle={onToggle}
      />
    );

    const button = screen.getByRole('button', { name: '2D (5)' });
    expect(button).toHaveStyle({ minHeight: '36px' });

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('does not route point visibility changes for deleted images', () => {
    const onToggle = vi.fn();
    render(
      <ImageDetailPointToggleButton
        variant="desktop"
        label="Points3D"
        count={3}
        inactiveCountClass="text-ds-error"
        active={false}
        isMarkedForDeletion
        onToggle={onToggle}
      />
    );

    const button = screen.getByRole('button', { name: 'Points3D (3)' });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
