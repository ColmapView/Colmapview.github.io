import { z } from 'zod';
import type { CameraViewState } from '../store/types';
import { useCameraStore } from '../store/stores/cameraStore';
import { useReconstructionStore } from '../store/reconstructionStore';
import type { FeatureContract } from './catalog';

const coordinate = z.number().min(-1e12).max(1e12);
export const cameraInputs = {
  lookAt: z.strictObject({ x: coordinate, y: coordinate, z: coordinate,
    targetX: coordinate, targetY: coordinate, targetZ: coordinate,
    upX: coordinate.default(0), upY: coordinate.default(1), upZ: coordinate.default(0) }),
  orbit: z.strictObject({ yaw: z.number().min(-Math.PI * 2).max(Math.PI * 2), pitch: z.number().min(-Math.PI * 2).max(Math.PI * 2) }),
  pan: z.strictObject({ right: coordinate, up: coordinate, forward: coordinate.default(0) }),
  zoom: z.strictObject({ factor: z.number().min(0.01).max(100) }),
  preset: z.strictObject({ direction: z.enum(['reset', 'x', 'y', 'z', '-x', '-y', '-z']) }),
  stop: z.strictObject({}),
  image: z.strictObject({ imageId: z.number().int().nonnegative().safe() }),
};
export type CameraOperation = keyof typeof cameraInputs;
export interface CameraController {
  read: () => CameraViewState & { animating: boolean; projection: string; zoom: number };
  execute: (operation: CameraOperation, input: Record<string, number | string>) => void;
}
let controller: CameraController | undefined;
export function registerCameraController(value: CameraController) {
  controller = value;
  return () => { if (controller === value) controller = undefined; };
}
export const readLiveCamera = () => controller?.read() ?? null;
export const cameraAvailable = () => {
  const state = useReconstructionStore.getState();
  return !!controller && !state.loading && !state.urlLoading && !state.urlLoadActive;
};
const descriptions: Record<CameraOperation, string> = {
  lookAt: 'Set position and look-at target in displayed scene/world units with an up vector. Position and target must differ; up must not be parallel to the viewing direction. Applies instantly.',
  orbit: 'Rotate around the current pivot in orbit mode (or turn in place in fly mode), using the same rotation logic and horizon-lock constraints as pointer controls. yaw and pitch are radians.',
  pan: 'Translate position and pivot along camera-local right, up and forward axes, in scene units.',
  zoom: 'Multiply apparent viewing distance by factor: less than 1 zooms in, greater than 1 zooms out. Perspective changes pivot distance; orthographic changes zoom.',
  preset: 'Fit the scene using the same reset or axis-view math as the human controls. reset is the default fitted view; x/y/z and negative variants look from those axes.',
  stop: 'Stop auto-orbit, active fly-to animation, inertial movement and pending camera navigation. Does not disable subsequent human input.',
  image: 'Move instantly to the dataset image camera using the same pose calculation as human fly-to, including display transforms and spherical-camera handling. Discover IDs with colmap_query_images.',
};
const defaults: Record<CameraOperation, Record<string, unknown>> = {
  lookAt: { x: 0, y: 0, z: 5, targetX: 0, targetY: 0, targetZ: 0, upX: 0, upY: 1, upZ: 0 },
  orbit: { yaw: 0.2, pitch: 0 }, pan: { right: 0, up: 0, forward: 0 }, zoom: { factor: 0.8 },
  preset: { direction: 'reset' }, stop: {}, image: { imageId: 0 },
};
export const cameraFeatures: FeatureContract[] = (Object.keys(cameraInputs) as CameraOperation[]).map(operation => ({
  id: `camera.${operation}`, title: `Camera ${operation}`, group: 'navigation',
  description: `${descriptions[operation]} Camera commands stop existing motion, apply synchronously, and clear command undo history; the result is applied pose, not a rendered-frame confirmation.`,
  input: cameraInputs[operation], defaultInput: defaults[operation], undoable: false,
  available: operation === 'stop' ? () => !!controller : cameraAvailable,
  read: () => useCameraStore.getState().currentViewState,
  apply: raw => {
    if (!controller) throw new Error('The 3D camera is not mounted.');
    const parsed = cameraInputs[operation].parse(raw);
    controller.execute(operation, parsed);
    useCameraStore.getState().setCurrentViewState(controller.read());
  },
}));
