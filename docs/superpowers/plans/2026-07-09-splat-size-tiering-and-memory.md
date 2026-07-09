# Splat Size Tiering + Single-Copy Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "warn, then let the phone crash" splat picker UX with a three-tier gate (ok / hint / disabled-with-reason) driven by the *true* limit — splat count — and raise the touch-device ceiling from ~300 MB to ~450 MB by eliminating the loader's duplicate byte copies for oversized remote splats.

**Architecture:** Phase 1 (Tasks 1–4) captures the exact splat count from the PLY header that discovery *already* range-reads, threads it through candidate → catalog → source, and gates picker rows on an estimated-splat-count policy (bytes ÷ per-format stride when the count is unknown). Phase 2 (Tasks 5–7) removes the duplicate copies on the lazy remote path: single-pre-allocated-buffer download, a decode entry that takes bytes directly (the worker already receives a transferred ArrayBuffer), and byte-less activation for oversized splats on touch (the source model already supports re-fetchable byte-less sources) — then raises the ceiling constant. Phase 3 (Task 8) gates, smokes, and releases v0.9.5.

**Phases are separable:** Phase 1 alone fully fixes the confusing-crash UX at the conservative ceiling; Phase 2 is the ceiling raise and can be deferred or dropped if Task 7's consumer audit finds a blocker. Task 7 must not land without Tasks 5–6.

**Tech Stack:** React 18 + TypeScript, Zustand, React Three Fiber, gs-toolbox (splat decode, in a Worker via transferred ArrayBuffer), vitest/jsdom, hand-written CSS.

## Global Constraints

