import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from './reconstructionStore';
import { usePointCloudStore } from './stores/pointCloudStore';
import { useUIStore } from './stores/uiStore';

describe('reconstruction store URL load lifecycle', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
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

  it('switches point cloud display to splats when loaded files include a splat', () => {
    const splatFile = new File(['splat'], 'scene.spz');

    usePointCloudStore.setState({ colorMode: 'rgb', showSplats: false });

    useReconstructionStore.getState().setLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'),
      imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'),
      splatFile,
      splatFiles: [splatFile],
      imageFiles: new Map(),
      hasMasks: false,
    });

    expect(usePointCloudStore.getState().colorMode).toBe('splats');
    expect(usePointCloudStore.getState().showSplats).toBe(true);
  });
});
