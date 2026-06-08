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
    sortDirection: 'asc' as const,
    sortField: 'name' as const,
    showSplatMetricSort: false,
    touchMode: false,
    viewMode: 'gallery' as const,
    onBorderColorModeChange: vi.fn(),
    onCameraFilterChange: vi.fn(),
    onSortDirectionToggle: vi.fn(),
    onSortFieldChange: vi.fn(),
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

    expect(screen.queryByRole('button', { name: 'Grid view' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'List view' })).toBeNull();
  });
});
