import type { Reconstruction } from '../types/colmap';
import type { ReconstructionSource } from '../wasm/reconstructionService';
import type { Sim3dEuler } from '../types/sim3d';
import type { DatasetAccessOptions, DatasetAccessError } from '../dataset/types';
import type { ImportedImageBinding } from '../dataset/importers/types';
import { normalizeSourcePath } from '../dataset/importers/sourcePaths';
import { readImageDimensions, readImageOrientation } from '../utils/imageDimensions';
import { prepareReconstructionFiles } from './prepareReconstructionFiles';
import { downloadStreamingZip, saveStreamingZip, type AddZipBlob } from './streamingZipExport';
import { awaitWithAbort } from '../utils/awaitWithAbort';
import type { ZipExportProgressCallback } from './reconstructionZipExport';
import { alphaMask } from '../dataset/importers/importedMedia';
import { prepareVideoFrameExport } from '../dataset/video/videoFrameFile';

const ORIGINAL_MEDIA_READ_LIMIT = 64 * 1024 * 1024;
export interface CameraPackageMedia {
  getOriginalImage(name: string, options?: DatasetAccessOptions): Promise<File | null>;
  getMask(name: string, options?: DatasetAccessOptions): Promise<File | null>;
  getBinding?(name: string): ImportedImageBinding | undefined;
}

/** Normalize feature-mask pixels without touching source RGB bytes. */
export async function normalizeFeatureMask(file: Blob, width: number, height: number, invert: boolean, signal: AbortSignal,
  normalization?: 'binary-luminance'): Promise<Blob> {
  if (width * height > 16_000_000) throw new Error('Mask decoding exceeds 16 million pixels.');
  const dimensions = await readImageDimensions(file, { signal });
  if (!dimensions || dimensions.width !== width || dimensions.height !== height || await readImageOrientation(file, signal) !== 1) {
    throw new Error('Mask dimensions or orientation do not match the camera.');
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: 'none', premultiplyAlpha: 'none' });
  try {
    signal.throwIfAborted();
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Mask decoder unavailable.');
    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      if (!normalization && (pixels.data[i] !== pixels.data[i + 1] || pixels.data[i] !== pixels.data[i + 2])) throw new Error('Colored label masks cannot be exported as feature masks.');
      // IDR object masks explicitly use luminance > half intensity, including RGB edge artifacts.
      const foreground = normalization === 'binary-luminance'
        ? Number(.2125 * pixels.data[i] + .7154 * pixels.data[i + 1] + .0721 * pixels.data[i + 2] > 127.5) * 255
        : pixels.data[i];
      const value = invert ? 255 - foreground : foreground;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value; pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Mask encoding failed.')), 'image/png'));
  } finally { bitmap.close(); }
}

