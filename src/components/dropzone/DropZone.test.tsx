import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DropZone } from './DropZone';
import { useUrlLoader } from '../../hooks/useUrlLoader';
import { useDropZoneStoreFacade } from './useDropZoneStoreFacade';
import { useReconstructionStore } from '../../store/reconstructionStore';
import { buildLoadedFiles } from '../../test/builders';

const selectedUrl = 'https://drive.google.com/file/d/1DpE-bfPPIVp7TwZeMyhmisfEwCrJ0QDd/view?resourcekey=shared-key';

vi.mock('../../hooks/useFileDropzone', () => ({
  useFileDropzone: () => ({ handleDrop: vi.fn(), handleDragOver: vi.fn(), handleBrowse: vi.fn() }),
}));
vi.mock('../../hooks/useUrlLoader', () => ({ useUrlLoader: vi.fn() }));
vi.mock('./useDropZoneStoreFacade', () => ({ useDropZoneStoreFacade: vi.fn() }));
vi.mock('./DropZonePanels', () => ({
  DesktopDropZonePanel: ({ onLoadGoogleDriveArchive }: { onLoadGoogleDriveArchive: (url: string) => void }) =>
    <button type="button" onClick={() => onLoadGoogleDriveArchive(selectedUrl)}>Select desktop Drive archive</button>,
  TouchDropZonePanel: ({ onLoadGoogleDriveArchive }: { onLoadGoogleDriveArchive: (url: string) => void }) =>
    <button type="button" onClick={() => onLoadGoogleDriveArchive(selectedUrl)}>Select touch Drive archive</button>,
}));

beforeEach(() => {
  useReconstructionStore.getState().clear();
  vi.mocked(useDropZoneStoreFacade).mockReturnValue({
    data: { error: null, reconstruction: null, touchMode: false, hasUrlLoadRequest: false },
    actions: { setError: vi.fn(), clear: vi.fn() },
  });
});
afterEach(() => { cleanup(); useReconstructionStore.getState().clear(); vi.clearAllMocks(); });

describe('DropZone Drive selection loading', () => {
  it.each([false, true])('uses the existing URL loader for selected archives with touch mode %s', async touchMode => {
    const loadFromUrl = vi.fn().mockResolvedValue(true);
    const setUrlLoading = vi.fn();
    const setUrlProgress = vi.fn();
    vi.mocked(useUrlLoader).mockReturnValue({
      loadFromUrl, loadFromManifest: vi.fn(), urlLoading: false, urlProgress: null,
      urlError: null, clearUrlError: vi.fn(), setUrlLoading, setUrlProgress,
    });
    vi.mocked(useDropZoneStoreFacade).mockReturnValue({
      data: { error: null, reconstruction: null, touchMode, hasUrlLoadRequest: false },
      actions: { setError: vi.fn(), clear: vi.fn() },
    });
    render(<DropZone><div>Viewer</div></DropZone>);
    const initialSplatSelectionRevision = useReconstructionStore.getState().splatSelectionRevision;
    fireEvent.click(screen.getByRole('button', { name: `Select ${touchMode ? 'touch' : 'desktop'} Drive archive` }));
    expect(setUrlLoading).toHaveBeenCalledExactlyOnceWith(true);
    expect(setUrlProgress).toHaveBeenCalledExactlyOnceWith({ percent: 0, message: 'Starting...' });
    await waitFor(() => expect(loadFromUrl).toHaveBeenCalledExactlyOnceWith(selectedUrl, { initialSplatSelectionRevision }));
    expect(screen.queryByRole('dialog', { name: 'Load from URL' })).not.toBeInTheDocument();
  });
});

