/**
 * File classification utilities for COLMAP file handling.
 * Extracted from useFileDropzone.ts for better organization.
 */

import type { Reconstruction, Camera, GlobalStats, Image as ColmapImage, SplatFileSource } from '../types/colmap';
import { CameraModelId } from '../types/colmap';
import {
  compareSplatCandidates,
  getPreferredSplatCandidate,
  isSplatFilePath,
  type SplatCandidate,
} from './splatFilePolicy';
import { resolveColmapPaths } from './colmapPathResolver';

export interface ColmapFileSelection {
  camerasFile?: File;
  imagesFile?: File;
  points3DFile?: File;
  databaseFile?: File;
  rigsFile?: File;
  framesFile?: File;
}

/**
 * Find a configuration file (YAML) in the file map
 */
export function findConfigFile(files: Map<string, File>): File | null {
  for (const [, file] of files) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.yaml') || name.endsWith('.yml')) {
      return file;
    }
  }
  return null;
}

/**
 * Find the best complete COLMAP file set from scanned files.
 * Prefers complete sparse/0 directories and binary files over text files.
 */
export function findColmapFiles(files: Map<string, File>): ColmapFileSelection {
  return findColmapFilesInternal(files, { requirePoints3D: true });
}

export function findColmapCameraImageFiles(files: Map<string, File>): ColmapFileSelection {
  return findColmapFilesInternal(files, { requirePoints3D: false });
}

function findColmapFilesInternal(
  files: Map<string, File>,
  options: { requirePoints3D: boolean }
): ColmapFileSelection {
  // Resolve the best COLMAP model directory from the dropped/scanned paths.
  // The resolver returns the exact map keys it selected, so each maps straight
  // back to its File. Works for sparse/0, colmap/, the root, or nested layouts.
  const selection = resolveColmapPaths(files.keys(), {
    requirePoints3D: options.requirePoints3D,
  });
  if (!selection) {
    return {};
  }

  return {
    camerasFile: selection.cameras ? files.get(selection.cameras) : undefined,
    imagesFile: selection.images ? files.get(selection.images) : undefined,
    points3DFile: selection.points3D ? files.get(selection.points3D) : undefined,
    databaseFile: selection.database ? files.get(selection.database) : undefined,
    rigsFile: selection.rigs ? files.get(selection.rigs) : undefined,
    framesFile: selection.frames ? files.get(selection.frames) : undefined,
  };
}

/**
 * Check if the file map contains COLMAP files
 */
export function hasColmapFiles(files: Map<string, File>): boolean {
  for (const [, file] of files) {
    const name = file.name.toLowerCase();
    if (
      name === 'cameras.bin' || name === 'cameras.txt' ||
      name === 'images.bin' || name === 'images.txt' ||
      name === 'points3d.bin' || name === 'points3d.txt'
    ) {
      return true;
    }
  }
  return false;
}

interface LocalSplatCandidate extends SplatCandidate {
  file: File;
}

function normalizeSplatSourcePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

function getLocalSplatCandidates(files: Map<string, File>): LocalSplatCandidate[] {
  const seen = new Set<File>();
  const candidates: LocalSplatCandidate[] = [];

  for (const [path, file] of files) {
    const candidatePath = normalizeSplatSourcePath(isSplatFilePath(path) ? path : file.name);
    if (!isSplatFilePath(candidatePath) || seen.has(file)) {
      continue;
    }

    seen.add(file);
    candidates.push({
      path: candidatePath,
      size: file.size,
      file,
    });
  }

  return candidates;
}

/**
 * Find all splat files in a scanned dataset, sorted by default preference:
 * largest SPZ first, then largest PLY.
 */
export function findSplatFiles(files: Map<string, File>): File[] {
  return findSplatFileSources(files)
    .map((candidate) => candidate.file)
    .filter((file): file is File => Boolean(file));
}

