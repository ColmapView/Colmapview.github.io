import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { featureCatalog, describeFeatures } from '../features/catalog';
import { useUITheme } from '../theme/uiTheme';
import { usePointCloudStore } from '../store/stores/pointCloudStore';
import { useTransformStore } from '../store/stores/transformStore';
import { useReconstructionStore } from '../store/reconstructionStore';
import { createEmptyReconstruction } from '../utils/fileClassification';
import { sections, getPersistedProperties } from '../config/registry';
import { captureStores, commandStores } from './state';
import { disposeCommands, executeAgentCommand, executeHumanFeature, readAgentState,
  readFeatureState, startAgentSession, endAgentSession, undoHumanFeature, useCommandState } from './runtime';

const initial = captureStores();
beforeEach(() => {
  disposeCommands();
  commandStores.forEach((store, index) => store.restore(initial[index]));
  useReconstructionStore.setState({ reconstruction: null });
  useCommandState.setState({ revision: 0, datasetGeneration: 0, activity: [] });
  startAgentSession();
});
afterEach(() => { disposeCommands(); vi.useRealTimers(); });
function request(feature = 'settings.ui.theme', input: unknown = { value: 'light' }) {
  const state = readAgentState();
  return { protocolVersion: 1 as const, sessionId: state.sessionId!, requestId: crypto.randomUUID(),
    feature, operation: 'set' as const, expectedRevision: state.revision, datasetGeneration: state.datasetGeneration, input };
}

describe('feature contracts', () => {
  it('provides schemas and both interfaces for every registered operation', () => {
    expect(new Set(featureCatalog.map(feature => feature.id)).size).toBe(featureCatalog.length);
    for (const feature of describeFeatures()) {
      expect(feature.inputSchema.additionalProperties).toBe(false);
      expect(feature.humanInterface).toBeTruthy();
      expect(feature.agentInterface).toBeTruthy();
    }
    expect(featureCatalog.some(feature => feature.id.includes('flyToImageId'))).toBe(false);
  });
  it.each(featureCatalog.filter(feature => feature.id.startsWith('settings.')).map(feature => [feature.id, feature] as const))('accepts the current setting through both interfaces: %s', (id, feature) => {
    const input = { value: feature.read() };
    const human = executeHumanFeature(id, input);
    expect(human.status, human.error?.message).toBe('succeeded');
    const agent = executeAgentCommand(request(id, input));
    expect(agent.status, agent.error?.message).toBe('succeeded');
    expect(agent.output).toEqual(human.output);
  });
  it.each(sections.flatMap(section => getPersistedProperties(section).map(prop => [`settings.${section.key}.${prop.key}`, prop] as const)))('changes and undoes a registered setting: %s', (id, prop) => {
    const before = readFeatureState().values;
    const current = before[id];
    const value = prop.type === 'boolean' ? !current
      : prop.type === 'enum' ? prop.enumValues.find(option => option !== current) ?? current
      : prop.type === 'number' ? current === prop.min ? prop.max ?? Number(current) + 1 : prop.min ?? 0
      : prop.pattern ? '#123456' : `${String(current)}-test`;
    const agent = executeAgentCommand(request(id, { value }));
    expect(agent.status, agent.error?.message).toBe('succeeded');
    expect(agent.output).toEqual(value);
    expect(undoHumanFeature().status).toBe('succeeded');
    expect(readFeatureState().values).toEqual(before);
  });
  it.each([{}, { value: undefined }, { value: 'neon' }, { value: 'dark', extra: 1 }])('rejects invalid input without mutation: %j', input => {
    const before = readFeatureState();
    expect(executeAgentCommand(request('settings.ui.theme', input)).error?.code).toBe('INVALID_INPUT');
    expect(readFeatureState().values).toEqual(before.values);
  });
  it.each([-1, Infinity, NaN, '2', 1000])('validates number type and range: %s', value => {
    expect(executeAgentCommand(request('settings.pointCloud.pointSize', { value })).status).toBe('failed');
  });
});