describe('DropZone preparation cancellation', () => {
  it('forwards the selection revision from before manifest reading to the loader', async () => {
    useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles());
    let resolve!: (content: string) => void;
    const read = vi.fn(() => new Promise<string>(ok => { resolve = ok; }));
    const file = new File(['manifest'], 'manifest.json');
    Object.defineProperty(file, 'text', { value: read });
    const loadFromManifest = vi.fn().mockResolvedValue(true);
    vi.mocked(useUrlLoader).mockReturnValue({
      loadFromUrl: vi.fn(), loadFromManifest, urlLoading: false, urlProgress: null,
      urlError: null, clearUrlError: vi.fn(), setUrlLoading: vi.fn(), setUrlProgress: vi.fn(),
    });
    const { container } = render(<DropZone><div>Viewer</div></DropZone>);
    const input = container.querySelector<HTMLInputElement>('input[accept=".json"]')!;
    const initialSplatSelectionRevision = useReconstructionStore.getState().splatSelectionRevision;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
    await useReconstructionStore.getState().selectSplatSource('');
    expect(useReconstructionStore.getState().splatSelectionRevision).toBeGreaterThan(initialSplatSelectionRevision);
    const manifest = { version: 1, baseUrl: 'https://example.com/',
      files: { cameras: 'cameras.bin', images: 'images.bin', points3D: 'points3D.bin' } };
    await act(async () => { resolve(JSON.stringify(manifest)); });
    expect(loadFromManifest).toHaveBeenCalledExactlyOnceWith(manifest, { initialSplatSelectionRevision });
  });

  it.each(['resolve', 'reject'] as const)('ignores a cancelled manifest read that later %ss', async outcome => {
    let resolve!: (content: string) => void;
    let reject!: (error: Error) => void;
    const read = vi.fn(() => new Promise<string>((ok, fail) => { resolve = ok; reject = fail; }));
    const file = new File(['manifest'], 'manifest.json');
    Object.defineProperty(file, 'text', { value: read });
    const loadFromManifest = vi.fn();
    const setUrlLoading = vi.fn();
    const setError = vi.fn();
    vi.mocked(useUrlLoader).mockReturnValue({
      loadFromUrl: vi.fn(), loadFromManifest, urlLoading: false, urlProgress: null,
      urlError: null, clearUrlError: vi.fn(), setUrlLoading, setUrlProgress: vi.fn(),
    });
    vi.mocked(useDropZoneStoreFacade).mockReturnValue({
      data: { error: null, reconstruction: null, touchMode: false, hasUrlLoadRequest: false },
      actions: { setError, clear: useReconstructionStore.getState().clear },
    });
    const { container } = render(<DropZone><div>Viewer</div></DropZone>);
    const input = container.querySelector<HTMLInputElement>('input[accept=".json"]')!;
    fireEvent.change(input, { target: { files: [file] } });
    // The Cancel action owns the read before any file bytes are available.
    expect(useReconstructionStore.getState().urlLoadActive).toBe(true);
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
    const oldSignal = useReconstructionStore.getState().urlLoadController!.signal;
    useReconstructionStore.getState().clear();
    const newSignal = useReconstructionStore.getState().tryStartUrlLoad();
    await act(async () => {
      if (outcome === 'resolve') resolve(JSON.stringify({ version: 1, baseUrl: 'https://example.com/',
        files: { cameras: 'cameras.bin', images: 'images.bin', points3D: 'points3D.bin' } }));
      else reject(new Error('Late read failure'));
    });
    expect(oldSignal.aborted).toBe(true);
    expect(loadFromManifest).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
    expect(setUrlLoading).toHaveBeenCalledExactlyOnceWith(true);
    expect(useReconstructionStore.getState().urlLoadController?.signal).toBe(newSignal);
    expect(input.value).toBe('');
  });

  it('does not hand off a URL after cancellation during the initial paint', async () => {
    const loadFromUrl = vi.fn();
    vi.mocked(useUrlLoader).mockReturnValue({
      loadFromUrl, loadFromManifest: vi.fn(), urlLoading: false, urlProgress: null,
      urlError: null, clearUrlError: vi.fn(), setUrlLoading: vi.fn(), setUrlProgress: vi.fn(),
    });
    render(<DropZone><div>Viewer</div></DropZone>);
    fireEvent.click(screen.getByRole('button', { name: 'Select desktop Drive archive' }));
    useReconstructionStore.getState().clear();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    expect(loadFromUrl).not.toHaveBeenCalled();
    expect(useReconstructionStore.getState().urlLoadActive).toBe(false);
  });
});
