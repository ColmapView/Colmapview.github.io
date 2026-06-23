import { describe, it, expect } from 'vitest';
import { FULLFRAME_VALID_DISCARD_THRESHOLD, fullFrameFragmentShader } from './undistortion';

describe('full-frame undistortion validity discard (F12)', () => {
  it('uses a near-1.0 threshold so boundary-straddling triangles are dropped, not stretched', () => {
    expect(FULLFRAME_VALID_DISCARD_THRESHOLD).toBeGreaterThanOrEqual(0.99);
    expect(FULLFRAME_VALID_DISCARD_THRESHOLD).toBeLessThan(1);
  });

  it('compiles the threshold into the fragment shader as a GLSL float literal', () => {
    expect(fullFrameFragmentShader).toContain(`vValid < ${FULLFRAME_VALID_DISCARD_THRESHOLD}`);
    // Must read as a float (e.g. 0.999), not an int literal that GLSL would reject.
    expect(fullFrameFragmentShader).toMatch(/vValid < 0\.\d+/);
    // Regression: the old loose cut (which let mixed triangles render stretched) is gone.
    expect(fullFrameFragmentShader).not.toContain('vValid < 0.5');
  });
});
