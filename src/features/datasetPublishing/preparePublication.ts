import type { Reconstruction, SplatFileSource } from '../../types/colmap';
import type { ReconstructionSource } from '../../wasm/reconstructionService';
import type { Sim3dEuler } from '../../types/sim3d';
import type { CameraViewState } from '../../store/types';
import type { ShareConfig } from '../../utils/shareDataCodec';
import type { DatasetState } from '../../dataset/types';
import { DatasetManager } from '../../dataset/DatasetManager';
import { prepareReconstructionFiles } from '../../parsers/prepareReconstructionFiles';
import { composeSim3d, createIdentityEuler, createSim3dFromEuler, sim3dToEuler } from '../../utils/sim3dTransforms';
import { parsePublishedViewerState, sanitizeShareConfig } from '../../utils/publishedViewerState';
import { getZipImageGeneration } from '../../utils/zipImageFiles';
import { findZipEntry, getActiveZipImageIndex } from '../../utils/zipArchiveState';
import { buildImageUrl, buildMaskUrlCandidates, getMaskPathVariants } from '../../utils/imageFileLookupPolicy';
import { HfError } from '../huggingface/http';
import { parseHfAssetUrl, publicationPath } from './publicationPaths';
import { MAX_BUFFERED_PUBLICATION_FILE_BYTES, type PreparedPublication, type PublishAsset } from './types';
import { downloadRemoteFile } from './downloadRemoteFile';
import { DATASET_VIEWER_SETTINGS_FILE, serializeDatasetViewerSettings } from '../../utils/datasetViewerSettings';
import { PUBLICATION_PREVIEW_PATH, MAX_PREVIEW_INPUT_BYTES } from './publicationPreview';

export interface PublicationInput {
  sourceKey: string; modelRevision: number; reconstruction: Reconstruction; source: ReconstructionSource | null;
  dataset: DatasetState; transform: Sim3dEuler; splatTransform: Sim3dEuler;
  config: ShareConfig; viewState: CameraViewState | null; activeSplatId: string | null;
  appVersion: string; viewerBaseUrl: string;
  preview?: Blob;
}
interface PrepareDeps {
  resolveRevision: (repoId: string, revision: string, signal: AbortSignal) => Promise<string>;
  /** Files under a folder at a pinned revision; empty when the folder is missing. */
  listFiles: (repoId: string, revision: string, path: string, signal: AbortSignal) => Promise<Array<{ path: string; size: number }>>;
  assertCurrent: () => void;
  progress: (message: string) => void;
}

function publicationSplats(dataset: DatasetState): SplatFileSource[] {
  if (dataset.loadedFiles?.splatFileSources?.length) return dataset.loadedFiles.splatFileSources.map(source => ({ ...source }));
  const files = dataset.loadedFiles?.splatFiles ?? (dataset.loadedFiles?.splatFile ? [dataset.loadedFiles.splatFile] : []);
  return files.map(file => ({ id: file.name, path: file.name, file }));
}

export function checkAssetSize(size: number, path: string, kind: PublishAsset['kind']): void {
  if (!Number.isSafeInteger(size) || size < 0) throw new HfError(`The file ${path} has an invalid size.`);
  if (kind !== 'splat' && size > MAX_BUFFERED_PUBLICATION_FILE_BYTES) {
    throw new HfError(`The file ${path} exceeds the 128 MiB publication limit for non-splat files.`);
  }
}

