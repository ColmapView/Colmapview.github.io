import { Blob as NodeBlob } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateSogBundle } from './sogBundle';

/**
 * The e2e fixture is a real bundle from PlayCanvas's reference encoder
 * (@playcanvas/splat-transform 3.7.0, see scripts/generate-sog-fixture.mjs),
 * so the validator must accept it whether or not a browser can render it.
 */
const FIXTURE_PATH = resolve(__dirname, '../../e2e/fixtures/splats/sog-scene.sog');

describe('SOG bundle validation against the reference encoder output', () => {
  // jsdom's Blob has no arrayBuffer(); the validator wraps each texture prefix in the global Blob.
  beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
  afterEach(() => vi.unstubAllGlobals());

  it('accepts the splat-transform fixture and reports its count and SH bands', async () => {
    const bundle = new NodeBlob([readFileSync(FIXTURE_PATH)]) as unknown as Blob;
    await expect(validateSogBundle(bundle)).resolves.toEqual({ version: 2, count: 2000, shBands: 1 });
  });
});
