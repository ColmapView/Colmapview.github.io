import { describe, expect, it } from 'vitest';
import { getSceneFrameloop, hasTrackballRenderActivity, needsContinuousSelectionFrames, type SceneContinuousActivity, type TrackballRenderActivity } from './sceneRenderActivityPolicy';

const settled: SceneContinuousActivity = {
  splat: false, recording: false, autoRotate: false, animatedSelection: false,
  animatedMatches: false, animatedRigs: false, floorPulse: false,
};
const stoppedControls: TrackballRenderActivity = {
  enabled: true, interacting: false, animating: false, keys: new Set(),
  angularVelocity: { x: 0, y: 0 }, minAngularVelocity: 0.001,
  flyVelocityLength: 0, orbitDistanceDelta: 0, autoRotate: false,
};

describe('scene render activity', () => {
  it('keeps configured image animations continuous while static and point-only scenes remain demand-eligible', () => {
    for (const mode of ['rainbow', 'blink'] as const) {
      expect(needsContinuousSelectionFrames(true, mode)).toBe(true);
      expect(needsContinuousSelectionFrames(false, mode)).toBe(false);
    }
    expect(needsContinuousSelectionFrames(true, 'static')).toBe(false);
    expect(needsContinuousSelectionFrames(false, 'static')).toBe(false);
  });

  it('uses demand only after every audited continuous activity is absent', () => {
    expect(getSceneFrameloop(settled)).toBe('demand');
    for (const key of Object.keys(settled)) {
      expect(getSceneFrameloop({ ...settled, [key]: true })).toBe('always');
    }
  });

  it('continues every kind of control motion and stops below its actual mutation thresholds', () => {
    expect(hasTrackballRenderActivity(stoppedControls)).toBe(false);
    for (const activity of [
      { interacting: true }, { animating: true }, { autoRotate: true },
      { angularVelocity: { x: 0, y: -0.002 } }, { flyVelocityLength: 0.001 },
      { orbitDistanceDelta: 0.001 },
      ...['w', 's', 'a', 'd', 'q', 'e', ' '].map((key) => ({ keys: new Set([key]) })),
    ]) {
      expect(hasTrackballRenderActivity({ ...stoppedControls, ...activity })).toBe(true);
      expect(hasTrackballRenderActivity({ ...stoppedControls, ...activity, enabled: false })).toBe(false);
    }
    expect(hasTrackballRenderActivity({ ...stoppedControls, keys: new Set(['shift']) })).toBe(false);
    expect(hasTrackballRenderActivity({ ...stoppedControls, angularVelocity: { x: 0.001, y: -0.001 },
      flyVelocityLength: 0.0001, orbitDistanceDelta: 0.0001 })).toBe(false);
  });
});
