import { parseWithWasm } from '../parsers/wasmParser';
import { parseCamerasBinary, parseCamerasText } from '../parsers/cameras';
import { parseImagesBinary, parseImagesText } from '../parsers/images';
import { parsePoints3DBinary, parsePoints3DText } from '../parsers/points3d';
import { parsePointCloudPlyBuffer } from '../parsers/plyPointCloud';
import { parseRigsBinary, parseRigsText } from '../parsers/rigs';
import { parseFramesBinary, parseFramesText } from '../parsers/frames';
import { computeImageStats, computeImageStatsFromWasm } from '../parsers/imageStats';
import { writeCamerasBinary, writeImagesBinary, writePoints3DBinary, writeRigsBinary, writeFramesBinary } from '../parsers/colmapBinaryWriters';
import { writeCamerasText, writeImagesText, writePoints3DText, writeRigsText, writeFramesText } from '../parsers/colmapTextWriters';
import { writePointsPLY } from '../parsers/colmapPlyWriter';
import type { Reconstruction, Point2D, Image } from '../types/colmap';
import type { WasmReconstructionWrapper } from './reconstruction';
import type { BoundingBox } from './types';
import { getWasmMemoryStats, releaseColmapWasmModuleCache } from './init';
import { buildPointMembershipFromWasm, packPointMembership } from './compactPointMembership';
import { createSim3dFromEuler, transformReconstruction } from '../utils/sim3dTransforms';
import { filterReconstructionByImageIds } from '../utils/filterReconstruction';
import { detectFloorPlaneFromPositions, getFloorNormalFlippedForCameraDownSide } from '../components/modals/floorPlaneAlignmentPolicy';
import { computeHistogramFromMap, computeHistogramFromWasm } from '../components/layout/statHistogramViewModel';
import type {
  ReconstructionExportFiles, ReconstructionExportPayload, ReconstructionLoadFiles,
  ReconstructionPhase, ReconstructionRequest, ReconstructionOperationResults, ReconstructionSnapshotData,
} from './reconstructionProtocol';

/** The sole owner of the authoritative reconstruction, in a Worker or explicit current-thread fallback. */
export class ReconstructionAuthority {
  private data: Reconstruction | null = null;
  private wasm: WasmReconstructionWrapper | null = null;
  private revision = 0;
  private parser: 'wasm' | 'javascript' = 'javascript';
  private parseMs = 0;
  private retainedImageBufferBytes = 0;
  private warnings: string[] = [];

  async execute(request: ReconstructionRequest, progress: (phase: ReconstructionPhase) => void): Promise<ReconstructionOperationResults[keyof ReconstructionOperationResults]> {
    switch (request.operation) {
      case 'init': return null;
      case 'load': return this.load(request.payload, progress);
      case 'observations': {
        const images = this.requireData().images;
        const result = new Map<number, Point2D[]>();
        for (const id of request.payload.imageIds) {
          if (images.has(id)) result.set(id, this.wasm?.getImagePoints2DArray(id) ?? images.get(id)!.points2D);
        }
        return result;
      }
      case 'transform': {
        progress('editing');
        this.materialize();
        this.data = transformReconstruction(createSim3dFromEuler(request.payload.transform), this.requireData());
        return this.snapshot(progress);
      }
      case 'deleteImages': {
        progress('editing');
        this.materialize();
        this.data = filterReconstructionByImageIds(this.requireData(), new Set(request.payload.imageIds)) ?? this.data;
        return this.snapshot(progress);
      }
      case 'updateCameras': {
        this.data = { ...this.requireData(), cameras: request.payload.cameras };
        return this.snapshot(progress);
      }
      case 'export': progress('exporting'); return this.exportFiles(request.payload);
      case 'histogram': return this.wasm ? computeHistogramFromWasm(this.wasm, request.payload.type)
        : computeHistogramFromMap(this.requireData().points3D!, request.payload.type);
      case 'floor': {
        const data = this.requireData();
        let positions = this.wasm?.getPositions();
        if (!positions) {
          positions = new Float32Array(data.points3D!.size * 3);
          let index = 0;
          for (const point of data.points3D!.values()) { positions.set(point.xyz, index); index += 3; }
        }
        const result = detectFloorPlaneFromPositions(positions, request.payload.transform, request.payload.params);
        return {
          plane: result.plane, distances: result.distances,
          normalFlipped: getFloorNormalFlippedForCameraDownSide(result.plane, data.images.values(), request.payload.transform, undefined, result.positions),
        };
      }
      case 'dispose': this.dispose(); return null;
    }
  }

