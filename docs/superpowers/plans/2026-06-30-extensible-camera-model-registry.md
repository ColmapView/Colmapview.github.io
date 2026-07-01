# Extensible Camera-Model Registry + COLMAP 4.1 Model Support (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scattered per-model camera tables with a single descriptor registry, and wire every COLMAP-4.1 camera model (finish id 11; add ids 12–17, including the spherical `EQUIRECTANGULAR` model) into the load/parse/classify/name/intrinsics path so reconstructions using them open without errors or garbage frustums.

**Architecture:** A new `cameraModelRegistry.ts` holds one `CameraModelDescriptor` per model (`id`, `colmapName`, `displayName`, `paramNames`, `family`). All previously-scattered constants — param counts, param-name lists, human/COLMAP name maps, the text parser's name→id map, and the perspective/fisheye classification — become thin derivations of that registry (single source of truth). `getCameraIntrinsics` becomes a registry-driven generic extractor. A `family` of `'spherical'` marks models with **no pinhole intrinsics**; `getFrustumPlaneSize` gets one guard so those models never produce a (garbage) flat frustum. Actual spherical *rendering*, EUCM/DIVISION undistortion math, the C++/WASM recompile, and the lat/long grid are explicitly **out of scope** (see Roadmap).

**Tech Stack:** TypeScript, Vite, Vitest, React Three Fiber (untouched here), Zustand (untouched here).

## Global Constraints

- Package manager / runner: this repo's app lives in `colmap-webview/`. Run all commands from that directory. Tests: `npm run test:run`. Type+build: `npm run build`. Lint: `npm run lint`.
- TDD: every task writes a failing test first, then the minimal code to pass. Keep the whole suite green at the end of every task.
- DRY: the registry is the ONLY place a model's params/names/family are listed. Do not reintroduce a second per-model table.
- One-way module dependency: `cameraModelRegistry.ts` may import `CameraModelId` from `src/types/colmap.ts`, but `src/types/colmap.ts` must **not** import the registry (prevents an ESM init cycle).
- `CameraModelId` is declared at the top of `src/types/colmap.ts` (lines 13–26) before any re-export; keep it there.
- COLMAP source of truth for model ids/params: `src/colmap/sensor/models.h` on the `colmap/colmap` repo. The values used below come from that header (models 0–17). The spherical model's exact COLMAP **name token** must be confirmed against the header during Task 3 (we use `EQUIRECTANGULAR`; it is the one value most likely to need correction).

### Behavioral changes (intended, call out in commits)

1. **Model 11 (`RAD_TAN_THIN_PRISM_FISHEYE`) is finished.** It was in the enum but unclassified and had no intrinsics case (it silently returned `fx=1`). After this plan it is classified `fisheye` (so `resolveUndistortionMode` downgrades it `fullFrame`→`cropped`, the correct fisheye behavior) and its `fx/fy/cx/cy` are extracted correctly.
2. **New models 12–17 load and display but are not convertible.** They are absent from the conversion compatibility tables, so `getCameraModelCompatibility` returns `incompatible` for them — they will not appear as conversion targets/sources. That is the correct minimal behavior; conversion support is a later plan.
3. **Spherical cameras render no frustum yet.** `getFrustumPlaneSize` returns a zero-size plane for them (a short forward tick at the camera origin), not a flat rectangle. A real marker/grid is Plan 2.

---

## File Structure

- **Create** `src/utils/cameraModelRegistry.ts` — the descriptor table + derived getters and predicates. New single source of truth.
- **Create** `src/utils/cameraModelRegistry.test.ts` — registry self-consistency + parity-with-old-constants + new-model coverage.
- **Modify** `src/types/colmap.ts` — add enum members 12–17 (Task 3); remove the hand-written `CAMERA_MODEL_NUM_PARAMS` literal, re-export the registry-derived one (Task 2).
- **Modify** `src/utils/cameraModelPolicy.ts` — derive `PARAM_NAMES`, `PERSPECTIVE_CAMERA_MODELS`, `FISHEYE_CAMERA_MODELS` from the registry; add `isSphericalCameraModel`; keep all existing exported signatures.
- **Modify** `src/utils/cameraModelNames.ts` — derive both name maps from the registry; keep `getCameraModelName`.
- **Modify** `src/parsers/cameras.ts` — binary parser uses `getCameraModelNumParams`; text parser uses the registry's `colmapNameToModelId` instead of its inline map.
- **Modify** `src/utils/cameraIntrinsics.ts` — replace the per-model `switch` with a registry-driven generic extractor.
- **Modify** `src/components/viewer3d/cameraFrustumGeometry.ts` — guard `getFrustumPlaneSize` for non-pinhole models.
- **Modify** tests: `src/parsers/cameras.test.ts`, `src/utils/cameraModelPolicy.test.ts`, `src/utils/cameraModelNames.test.ts`, `src/components/viewer3d/cameraFrustumGeometry.test.ts` — extend/adjust assertions.

---

## Task 1: Create the registry over the existing 12 models (0–11)

**Files:**
- Create: `src/utils/cameraModelRegistry.ts`
- Test: `src/utils/cameraModelRegistry.test.ts`

