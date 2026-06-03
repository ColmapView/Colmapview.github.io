import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ExportMediaSection,
  ExportReconstructionSection,
  ExportReloadSection,
  type ExportMediaSectionProps,
  type ExportReconstructionSectionProps,
  type ExportReloadSectionProps,
} from './ExportPanelSections';

afterEach(() => {
  cleanup();
});

function createReconstructionProps(
  overrides: Partial<ExportReconstructionSectionProps> = {}
): ExportReconstructionSectionProps {
  return {
    exportFormat: 'text',
    hasCameras: true,
    hasPendingDeletions: true,
    hasReconstruction: true,
    cameraModelSummary: '2x OpenCV K',
    pendingDeletionCount: 2,
    onExportFormatChange: vi.fn(),
    onOpenConversionModal: vi.fn(),
    onOpenDeletionModal: vi.fn(),
    onDownload: vi.fn(),
    onDownloadSplat: vi.fn(),
    hasSplatFile: true,
    ...overrides,
  };
}

function createMediaProps(
  overrides: Partial<ExportMediaSectionProps> = {}
): ExportMediaSectionProps {
  return {
    hasImages: true,
    hasMasks: true,
    imageExportProgress: null,
    jpegQuality: 85,
    maskExportProgress: null,
    onExportImages: vi.fn(),
    onExportMasks: vi.fn(),
    onJpegQualityChange: vi.fn(),
    ...overrides,
  };
}

function createReloadProps(
  overrides: Partial<ExportReloadSectionProps> = {}
): ExportReloadSectionProps {
  return {
    canReload: true,
    onReload: vi.fn(),
    ...overrides,
  };
}

describe('ExportPanelSections', () => {
  it('routes reconstruction format and action callbacks', () => {
    const props = createReconstructionProps();
    render(<ExportReconstructionSection {...props} />);

    expect(screen.getByText('COLMAP text format. Human-readable, useful for debugging.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Convert Camera Model' })).toHaveAttribute('title', '2x OpenCV K');
    expect(screen.getByRole('button', { name: 'Delete Images from Model (2)' })).toBeVisible();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zip' } });
    fireEvent.click(screen.getByRole('button', { name: 'Convert Camera Model' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Images from Model (2)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download COLMAP' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download Splat PLY' }));

    expect(props.onExportFormatChange).toHaveBeenCalledWith('zip');
    expect(props.onOpenConversionModal).toHaveBeenCalledTimes(1);
    expect(props.onOpenDeletionModal).toHaveBeenCalledTimes(1);
    expect(props.onDownload).toHaveBeenCalledTimes(1);
    expect(props.onDownloadSplat).toHaveBeenCalledTimes(1);
  });

  it('hides conversion, disables COLMAP download, and hides splat download when files are unavailable', () => {
    render(<ExportReconstructionSection {...createReconstructionProps({
      hasCameras: false,
      hasPendingDeletions: false,
      hasReconstruction: false,
      hasSplatFile: false,
      pendingDeletionCount: 0,
    })} />);

    expect(screen.queryByRole('button', { name: 'Convert Camera Model' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete Images from Model' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Download COLMAP' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Download Splat PLY' })).toBeNull();
  });

  it('routes media quality, image export, and mask export callbacks', () => {
    const props = createMediaProps();
    render(<ExportMediaSection {...props} />);

    fireEvent.change(screen.getByRole('slider'), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download Images' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download Masks' }));

    expect(props.onJpegQualityChange).toHaveBeenCalledWith(90);
    expect(props.onExportImages).toHaveBeenCalledTimes(1);
    expect(props.onExportMasks).toHaveBeenCalledTimes(1);
  });

  it('shows media progress and empty-image states', () => {
    render(<ExportMediaSection {...createMediaProps({
      imageExportProgress: 35,
      maskExportProgress: 70,
    })} />);

    expect(screen.getByText('Exporting images... 35%')).toBeVisible();
    expect(screen.getByText('Exporting masks... 70%')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Download Images' })).toBeNull();

    cleanup();
    render(<ExportMediaSection {...createMediaProps({ hasImages: false })} />);

    expect(screen.getByText('No images available')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Download Images' })).toBeNull();
  });

  it('routes reload and disables it without original files', () => {
    const props = createReloadProps();
    render(<ExportReloadSection {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(props.onReload).toHaveBeenCalledTimes(1);

    cleanup();
    render(<ExportReloadSection {...createReloadProps({ canReload: false })} />);

    expect(screen.getByRole('button', { name: 'Reload' })).toBeDisabled();
  });
});
