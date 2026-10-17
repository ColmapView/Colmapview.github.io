import type { Camera, Image } from '../types/colmap';
import { getBasename, getParentDir } from '../utils/colmapPathResolver';
import { isImageFile } from '../utils/imageFileLookupPolicy';
import { findImageMappingCsvCandidates, parseImageMappingCsv } from '../utils/imageMappingCsvResolver';
import { NativeMediaPathIndex, type NativeMaskMatch } from './nativeMediaPaths';
import { findNativePhotoCollections } from './nativePhotoCollections';
import { hasCameraDatasetSelector, requestCameraDatasetSelection, type SelectCameraDataset } from './importers/selection';
import { readCameraSourceFile } from './importers/sourceAccess';
import { imageResourceUrl, normalizeSourceIndex } from './importers/sourcePaths';
import type { CameraDatasetImportContext, CameraDatasetSource, ImportDiagnostic, ImportedImageBinding, ImportedFileMask } from './importers/types';

interface NativeMediaSource {
  source: CameraDatasetSource;
  modelDir: string;
  /** Complete physical listing for inference; explicit manifest prefixes may omit it. */
  paths?: readonly string[];
  /** A manifest's explicit image list declares roles, not a complete directory listing. */
  imagePaths?: readonly string[];
  overrides?: Readonly<Record<string, string>>;
  /** Explicit manifests may declare URL prefixes without a server directory listing. */
  declaredImageRoot?: string;
  declaredMaskRoot?: string;
  maskOverrides?: Readonly<Record<string, string>>;
  maskRole?: 'validity' | 'foreground' | 'unknown';
  maskPaths?: readonly string[];
}
// Canonical model keys used by archive/URL loaders must not lose the original source layout.
const sources = new WeakMap<ReadonlyMap<string, File>, NativeMediaSource>();
export function rememberNativeMediaSource(files: ReadonlyMap<string, File>, source: NativeMediaSource): void {
  sources.set(files, source);
}