/** Await each disk write before reading the next original. Only a complete package is downloaded. */
export async function writeCameraDatasetPackage(reconstruction: Reconstruction, source: ReconstructionSource | null,
  transform: Sim3dEuler, media: CameraPackageMedia, includeMasks: boolean, signal: AbortSignal,
  write: AddZipBlob, onProgress?: ZipExportProgressCallback): Promise<{ maskCount: number }> {
  signal.throwIfAborted();
  const images = [...reconstruction.images.values()];
  const names = new Map<number, string>(), used = new Set<string>();
  for (const image of images) {
    // COLMAP names are relative to the image root, including any real images/ subdirectory.
    const name = normalizeSourcePath(image.name);
    if (!name || used.has(name.toLowerCase())) throw new Error(`Duplicate export image path: ${name}`);
    used.add(name.toLowerCase()); names.set(image.imageId, name);
  }
  const native = await prepareReconstructionFiles(reconstruction, source, transform, signal, names);
  type PathNode = { file: boolean; children: Map<string, PathNode> };
  const root: PathNode = { file: false, children: new Map() };
  function reservePath(path: string) {
    let node = root;
    // A ZIP can contain a file and its descendants, but it cannot be extracted.
    // Follow the existing case-insensitive export policy for every path segment.
    for (const segment of path.toLowerCase().split('/')) {
      if (node.file) throw new Error(`Package path conflict: ${path}. A file and directory use the same name.`);
      let child = node.children.get(segment);
      if (!child) { child = { file: false, children: new Map() }; node.children.set(segment, child); }
      node = child;
    }
    if (node.file) throw new Error(`Duplicate package path: ${path}`);
    if (node.children.size) throw new Error(`Package path conflict: ${path}. A file and directory use the same name.`);
    node.file = true;
  }
  let maskCount = 0;
  async function add(path: string, blob: Blob) {
    signal.throwIfAborted();
    reservePath(path);
    await write(path, blob);
    signal.throwIfAborted();
  }
  for (const [path, blob] of Object.entries(native)) await add(`sparse/0/${path}`, blob);
  for (let index = 0; index < images.length; index++) {
    signal.throwIfAborted();
    const image = images[index], name = names.get(image.imageId)!;
    let failure: DatasetAccessError | undefined;
    const options: DatasetAccessOptions = { signal, priority: 'selected', maxBytes: ORIGINAL_MEDIA_READ_LIMIT, onError: error => { failure = error; } };
    const rgb = await media.getOriginalImage(image.name, options);
    if (!rgb) throw new Error(`Required original photo is unavailable: ${image.name}${failure ? ` (${failure.message})` : ''}`);
    if (rgb.size > options.maxBytes!) throw new Error(`Original photo exceeds its read budget: ${image.name}`);
    const camera = reconstruction.cameras.get(image.cameraId);
    if (!camera) throw new Error(`Camera calibration is unavailable: ${image.name}`);
    const size = await readImageDimensions(rgb, { signal });
    if (!size || size.width !== camera.width || size.height !== camera.height || await readImageOrientation(rgb, signal) !== 1) throw new Error(`Original photo does not match camera calibration: ${image.name}`);
    const decoded = await awaitWithAbort(createImageBitmap(rgb, { imageOrientation: 'none', resizeWidth: 1, resizeHeight: 1 }), signal, bitmap => bitmap.close());
    decoded.close(); signal.throwIfAborted();
    await add(`images/${name}`, await prepareVideoFrameExport(rgb, name, signal));
    if (includeMasks) {
      const binding = media.getBinding?.(image.name);
      if (binding?.mask?.kind === 'file' && (binding.mask.role === 'unknown' || binding.mask.role === 'label')) {
        throw new Error(`Mask role is unverified for ${image.name}; export model and images instead.`);
      }
      failure = undefined;
      // Derive alpha from the already-read original, rather than fetching it a second time.
      const mask = binding?.mask?.kind === 'alpha' ? await alphaMask(rgb, image.name, signal)
        : await media.getMask(image.name, options);
      if (failure) throw new Error(`Mask read failed for ${image.name}: ${(failure as DatasetAccessError).message}`);
      if (!mask && binding?.mask?.kind === 'file') throw new Error(`Declared mask is unavailable: ${image.name}`);
      if (mask) {
        if (mask.size > ORIGINAL_MEDIA_READ_LIMIT) throw new Error(`Mask exceeds its read budget: ${image.name}`);
        const invert = binding?.mask?.kind === 'file' && (binding.mask.invert || binding.mask.role === 'ignore');
        const png = await normalizeFeatureMask(mask, camera.width, camera.height, Boolean(invert), signal,
          binding?.mask?.kind === 'file' ? binding.mask.normalization : undefined);
        await add(`masks/${name}.png`, png); maskCount++;
      }
    }
    onProgress?.(10 + Math.round(80 * (index + 1) / Math.max(1, images.length)), `Writing original photos (${index + 1}/${images.length})...`);
  }
  return { maskCount };
}
export const getCameraPackageFilename = (includeMasks: boolean) => includeMasks ? 'colmap-images-masks.zip' : 'colmap-images.zip';

export async function downloadCameraDatasetPackage(reconstruction: Reconstruction, source: ReconstructionSource | null,
  transform: Sim3dEuler, media: CameraPackageMedia, includeMasks: boolean, signal: AbortSignal,
  onProgress?: ZipExportProgressCallback, destination?: FileSystemFileHandle): Promise<number> {
  const content = async (write: AddZipBlob, exportSignal: AbortSignal) => {
    const result = await writeCameraDatasetPackage(reconstruction, source, transform, media, includeMasks, exportSignal, write, onProgress);
    onProgress?.(95, 'Finishing dataset...');
    return result;
  };
  const result = destination ? await saveStreamingZip(destination, signal, content)
    : await downloadStreamingZip(getCameraPackageFilename(includeMasks), signal, content);
  onProgress?.(100, 'Complete');
  return result.maskCount;
}
