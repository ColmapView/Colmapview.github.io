import { useCallback } from 'react';
import {
  parsePoints3DBinary,
  parsePoints3DText,
  parseImagesBinary,
  parseImagesText,
  parseCamerasBinary,
  parseCamerasText,
} from '../parsers';
import { useReconstructionStore, useViewerStore } from '../store';
import type { Reconstruction } from '../types/colmap';
import { collectImageFiles, hasMaskFiles } from '../utils/imageFileUtils';

export function useFileDropzone() {
  const {
    reconstruction: existingReconstruction,
    loadedFiles: existingLoadedFiles,
    droppedFiles: existingDroppedFiles,
    setReconstruction,
    setLoadedFiles,
    setDroppedFiles,
    setLoading,
    setError,
    setProgress,
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

  const processFiles = useCallback(async (newFiles: Map<string, File>) => {
    setLoading(true);
    setError(null);
    setProgress(0);

    try {
      // Merge with existing dropped files
      const files = new Map<string, File>(existingDroppedFiles ?? []);
      for (const [path, file] of newFiles) {
        files.set(path, file);
      }
      setDroppedFiles(files);

      // Find COLMAP files in merged set
      const { camerasFile, imagesFile, points3DFile, databaseFile } = findColmapFiles(files);
      const hasNewColmapFiles = !!(camerasFile && imagesFile && points3DFile);

      // Collect image files and check for masks folder
      const imageFiles = collectImageFiles(files);
      const hasMasks = hasMaskFiles(files);

      // Determine what to use for COLMAP files
      const finalCamerasFile = camerasFile ?? existingLoadedFiles?.camerasFile;
      const finalImagesFile = imagesFile ?? existingLoadedFiles?.imagesFile;
      const finalPoints3DFile = points3DFile ?? existingLoadedFiles?.points3DFile;
      const finalDatabaseFile = databaseFile ?? existingLoadedFiles?.databaseFile;

      // Merge image files with existing
      const finalImageFiles = new Map<string, File>(existingLoadedFiles?.imageFiles ?? []);
      for (const [key, file] of imageFiles) {
        finalImageFiles.set(key, file);
      }

      // Update loaded files reference
      setLoadedFiles({
        camerasFile: finalCamerasFile,
        imagesFile: finalImagesFile,
        points3DFile: finalPoints3DFile,
        databaseFile: finalDatabaseFile,
        imageFiles: finalImageFiles,
        hasMasks: hasMasks || existingLoadedFiles?.hasMasks || false,
      });

      // Only parse COLMAP if we have new files OR no existing reconstruction
      if (hasNewColmapFiles || !existingReconstruction) {
        if (!finalCamerasFile || !finalImagesFile || !finalPoints3DFile) {
          throw new Error(
            'Missing required COLMAP files. Expected cameras.bin/txt, images.bin/txt, and points3D.bin/txt'
          );
        }

        setProgress(10);

        // Parse cameras
        const camerasBuffer = await finalCamerasFile.arrayBuffer();
        const isCamerasBinary = finalCamerasFile.name.endsWith('.bin');
        const cameras = isCamerasBinary
          ? parseCamerasBinary(camerasBuffer)
          : parseCamerasText(await finalCamerasFile.text());

        setProgress(30);

        // Parse images
        const imagesBuffer = await finalImagesFile.arrayBuffer();
        const isImagesBinary = finalImagesFile.name.endsWith('.bin');
        const images = isImagesBinary
          ? parseImagesBinary(imagesBuffer)
          : parseImagesText(await finalImagesFile.text());

        setProgress(60);

        // Parse points3D
        const pointsBuffer = await finalPoints3DFile.arrayBuffer();
        const isPointsBinary = finalPoints3DFile.name.endsWith('.bin');
        const points3D = isPointsBinary
          ? parsePoints3DBinary(pointsBuffer)
          : parsePoints3DText(await finalPoints3DFile.text());

        setProgress(90);

        const reconstruction: Reconstruction = { cameras, images, points3D };
        setReconstruction(reconstruction);

        // Reset viewer state for new reconstruction
        setSelectedImageId(null);
        resetView();

        console.log(
          `Loaded: ${cameras.size} cameras, ${images.size} images, ${points3D.size} points`
        );
      } else {
        // Just updating images/masks, keep existing reconstruction
        setProgress(100);
        console.log(`Updated: ${finalImageFiles.size} image files, hasMasks: ${hasMasks}`);
      }

    } catch (err) {
      console.error('Error processing files:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [
    existingReconstruction,
    existingLoadedFiles,
    existingDroppedFiles,
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
