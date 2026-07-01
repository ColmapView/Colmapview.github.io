/**
 * Parity test: pins the committed WASM binary's getNumCameraParams to the TS
 * camera-model registry. Catches any future C++ / registry drift.
 *
 * Design note — Emscripten enum_<> values are opaque objects, not plain
 * integers. Calling module.getNumCameraParams(16) (raw integer) returns
 * garbage from the C++ switch's default branch. We resolve each model via
 * module.CameraModelId[colmapName] (the Emscripten enum object), which also
 * verifies the embind name registration exists. A registry model whose
 * colmapName has no embind entry would fail the first assertion even if the
 * param count accidentally matched.
 *
 * Teeth: if a C++ GetNumParams case were wrong (e.g. EUCM returns 4 instead
 * of 6) the `toBe(descriptor.paramNames.length)` assertion fails on that
 * model. The test has verified this by construction — the pre-Task-4 binary
 * returned 0 for all models 11–17, and all seven cases would have failed.
 *
 * Guard: the suite is skipped when public/wasm/colmap_wasm.wasm is absent
 * (artifact-less checkout), keeping CI green without the built binary.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveColmapWasmFactory } from '../test/builders/wasmFakes';
import { CAMERA_MODEL_DESCRIPTORS } from '../utils/cameraModelRegistry';
import type { ColmapWasmModule } from './types';

const WASM_JS = resolve(process.cwd(), 'public/wasm/colmap_wasm.js');
const WASM_BIN = resolve(process.cwd(), 'public/wasm/colmap_wasm.wasm');

const wasmAbsent = !existsSync(WASM_BIN) || !existsSync(WASM_JS);

describe.skipIf(wasmAbsent)('WASM getNumCameraParams ↔ registry parity', () => {
  // Single module instance shared across all model cases.
  let module: ColmapWasmModule;

  beforeAll(async () => {
    const factory = resolveColmapWasmFactory(await import(pathToFileURL(WASM_JS).href));
    module = await factory({
      wasmBinary: readFileSync(WASM_BIN),
      locateFile: (f) => resolve(process.cwd(), 'public/wasm', f),
    });
  }, 30_000);

  const descriptors = Object.values(CAMERA_MODEL_DESCRIPTORS);

  it.each(descriptors.map((d) => [d.colmapName, d] as [string, (typeof descriptors)[number]]))(
    'model %s: getNumCameraParams matches registry param count',
    (_colmapName, descriptor) => {
      // Resolve the Emscripten enum object for this model by its COLMAP name.
      // This also asserts that embind has registered the name — a missing
      // .value("EUCM", ...) in main.cpp would fail here before the count check.
      const enumVal = (module.CameraModelId as Record<string, unknown>)[descriptor.colmapName];
      expect(enumVal, `embind missing enum value for ${descriptor.colmapName}`).toBeDefined();

      // Pass the enum object (not a raw integer) — Emscripten enum_<> requires it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(module.getNumCameraParams(enumVal as any)).toBe(descriptor.paramNames.length);
    },
  );
});
