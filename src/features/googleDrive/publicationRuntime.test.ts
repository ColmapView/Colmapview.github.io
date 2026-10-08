import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeletionStore, useDrivePublicationStatus, useReconstructionStore } from '../../store';
import { buildReconstruction } from '../../test/builders';
import './publicationRuntime';

const controller = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let phase = 'idle';
  return {
    invalidate: vi.fn(), cancel: vi.fn(),
    getSnapshot: () => ({ phase }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    emit(next: string) { phase = next; listeners.forEach(listener => listener()); },
  };
});
vi.mock('./publishDataset', async importOriginal => ({
  ...await importOriginal<typeof import('./publishDataset')>(),
  createDrivePublicationController: () => controller,
}));

const unloading = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe('Drive publication runtime', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
    controller.emit('idle');
    controller.invalidate.mockClear();
  });

  it('invalidates the job when another dataset loads or the model is edited, and only then', () => {
    useReconstructionStore.setState({ urlLoading: true });
    expect(controller.invalidate).not.toHaveBeenCalled();
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), sourceType: 'url', sourceUrl: 'https://example.test/a/' });
    expect(controller.invalidate).toHaveBeenCalledTimes(1);
    expect(controller.invalidate).toHaveBeenLastCalledWith('dataset');
    useReconstructionStore.setState({ urlLoading: false });
    expect(controller.invalidate).toHaveBeenCalledTimes(1);
    useReconstructionStore.setState(state => ({ reconstructionEditRevision: state.reconstructionEditRevision + 1 }));
    expect(controller.invalidate).toHaveBeenCalledTimes(2);
    expect(controller.invalidate).toHaveBeenLastCalledWith('edit');
    useReconstructionStore.setState({ sourceUrl: 'https://example.test/b/' });
    expect(controller.invalidate).toHaveBeenCalledTimes(3);
    expect(controller.invalidate).toHaveBeenLastCalledWith('dataset');
  });

  it('invalidates the job as an edit once deletions are pending', () => {
    useDeletionStore.setState({ pendingDeletions: new Set() });
    expect(controller.invalidate).not.toHaveBeenCalled();
    useDeletionStore.setState({ pendingDeletions: new Set([7]) });
    expect(controller.invalidate).toHaveBeenCalledOnce();
    expect(controller.invalidate).toHaveBeenCalledWith('edit');
  });

  it('marks the toolbar until the dialog returns to idle, and guards unloading only while publishing', () => {
    expect(useDrivePublicationStatus.getState().active).toBe(false);
    expect(unloading()).toBe(false);
    controller.emit('uploading');
    expect(useDrivePublicationStatus.getState().active).toBe(true);
    expect(unloading()).toBe(true);
    controller.emit('completed');
    expect(useDrivePublicationStatus.getState().active).toBe(true);
    expect(unloading()).toBe(false);
    controller.emit('idle');
    expect(useDrivePublicationStatus.getState().active).toBe(false);
  });
});
