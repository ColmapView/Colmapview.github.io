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
    exportProgress: null,
    onCancelExport: vi.fn(),
    hasCameras: true,
    hasPendingDeletions: true,
    hasReconstruction: true,
    cameraModelSummary: '2x Pinhole',
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
    onCancelImages: vi.fn(),
    onCancelMasks: vi.fn(),
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
  it('shows COLMAP progress and cancellation instead of another download action', () => {
    const props = createReconstructionProps({ exportProgress: 85, exportFormat: 'zip-images', onSaveToFile: vi.fn() });
    render(<ExportReconstructionSection {...props} />);
    expect(screen.getByRole('progressbar', { name: 'Export COLMAP' })).toHaveAttribute('aria-valuenow', '85');
    expect(screen.queryByRole('button', { name: 'Download COLMAP' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save ZIP to file' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel COLMAP export' }));
    expect(props.onCancelExport).toHaveBeenCalledOnce();
  });

  it.each(['zip-images', 'zip-masks'] as const)('offers direct saving alongside ordinary downloads for %s', format => {
    const props = createReconstructionProps({ exportFormat: format, onSaveToFile: vi.fn() });
    render(<ExportReconstructionSection {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save ZIP to file' }));
    expect(props.onSaveToFile).toHaveBeenCalledOnce(); expect(props.onDownload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Download COLMAP' }));
    expect(props.onDownload).toHaveBeenCalledOnce();
  });

  it('disables both package actions without a reconstruction', () => {
    render(<ExportReconstructionSection {...createReconstructionProps({
      exportFormat: 'zip-images', hasReconstruction: false, onSaveToFile: vi.fn(),
    })} />);
    expect(screen.getByRole('button', { name: 'Save ZIP to file' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download COLMAP' })).toBeDisabled();
  });

  it('hides direct saving for model formats and unsupported browsers', () => {
    const { rerender } = render(<ExportReconstructionSection {...createReconstructionProps({ onSaveToFile: vi.fn() })} />);
    expect(screen.queryByRole('button', { name: 'Save ZIP to file' })).toBeNull();
    rerender(<ExportReconstructionSection {...createReconstructionProps({ exportFormat: 'zip-images' })} />);
    expect(screen.queryByRole('button', { name: 'Save ZIP to file' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Download COLMAP' })).toBeEnabled();
  });

  it('keeps image and mask cancellation available while preparing the ZIP', () => {
    const props = createMediaProps({ imageExportProgress: 100, maskExportProgress: 25 });
    render(<ExportMediaSection {...props} />);
    expect(screen.getByText('Creating ZIP...')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel images export' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel masks export' }));
    expect(props.onCancelImages).toHaveBeenCalledOnce();
    expect(props.onCancelMasks).toHaveBeenCalledOnce();
  });

  it('routes reconstruction format and action callbacks', () => {
    const props = createReconstructionProps();
    render(<ExportReconstructionSection {...props} />);

    expect(screen.getByText('COLMAP text format. Human-readable, useful for debugging.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Convert Camera Model' })).toHaveAttribute('title', '2x Pinhole');
    expect(screen.getByRole('button', { name: 'Delete Images from Model (2)' })).toBeVisible();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zip' } });
    fireEvent.click(screen.getByRole('button', { name: 'Convert Camera Model' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Images from Model (2)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download COLMAP' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download Splat File' }));

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
    expect(screen.queryByRole('button', { name: 'Download Splat File' })).toBeNull();
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
    expect(screen.getByRole('progressbar', { name: 'Export images' })).toHaveAttribute('aria-valuenow', '35');
    expect(screen.getByRole('progressbar', { name: 'Export masks' })).toHaveAttribute('aria-valuenow', '70');
    expect(screen.queryByRole('button', { name: 'Download Images' })).toBeNull();

    cleanup();
    render(<ExportMediaSection {...createMediaProps({ hasImages: false })} />);

    expect(screen.getByText('No images available')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Download Images' })).toBeNull();
  });

  it('keeps mask download available when RGB photos are missing', () => {
    const props = createMediaProps({ hasImages: false, hasMasks: true });
    render(<ExportMediaSection {...props} />);
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download Images' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Download Masks' }));
    expect(props.onExportMasks).toHaveBeenCalledOnce();
  });

  it('keeps mask export progress and cancellation available without RGB photos', () => {
    const props = createMediaProps({ hasImages: false, hasMasks: true, maskExportProgress: 50 });
    render(<ExportMediaSection {...props} />);
    expect(screen.getByRole('progressbar', { name: 'Export masks' })).toHaveAttribute('aria-valuenow', '50');
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(props.onCancelMasks).toHaveBeenCalledOnce();
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
