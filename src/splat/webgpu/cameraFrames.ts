import * as THREE from 'three';
import type { Camera, Image } from '../../types/colmap';
import type { Sim3dEuler } from '../../types/sim3d';
import { getCameraIntrinsics } from '../../utils/cameraIntrinsics';
import { getImageWorldPose } from '../../utils/colmapTransforms';
import { createSim3dFromEuler, sim3dToMatrix4 } from '../../utils/sim3dTransforms';
import type { WebGpuSplatUniformFrame } from './cameraUniforms';

const colmapToThreeCameraRotation = new THREE.Quaternion()
  .setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
const threeCameraViewFromModel = new THREE.Matrix4();
const threeCameraModelWorld = new THREE.Matrix4();
const threeCameraModelPosition = new THREE.Vector3();

export interface WebGpuSplatViewportFrame {
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  dpr: number;
}

export type WebGpuSplatCameraFrame = WebGpuSplatUniformFrame & {
  viewport: WebGpuSplatViewportFrame;
  camera: WebGpuSplatUniformFrame['camera'] & {
    worldMatrix: Float32Array;
  };
};

export interface WebGpuSplatFrameFromThreeCameraOptions {
  camera: THREE.Camera;
  width: number;
  height: number;
  dpr: number;
  modelMatrix?: THREE.Matrix4 | null;
}

export interface ColmapMetricWebGpuSplatTile {
  fullWidth: number;
  fullHeight: number;
  originX: number;
  originY: number;
}

export interface ColmapMetricWebGpuSplatFrameOptions {
  image: Image;
  camera: Camera;
  width: number;
  height: number;
  transform?: Sim3dEuler;
  modelTransform?: Sim3dEuler;
  modelMatrix?: THREE.Matrix4 | null;
  near?: number;
  far?: number;
  tile?: ColmapMetricWebGpuSplatTile;
}

export function createWebGpuSplatViewportFrame(
  width: number,
  height: number,
  dpr: number
): WebGpuSplatViewportFrame {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return {
    cssWidth: safeWidth,
    cssHeight: safeHeight,
    pixelWidth: Math.max(1, Math.round(safeWidth * safeDpr)),
    pixelHeight: Math.max(1, Math.round(safeHeight * safeDpr)),
    dpr: safeDpr,
  };
}

export function createWebGpuSplatFrameFromThreeCamera({
  camera,
  width,
  height,
  dpr,
  modelMatrix = null,
}: WebGpuSplatFrameFromThreeCameraOptions): WebGpuSplatCameraFrame {
  camera.updateMatrixWorld();
  const projectionCamera = camera as THREE.Camera & {
    near?: number;
    far?: number;
    isPerspectiveCamera?: boolean;
    isOrthographicCamera?: boolean;
  };
  const viewFromModel = threeCameraViewFromModel.copy(camera.matrixWorldInverse);
  if (modelMatrix) {
    viewFromModel.multiply(modelMatrix);
  }
  const modelCameraWorld = threeCameraModelWorld.copy(viewFromModel).invert();
  const modelCameraPosition = threeCameraModelPosition.setFromMatrixPosition(modelCameraWorld);

  return {
    viewport: createWebGpuSplatViewportFrame(width, height, dpr),
    camera: {
      kind: projectionCamera.isPerspectiveCamera
        ? 'perspective'
        : projectionCamera.isOrthographicCamera
          ? 'orthographic'
          : 'unknown',
      viewMatrix: new Float32Array(viewFromModel.elements),
      projectionMatrix: new Float32Array(camera.projectionMatrix.elements),
      worldMatrix: new Float32Array(modelCameraWorld.elements),
      position: [modelCameraPosition.x, modelCameraPosition.y, modelCameraPosition.z],
      near: typeof projectionCamera.near === 'number' ? projectionCamera.near : null,
      far: typeof projectionCamera.far === 'number' ? projectionCamera.far : null,
    },
  };
}

