import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearReconstruction } from './reconstructionActions';
import { useReconstructionStore } from '../reconstructionStore';
import { hasActiveZipArchive, setActiveZipArchive } from '../../utils/zipArchiveState';
import { appLogger } from '../../utils/logger';
import { buildArchiveReader, buildLoadedFiles, buildReconstruction } from '../../test/builders';

describe('clearReconstruction', () => {
  afterEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    vi.restoreAllMocks();
  });

  it('closes the ZIP archive with the scene it served, and offers no option to keep it', () => {
    // The cache manager reports each clear.
    vi.spyOn(appLogger, 'info').mockImplementation(() => undefined);
    const archive = buildArchiveReader();
    const close = vi.spyOn(archive, 'close');
    setActiveZipArchive(archive, new Map());
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), loadedFiles: buildLoadedFiles() });

    // @ts-expect-error The store's clear() releases the archive with the scene, so it cannot be kept.
    clearReconstruction({ preserveZip: true });

    expect(useReconstructionStore.getState().reconstruction).toBeNull();
    expect(close).toHaveBeenCalledOnce();
    expect(hasActiveZipArchive()).toBe(false);
  });
});
