import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageGalleryToolbar } from './ImageGalleryToolbar';

const cameras = [
  { cameraId: 1, width: 800, height: 600 },
  { cameraId: 2, width: 1024, height: 768 },
];

function renderToolbar(overrides = {}) {
  const props = {
    borderColorMode: 'none' as const,
    cameraFilter: 'all' as const,
    cameras,
    hasMasks: true,
    sortDirection: 'asc' as const,
    sortField: 'name' as const,
    showSplatMetricSort: false,
    thumbnailDisplayMode: 'image' as const,
    touchMode: false,
    viewMode: 'gallery' as const,
    onBorderColorModeChange: vi.fn(),
    onCameraFilterChange: vi.fn(),
    onSortDirectionToggle: vi.fn(),
    onSortFieldChange: vi.fn(),
    onThumbnailDisplayModeChange: vi.fn(),
    onViewModeChange: vi.fn(),
    ...overrides,
  };

  render(<ImageGalleryToolbar {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
});

describe('ImageGalleryToolbar', () => {
  it('uses balanced grid areas for constrained-width toolbar rows', () => {
    renderToolbar();

    expect(screen.getByTestId('image-gallery-toolbar')).toHaveClass('image-gallery-toolbar', 'h-auto');
    expect(screen.getByLabelText('Camera filter')).toHaveClass('image-gallery-toolbar__camera');
    expect(screen.getByLabelText('Sort field')).toHaveClass('image-gallery-toolbar__sort');
    expect(screen.getByLabelText('Sort field').parentElement).toHaveClass('image-gallery-toolbar__sort-group');
    expect(screen.getByRole('button', { name: 'Toggle sort direction' })).toHaveClass('image-gallery-toolbar__direction');
    expect(screen.getByRole('button', { name: 'Toggle sort direction' }).parentElement).toBe(screen.getByLabelText('Sort field').parentElement);
    expect(screen.getByLabelText('Border color')).toHaveClass('image-gallery-toolbar__border');
    expect(screen.getByLabelText('Thumbnail display')).toHaveClass('image-gallery-toolbar__display');
    expect(screen.getByRole('button', { name: 'Grid view' }).parentElement).toHaveClass('image-gallery-toolbar__view');
  });

  it('uses intrinsic-width dropdown styling', () => {
    renderToolbar();

    expect(screen.getByLabelText('Camera filter')).toHaveClass('image-gallery-toolbar__select');
    expect(screen.getByLabelText('Sort field')).toHaveClass('image-gallery-toolbar__select');
    expect(screen.getByLabelText('Border color')).toHaveClass('image-gallery-toolbar__select');
    expect(screen.getByLabelText('Thumbnail display')).toHaveClass('image-gallery-toolbar__select');
  });

  it('renders camera options and reports camera filter changes', () => {
    const props = renderToolbar();

    expect(screen.getByRole('option', { name: 'All Cams (2)' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Cam 2 (1024×768)' })).toBeVisible();

    fireEvent.change(screen.getByLabelText('Camera filter'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Camera filter'), {
      target: { value: 'all' },
    });

    expect(props.onCameraFilterChange).toHaveBeenNthCalledWith(1, 2);
    expect(props.onCameraFilterChange).toHaveBeenNthCalledWith(2, 'all');
  });

  it('ignores unsupported raw camera filter changes', () => {
    const props = renderToolbar();

    fireEvent.change(screen.getByLabelText('Camera filter'), {
      target: { value: '999' },
    });

    expect(props.onCameraFilterChange).not.toHaveBeenCalled();
  });

  it('reports sort field and direction changes', () => {
    const props = renderToolbar({ sortDirection: 'desc' });

    expect(screen.queryByRole('option', { name: 'Sort: PSNR' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Sort field'), {
      target: { value: 'avgError' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sort direction' }));

    expect(props.onSortFieldChange).toHaveBeenCalledWith('avgError');
    expect(props.onSortDirectionToggle).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Toggle sort direction' })).toHaveAttribute('data-tooltip', 'Descending');
  });

  it('reports border color mode changes', () => {
    const props = renderToolbar();

    expect(screen.getByRole('option', { name: 'Border: None' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Border: Camera' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Border: PSNR' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Border: SSIM' })).toBeVisible();

    fireEvent.change(screen.getByLabelText('Border color'), {
      target: { value: 'camera' },
    });
    fireEvent.change(screen.getByLabelText('Border color'), {
      target: { value: 'psnr' },
    });

    expect(props.onBorderColorModeChange).toHaveBeenNthCalledWith(1, 'camera');
    expect(props.onBorderColorModeChange).toHaveBeenNthCalledWith(2, 'psnr');
  });

  it('reports thumbnail display mode changes', () => {
    const props = renderToolbar();

    expect(screen.getByRole('option', { name: 'Show: Image' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Show: Masked Image' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Show: Inverse Masked' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Show: Mask' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Show: Hover Mask' })).toBeVisible();

    fireEvent.change(screen.getByLabelText('Thumbnail display'), {
      target: { value: 'maskedImage' },
    });
    fireEvent.change(screen.getByLabelText('Thumbnail display'), {
      target: { value: 'mask' },
    });
    fireEvent.change(screen.getByLabelText('Thumbnail display'), {
      target: { value: 'inverseMaskedImage' },
    });
    fireEvent.change(screen.getByLabelText('Thumbnail display'), {
      target: { value: 'hoverMask' },
    });

    expect(props.onThumbnailDisplayModeChange).toHaveBeenNthCalledWith(1, 'maskedImage');
    expect(props.onThumbnailDisplayModeChange).toHaveBeenNthCalledWith(2, 'mask');
    expect(props.onThumbnailDisplayModeChange).toHaveBeenNthCalledWith(3, 'inverseMaskedImage');
    expect(props.onThumbnailDisplayModeChange).toHaveBeenNthCalledWith(4, 'hoverMask');
  });

  it('keeps mask thumbnail display options disabled without masks', () => {
    renderToolbar({ hasMasks: false });

    expect(screen.getByRole('option', { name: 'Show: Image' })).not.toBeDisabled();
    expect(screen.getByRole('option', { name: 'Show: Masked Image' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Show: Inverse Masked' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Show: Mask' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Show: Hover Mask' })).toBeDisabled();
  });

  it('exposes PSNR and SSIM sorting only after splat metrics are available', () => {
    const props = renderToolbar({ showSplatMetricSort: true });

    expect(screen.getByRole('option', { name: 'Sort: PSNR' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Sort: SSIM' })).toBeVisible();

    fireEvent.change(screen.getByLabelText('Sort field'), {
      target: { value: 'splatPsnr' },
    });
    fireEvent.change(screen.getByLabelText('Sort field'), {
      target: { value: 'splatSsim' },
    });

    expect(props.onSortFieldChange).toHaveBeenCalledWith('splatPsnr');
    expect(props.onSortFieldChange).toHaveBeenCalledWith('splatSsim');
  });

  it('renders desktop view mode controls and hides them in touch mode', () => {
    const props = renderToolbar({ viewMode: 'list' });

    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));

    expect(props.onViewModeChange).toHaveBeenNthCalledWith(1, 'gallery');
    expect(props.onViewModeChange).toHaveBeenNthCalledWith(2, 'list');

    cleanup();
    renderToolbar({ touchMode: true });

    expect(screen.getByTestId('image-gallery-toolbar')).toHaveClass('image-gallery-toolbar--touch');
    expect(screen.queryByRole('button', { name: 'Grid view' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'List view' })).toBeNull();
  });
});
