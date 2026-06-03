import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopDropZonePanel, TouchDropZonePanel } from './DropZonePanels';

vi.mock('./ProfileDropdown', () => ({
  ProfileDropdown: () => <div data-testid="profile-dropdown" />,
}));

function createDesktopProps() {
  return {
    urlLoading: false,
    onOpenUrlModal: vi.fn(),
    onOpenManifestFile: vi.fn(),
    onLoadToy: vi.fn(),
    onBrowse: vi.fn(),
    onUploadConfig: vi.fn(),
    onResetConfig: vi.fn(),
    onDismiss: vi.fn(),
    onOpenExampleDataset: vi.fn(),
    onDownloadExampleManifest: vi.fn(),
  };
}

describe('DropZone panels', () => {
  it('renders desktop actions and routes button events', () => {
    const props = createDesktopProps();
    render(<DesktopDropZonePanel {...props} />);

    fireEvent.click(screen.getByText('+'));
    fireEvent.click(screen.getByRole('button', { name: /Load URL/i }));
    fireEvent.click(screen.getByRole('button', { name: /Load JSON/i }));
    fireEvent.click(screen.getByRole('button', { name: /Try a Toy!/i }));
    fireEvent.click(screen.getByRole('button', { name: '×' }));

    expect(props.onBrowse).toHaveBeenCalledTimes(1);
    expect(props.onOpenUrlModal).toHaveBeenCalledTimes(1);
    expect(props.onOpenManifestFile).toHaveBeenCalledTimes(1);
    expect(props.onLoadToy).toHaveBeenCalledTimes(1);
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('routes desktop secondary context actions', () => {
    const props = createDesktopProps();
    render(<DesktopDropZonePanel {...props} />);

    fireEvent.contextMenu(screen.getByRole('button', { name: /Load URL/i }));
    fireEvent.contextMenu(screen.getByRole('button', { name: /Load JSON/i }));

    expect(props.onOpenExampleDataset).toHaveBeenCalledTimes(1);
    expect(props.onDownloadExampleManifest).toHaveBeenCalledTimes(1);
  });

  it('shows desktop hover help for URL loading', () => {
    render(<DesktopDropZonePanel {...createDesktopProps()} />);

    fireEvent.mouseEnter(screen.getByRole('button', { name: /Load URL/i }));

    expect(screen.getByText('Load from URL')).toBeVisible();
    expect(screen.getByText(/Supports: S3, GCS, R2/)).toBeVisible();
  });

  it('renders touch actions and routes callbacks', () => {
    const onOpenUrlModal = vi.fn();
    const onLoadToy = vi.fn();
    const onDismiss = vi.fn();

    render(
      <TouchDropZonePanel
        urlLoading={false}
        onOpenUrlModal={onOpenUrlModal}
        onLoadToy={onLoadToy}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Load from URL/i }));
    fireEvent.click(screen.getByRole('button', { name: /Try a Toy!/i }));
    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }));

    expect(onOpenUrlModal).toHaveBeenCalledTimes(1);
    expect(onLoadToy).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
