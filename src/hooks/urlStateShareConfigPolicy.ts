import type { Sim3dEuler } from '../types/sim3d';
import type { ShareConfig } from '../utils/shareDataCodec';
import { isIdentityEuler } from '../utils/sim3dTransforms';

export interface ShareableFieldSets {
  pointCloud?: ReadonlySet<string>;
  ui?: ReadonlySet<string>;
  camera?: ReadonlySet<string>;
  rig?: ReadonlySet<string>;
}

export interface CameraShareState {
  selectedImageId?: number | null;
}

export interface ShareConfigStoreStates {
  pointCloud: object;
  ui: object;
  camera: object & CameraShareState;
  rig: object;
  transform: Sim3dEuler;
}

export function extractShareableFields(
  state: object,
  allowedFields: ReadonlySet<string> | undefined
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!allowedFields) return result;

  for (const key of Object.keys(state)) {
    if (!allowedFields.has(key)) continue;

    const value: unknown = Reflect.get(state, key);
    if (typeof value === 'function') continue;
    if (value === Infinity) continue;

    result[key] = value;
  }

  return result;
}

function addConfigSection(
  config: ShareConfig,
  key: keyof Pick<ShareConfig, 'pointCloud' | 'ui' | 'camera' | 'rig'>,
  value: Record<string, unknown>
): void {
  if (Object.keys(value).length > 0) {
    config[key] = value;
  }
}

export function buildShareConfigFromStoreStates(
  states: ShareConfigStoreStates,
  shareableFields: ShareableFieldSets
): ShareConfig {
  const config: ShareConfig = {};

  addConfigSection(
    config,
    'pointCloud',
    extractShareableFields(states.pointCloud, shareableFields.pointCloud)
  );

  addConfigSection(
    config,
    'ui',
    extractShareableFields(states.ui, shareableFields.ui)
  );

  const cameraState = extractShareableFields(states.camera, shareableFields.camera);
  if (states.camera.selectedImageId !== null && states.camera.selectedImageId !== undefined) {
    cameraState.selectedImageId = states.camera.selectedImageId;
  }
  addConfigSection(config, 'camera', cameraState);

  addConfigSection(
    config,
    'rig',
    extractShareableFields(states.rig, shareableFields.rig)
  );

  if (!isIdentityEuler(states.transform)) {
    config.transform = states.transform;
  }

  return config;
}
