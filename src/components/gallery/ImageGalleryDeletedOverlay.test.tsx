import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ImageGalleryDeletedOverlay } from './ImageGalleryDeletedOverlay';

describe('ImageGalleryDeletedOverlay', () => {
  it('renders two diagonal deletion strokes with default list-item styling', () => {
    const { container } = render(<ImageGalleryDeletedOverlay />);

    const overlay = screen.getByTestId('image-gallery-deleted-overlay');
    expect(overlay).toHaveClass('absolute', 'inset-0', 'pointer-events-none');

    const lines = Array.from(container.querySelectorAll('line'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveAttribute('x1', '0');
    expect(lines[0]).toHaveAttribute('y1', '0');
    expect(lines[0]).toHaveAttribute('x2', '100');
    expect(lines[0]).toHaveAttribute('y2', '100');
    expect(lines[1]).toHaveAttribute('x1', '100');
    expect(lines[1]).toHaveAttribute('y1', '0');
    expect(lines[1]).toHaveAttribute('x2', '0');
    expect(lines[1]).toHaveAttribute('y2', '100');
    expect(lines.every((line) => line.getAttribute('stroke-width') === '2')).toBe(true);
  });

  it('allows gallery tiles to use a stronger stacking class and thinner stroke', () => {
    const { container } = render(
      <ImageGalleryDeletedOverlay
        className="absolute inset-0 pointer-events-none z-20"
        strokeWidth={1.5}
      />
    );

    expect(screen.getByTestId('image-gallery-deleted-overlay')).toHaveClass('z-20');
    expect(Array.from(container.querySelectorAll('line')).every((line) => line.getAttribute('stroke-width') === '1.5')).toBe(true);
  });
});
