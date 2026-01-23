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
} from '../parsers';
import type { RigData, Rig, Frame, RigSensor, FrameDataMapping, SensorId } from '../types/rig';
import { SensorType } from '../types/rig';
import { useReconstructionStore, useUIStore, usePointCloudStore, useNotificationStore } from '../store';
import type { Reconstruction, Camera, Image as ColmapImage, Point3D } from '../types/colmap';
import { collectImageFiles, hasMaskFiles, findMissingImageFiles } from '../utils/imageFileUtils';
import { getFailedImageCount } from './useAsyncImageCache';
import { clearAllCaches } from '../cache';
import { parseConfigYaml, applyConfigurationToStores } from '../config/configuration';
import { createWasmReconstruction, WasmReconstructionWrapper } from '../wasm';
import { CameraModelId } from '../types/colmap';
import { isZipFile, loadZipFromFile, setActiveZipArchive } from '../utils/zipLoader';

/**
 * Parse COLMAP files using WASM module
 * Returns null if WASM fails, allowing fallback to JS parser
 * Returns the WASM wrapper along with parsed data so it can be kept alive for fast rendering path
 *
 * WASM always uses hybrid memory mode: full parsing with 2D points staying in WASM memory
 * and loaded lazily on-demand. This enables 4GB WASM + 4GB JS heap.
 */
