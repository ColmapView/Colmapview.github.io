import { getDatasetManager } from '../dataset';
import { writeCamerasBinary, writeFramesBinary, writeImagesBinary, writePoints3DBinary, writeRigsBinary } from '../parsers/colmapBinaryWriters';
import { sortedKeys } from '../parsers/colmapWriterUtils';
import { getPoints3DForExport } from '../parsers/reconstructionExportData';
import { hasPendingDeletions, selectPointCount, useReconstructionStore, useTransformStore } from '../store';
import type { Image, ImageId } from '../types/colmap';
import { createSolidTrainingMask, encodeTrainingJpeg, normalizeTrainingMask } from './trainingImageEncoding';
import { sha256Hex } from './trainingIntegrity';
import type { TrainingSnapshot, TrainingSnapshotFile } from './types';

const sourceIdsKey = Symbol.for('colmapview.training.source-ids.v1');
const runtime = globalThis as typeof globalThis & { [key: symbol]: unknown };
const retainedSourceIds = runtime[sourceIdsKey];
// Vite may replace this module while preserving Zustand and reconstruction
// state. Keep the weak identity registry for the page lifetime so a hot reload
// cannot strand an otherwise valid snapshot.
const sourceIds = retainedSourceIds instanceof WeakMap
  ? retainedSourceIds as WeakMap<object, string>
  : new WeakMap<object, string>();
runtime[sourceIdsKey] = sourceIds;

function uniqueId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function sourceIdFor(reconstruction: object): string {
  const known = sourceIds.get(reconstruction);
  if (known) return known;
  const created = uniqueId('reconstruction');
  sourceIds.set(reconstruction, created);
  return created;
}

function binaryFile(bytes: ArrayBuffer, name: string): File {
  return new File([bytes], name, { type: 'application/octet-stream' });
}

export interface TrainingSnapshotOptions {
  maskSource: 'none' | 'directory' | 'alpha' | 'auto';
  missingMaskPolicy?: 'error' | 'full_foreground';
  missingMaskTransport?: 'materialize' | 'omit';
  invertMasks?: boolean;
  signal?: AbortSignal;
  snapshotId?: string;
  verifyUploadedReceipts?: boolean;
}

function jpegName(name: string): string {
  const normalized = name.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  const dot = normalized.lastIndexOf('.');
  const stemEnd = dot > slash + 1 ? dot : normalized.length;
  return `${normalized.slice(0, stemEnd)}.jpg`;
}