- **No Tailwind.** Every className must exist as a hand-written rule in `src/index.css`; bracket utilities are silent no-ops. New disabled-row styling must check its classes exist (like `text-ds-warning` at index.css:960; `disabled:` prefixes DO NOT work — use a conditional class + the `disabled` attribute).
- **Store boundary:** components access stores only via `*StoreFacade` files; hooks (e.g. `useIsTouchDevice`) are allowed in components.
- **TDD:** failing test first for every behavior change; RED evidence in the report.
- **Full gate before push:** `npm run test:run` (baseline 2,961 tests / 459 files), `npm run lint`, `npm run build`.
- **Commit style:** conventional commits (`fix(viewer): …`), each message ends with a blank line then `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Recompute every plan constant and verify every named symbol** against the repo before use; report discrepancies instead of silently deviating.
- Zustand test gotcha: spied store actions leak across tests — reset with `useXStore.setState(useXStore.getInitialState(), true)` in `afterEach`.
- Existing values this plan builds on (verify): `SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH = 50_000_000` (`src/hooks/urlLoaderPolicy.ts`), `SPLAT_FILE_EXTENSIONS = ['.spz', '.ply']` (`src/utils/splatFilePolicy.ts`), classification range probe = 64 KiB (`SPLAT_HEADER_RANGE_BYTES`, `src/hooks/urlLoaderManifestFetch.ts`), decode worker transfer at `src/splat/gaussianCloudLoader.ts:284` (`worker.postMessage(request, [buffer])`), decode cache `WeakMap<File, Promise<LoadedGaussianCloud>>` at `gaussianCloudLoader.ts:49`.
- The bigsur reference file (ground truth for numbers): 10,000,000 splats × 26 float32 props (104 B) + 634 B header = 1,040,000,634 bytes.

## Explicit Non-Goals

- Desktop behavior changes (retention, budgets, picker) — desktop stays byte-retaining and un-gated.
- SPZ header parsing for exact counts (SPZ is gzip-wrapped; counts come from the bytes÷stride estimate).
- Streaming/incremental decode inside gs-toolbox.
- SOG support.

---

### Task 1: PLY header vertex-count helper

**Files:**
- Modify: `src/parsers/plyPointCloud.ts`
- Modify: `src/parsers/index.ts` (barrel export)
- Test: `src/parsers/plyPointCloud.test.ts` (extend; if this exact file doesn't exist, add the describe block to the test file that already covers `classifyPlyHeaderText` — find it with `grep -rl classifyPlyHeaderText src --include='*.test.ts'`)

**Interfaces:**
- Produces: `getPlyHeaderVertexCount(text: string): number | null` — the vertex-element count from a PLY header text, or null when the text isn't a parseable PLY header / has no vertex element / a non-finite count. Consumed by Task 2's classifier.
- Consumes: the file's existing internal `parsePlyHeader(text)` and `getVertexElement(header)` (used at `plyPointCloud.ts:70-76`; verify exact local names and the count property — the element parsed from `element vertex N` — before writing code, and adapt mechanically if they differ).

- [ ] **Step 1: Write the failing test**

```ts
describe('getPlyHeaderVertexCount', () => {
  const header = [
    'ply',
    'format binary_little_endian 1.0',
    'element vertex 10000000',
    'property float x',
    'property float y',
    'property float z',
    'end_header',
    '',
  ].join('\n');

  it('reads the vertex element count from a PLY header', () => {
    expect(getPlyHeaderVertexCount(header)).toBe(10_000_000);
  });

  it('returns null for non-PLY text and headers without a vertex element', () => {
    expect(getPlyHeaderVertexCount('not a ply')).toBeNull();
    expect(getPlyHeaderVertexCount('ply\nformat ascii 1.0\nelement face 3\nend_header\n')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parsers/plyPointCloud.test.ts` (or the located file)
Expected: FAIL — `getPlyHeaderVertexCount` is not exported.

- [ ] **Step 3: Implement** (in `plyPointCloud.ts`, beside `classifyPlyHeaderText`)

```ts
/**
 * Vertex count from a PLY header (the `element vertex N` line). Used to gate
 * splat loading on the GPU-relevant number rather than file bytes. Null when
 * the text is not a parseable PLY header or has no vertex element.
 */
export function getPlyHeaderVertexCount(text: string): number | null {
  try {
    const vertex = getVertexElement(parsePlyHeader(text));
    return Number.isFinite(vertex.count) && vertex.count >= 0 ? vertex.count : null;
  } catch {
    return null;
  }
}
```

Export it from `src/parsers/index.ts` next to `classifyPlyHeaderText`.

- [ ] **Step 4: Run test to verify pass**

Run: same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parsers/plyPointCloud.ts src/parsers/index.ts <test file>
git commit -m "feat(parsers): expose PLY header vertex count for splat gating"
```

---

### Task 2: Thread the splat count through discovery → catalog → sources

The HF classification probe already range-reads 64 KiB of every `.ply` candidate and parses the header text — capture the count there for free and carry it to the picker's data model.

**Files:**
- Modify: `src/hooks/urlLoaderManifestFetch.ts` (classifier + threading)
- Modify: `src/hooks/urlLoaderPolicy.ts` (`RemoteSplatCandidate`)
- Modify: `src/hooks/useUrlLoader.ts` (catalog holder shape)
- Modify: `src/store/reconstructionStore.ts` (`mergeRemoteSplatCatalog` action signature)
- Modify: `src/utils/splatFileSourcePolicy.ts` (`mergeRemoteSplatCatalog` util)
- Modify: `src/types/colmap.ts` (`SplatFileSource`)
- Tests: `src/hooks/urlLoaderManifestFetch.test.ts`, `src/utils/splatFileSourcePolicy.test.ts` (extend both)

**Interfaces:**
- `RemoteSplatCandidate` gains `splatCount?: number | null` (absent/null = unknown).
- `ClassifySplatUrl` return type changes from `Promise<boolean>` to `Promise<SplatUrlClassification>` where `interface SplatUrlClassification { isSplat: boolean; splatCount: number | null }`. Non-PLY extensions → `{ isSplat: true, splatCount: null }`. Classification errors keep the candidate (`isSplat: true, splatCount: null`) exactly as today's error path keeps it.
- `SplatFileSource` (types/colmap.ts) gains `splatCount?: number | null`; the merge util copies it from the catalog entry (preserving an existing source's count when the incoming entry lacks one).
- `useUrlLoader`'s `catalogHolder` maps candidates to `{ path, size, splatCount: candidate.splatCount ?? null }` and the store action accepts `ReadonlyArray<{ path: string; size: number; splatCount?: number | null }>`.

- [ ] **Step 1: Write the failing tests**

Append to `urlLoaderManifestFetch.test.ts` (helpers `jsonResponse`/`textResponse` exist at the top of the file):

```ts
  it('captures the PLY vertex count during splat classification', async () => {
    const plyHeader = [
      'ply', 'format binary_little_endian 1.0', 'element vertex 10000000',
      'property float x', 'property float y', 'property float z',
      'property float f_dc_0', 'property float f_dc_1', 'property float f_dc_2',
      'property float opacity', 'property float scale_0', 'property float scale_1',
      'property float scale_2', 'property float rot_0', 'property float rot_1',
      'property float rot_2', 'property float rot_3', 'end_header', '',
    ].join('\n');
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.headers && 'Range' in (init.headers as Record<string, string>)) {
        return new Response(plyHeader, { status: 206 });
      }
      return jsonResponse([
        { type: 'file', path: 'splats/huge.ply', size: 1_040_000_634 },
        { type: 'file', path: 'splats/tiles.spz', size: 40_000_000 },
      ]);
    });

    const candidates = await discoverHuggingFaceSplatPaths(
      'https://huggingface.co/datasets/Acme/Scene/resolve/main',
      { fetchImpl }
    );

    expect(candidates).toEqual([
      { path: 'splats/tiles.spz', size: 40_000_000, splatCount: null },
      { path: 'splats/huge.ply', size: 1_040_000_634, splatCount: 10_000_000 },
    ]);
  });
```

(Expected order per the existing preference sort: `.spz` ranks above `.ply`. The classification for the header above must be `gaussian-splat` — it carries `f_dc_*`/`opacity`/`scale_*`/`rot_*`; verify against `classifyPlyHeaderText` and enrich the property list if the classifier needs more.)

Append to `splatFileSourcePolicy.test.ts`:

```ts
  it('carries splat counts from the remote catalog into sources', () => {
    const loadedFiles = { imageFiles: new Map(), hasMasks: false } as unknown as LoadedFiles;
    const merged = mergeRemoteSplatCatalog(loadedFiles, [
      { path: 'splats/huge.ply', size: 1_040_000_634, splatCount: 10_000_000 },
      { path: 'splats/tiles.spz', size: 40_000_000 },
    ], 'https://x/ds');

    expect(merged.splatFileSources?.map((s) => s.splatCount ?? null)).toEqual([10_000_000, null]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/urlLoaderManifestFetch.test.ts src/utils/splatFileSourcePolicy.test.ts`
Expected: FAIL — candidates carry no `splatCount`; merge drops it.

- [ ] **Step 3: Implement**

In `urlLoaderManifestFetch.ts`:

```ts
export interface SplatUrlClassification {
  isSplat: boolean;
  splatCount: number | null;
}

export type ClassifySplatUrl = (url: string) => Promise<SplatUrlClassification>;

async function defaultClassifySplatUrl(url: string, fetchImpl: FetchUrl): Promise<SplatUrlClassification> {
  const pathname = url.split('?')[0].toLowerCase();
  if (!pathname.endsWith('.ply')) {
    return { isSplat: true, splatCount: null };
  }
  try {
    const response = await fetchImpl(url, { headers: { Range: `bytes=0-${SPLAT_HEADER_RANGE_BYTES - 1}` } });
    if (!response.ok) {
      return { isSplat: true, splatCount: null };
    }
    const headerText = await readBoundedResponseText(response, SPLAT_HEADER_RANGE_BYTES);
    return {
      isSplat: classifyPlyHeaderText(headerText) === 'gaussian-splat',
      splatCount: getPlyHeaderVertexCount(headerText),
    };
  } catch {
    return { isSplat: true, splatCount: null };
  }
}
```

In `discoverHuggingFaceSplatPaths`, the classified mapping becomes:

```ts
  const classified = await mapWithConcurrency(candidates, SPLAT_CLASSIFY_CONCURRENCY, async (candidate) => ({
    candidate,
    classification: await classify(joinManifestUrlPath(baseUrl, candidate.path)),
  }));
  return classified
    .filter((entry) => entry.classification.isSplat)
    .map((entry) => ({ ...entry.candidate, splatCount: entry.classification.splatCount }));
```

Import `getPlyHeaderVertexCount` from `../parsers`. Add `splatCount?: number | null` to `RemoteSplatCandidate` (urlLoaderPolicy.ts). Update any test that injects a `classifySplatUrl` returning a boolean to return the object form (search `classifySplatUrl` in the test files). In `useUrlLoader.ts`, the catalog holder mapping becomes `{ path: candidate.path, size: candidate.size, splatCount: candidate.splatCount ?? null }` (widen the holder's type accordingly). In `types/colmap.ts`, add `splatCount?: number | null;` to `SplatFileSource`. In `splatFileSourcePolicy.ts`'s `mergeRemoteSplatCatalog`, the catalog parameter becomes `ReadonlyArray<{ path: string; size: number; splatCount?: number | null }>` and the built source adds `splatCount: entry.splatCount ?? existing?.splatCount ?? null`. Mirror the widened catalog type on the store action `mergeRemoteSplatCatalog` (reconstructionStore.ts).

- [ ] **Step 4: Run the touched suites**

Run: `npx vitest run src/hooks/urlLoaderManifestFetch.test.ts src/utils/splatFileSourcePolicy.test.ts src/hooks/useUrlLoader.test.ts src/store/reconstructionStore.test.ts && npx tsc -b --force`
Expected: PASS / no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/urlLoaderManifestFetch.ts src/hooks/urlLoaderManifestFetch.test.ts src/hooks/urlLoaderPolicy.ts src/hooks/useUrlLoader.ts src/store/reconstructionStore.ts src/utils/splatFileSourcePolicy.ts src/utils/splatFileSourcePolicy.test.ts src/types/colmap.ts
git commit -m "feat(loader): capture PLY splat counts during discovery and carry them to splat sources"
```

---

### Task 3: Device tier policy (`getSplatDeviceTier`)

**Files:**
- Modify: `src/hooks/urlLoaderPolicy.ts` (single home for splat thresholds, beside the auto-load budgets)
- Test: `src/hooks/urlLoaderPolicy.test.ts` (extend)

**Interfaces:**
- Produces (consumed by Task 4's picker and Task 7's activation path):
  ```ts
  export const SPLAT_BYTES_PER_SPLAT_ESTIMATE = { '.ply': 104, '.spz': 16 } as const;
  export const TOUCH_SPLAT_DISABLE_MIN_SPLATS = 3_000_000; // Task 7 raises to 4_000_000

  export function getEstimatedSplatCount(source: { path: string; size?: number; splatCount?: number | null }): number | null;
  // exact count when known; else size ÷ per-extension stride (via getSplatFileExtension); null when size missing/0/unknown extension

  export type SplatDeviceTier = 'ok' | 'hint' | 'disabled';
  export function getSplatDeviceTier(
    source: { path: string; size?: number; splatCount?: number | null },
    options: { isTouchDevice: boolean }
  ): SplatDeviceTier;
  // Desktop: always 'ok'. Touch: 'disabled' when estimated count > TOUCH_SPLAT_DISABLE_MIN_SPLATS;
  // else 'hint' when size > SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH; else 'ok'.
  // Unknown estimate (null) can never disable — fall through to the hint/ok byte rules.
  ```
- Consumes: `getSplatFileExtension` from `../utils/splatFilePolicy`, `SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH` (same file).

- [ ] **Step 1: Write the failing tests**

```ts
describe('getSplatDeviceTier', () => {
  it('is always ok on desktop hardware', () => {
    expect(getSplatDeviceTier({ path: 'huge.ply', size: 1_040_000_634, splatCount: 10_000_000 }, { isTouchDevice: false })).toBe('ok');
  });

  it('disables on touch when the known splat count exceeds the ceiling', () => {
    expect(getSplatDeviceTier({ path: 'huge.ply', size: 1_040_000_634, splatCount: 10_000_000 }, { isTouchDevice: true })).toBe('disabled');
    expect(getSplatDeviceTier({ path: 'ok.ply', size: 200_000_000, splatCount: 1_900_000 }, { isTouchDevice: true })).toBe('hint');
  });

  it('estimates the count from bytes per format when unknown', () => {
    // 1.04 GB PLY / 104 B ≈ 10M -> disabled; 64 MB spz / 16 B = 4M -> disabled; 40 MB spz = 2.5M -> hint (over 50 MB? no: 40 MB <= budget -> ok)
    expect(getEstimatedSplatCount({ path: 'huge.ply', size: 1_040_000_634 })).toBe(10_000_006);
    expect(getSplatDeviceTier({ path: 'huge.ply', size: 1_040_000_634 }, { isTouchDevice: true })).toBe('disabled');
    expect(getSplatDeviceTier({ path: 'dense.spz', size: 64_000_000 }, { isTouchDevice: true })).toBe('disabled');
    expect(getSplatDeviceTier({ path: 'tiles.spz', size: 40_000_000 }, { isTouchDevice: true })).toBe('ok');
    expect(getSplatDeviceTier({ path: 'mid.spz', size: 55_000_000, splatCount: 2_000_000 }, { isTouchDevice: true })).toBe('hint');
  });

  it('never disables on an unknown estimate', () => {
    expect(getSplatDeviceTier({ path: 'mystery.ply', size: 0 }, { isTouchDevice: true })).toBe('ok');
    expect(getSplatDeviceTier({ path: 'mystery.ply' }, { isTouchDevice: true })).toBe('ok');
  });
});
```

(Recompute the expectations: `Math.floor(1_040_000_634 / 104) = 10_000_006`; `64_000_000 / 16 = 4_000_000 > 3_000_000` → disabled; `40_000_000 / 16 = 2_500_000 ≤ ceiling` and `40 MB ≤ 50 MB` budget → ok; known 2M ≤ ceiling but 55 MB > 50 MB → hint.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/hooks/urlLoaderPolicy.test.ts`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement** (beside `getSplatAutoLoadDecision`)

```ts
/**
 * Bytes-per-splat by format, for estimating the GPU-relevant splat count when
 * the exact header count is unknown. PLY: SH1 gaussian layout (26 float32 =
 * 104 B; denser SH3 files over-estimate the count, which only makes the gate
 * stricter). SPZ: compressed, ~16 B/splat.
 */
export const SPLAT_BYTES_PER_SPLAT_ESTIMATE: Record<SplatFileExtension, number> = {
  '.ply': 104,
  '.spz': 16,
};

/**
 * Phone GPUs in a browser tab render roughly 1-3M gaussians; above ~3M the
 * outcome is a context loss or OOM kill, so the picker disables the row
 * instead of offering a crash. Task 7's byte-less loader raises this to 4M.
 */
export const TOUCH_SPLAT_DISABLE_MIN_SPLATS = 3_000_000;

export function getEstimatedSplatCount(
  source: { path: string; size?: number; splatCount?: number | null }
): number | null {
  if (typeof source.splatCount === 'number' && source.splatCount > 0) {
    return source.splatCount;
  }
  const extension = getSplatFileExtension(source.path);
  if (!extension || !source.size || source.size <= 0) {
    return null;
  }
  return Math.floor(source.size / SPLAT_BYTES_PER_SPLAT_ESTIMATE[extension]);
}

export type SplatDeviceTier = 'ok' | 'hint' | 'disabled';

export function getSplatDeviceTier(
  source: { path: string; size?: number; splatCount?: number | null },
  { isTouchDevice }: { isTouchDevice: boolean }
): SplatDeviceTier {
  if (!isTouchDevice) return 'ok';

  const estimated = getEstimatedSplatCount(source);
  if (estimated !== null && estimated > TOUCH_SPLAT_DISABLE_MIN_SPLATS) {
    return 'disabled';
  }
  return (source.size ?? 0) > SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH ? 'hint' : 'ok';
}
```

Import `getSplatFileExtension, type SplatFileExtension` from `../utils/splatFilePolicy`.

- [ ] **Step 4: Run to verify pass**, then **Step 5: Commit**

```bash
git add src/hooks/urlLoaderPolicy.ts src/hooks/urlLoaderPolicy.test.ts
git commit -m "feat(loader): splat device-tier policy gated on estimated splat count"
```

---

### Task 4: Disabled tier in the splat picker

**Files:**
- Modify: `src/components/modals/splatPickerViewModel.ts` (+ test)
- Modify: `src/components/modals/SplatPickerModal.tsx`

**Interfaces:**
- `SplatPickerItem` becomes `{ id, name, sizeLabel, tier: SplatDeviceTier, warning: string | null, disabledReason: string | null }`. The `warning` field keeps today's string for the hint tier; `disabledReason` is `` `Too large for this device (${sizeLabel}) - open on a desktop to view` `` (when `sizeLabel` is empty, use `'Too large for this device - open on a desktop to view'`).
- `getSplatPickerItems(sources, { isTouchDevice })` replaces the previous `{ warnAboveBytes }` option: the view model now calls `getSplatDeviceTier` per source. The modal already reads `useIsTouchDevice()` (landed in the v0.9.4 fix wave) — it passes that through and drops its direct `SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH` import.
- Disabled rows render as a `<button disabled>` with no `onClick` firing, dimmed classes, and the reason as a sublabel. New class constants (verify each utility exists in `src/index.css`; `opacity-50`/`cursor-not-allowed` — if either is missing, add the one-line rule next to the existing utilities and note it in the report):
  ```ts
  export const SPLAT_PICKER_DISABLED_ROW_CLASS =
    'flex flex-col items-start gap-1 px-3 py-2 rounded text-ds-muted text-sm opacity-50 cursor-not-allowed';
  export const SPLAT_PICKER_DISABLED_REASON_CLASS = 'text-ds-muted text-xs';
  ```

- [ ] **Step 1: Write the failing tests** (rework the two existing warning tests to the new option shape, and add:)

```ts
describe('splat picker device tiers', () => {
  const sources = [
    { id: 'a', path: 'splats/huge.ply', url: 'u', size: 1_040_000_634, splatCount: 10_000_000 },
    { id: 'b', path: 'splats/mid.spz', url: 'u', size: 55_000_000, splatCount: 2_000_000 },
    { id: 'c', path: 'splats/small.spz', url: 'u', size: 40_000_000, splatCount: 1_000_000 },
  ];

  it('maps sources to ok/hint/disabled tiers on touch hardware', () => {
    const items = getSplatPickerItems(sources, { isTouchDevice: true });
    expect(items.map((i) => i.tier)).toEqual(['disabled', 'hint', 'ok']);
    expect(items[0].disabledReason).toBe('Too large for this device (1.0 GB) - open on a desktop to view');
    expect(items[1].warning).toBe("may exceed this device's memory");
    expect(items[2].warning).toBeNull();
  });

  it('leaves everything ok on desktop', () => {
    for (const item of getSplatPickerItems(sources, { isTouchDevice: false })) {
      expect(item.tier).toBe('ok');
      expect(item.disabledReason).toBeNull();
    }
  });
});
```

Also extend `SplatPickerModal.test.tsx` (exists since the v0.9.4 fix wave): with a mocked `useIsTouchDevice` returning true and a 10M-splat source, assert the row button has the `disabled` attribute and that clicking it does NOT call `selectSplatSource`.

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/components/modals/splatPickerViewModel.test.ts src/components/modals/SplatPickerModal.test.tsx`

- [ ] **Step 3: Implement.** View model:

```ts
import { getSplatDeviceTier, type SplatDeviceTier } from '../../hooks/urlLoaderPolicy';

export function getSplatPickerItems(
  sources: readonly SplatFileSource[],
  options: { isTouchDevice: boolean }
): SplatPickerItem[] {
  return sources.map((source) => {
    const sizeLabel = formatSplatSize(source.size);
    const tier = getSplatDeviceTier(source, options);
    return {
      id: source.id,
      name: source.path.split('/').pop() || source.path,
      sizeLabel,
      tier,
      warning: tier === 'hint' ? "may exceed this device's memory" : null,
      disabledReason: tier === 'disabled'
        ? (sizeLabel
          ? `Too large for this device (${sizeLabel}) - open on a desktop to view`
          : 'Too large for this device - open on a desktop to view')
        : null,
    };
  });
}
```

Modal row rendering:

```tsx
        {items.map((item) => (
          <button
            key={item.id}
            onClick={item.tier === 'disabled' ? undefined : () => handleSelect(item.id)}
            disabled={item.tier === 'disabled'}
            className={item.tier === 'disabled' ? SPLAT_PICKER_DISABLED_ROW_CLASS : SPLAT_PICKER_ROW_CLASS}
          >
            <span className="truncate">{item.name}</span>
            {item.sizeLabel && <span className={SPLAT_PICKER_SIZE_CLASS}>{item.sizeLabel}</span>}
            {item.warning && <span className={SPLAT_PICKER_WARNING_CLASS}>{item.warning}</span>}
            {item.disabledReason && <span className={SPLAT_PICKER_DISABLED_REASON_CLASS}>{item.disabledReason}</span>}
          </button>
        ))}
```

Modal call site: `getSplatPickerItems(splatFileSources, { isTouchDevice })`.

- [ ] **Step 4: Run the modal + view-model suites and `npx tsc -b --force`**, then **Step 5: Commit**

```bash
git add src/components/modals/splatPickerViewModel.ts src/components/modals/splatPickerViewModel.test.ts src/components/modals/SplatPickerModal.tsx src/components/modals/SplatPickerModal.test.tsx src/index.css
git commit -m "feat(viewer): disable crash-certain splat rows on touch with an explicit reason"
```

---

### Task 5: Single-buffer remote splat download

Today `fetchRemoteSplatFile` accumulates a chunk array (≈1× file in JS heap) and then builds a Blob (second copy). Replace the lazy-path download with one pre-allocated buffer.

**Files:**
- Modify: `src/utils/urlUtils.ts`
- Test: `src/utils/urlUtils.test.ts` (extend; locate the existing describe blocks for `readResponseToBlob` / `fetchRemoteSplatFile` and match their fixture style)

**Interfaces:**
- Produces: `fetchRemoteSplatBytes(url: string, onProgress?: DownloadProgressCallback): Promise<{ bytes: Uint8Array; name: string }>` — consumed by Task 7.
  - Content-Length known and body streamable: allocate `new Uint8Array(total)` once and fill it from the reader; if the stream yields MORE than `total` (e.g. mis-reported length), fall back transparently to chunk accumulation for the remainder and consolidate once at the end; if it yields less, return a `subarray(0, received)`.
  - No Content-Length or no stream: chunk-accumulate and consolidate once (single final copy — still better than blob + arrayBuffer).
  - Non-OK response: throw `new Error(\`Failed to fetch splat (${response.status})\`)` (same message contract as `fetchRemoteSplatFile`).
  - Progress callback: `(loaded, total)` as bytes arrive, same as the blob path.
- `fetchRemoteSplatFile` remains for the desktop retention path, unchanged.

- [ ] **Step 1: Write the failing tests**

```ts
describe('fetchRemoteSplatBytes', () => {
  function streamOf(chunks: Uint8Array[], headers: Record<string, string> = {}) {
    return {
      ok: true,
      status: 200,
      headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      }),
    } as unknown as Response;
  }

  it('downloads into a single pre-allocated buffer when Content-Length is known', async () => {
    const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])];
    vi.stubGlobal('fetch', vi.fn(async () => streamOf(chunks, { 'content-length': '5' })));
    const progress: Array<[number, number]> = [];

    const result = await fetchRemoteSplatBytes('https://x/splats/scene.spz', (l, t) => progress.push([l, t]));

    expect(Array.from(result.bytes)).toEqual([1, 2, 3, 4, 5]);
    expect(result.name).toBe('scene.spz');
    expect(progress.at(-1)).toEqual([5, 5]);
  });

  it('consolidates once when Content-Length is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamOf([new Uint8Array([9, 8])], {})));
    const result = await fetchRemoteSplatBytes('https://x/a.ply');
    expect(Array.from(result.bytes)).toEqual([9, 8]);
  });

  it('survives a lying Content-Length that undercounts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => streamOf([new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])], { 'content-length': '3' })));
    const result = await fetchRemoteSplatBytes('https://x/a.ply');
    expect(Array.from(result.bytes)).toEqual([1, 2, 3, 4, 5]);
  });

  it('throws the standard message on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(fetchRemoteSplatBytes('https://x/a.ply')).rejects.toThrow('Failed to fetch splat (404)');
  });
});
```

(Add `vi.unstubAllGlobals()` to the file's `afterEach` if not already there.)

- [ ] **Step 2: RED**, **Step 3: implement in `urlUtils.ts`** (reuse `parseSafeIntegerString` and `getFilenameFromUrl`; keep the implementation a plain sequential reader loop — no helpers beyond one `consolidate(chunks, total)` local), **Step 4: GREEN + full urlUtils suite**, **Step 5: Commit**

```bash
git add src/utils/urlUtils.ts src/utils/urlUtils.test.ts
git commit -m "feat(loader): single-buffer remote splat download"
```

---

### Task 6: Decode-from-bytes entry + cache seeding

The decode pipeline is `File → readFileAsArrayBuffer → worker (transferred buffer)`. Split it so bytes can enter directly, and let a caller pre-seed the `WeakMap<File, Promise<LoadedGaussianCloud>>` cache so the renderer's later `loadGaussianCloudFromFile(file)` never re-reads bytes.

**Files:**
- Modify: `src/splat/gaussianCloudLoader.ts`
- Modify: `src/splat/index.ts` (exports)
- Test: `src/splat/gaussianCloudLoader.test.ts` (extend — it already has fake-worker/`loadPLYFromBuffer` dep-injection patterns; follow them)

**Interfaces:**
- Produces:
  ```ts
  export async function loadGaussianCloudFromBytes(
    buffer: ArrayBuffer,
    format: GaussianCloudFormat,
    deps?: GaussianCloudLoaderDeps
  ): Promise<LoadedGaussianCloud>;
  // = the existing post-read pipeline of loadGaussianCloudFromFileUncached (telemetry start,
  // 'decoding' progress, worker-or-sync decode with buffer transfer, packing, telemetry) —
  // extract that tail into this function and have loadGaussianCloudFromFileUncached call it
  // after readFileAsArrayBuffer. NOT cached (no File key exists).

  export function seedGaussianCloudLoad(file: File, loaded: Promise<LoadedGaussianCloud>): void;
  // gaussianCloudLoadCache.set(file, loaded) — lets Task 7 decode first and hand the renderer
  // a cache hit under the placeholder File it stores.
  ```
- Behavior contracts pinned by tests: `loadGaussianCloudFromBytes` transfers the buffer to the worker (the buffer is detached after the call when the worker path runs); `seedGaussianCloudLoad` makes a subsequent `loadGaussianCloudFromFile(sameFile)` resolve to the seeded result WITHOUT invoking the decode deps; `clearGaussianCloudLoadCacheForTests()` clears seeds.

- [ ] **Step 1: Write the failing tests** (using the file's existing fake deps; three tests: bytes-entry decodes via injected `loadPLYFromBuffer` sync path; seeded file returns seeded result and never calls the injected decoder; seed cleared by `clearGaussianCloudLoadCacheForTests`)
- [ ] **Step 2: RED** — `npx vitest run src/splat/gaussianCloudLoader.test.ts`
- [ ] **Step 3: Implement** — mechanical extraction; `loadGaussianCloudFromFileUncached` must remain behaviorally identical (its existing tests are the regression net; do not change any existing test).
- [ ] **Step 4: GREEN** — same command plus `npx vitest run src/splat/` and `npx tsc -b --force`.
- [ ] **Step 5: Commit**

```bash
git add src/splat/gaussianCloudLoader.ts src/splat/gaussianCloudLoader.test.ts src/splat/index.ts
git commit -m "feat(splat): decode-from-bytes entry and decode-cache seeding"
```

---

### Task 7: Byte-less activation for oversized remote splats on touch (+ ceiling raise)

**RISK TASK — read this whole task before starting; if the consumer audit (Step 1) finds a consumer that cannot tolerate a byte-less `splatFile`, STOP and report BLOCKED with the list. Do not ship a partial version.**

On touch hardware, when a lazily-selected remote splat exceeds the retention threshold, do not retain its bytes: download into the single buffer (Task 5), decode from bytes (Task 6), seed the decode cache under a placeholder `File`, and store the source as re-fetchable (as `clearActiveSplatFile` already models). This removes the blob+buffer coexistence that caps phones at ~300 MB.

**Files:**
- Modify: `src/store/reconstructionStore.ts` (`selectSplatSource` lazy branch)
- Modify: `src/hooks/urlLoaderPolicy.ts` (constants bump + new retention constant)
- Tests: `src/store/reconstructionStore.test.ts`, `src/hooks/urlLoaderPolicy.test.ts` (threshold updates)

**Interfaces:**
- New constant in urlLoaderPolicy.ts: `TOUCH_SPLAT_BYTELESS_RETENTION_MIN_BYTES = 100_000_000` — above this, touch devices activate byte-less.
- Ceiling raise (same commit): `TOUCH_SPLAT_DISABLE_MIN_SPLATS` 3_000_000 → `4_000_000`; update the Task 3 tests' expectations (the 64 MB spz case moves from 'disabled' to 'hint'/'ok' — recompute: 4M estimated == ceiling, not >, so 'hint' since 64 MB > 50 MB).
- Store flow (lazy branch of `selectSplatSource`, replacing the current `fetchRemoteSplatFile` call **only when** `detectTouchDevice() && source.size > TOUCH_SPLAT_BYTELESS_RETENTION_MIN_BYTES`; desktop and small-touch keep the existing File path):
  ```ts
  const { bytes, name } = await fetchRemoteSplatBytes(source.url, progressCallback);
  const format = getGaussianCloudFormatForFile(new File([], name)); // format from extension only
  const placeholder = new File([], name);                            // identity + name carrier, zero bytes
  seedGaussianCloudLoad(placeholder, loadGaussianCloudFromBytes(toArrayBuffer(bytes), format, {}));
  // then activate exactly like the existing path but with `placeholder` as the file and WITHOUT
  // writing bytes into the source (source.file stays undefined -> still re-fetchable/offloadable)
  ```
  where `toArrayBuffer(bytes: Uint8Array): ArrayBuffer` returns `bytes.buffer` when the view spans it exactly, else `bytes.slice().buffer` (the view from Task 5 may be a subarray). The seeded promise must be created BEFORE `applyActiveSplatFile` runs so the renderer's first `loadGaussianCloudFromFile(placeholder)` is a guaranteed cache hit. Handle decode rejection like the current fetch-failure branch (same latest-wins `requestId` guard, same `urlError` shape).
- **Step 1 is a consumer audit, not code:** enumerate every reader of `loadedFiles.splatFile` / `loadedFiles.splatFiles` bytes or size (`grep -rn "splatFile" src --include='*.ts' --include='*.tsx' | grep -v test | grep -v splatFileSources`). For each: classify **identity/name-only** (safe — renderer keying, progress-by-name policies), **size-reading** (evaluate: a 0-size placeholder must not break UI copy or progress math), or **byte-reading** (export/share paths — these must either already go through the re-fetchable source, or gain a guard: on a byte-less active splat, surface the existing notification store warning `'Splat bytes were not kept on this device - reload on desktop to export'` instead of writing an empty file). Write the classification table into your report BEFORE implementing. Known byte-reader to check first: the splat export flow (search `splatFile` under `src/store/actions/` and `src/parsers/writers.ts` / export store).
- Everything else (auto-load budgets, eager path, picker tiers except the constant) unchanged.

- [ ] **Step 1: Consumer audit** (table in report; BLOCKED if any consumer can't be guarded)
- [ ] **Step 2: Write the failing store test**

```ts
  it('activates an oversized remote splat on touch without retaining its bytes', async () => {
    // Arrange: touch device, lazy source > retention threshold, stubbed fetchRemoteSplatBytes + decode seam
    // Assert: selectSplatSource resolves; loadedFiles.splatFile is a zero-byte File named like the source;
    // the source's `file` stays undefined; the decode cache holds a seeded entry for that File;
    // requestedSplatSourceId set; urlLoading cleared.
  });
  it('keeps the byte-retaining path on desktop and for small touch splats', async () => { /* existing behavior pinned */ });
```

(Write these as real tests using the store test file's existing patterns — dependency seams for `fetchRemoteSplatBytes`, `detectTouchDevice`, and the loader functions will need injection points; prefer module mocks via `vi.mock` consistent with how the store tests already stub `fetchRemoteSplatFile` if they do — check first. The exact arrangement is the implementer's to adapt; the ASSERTIONS above are the contract.)

- [ ] **Step 3: RED**, **Step 4: implement**, **Step 5: GREEN** (store suite + urlLoaderPolicy suite with updated ceiling expectations + `npx tsc -b --force`)
- [ ] **Step 6: Commit**

```bash
git add src/store/reconstructionStore.ts src/store/reconstructionStore.test.ts src/hooks/urlLoaderPolicy.ts src/hooks/urlLoaderPolicy.test.ts <any guarded consumer files>
git commit -m "feat(viewer): byte-less oversized splat activation on touch; raise splat ceiling to 4M"
```

---

### Task 8: Full gates, smoke, release v0.9.5

- [ ] **Step 1:** `npm run test:run` (expect ≥ 2,961 all green), `npm run lint`, `npm run build`.
- [ ] **Step 2: Smoke on the production build** (`npx vite preview --port 4173 --strictPort`; kill any orphan on 4173 first):
  1. Desktop viewport, bigsur URL → picker unchanged, PLY row tappable (desktop un-gated).
  2. The picker on a simulated touch check can't be driven headless (hardware-keyed) — instead assert via the unit suites, and on the bigsur flow confirm the console shows the discovery probe captured `splatCount` (add a temporary `log` check or verify via the picker item test).
  3. Regression: `?url=` auto-load skip log + breaker decline flow still work (same checks as the v0.9.4 release).
- [ ] **Step 3: Real-device check (user-assisted, non-blocking for the tag):** on a phone, bigsur's PLY row shows disabled + reason; a mid-size splat (50–300 MB, if available) loads via the byte-less path without a reload.
- [ ] **Step 4: Release** (per CLAUDE.md): bump `package.json` to `0.9.5`, commit `Bump version to 0.9.5`, `git tag v0.9.5`, `git push origin main --tags`, `gh run watch` both deploys (pages serve-step flakes → `gh run rerun`), verify `https://colmapview.github.io/latest/` behavior.

---

## Self-Review Notes

- Requirements coverage: count capture (T1-2), tier policy (T3), disabled rows (T4) = the "less confusing decision"; single-copy download (T5), bytes decode + seeding (T6), byte-less activation + ceiling raise (T7) = the "could it be bigger"; release (T8).
- Honest-limits check: the 3M→4M ceiling raise is gated on T7 landing; if T7 blocks, Phase 1 ships alone at 3M/300 MB-equivalent and the plan's goal is still met minus the raise.
- Type-consistency: `SplatUrlClassification` (T2) feeds `RemoteSplatCandidate.splatCount` → `SplatFileSource.splatCount` (T2) → `getSplatDeviceTier` (T3) → picker items (T4); `fetchRemoteSplatBytes` (T5) + `loadGaussianCloudFromBytes`/`seedGaussianCloudLoad` (T6) → T7's activation flow. Names match across tasks.
- Known deviation from the no-placeholders rule: Task 7 Step 2 specifies assertion contracts rather than verbatim test code, because the store test file's stubbing seams must be discovered at implementation time; the contract is complete and the risk is explicitly gated by the Step-1 audit + BLOCKED escape hatch.