describe('session, concurrency and history', () => {
  it('deduplicates requests and refuses ID reuse for different arguments', () => {
    const command = request();
    const result = executeAgentCommand(command);
    expect(executeAgentCommand(command)).toEqual(result);
    expect(useCommandState.getState().activity).toHaveLength(1);
    expect(executeAgentCommand({ ...command, input: { value: 'dark' } }).error?.code).toBe('REQUEST_ID_REUSED');
  });
  it('rejects a stale request after a normal human setter, including change away and back', () => {
    const command = request();
    useUITheme.getState().setTheme('system');
    useUITheme.getState().setTheme('dark');
    expect(executeAgentCommand(command).error?.code).toBe('STALE_REVISION');
  });
  it('revokes old sessions and expires after 30 minutes', () => {
    const command = request();
    startAgentSession();
    expect(executeAgentCommand(command).error?.code).toBe('SESSION_REVOKED');
    vi.useFakeTimers();
    const next = request();
    vi.setSystemTime(Date.now() + 31 * 60 * 1000);
    expect(executeAgentCommand(next).error?.code).toBe('SESSION_REVOKED');
    expect(() => readAgentState()).toThrow();
    endAgentSession();
  });
  it('does not mutate on cancellation or a forged human actor', () => {
    const command = request();
    const abort = new AbortController(); abort.abort();
    expect(executeAgentCommand(command, abort.signal).status).toBe('cancelled');
    expect(executeAgentCommand({ ...command, actor: 'human' }).error?.code).toBe('INVALID_REQUEST');
    expect(useUITheme.getState().theme).toBe('dark');
  });
  it('undo restores coupled point/splat fields together', () => {
    const before = usePointCloudStore.getState();
    expect(executeAgentCommand(request('settings.pointCloud.colorMode', { value: 'splatPoints' })).status).toBe('succeeded');
    expect(usePointCloudStore.getState().showSplats).toBe(true);
    expect(undoHumanFeature().status).toBe('succeeded');
    expect(usePointCloudStore.getState().colorMode).toBe(before.colorMode);
    expect(usePointCloudStore.getState().showSplats).toBe(before.showSplats);
    expect(usePointCloudStore.getState().showPointCloud).toBe(before.showPointCloud);
  });
  it('supports sequential undo, but never overwrites intervening human changes', () => {
    executeHumanFeature('settings.ui.theme', { value: 'light' });
    executeHumanFeature('settings.ui.theme', { value: 'system' });
    expect(undoHumanFeature().status).toBe('succeeded');
    expect(useUITheme.getState().theme).toBe('light');
    expect(undoHumanFeature().status).toBe('succeeded');
    expect(useUITheme.getState().theme).toBe('dark');
    executeHumanFeature('settings.ui.theme', { value: 'light' });
    useUITheme.getState().setTheme('system');
    expect(undoHumanFeature().status).toBe('failed');
    expect(useUITheme.getState().theme).toBe('system');
  });
  it('requires a dataset for transform previews', () => {
    const before = useTransformStore.getState().transform;
    expect(executeAgentCommand(request('scene.transform.preview', { ...before, scale: 2 })).error?.code).toBe('NOT_AVAILABLE');
    expect(useTransformStore.getState().transform).toEqual(before);
  });
  it('previews and undoes numeric alignment without modifying reconstruction coordinates', () => {
    const reconstruction = createEmptyReconstruction();
    useReconstructionStore.setState({ reconstruction });
    const before = useTransformStore.getState().transform;
    const input = { ...before, scale: 2, rotationZ: Math.PI / 2, translationX: 3 };
    expect(executeAgentCommand(request('scene.transform.preview', input)).status).toBe('succeeded');
    expect(useTransformStore.getState().transform).toEqual(input);
    expect(useReconstructionStore.getState().reconstruction).toBe(reconstruction);
    expect(undoHumanFeature().status).toBe('succeeded');
    expect(useTransformStore.getState().transform).toEqual(before);
  });
  it('rejects stale datasets and clears history when a reconstruction changes', () => {
    executeHumanFeature('settings.ui.theme', { value: 'light' });
    const command = request();
    useReconstructionStore.setState({ reconstruction: createEmptyReconstruction() });
    expect(executeAgentCommand(command).error?.code).toBe('STALE_DATASET');
    expect(useCommandState.getState().canUndo).toBe(false);
  });
  it('guards unregistered fields affected by a coupled setter before undo', () => {
    executeHumanFeature('settings.pointCloud.colorMode', { value: 'splatPoints' });
    usePointCloudStore.setState({ showSplats: false });
    expect(undoHumanFeature().error?.code).toBe('STALE_REVISION');
    expect(usePointCloudStore.getState().showSplats).toBe(false);
  });
  it('does not expose mutable result objects', () => {
    const snapshot = readFeatureState();
    (snapshot.values['scene.transform.preview'] as { scale: number }).scale = 999;
    expect(useTransformStore.getState().transform.scale).toBe(1);
  });
  it('rejects oversized or cyclic input before caching it', () => {
    expect(executeAgentCommand(request('settings.ui.theme', { value: 'x'.repeat(20_000) })).error?.code).toBe('INVALID_INPUT');
    const cyclic: { value?: unknown } = {}; cyclic.value = cyclic;
    expect(executeAgentCommand(request('settings.ui.theme', cyclic)).error?.code).toBe('INVALID_INPUT');
  });
  it('bounds results without allowing old requests to execute twice', () => {
    for (let index = 0; index < 1000; index++) expect(executeAgentCommand(request()).status).toBe('succeeded');
    expect(executeAgentCommand(request()).error?.code).toBe('SESSION_LIMIT');
    expect(useCommandState.getState().activity).toHaveLength(500);
  });
});
