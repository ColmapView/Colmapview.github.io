import { useCallback } from 'react';
import {
  parsePoints3DBinary,
  parsePoints3DText,
  parseImagesBinary,
  parseImagesText,
  parseCamerasBinary,
  parseCamerasText,
  parseRigsBinary,
  parseRigsText,
  parseFramesBinary,
  parseFramesText,
  computeImageStats,
  computeImageStatsFromWasm,
  parseWithWasm,
} from '../parsers';
import type { RigData } from '../types/rig';
import { useReconstructionStore, useUIStore, usePointCloudStore, useNotificationStore } from '../store';
import type { Reconstruction, Camera, Image as ColmapImage, Point3D } from '../types/colmap';
import { collectImageFiles, hasMaskFiles, findMissingImageFiles } from '../utils/imageFileUtils';
import { findConfigFile, hasColmapFiles, hasImageFiles, createImagesOnlyReconstruction } from '../utils/fileClassification';
import { getFailedImageCount } from './useAsyncImageCache';
import { clearAllCaches } from '../cache';
import { parseConfigYaml, applyConfigurationToStores } from '../config/configuration';
import type { WasmReconstructionWrapper } from '../wasm';
import { isZipFile, loadZipFromFile, setActiveZipArchive } from '../utils/zipLoader';

