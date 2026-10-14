import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindHubPublication } from './bindHubPublication';
import type { HubPublication } from './publication';

interface Snapshot { phase: string; viewerUrl?: string }
function fakeController() {
  const listeners = new Set<() => void>();
  let snapshot: Snapshot = { phase: 'idle' };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    emit(next: Snapshot) { snapshot = next; listeners.forEach(listener => listener()); },
    listenerCount: () => listeners.size,
  };
}
const unloading = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};
const select = (snapshot: Snapshot) => ({ uploading: snapshot.phase === 'uploading',
  completed: snapshot.phase === 'completed' && snapshot.viewerUrl ? { viewerUrl: snapshot.viewerUrl } : undefined });

describe('bindHubPublication', () => {
  let unbind = () => {};
  afterEach(() => unbind());

  it('finishes the Hub link when an upload completes', () => {
    const controller = fakeController();
    const hub = { finish: vi.fn(), blocksUnload: vi.fn(() => false) };
    unbind = bindHubPublication(controller, hub as unknown as HubPublication, select);
    controller.emit({ phase: 'uploading' });
    expect(hub.finish).not.toHaveBeenCalled();
    controller.emit({ phase: 'completed', viewerUrl: 'https://viewer.example/?url=x' });
    expect(hub.finish).toHaveBeenCalledWith('https://viewer.example/?url=x', undefined);
  });

  it('warns before leaving while uploading or while the Hub asks, and stops once unbound', () => {
    const controller = fakeController();
    const hub = { finish: vi.fn(), blocksUnload: vi.fn(() => false) };
    unbind = bindHubPublication(controller, hub as unknown as HubPublication, select);
    expect(unloading()).toBe(false);
    controller.emit({ phase: 'uploading' });
    expect(unloading()).toBe(true);
    controller.emit({ phase: 'idle' });
    hub.blocksUnload.mockReturnValue(true);
    expect(unloading()).toBe(true);
    unbind();
    expect(unloading()).toBe(false);
    expect(controller.listenerCount()).toBe(0);
  });
});
