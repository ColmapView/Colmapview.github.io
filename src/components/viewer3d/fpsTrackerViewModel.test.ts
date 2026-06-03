import { describe, expect, it } from 'vitest';
import {
  FPS_UPDATE_INTERVAL_MS,
  getNextFpsSample,
  INITIAL_FPS_SAMPLE_STATE,
} from './fpsTrackerViewModel';

describe('FPS tracker view model', () => {
  it('initializes the first sample timestamp without reporting FPS', () => {
    expect(getNextFpsSample(INITIAL_FPS_SAMPLE_STATE, 100)).toEqual({
      nextState: {
        frames: 0,
        lastTime: 100,
      },
      fps: null,
    });
  });

  it('accumulates frames until the update interval has elapsed', () => {
    expect(getNextFpsSample({ frames: 0, lastTime: 100 }, 200)).toEqual({
      nextState: {
        frames: 1,
        lastTime: 100,
      },
      fps: null,
    });

    expect(getNextFpsSample({ frames: 1, lastTime: 100 }, 599)).toEqual({
      nextState: {
        frames: 2,
        lastTime: 100,
      },
      fps: null,
    });
  });

  it('reports rounded FPS and resets frame count after the update interval', () => {
    expect(getNextFpsSample({ frames: 29, lastTime: 100 }, 600)).toEqual({
      nextState: {
        frames: 0,
        lastTime: 600,
      },
      fps: 60,
    });
  });

  it('supports custom sampling intervals for deterministic tests', () => {
    expect(getNextFpsSample({ frames: 4, lastTime: 1_000 }, 1_250, 250)).toEqual({
      nextState: {
        frames: 0,
        lastTime: 1_250,
      },
      fps: 20,
    });
  });

  it('exports the default update interval used by the component', () => {
    expect(FPS_UPDATE_INTERVAL_MS).toBe(500);
  });
});