export function createColmapMetricWebGpuSplatFrame({
  image,
  camera,
  width,
  height,
  transform,
  modelTransform,
  modelMatrix,
  near = 0.001,
  far = 10000,
  tile,
}: ColmapMetricWebGpuSplatFrameOptions): WebGpuSplatCameraFrame {
  const metricCamera = createColmapMetricThreeCamera(image, camera, width, height, transform, near, far, tile);
  const resolvedModelMatrix = modelMatrix !== undefined
    ? modelMatrix
    : modelTransform
      ? sim3dToMatrix4(createSim3dFromEuler(modelTransform))
      : transform
        ? sim3dToMatrix4(createSim3dFromEuler(transform))
        : null;
  return createWebGpuSplatFrameFromThreeCamera({
    camera: metricCamera,
    width,
    height,
    dpr: 1,
    modelMatrix: resolvedModelMatrix,
  });
}

export function createColmapMetricThreeCamera(
  image: Image,
  camera: Camera,
  width: number,
  height: number,
  transform?: Sim3dEuler,
  near = 0.001,
  far = 10000,
  tile?: ColmapMetricWebGpuSplatTile
): THREE.PerspectiveCamera {
  const intrinsics = getCameraIntrinsics(camera);
  const fullWidth = tile ? requirePositiveInteger(tile.fullWidth, 'tile fullWidth') : width;
  const fullHeight = tile ? requirePositiveInteger(tile.fullHeight, 'tile fullHeight') : height;
  const originX = tile ? requireNonNegativeInteger(tile.originX, 'tile originX') : 0;
  const originY = tile ? requireNonNegativeInteger(tile.originY, 'tile originY') : 0;
  const scaleX = fullWidth / camera.width;
  const scaleY = fullHeight / camera.height;
  const fx = intrinsics.fx * scaleX;
  const fy = intrinsics.fy * scaleY;
  const cx = intrinsics.cx * scaleX - originX;
  const cy = intrinsics.cy * scaleY - originY;

  const left = -cx * near / fx;
  const right = (width - cx) * near / fx;
  const top = cy * near / fy;
  const bottom = -(height - cy) * near / fy;
  const verticalFovDegrees = 2 * Math.atan(height / (2 * fy)) * 180 / Math.PI;
  const metricCamera = new THREE.PerspectiveCamera(verticalFovDegrees, width / height, near, far);
  metricCamera.projectionMatrix.makePerspective(left, right, top, bottom, near, far);
  metricCamera.projectionMatrixInverse.copy(metricCamera.projectionMatrix).invert();

  const pose = getImageWorldPose(image);
  if (transform) {
    const sim3d = createSim3dFromEuler(transform);
    metricCamera.position.copy(pose.position)
      .applyQuaternion(sim3d.rotation)
      .multiplyScalar(sim3d.scale)
      .add(sim3d.translation);
    metricCamera.quaternion.copy(sim3d.rotation)
      .multiply(pose.quaternion)
      .multiply(colmapToThreeCameraRotation);
  } else {
    metricCamera.position.copy(pose.position);
    metricCamera.quaternion.copy(pose.quaternion).multiply(colmapToThreeCameraRotation);
  }
  metricCamera.updateMatrixWorld(true);
  return metricCamera;
}

export function projectWebGpuSplatFramePointToPixel(
  frame: WebGpuSplatCameraFrame,
  point: [number, number, number]
): [number, number] {
  const viewMatrix = new THREE.Matrix4().fromArray(Array.from(frame.camera.viewMatrix));
  const projectionMatrix = new THREE.Matrix4().fromArray(Array.from(frame.camera.projectionMatrix));
  const clip = new THREE.Vector4(point[0], point[1], point[2], 1)
    .applyMatrix4(viewMatrix)
    .applyMatrix4(projectionMatrix);
  const ndcX = clip.x / clip.w;
  const ndcY = clip.y / clip.w;
  return [
    (ndcX + 1) * 0.5 * frame.viewport.pixelWidth,
    (1 - ndcY) * 0.5 * frame.viewport.pixelHeight,
  ];
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid COLMAP metric WebGPU splat frame ${name}: expected a positive integer`);
  }
  return value;
}

function requireNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid COLMAP metric WebGPU splat frame ${name}: expected a non-negative integer`);
  }
  return value;
}
