import type { DatasetSourceAdapter } from '../datasetSourceAdapters';
import type { DatasetAccessOptions, DatasetState } from '../types';
import type { CameraDatasetImportContext, ImportedImageBinding } from './types';
import { importError } from './types';
import { imageResourceUrl } from './sourcePaths';
import { cameraSourceArchiveEntry, readCameraSourceFile, MAX_CAMERA_MEDIA_BYTES } from './sourceAccess';
import { readImageDimensions, readImageOrientation } from '../../utils/imageDimensions';
import { fetchUrlImage, fetchUrlImageRaw, getUrlImageCached, fetchUrlMask } from '../../utils/urlImageFiles';
import { fetchZipImage, getZipImageCached, fetchZipMask } from '../../utils/zipImageFiles';
import { createUrlFileCache } from '../urlFileCache';

const contexts = new WeakMap<CameraDatasetImportContext, {
  validated: Set<string>; opaque: Set<string>; masks: ReturnType<ReturnType<typeof createUrlFileCache>['scope']>;
}>();
function cache(context: CameraDatasetImportContext) {
  let state = contexts.get(context);
  if (!state) {
    state = { validated: new Set(), opaque: new Set(), masks: createUrlFileCache(32 * 1024 * 1024).scope('derived') };
    contexts.set(context, state);
  }
  return state;
}
export async function validateImportedImage(file: Blob, binding: ImportedImageBinding, signal?: AbortSignal): Promise<void> {
  const size = await readImageDimensions(file, { signal });
  if (!size || size.width !== binding.width || size.height !== binding.height) {
    importError('IMAGE_DIMENSION_MISMATCH', `Photo dimensions do not match calibration: ${binding.sourceImagePath}.`);
  }
  if (await readImageOrientation(file, signal) !== 1) {
    importError('UNSUPPORTED_IMAGE_ORIENTATION', `Normalize EXIF orientation and calibration before importing ${binding.sourceImagePath}.`);
  }
}
const contextOf = (state: DatasetState) => (state.loadedFiles!.cameraImport ?? state.loadedFiles!.nativeMedia)!;
// Native COLMAP often ships downsampled previews. Package export separately checks calibration.
const isNative = (context: CameraDatasetImportContext) => context.selection.schema === 'colmap';
async function original(state: DatasetState, name: string, options?: DatasetAccessOptions): Promise<File | null> {
  const context = contextOf(state), binding = context.bindings.get(name);
  if (!binding || options?.signal?.aborted) return null;
  const file = context.source.kind === 'url' && !cameraSourceArchiveEntry(context.source, binding.sourceImagePath)
    ? await fetchUrlImageRaw(null, name, imageResourceUrl(context.source.baseUrl,binding.sourceImagePath), { ...options, maxBytes: options?.maxBytes ?? MAX_CAMERA_MEDIA_BYTES })
    : await readCameraSourceFile(context.source, binding.sourceImagePath, options?.signal, options?.maxBytes ?? MAX_CAMERA_MEDIA_BYTES);
  if (file) {
    if (!isNative(context)) await validateImportedImage(file, binding, options?.signal);
    cache(context).validated.add(name);
  }
  return file;
}
async function display(state: DatasetState, name: string, options?: DatasetAccessOptions): Promise<File | null> {
  const context = contextOf(state), binding = context.bindings.get(name);
  if (!binding || options?.signal?.aborted) return null;
  const validate = async (file: Blob, signal: AbortSignal) => {
    if (!isNative(context)) await validateImportedImage(file, binding, signal);
    cache(context).validated.add(name);
  };
  if (context.source.kind === 'local') return original(state, name, options);
  const entry = cameraSourceArchiveEntry(context.source, binding.sourceImagePath);
  if (entry) return fetchZipImage(name, options, entry, validate);
  if (context.source.kind === 'url') return fetchUrlImage(null, name, imageResourceUrl(context.source.baseUrl, binding.sourceImagePath), { ...options, maxBytes: options?.maxBytes ?? MAX_CAMERA_MEDIA_BYTES }, validate);
  return null;
}

