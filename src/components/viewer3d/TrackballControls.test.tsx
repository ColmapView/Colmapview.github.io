import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { create } from 'zustand';
import { applySavedViewerState } from '../../hooks/useUrlState';
import {
  useCameraStore, usePointCloudStore, usePointPickingStore, useReconstructionStore, useTransformStore, useUIStore,
} from '../../store';
import type { CameraViewState } from '../../store/types';
import { buildLoadedFiles, buildReconstruction } from '../../test/builders';
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

function expectSavedView() {
  const { camera } = scene.getState();
  expect(camera.position.distanceTo(savedPosition)).toBeCloseTo(0, 6);
  expect(camera.quaternion.angleTo(savedQuaternion)).toBeCloseTo(0, 6);
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
});
