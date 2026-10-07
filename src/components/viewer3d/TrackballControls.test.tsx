import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { create } from 'zustand';
import { applySavedViewerState } from '../../hooks/useUrlState';
import {
  useCameraStore, usePointCloudStore, usePointPickingStore, useReconstructionStore, useTransformStore, useUIStore,
} from '../../store';
import type { CameraViewState } from '../../store/types';
import { buildCamera, buildImage, buildLoadedFiles, buildReconstruction } from '../../test/builders';
import { CameraModelId, type LoadedFiles } from '../../types/colmap';
import type { PublishedViewerState } from '../../utils/publishedViewerState';
import { TrackballControls } from './TrackballControls';

const fiber = vi.hoisted(() => ({
  useThree: vi.fn(),
  frame: (_state: { invalidate: () => void }) => {},
}));
vi.mock('@react-three/fiber', () => ({
  useThree: fiber.useThree,
  useFrame: (callback: typeof fiber.frame) => { fiber.frame = callback; },
}));

interface SceneState {
  camera: THREE.Camera;
  gl: { domElement: HTMLCanvasElement };
  size: { width: number; height: number };
  controls?: unknown;
  set: (partial: Partial<SceneState>) => void;
}

function createScene() {
  return create<SceneState>()(set => ({
    camera: new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 1000),
    gl: { domElement: document.createElement('canvas') },
    size: { width: 800, height: 600 },
    set: partial => set(partial),
  }));
}

// Level (no roll), so horizon lock keeps the saved view as it is.
const savedQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 0.6, 0, 'YXZ'));
const savedTarget = new THREE.Vector3(1, 0.5, -2);
const savedPosition = savedTarget.clone().add(new THREE.Vector3(0, 0, 6).applyQuaternion(savedQuaternion));
const savedView: CameraViewState = {
  position: savedPosition.toArray() as [number, number, number],
  quaternion: savedQuaternion.toArray() as [number, number, number, number],
  target: savedTarget.toArray() as [number, number, number],
  distance: 6,
};

const PANORAMA_ID = 7;
// Identity rotation puts the capture center at -tvec, away from the saved view.
const panoramaCenter = new THREE.Vector3(4, 0, 0);
const panoramaScene = () => buildReconstruction({
  cameras: [buildCamera({ cameraId: 3, modelId: CameraModelId.EQUIRECTANGULAR, width: 3840, height: 1920, params: [3840, 1920] })],
  images: [buildImage({ imageId: PANORAMA_ID, cameraId: 3, tvec: [-4, 0, 0] })],
});

const OTHER_PANORAMA_ID = 8;
const otherPanoramaCenter = new THREE.Vector3(-4, 0, 0);
const twoPanoramaScene = () => buildReconstruction({
  cameras: [buildCamera({ cameraId: 3, modelId: CameraModelId.EQUIRECTANGULAR, width: 3840, height: 1920, params: [3840, 1920] })],
  images: [buildImage({ imageId: PANORAMA_ID, cameraId: 3, tvec: [-4, 0, 0] }),
    buildImage({ imageId: OTHER_PANORAMA_ID, cameraId: 3, name: 'other.jpg', tvec: [4, 0, 0] })],
});
const remoteSplat = { id: 'splats/scene.spz', path: 'splats/scene.spz', url: 'https://example.com/splats/scene.spz' };

function Viewer() {
  // As in Scene3D, resetView reaches the controls as a new reset trigger.
  const resetTrigger = useUIStore(state => state.viewResetTrigger);
  return <TrackballControls target={[0, 0, 0]} radius={2} resetTrigger={resetTrigger} />;
}

let scene = createScene();
let now = 1000;

