import { describe, expect, it } from 'vitest';
import { createIdentityEuler } from '../utils/sim3dTransforms';
import {
  buildShareConfigFromStoreStates,
  extractShareableFields,
  getShareTransform,
  type ShareConfigStoreStates,
} from './urlStateShareConfigPolicy';

const identityTransform = createIdentityEuler();

describe('urlStateShareConfigPolicy', () => {
  it('extracts only allowed serializable store fields', () => {
    const state = {
      pointSize: 3,
      hidden: 'ignore',
      maxTrackError: Infinity,
      setPointSize: () => undefined,
    };

    expect(extractShareableFields(state, new Set(['pointSize', 'maxTrackError', 'setPointSize']))).toEqual({
      pointSize: 3,
    });
  });

  it('builds share config from allowed store fields and transient selection', () => {
    const states: ShareConfigStoreStates = {
      pointCloud: {
        pointSize: 2,
        colorMode: 'trackLength',
        setPointSize: () => undefined,
      },
      ui: {
        backgroundColor: '#101010',
        debugPanelOpen: true,
      },
      camera: {
        cameraMode: 'orbit',
        selectedImageId: 42,
        navigationHistory: ['runtime-only'],
      },
      rig: {
        showRigConnections: true,
      },
      transform: identityTransform,
    };

    expect(buildShareConfigFromStoreStates(states, {
      pointCloud: new Set(['pointSize', 'colorMode', 'setPointSize']),
      ui: new Set(['backgroundColor']),
      camera: new Set(['cameraMode']),
      rig: new Set(['showRigConnections']),
    })).toEqual({
      pointCloud: {
        pointSize: 2,
        colorMode: 'trackLength',
      },
      ui: {
        backgroundColor: '#101010',
      },
      camera: {
        cameraMode: 'orbit',
        selectedImageId: 42,
      },
      rig: {
        showRigConnections: true,
      },
    });
  });

  it('omits empty sections and includes only non-identity transforms', () => {
    const states: ShareConfigStoreStates = {
      pointCloud: {},
      ui: {},
      camera: { selectedImageId: null },
      rig: {},
      transform: {
        ...identityTransform,
        translationZ: 3,
      },
    };

    expect(buildShareConfigFromStoreStates(states, {})).toEqual({
      transform: states.transform,
    });
  });

  it('shares the accumulated splat transform when the active transform has been applied', () => {
    const states: ShareConfigStoreStates = {
      pointCloud: {},
      ui: {},
      camera: { selectedImageId: null },
      rig: {},
      transform: identityTransform,
      splatTransform: {
        ...identityTransform,
        translationX: 2,
      },
    };

    expect(buildShareConfigFromStoreStates(states, {})).toEqual({
      transform: states.splatTransform,
    });
  });

  it('shares the active transform composed after the accumulated splat transform', () => {
    const activeTransform = {
      ...identityTransform,
      scale: 2,
      translationX: 1,
    };
    const splatTransform = {
      ...identityTransform,
      translationY: 3,
    };

    expect(getShareTransform(activeTransform, splatTransform)).toMatchObject({
      scale: 2,
      translationX: 1,
      translationY: 6,
    });
  });
});