  private async load(files: ReconstructionLoadFiles, progress: (phase: ReconstructionPhase) => void): Promise<ReconstructionSnapshotData> {
    this.dispose();
    this.warnings = [];
    const started = performance.now();
    performance.mark('colmap-parse-start');
    progress('parsing');
    const parsed = await parseWithWasm(files.camerasFile, files.imagesFile, files.points3DFile, files.rigsFile, files.framesFile);
    let cameras: Reconstruction['cameras'];
    let images: Reconstruction['images'];
    let points3D: Reconstruction['points3D'];
    let rigData = parsed?.rigData;
    if (parsed) {
      this.wasm = parsed.wasmWrapper;
      this.parser = 'wasm';
      this.retainedImageBufferBytes = files.imagesFile.size;
      cameras = parsed.cameras;
      images = parsed.images;
    } else {
      this.parser = 'javascript';
      // Full observations are required for compatible fallback editing/export. They stay in this owner.
      [cameras, images, points3D] = await Promise.all([
        files.camerasFile.name.endsWith('.bin')
          ? files.camerasFile.arrayBuffer().then(parseCamerasBinary)
          : files.camerasFile.text().then(text => parseCamerasText(text, {
            onSkip: camera => this.warnings.push(`Skipped camera with unsupported model: ${camera.modelName}`),
          })),
        files.imagesFile.name.endsWith('.bin')
          ? files.imagesFile.arrayBuffer().then(buffer => parseImagesBinary(buffer, false))
          : files.imagesFile.text().then(parseImagesText),
        files.points3DFile.name.endsWith('.bin')
          ? files.points3DFile.arrayBuffer().then(parsePoints3DBinary)
          : files.points3DFile.name.toLowerCase().endsWith('.ply')
            ? files.points3DFile.arrayBuffer().then(parsePointCloudPlyBuffer)
            : files.points3DFile.text().then(parsePoints3DText),
      ]);
    }
    if (!rigData && files.rigsFile && files.framesFile) {
      try {
        const [rigs, frames] = await Promise.all([
          files.rigsFile.name.endsWith('.bin') ? files.rigsFile.arrayBuffer().then(parseRigsBinary) : files.rigsFile.text().then(parseRigsText),
          files.framesFile.name.endsWith('.bin') ? files.framesFile.arrayBuffer().then(parseFramesBinary) : files.framesFile.text().then(parseFramesText),
        ]);
        rigData = { rigs, frames };
      } catch (error) {
        this.warnings.push(`Could not load optional rigs/frames: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.data = {
      cameras, images, points3D, rigData,
      imageStats: new Map(), connectedImagesIndex: new Map(), imageToPoint3DIds: new Map(),
      globalStats: { minError: 0, maxError: 0, avgError: 0, minTrackLength: 0, maxTrackLength: 0, avgTrackLength: 0, totalObservations: 0, totalPoints: 0 },
    };
    this.parseMs = performance.now() - started;
    performance.mark('colmap-parse-end');
    performance.measure('colmap-parse', 'colmap-parse-start', 'colmap-parse-end');
    return this.snapshot(progress);
  }

  private requireData(): Reconstruction {
    if (!this.data) throw new Error('Reconstruction service has no loaded dataset');
    return this.data;
  }

  private snapshot(progress: (phase: ReconstructionPhase) => void): ReconstructionSnapshotData {
    const data = this.requireData();
    progress('statistics');
    const statsStart = performance.now();
    performance.mark('colmap-statistics-start');
    const stats = this.wasm
      ? computeImageStatsFromWasm(data.images, this.wasm, { includePointMembership: false })
      : computeImageStats(data.images, data.points3D!);
    const statisticsMs = performance.now() - statsStart;
    performance.mark('colmap-statistics-end');
    performance.measure('colmap-statistics', 'colmap-statistics-start', 'colmap-statistics-end');
    progress('snapshot');
    const snapshotStart = performance.now();
    performance.mark('colmap-snapshot-start');
    const count = this.wasm?.pointCount ?? data.points3D!.size;
    // These are dedicated transfer-owned copies, never views into live WASM memory.
    const positions = this.wasm?.getPositionsCopy() ?? new Float32Array(count * 3);
    const colors = this.wasm?.getColorsCopy() ?? new Float32Array(count * 3);
    const errors = this.wasm?.getErrors()?.slice() ?? new Float32Array(count);
    const trackLengths = this.wasm?.getTrackLengths()?.slice() ?? new Uint32Array(count);
    const point3DIds = this.wasm?.getPoint3DIds()?.slice() ?? new BigUint64Array(count);
    let boundingBox: BoundingBox | null = this.wasm?.getBoundingBox() ?? null;
    if (!this.wasm) {
      let index = 0;
      boundingBox = count ? { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity } : null;
      for (const point of data.points3D!.values()) {
        positions.set(point.xyz, index * 3);
        colors.set(point.rgb.map(channel => channel / 255), index * 3);
        errors[index] = point.error;
        trackLengths[index] = point.track.length;
        point3DIds[index] = point.point3DId;
        if (boundingBox) {
          boundingBox.minX = Math.min(boundingBox.minX, point.xyz[0]); boundingBox.maxX = Math.max(boundingBox.maxX, point.xyz[0]);
          boundingBox.minY = Math.min(boundingBox.minY, point.xyz[1]); boundingBox.maxY = Math.max(boundingBox.maxY, point.xyz[1]);
          boundingBox.minZ = Math.min(boundingBox.minZ, point.xyz[2]); boundingBox.maxZ = Math.max(boundingBox.maxZ, point.xyz[2]);
        }
        index++;
      }
    }
    const images = new Map<number, Image>();
    for (const [id, image] of data.images) images.set(id, {
      ...image, points2D: [], numPoints2D: image.numPoints2D ?? image.points2D.length,
    });
    // Transfer packed membership instead of structured-cloning millions of boxed
    // bigint Set entries. The UI creates read-only views without expanding them.
    const membershipStarted = performance.now();
    const pointMembership = this.wasm
      ? buildPointMembershipFromWasm(data.images, this.wasm)
      : packPointMembership(stats.imageToPoint3DIds);
    const membershipPackMs = performance.now() - membershipStarted;
    const reconstruction: Reconstruction = {
      cameras: data.cameras, images, rigData: data.rigData, ...stats, imageToPoint3DIds: new Map(),
    };
    performance.mark('colmap-snapshot-end');
    performance.measure('colmap-snapshot', 'colmap-snapshot-start', 'colmap-snapshot-end');
    return {
      revision: ++this.revision, reconstruction, pointMembership, positions, colors, errors, trackLengths, point3DIds, boundingBox,
      warnings: this.warnings,
      diagnostics: {
        parser: this.parser, parseMs: this.parseMs, statisticsMs, snapshotMs: performance.now() - snapshotStart,
        membershipPackMs,
        membershipBytes: pointMembership.imageIds.byteLength + pointMembership.offsets.byteLength + pointMembership.pointIds.byteLength,
        renderBytes: positions.byteLength + colors.byteLength + errors.byteLength + trackLengths.byteLength + point3DIds.byteLength,
        wasmHeapBytes: this.wasm ? this.wasm.getPositions()?.buffer.byteLength ?? getWasmMemoryStats()?.heapSize ?? null : null,
        retainedImageBufferBytes: this.retainedImageBufferBytes,
      },
    };
  }

  /** Edits replace WASM ownership with full records in this same owner, never a second UI reconstruction. */
  private materialize(): void {
    const data = this.requireData();
    if (!this.wasm) return;
    const points3D = this.wasm.buildPoints3DMap();
    const images = new Map<number, Image>();
    for (const [id, image] of data.images) images.set(id, { ...image, points2D: this.wasm.getImagePoints2DArray(id) });
    this.data = { ...data, points3D, images };
    this.wasm.dispose();
    this.wasm = null;
    releaseColmapWasmModuleCache();
    this.retainedImageBufferBytes = 0;
  }

  private exportFiles(payload: ReconstructionExportPayload): ReconstructionExportFiles {
    let data = this.requireData();
    // Export realization is temporary. Loaded datasets remain in WASM lazy mode until edited.
    if (payload.transform) data = transformReconstruction(createSim3dFromEuler(payload.transform), data, this.wasm);
    const points = data.points3D ?? this.wasm!.buildPoints3DMap();
    const encoder = new TextEncoder();
    if (payload.format === 'ply') return { 'points.ply': encoder.encode(writePointsPLY(points)) };
    const binary = payload.format === 'binary';
    const extension = binary ? 'bin' : 'txt';
    const bytes = (value: ArrayBuffer | string) => typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value);
    const files: ReconstructionExportFiles = {
      [`cameras.${extension}`]: bytes(binary ? writeCamerasBinary(data.cameras) : writeCamerasText(data.cameras)),
      [`images.${extension}`]: bytes(binary ? writeImagesBinary(data.images, this.wasm) : writeImagesText(data.images, this.wasm)),
      [`points3D.${extension}`]: bytes(binary ? writePoints3DBinary(points) : writePoints3DText(points)),
    };
    if (data.rigData?.rigs.size) files[`rigs.${extension}`] = bytes(binary ? writeRigsBinary(data.rigData.rigs) : writeRigsText(data.rigData.rigs));
    if (data.rigData?.frames.size) files[`frames.${extension}`] = bytes(binary ? writeFramesBinary(data.rigData.frames) : writeFramesText(data.rigData.frames));
    return files;
  }

  dispose(): void {
    this.wasm?.dispose();
    this.wasm = null;
    releaseColmapWasmModuleCache();
    this.data = null;
    this.retainedImageBufferBytes = 0;
  }
}
