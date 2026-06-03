export const FPS_UPDATE_INTERVAL_MS = 500;

export interface FpsSampleState {
  frames: number;
  lastTime: number;
}

export interface FpsSampleResult {
  nextState: FpsSampleState;
  fps: number | null;
}

export const INITIAL_FPS_SAMPLE_STATE: FpsSampleState = {
  frames: 0,
  lastTime: 0,
};

export function getNextFpsSample(
  state: FpsSampleState,
  now: number,
  updateIntervalMs = FPS_UPDATE_INTERVAL_MS
): FpsSampleResult {
  if (state.lastTime === 0) {
    return {
      nextState: {
        frames: 0,
        lastTime: now,
      },
      fps: null,
    };
  }

  const frames = state.frames + 1;
  const elapsed = now - state.lastTime;

  if (elapsed >= updateIntervalMs) {
    return {
      nextState: {
        frames: 0,
        lastTime: now,
      },
      fps: Math.round((frames / elapsed) * 1000),
    };
  }

  return {
    nextState: {
      frames,
      lastTime: state.lastTime,
    },
    fps: null,
  };
}
