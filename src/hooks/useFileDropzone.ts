import { useCallback } from 'react';
import {
  parsePoints3DBinary,
  parsePoints3DText,
  parseImagesBinary,
  parseImagesText,
  parseCamerasBinary,
  parseCamerasText,
} from '../parsers';
import { useReconstructionStore } from '../store';
import type { Reconstruction } from '../types/colmap';
import { collectImageFiles } from '../utils/imageFileUtils';

export function useFileDropzone() {
  const {
    setReconstruction,
    setLoadedFiles,
    setLoading,
    setError,
    setProgress,
  } = useReconstructionStore();

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
    // Common paths to check (in order of preference)
    const cameraPaths = [
      'cameras.bin', 'sparse/cameras.bin', 'sparse/0/cameras.bin',
      'cameras.txt', 'sparse/cameras.txt', 'sparse/0/cameras.txt',
    ];
    const imagePaths = [
      'images.bin', 'sparse/images.bin', 'sparse/0/images.bin',
      'images.txt', 'sparse/images.txt', 'sparse/0/images.txt',
    ];
    const pointsPaths = [
      'points3D.bin', 'sparse/points3D.bin', 'sparse/0/points3D.bin',
      'points3D.txt', 'sparse/points3D.txt', 'sparse/0/points3D.txt',
    ];
    const dbPaths = ['database.db', 'colmap.db'];

    const findFile = (paths: string[]): File | undefined => {
      for (const p of paths) {
        // Check direct path
        if (files.has(p)) return files.get(p);

        // Check with any folder prefix (for when user drops a parent folder)
        for (const [key, file] of files) {
          if (key.endsWith('/' + p) || key === p) {
            return file;
          }
        }
      }
      return undefined;
    };

    return {
      camerasFile: findFile(cameraPaths),
      imagesFile: findFile(imagePaths),
      points3DFile: findFile(pointsPaths),
      databaseFile: findFile(dbPaths),
    };
  }, []);


  const processFiles = useCallback(async (files: Map<string, File>) => {
    setLoading(true);
    setError(null);
    setProgress(0);

    try {
      // Find COLMAP files
      const { camerasFile, imagesFile, points3DFile, databaseFile } = findColmapFiles(files);

      if (!camerasFile || !imagesFile || !points3DFile) {
        throw new Error(
          'Missing required COLMAP files. Expected cameras.bin/txt, images.bin/txt, and points3D.bin/txt'
        );
      }

      // Collect image files
      const imageFiles = collectImageFiles(files);

      // Store loaded files reference
      setLoadedFiles({
        camerasFile,
        imagesFile,
        points3DFile,
        databaseFile,
        imageFiles,
      });

      setProgress(10);

      // Parse cameras
      const camerasBuffer = await camerasFile.arrayBuffer();
      const isCamerasBinary = camerasFile.name.endsWith('.bin');
      const cameras = isCamerasBinary
        ? parseCamerasBinary(camerasBuffer)
        : parseCamerasText(await camerasFile.text());

      setProgress(30);

      // Parse images
      const imagesBuffer = await imagesFile.arrayBuffer();
      const isImagesBinary = imagesFile.name.endsWith('.bin');
      const images = isImagesBinary
        ? parseImagesBinary(imagesBuffer)
        : parseImagesText(await imagesFile.text());

      setProgress(60);

      // Parse points3D
      const pointsBuffer = await points3DFile.arrayBuffer();
      const isPointsBinary = points3DFile.name.endsWith('.bin');
      const points3D = isPointsBinary
        ? parsePoints3DBinary(pointsBuffer)
        : parsePoints3DText(await points3DFile.text());

      setProgress(90);

      const reconstruction: Reconstruction = { cameras, images, points3D };
      setReconstruction(reconstruction);

      console.log(
        `Loaded: ${cameras.size} cameras, ${images.size} images, ${points3D.size} points`
      );

    } catch (err) {
      console.error('Error processing files:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [
    setReconstruction,
    setLoadedFiles,
    setLoading,
    setError,
    setProgress,
    findColmapFiles,
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
