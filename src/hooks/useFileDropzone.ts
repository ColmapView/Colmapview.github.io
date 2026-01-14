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
import { useReconstructionStore, useViewerStore } from '../store';
import type { Reconstruction } from '../types/colmap';
import { collectImageFiles, hasMaskFiles, getImageFile } from '../utils/imageFileUtils';
import { prefetchThumbnails, clearThumbnailCache } from './useThumbnail';
import { clearFrustumTextureCache } from './useFrustumTexture';

export function useFileDropzone() {
  const {
    setReconstruction,
    setLoadedFiles,
    setDroppedFiles,
    setLoading,
    setError,
    setProgress,
    clear,
  } = useReconstructionStore();
  const resetView = useViewerStore((s) => s.resetView);
  const setSelectedImageId = useViewerStore((s) => s.setSelectedImageId);

  const scanEntry = useCallback(async (
    entry: FileSystemEntry,
    path: string,
    files: Map<string, File>
  ): Promise<void> => {
    const fullPath = path ? `${path}/${entry.name}` : entry.name;

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

      for (const childEntry of allEntries) {
        await scanEntry(childEntry, fullPath, files);
      }
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
    // Clear existing dataset and caches first
    clear();
    clearThumbnailCache();
    clearFrustumTextureCache();
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

      // Collect image files and check for masks folder
      const imageFiles = collectImageFiles(files);
      const hasMasks = hasMaskFiles(files);

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

      // Parse cameras
      const cameras = camerasFile.name.endsWith('.bin')
        ? parseCamerasBinary(await camerasFile.arrayBuffer())
        : parseCamerasText(await camerasFile.text());

      setProgress(15);

      // Parse images
      const images = imagesFile.name.endsWith('.bin')
        ? parseImagesBinary(await imagesFile.arrayBuffer())
        : parseImagesText(await imagesFile.text());

      setProgress(25);

      // Parse points3D
      const points3D = points3DFile.name.endsWith('.bin')
        ? parsePoints3DBinary(await points3DFile.arrayBuffer())
        : parsePoints3DText(await points3DFile.text());

      setProgress(40);

      // Pre-compute image statistics and connected images index
      const { imageStats, connectedImagesIndex } = computeImageStats(images, points3D);

      const reconstruction: Reconstruction = { cameras, images, points3D, imageStats, connectedImagesIndex };

      setProgress(45);

      // Prefetch thumbnails for all images (progress 45-95%, ~50% of total)
      const imagesToPrefetch: Array<{ file: File; name: string }> = [];
      for (const image of images.values()) {
        const file = getImageFile(imageFiles, image.name);
        if (file) {
          imagesToPrefetch.push({ file, name: image.name });
        }
      }

      if (imagesToPrefetch.length > 0) {
        await prefetchThumbnails(imagesToPrefetch, (thumbProgress) => {
          // Scale thumbnail progress from 45% to 95% (50% of total progress)
          setProgress(45 + Math.round(thumbProgress * 50));
        });
      }

      setProgress(95);

      // Set reconstruction (this will set progress to 100 and loading to false)
      setReconstruction(reconstruction);

      // Reset viewer state for new reconstruction
      setSelectedImageId(null);
      resetView();

      console.log(
        `Loaded: ${cameras.size} cameras, ${images.size} images, ${points3D.size} points, ${imagesToPrefetch.length} thumbnails cached`
      );

    } catch (err) {
      console.error('Error processing files:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [
    clear,
    setReconstruction,
    setLoadedFiles,
    setDroppedFiles,
    setLoading,
    setError,
    setProgress,
    findColmapFiles,
    resetView,
    setSelectedImageId,
  ]);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();

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
