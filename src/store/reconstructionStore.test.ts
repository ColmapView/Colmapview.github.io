import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from './reconstructionStore';
import { usePointCloudStore } from './stores/pointCloudStore';
import { useTransformStore } from './stores/transformStore';
import { useUIStore } from './stores/uiStore';

describe('reconstruction store URL load lifecycle', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('serializes URL loads independently from the visible loading indicator', () => {
    useReconstructionStore.setState({ urlLoading: true });

    expect(useReconstructionStore.getState().tryStartUrlLoad()).toBe(true);
    expect(useReconstructionStore.getState().tryStartUrlLoad()).toBe(false);

    useReconstructionStore.getState().finishUrlLoad();

    expect(useReconstructionStore.getState().tryStartUrlLoad()).toBe(true);
  });

  it('clears active URL load state when the reconstruction is cleared', () => {
    expect(useReconstructionStore.getState().tryStartUrlLoad()).toBe(true);

    useReconstructionStore.getState().clear();

    expect(useReconstructionStore.getState().tryStartUrlLoad()).toBe(true);
  });

  it('uses a black default background when a splat file starts loading', () => {
    const splatFile = new File(['splat'], 'scene.spz');

    useUIStore.setState({ backgroundColor: '#ffffff' });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      splatFile,
      splatFiles: [splatFile],
      imageFiles: new Map(),
      hasMasks: false,
    });

    expect(useUIStore.getState().backgroundColor).toBe('#000000');
  });

  it('preserves custom background colors when a splat file starts loading', () => {
    const splatFile = new File(['splat'], 'scene.spz');

    useUIStore.setState({ backgroundColor: '#123456' });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      splatFile,
      splatFiles: [splatFile],
      imageFiles: new Map(),
      hasMasks: false,
    });

    expect(useUIStore.getState().backgroundColor).toBe('#123456');
  });

  it('switches point cloud display to splats plus points when loaded files include a splat', () => {
    const splatFile = new File(['splat'], 'scene.spz');

    usePointCloudStore.setState({
      colorMode: 'rgb',
      showSplats: false,
      pointSize: 7,
      pointOpacity: 0.9,
    });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      splatFile,
      splatFiles: [splatFile],
      imageFiles: new Map(),
      hasMasks: false,
    });

    expect(usePointCloudStore.getState().colorMode).toBe('splatPoints');
    expect(usePointCloudStore.getState().showSplats).toBe(true);
    expect(usePointCloudStore.getState().pointSize).toBe(1);
    expect(usePointCloudStore.getState().pointOpacity).toBe(0.2);
  });

  it('preserves point size and opacity when only the active splat file changes', () => {
    const camerasFile = new File([''], 'cameras.bin');
    const imagesFile = new File([''], 'images.bin');
    const points3DFile = new File([''], 'points3D.bin');
    const firstSplatFile = new File(['splat-a'], 'scene-a.spz');
    const secondSplatFile = new File(['splat-b'], 'scene-b.spz');
    const imageFiles = new Map<string, File>();

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      splatFile: firstSplatFile,
      splatFiles: [firstSplatFile],
      imageFiles,
      hasMasks: false,
    });
    usePointCloudStore.setState({ pointSize: 5, pointOpacity: 0.65 });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      splatFile: secondSplatFile,
      splatFiles: [firstSplatFile, secondSplatFile],
      imageFiles,
      hasMasks: false,
    });

    expect(usePointCloudStore.getState().colorMode).toBe('splatPoints');
    expect(usePointCloudStore.getState().pointSize).toBe(5);
    expect(usePointCloudStore.getState().pointOpacity).toBe(0.65);
  });

  it('applies splat point defaults when a splat is added to an already loaded dataset', () => {
    const camerasFile = new File([''], 'cameras.bin');
    const imagesFile = new File([''], 'images.bin');
    const points3DFile = new File([''], 'points3D.bin');
    const imageFiles = new Map<string, File>();
    const splatFile = new File(['splat'], 'scene.spz');

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      imageFiles,
      hasMasks: false,
    });
    usePointCloudStore.setState({ pointSize: 5, pointOpacity: 0.65 });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      splatFile,
      splatFiles: [splatFile],
      imageFiles,
      hasMasks: false,
    });

    expect(usePointCloudStore.getState().colorMode).toBe('splatPoints');
    expect(usePointCloudStore.getState().pointSize).toBe(1);
    expect(usePointCloudStore.getState().pointOpacity).toBe(0.2);
  });

  it('resets accumulated splat transform when a new dataset is loaded', () => {
    useTransformStore.getState().setSplatTransform({
      scale: 2,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      translationX: 1,
      translationY: 0,
      translationZ: 0,
    });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      splatFile: new File(['splat'], 'scene.spz'),
      imageFiles: new Map(),
      hasMasks: false,
    });

    expect(useTransformStore.getState().splatTransform).toMatchObject({
      scale: 1,
      translationX: 0,
    });
  });

  it('preserves accumulated splat transform when only the active splat file changes', () => {
    const camerasFile = new File([''], 'cameras.bin');
    const imagesFile = new File([''], 'images.bin');
    const points3DFile = new File([''], 'points3D.bin');
    const firstSplatFile = new File(['splat-a'], 'scene-a.spz');
    const secondSplatFile = new File(['splat-b'], 'scene-b.spz');
    const imageFiles = new Map<string, File>();

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      splatFile: firstSplatFile,
      splatFiles: [firstSplatFile],
      imageFiles,
      hasMasks: false,
    });
    useTransformStore.getState().setSplatTransform({
      scale: 2,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      translationX: 1,
      translationY: 0,
      translationZ: 0,
    });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      splatFile: secondSplatFile,
      splatFiles: [firstSplatFile, secondSplatFile],
      imageFiles,
      hasMasks: false,
    });

    expect(useTransformStore.getState().splatTransform).toMatchObject({
      scale: 2,
      translationX: 1,
    });
  });
});
