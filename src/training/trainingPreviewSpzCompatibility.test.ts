import { loadSPZFromBuffer } from 'gs-toolbox';
import { describe, expect, it } from 'vitest';

// Produced by splatxx.training.preview.spz from two WXYZ Gaussian rows.
const BACKEND_SPZ_FIXTURE = 'H4sIAAAAAAAE//NzDw5gZmBgYAJiBgFGBgYHRoaGvwwNQB4LAwOQ/7cBChaAAVD8wH+gMADCvyLaOAAAAA==';

describe('splatxx live-preview SPZ compatibility', () => {
  it('decodes all rows through the production browser codec', () => {
    const bytes = Uint8Array.from(atob(BACKEND_SPZ_FIXTURE), value => value.charCodeAt(0));
    const cloud = loadSPZFromBuffer(bytes.buffer);

    expect(cloud.count).toBe(2);
    expect(cloud.shDegree).toBe(0);
    expect(Array.from(cloud.positions)).toEqual([1.25, -2.5, 0.5, 4, 1, -3]);
    expect(Array.from(cloud.scales)).toEqual(expect.arrayContaining([
      expect.closeTo(1, 5), expect.closeTo(1, 5), expect.closeTo(1, 5),
    ]));
    expect(Array.from(cloud.rotations.slice(0, 4))).toEqual(expect.arrayContaining([
      expect.closeTo(1, 5), expect.closeTo(0, 5), expect.closeTo(0, 5), expect.closeTo(0, 5),
    ]));
  });
});
