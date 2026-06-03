import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageDetailNavigationControls } from './ImageDetailNavigationControls';

afterEach(() => {
  cleanup();
});

describe('ImageDetailNavigationControls', () => {
  it('renders touch navigation state and routes enabled navigation actions', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();

    render(
      <ImageDetailNavigationControls
        variant="touch"
        hasPrev={false}
        hasNext
        currentIndex={1}
        imageCount={3}
        onPrev={onPrev}
        onNext={onNext}
      />
    );

    const previousButton = screen.getByRole('button', { name: /prev/i });
    const nextButton = screen.getByRole('button', { name: /next/i });

    expect(previousButton).toBeDisabled();
    expect(previousButton).toHaveStyle({ minHeight: '36px' });
    expect(nextButton).toBeEnabled();
    expect(nextButton).toHaveStyle({ minHeight: '36px' });
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    fireEvent.click(previousButton);
    fireEvent.click(nextButton);

    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('renders desktop navigation with jump input and routes valid image ids', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const onOpenImageId = vi.fn();

    render(
      <ImageDetailNavigationControls
        variant="desktop"
        hasPrev
        hasNext={false}
        imageDetailId={7}
        imageCount={12}
        onPrev={onPrev}
        onNext={onNext}
        onOpenImageId={onOpenImageId}
        imageExists={(imageId) => imageId === 8}
      />
    );

    const previousButton = screen.getByRole('button', { name: /prev/i });
    const nextButton = screen.getByRole('button', { name: /next/i });
    const jumpInput = screen.getByRole('textbox');

    expect(previousButton).toBeEnabled();
    expect(nextButton).toBeDisabled();
    expect(jumpInput).toHaveValue('7');
    expect(screen.getByText('12')).toBeInTheDocument();

    fireEvent.click(previousButton);
    fireEvent.click(nextButton);
    fireEvent.change(jumpInput, { target: { value: '8' } });
    fireEvent.keyDown(jumpInput, { key: 'Enter' });

    expect(onPrev).toHaveBeenCalledOnce();
    expect(onNext).not.toHaveBeenCalled();
    expect(onOpenImageId).toHaveBeenCalledWith(8);
  });
});