/** Generate a grayscale validity mask from original RGBA, retaining partial alpha. */
export async function alphaMask(file: Blob, name: string, signal?: AbortSignal): Promise<File | null> {
  const size = await readImageDimensions(file, { signal });
  if (!size || size.width * size.height > 16_000_000) importError('IMPORT_LIMIT_EXCEEDED', 'Alpha mask decoding exceeds 16 million pixels.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'none', premultiplyAlpha: 'none' });
  try {
    signal?.throwIfAborted();
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Mask decoding is unavailable.');
    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let transparent = false;
    for (let i = 0; i < pixels.data.length; i += 4) {
      const alpha = pixels.data[i + 3]; transparent ||= alpha !== 255;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = alpha; pixels.data[i + 3] = 255;
    }
    if (!transparent) return null;
    ctx.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Mask encoding failed.')), 'image/png'));
    signal?.throwIfAborted();
    return new File([blob], `${name}.png`, { type: 'image/png' });
  } finally { bitmap.close(); }
}
async function mask(state: DatasetState, name: string, options?: DatasetAccessOptions): Promise<File | null> {
  const context = contextOf(state), binding = context.bindings.get(name);
  const mask = binding?.mask ?? (isNative(context) ? context.nativeMasks?.get(name) : undefined);
  if (!mask || options?.signal?.aborted) return null;
  const cached = cache(context);
  const previous = cached.masks.get(name);
  if (previous) {
    if (previous.size > (options?.maxBytes ?? MAX_CAMERA_MEDIA_BYTES)) importError('IMPORT_LIMIT_EXCEEDED', `${name} mask exceeds its read budget.`);
    return previous;
  }
  if (mask.kind === 'alpha') {
    if (cached.opaque.has(name)) return null;
    const file = await original(state, name, options); if (!file) return null;
    const derived = await alphaMask(file, name, options?.signal);
    if (derived) {
      if (derived.size > (options?.maxBytes ?? MAX_CAMERA_MEDIA_BYTES)) importError('IMPORT_LIMIT_EXCEEDED',`${name} mask exceeds its read budget.`);
      cached.masks.set(name, derived);
    } else cached.opaque.add(name);
    return derived;
  }
  let file: File | null;
  const archiveEntry = cameraSourceArchiveEntry(context.source, mask.path);
  if (context.source.kind === 'local') file = await readCameraSourceFile(context.source, mask.path, options?.signal, options?.maxBytes);
  else if (archiveEntry) file = await fetchZipMask(name, options, archiveEntry);
  else if (context.source.kind === 'url') file = await fetchUrlMask(context.source.baseUrl, name, { ...options, maxBytes: options?.maxBytes ?? MAX_CAMERA_MEDIA_BYTES }, imageResourceUrl(context.source.baseUrl, mask.path));
  else {
    const entry = context.source.entries.get(mask.path);
    file = entry ? await fetchZipMask(name, options, entry) : null;
  }
  if (!file) return null;
  if (!isNative(context)) {
    if (!binding) return null;
    const size = await readImageDimensions(file, { signal: options?.signal });
    if (!size || size.width !== binding.width || size.height !== binding.height) importError('MASK_DIMENSION_MISMATCH', `Mask dimensions do not match ${name}.`);
    if (await readImageOrientation(file, options?.signal) !== 1) importError('UNSUPPORTED_IMAGE_ORIENTATION', `Mask orientation does not match ${name}.`);
  }
  cached.masks.set(name, file);
  return file;
}
export const importedSourceAdapter: DatasetSourceAdapter = {
  getImage: display, getOriginalImage: original, getMask: mask,
  getImageSync(state, name) {
    const context = contextOf(state), binding = context.bindings.get(name);
    if (!binding || (!(isNative(context) && context.source.kind === 'local') && !cache(context).validated.has(name))) return undefined;
    if (context.source.kind === 'local') return context.source.files.get(binding.sourceImagePath);
    const entry = cameraSourceArchiveEntry(context.source, binding.sourceImagePath);
    if (entry) return getZipImageCached(name, entry);
    if (context.source.kind === 'url') return getUrlImageCached(name, null, imageResourceUrl(context.source.baseUrl, binding.sourceImagePath));
    return getZipImageCached(name,context.source.entries.get(binding.sourceImagePath));
  },
  getMaskSync(state, name) {
    const context = contextOf(state), binding = context.bindings.get(name);
    const mask = binding?.mask ?? (isNative(context) ? context.nativeMasks?.get(name) : undefined);
    if (isNative(context) && context.source.kind === 'local' && mask?.kind === 'file') {
      return context.source.files.get(mask.path);
    }
    // Only validated masks are published synchronously.
    return cache(context).masks.get(name);
  },
  async prefetchImages(state, names, concurrency, options) {
    const batch = Math.max(1, Math.min(8, Math.floor(concurrency) || 1));
    for (let i = 0; i < names.length; i += batch) {
      if (options?.signal?.aborted) return;
      await Promise.all(names.slice(i, i + batch).map(name => display(state, name, { ...options, priority: 'prefetch' })));
    }
  },
  hasImages: state => contextOf(state).bindings.size > 0,
  hasMasks: state => {
    const context = contextOf(state);
    return [...context.bindings.values()].some(binding => Boolean(binding.mask)) || Boolean(isNative(context) && context.nativeMasks?.size);
  },
};
