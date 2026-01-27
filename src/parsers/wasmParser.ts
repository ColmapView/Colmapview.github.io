/**
 * WASM-based COLMAP file parser.
 * Extracted from useFileDropzone.ts for better organization.
 *
 * WASM always uses hybrid memory mode: full parsing with 2D points staying in WASM memory
 * and loaded lazily on-demand. This enables 4GB WASM + 4GB JS heap.
 */

import type { Camera, Image as ColmapImage } from '../types/colmap';
import type { RigData, Rig, Frame, RigSensor, FrameDataMapping, SensorId } from '../types/rig';
import { SensorType } from '../types/rig';
import { CameraModelId } from '../types/colmap';
import { createWasmReconstruction, WasmReconstructionWrapper } from '../wasm';

/**
 * Parse COLMAP files using WASM module
 * Returns null if WASM fails, allowing fallback to JS parser
 * Returns the WASM wrapper along with parsed data so it can be kept alive for fast rendering path
 */
export async function parseWithWasm(
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