/** Preserve ordinary COLMAP stems; add an image-id suffix only for extension collisions. */
function jpegImageNames(images: Map<ImageId, Image>): Map<ImageId, string> {
  const candidates = new Map([...images].map(([id, image]) => [id, jpegName(image.name)]));
  const counts = new Map<string, number>();
  for (const candidate of candidates.values()) {
    const key = candidate.toLocaleLowerCase('en-US');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const result = new Map<ImageId, string>();
  const used = new Set<string>();
  const entries = [...candidates].sort(([left], [right]) => left - right);
  for (const [id, candidate] of entries.filter(([, value]) => counts.get(value.toLocaleLowerCase('en-US')) === 1)) {
    result.set(id, candidate);
    used.add(candidate.toLocaleLowerCase('en-US'));
  }
  for (const [id, candidate] of entries.filter(([, value]) => counts.get(value.toLocaleLowerCase('en-US')) !== 1)) {
    const stem = candidate.slice(0, -4);
    let unique = `${stem}.colmap-${id}.jpg`;
    while (used.has(unique.toLocaleLowerCase('en-US'))) unique = `${unique.slice(0, -4)}_.jpg`;
    result.set(id, unique);
    used.add(unique.toLocaleLowerCase('en-US'));
  }
  return result;
}

/**
 * Captures the entire loaded reconstruction, never selection/display cache data.
 * Image access goes through DatasetManager.getMetricImage so ZIP and URL sources
 * retain their original handles for the lifetime of the upload. Ordinary source
 * images are materialized as full-resolution JPEG Q90 immediately before PUT.
 */
export async function createTrainingSnapshot({
  maskSource,
  missingMaskPolicy = 'error',
  missingMaskTransport = 'materialize',
  invertMasks = false,
  signal,
  snapshotId,
  verifyUploadedReceipts = false,
}: TrainingSnapshotOptions): Promise<TrainingSnapshot> {
  signal?.throwIfAborted();
  const state = useReconstructionStore.getState();
  const reconstruction = state.reconstruction;
  if (!reconstruction) throw new Error('Load a reconstruction before training.');
  if (hasPendingDeletions()) throw new Error('Apply or reset pending deletions before training.');
  const sourceId = sourceIdFor(reconstruction);
  // Match the binary writer's canonical order so transfer starts with the same
  // anchor image that the backend uses for initial camera/image calibration.
  const imageRecords = sortedKeys(reconstruction.images).map(id => {
    const image = reconstruction.images.get(id)!;
    return { id, image, sourceName: image.name };
  });
  const imageNames = imageRecords.map(({ sourceName }) => sourceName);
  const capturedDataset = getDatasetManager().snapshot(imageNames);
  const maskAvailability = new Map(imageNames.map(name => [name, capturedDataset.hasMask(name)]));
  const hasDirectoryMasks = [...maskAvailability.values()].some(Boolean);
  const usesDirectoryMasks = maskSource === 'directory' || (maskSource === 'auto' && hasDirectoryMasks);
  // Alpha masks are carried inside the original source file. Re-encoding those
  // files could remove or fabricate an alpha channel, so this mode is the one
  // deliberate exception to JPEG normalization.
  const preserveSourceAlpha = maskSource === 'alpha' || (maskSource === 'auto' && !hasDirectoryMasks);
  const uploadNames = preserveSourceAlpha
    ? new Map(imageRecords.map(({ id, sourceName }) => [id, sourceName]))
    : jpegImageNames(reconstruction.images);
  const snapshotImages = new Map(imageRecords.map(({ id, image }) => [id, { ...image, name: uploadNames.get(id)! }]));
  const guardedImageRead = async (imageName: string, readSignal?: AbortSignal): Promise<File> => {
    readSignal?.throwIfAborted();
    if (!isSourceIdForCurrentReconstruction(sourceId)) throw new Error('The loaded reconstruction changed before upload.');
    const file = await capturedDataset.getMetricImage(imageName, readSignal);
    readSignal?.throwIfAborted();
    if (!isSourceIdForCurrentReconstruction(sourceId)) throw new Error('The loaded reconstruction changed during upload.');
    if (!file) throw new Error(`Original image is unavailable: ${imageName}`);
    return file;
  };
  const guardedMaskRead = async (imageName: string, readSignal?: AbortSignal): Promise<File | null> => {
    readSignal?.throwIfAborted();
    if (!isSourceIdForCurrentReconstruction(sourceId)) throw new Error('The loaded reconstruction changed before upload.');
    const file = await capturedDataset.getMask(imageName, readSignal);
    readSignal?.throwIfAborted();
    if (!isSourceIdForCurrentReconstruction(sourceId)) throw new Error('The loaded reconstruction changed during upload.');
    return file;
  };
  const fallbackMasks = new Map<string, Promise<File>>();
  const fallbackMask = async (width: number, height: number, name: string, readSignal?: AbortSignal) => {
    const foreground = !invertMasks;
    const key = `${width}x${height}:${foreground ? 'foreground' : 'inverted-foreground'}`;
    let pending = fallbackMasks.get(key);
    if (!pending) {
      pending = createSolidTrainingMask(width, height, foreground, name, readSignal);
      fallbackMasks.set(key, pending);
      void pending.catch(() => fallbackMasks.delete(key));
    }
    const template = await pending;
    readSignal?.throwIfAborted();
    return new File([template], name, { type: 'image/png' });
  };
  // There is no await between reading store/WASM state and completing every
  // binary writer. JavaScript edits cannot interleave with this short guard.
  const modelFile = (id: string, path: string, read: () => File): TrainingSnapshotFile => {
    const file = read();
    return { id, role: 'model', path, file, expectedBytes: file.size, read: async (readSignal) => {
      readSignal?.throwIfAborted();
      return file;
    } };
  };

  const files: TrainingSnapshotFile[] = [
    modelFile('cameras', 'sparse/0/cameras.bin', () => binaryFile(writeCamerasBinary(reconstruction.cameras), 'cameras.bin')),
    modelFile('images', 'sparse/0/images.bin', () => binaryFile(writeImagesBinary(snapshotImages, state.wasmReconstruction), 'images.bin')),
    modelFile('points3d', 'sparse/0/points3D.bin', () => binaryFile(writePoints3DBinary(getPoints3DForExport(reconstruction, state.wasmReconstruction)), 'points3D.bin')),
  ];
  if (reconstruction.rigData?.rigs.size) {
    files.push(modelFile('rigs', 'sparse/0/rigs.bin', () => binaryFile(writeRigsBinary(reconstruction.rigData!.rigs), 'rigs.bin')));
  }
  if (reconstruction.rigData?.frames.size) {
    files.push(modelFile('frames', 'sparse/0/frames.bin', () => binaryFile(writeFramesBinary(reconstruction.rigData!.frames), 'frames.bin')));
  }

  for (const { id, image, sourceName } of imageRecords) {
    const uploadName = uploadNames.get(id)!;
    const sourceCamera = reconstruction.cameras.get(image.cameraId);
    const dimensions = sourceCamera ? { width: sourceCamera.width, height: sourceCamera.height } : undefined;
    const preparationBytes = dimensions ? dimensions.width * dimensions.height * 4 + 1024 * 1024 : undefined;
    files.push({
      id: uniqueId('image'), role: 'image', path: `images/${uploadName}`, image_name: uploadName, expectedBytes: null,
      preparationBytes,
      read: async (readSignal) => {
        const original = await guardedImageRead(sourceName, readSignal);
        const encoded = preserveSourceAlpha ? original : await encodeTrainingJpeg(original, uploadName, readSignal, { dimensions });
        readSignal?.throwIfAborted();
        if (!isSourceIdForCurrentReconstruction(sourceId)) throw new Error('The loaded reconstruction changed during image conversion.');
        return encoded;
      },
    });
    const omitMissing = missingMaskPolicy === 'full_foreground' && missingMaskTransport === 'omit';
    const shouldDeclareMask = (!omitMissing || maskAvailability.get(sourceName)) && (maskSource === 'directory'
      || (maskSource === 'auto' && (maskAvailability.get(sourceName)
        || (usesDirectoryMasks && missingMaskPolicy === 'full_foreground'))));
    if (shouldDeclareMask) {
      const maskName = `${uploadName}.png`;
      files.push({
        id: uniqueId('mask'), role: 'mask', path: `masks/${maskName}`, image_name: uploadName, expectedBytes: null,
        preparationBytes,
        read: async (readSignal) => {
          const original = await guardedMaskRead(sourceName, readSignal);
          if (!original) {
            if (missingMaskPolicy !== 'full_foreground' || omitMissing) throw new Error(`Mask is unavailable: ${sourceName}`);
            const camera = reconstruction.cameras.get(image.cameraId);
            if (!camera) throw new Error(`Camera is unavailable for mask fallback: ${sourceName}`);
            return fallbackMask(camera.width, camera.height, maskName, readSignal);
          }
          const encoded = await normalizeTrainingMask(original, maskName, readSignal, { dimensions });
          readSignal?.throwIfAborted();
          if (!isSourceIdForCurrentReconstruction(sourceId)) throw new Error('The loaded reconstruction changed during mask conversion.');
          return encoded;
        },
      });
    }
  }

  const fingerprintRows = await Promise.all(files.map(async (file) => {
    const modelSha256 = file.role === 'model' && file.file ? await sha256Hex(file.file) : null;
    if (modelSha256) file.expectedSha256 = modelSha256;
    return {
      path: file.path,
      role: file.role,
      imageName: file.image_name ?? null,
      expectedBytes: file.expectedBytes ?? file.file?.size ?? null,
      modelSha256,
    };
  }));
  signal?.throwIfAborted();
  if (!isSourceIdForCurrentReconstruction(sourceId)) {
    throw new Error('The loaded reconstruction changed while preparing its upload manifest.');
  }
  const sourceFingerprint = await sha256Hex(new Blob([JSON.stringify(fingerprintRows)]));
  signal?.throwIfAborted();
  if (!isSourceIdForCurrentReconstruction(sourceId)) {
    throw new Error('The loaded reconstruction changed while preparing its upload identity.');
  }

  const sourceLabel = state.sourceUrl ?? state.loadedFiles?.camerasFile?.name ?? 'Loaded reconstruction';
  return {
    splatTransformBaseline: structuredClone(useTransformStore.getState().splatTransform),
    id: snapshotId ?? uniqueId('snapshot'),
    sourceId,
    sourceLabel,
    sourceFingerprint,
    verifyUploadedReceipts,
    imageCount: imageNames.length,
    pointCount: selectPointCount(state),
    files,
  };
}

export function isSnapshotForCurrentReconstruction(snapshot: TrainingSnapshot): boolean {
  return isSourceIdForCurrentReconstruction(snapshot.sourceId);
}

export function isSourceIdForCurrentReconstruction(sourceId: string): boolean {
  const reconstruction = useReconstructionStore.getState().reconstruction;
  return reconstruction !== null && sourceIds.get(reconstruction) === sourceId;
}

/**
 * Reconnect an in-memory snapshot after a module hot replacement. Snapshots
 * themselves are intentionally excluded from persisted storage, so an
 * unbound snapshot can only have survived within this page runtime.
 */
export function restoreRuntimeSnapshotSource(snapshot: TrainingSnapshot): boolean {
  const reconstruction = useReconstructionStore.getState().reconstruction;
  if (!reconstruction) return false;
  const current = sourceIds.get(reconstruction);
  if (current) return current === snapshot.sourceId;
  sourceIds.set(reconstruction, snapshot.sourceId);
  return true;
}
