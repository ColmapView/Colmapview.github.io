import { describe, expect, it } from 'vitest';
import {
  useTrackballModeSync,
  useTrackballProjectionSync,
  useTrackballViewResets,
  useTrackballViewStateSync,
} from './useTrackballCameraLifecycle';

describe('useTrackballCameraLifecycle facade', () => {
  it('keeps the public trackball lifecycle hook exports available', () => {
    expect(useTrackballModeSync).toBeTypeOf('function');
    expect(useTrackballProjectionSync).toBeTypeOf('function');
    expect(useTrackballViewResets).toBeTypeOf('function');
    expect(useTrackballViewStateSync).toBeTypeOf('function');
  });
});
