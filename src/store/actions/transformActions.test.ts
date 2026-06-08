import { beforeEach, describe, expect, it } from 'vitest';
import { buildFile, buildLoadedFiles, buildPoint3D, buildReconstruction } from '../../test/builders';
import { createSim3dFromEuler, transformPoint } from '../../utils/sim3dTransforms';
import { useFloorPlaneStore } from '../stores/floorPlaneStore';
import { useReconstructionStore } from '../reconstructionStore';
import { useTransformStore } from '../stores/transformStore';
import { applyTransformToData } from './transformActions';

const activeTransform = {
  scale: 2,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  translationX: 3,
  translationY: 0,
  translationZ: 0,
};

describe('transform actions', () => {
  beforeEach(() => {
    useFloorPlaneStore.setState(useFloorPlaneStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
  });

  it('persists the active transform as a splat model transform when applying to loaded data', () => {
    const splatFile = buildFile('scene.spz', 'splat');
    const point = buildPoint3D({ xyz: [1, 2, 3] });
    const reconstruction = buildReconstruction({ points3D: [point] });

    useReconstructionStore.setState({ reconstruction });
    useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({ splatFile }));
    useTransformStore.getState().setTransform(activeTransform);

    expect(applyTransformToData()).toBe(true);

    const transformState = useTransformStore.getState();
    expect(transformState.transform).toMatchObject({
      scale: 1,
      translationX: 0,
      translationY: 0,
      translationZ: 0,
    });
    expect(transformState.splatTransform.scale).toBeCloseTo(activeTransform.scale);
    expect(transformState.splatTransform.rotationX).toBeCloseTo(activeTransform.rotationX);
    expect(transformState.splatTransform.rotationY).toBeCloseTo(activeTransform.rotationY);
    expect(transformState.splatTransform.rotationZ).toBeCloseTo(activeTransform.rotationZ);
    expect(transformState.splatTransform.translationX).toBeCloseTo(activeTransform.translationX);
    expect(transformState.splatTransform.translationY).toBeCloseTo(activeTransform.translationY);
    expect(transformState.splatTransform.translationZ).toBeCloseTo(activeTransform.translationZ);
    expect(
      useReconstructionStore.getState().reconstruction?.points3D?.get(point.point3DId)?.xyz
    ).toEqual(transformPoint(createSim3dFromEuler(activeTransform), point.xyz));
  });

  it('composes applied transforms after an existing splat model transform', () => {
    const splatFile = buildFile('scene.spz', 'splat');
    const reconstruction = buildReconstruction();
    const previousSplatTransform = {
      scale: 1,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      translationX: 0,
      translationY: 2,
      translationZ: 0,
    };

    useReconstructionStore.setState({ reconstruction });
    useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({ splatFile }));
    useTransformStore.getState().setSplatTransform(previousSplatTransform);
    useTransformStore.getState().setTransform(activeTransform);

    expect(applyTransformToData()).toBe(true);

    expect(
      transformPoint(createSim3dFromEuler(useTransformStore.getState().splatTransform), [0, 0, 0])
    ).toEqual([3, 4, 0]);
  });
});
