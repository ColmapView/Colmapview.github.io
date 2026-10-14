import { useReconstructionStore, useTransformStore, useCameraStore, useDeletionStore, useExportStore } from '../../store';
import { isReconstructionSnapshot } from '../../wasm/reconstructionService';
import { collectShareConfig } from '../../hooks/useUrlState';
import { getPublicationViewerBaseUrl } from './publicationLinks';
import { getActiveSplatSourceId } from '../../utils/splatFileSourcePolicy';
import { getZipImageGeneration } from '../../utils/zipImageFiles';
import { HfError } from '../huggingface/http';
import { archiveName } from '../../hooks/fileDropzoneLocalSources';
import type { PublicationInput } from './preparePublication';

const identities = new WeakMap<object, number>();
let nextIdentity = 0;
export function getPublicationSourceKey(state = useReconstructionStore.getState()): string {
  if (!state.reconstruction) return '';
  const identity = isReconstructionSnapshot(state.wasmReconstruction) ? state.wasmReconstruction.service
    : state.loadedFiles?.camerasFile ?? state.reconstruction;
  if (!identities.has(identity)) identities.set(identity, ++nextIdentity);
  return `${identities.get(identity)}:${state.sourceType}:${state.sourceUrl ?? ''}:${state.sourceType === 'zip' ? getZipImageGeneration() : ''}`;
}

export function capturePublicationInput(): PublicationInput {
  const state = useReconstructionStore.getState();
  const transform = useTransformStore.getState();
  if (!state.reconstruction || (!state.reconstruction.cameras.size && !state.loadedFiles?.camerasFile)) throw new HfError('Load a COLMAP reconstruction before publishing. Splat-only publication is not supported yet.');
  if (useDeletionStore.getState().pendingDeletions.size) throw new HfError('Apply or clear pending deletions before publishing.');
  return {
    sourceKey: getPublicationSourceKey(), modelRevision: state.reconstructionEditRevision,
    reconstruction: state.reconstruction, source: state.wasmReconstruction,
    dataset: { sourceType: state.sourceType, loadedFiles: state.loadedFiles, imageUrlBase: state.imageUrlBase,
      maskUrlBase: state.maskUrlBase, imageNameToUrl: state.imageNameToUrl },
    transform: { ...transform.transform }, splatTransform: { ...transform.splatTransform },
    config: collectShareConfig(), viewState: structuredClone(useCameraStore.getState().currentViewState),
    activeSplatId: getActiveSplatSourceId(state.loadedFiles), appVersion: __APP_VERSION__,
    viewerBaseUrl: getPublicationViewerBaseUrl(window.location),
  };
}

export function assertPublicationInputCurrent(input: PublicationInput): void {
  const current = useReconstructionStore.getState();
  if (getPublicationSourceKey() !== input.sourceKey || current.reconstruction !== input.reconstruction
    || current.reconstructionEditRevision !== input.modelRevision || useDeletionStore.getState().pendingDeletions.size) {
    throw new HfError('The reconstruction changed while preparing. Publish again.');
  }
}

/** What a Hub link records as its dataset state. */
export function getHubSource(state = useReconstructionStore.getState()): { key: string; revision: number } {
  return { key: getPublicationSourceKey(state), revision: state.reconstructionEditRevision };
}

/** The view capture the Hub uses when an upload has no preview. */
export function captureCurrentView(): Promise<Blob | null> {
  return useExportStore.getState().getScreenshotBlob?.() ?? Promise.resolve(null);
}

/** URL segments that name a file format rather than a dataset. */
const GENERIC_SEGMENTS = new Set(['view', 'manifest', 'colmapview', 'download', 'index', 'resolve', 'main']);

/** The Drive file name limit (180 UTF-16 units) less the ".zip" the default appends. */
export const PUBLICATION_DATASET_NAME_MAX = 180 - '.zip'.length;

/** The last URL segment, without an archive or JSON extension; dotted names such as "scan_2024.10.01" stay whole. */
function urlName(value: string | null): string | null {
  if (!value) return null;
  try {
    const segment = archiveName(decodeURIComponent(new URL(value).pathname.split('/').filter(Boolean).at(-1) ?? ''))?.replace(/\.json$/i, '');
    return segment && !GENERIC_SEGMENTS.has(segment.toLowerCase()) ? segment : null;
  } catch { return null; }
}

/** A name Drive and bucket paths accept: no control characters or slashes, single spaces, capped length; null when nothing usable is left. */
function cleanDatasetName(value: string | null | undefined): string | null {
  if (!value) return null;
  let printable = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    printable += code < 32 || code === 127 ? ' ' : char;
  }
  let name = '';
  for (const char of printable.replace(/[\\/]+/g, '-').replace(/\s+/g, ' ').trim()) {
    if (name.length + char.length > PUBLICATION_DATASET_NAME_MAX) break;
    name += char;
  }
  name = name.trim();
  return name && !/^\.+$/.test(name) ? name : null;
}

/** A default name for uploads: the manifest name (inline, or recorded when a manifest URL loads), the recorded local name, the source URL's last segment, or "colmap-dataset". */
export function getPublicationDatasetName(state = useReconstructionStore.getState()): string {
  for (const candidate of [state.sourceManifest?.name, state.sourceName, urlName(state.sourceUrl)]) {
    const name = cleanDatasetName(candidate);
    if (name) return name;
  }
  return 'colmap-dataset';
}
