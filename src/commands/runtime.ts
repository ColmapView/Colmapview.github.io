import { z } from 'zod';
import { create } from 'zustand';
import { featureCatalog, getFeature, describeFeatures } from '../features/catalog';
import { useReconstructionStore } from '../store/reconstructionStore';
import { useDatasetLoad } from '../features/datasetLoad';
import { readLiveCamera } from '../features/cameraControl';
import { captureStores, commandStores, diffStores, restorePatches, type StatePatch } from './state';

export const commandRequestSchema = z.strictObject({
  protocolVersion: z.literal(1), sessionId: z.string().min(1).max(128),
  requestId: z.string().min(1).max(128), feature: z.string().max(128),
  operation: z.enum(['set', 'undo']), expectedRevision: z.number().int().nonnegative(),
  datasetGeneration: z.number().int().nonnegative(), input: z.unknown(),
});
export type CommandRequest = z.infer<typeof commandRequestSchema>;
export type CommandResult = {
  requestId: string; status: 'succeeded' | 'failed' | 'cancelled'; revision: number;
  datasetGeneration: number; output?: unknown;
  error?: { code: string; message: string };
};
interface Activity { requestId: string; feature: string; actor: 'human' | 'agent'; status: CommandResult['status']; message?: string }
export const useCommandState = create<{
  revision: number; datasetGeneration: number; sessionId: string | null;
  activity: Activity[]; canUndo: boolean;
}>(() => ({ revision: 0, datasetGeneration: 0, sessionId: null, activity: [], canUndo: false }));

let initialized = false;
let disposeSubscriptions: (() => void)[] = [];
let insideCommand = false;
let history: StatePatch[][] = [];
let expiresAt = 0;
const results = new Map<string, { fingerprint: string; result: CommandResult }>();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function trackedValues() { return featureCatalog.map(feature => feature.read()); }
let previous: unknown[] = [];

export function initializeCommands() {
  if (initialized) return;
  initialized = true;
  previous = trackedValues();
  const changed = () => {
    const next = trackedValues();
    if (!next.some((value, index) => !Object.is(value, previous[index]))) return;
    previous = next;
    if (!insideCommand) history = [];
    useCommandState.setState(state => ({ revision: state.revision + 1, canUndo: history.length > 0 }));
  };
  disposeSubscriptions = commandStores.map(store => store.subscribe(changed));
  disposeSubscriptions.push(useDatasetLoad.subscribe(changed));
  disposeSubscriptions.push(useReconstructionStore.subscribe((state, old) => {
    if (state.reconstruction === old.reconstruction && state.wasmReconstruction === old.wasmReconstruction && state.loadedFiles === old.loadedFiles) return;
    history = [];
    useCommandState.setState(current => ({ datasetGeneration: current.datasetGeneration + 1, revision: current.revision + 1, canUndo: false }));
  }));
}

export function disposeCommands() {
  endAgentSession();
  disposeSubscriptions.forEach(dispose => dispose());
  disposeSubscriptions = [];
  initialized = false;
  history = [];
  useCommandState.setState({ canUndo: false });
}

// Only trusted human UI imports this function. It is never part of the bridge.
export function startAgentSession() {
  initializeCommands();
  endAgentSession();
  const sessionId = crypto.randomUUID();
  expiresAt = Date.now() + 30 * 60 * 1000;
  useCommandState.setState({ sessionId });
  return sessionId;
}
export function endAgentSession() {
  expiresAt = 0;
  results.clear();
  useCommandState.setState({ sessionId: null });
}
export function hasAgentSession() {
  if (useCommandState.getState().sessionId && Date.now() >= expiresAt) endAgentSession();
  return useCommandState.getState().sessionId !== null;
}

export function readFeatureState() {
  initializeCommands();
  const { revision, datasetGeneration, sessionId } = useCommandState.getState();
  const dataset = useReconstructionStore.getState();
  return clone({ protocolVersion: 1, sessionId, revision, datasetGeneration,
    camera: readLiveCamera(),
    dataset: { loaded: !!dataset.reconstruction || !!dataset.wasmReconstruction || !!dataset.loadedFiles,
      imageCount: dataset.reconstruction?.images.size ?? 0,
      cameraCount: dataset.reconstruction?.cameras.size ?? 0,
      loading: dataset.loading || dataset.urlLoading || dataset.urlLoadActive,
      progress: dataset.urlProgress, error: dataset.urlError },
    values: Object.fromEntries(featureCatalog.map(feature => [feature.id, feature.read()])),
    canUndo: history.length > 0,
  });
}
export function readAgentState() {
  if (!hasAgentSession()) throw new Error('Agent control is disabled. Enable it in Settings.');
  return readFeatureState();
}
export function listAgentFeatures() {
  if (!hasAgentSession()) throw new Error('Agent control is disabled.');
  return clone({ protocolVersion: 1, features: describeFeatures(),
    unsupported: ['local file picking and load cancellation', 'animated camera paths', 'point picking and multiselection', 'alignment solving and baking', 'dataset editing', 'capture and recording', 'file export', 'profiles', 'browser privileged operations'],
  });
}

export const imageQuerySchema = z.strictObject({
  offset: z.number().int().nonnegative().max(10_000_000).default(0),
  limit: z.number().int().min(1).max(100).default(50),
  datasetGeneration: z.number().int().nonnegative().optional(),
});
export function queryAgentImages(raw: unknown) {
  if (!hasAgentSession()) throw new Error('Agent control is disabled.');
  const { offset, limit, datasetGeneration } = imageQuerySchema.parse(raw);
  const generation = useCommandState.getState().datasetGeneration;
  if (datasetGeneration !== undefined && datasetGeneration !== generation) throw new Error('STALE_DATASET: restart pagination for the current dataset.');
  const images = useReconstructionStore.getState().reconstruction?.images;
  const items: { id: number; cameraId: number; name: string }[] = [];
  let index = 0;
  if (images) for (const image of images.values()) {
    if (index++ < offset) continue;
    if (items.length === limit) break;
    items.push({ id: image.imageId, cameraId: image.cameraId, name: image.name.slice(0, 1024) });
  }
  const total = images?.size ?? 0;
  return { datasetGeneration: generation, items, total, nextOffset: offset + items.length < total ? offset + items.length : null };
}

