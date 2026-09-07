import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildImage, buildReconstruction } from '../test/builders';
import { useReconstructionStore } from '../store/reconstructionStore';
import { useCameraStore } from '../store/stores/cameraStore';
import { useUIStore } from '../store/stores/uiStore';
import { disposeCommands, executeHumanFeature, queryAgentImages, readAgentState, startAgentSession, undoHumanFeature } from '../commands/runtime';

beforeEach(() => {
  disposeCommands();
  useReconstructionStore.setState({ reconstruction: buildReconstruction({ images: [buildImage({ imageId: 3 }), buildImage({ imageId: 7 })] }) });
  useCameraStore.getState().setSelectedImageId(null);
  useUIStore.getState().closeImageDetail();
  startAgentSession();
});
afterEach(disposeCommands);
describe('viewer feature contracts', () => {
  it('pages stable image IDs and rejects stale generations and unbounded queries', () => {
    const first = queryAgentImages({ limit: 1 });
    expect(first.items[0].id).toBe(3);
    expect(first.nextOffset).toBe(1);
    expect(queryAgentImages({ offset: 1, limit: 1, datasetGeneration: first.datasetGeneration }).items[0].id).toBe(7);
    expect(() => queryAgentImages({ limit: 1000 })).toThrow();
    useReconstructionStore.setState({ reconstruction: buildReconstruction() });
    expect(() => queryAgentImages({ datasetGeneration: first.datasetGeneration })).toThrow('STALE_DATASET');
  });
  it('selects and opens known images using existing stores, and supports undo', () => {
    expect(executeHumanFeature('selection.image', { imageId: 7 }).status).toBe('succeeded');
    expect(useCameraStore.getState().selectedImageId).toBe(7);
    expect(undoHumanFeature().status).toBe('succeeded');
    expect(useCameraStore.getState().selectedImageId).toBeNull();
    expect(executeHumanFeature('image.open', { imageId: 3 }).status).toBe('succeeded');
    expect(useUIStore.getState().imageDetailId).toBe(3);
    executeHumanFeature('image.open', { imageId: null });
    expect(useUIStore.getState().imageDetailId).toBeNull();
  });
  it('rejects missing IDs without changing current selection', () => {
    expect(executeHumanFeature('selection.image', { imageId: 999 }).status).toBe('failed');
    expect(useCameraStore.getState().selectedImageId).toBeNull();
    expect(readAgentState().dataset.imageCount).toBe(2);
  });
  it('does not allow queries after revocation', () => {
    disposeCommands();
    expect(() => queryAgentImages({})).toThrow('disabled');
  });
});
