import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A wiring contract, pinned at the source level like Scene3D.noticePlacement: mounting Scene3D costs far
 * more than the two props it protects, both optional on the layer, and the chromium e2e project skips
 * the WebGPU specs. WebGpuSplatCanvasLayer.test.tsx tests the behaviour they give.
 */
describe('Scene3D WebGPU splat loading ownership', () => {
  it('hands the WebGPU splat layer the dataset load and tile download checks', () => {
    // Without them an older splat finishing or failing its decode takes the overlay, progress and Cancel
    // from a Reload or a tile download in progress.
    const source = readFileSync(resolve(__dirname, 'Scene3D.tsx'), 'utf8');

    const open = source.indexOf('<WebGpuSplatCanvasLayer');
    const close = source.indexOf('/>', open);
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
    const element = source.slice(open, close);
    expect(element).toContain('isDatasetLoadPendingForSplat={isDatasetLoadPendingForSplat}');
    expect(element).toContain('isSplatDownloadPending={isSplatDownloadPending}');
  });
});