function response(requestId: string, code?: string, message?: string, output?: unknown): CommandResult {
  const { revision, datasetGeneration } = useCommandState.getState();
  return { requestId, status: code ? 'failed' : 'succeeded', revision, datasetGeneration,
    ...(code ? { error: { code, message: message ?? code } } : { output }) };
}
function record(feature: string, actor: Activity['actor'], result: CommandResult) {
  useCommandState.setState(state => ({ activity: [...state.activity.slice(-499), {
    feature, actor, requestId: result.requestId, status: result.status, message: result.error?.message,
  }], canUndo: history.length > 0 }));
  return result;
}

function run(featureId: string, operation: 'set' | 'undo', input: unknown, requestId: string, actor: Activity['actor']) {
  if (operation === 'undo') {
    if (featureId !== 'history' || !z.strictObject({}).safeParse(input).success) return record(featureId, actor, response(requestId, 'INVALID_INPUT', 'Undo requires feature history and empty input.'));
    const patches = history.pop();
    if (!patches) return record(featureId, actor, response(requestId, 'NOT_AVAILABLE', 'Nothing to undo. Human changes or a new dataset clear command history.'));
    if (patches.some(patch => Object.entries(patch.after).some(([key, value]) => !Object.is(commandStores[patch.index].read()[key], value)))) {
      history = [];
      return record(featureId, actor, response(requestId, 'STALE_REVISION', 'An affected field changed outside the command interface. Undo was cleared.'));
    }
    insideCommand = true;
    try { restorePatches(patches); }
    finally { insideCommand = false; }
    return record(featureId, actor, response(requestId, undefined, undefined, readFeatureState()));
  }
  const feature = getFeature(featureId);
  if (!feature) return record(featureId, actor, response(requestId, 'UNKNOWN_FEATURE', 'This feature is not supported by the command interface.'));
  const parsed = feature.input.safeParse(input);
  if (!parsed.success) return record(featureId, actor, response(requestId, 'INVALID_INPUT', parsed.error.message));
  if (!feature.available()) return record(featureId, actor, response(requestId, 'NOT_AVAILABLE', 'Feature unavailable. Check dataset loading status and feature requirements.'));
  if (feature.undoable === false) {
    try {
      feature.apply(parsed.data);
      history = [];
      return record(featureId, actor, response(requestId, undefined, undefined, clone(feature.read())));
    } catch (error) {
      return record(featureId, actor, response(requestId, 'EXECUTION_FAILED', error instanceof Error ? error.message : 'Operation failed.'));
    }
  }
  const before = captureStores();
  insideCommand = true;
  try {
    feature.apply(parsed.data);
    const patches = diffStores(before);
    if (patches.length) history = [...history.slice(-99), patches];
    return record(featureId, actor, response(requestId, undefined, undefined, clone(feature.read())));
  } catch (error) {
    restorePatches(diffStores(before));
    return record(featureId, actor, response(requestId, 'EXECUTION_FAILED', error instanceof Error ? error.message : 'Operation failed.'));
  } finally { insideCommand = false; }
}

export function executeHumanFeature(feature: string, input: unknown) {
  initializeCommands();
  return run(feature, 'set', input, crypto.randomUUID(), 'human');
}
export function undoHumanFeature() {
  initializeCommands();
  return run('history', 'undo', {}, crypto.randomUUID(), 'human');
}

/** Session checks guard synchronous mutation/acceptance. Accepted load jobs belong to the loader. */
export function executeAgentCommand(raw: unknown, signal?: AbortSignal): CommandResult {
  initializeCommands();
  const parsed = commandRequestSchema.safeParse(raw);
  if (!parsed.success) return response('', 'INVALID_REQUEST', parsed.error.message);
  const request = parsed.data;
  if (!hasAgentSession() || request.sessionId !== useCommandState.getState().sessionId) return response(request.requestId, 'SESSION_REVOKED', 'Enable a new session in Settings.');
  if (signal?.aborted) return { ...response(request.requestId), status: 'cancelled' };
  let fingerprint: string;
  try { fingerprint = JSON.stringify(request); }
  catch { return response(request.requestId, 'INVALID_INPUT', 'Input must be JSON serializable.'); }
  if (fingerprint.length > 16_384) return response(request.requestId, 'INVALID_INPUT', 'Command input exceeds the 16 KiB character limit.');
  const cached = results.get(request.requestId);
  if (cached) return cached.fingerprint === fingerprint ? clone(cached.result) : response(request.requestId, 'REQUEST_ID_REUSED', 'Use a new request ID for different arguments.');
  // Never evict and accidentally execute an old mutation twice.
  if (results.size >= 1000) return response(request.requestId, 'SESSION_LIMIT', 'Start a new session in Settings after 1000 commands.');
  const state = useCommandState.getState();
  const result = request.datasetGeneration !== state.datasetGeneration
    ? response(request.requestId, 'STALE_DATASET', 'Read state again; the dataset has changed.')
    : request.expectedRevision !== state.revision
      ? response(request.requestId, 'STALE_REVISION', 'Read state again; the user or another command changed the scene.')
      : run(request.feature, request.operation, request.input, request.requestId, 'agent');
  results.set(request.requestId, { fingerprint, result: clone(result) });
  return result;
}
