# Spherical Camera Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render spherical (`EQUIRECTANGULAR`) cameras as lat/long grid spheres, show the panorama as a photosphere on the selected one, and stop the pinhole-only display/metric paths from misfiring on spherical cameras — all coexisting with pinhole cameras in the same scene.

**Architecture:** A new pure geometry builder (`sphericalCameraGeometry.ts`) emits batched lat/long-sphere line segments, mirroring `cameraFrustumGeometry.ts`'s `buildFrustumLineGeometryData`. `CameraFrustums.tsx` partitions the camera list by family (`isSphericalCameraModel` from the Plan-1 registry): non-spherical → existing frustum/arrow/plane components (unchanged); spherical → a new `SphericalCameraLines` component (grid spheres, batched via `createFatLineSegmentsObject`) plus per-camera invisible hit-spheres for selection. The selected-camera overlay branches: spherical → a new `Photosphere` component (equirect texture on the sphere, from outside), else the existing `SelectedCameraFrustumPlane`. Correctness guards exclude spherical cameras from the pinhole splat-PSNR path and the ungated `getCameraIntrinsics` consumers.

**Tech Stack:** TypeScript, React Three Fiber, three.js (`LineSegments2`/`LineMaterial` fat lines, `SphereGeometry`), Vitest (+ the repo's R3F render-test harness for the canvas components).

## Global Constraints

- Run all commands from `colmap-webview/`. Tests: `npm run test:run`. Build: `npm run build`. Lint: `npm run lint`.
- TDD for pure functions (geometry, partition, policy, guards). R3F canvas components are verified by the repo's render-test harness where practical (see `CameraFrustumPlaneLayer.render.test.tsx`, `PointCloud.test.tsx` for the pattern) and by a manual load check; do not claim visual correctness from a unit test that can't observe the canvas.
- DRY: reuse `CameraFrustumItem`, `getFrustumBaseColor`/`getFrustumMetricColorScale` (from `cameraFrustumGeometry.ts`), `createFatLineSegmentsObject` (from `fatLineSegments.ts`), the image→texture loader `FrustumPlane` uses, and `isSphericalCameraModel`/`cameraModelHasPinholeIntrinsics` (from `cameraModelRegistry.ts`). Do NOT add a second texture loader or a second camera-family predicate.
- Spherical selection reuses the existing nav handlers (`handleArrowClick`, `handleArrowContextMenu`, `setHoveredImageId`, `openImageDetail`) — same signatures the frustum hit targets use.
- Immersive "enter the sphere" is OUT. Keep `Photosphere` parameterized by `side` so it's additive later.
- End every commit message with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

### Key types (from existing code, do not redefine)

```ts
// cameraFrustumGeometry.ts
interface CameraFrustumItem { image: Image; camera: Camera; position: THREE.Vector3; quaternion: THREE.Quaternion; imageFile?: File; cameraIndex: number; numPoints3D: number; }
type FrustumColorMode = 'single' | 'byCamera' | 'byRigFrame' | 'splatPsnr' | 'splatSsim';
function getFrustumBaseColor(mode, cameraIndex, imageId, imageFrameIndexMap, singleColor, splatPsnrByImage?, metricColorScale?): string;
function getFrustumMetricColorScale(mode, imageIds, splatPsnrByImage?): SplatMetricColorScale | null;
```

---

## Task 1: `buildSphereLineGeometryData` — batched grid-sphere geometry

**Files:**
- Create: `src/components/viewer3d/sphericalCameraGeometry.ts`
- Test: `src/components/viewer3d/sphericalCameraGeometry.test.ts`

**Interfaces:**
- Consumes: `CameraFrustumItem`, `getFrustumBaseColor`, `getFrustumMetricColorScale` from `./cameraFrustumGeometry`.
- Produces: constants `SPHERE_MERIDIANS`, `SPHERE_PARALLELS`, `SEGMENTS_PER_CIRCLE`, `SEGMENTS_PER_SPHERE`, `FLOATS_PER_SPHERE`, `VERTS_PER_SPHERE`; and `buildSphereLineGeometryData(items, cameraScale, opts): { positions: Float32Array; baseColors: Float32Array; baseAlphas: Float32Array }` with the SAME array-layout contract as `buildFrustumLineGeometryData` (positions & baseColors sized `items.length * FLOATS_PER_SPHERE`; baseAlphas sized `items.length * VERTS_PER_SPHERE`; 3 color floats + 1 alpha per vertex; every vertex of a camera gets that camera's base color and alpha 1.0).

- [ ] **Step 1: Write the failing test**

Create `src/components/viewer3d/sphericalCameraGeometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCamera, buildImage } from '../../test/builders/colmapBuilders';
import { getImageWorldPose } from '../../utils/colmapTransforms';
import { CameraModelId } from '../../types/colmap';
import type { CameraFrustumItem } from './cameraFrustumGeometry';
import {
  buildSphereLineGeometryData,
  FLOATS_PER_SPHERE,
  VERTS_PER_SPHERE,
  SEGMENTS_PER_SPHERE,
} from './sphericalCameraGeometry';

function sphericalItem(overrides: Partial<CameraFrustumItem> = {}): CameraFrustumItem {
  const image = buildImage({ tvec: [0, 0, 0], qvec: [1, 0, 0, 0] });
  const { position, quaternion } = getImageWorldPose(image);
  return {
    image,
    camera: buildCamera({ modelId: CameraModelId.EQUIRECTANGULAR, params: [4096, 2048], width: 4096, height: 2048 }),
    position, quaternion, cameraIndex: 0, numPoints3D: 0,
    ...overrides,
  };
}

const opts = { frustumColorMode: 'single' as const, frustumSingleColor: '#ffffff', imageFrameIndexMap: new Map<number, number>(), splatPsnrByImage: new Map() };

describe('buildSphereLineGeometryData', () => {
  it('produces correctly-sized batched arrays per camera', () => {
    const { positions, baseColors, baseAlphas } = buildSphereLineGeometryData([sphericalItem(), sphericalItem()], 1, opts);
    expect(positions.length).toBe(2 * FLOATS_PER_SPHERE);
    expect(baseColors.length).toBe(2 * FLOATS_PER_SPHERE);
    expect(baseAlphas.length).toBe(2 * VERTS_PER_SPHERE);
  });

  it('returns empty arrays for no items', () => {
    const { positions } = buildSphereLineGeometryData([], 1, opts);
    expect(positions.length).toBe(0);
  });

  it('places every vertex on a sphere of radius = cameraScale around the camera position', () => {
    const scale = 3;
    const item = sphericalItem();
    const { positions } = buildSphereLineGeometryData([item], scale, opts);
    for (let i = 0; i < positions.length; i += 3) {
      const d = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]).distanceTo(item.position);
      expect(d).toBeCloseTo(scale, 4);
    }
  });

  it('sets alpha 1.0 for every vertex and the base color for single mode', () => {
    const { baseColors, baseAlphas } = buildSphereLineGeometryData([sphericalItem()], 1, opts);
    for (let v = 0; v < VERTS_PER_SPHERE; v++) expect(baseAlphas[v]).toBe(1);
    expect(baseColors[0]).toBeCloseTo(1); expect(baseColors[1]).toBeCloseTo(1); expect(baseColors[2]).toBeCloseTo(1);
  });

  it('translates with the camera position', () => {
    const moved = sphericalItem();
    moved.position = new THREE.Vector3(10, 0, 0);
    const { positions } = buildSphereLineGeometryData([moved], 1, opts);
    let cx = 0; for (let i = 0; i < positions.length; i += 3) cx += positions[i];
    expect(cx / (positions.length / 3)).toBeCloseTo(10, 4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/components/viewer3d/sphericalCameraGeometry.test.ts`
Expected: FAIL — cannot resolve `./sphericalCameraGeometry`.

- [ ] **Step 3: Implement the geometry builder**

Create `src/components/viewer3d/sphericalCameraGeometry.ts`:

```ts
import * as THREE from 'three';
import {
  getFrustumBaseColor,
  getFrustumMetricColorScale,
  type CameraFrustumItem,
  type FrustumColorMode,
  type FrustumPsnrMetricSource,
} from './cameraFrustumGeometry';
import type { ImageId } from '../../types/colmap';

/** Longitude arcs (pole-to-pole meridians). */
export const SPHERE_MERIDIANS = 8;
/** Latitude circles, excluding the poles. */
export const SPHERE_PARALLELS = 5;
/** Line segments approximating each circle/arc. */
export const SEGMENTS_PER_CIRCLE = 24;

export const SEGMENTS_PER_SPHERE = (SPHERE_MERIDIANS + SPHERE_PARALLELS) * SEGMENTS_PER_CIRCLE;
export const VERTS_PER_SPHERE = SEGMENTS_PER_SPHERE * 2;
export const FLOATS_PER_SPHERE = SEGMENTS_PER_SPHERE * 6;

// Local unit-sphere point: polar angle theta from +Y pole (0..PI), azimuth phi (0..2PI).
function unitSpherePoint(theta: number, phi: number, out: THREE.Vector3): THREE.Vector3 {
  const s = Math.sin(theta);
  return out.set(s * Math.cos(phi), Math.cos(theta), s * Math.sin(phi));
}

interface SphereGeometryOptions {
  frustumColorMode: FrustumColorMode;
  frustumSingleColor: string;
  imageFrameIndexMap: Map<ImageId, number>;
  splatPsnrByImage?: FrustumPsnrMetricSource;
}

export function buildSphereLineGeometryData(
  items: CameraFrustumItem[],
  cameraScale: number,
  { frustumColorMode, frustumSingleColor, imageFrameIndexMap, splatPsnrByImage }: SphereGeometryOptions
): { positions: Float32Array; baseColors: Float32Array; baseAlphas: Float32Array } {
  const positions = new Float32Array(items.length * FLOATS_PER_SPHERE);
  const baseColors = new Float32Array(items.length * FLOATS_PER_SPHERE);
  const baseAlphas = new Float32Array(items.length * VERTS_PER_SPHERE);
  const color = new THREE.Color();
  const metricColorScale = getFrustumMetricColorScale(
    frustumColorMode,
    items.map((item) => item.image.imageId),
    splatPsnrByImage
  );

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  items.forEach((item, index) => {
    const floatOffset = index * FLOATS_PER_SPHERE;
    const vertOffset = index * VERTS_PER_SPHERE;
    let seg = 0; // segment counter within this sphere

    const writeSegment = (p0: THREE.Vector3, p1: THREE.Vector3) => {
      const o = floatOffset + seg * 6;
      p0.multiplyScalar(cameraScale).applyQuaternion(item.quaternion).add(item.position);
      p1.multiplyScalar(cameraScale).applyQuaternion(item.quaternion).add(item.position);
      positions[o] = p0.x; positions[o + 1] = p0.y; positions[o + 2] = p0.z;
      positions[o + 3] = p1.x; positions[o + 4] = p1.y; positions[o + 5] = p1.z;
      seg++;
    };

    // Meridians: constant phi, theta 0..PI (pole to pole).
    for (let m = 0; m < SPHERE_MERIDIANS; m++) {
      const phi = (m / SPHERE_MERIDIANS) * Math.PI * 2;
      for (let s = 0; s < SEGMENTS_PER_CIRCLE; s++) {
        const t0 = (s / SEGMENTS_PER_CIRCLE) * Math.PI;
        const t1 = ((s + 1) / SEGMENTS_PER_CIRCLE) * Math.PI;
        writeSegment(unitSpherePoint(t0, phi, a), unitSpherePoint(t1, phi, b));
      }
    }
    // Parallels: constant theta, phi 0..2PI (latitude circles, excluding poles).
    for (let p = 0; p < SPHERE_PARALLELS; p++) {
      const theta = ((p + 1) / (SPHERE_PARALLELS + 1)) * Math.PI;
      for (let s = 0; s < SEGMENTS_PER_CIRCLE; s++) {
        const p0 = (s / SEGMENTS_PER_CIRCLE) * Math.PI * 2;
        const p1 = ((s + 1) / SEGMENTS_PER_CIRCLE) * Math.PI * 2;
        writeSegment(unitSpherePoint(theta, p0, a), unitSpherePoint(theta, p1, b));
      }
    }

    color.set(getFrustumBaseColor(
      frustumColorMode, item.cameraIndex, item.image.imageId,
      imageFrameIndexMap, frustumSingleColor, splatPsnrByImage, metricColorScale
    ));
    for (let v = 0; v < VERTS_PER_SPHERE; v++) {
      baseColors[floatOffset + v * 3] = color.r;
      baseColors[floatOffset + v * 3 + 1] = color.g;
      baseColors[floatOffset + v * 3 + 2] = color.b;
      baseAlphas[vertOffset + v] = 1.0;
    }
  });

  return { positions, baseColors, baseAlphas };
}
```

> Note: verify `FrustumColorMode` and `FrustumPsnrMetricSource` are exported from `cameraFrustumGeometry.ts` (they are used as prop types there). If `FrustumColorMode` is only defined and not exported, add `export` to it in that file as part of this task.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/components/viewer3d/sphericalCameraGeometry.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/viewer3d/sphericalCameraGeometry.ts src/components/viewer3d/sphericalCameraGeometry.test.ts
git commit -m "feat(viewer): batched lat/long grid-sphere geometry for spherical cameras" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Camera-family partition helper

**Files:**
- Create: `src/components/viewer3d/cameraFamilyPartition.ts`
- Test: `src/components/viewer3d/cameraFamilyPartition.test.ts`

**Interfaces:**
- Consumes: `isSphericalCameraModel` from `../../utils/cameraModelRegistry`; `CameraFrustumItem`.
- Produces: `partitionFrustumsByFamily(items: CameraFrustumItem[]): { spherical: CameraFrustumItem[]; nonSpherical: CameraFrustumItem[] }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildCamera, buildImage } from '../../test/builders/colmapBuilders';
import { getImageWorldPose } from '../../utils/colmapTransforms';
import { CameraModelId } from '../../types/colmap';
import type { CameraFrustumItem } from './cameraFrustumGeometry';
import { partitionFrustumsByFamily } from './cameraFamilyPartition';

function item(modelId: number, imageId: number): CameraFrustumItem {
  const image = buildImage({ imageId });
  const { position, quaternion } = getImageWorldPose(image);
  return { image, camera: buildCamera({ modelId }), position, quaternion, cameraIndex: 0, numPoints3D: 0 };
}

describe('partitionFrustumsByFamily', () => {
  it('splits spherical from non-spherical, preserving order', () => {
    const items = [
      item(CameraModelId.PINHOLE, 1),
      item(CameraModelId.EQUIRECTANGULAR, 2),
      item(CameraModelId.OPENCV_FISHEYE, 3),
      item(CameraModelId.EQUIRECTANGULAR, 4),
    ];
    const { spherical, nonSpherical } = partitionFrustumsByFamily(items);
    expect(spherical.map((i) => i.image.imageId)).toEqual([2, 4]);
    expect(nonSpherical.map((i) => i.image.imageId)).toEqual([1, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/components/viewer3d/cameraFamilyPartition.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

```ts
import type { CameraFrustumItem } from './cameraFrustumGeometry';
import { isSphericalCameraModel } from '../../utils/cameraModelRegistry';

export function partitionFrustumsByFamily(items: CameraFrustumItem[]): {
  spherical: CameraFrustumItem[];
  nonSpherical: CameraFrustumItem[];
} {
  const spherical: CameraFrustumItem[] = [];
  const nonSpherical: CameraFrustumItem[] = [];
  for (const item of items) {
    (isSphericalCameraModel(item.camera.modelId) ? spherical : nonSpherical).push(item);
  }
  return { spherical, nonSpherical };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/components/viewer3d/cameraFamilyPartition.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/viewer3d/cameraFamilyPartition.ts src/components/viewer3d/cameraFamilyPartition.test.ts
git commit -m "feat(viewer): partition camera frustum items by spherical family" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `SphericalCameraLines` component (grid spheres + selection highlight)

**Files:**
- Create: `src/components/viewer3d/SphericalCameraLines.tsx`

**Interfaces:**
- Consumes: `buildSphereLineGeometryData`, `VERTS_PER_SPHERE` (Task 1); `createFatLineSegmentsObject`, `getFatLineColorArray`, `markFatLineColorsNeedUpdate`, `disposeFatLineSegmentsObject` (`./fatLineSegments`); `CameraFrustumItem`, `getFrustumBaseColor`, `getFrustumMetricColorScale` (`./cameraFrustumGeometry`).
- Produces: `<SphericalCameraLines frustums selectedImageId cameraScale frustumColorMode frustumSingleColor frustumLineWidth selectionColor imageFrameIndexMap splatPsnrByImage />` — grid spheres for all spherical cameras; the selected one recolored to `selectionColor`.

**Design note (deliberate v1 simplification):** unlike `BatchedFrustumLines`, this does NOT do per-frame blink/rainbow/matches animation — grid spheres are static, recolored only when `selectedImageId` changes. That is a bounded first version; richer animation can be added later by mirroring `BatchedFrustumLines`'s `useFrame` block.

- [ ] **Step 1: Write the component**

Read `BatchedFrustumLines.tsx` and `fatLineSegments.ts` for the fat-line lifecycle (create → `useEffect` dispose). Create `src/components/viewer3d/SphericalCameraLines.tsx`:

```tsx
import { useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ImageId } from '../../types/colmap';
import type { CameraFrustumItem, FrustumColorMode, FrustumPsnrMetricSource } from './cameraFrustumGeometry';
import { getFrustumBaseColor, getFrustumMetricColorScale } from './cameraFrustumGeometry';
import { buildSphereLineGeometryData, VERTS_PER_SPHERE, FLOATS_PER_SPHERE } from './sphericalCameraGeometry';
import {
  createFatLineSegmentsObject, disposeFatLineSegmentsObject,
  getFatLineColorArray, markFatLineColorsNeedUpdate,
} from './fatLineSegments';
import { syncMaterialLineWidth } from './threeMaterialMutations';

interface SphericalCameraLinesProps {
  frustums: CameraFrustumItem[];
  selectedImageId: ImageId | null;
  cameraScale: number;
  frustumColorMode: FrustumColorMode;
  frustumSingleColor: string;
  frustumLineWidth: number;
  selectionColor: string;
  imageFrameIndexMap: Map<ImageId, number>;
  splatPsnrByImage: FrustumPsnrMetricSource;
}

export function SphericalCameraLines({
  frustums, selectedImageId, cameraScale, frustumColorMode, frustumSingleColor,
  frustumLineWidth, selectionColor, imageFrameIndexMap, splatPsnrByImage,
}: SphericalCameraLinesProps) {
  const { positions, baseColors, baseAlphas } = useMemo(
    () => buildSphereLineGeometryData(frustums, cameraScale, { frustumColorMode, frustumSingleColor, imageFrameIndexMap, splatPsnrByImage }),
    [frustums, cameraScale, frustumColorMode, frustumSingleColor, imageFrameIndexMap, splatPsnrByImage]
  );

  const fatLines = useMemo(
    () => createFatLineSegmentsObject({
      positions, colors: new Float32Array(baseColors), alphas: new Float32Array(baseAlphas),
      lineWidth: 1, depthWrite: false, depthTest: true, polygonOffset: true,
      polygonOffsetFactor: 1, polygonOffsetUnits: 1, renderOrder: 2,
    }),
    [positions, baseColors, baseAlphas]
  );

  useLayoutEffect(() => { syncMaterialLineWidth(fatLines.material, frustumLineWidth); }, [fatLines, frustumLineWidth]);
  useEffect(() => () => disposeFatLineSegmentsObject(fatLines), [fatLines]);

  // Recolor selected sphere on selection change (no per-frame animation in v1).
  useEffect(() => {
    const colors = getFatLineColorArray(fatLines.geometry);
    if (!colors) return;
    const metricColorScale = getFrustumMetricColorScale(frustumColorMode, frustums.map((f) => f.image.imageId), splatPsnrByImage);
    const c = new THREE.Color();
    frustums.forEach((frustum, index) => {
      const isSelected = frustum.image.imageId === selectedImageId;
      c.set(isSelected ? selectionColor : getFrustumBaseColor(frustumColorMode, frustum.cameraIndex, frustum.image.imageId, imageFrameIndexMap, frustumSingleColor, splatPsnrByImage, metricColorScale));
      const base = index * FLOATS_PER_SPHERE;
      for (let v = 0; v < VERTS_PER_SPHERE; v++) {
        colors[base + v * 3] = c.r; colors[base + v * 3 + 1] = c.g; colors[base + v * 3 + 2] = c.b;
      }
    });
    markFatLineColorsNeedUpdate(fatLines.geometry);
  }, [fatLines, frustums, selectedImageId, selectionColor, frustumColorMode, frustumSingleColor, imageFrameIndexMap, splatPsnrByImage]);

  if (frustums.length === 0) return null;
  return <primitive object={fatLines.object} />;
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run build && npm run lint`
Expected: PASS. (`syncMaterialLineWidth` is exported from `./threeMaterialMutations`, used the same way in `BatchedFrustumLines.tsx`; confirm the import resolves.)

- [ ] **Step 3: Commit**

```bash
git add src/components/viewer3d/SphericalCameraLines.tsx
git commit -m "feat(viewer): SphericalCameraLines grid-sphere renderer" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Spherical hit-spheres (selection) + `Photosphere`

**Files:**
- Create: `src/components/viewer3d/SphericalCameraHitTargets.tsx`
- Create: `src/components/viewer3d/Photosphere.tsx`

**Interfaces:**
- `SphericalCameraHitTargets`: `<... frustums cameraScale onHover onClick onContextMenu onLongPress touchMode />` — one invisible `sphereGeometry` mesh per spherical camera (radius = `cameraScale`) at its pose, wired to the nav handlers (same handler signatures as `BatchedPlaneHitTargets`: `onClick(imageId)`, `onContextMenu(imageId)`, `onHover(id|null)`, `onLongPress(imageId)`).
- `Photosphere`: `<Photosphere position quaternion radius texture side />` — a `SphereGeometry` mesh with `meshBasicMaterial({ map: texture, side })`. `side` defaults to `THREE.FrontSide`.

- [ ] **Step 1: Write `SphericalCameraHitTargets.tsx`**

Read `BatchedPlaneHitTargets.tsx` for the interaction-handler wiring pattern (pointer events → the same nav handlers). Create:

```tsx
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { ImageId } from '../../types/colmap';
import type { CameraFrustumItem } from './cameraFrustumGeometry';

interface Props {
  frustums: CameraFrustumItem[];
  cameraScale: number;
  onHover: (id: ImageId | null) => void;
  onClick: (imageId: ImageId) => void;
  onContextMenu: (imageId: ImageId) => void;
  onLongPress: (imageId: ImageId) => void;
  touchMode: boolean;
}

export function SphericalCameraHitTargets({ frustums, cameraScale, onHover, onClick, onContextMenu }: Props) {
  return (
    <>
      {frustums.map((f) => (
        <mesh
          key={f.image.imageId}
          position={f.position}
          quaternion={f.quaternion}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(f.image.imageId); }}
          onPointerOut={() => onHover(null)}
          onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(f.image.imageId); }}
          onContextMenu={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onContextMenu(f.image.imageId); }}
        >
          <sphereGeometry args={[cameraScale, 16, 12]} />
          <meshBasicMaterial visible={false} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}
```

> `touchMode`/`onLongPress` are accepted for signature parity with the frustum hit targets; wire long-press only if `BatchedPlaneHitTargets` does (mirror its approach). If it uses a shared long-press hook, reuse that hook here rather than reimplementing.

- [ ] **Step 2: Write `Photosphere.tsx`**

```tsx
import * as THREE from 'three';

interface PhotosphereProps {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  radius: number;
  texture: THREE.Texture;
  side?: THREE.Side;
}

export function Photosphere({ position, quaternion, radius, texture, side = THREE.FrontSide }: PhotosphereProps) {
  // radius slightly inside the grid so the grid reads as an outer orientation cage.
  return (
    <mesh position={position} quaternion={quaternion}>
      <sphereGeometry args={[radius * 0.99, 48, 32]} />
      <meshBasicMaterial map={texture} side={side} toneMapped={false} />
    </mesh>
  );
}
```

> Equirect orientation: three.js `SphereGeometry` UVs are lon/lat, so an equirectangular texture maps directly. The `quaternion` applies the COLMAP camera pose. During integration (Task 5) verify against a real dataset that "forward" points correctly; if the panorama is rotated/flipped, adjust with a fixed correction quaternion or `texture.flipY`/`wrapS` here (isolated to this component). This is the spec's known risk.

- [ ] **Step 3: Typecheck + lint + commit**

Run: `npm run build && npm run lint` → PASS.

```bash
git add src/components/viewer3d/SphericalCameraHitTargets.tsx src/components/viewer3d/Photosphere.tsx
git commit -m "feat(viewer): spherical hit-spheres + photosphere components" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Integrate into `CameraFrustums.tsx` (partition, mount, photosphere branch)

**Files:**
- Modify: `src/components/viewer3d/CameraFrustums.tsx`
- Modify: `src/components/viewer3d/CameraFrustumPlaneLayer.tsx` (branch the selected overlay)

**Interfaces:**
- Consumes: Tasks 1–4 exports; the existing `selectedFrustum`, `cameraScale`, nav handlers, and the image→texture loader `FrustumPlane` uses.

- [ ] **Step 1: Partition and route non-spherical to existing components**

In `CameraFrustums.tsx`, after `const frustums = useMemo(...)` (line ~136), add:

```tsx
const { spherical: sphericalFrustums, nonSpherical: pinholeFrustums } = useMemo(
  () => partitionFrustumsByFamily(frustums),
  [frustums]
);
```

Import `partitionFrustumsByFamily` from `./cameraFamilyPartition`, `SphericalCameraLines` from `./SphericalCameraLines`, `SphericalCameraHitTargets` from `./SphericalCameraHitTargets`. Replace the `frustums={frustums}` prop passed to `BatchedFrustumLines`, `BatchedArrowMeshes`, `BatchedPlaneHitTargets`, and `ImagePlaneFrustumPlanes` with `frustums={pinholeFrustums}` (so spherical cameras no longer get frustum wireframes, arrows, hit-planes, or flat image planes). Leave `handleArrowClick`/nav handlers built from the full `frustums` (selection by imageId is family-agnostic).

- [ ] **Step 2: Mount the spherical renderers in every display mode**

Add this fragment inside each of the three returned `<group>`s (arrow, imageplane, frustum), e.g. just before `{selectedCameraPlane}`:

```tsx
<SphericalCameraLines
  frustums={sphericalFrustums}
  selectedImageId={selectedImageId}
  cameraScale={cameraScale}
  frustumColorMode={frustumColorMode}
  frustumSingleColor={frustumSingleColor}
  frustumLineWidth={frustumLineWidth}
  selectionColor={selectionColor}
  imageFrameIndexMap={imageFrameIndexMap}
  splatPsnrByImage={splatPsnrByImage}
/>
<SphericalCameraHitTargets
  frustums={sphericalFrustums}
  cameraScale={cameraScale}
  onHover={setHoveredImageId}
  onClick={handleArrowClick}
  onContextMenu={handleArrowContextMenu}
  onLongPress={openImageDetail}
  touchMode={touchMode}
/>
```

(Define a `const sphericalLayer = (<>...</>)` above the returns and drop `{sphericalLayer}` into each group to avoid duplication.)

- [ ] **Step 3: Branch the selected overlay to the photosphere**

In `CameraFrustumPlaneLayer.tsx`, in `SelectedCameraFrustumPlane`, before the `return <FrustumPlane .../>`, add:

```tsx
if (frustum && isSphericalCameraModel(frustum.camera.modelId)) {
  const texture = /* the loaded texture for frustum.imageFile via the same hook FrustumPlane uses */;
  if (!texture) return null; // grid sphere already shows; photosphere appears once the image loads
  return (
    <Photosphere
      position={frustum.position}
      quaternion={frustum.quaternion}
      radius={cameraScale}
      texture={texture}
    />
  );
}
```

Import `isSphericalCameraModel` from `../../utils/cameraModelRegistry` and `Photosphere` from `./Photosphere`. **Read `FrustumPlane.tsx`** to find the exact texture hook it uses to turn `imageFile` into a `THREE.Texture` (e.g. a `useFrustumPlaneTexture`-style hook + the cache in `useSelectedFrustumImageCacheRefresh`), and call that same hook here — do NOT write a new loader (Global Constraint). If the hook must be called unconditionally (hooks rules), lift the branch so the hook runs, then choose Photosphere vs FrustumPlane in the returned JSX.

- [ ] **Step 4: Verify build + full suite**

Run: `npm run build && npm run test:run && npm run lint`
Expected: PASS. Existing pinhole tests unaffected (they use pinhole cameras; partition routes them unchanged).

- [ ] **Step 5: Manual load check (visual — cannot be unit-tested)**

Run `npm run dev`, load a reconstruction containing an `EQUIRECTANGULAR` camera (+ its image). Confirm: (a) spherical cameras show grid spheres at the right poses; (b) selecting one shows its panorama on the sphere, oriented sensibly; (c) pinhole cameras in the same dataset still render frustums; (d) no flat plane / FOV / undistort hint appears for the spherical camera. Note any orientation correction needed in `Photosphere` (Task 4 Step 2).

- [ ] **Step 6: Commit**

```bash
git add src/components/viewer3d/CameraFrustums.tsx src/components/viewer3d/CameraFrustumPlaneLayer.tsx
git commit -m "feat(viewer): render spherical cameras (grid + selected photosphere) alongside pinhole" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Gate the remaining pinhole-only affordances for spherical

**Files:**
- Modify: `src/components/viewer3d/cameraFrustumViewModel.ts` (`getAutoAdjustedFov`)
- Modify: `src/components/viewer3d/FrustumPlaneHoverCard.tsx:70,84`
- Test: `src/components/viewer3d/cameraFrustumViewModel.test.ts` (or wherever `getAutoAdjustedFov` is tested)

**Interfaces:** Consumes `isSphericalCameraModel` / `cameraModelHasPinholeIntrinsics`.

- [ ] **Step 1: Fly-to fit for spherical — failing test**

Add a test asserting that `getAutoAdjustedFov` (read the function first for its exact signature) returns a sensible FOV framing a sphere of radius `cameraScale` for a spherical camera, instead of using the pinhole `width/fx` plane width (which is meaningless — `fx=1`). If `getAutoAdjustedFov` takes the camera/frustum, branch on `isSphericalCameraModel`: for spherical, fit the FOV to the sphere's projected radius at the fly-to distance. Write the concrete assertion against the function's real return shape.

- [ ] **Step 2: Implement the spherical branch in `getAutoAdjustedFov`**, run the test to green.

- [ ] **Step 3: Suppress FOV/undistort hover hints for spherical**

In `FrustumPlaneHoverCard.tsx`, the hints at lines ~70 ("Scroll: FOV", gated on `cameraProjection === 'perspective'`) and ~84 ("(U) undistort") must also be suppressed when the hovered camera is spherical. Add an `isSpherical` boolean prop (computed by the caller via `isSphericalCameraModel(camera.modelId)`) and `&& !isSpherical` to both hint conditions. Update the hover-card test (`FrustumPlaneHoverCard.test.tsx`) with a case asserting a spherical camera shows neither hint.

- [ ] **Step 4: Full suite + build + lint + commit**

```bash
git add src/components/viewer3d/cameraFrustumViewModel.ts src/components/viewer3d/FrustumPlaneHoverCard.tsx src/components/viewer3d/*.test.ts*
git commit -m "feat(viewer): fit fly-to + hover hints for spherical cameras" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Exclude spherical cameras from the pinhole splat-PSNR path

**Files:**
- Modify: `src/splat/webgpu/psnrSplatSession.ts` (`assertPinholeCamera` already exists) and/or `src/components/viewer3d/splatPsnrMetric.ts` and `SplatPsnrEvaluator.tsx`
- Test: alongside the existing PSNR tests

**Interfaces:** Consumes `cameraModelHasPinholeIntrinsics` / `isSphericalCameraModel`.

- [ ] **Step 1: Failing test** — assert the PSNR evaluation **skips** spherical cameras (they can't be rendered by the pinhole splat pipeline) rather than feeding them `fx=1`. Read `SplatPsnrEvaluator.tsx` / `splatPsnrMetric.ts` to find where cameras are iterated for the metric; write a test that a reconstruction with a spherical camera yields no PSNR entry for it (and does not throw). `assertPinholeCamera` already gates a single-camera path — extend the iteration to filter spherical out upstream.

- [ ] **Step 2: Implement the filter**, run to green.

- [ ] **Step 3: Full suite + build + lint + commit**

```bash
git commit -m "feat(psnr): exclude spherical cameras from the pinhole splat-PSNR metric" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Guard the remaining ungated `getCameraIntrinsics` consumers

**Files:**
- Modify: `src/components/viewer3d/UndistortedImageMaterial.tsx`, `src/components/viewer3d/cameraFrames.ts` (if it calls `getCameraIntrinsics`), `src/components/modals/imageDetailCameraPoseViewModel.ts`
- Test: the view-model test (`imageDetailCameraPoseViewModel` is pure/testable)

**Interfaces:** Consumes `cameraModelHasPinholeIntrinsics`.

- [ ] **Step 1: Failing test (image-detail view model)** — assert that for a spherical camera, `imageDetailCameraPoseViewModel` reports intrinsics as "N/A"/omitted (not `fx=1`). Read the view model to see its output shape; write the concrete assertion.

- [ ] **Step 2: Implement guards** — in each consumer, short-circuit when `!cameraModelHasPinholeIntrinsics(camera.modelId)`: `UndistortedImageMaterial` is only reached for non-spherical after Task 5 (spherical never renders a flat plane), but add a defensive early return / skip; `imageDetailCameraPoseViewModel` shows "N/A" for fx/fy/cx/cy; `cameraFrames` skips intrinsic-dependent math for spherical. Run tests to green.

- [ ] **Step 3: Full suite + build + lint + commit**

```bash
git commit -m "fix(viewer): guard getCameraIntrinsics consumers against spherical cameras" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: End-to-end mixed-dataset load test

**Files:**
- Create/extend: an integration test near the parser/reconstruction load tests.

- [ ] **Step 1: Write the test** — build a `cameras.txt` (or reconstruction fixture) with ONE `EQUIRECTANGULAR` camera and ONE `PINHOLE` camera + two images. Load it through the reconstruction pipeline and assert: both cameras parse; `partitionFrustumsByFamily(buildCameraFrustumItems(...))` yields one spherical + one non-spherical; the spherical camera is excluded from PSNR; `getFrustumPlaneSize` is zero-size for the spherical and non-zero for the pinhole. (This locks the integration seams that individual unit tests cover separately.)

- [ ] **Step 2: Run to green; build + lint; commit**

```bash
git commit -m "test(viewer): end-to-end mixed pinhole+spherical reconstruction load" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** grid sphere (T1, T3), photosphere selected-only (T4, T5), mixed-dataset routing (T2, T5, T9), gating flat-plane (T5 routing) + FOV/undistort hints + fly-to (T6), PSNR exclusion (T7), ungated consumers (T8), tests incl. e2e (T1/T2/T6/T7/T8/T9), immersive seam (`Photosphere.side`, T4). ✔
- **Placeholder scan:** Tasks 6–8 intentionally instruct the implementer to *read the target function first* and write the concrete assertion against its real shape, because those functions' exact signatures weren't captured during planning — flagged explicitly rather than inventing a signature. All *new* code (T1–T5) is complete. The photosphere texture-hook wiring (T5 Step 3) names the exact reuse requirement and where to find it.
- **Type consistency:** `CameraFrustumItem`, `FrustumColorMode`, `FrustumPsnrMetricSource`, `buildSphereLineGeometryData`, `VERTS_PER_SPHERE`/`FLOATS_PER_SPHERE`, `partitionFrustumsByFamily`, `Photosphere`, `SphericalCameraLines`, `SphericalCameraHitTargets` names are used consistently across tasks.
- **Known risk:** equirect orientation (T4/T5) — isolated to `Photosphere`, verified at the T5 manual check.

## Notes for execution
- Tasks 1, 2 are pure + fully TDD. Task 9 is pure/integration. Tasks 3–5 are R3F components (build/lint + manual load check; the repo's render-test harness in `*.render.test.tsx` may be used for mount smoke-tests). Tasks 6–8 mix small pure guards (testable) with component edits — the implementer reads the target before writing the assertion.
- Cheapest-tier implementers for T1/T2 (complete code given). Standard tier for T3–T8 (component integration + reading targets). 