export async function preparePublication(input: PublicationInput, signal: AbortSignal, deps: PrepareDeps): Promise<PreparedPublication> {
  const check = () => { signal.throwIfAborted(); deps.assertCurrent(); };
  check();
  deps.progress('Exporting current COLMAP reconstruction…');
  const exported = await prepareReconstructionFiles(input.reconstruction, input.source, input.transform, signal);
  check();
  if (!['cameras.bin', 'images.bin', 'points3D.bin'].every(name => exported[name])) throw new HfError('The reconstruction export is incomplete.');
  const assets: PublishAsset[] = [];
  const paths = new Set<string>();
  const add = (asset: PublishAsset) => {
    asset.path = publicationPath(asset.path);
    const collisionKey = asset.path.normalize('NFC');
    if (paths.has(collisionKey)) throw new HfError(`Two selected files use the path ${asset.path}.`);
    if (asset.size !== null) checkAssetSize(asset.size, asset.path, asset.kind);
    paths.add(collisionKey); assets.push(asset);
  };
  const fixed = (path: string, content: Blob, kind: PublishAsset['kind']): PublishAsset =>
    ({ path, kind, size: content.size, open: async targetSignal => { targetSignal.throwIfAborted(); return content; } });
  for (const [name, content] of Object.entries(exported)) add(fixed(`sparse/0/${name}`, content, 'colmap'));
  if (input.preview) {
    if (input.preview.type !== 'image/png' || !input.preview.size || input.preview.size > MAX_PREVIEW_INPUT_BYTES) {
      throw new HfError('Choose a valid preview image before publishing.');
    }
    add(fixed(PUBLICATION_PREVIEW_PATH, input.preview, 'preview'));
  }

  const captured: DatasetState = { ...input.dataset, imageNameToUrl: input.dataset.imageNameToUrl ? { ...input.dataset.imageNameToUrl } : null,
    loadedFiles: input.dataset.loadedFiles ? { ...input.dataset.loadedFiles, imageFiles: new Map(input.dataset.loadedFiles.imageFiles) } : null };
  const manager = new DatasetManager(() => captured);
  const zipGeneration = getZipImageGeneration();
  const revisions = new Map<string, Promise<string>>();
  const resolveSha = (repoId: string, revision: string) => {
    const key = `${repoId}/${revision}`;
    if (!revisions.has(key)) revisions.set(key, deps.resolveRevision(repoId, revision, signal));
    return revisions.get(key)!;
  };
  const pin = async (value: string) => {
    const parsed = parseHfAssetUrl(value);
    const sha = await resolveSha(parsed.repoId, parsed.revision);
    parsed.url.pathname = parsed.url.pathname.replace(/(\/resolve\/)[^/]+\//, `$1${sha}/`);
    return parsed.url.href;
  };
  // One listing of the remote mask folder replaces a request per image; sizes also batch exactly.
  let remoteMasks: Promise<Map<string, number>> | undefined;
  const listRemoteMasks = (base: string) => remoteMasks ??= (async () => {
    const folder = parseHfAssetUrl(base);
    const files = await deps.listFiles(folder.repoId, await resolveSha(folder.repoId, folder.revision), folder.path, signal);
    const prefix = folder.path ? `${folder.path}/` : '';
    return new Map(files.filter(file => file.path.startsWith(prefix)).map(file => [file.path.slice(prefix.length), file.size]));
  })();
  const remote = async (url: string, path: string, kind: PublishAsset['kind']): Promise<PublishAsset> => {
    const pinned = await pin(url);
    return { path, kind, size: null,
      open: targetSignal => downloadRemoteFile(pinned, path, targetSignal, kind === 'splat' ? Infinity : MAX_BUFFERED_PUBLICATION_FILE_BYTES) };
  };
  const isRemote = captured.sourceType === 'url' || captured.sourceType === 'manifest';
  const media = async (name: string, mask: boolean): Promise<PublishAsset | null> => {
    // Masks go where buildMaskUrlCandidates looks: masks/<name without a leading images/>.png.
    const path = mask ? `masks/${publicationPath(name).replace(/^images\//i, '')}.png` : `images/${publicationPath(name)}`;
    if (isRemote && mask) {
      if (!captured.maskUrlBase) return null;
      const base = captured.maskUrlBase.replace(/\/?$/, '/');
      const available = await listRemoteMasks(base);
      // Accept each name the viewer tries, in its order.
      for (const candidate of buildMaskUrlCandidates(base, name)) {
        const size = available.get(candidate.url.slice(base.length).split('/').map(decodeURIComponent).join('/'));
        if (size === undefined) continue;
        const asset = await remote(candidate.url, path, 'mask');
        asset.size = size;
        return asset;
      }
      return null;
    }
    if (isRemote) {
      const url = captured.imageNameToUrl?.[name] || (captured.imageUrlBase ? buildImageUrl(captured.imageUrlBase, name).url : null);
      if (!url) throw new HfError(`Original image ${name} is unavailable. Load its original file before publishing.`);
      return remote(url, path, 'image');
    }
    let failed = false;
    const read = async (targetSignal: AbortSignal) => {
      failed = false;
      targetSignal.throwIfAborted();
      if (captured.sourceType === 'zip' && getZipImageGeneration() !== zipGeneration) throw new HfError('The source archive changed. Publish again.');
      const options = { signal: targetSignal, onError: () => { failed = true; } };
      const value = await (mask ? manager.getMask(name, options) : manager.getOriginalImage(name, options));
      targetSignal.throwIfAborted();
      if (!value || failed) throw new HfError(`Could not retrieve selected file ${path}.`);
      checkAssetSize(value.size, path, mask ? 'mask' : 'image');
      return value;
    };
    if (captured.sourceType === 'zip') {
      const index = getActiveZipImageIndex();
      if (!index || getZipImageGeneration() !== zipGeneration) throw new HfError('The source archive changed. Publish again.');
      const entry = (mask ? getMaskPathVariants(name) : [name]).map(variant => findZipEntry(variant, index)).find(Boolean);
      if (!entry) {
        if (mask) return null;
        throw new HfError(`Original image ${name} is missing from the archive.`);
      }
      checkAssetSize(entry.size, path, mask ? 'mask' : 'image');
      // Archive entries are extracted when uploaded, not while preparing.
      return { path, kind: mask ? 'mask' : 'image', size: entry.size, open: read };
    }
    const value = mask ? await manager.getMask(name, { signal, onError: () => { failed = true; } })
      : await manager.getOriginalImage(name, { signal, onError: () => { failed = true; } });
    if (failed || (!value && !mask)) throw new HfError(`Could not retrieve selected file ${path}.`);
    if (!value) return null;
    return fixed(path, value, mask ? 'mask' : 'image');
  };

  const imageNameToPath: Record<string, string> = Object.create(null);
  for (const name of new Set([...input.reconstruction.images.values()].map(image => image.name))) {
    check();
    deps.progress(`Checking assets: ${name}`);
    const image = await media(name, false);
    if (!image) throw new HfError(`Original image ${name} is missing.`);
    add(image);
    imageNameToPath[name] = image.path;
    const mask = await media(name, true);
    if (mask) add(mask);
  }
  const splatPaths: string[] = [];
  let activeSourceId: string | undefined;
  for (const source of publicationSplats(captured)) {
    const path = `splats/${publicationPath(source.path)}`;
    if (source.file?.size) add(fixed(path, source.file, 'splat'));
    else if (source.url) add(await remote(source.url, path, 'splat'));
    else throw new HfError(`Original splat ${source.path} is unavailable. Load its original file before publishing.`);
    splatPaths.push(path);
    if (source.id === input.activeSplatId) activeSourceId = path;
  }
  const config: ShareConfig = sanitizeShareConfig(structuredClone(input.config));
  config.transform = createIdentityEuler();
  config.splat = { transform: sim3dToEuler(composeSim3d(createSim3dFromEuler(input.transform), createSim3dFromEuler(input.splatTransform))),
    ...(splatPaths.length ? { activeSourceId: activeSourceId ?? splatPaths[0] } : {}) };
  if (config.camera?.selectedImageId !== undefined && !input.reconstruction.images.has(config.camera.selectedImageId as number)) delete config.camera.selectedImageId;
  if (!splatPaths.length && config.pointCloud && ['splats', 'splatPoints', 'splatRainbowPoints'].includes(String(config.pointCloud.colorMode))) {
    config.pointCloud.colorMode = 'rgb';
    config.pointCloud.showPointCloud = true;
  }
  const viewerState = parsePublishedViewerState({ version: 1, viewerVersion: input.appVersion, viewState: input.viewState, config });
  add(fixed(DATASET_VIEWER_SETTINGS_FILE, new Blob([serializeDatasetViewerSettings(viewerState)], { type: 'application/yaml' }), 'viewer-state'));
  check();
  if (assets.length >= 100_000) throw new HfError('This dataset has too many files for browser publication.');
  const folders = new Map<string, Set<string>>();
  for (const path of paths) {
    const parts = path.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const parent = parts.slice(0, i - 1).join('/');
      const key = parts.slice(0, i).join('/');
      if (i < parts.length && paths.has(key)) throw new HfError('An output file conflicts with a directory.');
      const entries = folders.get(parent) ?? new Set<string>();
      entries.add(parts[i - 1]); folders.set(parent, entries);
    }
  }
  if ([...folders.values()].some(entries => entries.size >= 10_000)) throw new HfError('A dataset folder has too many files for publication.');
  return { operationId: crypto.randomUUID(), sourceKey: input.sourceKey, modelRevision: input.modelRevision,
    assets, viewerState, imageNameToPath, splatPaths, viewerBaseUrl: input.viewerBaseUrl,
    ...(input.preview ? { previewPath: PUBLICATION_PREVIEW_PATH } : {}),
    counts: { cameras: input.reconstruction.cameras.size, images: input.reconstruction.images.size,
      points: input.reconstruction.globalStats?.totalPoints ?? input.reconstruction.points3D?.size ?? 0 } };
}
