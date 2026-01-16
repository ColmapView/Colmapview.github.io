import { useCallback } from 'react';
import {
  parsePoints3DBinary,
  parsePoints3DText,
  parseImagesBinary,
  parseImagesText,
  parseCamerasBinary,
  parseCamerasText,
  computeImageStats,
} from '../parsers';
import { useReconstructionStore, useUIStore, useCameraStore } from '../store';
import type { Reconstruction } from '../types/colmap';
import { collectImageFiles, hasMaskFiles, getImageFile, findMissingImageFiles } from '../utils/imageFileUtils';
import { getFailedImageCount, clearSharedDecodeCache } from './useAsyncImageCache';
import { clearThumbnailCache, prefetchThumbnails } from './useThumbnail';
import { clearFrustumTextureCache, prefetchFrustumTextures } from './useFrustumTexture';

export function useFileDropzone() {
  const {
    setReconstruction,
    setLoadedFiles,
    setDroppedFiles,
    setLoading,
    setError,
    setProgress,
  } = useReconstructionStore();
  const resetView = useUIStore((s) => s.resetView);
  const setSelectedImageId = useCameraStore((s) => s.setSelectedImageId);
  const imageLoadMode = useUIStore((s) => s.imageLoadMode);

  const scanEntry = useCallback(async (
    entry: FileSystemEntry,
    path: string,
    files: Map<string, File>
  ): Promise<void> => {
    const fullPath = path ? `${path}/${entry.name}` : entry.name;

    try {
      if (entry.isFile) {
        const file = await new Promise<File>((resolve, reject) => {
          (entry as FileSystemFileEntry).file(resolve, reject);
        });
        files.set(fullPath, file);
      } else if (entry.isDirectory) {
        const dirReader = (entry as FileSystemDirectoryEntry).createReader();

        // Read all entries (readEntries may need multiple calls for large directories)
        let allEntries: FileSystemEntry[] = [];
        let entries: FileSystemEntry[];

        do {
          entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
            dirReader.readEntries(resolve, reject);
          });
          allEntries = allEntries.concat(entries);
        } while (entries.length > 0);

        // Process entries in parallel batches for better performance with many files
        const BATCH_SIZE = 50;
        for (let i = 0; i < allEntries.length; i += BATCH_SIZE) {
          const batch = allEntries.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(childEntry => scanEntry(childEntry, fullPath, files)));
        }
      }
    } catch (err) {
      // Log but don't fail on individual file errors
      console.warn(`Failed to scan entry: ${fullPath}`, err);
    }
  }, []);

  const findColmapFiles = useCallback((files: Map<string, File>): {
    camerasFile?: File;
    imagesFile?: File;
    points3DFile?: File;
    databaseFile?: File;
  } => {
    // Group files by their parent directory
    const getParentDir = (path: string): string => {
      const lastSlash = path.lastIndexOf('/');
      return lastSlash >= 0 ? path.substring(0, lastSlash) : '';
    };

    // Find all directories containing COLMAP files
    const colmapDirs = new Map<string, { cameras?: File; images?: File; points3D?: File; database?: File }>();

    for (const [path, file] of files) {
      const name = file.name.toLowerCase();
      const dir = getParentDir(path);

      if (!colmapDirs.has(dir)) {
        colmapDirs.set(dir, {});
      }
      const dirFiles = colmapDirs.get(dir)!;

      // Match COLMAP files (prefer .bin over .txt)
      if (name === 'cameras.bin' || (name === 'cameras.txt' && !dirFiles.cameras?.name.endsWith('.bin'))) {
        dirFiles.cameras = file;
      } else if (name === 'images.bin' || (name === 'images.txt' && !dirFiles.images?.name.endsWith('.bin'))) {
        dirFiles.images = file;
      } else if (name === 'points3d.bin' || (name === 'points3d.txt' && !dirFiles.points3D?.name.endsWith('.bin'))) {
        dirFiles.points3D = file;
      } else if (name === 'database.db' || name === 'colmap.db') {
        dirFiles.database = file;
      }
    }

    // Find directories with all three required files
    const validDirs: { dir: string; files: NonNullable<typeof colmapDirs extends Map<string, infer V> ? V : never> }[] = [];
    for (const [dir, dirFiles] of colmapDirs) {
      if (dirFiles.cameras && dirFiles.images && dirFiles.points3D) {
        validDirs.push({ dir, files: dirFiles });
      }
    }

    if (validDirs.length === 0) {
      return {};
    }

    // Sort by preference: sparse/0 > sparse > shorter paths > others
    validDirs.sort((a, b) => {
      const score = (dir: string) => {
        const lower = dir.toLowerCase();
        if (lower.endsWith('/sparse/0') || lower === 'sparse/0') return 0;
        if (lower.endsWith('/sparse') || lower === 'sparse') return 1;
        if (lower.includes('/sparse/')) return 2;
        if (lower.includes('/sparse')) return 3;
        return 4 + dir.length; // Prefer shorter paths
      };
      return score(a.dir) - score(b.dir);
    });

    const best = validDirs[0].files;
    return {
      camerasFile: best.cameras,
      imagesFile: best.images,
      points3DFile: best.points3D,
      databaseFile: best.database,
    };
  }, []);

  const processFiles = useCallback(async (files: Map<string, File>) => {
    // Show loading state immediately so user gets feedback
    setLoading(true);
    setProgress(0);

    try {
      // Store dropped files (always fresh, no merging)
      setDroppedFiles(files);

      // Find COLMAP files
      const { camerasFile, imagesFile, points3DFile, databaseFile } = findColmapFiles(files);

      if (!camerasFile || !imagesFile || !points3DFile) {
        throw new Error(
          'Missing required COLMAP files. Expected cameras.bin/txt, images.bin/txt, and points3D.bin/txt'
        );
      }

      setProgress(5);

      // Collect image files and check for masks folder
      const imageFiles = collectImageFiles(files);
      const hasMasks = hasMaskFiles(files);

      // Log how many files were scanned
      console.log(`Scanned ${files.size} total files, ${imageFiles.size} image lookup keys`);

      // Update loaded files reference
      setLoadedFiles({
        camerasFile,
        imagesFile,
        points3DFile,
        databaseFile,
        imageFiles,
        hasMasks,
      });

      setProgress(10);

      // Parse all COLMAP files in parallel for faster loading
      const [cameras, images, points3D] = await Promise.all([
        camerasFile.name.endsWith('.bin')
          ? camerasFile.arrayBuffer().then(parseCamerasBinary)
          : camerasFile.text().then(parseCamerasText),
        imagesFile.name.endsWith('.bin')
          ? imagesFile.arrayBuffer().then(parseImagesBinary)
          : imagesFile.text().then(parseImagesText),
        points3DFile.name.endsWith('.bin')
          ? points3DFile.arrayBuffer().then(parsePoints3DBinary)
          : points3DFile.text().then(parsePoints3DText),
      ]);

      setProgress(35);

      // Pre-compute image statistics, connected images index, and global stats
      const { imageStats, connectedImagesIndex, globalStats } = computeImageStats(images, points3D);

      setProgress(40);

      const reconstruction: Reconstruction = { cameras, images, points3D, imageStats, connectedImagesIndex, globalStats };

      // Clear caches AFTER parsing succeeds to prevent broken state on error
      // This ensures old reconstruction remains functional if new data fails to load
      clearThumbnailCache();
      clearFrustumTextureCache();
      clearSharedDecodeCache();

      // Allow GPU memory to flush before loading new assets
      // This prevents slowdown when replacing an existing reconstruction
      await new Promise(r => setTimeout(r, 200));

      setProgress(45);

      // Prefetch images if enabled (skip mode and lazy mode skip this)
      if (imageLoadMode === 'prefetch') {
        const imagesToPrefetch: Array<{ file: File; name: string }> = [];
        for (const image of images.values()) {
          const file = getImageFile(imageFiles, image.name);
          if (file) {
            imagesToPrefetch.push({ file, name: image.name });
          }
        }

        if (imagesToPrefetch.length > 0) {
          // Always prefetch both thumbnails and frustums in parallel for faster loading
          const thumbProgress = { value: 0 };
          const frustumProgress = { value: 0 };

          const updateProgress = () => {
            // Combined progress: thumbnails 45-70%, frustums 70-95%
            const combined = (thumbProgress.value + frustumProgress.value) / 2;
            setProgress(45 + Math.round(combined * 50));
          };

          await Promise.all([
            prefetchThumbnails(imagesToPrefetch, (p) => {
              thumbProgress.value = p;
              updateProgress();
            }),
            prefetchFrustumTextures(imagesToPrefetch, (p) => {
              frustumProgress.value = p;
              updateProgress();
            }),
          ]);
        }
      }

      setProgress(95);

      // Set reconstruction (this will set progress to 100 and loading to false)
      setReconstruction(reconstruction);

      // Reset viewer state for new reconstruction
      setSelectedImageId(null);
      resetView();

      console.log(
        `Loaded: ${cameras.size} cameras, ${images.size} images, ${points3D.size} points`
      );

      // Diagnostic: Report any images that couldn't find their files
      const { missingImages, totalImages, totalFiles } = findMissingImageFiles(images, imageFiles);
      if (missingImages.length > 0) {
        console.warn(
          `⚠️ ${missingImages.length}/${totalImages} images could not find their files (${totalFiles} image files in lookup map)`
        );
        // Log first few missing images for debugging
        const samplesToShow = Math.min(10, missingImages.length);
        console.warn('First missing images:', missingImages.slice(0, samplesToShow).map(img => `ID ${img.imageId}: "${img.name}"`));
        if (missingImages.length > samplesToShow) {
          console.warn(`... and ${missingImages.length - samplesToShow} more`);
        }
      }

      // Report decode failures after prefetch
      const failedCount = getFailedImageCount();
      if (failedCount > 0) {
        console.warn(
          `⚠️ ${failedCount} images failed to decode (createImageBitmap error). These images may be corrupted or use unsupported encoding.`
        );
        console.warn('To fix: Re-export these images from your image editing software, or convert them using a tool like ImageMagick.');
      }

    } catch (err) {
      console.error('Error processing files:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [
    setReconstruction,
    setLoadedFiles,
    setDroppedFiles,
    setLoading,
    setError,
    setProgress,
    findColmapFiles,
    resetView,
    setSelectedImageId,
    imageLoadMode,
  ]);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Only process actual file drops, not internal UI drags
    if (!e.dataTransfer?.types.includes('Files')) return;

    const items = e.dataTransfer?.items;
    if (!items) return;

    const files = new Map<string, File>();

    // Use webkitGetAsEntry for folder support
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;

      const entry = item.webkitGetAsEntry();
      if (entry) {
        entries.push(entry);
      }
    }

    // Scan all entries
    for (const entry of entries) {
      await scanEntry(entry, '', files);
    }

    // If no entries found via webkitGetAsEntry, fall back to files list
    if (files.size === 0 && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        files.set(file.name, file);
      }
    }

    await processFiles(files);
  }, [scanEntry, processFiles]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    handleDrop,
    handleDragOver,
    processFiles,
  };
}