export function findSplatFileSources(files: Map<string, File>): SplatFileSource[] {
  return getLocalSplatCandidates(files)
    .sort((a, b) => compareSplatCandidates(b, a))
    .map((candidate) => ({
      id: candidate.path,
      path: candidate.path,
      file: candidate.file,
    }));
}

/**
 * Find the preferred splat file in a scanned dataset.
 */
export function findPreferredSplatFile(files: Map<string, File>): File | undefined {
  const preferred = getLocalSplatCandidates(files).reduce<LocalSplatCandidate | null>(
    getPreferredSplatCandidate,
    null
  );
  return preferred?.file;
}

/**
 * Find the largest PLY file in a scanned dataset.
 * Kept for callers that specifically need raw PLY selection.
 */
export function findLargestPlyFile(files: Map<string, File>): File | undefined {
  return getLocalSplatCandidates(files)
    .filter((candidate) => candidate.path.toLowerCase().endsWith('.ply'))
    .reduce<LocalSplatCandidate | null>(
      (largest, candidate) => !largest || candidate.size > largest.size ? candidate : largest,
      null
    )?.file;
}

/**
 * Check if the dropped files contain image files
 */
export function hasImageFiles(files: Map<string, File>): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif'];
  for (const [, file] of files) {
    const name = file.name.toLowerCase();
    if (imageExtensions.some(ext => name.endsWith(ext))) {
      return true;
    }
  }
  return false;
}

function createEmptyGlobalStats(): GlobalStats {
  return {
    minError: 0,
    maxError: 0,
    avgError: 0,
    minTrackLength: 0,
    maxTrackLength: 0,
    avgTrackLength: 0,
    totalObservations: 0,
    totalPoints: 0,
  };
}

export function createEmptyReconstruction(): Reconstruction {
  return {
    cameras: new Map(),
    images: new Map(),
    imageStats: new Map(),
    connectedImagesIndex: new Map(),
    globalStats: createEmptyGlobalStats(),
    imageToPoint3DIds: new Map(),
  };
}

/**
 * Create a minimal reconstruction from image files only (no COLMAP data)
 * This allows users to view images in the gallery without poses or 3D points
 */
export function createImagesOnlyReconstruction(imageFiles: Map<string, File>): Reconstruction {
  // Create a single dummy camera with default dimensions
  // We use 1920x1080 as reasonable defaults to avoid NaN issues in frustum calculations
  const dummyCameraId = 1;
  const defaultWidth = 1920;
  const defaultHeight = 1080;
  const dummyCamera: Camera = {
    cameraId: dummyCameraId,
    modelId: CameraModelId.PINHOLE,
    width: defaultWidth,
    height: defaultHeight,
    params: [defaultWidth, defaultWidth, defaultWidth / 2, defaultHeight / 2], // fx, fy, cx, cy
  };

  const cameras = new Map<number, Camera>();
  cameras.set(dummyCameraId, dummyCamera);

  // Create Image entries for each image file
  const images = new Map<number, ColmapImage>();
  const imageStats = new Map<number, { numPoints3D: number; avgError: number; covisibleCount: number }>();

  // Get unique image names (the lookup map may have multiple keys per file)
  const uniqueFileNames = new Set<string>();
  for (const [, file] of imageFiles) {
    uniqueFileNames.add(file.name);
  }

  let imageId = 1;
  for (const fileName of uniqueFileNames) {
    const image: ColmapImage = {
      imageId,
      cameraId: dummyCameraId,
      name: fileName,
      qvec: [1, 0, 0, 0], // Identity quaternion (no rotation)
      tvec: [0, 0, 0],     // No translation
      points2D: [],
      numPoints2D: 0,
    };
    images.set(imageId, image);

    // Empty stats for images-only mode
    imageStats.set(imageId, {
      numPoints3D: 0,
      avgError: 0,
      covisibleCount: 0,
    });

    imageId++;
  }

  return {
    cameras,
    images,
    imageStats,
    connectedImagesIndex: new Map(),
    globalStats: createEmptyGlobalStats(),
    imageToPoint3DIds: new Map(),
  };
}