async function parseWithWasm(
  camerasFile: File,
  imagesFile: File,
  points3DFile: File,
  rigsFile?: File,
  framesFile?: File,
): Promise<{
  cameras: Map<number, Camera>;
  images: Map<number, ColmapImage>;
  rigData?: RigData;
  wasmWrapper: WasmReconstructionWrapper;
} | null> {
  try {
    const wasm = await createWasmReconstruction();
    if (!wasm) {
      console.warn('[WASM] Module not available, falling back to JS parser');
      return null;
    }

    // Only parse binary files with WASM (text files use JS parser)
    if (!camerasFile.name.endsWith('.bin') ||
        !imagesFile.name.endsWith('.bin') ||
        !points3DFile.name.endsWith('.bin')) {
      console.log('[WASM] Text files detected, using JS parser');
      wasm.dispose();
      return null;
    }

    // Also check if rig files are text (will fall back to JS for those specifically)
    const canParseRigsWithWasm = rigsFile && framesFile &&
      rigsFile.name.endsWith('.bin') && framesFile.name.endsWith('.bin');

    const startTime = performance.now();

    // Parse all files with WASM
    const [camerasBuffer, imagesBuffer, points3DBuffer] = await Promise.all([
      camerasFile.arrayBuffer(),
      imagesFile.arrayBuffer(),
      points3DFile.arrayBuffer(),
    ]);

    const camerasOk = wasm.parseCameras(camerasBuffer);
    // Use lazy parsing - 2D points are NOT cached in WASM memory
    // Instead, only file offsets are stored (~50KB), and 2D points are loaded on-demand
    // This enables loading 1.9GB+ images.bin files without running out of memory
    const imagesOk = wasm.parseImagesLazy(imagesBuffer);
    const points3DOk = wasm.parsePoints3D(points3DBuffer);

    if (!camerasOk || !imagesOk || !points3DOk) {
      console.warn('[WASM] Failed to parse some files, falling back to JS parser');
      wasm.dispose();
      return null;
    }

    const parseTime = performance.now() - startTime;
    console.log(`[WASM] Parsed in ${parseTime.toFixed(0)}ms: ${wasm.cameraCount} cameras, ${wasm.imageCount} images, ${wasm.pointCount} points`);

    // Convert WASM data to JS Maps for compatibility with existing code
    // This maintains compatibility while allowing future optimization
    const cameras = new Map<number, Camera>();
    const allCameras = wasm.getAllCameras();
    for (const cam of Object.values(allCameras)) {
      cameras.set(cam.cameraId, {
        cameraId: cam.cameraId,
        modelId: cam.modelId as CameraModelId,
        width: cam.width,
        height: cam.height,
        params: cam.params,
      });
    }

    // Get numPoints2D per image (always available, even in lite mode)
    // We skip copying the full 2D point data to save JS heap memory (hybrid approach)
    const numPoints2DPerImage = wasm.getNumPoints2DPerImage();

    const images = new Map<number, ColmapImage>();
    const allImages = wasm.getAllImageInfos();
    for (let imgIdx = 0; imgIdx < allImages.length; imgIdx++) {
      const img = allImages[imgIdx];
      const q = img.quaternion || [1, 0, 0, 0];
      const t = img.translation || [0, 0, 0];

      // Get numPoints2D count from WASM array
      const numPoints2D = numPoints2DPerImage && imgIdx < numPoints2DPerImage.length
        ? numPoints2DPerImage[imgIdx]
        : 0;

      images.set(img.imageId, {
        imageId: img.imageId,
        cameraId: img.cameraId,
        name: img.name,
        qvec: [q[0], q[1], q[2], q[3]] as [number, number, number, number],
        tvec: [t[0], t[1], t[2]] as [number, number, number],
        points2D: [],  // Empty - 2D points stay in WASM memory
        numPoints2D,   // Count always available for display/stats
      });
    }

    // Note: points3D Map is NOT built here to save memory
    // Use wasm.buildPoints3DMap() on-demand for export/transform operations
    // Rendering uses WASM typed arrays directly

    // Parse rig/frame data if binary files provided
    let rigData: RigData | undefined;
    if (canParseRigsWithWasm && rigsFile && framesFile) {
      try {
        const [rigsBuffer, framesBuffer] = await Promise.all([
          rigsFile.arrayBuffer(),
          framesFile.arrayBuffer(),
        ]);

        const rigsOk = wasm.parseRigs(rigsBuffer);
        const framesOk = wasm.parseFrames(framesBuffer);

        if (rigsOk && framesOk && wasm.hasRigData()) {
          // Convert WASM rig data to JS Maps
          const rigs = new Map<number, Rig>();
          const wasmRigs = wasm.getAllRigs();
          for (const wasmRig of Object.values(wasmRigs)) {
            const sensors: RigSensor[] = wasmRig.sensors.map((s) => {
              const sensor: RigSensor = {
                sensorId: { type: s.sensorId.type as SensorType, id: s.sensorId.id },
                hasPose: s.hasPose,
              };
              if (s.hasPose && s.pose) {
                sensor.pose = {
                  qvec: s.pose.qvec,
                  tvec: s.pose.tvec,
                };
              }
              return sensor;
            });

            const refSensorId: SensorId | null = wasmRig.refSensorId
              ? { type: wasmRig.refSensorId.type as SensorType, id: wasmRig.refSensorId.id }
              : null;

            rigs.set(wasmRig.rigId, {
              rigId: wasmRig.rigId,
              refSensorId,
              sensors,
            });
          }

          // Convert WASM frame data to JS Maps
          const frames = new Map<number, Frame>();
          const wasmFrames = wasm.getAllFrames();
          for (const wasmFrame of Object.values(wasmFrames)) {
            const dataIds: FrameDataMapping[] = wasmFrame.dataIds.map((d) => ({
              sensorId: { type: d.sensorId.type as SensorType, id: d.sensorId.id },
              dataId: d.dataId,
            }));

            frames.set(wasmFrame.frameId, {
              frameId: wasmFrame.frameId,
              rigId: wasmFrame.rigId,
              rigFromWorld: {
                qvec: wasmFrame.rigFromWorld.qvec,
                tvec: wasmFrame.rigFromWorld.tvec,
              },
              dataIds,
            });
          }

          rigData = { rigs, frames };
          console.log(`[WASM] Parsed rig data: ${rigs.size} rigs, ${frames.size} frames`);
        }
      } catch (rigErr) {
        console.warn('[WASM] Failed to parse rig/frame files:', rigErr);
        // Non-fatal - continue without rig data
      }
    }

    const conversionTime = performance.now() - startTime - parseTime;
    console.log(`[WASM] Converted to JS Maps in ${conversionTime.toFixed(0)}ms`);

    // Return the WASM wrapper along with the data - it will be kept alive for the fast rendering path
    // Note: points3D is NOT returned - use wasm.buildPoints3DMap() on-demand for export/transform
    return { cameras, images, rigData, wasmWrapper: wasm };
  } catch (err) {
    console.warn('[WASM] Error during parsing, falling back to JS:', err);
    return null;
  }
}

function findConfigFile(files: Map<string, File>): File | null {
  for (const [, file] of files) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.yaml') || name.endsWith('.yml')) {
      return file;
    }
  }
  return null;
}

function hasColmapFiles(files: Map<string, File>): boolean {
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
function hasImageFiles(files: Map<string, File>): boolean {
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
function createImagesOnlyReconstruction(imageFiles: Map<string, File>): Reconstruction {
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

          // Set source info to 'local' for drag-drop loading
          const currentSourceType = useReconstructionStore.getState().sourceType;
          if (!currentSourceType) {
            setSourceInfo('local', null);
          }

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

      // Set source info to 'local' for drag-drop loading (URL loading sets this before calling processFiles)
      // Only set if not already set by URL loader
      const currentSourceType = useReconstructionStore.getState().sourceType;
      if (!currentSourceType) {
        setSourceInfo('local', null);
      }

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