**Interfaces:**
- Consumes: `CameraModelId` from `src/types/colmap.ts`.
- Produces:
  - `type CameraModelFamily = 'pinhole' | 'fisheye' | 'spherical'`
  - `interface CameraModelDescriptor { id: CameraModelId; colmapName: string; displayName: string; paramNames: readonly string[]; family: CameraModelFamily }`
  - `const CAMERA_MODEL_DESCRIPTORS: Record<CameraModelId, CameraModelDescriptor>`
  - `getCameraModelDescriptor(id): CameraModelDescriptor`
  - `getCameraModelNumParams(id): number`
  - `getCameraModelParamNames(id): readonly string[]`
  - `getCameraModelFamily(id): CameraModelFamily`
  - `getCameraModelColmapName(id): string`
  - `getCameraModelDisplayName(id): string`
  - `colmapNameToModelId(name: string): CameraModelId | undefined`
  - `isSphericalCameraModel(id): boolean`
  - `cameraModelHasPinholeIntrinsics(id): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/utils/cameraModelRegistry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CameraModelId, CAMERA_MODEL_NUM_PARAMS } from '../types/colmap';
import { PARAM_NAMES, CAMERA_MODEL_COLMAP_NAMES } from './cameraModelPolicy';
import { CAMERA_MODEL_NAMES } from './cameraModelNames';
import {
  CAMERA_MODEL_DESCRIPTORS,
  getCameraModelNumParams,
  getCameraModelParamNames,
  getCameraModelColmapName,
  getCameraModelDisplayName,
  colmapNameToModelId,
  getCameraModelFamily,
  cameraModelHasPinholeIntrinsics,
} from './cameraModelRegistry';

describe('cameraModelRegistry', () => {
  it('has a descriptor for every CameraModelId', () => {
    for (const id of Object.values(CameraModelId)) {
      expect(CAMERA_MODEL_DESCRIPTORS[id]).toBeDefined();
      expect(CAMERA_MODEL_DESCRIPTORS[id].id).toBe(id);
    }
  });

  it('param count equals paramNames length and matches the legacy table', () => {
    for (const id of Object.values(CameraModelId)) {
      expect(getCameraModelNumParams(id)).toBe(getCameraModelParamNames(id).length);
      expect(getCameraModelNumParams(id)).toBe(CAMERA_MODEL_NUM_PARAMS[id]);
    }
  });

  it('round-trips colmap names', () => {
    for (const id of Object.values(CameraModelId)) {
      expect(colmapNameToModelId(getCameraModelColmapName(id))).toBe(id);
    }
  });

  it('classifies every model into a family and only spherical lacks pinhole intrinsics', () => {
    for (const id of Object.values(CameraModelId)) {
      const family = getCameraModelFamily(id);
      expect(['pinhole', 'fisheye', 'spherical']).toContain(family);
      expect(cameraModelHasPinholeIntrinsics(id)).toBe(family !== 'spherical');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/utils/cameraModelRegistry.test.ts`
Expected: FAIL — cannot resolve `./cameraModelRegistry`.

- [ ] **Step 3: Write the registry (existing 12 models only)**

Create `src/utils/cameraModelRegistry.ts`:

```ts
import { CameraModelId } from '../types/colmap';

export type CameraModelFamily = 'pinhole' | 'fisheye' | 'spherical';

export interface CameraModelDescriptor {
  id: CameraModelId;
  /** Exact token used in COLMAP cameras.txt / source enum, e.g. "OPENCV". */
  colmapName: string;
  /** Human-readable label for the UI, e.g. "OpenCV". */
  displayName: string;
  /** Ordered parameter names; length === number of params for the model. */
  paramNames: readonly string[];
  family: CameraModelFamily;
}

export const CAMERA_MODEL_DESCRIPTORS: Record<CameraModelId, CameraModelDescriptor> = {
  [CameraModelId.SIMPLE_PINHOLE]: { id: CameraModelId.SIMPLE_PINHOLE, colmapName: 'SIMPLE_PINHOLE', displayName: 'Simple Pinhole', paramNames: ['f', 'cx', 'cy'], family: 'pinhole' },
  [CameraModelId.PINHOLE]: { id: CameraModelId.PINHOLE, colmapName: 'PINHOLE', displayName: 'Pinhole', paramNames: ['fx', 'fy', 'cx', 'cy'], family: 'pinhole' },
  [CameraModelId.SIMPLE_RADIAL]: { id: CameraModelId.SIMPLE_RADIAL, colmapName: 'SIMPLE_RADIAL', displayName: 'Simple Radial', paramNames: ['f', 'cx', 'cy', 'k'], family: 'pinhole' },
  [CameraModelId.RADIAL]: { id: CameraModelId.RADIAL, colmapName: 'RADIAL', displayName: 'Radial', paramNames: ['f', 'cx', 'cy', 'k1', 'k2'], family: 'pinhole' },
  [CameraModelId.OPENCV]: { id: CameraModelId.OPENCV, colmapName: 'OPENCV', displayName: 'OpenCV', paramNames: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'p1', 'p2'], family: 'pinhole' },
  [CameraModelId.OPENCV_FISHEYE]: { id: CameraModelId.OPENCV_FISHEYE, colmapName: 'OPENCV_FISHEYE', displayName: 'OpenCV Fisheye', paramNames: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'k3', 'k4'], family: 'fisheye' },
  [CameraModelId.FULL_OPENCV]: { id: CameraModelId.FULL_OPENCV, colmapName: 'FULL_OPENCV', displayName: 'Full OpenCV', paramNames: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'p1', 'p2', 'k3', 'k4', 'k5', 'k6'], family: 'pinhole' },
  [CameraModelId.FOV]: { id: CameraModelId.FOV, colmapName: 'FOV', displayName: 'FOV', paramNames: ['fx', 'fy', 'cx', 'cy', 'ω'], family: 'pinhole' },
  [CameraModelId.SIMPLE_RADIAL_FISHEYE]: { id: CameraModelId.SIMPLE_RADIAL_FISHEYE, colmapName: 'SIMPLE_RADIAL_FISHEYE', displayName: 'Simple Radial Fisheye', paramNames: ['f', 'cx', 'cy', 'k'], family: 'fisheye' },
  [CameraModelId.RADIAL_FISHEYE]: { id: CameraModelId.RADIAL_FISHEYE, colmapName: 'RADIAL_FISHEYE', displayName: 'Radial Fisheye', paramNames: ['f', 'cx', 'cy', 'k1', 'k2'], family: 'fisheye' },
  [CameraModelId.THIN_PRISM_FISHEYE]: { id: CameraModelId.THIN_PRISM_FISHEYE, colmapName: 'THIN_PRISM_FISHEYE', displayName: 'Thin Prism Fisheye', paramNames: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'p1', 'p2', 'k3', 'k4', 'sx1', 'sy1'], family: 'fisheye' },
  [CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE]: { id: CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE, colmapName: 'RAD_TAN_THIN_PRISM_FISHEYE', displayName: 'Rad-Tan Thin Prism', paramNames: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'p1', 'p2', 'sx1', 'sy1', 'sx2', 'sy2'], family: 'fisheye' },
};

export function getCameraModelDescriptor(id: CameraModelId): CameraModelDescriptor {
  return CAMERA_MODEL_DESCRIPTORS[id];
}

export function getCameraModelNumParams(id: CameraModelId): number {
  return CAMERA_MODEL_DESCRIPTORS[id].paramNames.length;
}

export function getCameraModelParamNames(id: CameraModelId): readonly string[] {
  return CAMERA_MODEL_DESCRIPTORS[id].paramNames;
}

export function getCameraModelFamily(id: CameraModelId): CameraModelFamily {
  return CAMERA_MODEL_DESCRIPTORS[id].family;
}

export function getCameraModelColmapName(id: CameraModelId): string {
  return CAMERA_MODEL_DESCRIPTORS[id].colmapName;
}

export function getCameraModelDisplayName(id: CameraModelId): string {
  return CAMERA_MODEL_DESCRIPTORS[id].displayName;
}

const COLMAP_NAME_TO_ID: ReadonlyMap<string, CameraModelId> = new Map(
  Object.values(CAMERA_MODEL_DESCRIPTORS).map((d) => [d.colmapName, d.id])
);

export function colmapNameToModelId(name: string): CameraModelId | undefined {
  return COLMAP_NAME_TO_ID.get(name);
}

export function isSphericalCameraModel(id: CameraModelId): boolean {
  return getCameraModelFamily(id) === 'spherical';
}

export function cameraModelHasPinholeIntrinsics(id: CameraModelId): boolean {
  return getCameraModelFamily(id) !== 'spherical';
}
```

