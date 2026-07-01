import * as THREE from 'three';
import type { Camera, Image, ImageId, Reconstruction } from '../../types/colmap';
import { getCameraColor } from '../../theme';
import { getImageWorldPose } from '../../utils/colmapTransforms';
import { getCameraIntrinsics } from '../../utils/cameraIntrinsics';
import { cameraModelHasPinholeIntrinsics } from '../../utils/cameraModelRegistry';
import {
  computeSplatMetricColorScale,
  getSplatMetricScaleColor,
  getSplatPsnrColor,
  getSplatSsimColor,
  type SplatMetricColorScale,
} from './splatPsnrMetric';

export type FrustumColorMode = 'single' | 'byCamera' | 'byRigFrame' | 'splatPsnr' | 'splatSsim';
export type FrustumPsnrMetricSource = ReadonlyMap<ImageId, { psnr: number; ssim?: number }>;

export interface FrustumImageSource {
  getImageSync(name: string): File | null | undefined;
}

export interface CameraFrustumItem {
  image: Image;
  camera: Camera;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  imageFile?: File;
  cameraIndex: number;
  numPoints3D: number;
}

export interface FrustumPlaneSize {
  width: number;
  height: number;
  depth: number;
  offsetX: number;
  offsetY: number;
}

export interface FrustumLineGeometryData {
  positions: Float32Array;
  baseColors: Float32Array;
  baseAlphas: Float32Array;
}

export type FrustumGeometryItem = Pick<
  CameraFrustumItem,
  'image' | 'camera' | 'position' | 'quaternion' | 'cameraIndex'
>;

export function getFrustumBaseColor(
  frustumColorMode: FrustumColorMode,
  cameraIndex: number,
  imageId: ImageId,
  imageFrameIndexMap: Map<ImageId, number>,
  frustumSingleColor: string,
  splatPsnrByImage?: FrustumPsnrMetricSource,
  metricColorScale?: SplatMetricColorScale | null
): string {
  if (frustumColorMode === 'splatPsnr') {
    const psnr = splatPsnrByImage?.get(imageId)?.psnr;
    return metricColorScale
      ? getSplatMetricScaleColor(psnr, metricColorScale)
      : getSplatPsnrColor(psnr);
  }
  if (frustumColorMode === 'splatSsim') {
    const ssim = splatPsnrByImage?.get(imageId)?.ssim;
    return metricColorScale
      ? getSplatMetricScaleColor(ssim, metricColorScale)
      : getSplatSsimColor(ssim);
  }
  if (frustumColorMode === 'byCamera') {
    return getCameraColor(cameraIndex);
  }
  if (frustumColorMode === 'byRigFrame') {
    const frameIndex = imageFrameIndexMap.get(imageId);
    return frameIndex !== undefined ? getCameraColor(frameIndex) : frustumSingleColor;
  }
  return frustumSingleColor;
}

export function getFrustumMetricColorScale(
  frustumColorMode: FrustumColorMode,
  imageIds: Iterable<ImageId>,
  splatPsnrByImage?: FrustumPsnrMetricSource
): SplatMetricColorScale | null {
  if (!splatPsnrByImage) return null;
  if (frustumColorMode === 'splatPsnr') {
    return computeSplatMetricColorScale(Array.from(imageIds, (imageId) => splatPsnrByImage.get(imageId)?.psnr));
  }
  if (frustumColorMode === 'splatSsim') {
    return computeSplatMetricColorScale(Array.from(imageIds, (imageId) => splatPsnrByImage.get(imageId)?.ssim));
  }
  return null;
}

export function buildCameraIdToIndex(reconstruction: Reconstruction | null): Map<number, number> {
  const map = new Map<number, number>();
  if (!reconstruction) return map;

  let index = 0;
  for (const cameraId of reconstruction.cameras.keys()) {
    map.set(cameraId, index++);
  }
  return map;
}

export function buildImageFrameIndexMap(reconstruction: Reconstruction | null): Map<ImageId, number> {
  const map = new Map<ImageId, number>();
  if (!reconstruction) return map;

  const frameGroups = new Map<string, ImageId[]>();
  for (const image of reconstruction.images.values()) {
    const parts = image.name.split(/[/\\]/);
    const frameId = parts.length >= 2 ? parts[parts.length - 1] : image.name;
    const existing = frameGroups.get(frameId) ?? [];
    existing.push(image.imageId);
    frameGroups.set(frameId, existing);
  }

  let frameIndex = 0;
  for (const imageIds of frameGroups.values()) {
    if (imageIds.length < 2) continue;

    for (const imageId of imageIds) {
      map.set(imageId, frameIndex);
    }
    frameIndex++;
  }

  return map;
}

export function getFrustumPlaneSize(camera: Camera, scale: number): FrustumPlaneSize {
  const invalidPlaneSize = { width: 0, height: 0, depth: scale, offsetX: 0, offsetY: 0 };

  if (!cameraModelHasPinholeIntrinsics(camera.modelId)) {
    return invalidPlaneSize;
  }

  if (
    camera.width <= 0 ||
    camera.height <= 0 ||
    scale <= 0 ||
    !Number.isFinite(camera.width) ||
    !Number.isFinite(camera.height) ||
    !Number.isFinite(scale)
  ) {
    return invalidPlaneSize;
  }

  const { fx, fy, cx, cy } = getCameraIntrinsics(camera);
  if (
    fx <= 0 ||
    fy <= 0 ||
    !Number.isFinite(fx) ||
    !Number.isFinite(fy) ||
    !Number.isFinite(cx) ||
    !Number.isFinite(cy)
  ) {
    return invalidPlaneSize;
  }

  return {
    width: scale * camera.width / fx,
    height: scale * camera.height / fy,
    depth: scale,
    offsetX: scale * (camera.width / 2 - cx) / fx,
    offsetY: scale * (cy - camera.height / 2) / fy,
  };
}