/** Bind native registered names without changing cameras, observations, IDs, or poses. */
export async function prepareNativeMedia(
  files: ReadonlyMap<string, File>, camerasFile: File,
  cameras: ReadonlyMap<number, Camera>, images: ReadonlyMap<number, Image>, signal?: AbortSignal,
  options: { selectPhotos?: SelectCameraDataset } = {},
): Promise<CameraDatasetImportContext | undefined> {
  const hint = sources.get(files);
  if (!hint && ![...files.keys()].some(isImageFile)) return undefined;
  const originalSource = hint?.source ?? { kind: 'local' as const, files };
  const source = originalSource.kind === 'local' ? { ...originalSource, files: normalizeSourceIndex(originalSource.files) } : originalSource;
  const physicalPaths = hint?.paths ?? (source.kind === 'local' ? [...source.files.keys()]
    : source.kind === 'archive' ? [...source.entries.keys()] : undefined);
  if (!physicalPaths && !hint?.declaredImageRoot) return undefined;
  const paths = physicalPaths ?? [];
  const modelDir = hint?.modelDir ?? getParentDir([...files].find(([, file]) => file === camerasFile)?.[0] ?? '');
  const pathOptions = source.kind === 'url' ? { baseUrl: source.baseUrl } : {};
  const index = new NativeMediaPathIndex(paths, modelDir, pathOptions);
  const photoIndex = hint?.imagePaths ? new NativeMediaPathIndex(hint.imagePaths, modelDir, { ...pathOptions, role: 'photo', layoutPaths: paths }) : index;
  const maskIndex = hint?.maskPaths ? new NativeMediaPathIndex(hint.maskPaths, modelDir, { ...pathOptions, role: 'mask', layoutPaths: paths }) : index;
  const declaredMask = (name: string): NativeMaskMatch | undefined => {
    if (!hint?.declaredMaskRoot || hint.maskPaths || source.kind !== 'url') return undefined;
    const url = imageResourceUrl(hint.declaredMaskRoot, name + '.png');
    if (!physicalPaths) return { status: 'resolved', path: url, role: 'validity' };
    const candidates = [url];
    if (url.startsWith(source.baseUrl)) {
      candidates.push(url.slice(source.baseUrl.length).split('/').map(segment => decodeURIComponent(segment)).join('/'));
    }
    for (const candidate of candidates) {
      const match = index.file(candidate);
      if (match.status !== 'missing') return { ...match, role: 'validity' };
    }
    return undefined;
  };
  const diagnostics: ImportDiagnostic[] = [];
  let overrides = hint?.overrides;
  if (!overrides) {
    const csvPaths = findImageMappingCsvCandidates(paths, modelDir, path => index.resourceIdentity(path));
    if (csvPaths.length > 1) diagnostics.push({ code: 'AMBIGUOUS_IMAGE_MAPPING', severity: 'warning', path: modelDir,
      message: 'Multiple image mappings exist at the nearest model scope; no mapping was selected.' });
    const csvPath = csvPaths.length === 1 ? csvPaths[0] : undefined;
    if (csvPath) {
      try {
        const file = await readCameraSourceFile(source, csvPath, signal, 16 * 1024 * 1024);
        if (file) overrides = parseImageMappingCsv(await file.text());
      } catch (error) {
        signal?.throwIfAborted();
        diagnostics.push({ code: 'UNAVAILABLE_IMAGE_MAPPING', severity: 'warning', path: csvPath,
          message: `Image mapping could not be read: ${error instanceof Error ? error.message : String(error)}` });
      }
    }
  }
  const matches = new Map([...images.values()].map(image => {
    const override = overrides && Object.hasOwn(overrides, image.name) ? overrides[image.name] : undefined;
    if (source.kind === 'url' && override && /^https?:\/\//i.test(override)) return [image.name, { status: 'resolved' as const, path: override }] as const;
    if (override !== undefined) {
      if (source.kind === 'url' && !physicalPaths) return [image.name, { status: 'resolved' as const, path: imageResourceUrl(source.baseUrl, override) }] as const;
      const declared = photoIndex.image(image.name, override);
      return [image.name, declared.status === 'missing' ? index.image(image.name, override) : declared] as const;
    }
    if (!physicalPaths && !hint?.imagePaths && hint?.declaredImageRoot) return [image.name, { status: 'resolved' as const,
      path: imageResourceUrl(source.kind === 'url' ? source.baseUrl : hint.declaredImageRoot,
        override ?? imageResourceUrl(hint.declaredImageRoot, image.name)) }] as const;
    return [image.name, photoIndex.image(image.name, override)] as const;
  }));
  const pathOwners = new Map<string, string[]>();
  for (const [name, match] of matches) {
    if (match.status !== 'resolved' || Object.hasOwn(overrides ?? {}, name)) continue;
    const owners = pathOwners.get(match.path!) ?? []; owners.push(name); pathOwners.set(match.path!, owners);
  }
  for (const [path, owners] of pathOwners) if (owners.length > 1) {
    for (const name of owners) matches.set(name, { status: 'ambiguous', candidates: [path] });
  }
  const unresolved = [...matches].filter(([name, match]) => match.status !== 'resolved' && !Object.hasOwn(overrides ?? {}, name));
  if (unresolved.length) {
    const collections = findNativePhotoCollections(hint?.imagePaths ?? paths, [...images.values()].map(image => image.name),
      path => photoIndex.isScenePhoto(path), { declaredPhotos: hint?.imagePaths !== undefined,
        isSceneRootPhoto: path => photoIndex.isSceneRootPhoto(path), isPhotoPath: path => photoIndex.isPhotoPath(path) });
    const currentCount = [...matches.values()].filter(match => match.status === 'resolved').length;
    const ownCollection = (collection: typeof collections[number]) => [...collection.bindings.values()].every(path => photoIndex.isScenePhoto(path));
    const sceneName = getBasename(index.sceneRoot);
    const viable = collections.filter(collection => collection.bindings.size >= currentCount
      && unresolved.some(([name]) => collection.bindings.has(name))
      && (ownCollection(collection) || Boolean(sceneName && collection.root.split('/').includes(sceneName))));
    const ownComplete = viable.filter(collection => collection.bindings.size === matches.size && ownCollection(collection));
    const relevant = ownComplete.length ? ownComplete : viable;
    const bestCount = Math.max(0, ...relevant.map(collection => collection.bindings.size));
    const best = relevant.filter(collection => collection.bindings.size === bestCount);
    // Identical physical mappings can arise from flat and relative naming; show them once.
    const distinct = best.filter((collection, i) => !best.slice(0, i).some(other => other.bindings.size === collection.bindings.size
      && [...collection.bindings].every(([name, path]) => other.bindings.get(name) === path)));
    let chosen: typeof distinct[number] | undefined;
    if (distinct.length === 1 && bestCount === matches.size
      && [...distinct[0].bindings.values()].every(path => photoIndex.isScenePhoto(path))) chosen = distinct[0];
    else if (distinct.length && (options.selectPhotos || hasCameraDatasetSelector())) {
      const candidates = distinct.map((collection, i) => ({ path: `photos:${i}`, sceneRoot: collection.root, purpose: 'photos' as const,
        label: `${collection.root || '(dataset root)'} — ${collection.bindings.size}/${matches.size} photos${collection.flattened ? ' (flattened names)' : ''}` }));
      candidates.push({ path: 'photos:keep', sceneRoot: index.sceneRoot, purpose: 'photos',
        label: currentCount ? `Keep current matches — ${currentCount}/${matches.size} photos` : 'Load cameras without photos' });
      const selection = await (options.selectPhotos ?? requestCameraDatasetSelection)(candidates, signal);
      signal?.throwIfAborted();
      if (!selection) throw new DOMException('Photo selection cancelled.', 'AbortError');
      const selected = candidates.findIndex(candidate => candidate.path === selection.path);
      if (selected >= 0 && selected < distinct.length) chosen = distinct[selected];
    }
    if (chosen) {
      for (const [name] of matches) {
        if (Object.hasOwn(overrides ?? {}, name)) continue;
        const path = chosen.bindings.get(name);
        matches.set(name, path ? { status: 'resolved', path } : { status: 'missing' });
      }
      diagnostics.push({ code: 'PHOTO_COLLECTION', severity: 'info', path: chosen.root,
        message: `Using ${chosen.bindings.size}/${matches.size} photos from ${chosen.root || '(dataset root)'}.` });
    }
  }
  const bindings = new Map<string, ImportedImageBinding>();
  const nativeMasks = new Map<string, ImportedFileMask>();
  let frameIndex = 0;
  for (const image of images.values()) {
    signal?.throwIfAborted();
    const camera = cameras.get(image.cameraId);
    const match = matches.get(image.name)!;
    const explicitMask = hint?.maskOverrides && Object.hasOwn(hint.maskOverrides, image.name) ? hint.maskOverrides[image.name] : undefined;
    const mask = explicitMask !== undefined ? { status: 'resolved' as const, path: explicitMask, role: hint?.maskRole ?? 'unknown' as const }
      : declaredMask(image.name) ?? maskIndex.mask(image.name, match.status === 'resolved' ? match.path : undefined);
    const maskBinding: ImportedFileMask | undefined = mask.status === 'resolved'
      ? { kind: 'file', path: mask.path!, role: hint?.maskRole ?? mask.role ?? 'unknown', invert: false } : undefined;
    if (mask.status === 'ambiguous') diagnostics.push({ code: 'AMBIGUOUS_MASK_PATH', severity: 'warning',
      path: image.name, frameIndex, message: `Ambiguous source mask: ${image.name}.` });
    if (!camera || match.status !== 'resolved') {
      if (camera && maskBinding) nativeMasks.set(image.name, maskBinding);
      diagnostics.push({ code: match.status === 'ambiguous' ? 'AMBIGUOUS_IMAGE_PATH' : 'MISSING_IMAGE', severity: 'warning',
        path: image.name, frameIndex: frameIndex++, message: `${match.status === 'ambiguous' ? 'Ambiguous' : 'Missing'} source photo: ${image.name}.` });
      continue;
    }
    bindings.set(image.name, { sourceImagePath: match.path!, width: camera.width, height: camera.height, frameIndex: frameIndex++,
      ...(maskBinding ? { mask: maskBinding } : {}) });
  }
  return { source, selection: { metadataPath: modelDir, sceneRoot: index.sceneRoot, schema: 'colmap', split: null },
    bindings, nativeMasks, diagnostics, metadataFrameCount: images.size };
}
