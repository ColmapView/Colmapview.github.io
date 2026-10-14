import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeletionStore, useReconstructionStore } from '../../store';
import { buildReconstruction } from '../../test/builders';
import './publicationRuntime';

const controller = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let phase = 'idle';
  return {
    invalidate: vi.fn(), reset: vi.fn(), cancel: vi.fn(), publish: vi.fn(), retry: vi.fn(),
    getSnapshot: () => ({ phase }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    emit(next: string) { phase = next; listeners.forEach(listener => listener()); },
  };
});
vi.mock('../colmapviewHub/publication', () => ({ hubPublications: { huggingFace: { finish: vi.fn(), prepare: vi.fn(), blocksUnload: vi.fn(() => false) } } }));
vi.mock('./publishDataset', async importOriginal => ({
  ...await importOriginal<typeof import('./publishDataset')>(),
  createPublicationController: () => controller,
}));

describe('Hugging Face publication runtime', () => {
  beforeEach(() => {
    useReconstructionStore.setState({ ...useReconstructionStore.getInitialState(), reconstruction: buildReconstruction(),
      sourceType: 'url', sourceUrl: 'https://example.test/a/' }, true);
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
    controller.emit('idle');
    vi.clearAllMocks();
  });

  it('clears a finished result after an edit or a deletion mark', () => {
    controller.emit('completed');
    useReconstructionStore.setState(state => ({ reconstructionEditRevision: state.reconstructionEditRevision + 1 }));
    expect(controller.reset).toHaveBeenCalledOnce();
    expect(controller.invalidate).not.toHaveBeenCalled();
    useDeletionStore.setState({ pendingDeletions: new Set([1]) });
    expect(controller.reset).toHaveBeenCalledTimes(2);
  });

  it('leaves a running upload alone on edits, and invalidates it when the dataset changes', () => {
    controller.emit('uploading');
    useReconstructionStore.setState(state => ({ reconstructionEditRevision: state.reconstructionEditRevision + 1 }));
    useDeletionStore.setState({ pendingDeletions: new Set([1]) });
    expect(controller.reset).not.toHaveBeenCalled();
    useReconstructionStore.setState({ sourceUrl: 'https://example.test/b/' });
    expect(controller.invalidate).toHaveBeenCalledOnce();
  });
});
