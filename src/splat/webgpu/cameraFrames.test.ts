import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildCamera, buildImage } from '../../test/builders';
import { createSim3dFromEuler, sim3dToMatrix4 } from '../../utils/sim3dTransforms';
import {
  createColmapMetricThreeCamera,
  createColmapMetricWebGpuSplatFrame,
  createWebGpuSplatFrameFromThreeCamera,
  projectWebGpuSplatFramePointToPixel,
} from './cameraFrames';
import { createSplatProjectionUniforms } from './gaussianRenderer';

const TEST_SPLAT_SCENE = {
  count: 1,
  shDegree: 0,
  bounds: {
    min: [-1, -1, -1] as [number, number, number],
    max: [1, 1, 1] as [number, number, number],
    center: [0, 0, 0] as [number, number, number],
    size: 2,
  },
};

function projectThreePointToPixel(
  camera: THREE.Camera,
  point: THREE.Vector3,
  width: number,
  height: number
): [number, number] {
  const ndc = point.clone().project(camera);
  return [
    (ndc.x + 1) * 0.5 * width,
    (1 - ndc.y) * 0.5 * height,
  ];
}

function expectPixelClose(actual: [number, number], expected: [number, number]): void {
  expect(actual[0]).toBeCloseTo(expected[0], 4);
  expect(actual[1]).toBeCloseTo(expected[1], 4);
}

function expectArrayClose(actual: ArrayLike<number>, expected: ArrayLike<number>): void {
  expect(actual.length).toBe(expected.length);
  for (let index = 0; index < actual.length; index++) {
    expect(actual[index]).toBeCloseTo(expected[index], 6);
  }
}

function colmapCameraPointToWorld(
  qvec: [number, number, number, number],
  tvec: [number, number, number],
  cameraPoint: THREE.Vector3
): THREE.Vector3 {
  const rotation = new THREE.Quaternion(qvec[1], qvec[2], qvec[3], qvec[0]).normalize();
  return cameraPoint
    .clone()
    .sub(new THREE.Vector3(tvec[0], tvec[1], tvec[2]))
    .applyQuaternion(rotation.clone().invert());
}

function projectColmapPinholePoint(
  qvec: [number, number, number, number],
  tvec: [number, number, number],
  worldPoint: THREE.Vector3,
  fx: number,
  fy: number,
  cx: number,
  cy: number
): [number, number] {
  const rotation = new THREE.Quaternion(qvec[1], qvec[2], qvec[3], qvec[0]).normalize();
  const cameraPoint = worldPoint
    .clone()
    .applyQuaternion(rotation)
    .add(new THREE.Vector3(tvec[0], tvec[1], tvec[2]));
  return [
    fx * cameraPoint.x / cameraPoint.z + cx,
    fy * cameraPoint.y / cameraPoint.z + cy,
  ];
}

