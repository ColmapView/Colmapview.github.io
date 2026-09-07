import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canLoadDataset, datasetLoadInput, registerDatasetLoader, useDatasetLoad } from './datasetLoad';
import { disposeCommands, endAgentSession, executeAgentCommand, executeHumanFeature, readAgentState, startAgentSession, undoHumanFeature } from '../commands/runtime';
import { useReconstructionStore } from '../store/reconstructionStore';

let unregister = () => {};
beforeEach(() => {
  disposeCommands();
  useDatasetLoad.setState({ job: null });
  useReconstructionStore.setState({ loading: false, urlLoading: false, urlLoadActive: false, urlError: null });
  startAgentSession();
});
afterEach(() => { unregister(); disposeCommands(); });
function request(url: string) {
  const state = readAgentState();
  return { protocolVersion: 1, sessionId: state.sessionId, requestId: crypto.randomUUID(),
    expectedRevision: state.revision, datasetGeneration: state.datasetGeneration,
    feature: 'dataset.loadUrl', operation: 'set', input: { url } };
}
describe('dataset load contract', () => {
  it.each(['file:///garden', 'javascript:alert(1)', 'https://user:password@example.com/data.json', 'C:\\garden', 'not-a-url'])(
    'rejects unsupported URL %s', url => expect(datasetLoadInput.safeParse({ url }).success).toBe(false));
  it('requires a mounted loader and excludes ongoing human loads', () => {
    expect(canLoadDataset()).toBe(false);
    unregister = registerDatasetLoader(async () => true);
    useReconstructionStore.setState({ urlLoadActive: true });
    expect(executeAgentCommand(request('https://example.com/manifest.json')).error?.code).toBe('NOT_AVAILABLE');
  });
  it('shares the loader with humans and reports asynchronous failure without claiming completion', async () => {
    unregister = registerDatasetLoader(async () => { throw new Error('Fetch failed'); });
    const result = executeHumanFeature('dataset.loadUrl', { url: 'https://example.com/manifest.json' });
    expect(result.output).toMatchObject({ status: 'running' });
    await vi.waitFor(() => expect(useDatasetLoad.getState().job).toMatchObject({ status: 'failed', error: 'Fetch failed' }));
  });
  it('does not replay accepted jobs or undo dataset loads, and revocation prevents new loads', async () => {
    let finish!: (success: boolean) => void;
    const loader = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    unregister = registerDatasetLoader(loader);
    executeHumanFeature('settings.ui.theme', { value: 'light' });
    const command = request('https://example.com/manifest.json');
    const result = executeAgentCommand(command);
    expect(executeAgentCommand(command)).toEqual(result);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(undoHumanFeature().error?.code).toBe('NOT_AVAILABLE');
    endAgentSession();
    expect(executeAgentCommand(command).error?.code).toBe('SESSION_REVOKED');
    finish(true);
    await vi.waitFor(() => expect(useDatasetLoad.getState().job?.status).toBe('succeeded'));
  });
  it('reports loader false returns as failure', async () => {
    unregister = registerDatasetLoader(async () => {
      useReconstructionStore.setState({ urlError: { type: 'network', message: 'Network unavailable' } });
      return false;
    });
    executeAgentCommand(request('https://example.com/manifest.json'));
    await vi.waitFor(() => expect(useDatasetLoad.getState().job).toMatchObject({ status: 'failed', error: 'Network unavailable' }));
  });
});
