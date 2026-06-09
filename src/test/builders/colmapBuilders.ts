import {
  CameraModelId,
  UNMATCHED_POINT3D_ID,
  type Camera,
  type GlobalStats,
  type Image,
  type ImageId,
  type ImageStats,
  type LoadedFiles,
  type Point2D,
  type Point3D,
  type Point3DId,
  type Reconstruction,
  type SplatFileSource,
} from '../../types/colmap';
import { SensorType, type Frame, type Rig, type RigData, type RigSensor } from '../../types/rig';

interface ReconstructionBuilderOptions {
  cameras?: Camera[];
  images?: Image[];
  points3D?: Point3D[];
  imageStats?: Map<ImageId, ImageStats>;
  connectedImagesIndex?: Reconstruction['connectedImagesIndex'];
  imageToPoint3DIds?: Reconstruction['imageToPoint3DIds'];
  globalStats?: Partial<GlobalStats>;
  rigData?: RigData;
}

interface LoadedFilesBuilderOptions {
  imageFiles?: File[] | Map<string, File>;
  hasMasks?: boolean;
  camerasFile?: File;
  imagesFile?: File;
  points3DFile?: File;
  splatFile?: File;
  databaseFile?: File;
  rigsFile?: File;
  framesFile?: File;
  splatFiles?: File[];
  splatFileSources?: SplatFileSource[];
}

interface RigDataBuilderOptions {
  rigs?: Rig[] | Map<number, Rig>;
  frames?: Frame[] | Map<number, Frame>;
}

export function buildFile(name = 'image.jpg', contents = 'test', type = 'image/jpeg'): File {
  return new File([contents], name, { type });
}

export function buildCamera(overrides: Partial<Camera> = {}): Camera {
  const width = overrides.width ?? 640;
  const height = overrides.height ?? 480;

  return {
    cameraId: 1,
    modelId: CameraModelId.PINHOLE,
    width,
    height,
    params: [500, 500, width / 2, height / 2],
    ...overrides,
  };
}

export function buildPoint2D(overrides: Partial<Point2D> = {}): Point2D {
  return {
    xy: [0, 0],
    point3DId: UNMATCHED_POINT3D_ID,
    ...overrides,
  };
}

export function buildImage(overrides: Partial<Image> = {}): Image {
  return {
    imageId: 1,
    qvec: [1, 0, 0, 0],
    tvec: [0, 0, 0],
    cameraId: 1,
    name: 'image.jpg',
    points2D: [],
    ...overrides,
  };
}

export function buildPoint3D(overrides: Partial<Point3D> = {}): Point3D {
  return {
    point3DId: 1n,
    xyz: [0, 0, 0],
    rgb: [255, 255, 255],
    error: 0,
    track: [],
    ...overrides,
  };
}

export function buildRig(overrides: Partial<Rig> = {}): Rig {
  const refSensorId = overrides.refSensorId ?? { type: SensorType.CAMERA, id: 1 };

  return {
    rigId: 1,
    refSensorId,
    sensors: [{ sensorId: refSensorId, hasPose: false }],
    ...overrides,
  };
}

export function buildFrame(overrides: Partial<Frame> = {}): Frame {
  return {
    frameId: 1,
    rigId: 1,
    rigFromWorld: {
      qvec: [1, 0, 0, 0],
      tvec: [0, 0, 0],
    },
    dataIds: [{ sensorId: { type: SensorType.CAMERA, id: 1 }, dataId: 1 }],
    ...overrides,
  };
}

export function buildRigSensor(overrides: Partial<RigSensor> = {}): RigSensor {
  return {
    sensorId: { type: SensorType.CAMERA, id: 1 },
    hasPose: false,
    ...overrides,
  };
}

export function buildRigData(options: RigDataBuilderOptions = {}): RigData {
  const rigs = normalizeRigs(options.rigs ?? [buildRig()]);
  const frames = normalizeFrames(options.frames ?? [buildFrame()]);

  return { rigs, frames };
}

export function buildImageStats(overrides: Partial<ImageStats> = {}): ImageStats {
  return {
    numPoints3D: 0,
    avgError: 0,
    covisibleCount: 0,
    ...overrides,
  };
}

export function buildGlobalStats(overrides: Partial<GlobalStats> = {}): GlobalStats {
  return {
    minError: 0,
    maxError: 0,
    avgError: 0,
    minTrackLength: 0,
    maxTrackLength: 0,
    avgTrackLength: 0,
    totalObservations: 0,
    totalPoints: 0,
    ...overrides,
  };
}

export function buildReconstruction(options: ReconstructionBuilderOptions = {}): Reconstruction {
  const cameras = options.cameras ?? [buildCamera()];
  const images = options.images ?? [buildImage({ cameraId: cameras[0].cameraId })];
  const points3D = options.points3D;

  const imageStats = options.imageStats ?? new Map(
    images.map((image) => [
      image.imageId,
      buildImageStats({ numPoints3D: countTriangulatedPoints(image.points2D) }),
    ])
  );

  return {
    cameras: new Map(cameras.map((camera) => [camera.cameraId, camera])),
    images: new Map(images.map((image) => [image.imageId, image])),
    ...(points3D ? { points3D: new Map(points3D.map((point) => [point.point3DId, point])) } : {}),
    imageStats,
    connectedImagesIndex: options.connectedImagesIndex ?? new Map(),
    globalStats: buildGlobalStats(options.globalStats),
    imageToPoint3DIds: options.imageToPoint3DIds ?? buildImageToPoint3DIds(images),
    ...(options.rigData ? { rigData: options.rigData } : {}),
  };
}

export function buildLoadedFiles(options: LoadedFilesBuilderOptions = {}): LoadedFiles {
  return {
    camerasFile: options.camerasFile,
    imagesFile: options.imagesFile,
    points3DFile: options.points3DFile,
    splatFile: options.splatFile,
    databaseFile: options.databaseFile,
    rigsFile: options.rigsFile,
    framesFile: options.framesFile,
    splatFiles: options.splatFiles ?? (options.splatFile ? [options.splatFile] : undefined),
    splatFileSources: options.splatFileSources,
    imageFiles: normalizeImageFiles(options.imageFiles),
    hasMasks: options.hasMasks ?? false,
  };
}

function countTriangulatedPoints(points2D: Point2D[]): number {
  return points2D.filter((point) => point.point3DId !== UNMATCHED_POINT3D_ID).length;
}

function buildImageToPoint3DIds(images: Image[]): Map<ImageId, Set<Point3DId>> {
  return new Map(
    images.map((image) => [
      image.imageId,
      new Set(
        image.points2D
          .map((point) => point.point3DId)
          .filter((pointId) => pointId !== UNMATCHED_POINT3D_ID)
      ),
    ])
  );
}

function normalizeImageFiles(imageFiles: LoadedFilesBuilderOptions['imageFiles']): Map<string, File> {
  if (!imageFiles) return new Map();
  if (imageFiles instanceof Map) return imageFiles;
  return new Map(imageFiles.map((file) => [file.name, file]));
}

function normalizeRigs(rigs: RigDataBuilderOptions['rigs']): Map<number, Rig> {
  if (!rigs) return new Map();
  if (rigs instanceof Map) return rigs;
  return new Map(rigs.map((rig) => [rig.rigId, rig]));
}

function normalizeFrames(frames: RigDataBuilderOptions['frames']): Map<number, Frame> {
  if (!frames) return new Map();
  if (frames instanceof Map) return frames;
  return new Map(frames.map((frame) => [frame.frameId, frame]));
}