beforeEach(() => {
  // Only explicit frames move the camera; the view-state sync interval never fires.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  useCameraStore.setState(useCameraStore.getInitialState(), true);
  usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
  usePointPickingStore.setState(usePointPickingStore.getInitialState(), true);
  useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  useTransformStore.setState(useTransformStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  scene = createScene();
  fiber.useThree.mockImplementation(scene);
});

afterEach(() => {
  cleanup();
  useReconstructionStore.getState().clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Runs frames past the end of any fly-to animation. */
function finishFlights() {
  for (let frame = 0; frame < 3; frame++) {
    now += 1000;
    act(() => fiber.frame({ invalidate: () => undefined }));
  }
}

function mountWithSelectedPanorama(undistortionEnabled: boolean) {
  useReconstructionStore.setState({ reconstruction: panoramaScene() });
  useCameraStore.setState({ selectedImageId: PANORAMA_ID, undistortionEnabled });
  render(<Viewer />);
  finishFlights();
}

function expectSavedView() {
  const { camera } = scene.getState();
  expect(camera.position.distanceTo(savedPosition)).toBeCloseTo(0, 6);
  expect(camera.quaternion.angleTo(savedQuaternion)).toBeCloseTo(0, 6);
}

function mountOnFirstOfTwoPanoramas(loadedFiles: LoadedFiles) {
  useReconstructionStore.setState({ reconstruction: twoPanoramaScene() });
  useReconstructionStore.getState().setLoadedFiles(loadedFiles);
  useCameraStore.setState({ selectedImageId: PANORAMA_ID, undistortionEnabled: false });
  render(<Viewer />);
  finishFlights();
}

/** Settings without a view that turn U on over the other panorama and restore this splat choice. */
function savedOtherPanorama(activeSourceId: string): PublishedViewerState {
  return { version: 1, viewerVersion: 'test', viewState: null,
    config: { splat: { activeSourceId }, camera: { undistortionEnabled: true, selectedImageId: OTHER_PANORAMA_ID } } };
}

function expectInsideOtherPanorama() {
  expect(useCameraStore.getState()).toMatchObject({ undistortionEnabled: true, selectedImageId: OTHER_PANORAMA_ID });
  expect(scene.getState().camera.position.distanceTo(otherPanoramaCenter)).toBeLessThan(0.01);
}

describe('TrackballControls restoring a saved view', () => {
  it('ends at the saved view under the saved navigation and stays there when a slow splat download lands', async () => {
    useReconstructionStore.setState({ reconstruction: buildReconstruction() });
    useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({ splatFileSources: [
      { id: 'splats/scene.spz', path: 'splats/scene.spz', url: 'https://example.com/splats/scene.spz' }] }));
    let respond!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));
    render(<Viewer />);
    finishFlights();
    // Horizon lock levels the flight against the saved world up (+Y here, -Y for the visitor's COLMAP axes).
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: savedView, config: {
      splat: { activeSourceId: 'splats/scene.spz' },
      camera: { horizonLock: 'on', cameraProjection: 'orthographic' }, ui: { axesCoordinateSystem: 'opengl' } } };

    let restoration!: Promise<void>;
    await act(async () => { restoration = applySavedViewerState(saved, null); });
    finishFlights();
    expect(scene.getState().camera).toBeInstanceOf(THREE.OrthographicCamera);
    expectSavedView();

    await act(async () => {
      respond(new Response(new Blob(['splat']), { status: 200 }));
      await restoration;
    });
    finishFlights();
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeDefined();
    expectSavedView();
  });

  it('ends at the saved view in the saved camera mode and field of view, before and after a slow splat download', async () => {
    useReconstructionStore.setState({ reconstruction: buildReconstruction() });
    useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({ splatFileSources: [remoteSplat] }));
    let respond!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));
    render(<Viewer />);
    finishFlights();
    // The visitor orbits with the default 60° field of view.
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: savedView, config: {
      splat: { activeSourceId: remoteSplat.id }, camera: { cameraMode: 'fly', cameraFov: 35 } } };
    const expectSavedCamera = () => {
      expect(useCameraStore.getState().cameraMode).toBe('fly');
      expect((scene.getState().camera as THREE.PerspectiveCamera).fov).toBe(35);
      expectSavedView();
    };

    let restoration!: Promise<void>;
    await act(async () => { restoration = applySavedViewerState(saved, null); });
    finishFlights();
    expectSavedCamera();

    await act(async () => {
      respond(new Response(new Blob(['splat']), { status: 200 }));
      await restoration;
    });
    finishFlights();
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeDefined();
    expectSavedCamera();
  });

  it('ends at the saved view when a restore without a download turns undistortion on over a selected panorama', async () => {
    mountWithSelectedPanorama(false);
    // The dataset lists no splat, so nothing is downloaded between navigation and the rest of the settings.
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: savedView,
      config: { camera: { undistortionEnabled: true, selectedImageId: PANORAMA_ID } } };

    await act(async () => { await applySavedViewerState(saved, null); });
    finishFlights();

    expect(useCameraStore.getState()).toMatchObject({ undistortionEnabled: true, selectedImageId: PANORAMA_ID });
    expectSavedView();
  });

  it('ends at the saved view when Reload turns undistortion back off over a selected panorama', async () => {
    mountWithSelectedPanorama(true);
    // Reload re-applies the saved settings without their splat choice, in the same synchronous run that
    // re-commits the scene and resets the view.
    const retained: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: savedView,
      config: { camera: { undistortionEnabled: false } } };

    await act(async () => {
      useReconstructionStore.getState().setReconstruction(panoramaScene());
      useUIStore.getState().resetView();
      await applySavedViewerState(retained, null);
    });
    finishFlights();

    expect(useCameraStore.getState()).toMatchObject({ undistortionEnabled: false, selectedImageId: PANORAMA_ID });
    expectSavedView();
  });

  it('still flies into the selected panorama when the user turns undistortion on', () => {
    mountWithSelectedPanorama(false);

    act(() => useCameraStore.getState().setUndistortionEnabled(true));
    finishFlights();

    // U on steps inside the photosphere to the capture center.
    expect(scene.getState().camera.position.distanceTo(panoramaCenter)).toBeLessThan(0.01);
  });

  it('still flies into the selected panorama when a restore without a saved view turns undistortion on', async () => {
    mountWithSelectedPanorama(false);
    // No view to keep, so the restored toggle re-flies like the user's own.
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null,
      config: { camera: { undistortionEnabled: true, selectedImageId: PANORAMA_ID } } };

    await act(async () => { await applySavedViewerState(saved, null); });
    finishFlights();

    expect(useCameraStore.getState().undistortionEnabled).toBe(true);
    expect(scene.getState().camera.position.distanceTo(panoramaCenter)).toBeLessThan(0.01);
  });

  it('flies into the selected panorama when the user turns undistortion on right after a restore', async () => {
    mountWithSelectedPanorama(true);
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: savedView,
      config: { camera: { undistortionEnabled: false } } };
    await act(async () => { await applySavedViewerState(saved, null); });

    // Only the restore's own commit keeps its view: the next toggle re-flies, even before that view is reached.
    act(() => useCameraStore.getState().setUndistortionEnabled(true));
    finishFlights();

    expect(scene.getState().camera.position.distanceTo(panoramaCenter)).toBeLessThan(0.01);
  });

  it.each([
    ['None', '', () => buildLoadedFiles({ splatFileSources: [remoteSplat] })],
    ['a loaded local splat', 'splats/scene.spz', () => {
      const splat = new File(['splat'], 'scene.spz');
      return buildLoadedFiles({ splatFile: splat,
        splatFileSources: [{ id: 'splats/scene.spz', path: 'splats/scene.spz', file: splat }] });
    }],
  ])('flies into the newly selected panorama when a restore choosing %s turns undistortion on', async (_choice, sourceId, files) => {
    mountOnFirstOfTwoPanoramas(files());

    let restoration!: Promise<void>;
    // As in the app, what the restore sets before it awaits the splat choice renders before the rest lands.
    act(() => { restoration = applySavedViewerState(savedOtherPanorama(sourceId), null); });
    await act(async () => { await restoration; });
    finishFlights();

    expectInsideOtherPanorama();
  });

  it('flies into the newly selected panorama when a restore that downloads its splat turns undistortion on', async () => {
    mountOnFirstOfTwoPanoramas(buildLoadedFiles({ splatFileSources: [remoteSplat] }));
    let respond!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));

    let restoration!: Promise<void>;
    await act(async () => { restoration = applySavedViewerState(savedOtherPanorama('splats/scene.spz'), null); });
    finishFlights();
    expectInsideOtherPanorama();

    await act(async () => {
      respond(new Response(new Blob(['splat']), { status: 200 }));
      await restoration;
    });
    finishFlights();
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeDefined();
    expectInsideOtherPanorama();
  });
});
