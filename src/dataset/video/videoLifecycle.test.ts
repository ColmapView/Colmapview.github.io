import { afterEach, expect, it, vi } from 'vitest';
import { useReconstructionStore } from '../../store/reconstructionStore';
import { createVideoFrameMedia } from './videoFrameMedia';

afterEach(() => useReconstructionStore.getState().clear());

it('disposes replaced and cleared video owners while preserving same-scene file updates', () => {
  const first = createVideoFrameMedia(new Map(), true), next = createVideoFrameMedia(new Map(), true);
  const firstDispose = vi.spyOn(first, 'dispose'), nextDispose = vi.spyOn(next, 'dispose');
  const files = { imageFiles: new Map<string, File>(), hasMasks: false, videoFrames: first };
  useReconstructionStore.getState().setLoadedFiles(files);
  useReconstructionStore.getState().setLoadedFiles({ ...files });
  expect(firstDispose).not.toHaveBeenCalled();
  useReconstructionStore.getState().setLoadedFiles({ ...files, videoFrames: next });
  expect(firstDispose).toHaveBeenCalledTimes(1);
  useReconstructionStore.getState().clear();
  expect(nextDispose).toHaveBeenCalledTimes(1);
});
