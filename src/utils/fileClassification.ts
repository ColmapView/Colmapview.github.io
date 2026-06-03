/**
 * File classification utilities for COLMAP file handling.
 * Extracted from useFileDropzone.ts for better organization.
 */

import type { Reconstruction, Camera, Image as ColmapImage } from '../types/colmap';
import { CameraModelId } from '../types/colmap';

export interface ColmapFileSelection {
  camerasFile?: File;
  imagesFile?: File;
  points3DFile?: File;
  databaseFile?: File;
  rigsFile?: File;
  framesFile?: File;
}

interface ColmapDirectoryFiles {
  cameras?: File;
  images?: File;
  points3D?: File;
  database?: File;
  rigs?: File;
  frames?: File;
}

function getParentDir(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash >= 0 ? path.substring(0, lastSlash) : '';
}

function choosePreferredColmapFile(current: File | undefined, candidate: File): File {
  if (!current) {
    return candidate;
  }

  const candidateIsBinary = candidate.name.toLowerCase().endsWith('.bin');
  const currentIsBinary = current.name.toLowerCase().endsWith('.bin');

  if (candidateIsBinary || !currentIsBinary) {
    return candidate;
  }

  return current;
}

function getColmapDirectoryScore(dir: string): number {
  const lower = dir.toLowerCase();

  if (lower.endsWith('/sparse/0') || lower === 'sparse/0') return 0;
  if (lower.endsWith('/sparse') || lower === 'sparse') return 1;
  if (lower.includes('/sparse/')) return 2;
  if (lower.includes('/sparse')) return 3;

  return 4 + dir.length;
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
  const colmapDirs = new Map<string, ColmapDirectoryFiles>();

  for (const [path, file] of files) {
    const name = file.name.toLowerCase();
    const dir = getParentDir(path);
    const dirFiles = colmapDirs.get(dir) ?? {};

    if (name === 'cameras.bin' || name === 'cameras.txt') {
      dirFiles.cameras = choosePreferredColmapFile(dirFiles.cameras, file);
    } else if (name === 'images.bin' || name === 'images.txt') {
      dirFiles.images = choosePreferredColmapFile(dirFiles.images, file);
    } else if (name === 'points3d.bin' || name === 'points3d.txt') {
      dirFiles.points3D = choosePreferredColmapFile(dirFiles.points3D, file);
    } else if (name === 'database.db' || name === 'colmap.db') {
      dirFiles.database = file;
    } else if (name === 'rigs.bin' || name === 'rigs.txt') {
      dirFiles.rigs = choosePreferredColmapFile(dirFiles.rigs, file);
    } else if (name === 'frames.bin' || name === 'frames.txt') {
      dirFiles.frames = choosePreferredColmapFile(dirFiles.frames, file);
    }

    colmapDirs.set(dir, dirFiles);
  }

  const validDirs: { dir: string; files: ColmapDirectoryFiles }[] = [];
  for (const [dir, dirFiles] of colmapDirs) {
    if (dirFiles.cameras && dirFiles.images && dirFiles.points3D) {
      validDirs.push({ dir, files: dirFiles });
    }
  }

  if (validDirs.length === 0) {
    return {};
  }

  validDirs.sort((a, b) => getColmapDirectoryScore(a.dir) - getColmapDirectoryScore(b.dir));

  const best = validDirs[0].files;
  return {
    camerasFile: best.cameras,
    imagesFile: best.images,
    points3DFile: best.points3D,
    databaseFile: best.database,
    rigsFile: best.rigs,
    framesFile: best.frames,
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

/**
 * Find the largest PLY file in a scanned dataset.
 * Spark can auto-detect gsplat and point-cloud PLY variants from contents.
 */
export function findLargestPlyFile(files: Map<string, File>): File | undefined {
  let largest: File | undefined;

  for (const [, file] of files) {
    if (!file.name.toLowerCase().endsWith('.ply')) {
      continue;
    }

    if (!largest || file.size > largest.size) {
      largest = file;
    }
  }

  return largest;
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

  // Create minimal global stats
  const globalStats = {
    minError: 0,
    maxError: 0,
    avgError: 0,
    minTrackLength: 0,
    maxTrackLength: 0,
    avgTrackLength: 0,
    totalObservations: 0,
    totalPoints: 0,
  };

  return {
    cameras,
    images,
    imageStats,
    connectedImagesIndex: new Map(),
    globalStats,
    imageToPoint3DIds: new Map(),
  };
}
