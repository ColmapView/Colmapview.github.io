import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopDropZonePanel, TouchDropZonePanel } from './DropZonePanels';
import {
  DROP_ZONE_BROWSE_LABEL,
  DROP_ZONE_DISMISS_TOOLTIP,
  DROP_ZONE_RESET_CONFIG_TOOLTIP,
  DROP_ZONE_UPLOAD_CONFIG_TOOLTIP,
} from './dropZonePanelViewModel';

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
  it('shows action guidance on keyboard focus and dismisses it with Escape', () => {
    render(<DesktopDropZonePanel {...createDesktopProps()} />);
    const toy = screen.getByRole('button', { name: 'Try a Toy!' });
    fireEvent.focus(toy);
    expect(screen.getByText('Right-click: open example dataset')).toBeVisible();
    fireEvent.keyDown(toy, { key: 'Escape' });
    expect(screen.queryByText('Right-click: open example dataset')).not.toBeInTheDocument();
    const manifest = screen.getByRole('button', { name: 'Load manifest' });
    fireEvent.focus(manifest);
    expect(screen.getByText('Right-click: download example manifest')).toBeVisible();
    fireEvent.blur(manifest);
    expect(screen.queryByText('Right-click: download example manifest')).not.toBeInTheDocument();
  });

  it('keeps format guidance in hover and keyboard help', () => {
    render(<DesktopDropZonePanel {...createDesktopProps()} />);
    const info = screen.getByRole('button', { name: 'Supported files and folder structure' });
    expect(screen.queryByText('Drop folder or ZIP file')).not.toBeInTheDocument();
    fireEvent.mouseEnter(info);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Drop folder or ZIP file');
    expect(screen.getByRole('tooltip')).toHaveTextContent('ZIP: max 2GB');
    fireEvent.mouseLeave(info.parentElement!);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.focus(info);
    expect(info).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
    fireEvent.keyDown(info, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(info);
    expect(screen.getByRole('tooltip')).toBeVisible();
    fireEvent.blur(info, { relatedTarget: document.body });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('renders desktop actions and routes button events', () => {
    const props = createDesktopProps();
    render(<DesktopDropZonePanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: DROP_ZONE_BROWSE_LABEL }));
    fireEvent.click(screen.getByRole('button', { name: /Load URL/i }));
    fireEvent.click(screen.getByRole('button', { name: /Load manifest/i }));
    fireEvent.click(screen.getByRole('button', { name: /Try a Toy!/i }));
    fireEvent.click(screen.getByRole('button', { name: DROP_ZONE_DISMISS_TOOLTIP }));

    expect(props.onBrowse).toHaveBeenCalledTimes(1);
    expect(props.onOpenUrlModal).toHaveBeenCalledTimes(1);
    expect(props.onOpenManifestFile).toHaveBeenCalledTimes(1);
    expect(props.onLoadToy).toHaveBeenCalledTimes(1);
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('exposes the desktop config icon buttons by accessible name', () => {
    const props = createDesktopProps();
    render(<DesktopDropZonePanel {...props} />);

    fireEvent.click(screen.getByRole('button', { name: DROP_ZONE_UPLOAD_CONFIG_TOOLTIP }));
    fireEvent.click(screen.getByRole('button', { name: DROP_ZONE_RESET_CONFIG_TOOLTIP }));

    expect(props.onUploadConfig).toHaveBeenCalledTimes(1);
    expect(props.onResetConfig).toHaveBeenCalledTimes(1);
  });

  it('routes desktop secondary context actions', () => {
    const props = createDesktopProps();
    render(<DesktopDropZonePanel {...props} />);

    fireEvent.contextMenu(screen.getByRole('button', { name: /Try a Toy!/i }));
    fireEvent.contextMenu(screen.getByRole('button', { name: /Load manifest/i }));

    expect(props.onOpenExampleDataset).toHaveBeenCalledTimes(1);
    expect(props.onDownloadExampleManifest).toHaveBeenCalledTimes(1);
  });

  it('highlights example shortcuts in hover help without extra buttons', () => {
    render(<DesktopDropZonePanel {...createDesktopProps()} />);
    expect(screen.queryByRole('button', { name: 'Open example dataset' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download example manifest' })).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Try a Toy!/i }));
    expect(screen.getByText('Right-click: open example dataset')).toBeVisible();
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Load manifest/i }));
    expect(screen.getByText('Right-click: download example manifest')).toBeVisible();
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
