/**
 * File classification utilities for COLMAP file handling.
 * Extracted from useFileDropzone.ts for better organization.
 */

import type { Reconstruction, Camera, Image as ColmapImage } from '../types/colmap';
import { CameraModelId } from '../types/colmap';

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
