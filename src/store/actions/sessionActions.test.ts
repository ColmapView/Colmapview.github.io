import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmReload, hasUnsavedReloadState } from './sessionActions';
import { useTransformStore } from '../stores/transformStore';
import { useDeletionStore } from '../stores/deletionStore';
import { useReconstructionStore } from '../reconstructionStore';
import { applyDeletionsToData } from './deletionActions';
import { buildImage, buildReconstruction } from '../../test/builders';
import { applySavedViewerState, type SharedViewerOverrides } from '../../hooks/useUrlState';
import { serializeDatasetViewerSettings } from '../../utils/datasetViewerSettings';
import type { PublishedViewerState } from '../../utils/publishedViewerState';
import { createIdentityEuler } from '../../utils/sim3dTransforms';

describe('reload confirmation gating', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useDeletionStore.getState().clearPendingDeletions();
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it('returns false for unsaved state when nothing is pending', () => {
    expect(hasUnsavedReloadState()).toBe(false);
  });

  it('detects a non-identity transform', () => {
    useTransformStore.getState().setTransform({ rotationY: Math.PI / 4 });
    expect(hasUnsavedReloadState()).toBe(true);
  });

  it('detects an applied splat transform', () => {
    useTransformStore.getState().setSplatTransform({
      scale: 1,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      translationX: 2,
      translationY: 0,
      translationZ: 0,
    });

    expect(hasUnsavedReloadState()).toBe(true);
  });

  it('detects pending deletions', () => {
    useDeletionStore.getState().markForDeletion(42);
    expect(hasUnsavedReloadState()).toBe(true);
  });

  it('confirmReload skips the prompt when there is nothing to lose', async () => {
    const result = await confirmReload();
    expect(result).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('confirmReload prompts when a transform is active and returns the user answer', async () => {
    useTransformStore.getState().setTransform({ scale: 2 });

    confirmSpy.mockReturnValueOnce(true);
    await expect(confirmReload()).resolves.toBe(true);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    // Reload also brings back what the dataset saved; it does not only discard.
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('settings saved with the dataset'));

    confirmSpy.mockReturnValueOnce(false);
    await expect(confirmReload()).resolves.toBe(false);
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });

  it('confirmReload prompts when deletions are pending', async () => {
    useDeletionStore.getState().markForDeletion(7);
    confirmSpy.mockReturnValueOnce(false);
    await expect(confirmReload()).resolves.toBe(false);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it('warns after a deletion is applied, until another dataset is loaded', async () => {
    const reconstruction = buildReconstruction({
      images: [buildImage({ imageId: 1 }), buildImage({ imageId: 2 })],
    });
    useReconstructionStore.getState().setReconstruction(reconstruction);
    useDeletionStore.getState().markForDeletion(1);
    expect(await applyDeletionsToData()).toBe(true);
    expect(useDeletionStore.getState().pendingDeletions.size).toBe(0);
    expect(useReconstructionStore.getState().reconstruction?.images.has(1)).toBe(false);
    expect(hasUnsavedReloadState()).toBe(true);
    confirmSpy.mockReturnValue(false);
    await expect(confirmReload()).resolves.toBe(false);

    useReconstructionStore.getState().setReconstruction(reconstruction);
    expect(hasUnsavedReloadState()).toBe(false);
  });

  it('clears committed edit tracking on session clear', () => {
    useReconstructionStore.getState().setReconstruction(buildReconstruction(), { edited: true });
    expect(hasUnsavedReloadState()).toBe(true);
    useReconstructionStore.getState().clear();
    expect(hasUnsavedReloadState()).toBe(false);
  });

  describe('measured against the alignment Reload re-applies', () => {
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null, config: {
      transform: { ...createIdentityEuler(), rotationY: 0.5, translationX: 2 },
      splat: { transform: { ...createIdentityEuler(), scale: 1.5, translationZ: -1 } },
    } };
    const datasetFiles = () => new Map([['sparse/0/cameras.bin', new File([''], 'cameras.bin')]]);

    /** A URL dataset, as the loader leaves it: its saved settings retained beside its files, then applied. */
    async function loadPublishedDataset(shared: SharedViewerOverrides | null = null) {
      const files = datasetFiles();
      useReconstructionStore.getState().setDroppedFiles(files);
      useReconstructionStore.getState().setSourceViewerState(saved);
      await applySavedViewerState(saved, shared);
      return files;
    }

    /** A local project whose own colmapview.yaml is among its files. */
    async function loadLocalProject() {
      const yaml = serializeDatasetViewerSettings(saved);
      const files = datasetFiles();
      // jsdom's File has no text().
      files.set('colmapview.yaml', Object.assign(new File([yaml], 'colmapview.yaml'), { text: async () => yaml }));
      useReconstructionStore.getState().setDroppedFiles(files);
      await applySavedViewerState(saved, null);
      return files;
    }

    /** Whether confirmReload() asks before it lets Reload go ahead. */
    async function asksBeforeReload(): Promise<boolean> {
      confirmSpy.mockClear();
      await expect(confirmReload()).resolves.toBe(true);
      return confirmSpy.mock.calls.length > 0;
    }

    it('does not ask for a published dataset that shows its saved alignment unedited', async () => {
      await loadPublishedDataset();
      expect(await asksBeforeReload()).toBe(false);
    });

    it('asks once the splat alignment differs from the saved one', async () => {
      await loadPublishedDataset();
      useTransformStore.getState().setSplatTransform({ ...createIdentityEuler(), translationX: 3 });
      expect(await asksBeforeReload()).toBe(true);
    });

    it('asks when a share link replaced the saved alignment, since Reload brings the saved one back', async () => {
      await loadPublishedDataset({ config: { transform: { ...createIdentityEuler(), rotationZ: 1 } } });
      expect(await asksBeforeReload()).toBe(true);
    });

    it("keeps today's identity baseline for a dataset that saved no settings", async () => {
      useReconstructionStore.getState().setDroppedFiles(datasetFiles());
      expect(await asksBeforeReload()).toBe(false);
      useTransformStore.getState().setTransform({ translationY: 1 });
      expect(await asksBeforeReload()).toBe(true);
    });

    it("never gives a new dataset the previous dataset's baseline", async () => {
      const previous = await loadPublishedDataset();
      // A dataset without settings leaves the alignment on screen, and its Reload resets it.
      useReconstructionStore.getState().setDroppedFiles(datasetFiles());
      expect(await asksBeforeReload()).toBe(true);
      // Settings bound to another file map are not this dataset's either.
      useReconstructionStore.setState({ sourceViewerState: { files: previous, state: saved } });
      expect(await asksBeforeReload()).toBe(true);
    });

    it('does not ask for a local project that shows the alignment of its own colmapview.yaml', async () => {
      await loadLocalProject();
      expect(await asksBeforeReload()).toBe(false);
    });

    it.each([
      ['published dataset', loadPublishedDataset],
      ['local project', loadLocalProject],
    ])("asks once an import or a merged load moved a %s's alignment: Reload restores the dataset's own settings", async (_, load) => {
      await load();
      // A settings-only import, or a splat merged with its settings, applies them without replacing the files.
      await applySavedViewerState({ ...saved, config: { transform: { ...createIdentityEuler(), scale: 3 } } }, null);
      expect(await asksBeforeReload()).toBe(true);
    });
  });
});