describe('WebGPU splat camera frames', () => {
  it('captures the Three camera projection and model-space camera pose', () => {
    const camera = new THREE.PerspectiveCamera(50, 2, 0.2, 200);
    camera.position.set(1, 2, 3);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const frame = createWebGpuSplatFrameFromThreeCamera({
      camera,
      width: 800,
      height: 400,
      dpr: 2,
    });

    expect(frame.viewport.pixelWidth).toBe(1600);
    expect(frame.viewport.pixelHeight).toBe(800);
    expectArrayClose(frame.camera.viewMatrix, camera.matrixWorldInverse.elements);
    expectArrayClose(frame.camera.projectionMatrix, camera.projectionMatrix.elements);
    expectArrayClose(frame.camera.worldMatrix, camera.matrixWorld.elements);
    expect(frame.camera.position).toEqual([1, 2, 3]);
  });

  it('bakes a Sim3D model transform into viewFromModel so WebGPU matches transformed Three content', () => {
    const width = 800;
    const height = 400;
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const transform = createSim3dFromEuler({
      scale: 1.7,
      rotationX: 0.2,
      rotationY: -0.15,
      rotationZ: 0.4,
      translationX: 1,
      translationY: -2,
      translationZ: 0.5,
    });
    const modelMatrix = sim3dToMatrix4(transform);
    const modelPoint = new THREE.Vector3(0.4, -0.3, 0.2);
    const transformedPoint = modelPoint.clone().applyMatrix4(modelMatrix);
    const frame = createWebGpuSplatFrameFromThreeCamera({
      camera,
      width,
      height,
      dpr: 1,
      modelMatrix,
    });

    expectPixelClose(
      projectWebGpuSplatFramePointToPixel(frame, [modelPoint.x, modelPoint.y, modelPoint.z]),
      projectThreePointToPixel(camera, transformedPoint, width, height)
    );
  });

  it('preserves separate fx/fy focal lengths without treating anisotropy as distortion', () => {
    const camera = buildCamera({
      width: 800,
      height: 400,
      params: [200, 400, 400, 200],
    });
    const image = buildImage({ cameraId: camera.cameraId });
    const frame = createColmapMetricWebGpuSplatFrame({
      image,
      camera,
      width: camera.width,
      height: camera.height,
    });
    const uniforms = createSplatProjectionUniforms(frame, TEST_SPLAT_SCENE);

    expect(uniforms.focalX).toBeCloseTo(200);
    expect(uniforms.focalY).toBeCloseTo(400);

    const projectPixel = (u: number, v: number): [number, number] => {
      const z = 2;
      const point: [number, number, number] = [
        (u - 400) / 200 * z,
        (v - 200) / 400 * z,
        z,
      ];
      return projectWebGpuSplatFramePointToPixel(frame, point);
    };

    expectPixelClose(projectPixel(400, 200), [400, 200]);
    expectPixelClose(projectPixel(0, 0), [0, 0]);
    expectPixelClose(projectPixel(800, 400), [800, 400]);
  });

  it('preserves off-center principal points through the projection matrix', () => {
    const camera = buildCamera({
      width: 800,
      height: 400,
      params: [300, 300, 410, 190],
    });
    const image = buildImage({ cameraId: camera.cameraId });
    const frame = createColmapMetricWebGpuSplatFrame({
      image,
      camera,
      width: camera.width,
      height: camera.height,
    });
    const uniforms = createSplatProjectionUniforms(frame, TEST_SPLAT_SCENE);

    expect(uniforms.focalX).toBeCloseTo(300);
    expect(uniforms.focalY).toBeCloseTo(300);
    expect(frame.camera.projectionMatrix[8]).not.toBeCloseTo(0);
    expect(frame.camera.projectionMatrix[9]).not.toBeCloseTo(0);
    expectArrayClose(uniforms.projMatrix, frame.camera.projectionMatrix);

    const projectPixel = (u: number, v: number): [number, number] => {
      const z = 2;
      const point: [number, number, number] = [
        (u - 410) / 300 * z,
        (v - 190) / 300 * z,
        z,
      ];
      return projectWebGpuSplatFramePointToPixel(frame, point);
    };

    expectPixelClose(projectPixel(410, 190), [410, 190]);
    expectPixelClose(projectPixel(0, 0), [0, 0]);
    expectPixelClose(projectPixel(800, 400), [800, 400]);
  });

  it('keeps raw model points aligned with transformed COLMAP metric views', () => {
    const camera = buildCamera({
      width: 800,
      height: 400,
      params: [200, 400, 410, 190],
    });
    const image = buildImage({ cameraId: camera.cameraId });
    const transform = {
      scale: 2,
      rotationX: 0.15,
      rotationY: -0.2,
      rotationZ: 0.35,
      translationX: 3,
      translationY: -2,
      translationZ: 5,
    };
    const frame = createColmapMetricWebGpuSplatFrame({
      image,
      camera,
      width: camera.width,
      height: camera.height,
      transform,
    });

    const projectPixel = (u: number, v: number): [number, number] => {
      const z = 2;
      const point: [number, number, number] = [
        (u - 410) / 200 * z,
        (v - 190) / 400 * z,
        z,
      ];
      return projectWebGpuSplatFramePointToPixel(frame, point);
    };

    expectPixelClose(projectPixel(410, 190), [410, 190]);
    expectPixelClose(projectPixel(0, 0), [0, 0]);
    expectPixelClose(projectPixel(800, 400), [800, 400]);
  });

  it('keeps metric projection invariant under a viewer Sim3D transform', () => {
    const camera = buildCamera({
      width: 1200,
      height: 800,
      params: [720, 690, 610, 395],
    });
    const imageRotation = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(0.12, -0.28, 0.17, 'XYZ'));
    const image = buildImage({
      cameraId: camera.cameraId,
      qvec: [imageRotation.w, imageRotation.x, imageRotation.y, imageRotation.z],
      tvec: [0.4, -0.3, 1.2],
    });
    const transform = {
      scale: 1.8,
      rotationX: -0.25,
      rotationY: 0.4,
      rotationZ: 0.15,
      translationX: -3,
      translationY: 2,
      translationZ: 0.75,
    };
    const metricCamera = createColmapMetricThreeCamera(
      image,
      camera,
      camera.width,
      camera.height
    );
    const modelPoint = metricCamera.localToWorld(new THREE.Vector3(0.35, -0.2, -4.5));
    const identityFrame = createColmapMetricWebGpuSplatFrame({
      image,
      camera,
      width: camera.width,
      height: camera.height,
    });
    const transformedFrame = createColmapMetricWebGpuSplatFrame({
      image,
      camera,
      width: camera.width,
      height: camera.height,
      transform,
    });

    expectPixelClose(
      projectWebGpuSplatFramePointToPixel(transformedFrame, [
        modelPoint.x,
        modelPoint.y,
        modelPoint.z,
      ]),
      projectWebGpuSplatFramePointToPixel(identityFrame, [
        modelPoint.x,
        modelPoint.y,
        modelPoint.z,
      ])
    );
  });

  it('matches analytic COLMAP pinhole projection for arbitrary pose, Sim3D, and tile origin', () => {
    const fullWidth = 1600;
    const fullHeight = 1000;
    const tileOriginX = 512;
    const tileOriginY = 320;
    const camera = buildCamera({
      width: fullWidth,
      height: fullHeight,
      params: [910, 725, 835, 468],
    });
    const imageRotation = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(-0.31, 0.27, 0.19, 'XYZ'))
      .normalize();
    const image = buildImage({
      cameraId: camera.cameraId,
      qvec: [imageRotation.w, imageRotation.x, imageRotation.y, imageRotation.z],
      tvec: [0.35, -0.22, 1.4],
    });
    const transform = {
      scale: 1.35,
      rotationX: 0.18,
      rotationY: -0.25,
      rotationZ: 0.11,
      translationX: -1.5,
      translationY: 0.75,
      translationZ: 2.25,
    };
    const frame = createColmapMetricWebGpuSplatFrame({
      image,
      camera,
      width: 256,
      height: 192,
      transform,
      tile: {
        fullWidth,
        fullHeight,
        originX: tileOriginX,
        originY: tileOriginY,
      },
    });

    for (const cameraPoint of [
      new THREE.Vector3(-0.42, -0.15, 4.2),
      new THREE.Vector3(0.18, 0.33, 3.1),
      new THREE.Vector3(0.72, -0.28, 5.4),
    ]) {
      const worldPoint = colmapCameraPointToWorld(image.qvec, image.tvec, cameraPoint);
      const fullPixel = projectColmapPinholePoint(
        image.qvec,
        image.tvec,
        worldPoint,
        910,
        725,
        835,
        468
      );

      expectPixelClose(
        projectWebGpuSplatFramePointToPixel(frame, [worldPoint.x, worldPoint.y, worldPoint.z]),
        [fullPixel[0] - tileOriginX, fullPixel[1] - tileOriginY]
      );
    }
  });

  it('projects full-resolution COLMAP pixels into a tile viewport', () => {
    const camera = buildCamera({
      width: 800,
      height: 400,
      params: [200, 400, 410, 190],
    });
    const image = buildImage({ cameraId: camera.cameraId });
    const frame = createColmapMetricWebGpuSplatFrame({
      image,
      camera,
      width: 120,
      height: 90,
      tile: {
        fullWidth: 800,
        fullHeight: 400,
        originX: 400,
        originY: 160,
      },
    });
    const uniforms = createSplatProjectionUniforms(frame, TEST_SPLAT_SCENE);

    expect(uniforms.focalX).toBeCloseTo(200);
    expect(uniforms.focalY).toBeCloseTo(400);

    const projectFullPixel = (u: number, v: number): [number, number] => {
      const z = 2;
      const point: [number, number, number] = [
        (u - 410) / 200 * z,
        (v - 190) / 400 * z,
        z,
      ];
      return projectWebGpuSplatFramePointToPixel(frame, point);
    };

    expectPixelClose(projectFullPixel(410, 190), [10, 30]);
    expectPixelClose(projectFullPixel(400, 160), [0, 0]);
    expectPixelClose(projectFullPixel(520, 250), [120, 90]);
  });
});