export function buildCameraFrustumItems({
  reconstruction,
  imageSource,
  cameraIdToIndex,
  pendingDeletions,
}: {
  reconstruction: Reconstruction | null;
  imageSource: FrustumImageSource;
  cameraIdToIndex: Map<number, number>;
  pendingDeletions: Set<ImageId>;
}): CameraFrustumItem[] {
  if (!reconstruction) return [];

  const result: CameraFrustumItem[] = [];

  for (const image of reconstruction.images.values()) {
    if (pendingDeletions.has(image.imageId)) continue;

    const camera = reconstruction.cameras.get(image.cameraId);
    if (!camera) continue;

    const { position, quaternion } = getImageWorldPose(image);
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
      continue;
    }

    result.push({
      image,
      camera,
      position,
      quaternion,
      imageFile: imageSource.getImageSync(image.name) ?? undefined,
      cameraIndex: cameraIdToIndex.get(image.cameraId) ?? 0,
      numPoints3D: reconstruction.imageStats.get(image.imageId)?.numPoints3D ?? 0,
    });
  }

  return result;
}

export function buildFrustumLineGeometryData(
  frustums: FrustumGeometryItem[],
  cameraScale: number,
  {
    frustumColorMode,
    frustumSingleColor,
    imageFrameIndexMap,
    splatPsnrByImage,
  }: {
    frustumColorMode: FrustumColorMode;
    frustumSingleColor: string;
    imageFrameIndexMap: Map<ImageId, number>;
    splatPsnrByImage?: FrustumPsnrMetricSource;
  }
): FrustumLineGeometryData {
  const positions = new Float32Array(frustums.length * 48);
  const baseColors = new Float32Array(frustums.length * 48);
  const baseAlphas = new Float32Array(frustums.length * 16);
  const color = new THREE.Color();
  const metricColorScale = getFrustumMetricColorScale(
    frustumColorMode,
    frustums.map((frustum) => frustum.image.imageId),
    splatPsnrByImage
  );

  frustums.forEach((frustum, index) => {
    const offset = index * 48;
    const alphaOffset = index * 16;
    const planeSize = getFrustumPlaneSize(frustum.camera, cameraScale);
    const halfWidth = planeSize.width / 2;
    const halfHeight = planeSize.height / 2;
    const depth = planeSize.depth;
    const centerX = planeSize.offsetX;
    const centerY = planeSize.offsetY;

    const apex = new THREE.Vector3(0, 0, 0);
    const bl = new THREE.Vector3(centerX - halfWidth, centerY - halfHeight, depth);
    const br = new THREE.Vector3(centerX + halfWidth, centerY - halfHeight, depth);
    const tr = new THREE.Vector3(centerX + halfWidth, centerY + halfHeight, depth);
    const tl = new THREE.Vector3(centerX - halfWidth, centerY + halfHeight, depth);

    apex.applyQuaternion(frustum.quaternion).add(frustum.position);
    bl.applyQuaternion(frustum.quaternion).add(frustum.position);
    br.applyQuaternion(frustum.quaternion).add(frustum.position);
    tr.applyQuaternion(frustum.quaternion).add(frustum.position);
    tl.applyQuaternion(frustum.quaternion).add(frustum.position);

    writeSegment(positions, offset + 0, apex, bl);
    writeSegment(positions, offset + 6, apex, br);
    writeSegment(positions, offset + 12, apex, tr);
    writeSegment(positions, offset + 18, apex, tl);
    writeSegment(positions, offset + 24, bl, br);
    writeSegment(positions, offset + 30, br, tr);
    writeSegment(positions, offset + 36, tr, tl);
    writeSegment(positions, offset + 42, tl, bl);

    color.set(getFrustumBaseColor(
      frustumColorMode,
      frustum.cameraIndex,
      frustum.image.imageId,
      imageFrameIndexMap,
      frustumSingleColor,
      splatPsnrByImage,
      metricColorScale
    ));

    for (let vertex = 0; vertex < 16; vertex++) {
      baseColors[offset + vertex * 3 + 0] = color.r;
      baseColors[offset + vertex * 3 + 1] = color.g;
      baseColors[offset + vertex * 3 + 2] = color.b;
      baseAlphas[alphaOffset + vertex] = 1.0;
    }
  });

  return { positions, baseColors, baseAlphas };
}

function writeSegment(
  positions: Float32Array,
  offset: number,
  start: THREE.Vector3,
  end: THREE.Vector3
): void {
  positions[offset + 0] = start.x;
  positions[offset + 1] = start.y;
  positions[offset + 2] = start.z;
  positions[offset + 3] = end.x;
  positions[offset + 4] = end.y;
  positions[offset + 5] = end.z;
}