export function useFileDropzone() {
  const {
    setReconstruction,
    setWasmReconstruction,
    setLoadedFiles,
    setDroppedFiles,
    setError,
    setSourceInfo,
    setUrlLoading,
    setUrlProgress,
  } = useReconstructionStore();
  const resetView = useUIStore((s) => s.resetView);

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
    rigsFile?: File;
    framesFile?: File;
  } => {
    // Group files by their parent directory
    const getParentDir = (path: string): string => {
      const lastSlash = path.lastIndexOf('/');
      return lastSlash >= 0 ? path.substring(0, lastSlash) : '';
    };

    // Find all directories containing COLMAP files
    const colmapDirs = new Map<string, { cameras?: File; images?: File; points3D?: File; database?: File; rigs?: File; frames?: File }>();

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
      } else if (name === 'rigs.bin' || (name === 'rigs.txt' && !dirFiles.rigs?.name.endsWith('.bin'))) {
        dirFiles.rigs = file;
      } else if (name === 'frames.bin' || (name === 'frames.txt' && !dirFiles.frames?.name.endsWith('.bin'))) {
        dirFiles.frames = file;
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
      rigsFile: best.rigs,
      framesFile: best.frames,
    };
  }, []);

  /**
   * Process COLMAP files and build reconstruction.
   * @param files Map of file paths to File objects
   * @param progressRange Optional range for progress reporting. Default is 0-100.
   *                      When called from URL loader (files already downloaded), use { start: 80, end: 100 }
   */
  const processFiles = useCallback(async (files: Map<string, File>, progressRange?: { start: number; end: number }) => {
    // Note: Guards are now in entry points (handleDrop, handleBrowse, processZipFile, URL loaders)
    // This function may be called with loading already set by the entry point

    // Progress range for this function (default: full 0-100%)
    const pStart = progressRange?.start ?? 0;
    const pEnd = progressRange?.end ?? 100;
    const mapProgress = (localPercent: number) => Math.round(pStart + (localPercent / 100) * (pEnd - pStart));

    // Ensure loading state is set (may already be true from entry point)
    const state = useReconstructionStore.getState();
    if (!state.urlLoading) {
      setUrlLoading(true);
      setUrlProgress({ percent: mapProgress(0), message: 'Starting...' });
    }

    // Check for configuration file first
    const configFile = findConfigFile(files);
    if (configFile) {
      try {
        const content = await configFile.text();
        const result = parseConfigYaml(content);

        if (result.valid && result.config) {
          applyConfigurationToStores(result.config);
          console.log(`[Config] Applied settings from ${configFile.name}`);
        } else {
          const errorMessages = result.errors.map(e => e.path ? `${e.path}: ${e.message}` : e.message).join(', ');
          console.error(`[Config] Invalid configuration: ${errorMessages}`);
          setError(`Config error: ${errorMessages}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[Config] Failed to load config file:', err);
        setError(`Config error: ${message}`);
      }

      // If only config file was dropped (no COLMAP files and no images), stop
      if (!hasColmapFiles(files) && !hasImageFiles(files)) {
        setUrlLoading(false);
        return;
      }
    }

    try {
      // Store dropped files (always fresh, no merging)
      setDroppedFiles(files);

      // Find COLMAP files
      const { camerasFile, imagesFile, points3DFile, databaseFile, rigsFile, framesFile } = findColmapFiles(files);

      // Collect image files first (needed for both COLMAP and images-only modes)
      setUrlProgress({ percent: mapProgress(5), message: 'Scanning image files...' });
      const imageFiles = collectImageFiles(files);
      const hasMasks = hasMaskFiles(files);

      // Handle images-only mode: no COLMAP files but images are present
      if (!camerasFile || !imagesFile || !points3DFile) {
        if (hasImageFiles(files)) {
          console.log(`[Images-only] Creating gallery from ${imageFiles.size} image lookup keys`);

          setUrlProgress({ percent: mapProgress(50), message: 'Creating image gallery...' });

          // Create minimal reconstruction for images-only viewing
          const reconstruction = createImagesOnlyReconstruction(imageFiles);

          // Update loaded files reference (no COLMAP files)
          setLoadedFiles({
            camerasFile: undefined,
            imagesFile: undefined,
            points3DFile: undefined,
            databaseFile: undefined,
            rigsFile: undefined,
            framesFile: undefined,
            imageFiles,
            hasMasks,
          });

          // Clear all caches
          clearAllCaches({ preserveZip: true });

          setUrlProgress({ percent: mapProgress(95), message: 'Finalizing...' });

          // Note: sourceInfo is set by the caller (handleDrop/handleBrowse sets 'local',
          // processZipFile sets 'zip', URL loader sets 'url'/'manifest') before processFiles()

          // Set reconstruction (this will set progress to 100 and loading to false)
          setReconstruction(reconstruction);
          resetView();

          // Notify user about images-only mode
          useNotificationStore.getState().addNotification(
            'info',
            `Loaded ${reconstruction.images.size} images (gallery only, no 3D data)`,
            5000
          );

          console.log(`[Images-only] Loaded ${reconstruction.images.size} images for gallery viewing`);
          return;
        }

        throw new Error(
          'Missing required COLMAP files. Expected cameras.bin/txt, images.bin/txt, and points3D.bin/txt'
        );
      }

      // Log how many files were scanned
      console.log(`Scanned ${files.size} total files, ${imageFiles.size} image lookup keys`);

      // Update loaded files reference
      setLoadedFiles({
        camerasFile,
        imagesFile,
        points3DFile,
        databaseFile,
        rigsFile,
        framesFile,
        imageFiles,
        hasMasks,
      });

      setUrlProgress({ percent: mapProgress(10), message: 'Parsing COLMAP files...' });

      // Always try WASM parser first (memory-optimized: lazy 2D loading, no points3D Map)
      // Falls back to JS parser without 2D points if WASM fails
      let cameras: Map<number, Camera>;
      let images: Map<number, ColmapImage>;
      let points3D: Map<bigint, Point3D> | undefined;  // Only built for JS parser fallback
      let wasmRigData: RigData | undefined;
      let wasmWrapper: WasmReconstructionWrapper | null = null;
      let usedWasmPath = false;

      console.log('[Parser] Attempting WASM parser (memory-optimized)...');
      const wasmResult = await parseWithWasm(camerasFile, imagesFile, points3DFile, rigsFile, framesFile);

      if (wasmResult) {
        cameras = wasmResult.cameras;
        images = wasmResult.images;
        // points3D is NOT built to save memory - use wasm.buildPoints3DMap() on-demand
        wasmRigData = wasmResult.rigData;
        wasmWrapper = wasmResult.wasmWrapper;
        usedWasmPath = true;
        useNotificationStore.getState().addNotification(
          'info',
          `Loaded ${wasmWrapper.pointCount.toLocaleString()} points`,
          5000
        );
      } else {
        // Fall back to JS parser without 2D points (memory-efficient fallback)
        console.log('[Parser] WASM failed, falling back to JS parser (without 2D points)');
        const useLiteImages = imagesFile.name.endsWith('.bin');

        [cameras, images, points3D] = await Promise.all([
          camerasFile.name.endsWith('.bin')
            ? camerasFile.arrayBuffer().then(parseCamerasBinary)
            : camerasFile.text().then(parseCamerasText),
          imagesFile.name.endsWith('.bin')
            ? imagesFile.arrayBuffer().then((buf) => parseImagesBinary(buf, true))  // Skip 2D points
            : imagesFile.text().then(parseImagesText),
          points3DFile.name.endsWith('.bin')
            ? points3DFile.arrayBuffer().then(parsePoints3DBinary)
            : points3DFile.text().then(parsePoints3DText),
        ]);

        if (useLiteImages) {
          useNotificationStore.getState().addNotification(
            'info',
            '2D point data not loaded. Keypoint overlay may be limited.',
            5000
          );
        }
      }

      setUrlProgress({ percent: mapProgress(35), message: 'Computing statistics...' });

      // Pre-compute image statistics, connected images index, global stats, and point mapping
      // Use WASM-optimized version when WASM is available (avoids building points3D Map)
      const { imageStats, connectedImagesIndex, globalStats, imageToPoint3DIds } = usedWasmPath && wasmWrapper
        ? computeImageStatsFromWasm(images, wasmWrapper)
        : computeImageStats(images, points3D!);

      setUrlProgress({ percent: mapProgress(40), message: 'Processing rig data...' });

      // Parse rig/frame files if both are present (use WASM result if available)
      let rigData: RigData | undefined = wasmRigData;
      if (!rigData && rigsFile && framesFile) {
        try {
          const [rigs, frames] = await Promise.all([
            rigsFile.name.endsWith('.bin')
              ? rigsFile.arrayBuffer().then(parseRigsBinary)
              : rigsFile.text().then(parseRigsText),
            framesFile.name.endsWith('.bin')
              ? framesFile.arrayBuffer().then(parseFramesBinary)
              : framesFile.text().then(parseFramesText),
          ]);
          rigData = { rigs, frames };
          console.log(`Loaded rig data: ${rigs.size} rigs, ${frames.size} frames`);
        } catch (err) {
          console.warn('Failed to parse rig/frame files:', err);
        }
      }

      // Build reconstruction object - points3D is optional (only present for JS parser path)
      const reconstruction: Reconstruction = {
        cameras,
        images,
        ...(points3D && { points3D }),  // Only include if available (JS parser path)
        imageStats,
        connectedImagesIndex,
        globalStats,
        imageToPoint3DIds,
        rigData,
      };

      // Clear all caches AFTER parsing succeeds to prevent broken state on error
      // This ensures old reconstruction remains functional if new data fails to load
      // Note: preserveZip=true because ZIP archive is managed by entry points
      // (handleDrop, handleBrowse, processZipFile, URL loaders)
      clearAllCaches({ preserveZip: true });

      // Allow GPU memory to flush before loading new assets
      // This prevents slowdown when replacing an existing reconstruction
      await new Promise(r => setTimeout(r, 200));

      setUrlProgress({ percent: mapProgress(95), message: 'Finalizing...' });

      // Store WASM wrapper BEFORE setReconstruction (which would dispose any existing wrapper)
      // This allows PointCloud.tsx to use the fast rendering path
      if (wasmWrapper) {
        setWasmReconstruction(wasmWrapper);
      }

      // Note: sourceInfo is set by the caller (handleDrop/handleBrowse sets 'local',
      // processZipFile sets 'zip', URL loader sets 'url'/'manifest') before processFiles()

      // Set reconstruction (this will set progress to 100 and loading to false)
      // Note: setReconstruction will NOT dispose the wasmWrapper since we set it first
      setReconstruction(reconstruction);

      // Reset view after reconstruction is set
      resetView();

      // Get point count from WASM or JS Map
      const pointCount = wasmWrapper?.pointCount ?? points3D?.size ?? 0;
      console.log(
        `Loaded: ${cameras.size} cameras, ${images.size} images, ${pointCount.toLocaleString()} points`
      );

      // Check if there are points being filtered due to minTrackLength setting
      const minTrackLength = usePointCloudStore.getState().minTrackLength;
      if (minTrackLength >= 2 && pointCount > 0) {
        let filteredCount = 0;

        // Use WASM track lengths if available, otherwise iterate points3D
        if (wasmWrapper) {
          const trackLengths = wasmWrapper.getTrackLengths();
          if (trackLengths) {
            for (let i = 0; i < trackLengths.length; i++) {
              if (trackLengths[i] < minTrackLength) {
                filteredCount++;
              }
            }
          }
        } else if (points3D) {
          for (const point of points3D.values()) {
            if (point.track.length < minTrackLength) {
              filteredCount++;
            }
          }
        }

        if (filteredCount > 0) {
          const percentage = ((filteredCount / pointCount) * 100).toFixed(1);
          useNotificationStore.getState().addNotification(
            'warning',
            `${filteredCount.toLocaleString()} points (${percentage}%) hidden due to min track length filter (${minTrackLength}). Adjust in Point Cloud settings.`
          );
        }
      }

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
      setUrlLoading(false);
    }
  }, [
    setReconstruction,
    setWasmReconstruction,
    setLoadedFiles,
    setDroppedFiles,
    setError,
    setSourceInfo,
    setUrlLoading,
    setUrlProgress,
    findColmapFiles,
    resetView,
  ]);

  /**
   * Process a ZIP file: extract COLMAP files and set up lazy image extraction.
   */
  const processZipFile = useCallback(async (zipFile: File) => {
    // Prevent duplicate loads from rapid actions
    const state = useReconstructionStore.getState();
    if (state.urlLoading) {
      console.log('[ZIP Loader] Already loading, ignoring duplicate request');
      return;
    }

    // Show loading state IMMEDIATELY so user gets feedback (before any async work)
    setUrlLoading(true);
    setUrlProgress({ percent: 0, message: 'Opening ZIP archive...' });
    // Yield to React to paint loading UI before starting heavy work
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      // Clear all caches including previous ZIP archive
      clearAllCaches();

      console.log(`[ZIP Loader] Processing local ZIP file: ${zipFile.name}`);

      // Load the ZIP with progress tracking
      const { colmapFiles, imageIndex, archive, fileSize, imageCount } = await loadZipFromFile(
        zipFile,
        (progress) => {
          // Progress is shown during ZIP extraction (before processFiles takes over)
          setUrlProgress({ percent: Math.round(progress.percent * 0.1), message: 'Extracting ZIP archive...' });
        }
      );

      // Set up lazy extraction for images
      setActiveZipArchive(archive, imageIndex, fileSize, imageCount);

      // Store source info - for local ZIP loading
      setSourceInfo('zip', null);
      console.log(`[ZIP Loader] ZIP contains ${colmapFiles.size} COLMAP files, ${imageCount} indexed images`);

      // Process COLMAP files using existing pipeline
      // processFiles handles its own loading state
      await processFiles(colmapFiles);

      console.log(`[ZIP Loader] Successfully loaded reconstruction from local ZIP`);
    } catch (err) {
      console.error('[ZIP Loader] Error processing ZIP file:', err);
      // Clean up any partial state from failed load
      clearAllCaches();
      setError(err instanceof Error ? err.message : 'Failed to process ZIP file');
      setUrlLoading(false);
    }
  }, [processFiles, setUrlLoading, setUrlProgress, setError, setSourceInfo]);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Prevent file drops during active loading
    const state = useReconstructionStore.getState();
    if (state.urlLoading) {
      console.log('[File Dropzone] Ignoring drop during active loading');
      return;
    }

    // Only process actual file drops, not internal UI drags
    if (!e.dataTransfer?.types.includes('Files')) return;

    const items = e.dataTransfer?.items;
    if (!items) return;

    // IMPORTANT: Extract all data from dataTransfer SYNCHRONOUSLY before any await
    // The browser clears dataTransfer after the event handler yields

    // Check if a single ZIP file was dropped
    if (e.dataTransfer.files.length === 1) {
      const singleFile = e.dataTransfer.files[0];
      if (isZipFile(singleFile)) {
        console.log(`[Drop] Detected ZIP file: ${singleFile.name}`);
        await processZipFile(singleFile);
        return;
      }
    }

    // Extract entries SYNCHRONOUSLY before any await
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry();
      if (entry) {
        entries.push(entry);
      }
    }

    // Also capture files list as fallback (synchronously)
    const fallbackFiles: File[] = [];
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      fallbackFiles.push(e.dataTransfer.files[i]);
    }

    // Now we can safely await - dataTransfer data has been extracted
    // Show loading state IMMEDIATELY so user gets feedback (before folder scanning)
    setUrlLoading(true);
    setUrlProgress({ percent: 0, message: 'Scanning files...' });
    // Yield to React to paint loading UI before starting heavy work
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      const files = new Map<string, File>();

      console.log(`[Drop] Scanning ${entries.length} entries...`);

      // Scan all entries (already extracted synchronously)
      for (const entry of entries) {
        await scanEntry(entry, '', files);
      }

      // If no entries found via webkitGetAsEntry, fall back to files list
      if (files.size === 0 && fallbackFiles.length > 0) {
        console.log(`[Drop] Fallback: using ${fallbackFiles.length} files from dataTransfer.files`);
        for (const file of fallbackFiles) {
          files.set(file.name, file);
        }
      }

      console.log(`[Drop] Found ${files.size} files`);

      // Clear all caches before loading non-ZIP files
      clearAllCaches();
      // Set source to 'local' and clear imageUrlBase BEFORE processing
      // This ensures URL mode doesn't persist when switching to local files
      setSourceInfo('local', null);
      await processFiles(files);
    } catch (err) {
      console.error('[File Dropzone] Error processing drop:', err);
      setError(err instanceof Error ? err.message : 'Failed to process dropped files');
      setUrlLoading(false);
    }
  }, [scanEntry, processFiles, processZipFile, setUrlLoading, setUrlProgress, setError]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const scanDirectoryHandle = useCallback(async (
    dirHandle: FileSystemDirectoryHandle,
    path: string,
    files: Map<string, File>
  ): Promise<void> => {
    try {
      for await (const entry of dirHandle.values()) {
        const fullPath = path ? `${path}/${entry.name}` : entry.name;
        if (entry.kind === 'file') {
          const file = await (entry as FileSystemFileHandle).getFile();
          files.set(fullPath, file);
        } else if (entry.kind === 'directory') {
          await scanDirectoryHandle(entry as FileSystemDirectoryHandle, fullPath, files);
        }
      }
    } catch (err) {
      console.warn(`Failed to scan directory: ${path}`, err);
    }
  }, []);

  const handleBrowse = useCallback(async () => {
    // Prevent browse during active loading
    const state = useReconstructionStore.getState();
    if (state.urlLoading) {
      console.log('[File Dropzone] Ignoring browse during active loading');
      return;
    }

    // Check if the File System Access API is supported
    if (!('showDirectoryPicker' in window)) {
      setError('Your browser does not support folder selection. Please use drag and drop, or try Chrome/Edge.');
      return;
    }

    try {
      const dirHandle = await window.showDirectoryPicker();

      // Show loading state IMMEDIATELY after user selects folder (before scanning)
      setUrlLoading(true);
      setUrlProgress({ percent: 0, message: 'Scanning folder...' });
      // Yield to React to paint loading UI before starting heavy work
      await new Promise(resolve => setTimeout(resolve, 0));

      const files = new Map<string, File>();
      await scanDirectoryHandle(dirHandle, '', files);
      // Clear all caches before loading local files
      clearAllCaches();
      // Set source to 'local' and clear imageUrlBase BEFORE processing
      setSourceInfo('local', null);
      await processFiles(files);
    } catch (err) {
      // User cancelled the picker - not an error
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      console.error('Error browsing for folder:', err);
      setError(err instanceof Error ? err.message : 'Failed to open folder');
      setUrlLoading(false);
    }
  }, [scanDirectoryHandle, processFiles, setError, setUrlLoading, setUrlProgress]);

  return {
    handleDrop,
    handleDragOver,
    processFiles,
    processZipFile,
    handleBrowse,
  };
}
