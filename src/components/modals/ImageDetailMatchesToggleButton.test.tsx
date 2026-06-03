import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageDetailMatchesToggleButton } from './ImageDetailMatchesToggleButton';

afterEach(() => {
  cleanup();
});

describe('ImageDetailMatchesToggleButton', () => {
  it('routes toggle actions for touch and desktop variants', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <ImageDetailMatchesToggleButton
        variant="touch"
        active={false}
        isMarkedForDeletion={false}
        onToggle={onToggle}
      />
    );

    const touchButton = screen.getByRole('button', { name: 'Matches' });
    expect(touchButton).toHaveStyle({ minHeight: '36px' });

    fireEvent.click(touchButton);
    expect(onToggle).toHaveBeenCalledWith(true);

    rerender(
      <ImageDetailMatchesToggleButton
        variant="desktop"
        active
        isMarkedForDeletion={false}
        onToggle={onToggle}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Matches' }));
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it('does not route toggle actions for deleted images', () => {
    const onToggle = vi.fn();
    render(
      <ImageDetailMatchesToggleButton
        variant="desktop"
        active={false}
        isMarkedForDeletion
        onToggle={onToggle}
      />
    );

    const button = screen.getByRole('button', { name: 'Show Matches' });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