> Note: families above reproduce the existing `PERSPECTIVE_CAMERA_MODELS` / `FISHEYE_CAMERA_MODELS` membership for ids 0–10 exactly, and additionally classify id 11 as `fisheye` (Behavioral change #1).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/utils/cameraModelRegistry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/cameraModelRegistry.ts src/utils/cameraModelRegistry.test.ts
git commit -m "feat(cameras): add camera-model descriptor registry (source of truth)"
```

---

## Task 2: Derive the scattered constants from the registry (parity, no new models)

**Files:**
- Modify: `src/types/colmap.ts:30-43` (remove `CAMERA_MODEL_NUM_PARAMS` literal, re-export registry-derived)
- Modify: `src/utils/cameraModelPolicy.ts:7-37` (`PARAM_NAMES`, `PERSPECTIVE_CAMERA_MODELS`, `FISHEYE_CAMERA_MODELS`) + add `isSphericalCameraModel`
- Modify: `src/utils/cameraModelNames.ts:12-41` (both name maps)
- Modify: `src/parsers/cameras.ts:36,67-93` (use registry helpers)
- Modify tests: `src/utils/cameraModelPolicy.test.ts`, `src/utils/cameraModelNames.test.ts` (only if they assert old id-11 classification)

**Interfaces:**
- Consumes: everything produced by Task 1.
- Produces: identical public symbols as before (`CAMERA_MODEL_NUM_PARAMS`, `PARAM_NAMES`, `CAMERA_MODEL_NAMES`, `CAMERA_MODEL_COLMAP_NAMES`, `isPerspectiveCameraModel`, `isFisheyeCameraModel`) plus new `isSphericalCameraModel`.

- [ ] **Step 1: Write the failing test**

Add to `src/utils/cameraModelRegistry.test.ts`:

```ts
import { isPerspectiveCameraModel, isFisheyeCameraModel, isSphericalCameraModel } from './cameraModelPolicy';

describe('registry-derived classification parity', () => {
  it('reproduces perspective membership for the original models', () => {
    expect(isPerspectiveCameraModel(CameraModelId.PINHOLE)).toBe(true);
    expect(isPerspectiveCameraModel(CameraModelId.FULL_OPENCV)).toBe(true);
    expect(isPerspectiveCameraModel(CameraModelId.FOV)).toBe(true);
    expect(isPerspectiveCameraModel(CameraModelId.OPENCV_FISHEYE)).toBe(false);
  });

  it('classifies the previously-unwired RAD_TAN_THIN_PRISM_FISHEYE as fisheye', () => {
    expect(isFisheyeCameraModel(CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE)).toBe(true);
    expect(isPerspectiveCameraModel(CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE)).toBe(false);
    expect(isSphericalCameraModel(CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/utils/cameraModelRegistry.test.ts`
Expected: FAIL — `isSphericalCameraModel` is not exported from `cameraModelPolicy`.

- [ ] **Step 3: Rewire the constants to the registry**

In `src/types/colmap.ts`, replace the literal `CAMERA_MODEL_NUM_PARAMS` (lines 30–43) with a re-export:

```ts
// Param counts now derive from the registry (single source of truth).
export { CAMERA_MODEL_NUM_PARAMS } from '../utils/cameraModelNumParams';
```

Create `src/utils/cameraModelNumParams.ts` (a tiny indirection that avoids a `colmap.ts` → registry cycle — the registry imports `colmap.ts`, so `colmap.ts` re-exports from this leaf wrapper which the registry does not depend on):

```ts
import { CameraModelId } from '../types/colmap';
import { CAMERA_MODEL_DESCRIPTORS } from './cameraModelRegistry';

export const CAMERA_MODEL_NUM_PARAMS: Record<CameraModelId, number> = Object.fromEntries(
  Object.values(CAMERA_MODEL_DESCRIPTORS).map((d) => [d.id, d.paramNames.length])
) as Record<CameraModelId, number>;
```

> If the executor observes any ESM init-order issue (e.g. `CameraModelId` undefined at registry load), the fallback is to extract the `CameraModelId` enum into its own dependency-free file `src/types/cameraModelId.ts` and have both `colmap.ts` and the registry import from it. The `cameraModelRegistry.test.ts` "has a descriptor for every CameraModelId" test (which imports the registry first) is the canary for this.

In `src/utils/cameraModelPolicy.ts`, replace the literal `PARAM_NAMES` (lines 7–20) and the two classification arrays (lines 22–37) with derivations, and add the spherical predicate:

```ts
import {
  CAMERA_MODEL_DESCRIPTORS,
  getCameraModelParamNames,
  getCameraModelFamily,
} from './cameraModelRegistry';

export const PARAM_NAMES: Record<CameraModelId, string[]> = Object.fromEntries(
  Object.values(CAMERA_MODEL_DESCRIPTORS).map((d) => [d.id, [...d.paramNames]])
) as Record<CameraModelId, string[]>;

export const PERSPECTIVE_CAMERA_MODELS: readonly CameraModelId[] =
  Object.values(CAMERA_MODEL_DESCRIPTORS).filter((d) => d.family === 'pinhole').map((d) => d.id);

export const FISHEYE_CAMERA_MODELS: readonly CameraModelId[] =
  Object.values(CAMERA_MODEL_DESCRIPTORS).filter((d) => d.family === 'fisheye').map((d) => d.id);

export function isSphericalCameraModel(modelId: CameraModelId): boolean {
  return getCameraModelFamily(modelId) === 'spherical';
}
```

(Leave `isPerspectiveCameraModel`/`isFisheyeCameraModel` as-is; they read the now-derived arrays. Keep `getCameraModelColmapName` re-exporting from `cameraModelNames` as today, or switch it to the registry's `getCameraModelColmapName` — both are equivalent.)

In `src/utils/cameraModelNames.ts`, replace the two literal maps (lines 12–41) with derivations:

```ts
import { CameraModelId } from '../types/colmap';
import { CAMERA_MODEL_DESCRIPTORS } from './cameraModelRegistry';

export const CAMERA_MODEL_NAMES: Record<number, string> = Object.fromEntries(
  Object.values(CAMERA_MODEL_DESCRIPTORS).map((d) => [d.id, d.displayName])
);

export const CAMERA_MODEL_COLMAP_NAMES: Record<number, string> = Object.fromEntries(
  Object.values(CAMERA_MODEL_DESCRIPTORS).map((d) => [d.id, d.colmapName])
);

export function getCameraModelName(modelId: number): string {
  return CAMERA_MODEL_NAMES[modelId] ?? `Unknown (${modelId})`;
}
```

In `src/parsers/cameras.ts`: import `getCameraModelNumParams` and `colmapNameToModelId` from `../utils/cameraModelRegistry`. Replace line 36 `const numParams = CAMERA_MODEL_NUM_PARAMS[modelId] ?? 0;` with `const numParams = getCameraModelNumParams(modelId);`. Delete the inline `modelNameToId` object (lines 67–80) and replace its use at line 93 with `const modelId = colmapNameToModelId(modelName);` (keep the `=== undefined` guard).

- [ ] **Step 4: Run the full suite to verify parity**

Run: `npm run test:run`
Expected: PASS. If `cameraModelPolicy.test.ts` or `cameraModelNames.test.ts` asserted that id 11 is *not* fisheye or had no classification, update those specific assertions to the corrected values (Behavioral change #1) and note it in the commit.

- [ ] **Step 5: Verify the build typechecks**

Run: `npm run build`
Expected: PASS (no TS errors; the derived `Record<CameraModelId, …>` casts are total).

- [ ] **Step 6: Commit**

```bash
git add src/types/colmap.ts src/utils/cameraModelNumParams.ts src/utils/cameraModelPolicy.ts src/utils/cameraModelNames.ts src/parsers/cameras.ts src/utils/cameraModelRegistry.test.ts
git commit -m "refactor(cameras): derive param/name/classification tables from the registry"
```

---

## Task 3: Add COLMAP 4.1 models 12–17 to the enum + registry

**Files:**
- Modify: `src/types/colmap.ts:13-26` (enum)
- Modify: `src/utils/cameraModelRegistry.ts` (descriptors)
- Test: `src/parsers/cameras.test.ts`, `src/utils/cameraModelRegistry.test.ts`

**Interfaces:**
- Consumes: registry from Tasks 1–2.
- Produces: enum members `SIMPLE_DIVISION=12, DIVISION=13, SIMPLE_FISHEYE=14, FISHEYE=15, EUCM=16, EQUIRECTANGULAR=17` and their descriptors.

- [ ] **Step 1: Write the failing test**

Add to `src/parsers/cameras.test.ts` (inside `describe('parseCamerasText', …)`):

```ts
it('parses EQUIRECTANGULAR (spherical) cameras', () => {
  const input = '5 EQUIRECTANGULAR 4096 2048 4096 2048';
  const result = parseCamerasText(input);
  const camera = result.get(5);
  expect(camera).toBeDefined();
  expect(camera!.modelId).toBe(CameraModelId.EQUIRECTANGULAR);
  expect(camera!.params).toEqual([4096, 2048]);
});

it('parses EUCM cameras', () => {
  const input = '6 EUCM 1920 1080 1000 1000 960 540 0.6 1.1';
  const result = parseCamerasText(input);
  const camera = result.get(6);
  expect(camera).toBeDefined();
  expect(camera!.modelId).toBe(CameraModelId.EUCM);
  expect(camera!.params).toHaveLength(6);
});
```

And add to `src/parsers/cameras.test.ts` (inside `describe('parseCamerasBinary', …)`):

```ts
it('parses EQUIRECTANGULAR binary cameras with exactly 2 params', () => {
  const result = parseCamerasBinary(createBinaryCameraBuffer(CameraModelId.EQUIRECTANGULAR, [4096, 2048]));
  const camera = result.get(1);
  expect(camera!.modelId).toBe(CameraModelId.EQUIRECTANGULAR);
  expect(camera!.params).toEqual([4096, 2048]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/parsers/cameras.test.ts`
Expected: FAIL — `CameraModelId.EQUIRECTANGULAR` is `undefined`.

- [ ] **Step 3: Extend the enum and registry**

In `src/types/colmap.ts`, extend the enum (after line 25):

```ts
  RAD_TAN_THIN_PRISM_FISHEYE: 11,
  SIMPLE_DIVISION: 12,
  DIVISION: 13,
  SIMPLE_FISHEYE: 14,
  FISHEYE: 15,
  EUCM: 16,
  EQUIRECTANGULAR: 17,
} as const;
```

In `src/utils/cameraModelRegistry.ts`, add to `CAMERA_MODEL_DESCRIPTORS` (the `Record<CameraModelId, …>` type will fail to compile until all six are present):

```ts
  [CameraModelId.SIMPLE_DIVISION]: { id: CameraModelId.SIMPLE_DIVISION, colmapName: 'SIMPLE_DIVISION', displayName: 'Simple Division', paramNames: ['f', 'cx', 'cy', 'k'], family: 'pinhole' },
  [CameraModelId.DIVISION]: { id: CameraModelId.DIVISION, colmapName: 'DIVISION', displayName: 'Division', paramNames: ['fx', 'fy', 'cx', 'cy', 'k'], family: 'pinhole' },
  [CameraModelId.SIMPLE_FISHEYE]: { id: CameraModelId.SIMPLE_FISHEYE, colmapName: 'SIMPLE_FISHEYE', displayName: 'Simple Fisheye', paramNames: ['f', 'cx', 'cy'], family: 'fisheye' },
  [CameraModelId.FISHEYE]: { id: CameraModelId.FISHEYE, colmapName: 'FISHEYE', displayName: 'Fisheye', paramNames: ['fx', 'fy', 'cx', 'cy'], family: 'fisheye' },
  [CameraModelId.EUCM]: { id: CameraModelId.EUCM, colmapName: 'EUCM', displayName: 'EUCM', paramNames: ['fx', 'fy', 'cx', 'cy', 'alpha', 'beta'], family: 'pinhole' },
  [CameraModelId.EQUIRECTANGULAR]: { id: CameraModelId.EQUIRECTANGULAR, colmapName: 'EQUIRECTANGULAR', displayName: 'Equirectangular', paramNames: ['w', 'h'], family: 'spherical' },
```

> **Confirm before merging:** open `src/colmap/sensor/models.h` (colmap/colmap, `main`) and verify (a) the spherical model's enum/name token is `EQUIRECTANGULAR` (not `SPHERICAL`), (b) ids 12–17 match, (c) param counts: 4,5,3,4,6,2. If the spherical token differs, change the single `colmapName` string above (and the test inputs).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/parsers/cameras.test.ts src/utils/cameraModelRegistry.test.ts`
Expected: PASS — the registry "every CameraModelId has a descriptor" test now covers 12–17, and the new parser tests pass.

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/colmap.ts src/utils/cameraModelRegistry.ts src/parsers/cameras.test.ts
git commit -m "feat(cameras): register COLMAP 4.1 models (DIVISION, FISHEYE, EUCM, EQUIRECTANGULAR)"
```

---

## Task 4: Registry-driven `getCameraIntrinsics`

**Files:**
- Modify: `src/utils/cameraIntrinsics.ts` (replace the whole `switch`)
- Test: `src/utils/cameraIntrinsics.test.ts` (extend if present; otherwise create)

**Interfaces:**
- Consumes: `getCameraModelParamNames`, `cameraModelHasPinholeIntrinsics` from the registry.
- Produces: unchanged signature `getCameraIntrinsics(camera: Camera): CameraIntrinsics`.

- [ ] **Step 1: Write the failing test**

Add to `src/utils/cameraIntrinsics.test.ts` (create the file if it does not exist, importing `getCameraIntrinsics` from `./cameraIntrinsics`, `buildCamera` from `../test/builders/colmapBuilders`, and `CameraModelId` from `../types/colmap`):

```ts
import { describe, it, expect } from 'vitest';
import { getCameraIntrinsics } from './cameraIntrinsics';
import { buildCamera } from '../test/builders/colmapBuilders';
import { CameraModelId } from '../types/colmap';

describe('getCameraIntrinsics (registry-driven)', () => {
  it('extracts fx/fy/cx/cy for the newly-wired DIVISION model', () => {
    const cam = buildCamera({ modelId: CameraModelId.DIVISION, params: [800, 810, 320, 240, -0.05] });
    const intr = getCameraIntrinsics(cam);
    expect(intr.fx).toBe(800);
    expect(intr.fy).toBe(810);
    expect(intr.cx).toBe(320);
    expect(intr.cy).toBe(240);
  });

  it('extracts fx/fy for EUCM and ignores alpha/beta', () => {
    const cam = buildCamera({ modelId: CameraModelId.EUCM, params: [900, 900, 640, 360, 0.6, 1.1] });
    const intr = getCameraIntrinsics(cam);
    expect(intr.fx).toBe(900);
    expect(intr.cy).toBe(360);
  });

  it('finishes RAD_TAN_THIN_PRISM_FISHEYE (id 11) instead of returning fx=1', () => {
    const params = [700, 705, 320, 240, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const intr = getCameraIntrinsics(buildCamera({ modelId: CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE, params }));
    expect(intr.fx).toBe(700);
    expect(intr.fy).toBe(705);
  });

  it('returns safe defaults for spherical (no pinhole intrinsics)', () => {
    const intr = getCameraIntrinsics(buildCamera({ modelId: CameraModelId.EQUIRECTANGULAR, params: [4096, 2048] }));
    expect(intr.fx).toBe(1);
    expect(intr.fy).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/utils/cameraIntrinsics.test.ts`
Expected: FAIL — DIVISION/EUCM return `fx=1` (no `switch` case today).

- [ ] **Step 3: Replace the switch with a generic extractor**

Replace the body of `src/utils/cameraIntrinsics.ts` with:

```ts
import type { Camera, CameraIntrinsics } from '../types/colmap';
import { getCameraModelParamNames, cameraModelHasPinholeIntrinsics } from './cameraModelRegistry';

/** Maps a COLMAP param name to the intrinsics field(s) it populates. */
const INTRINSIC_PARAM_SETTERS: Record<string, (i: CameraIntrinsics, v: number) => void> = {
  f: (i, v) => { i.fx = v; i.fy = v; },
  fx: (i, v) => { i.fx = v; },
  fy: (i, v) => { i.fy = v; },
  cx: (i, v) => { i.cx = v; },
  cy: (i, v) => { i.cy = v; },
  k: (i, v) => { i.k1 = v; },
  k1: (i, v) => { i.k1 = v; },
  k2: (i, v) => { i.k2 = v; },
  k3: (i, v) => { i.k3 = v; },
  k4: (i, v) => { i.k4 = v; },
  k5: (i, v) => { i.k5 = v; },
  k6: (i, v) => { i.k6 = v; },
  p1: (i, v) => { i.p1 = v; },
  p2: (i, v) => { i.p2 = v; },
  'ω': (i, v) => { i.omega = v; },
  sx1: (i, v) => { i.sx1 = v; },
  sy1: (i, v) => { i.sy1 = v; },
};

/**
 * Extract pinhole intrinsics from a COLMAP camera by mapping the model's
 * declared parameter names onto the intrinsics struct. Params with no pinhole
 * meaning (EUCM alpha/beta, division k beyond k1, prism sx2/sy2) are ignored.
 * Models without pinhole intrinsics (spherical) return the unit defaults —
 * callers MUST gate on `cameraModelHasPinholeIntrinsics` before using these.
 */
export function getCameraIntrinsics(camera: Camera): CameraIntrinsics {
  const intrinsics: CameraIntrinsics = {
    fx: 1, fy: 1, cx: 0, cy: 0,
    k1: 0, k2: 0, k3: 0, k4: 0, k5: 0, k6: 0,
    p1: 0, p2: 0, omega: 0, sx1: 0, sy1: 0,
  };

  if (!cameraModelHasPinholeIntrinsics(camera.modelId)) {
    return intrinsics;
  }

  const paramNames = getCameraModelParamNames(camera.modelId);
  for (let i = 0; i < paramNames.length; i++) {
    const setter = INTRINSIC_PARAM_SETTERS[paramNames[i]];
    if (setter !== undefined) {
      setter(intrinsics, camera.params[i] ?? 0);
    }
  }

  return intrinsics;
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm run test:run`
Expected: PASS — the new tests pass and every pre-existing `getCameraIntrinsics` test for models 0–10 still passes (the name→field mapping reproduces the old `switch` exactly).

- [ ] **Step 5: Commit**

```bash
git add src/utils/cameraIntrinsics.ts src/utils/cameraIntrinsics.test.ts
git commit -m "refactor(cameras): make getCameraIntrinsics registry-driven; finish model 11"
```

---

## Task 5: Guard `getFrustumPlaneSize` so spherical cameras draw no garbage frustum

**Files:**
- Modify: `src/components/viewer3d/cameraFrustumGeometry.ts:133-165`
- Test: `src/components/viewer3d/cameraFrustumGeometry.test.ts`

**Interfaces:**
- Consumes: `cameraModelHasPinholeIntrinsics` from the registry.
- Produces: unchanged `getFrustumPlaneSize(camera, scale): FrustumPlaneSize`, now returning the zero-size plane for non-pinhole models.

- [ ] **Step 1: Write the failing test**

Add to `src/components/viewer3d/cameraFrustumGeometry.test.ts`:

```ts
import { getFrustumPlaneSize } from './cameraFrustumGeometry';
import { buildCamera } from '../../test/builders/colmapBuilders';
import { CameraModelId } from '../../types/colmap';

describe('getFrustumPlaneSize spherical guard', () => {
  it('returns a zero-size plane for spherical cameras (no garbage frustum)', () => {
    const cam = buildCamera({ modelId: CameraModelId.EQUIRECTANGULAR, width: 4096, height: 2048, params: [4096, 2048] });
    const size = getFrustumPlaneSize(cam, 1);
    expect(size.width).toBe(0);
    expect(size.height).toBe(0);
  });

  it('still sizes a normal pinhole frustum', () => {
    const cam = buildCamera({ modelId: CameraModelId.PINHOLE, width: 640, height: 480, params: [500, 500, 320, 240] });
    const size = getFrustumPlaneSize(cam, 1);
    expect(size.width).toBeCloseTo(640 / 500);
    expect(size.height).toBeCloseTo(480 / 500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/components/viewer3d/cameraFrustumGeometry.test.ts`
Expected: FAIL — spherical currently yields `width = 1·4096/1 = 4096` (the garbage giant frustum), not 0.

- [ ] **Step 3: Add the guard**

In `src/components/viewer3d/cameraFrustumGeometry.ts`, add the import at the top:

```ts
import { cameraModelHasPinholeIntrinsics } from '../../utils/cameraModelRegistry';
```

Then insert this block inside `getFrustumPlaneSize`, immediately after the `invalidPlaneSize` constant and before the `camera.width <= 0` check (so it short-circuits before `getCameraIntrinsics`):

```ts
  if (!cameraModelHasPinholeIntrinsics(camera.modelId)) {
    return invalidPlaneSize;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- src/components/viewer3d/cameraFrustumGeometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/viewer3d/cameraFrustumGeometry.ts src/components/viewer3d/cameraFrustumGeometry.test.ts
git commit -m "fix(viewer): spherical cameras render no pinhole frustum (placeholder)"
```

---

## Task 6: Verify undistortion-mode + conversion behavior for the new models

**Files:**
- Test only: `src/utils/undistortionMode.test.ts`, `src/utils/cameraModelRegistry.test.ts`
- (No production change expected — this task proves the safe defaults hold. If an assertion fails, fix the registry family or add an explicit guard in `getCameraModelCompatibility`.)

**Interfaces:**
- Consumes: `resolveUndistortionMode`, `getCameraModelCompatibility`.

- [ ] **Step 1: Write the tests**

Add to `src/utils/undistortionMode.test.ts`:

```ts
import { CameraModelId } from '../types/colmap';

it('downgrades the new fisheye models from fullFrame to cropped', () => {
  expect(resolveUndistortionMode('fullFrame', CameraModelId.FISHEYE)).toBe('cropped');
  expect(resolveUndistortionMode('fullFrame', CameraModelId.SIMPLE_FISHEYE)).toBe('cropped');
  expect(resolveUndistortionMode('fullFrame', CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE)).toBe('cropped');
});

it('leaves spherical and pinhole-family new models in their requested mode', () => {
  expect(resolveUndistortionMode('fullFrame', CameraModelId.EQUIRECTANGULAR)).toBe('fullFrame');
  expect(resolveUndistortionMode('fullFrame', CameraModelId.EUCM)).toBe('fullFrame');
});
```

Add to `src/utils/cameraModelRegistry.test.ts`:

```ts
import { getCameraModelCompatibility } from './cameraModelPolicy';

it('treats new + spherical models as not convertible (incompatible)', () => {
  for (const id of [CameraModelId.SIMPLE_DIVISION, CameraModelId.DIVISION, CameraModelId.SIMPLE_FISHEYE,
                    CameraModelId.FISHEYE, CameraModelId.EUCM, CameraModelId.EQUIRECTANGULAR]) {
    expect(getCameraModelCompatibility(CameraModelId.PINHOLE, id)).toBe('incompatible');
    expect(getCameraModelCompatibility(id, CameraModelId.PINHOLE)).toBe('incompatible');
  }
});
```

- [ ] **Step 2: Run tests**

Run: `npm run test:run -- src/utils/undistortionMode.test.ts src/utils/cameraModelRegistry.test.ts`
Expected: PASS. (If `getCameraModelCompatibility` returns anything other than `incompatible` for a new model, add a leading guard in `getCameraModelCompatibility` in `cameraModelPolicy.ts`: `if (isSphericalCameraModel(fromModel) || isSphericalCameraModel(toModel)) return 'incompatible';` and, for the pinhole-family new models, rely on the empty conversion tables — they already fall through to `incompatible`.)

- [ ] **Step 3: Full suite + build + lint**

Run: `npm run test:run && npm run build && npm run lint`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/utils/undistortionMode.test.ts src/utils/cameraModelRegistry.test.ts
git commit -m "test(cameras): pin down undistortion-mode + conversion behavior for 4.1 models"
```

---

## Self-Review

- **Spec coverage:** Registry single-source-of-truth → Tasks 1–2. Wire all 4.1 models (11–17) → Tasks 3–4. Spherical loads without crash → Tasks 3 (`parseCameraModelId` accepts it once enum’d) + 4 (intrinsics safe default). No garbage frustum → Task 5. New models view-only, conversions safe → Task 6. ✔
- **Placeholder scan:** No TBD/“handle errors”/“similar to” — every code step is complete. ✔
- **Type consistency:** `getCameraModelNumParams`, `getCameraModelParamNames`, `cameraModelHasPinholeIntrinsics`, `colmapNameToModelId`, `isSphericalCameraModel` are named identically wherever referenced (Tasks 1–6). The `Record<CameraModelId, …>` total-type guard forces complete descriptors. ✔
- **Known intended behavior changes:** model 11 → fisheye + intrinsics; spherical → zero-size frustum; new models → non-convertible. All documented in the header. ✔

---

## Roadmap (separate follow-up plans — explicitly NOT in this plan)

Each is its own subsystem and merits its own plan; this foundation makes them additive.

- **Plan 2 — Spherical rendering.** Replace the zero-size placeholder with a real marker: a fixed-size wireframe sphere (or reuse the model-agnostic cone marker in `BatchedArrowMeshes.tsx`) routed in `cameraFrustumGeometry.ts` / `CameraFrustumPlaneLayer.tsx:48`; gate the textured image plane off for spherical at `FrustumPlaneSurface.tsx:60` and `useFrustumPlaneDisplayTexture.ts:39`; suppress the undistort/FOV hover hints in `FrustumPlaneHoverCard.tsx:70,84`. (This is the “disable flat-image preview for spherical” work — note the camera hover card is text-only; the “flat image” is the textured plane.)
- **Plan 3 — Accurate undistortion for the new distortion models (EUCM, DIVISION).** Add their forward/inverse projection to the CPU reference (`cameraUndistortion.ts`) AND the GLSL (`src/shaders/undistortion.ts`, model-id constants at `:54-64`/`:305-315`), keeping the documented CPU↔GLSL numeric parity, plus the PSNR distortion ladder (`splatPsnrMetric.ts`).
- **Plan 4 — WASM/C++ parity.** Bump `colmap-wasm/src/parsers/cameras.cpp:43` (`model_id > 10`), extend the C++ `CameraModelId` enum + `GetNumParams()` (`colmap_wasm.h`), update the embind registration (`main.cpp`), recompile to `public/wasm/`. Until then the WASM camera parse rejects ids >10 and falls back to the JS parser — verify that fallback actually triggers for a real EQUIRECTANGULAR file (add to Plan 1 manual QA if a sample is available).
- **Plan 5 — Advanced spherical viewing.** The lat/long grid frustum and equirectangular image wrapped onto a sphere (the “real” 360 preview).
- **Plan 6 — Conversion support for the new models** (if desired): add EUCM/DIVISION/FISHEYE conversion math + compatibility-table entries.
