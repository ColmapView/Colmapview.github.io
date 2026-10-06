# R2 — Test hygiene, coverage gaps, flaky tests, test type errors (implementation spec)

Branch `fix/load-path-review-findings` @ 15f1b69. Baseline: 566 files / 4414 tests green.
Research only: the repository was not modified (`git status` clean at the end).

## How this spec was validated

Every change below was applied to a **scratch mirror** of the project rather than the repository:
`<scratchpad>/mirror` holds a copy of `src/` plus the configs, with a directory junction to the repo's `node_modules`.
(`<scratchpad>` = `C:/Users/HEQ/AppData/Local/Temp/claude/C--Users-HEQ-Projects-colmap-webview/18fd85f8-55b2-4b0c-9e9a-5fc10492c0ad/scratchpad`.)

- Final versions of all 17 touched files (16 modified, 1 new: `ExportPanel.test.tsx`) live at the same relative paths under `<scratchpad>/mirror/src/`.
  `diff -rq` against the repo shows exactly these 17 files and no production file.
  The per-file unified diffs are in `<scratchpad>/diffs/*.diff`. Implementers can copy the files or apply the code below.
- **Results:**
  - All 16 suites pass together: 371 tests.
  - `npx eslint` on every touched file: exit 0.
  - `tsc -p tsconfig.app.json`: exit 0. This config also covers the `.test.tsx` files and the builders.
  - No new errors under a test-inclusive typecheck.
  - Output is pristine. The only exceptions are the prepareArchive/zipLoader warnings, and those are fixed by optional item X1, which was also validated.
- **Mutation checks:** every new or strengthened assertion was mutation-checked. The mirror's production file was edited, the tests were run, and the file was restored. Results are listed per item.
- **Line numbers** refer to the repo at 15f1b69. Some numbers in the brief have drifted, and the current lines are given here.
- **Line endings:** the index is LF (`core.autocrlf=true`). Keep each file's EOL.

---

## Part 1 — Noise (test output must be pristine)

### Measured noise today

There are two sources: a full-suite run with the default reporter, and single-file runs.

The full suite prints **147 stdout/stderr blocks from 20 files**. The four files named in the brief account for 99 of them:

| File | Blocks |
|---|---|
| useUrlLoader | 62 |
| useFileDropzone | 28 |
| datasetAccess | 5 |
| urlLoaderViewerState | 4 |

The other 16 files are listed in X2 (out of scope).

#### `src/hooks/useUrlLoader.test.ts`

The brief named two tests; **13 tests (21 cases) print**.

Tests that use the default logger, `useUrlLoader()` or `useUrlLoader({ applyUrlOverrides })` (stdout `[URL Loader] …`):

| Line | Test | Cases |
|---|---|---|
| :168 | 'cancels a private repository check…' (hook at :175) | 1 |
| :330 | 'restores the saved remote splat with %s loading' (hook at :351) | 5 |
| :375 | 'keeps COLMAP only when the user chooses None…' (hook at :399; the brief's ":352-386") | 1 |
| :411 | 'makes no full splat request for $choice None…' (hook at :432) | 4 |
| :444 | 'retains None chosen during %s…' (hook at :474) | 2 |
| :712 | 'does not apply YAML that arrives after its dataset load was cancelled' (hook at :728) | 1 |
| :738 | 'restores settings beside a direct splat file…' (hook at :744) | 1 |
| :753 | 'warns when settings beside a direct splat file do not arrive in time' (hook at :760; the brief's ":680") | 1 |

The :712 test is **the "cancel test" that prints `[URL Loader] Hugging Face splat discovery skipped: This operation was aborted`**. That line goes through `deps.log` (urlLoaderManifestFetch.ts:641), which is `logger.info`.

Tests that warn through `appLogger.warn` (stderr):

- :133 'loads a public Hugging Face dataset when the access check is rate limited' prints `[Hugging Face] Dataset access check returned 429…` (datasetAccess.ts:92).
- :513 'leaves a small splat lazy when optional YAML times out…' prints `[URL Loader] Skipping unavailable or invalid colmapview.yaml settings.` This is the late response being dropped: urlLoaderViewerState.ts:136, reached when the deadline's TimeoutError surfaces at `respond()`.
- :674 'loads a Hugging Face project with invalid YAML settings' prints the same skip warning.

Tests whose fakes have no body, so the yaml probe warns (stderr):

- :896 'keeps URL loading active after a direct splat URL hands off to the renderer'
- :985 'surfaces a skipped oversized lone splat…'

#### `src/hooks/urlLoaderViewerState.test.ts`

Three tests print the skip warning:

- :75 'counts a transport timeout…'
- :103 'still reports a timed-out direct read…'
- :166 'skips invalid or oversized optional YAML…' (twice)

The **:82 test (plain AbortError) does not print**, because AbortError is rethrown before the warn at :135-136.

#### `src/features/huggingface/datasetAccess.test.ts`

Five cases print and none assert the warning:

- :243 `it.each([408, 429, 500, 503])`, four cases
- :248 'cannot be reached', with a TypeError stack

#### `src/hooks/useFileDropzone.test.ts`

All 16 tests print `act(...)` warnings, 25 in total (the same count in the full run and in a solo run).

Root cause: `useFileDropzone` calls `useReconstructionStore()` with **no selector** (useFileDropzone.ts:61). Any store update therefore re-renders the mounted test component. The warnings come from two sources:

1. The `afterEach(() => clear())` at :34 runs while the hook is still mounted. RTL's auto-cleanup is a file-level afterEach, which runs *after* the describe-level one. This gives 1 warning per test.
2. Four tests update the store outside act:
   - :148 `setLoadedFiles` after `captureWorkflowDeps()` mounted the hook
   - :163 the synchronous `setUrlLoading` and `setUrlProgress` inside `handleDrop`
   - :189 `clear()`
   - :205 the real `processFileDropzoneFiles` run outside act

There is also stdout noise:

- `[Drop] Scanning…` in 3 tests, from `appLogger.info` hard-coded in useFileDropzone.ts.
- `Scanned 6 total files` and `Loaded: 0 cameras` in :205, because the deps carry `logger: appLogger`.

### N1 — useUrlLoader.test.ts noise

**Change**

(1) Every default-logger hook call gets `logger: noopLogger`. `noopLogger` is already imported at :19. The eight sites are :175, :351, :399, :432, :474, :728, :744 and :760. For example:

```ts
const { result } = renderHook(() => useUrlLoader({ logger: noopLogger, applyUrlOverrides: mode === 'override' }));
```

(2) Spy on and assert the expected warnings. `afterEach` already calls `vi.restoreAllMocks()`.

In :133 (rate limited), after the `vi.stubGlobal('fetch', request)` line:

```ts
const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
// … existing load …
expect(warn).toHaveBeenCalledExactlyOnceWith('[Hugging Face] Dataset access check returned 429; continuing with the dataset files.');
```

In :513 (YAML timeout), with the spy created before the load:

```ts
const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
// … at the end, replacing the toContainEqual (see C16) …
expect(settingsTimeoutWarnings()).toEqual([expect.objectContaining({ type: 'warning' })]);
// The late answer is logged and dropped; it never applies its None.
expect(warn).toHaveBeenCalledExactlyOnceWith('[URL Loader] Skipping unavailable or invalid colmapview.yaml settings.');
```

In the :674 it.each (YAML modes), with the spy created before `renderHook`:

```ts
const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
// … after the load …
// Only unreadable settings are worth a warning; a missing file is normal.
expect(warn.mock.calls).toEqual(mode === 'invalid'
  ? [['[URL Loader] Skipping unavailable or invalid colmapview.yaml settings.']] : []);
```

(3) Make the body-less fakes answer the yaml probe with a 404. These tests are about the hand-off and the lazy source, not about settings.

At :897:

```ts
vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => String(url).endsWith('colmapview.yaml')
  ? new Response(null, { status: 404 }) : ({
    ok: true,
    status: 200,
    statusText: 'OK',
    blob: vi.fn(async () => new Blob(['splat'], { type: 'application/octet-stream' })),
  })));
```

At :993, as the first line inside `fetchMock`:

```ts
if (String(url).endsWith('colmapview.yaml')) return new Response(null, { status: 404 });
```

**Dependency notes:** none on production. Track C (navigation fields before the early fly-to) may edit nearby tests in this file, such as :615 'keeps the saved alignment, view…' or the :674 fly-to assertions. The edits here do not change those assertions, but they touch the same file, so land this first or rebase.

### N2 — urlLoaderViewerState.test.ts noise

This item is combined with C13 and C14. The code is in C13; the pieces specific to noise are:

```ts
import { appLogger } from '../utils/logger';
const SKIPPED_SETTINGS_WARNING = '[URL Loader] Skipping unavailable or invalid colmapview.yaml settings.';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });
```

- **:103:** spy on the warning with `vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined)`, then add `expect(warn).toHaveBeenCalledExactlyOnceWith(SKIPPED_SETTINGS_WARNING);`
- **:166:** spy the same way, then at the end assert `expect(warn.mock.calls).toEqual([[SKIPPED_SETTINGS_WARNING], [SKIPPED_SETTINGS_WARNING]]);`. There is one warning per skipped optional file. The explicitly referenced YAML rejects instead of warning.
- **:75:** covered in C13. The warning is asserted *before* `settle()`, which also proves the "before needed" order.

**Dependency notes:** none.

### N3 — datasetAccess.test.ts noise

**Change.** At :32, extend the hook and add a constant:

```ts
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const CONTINUE_AFTER_FAILED_CHECK = '[Hugging Face] Dataset access check failed; continuing with the dataset files.';
```

Replace the tests at :243 and :248:

```ts
it.each([408, 429, 500, 503])('lets the dataset files decide when the access check returns %s', async status => {
  const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
  const fetchImpl = vi.fn(async () => new Response(null, { status }));
  await expect(checkHuggingFaceDatasetAccess(info, fetchImpl)).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledExactlyOnceWith(`[Hugging Face] Dataset access check returned ${status}; continuing with the dataset files.`);
});

it('lets the dataset files decide when the Hub API cannot be reached', async () => {
  const error = new TypeError('Failed to fetch');
  const fetchImpl = vi.fn(async (): Promise<Response> => { throw error; });
  const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
  await expect(checkHuggingFaceDatasetAccess(info, fetchImpl)).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledExactlyOnceWith(CONTINUE_AFTER_FAILED_CHECK, error);
});
```

Optional: the existing plain-AbortError test at :262-272 can drop its try/finally `mockRestore()`, since afterEach now restores spies. `vi.restoreAllMocks()` in Vitest 4 only restores `vi.spyOn` spies, so the `vi.mock('./auth')` fns are unaffected. This was verified: 45/45 pass.

**Dependency notes:** none.

### N4 — useFileDropzone.test.ts act warnings and logs

This item is combined with F3, which concerns the same file. **Change:**

```ts
import { act, cleanup, renderHook } from '@testing-library/react';
import { appLogger, noopLogger } from '../utils/logger';
// after the vi.mock('./fileDropzoneWorkflow', …) block:
// Loaded while the file is collected, where no timeout applies: the real workflow's module graph
// is a cold ~1 s transform that one test's 5 s budget should not absorb under parallel load.
const actualWorkflow = await vi.importActual<typeof import('./fileDropzoneWorkflow')>('./fileDropzoneWorkflow');

describe('useFileDropzone', () => {
  afterEach(() => {
    // Unmount first: resetting the store under a mounted hook is an update outside act().
    cleanup();
    useReconstructionStore.getState().clear();
    vi.restoreAllMocks();
  });
  beforeEach(() => {
    // The drop handlers log their scan progress through appLogger directly.
    vi.spyOn(appLogger, 'info').mockImplementation(() => undefined);
    processFileDropzoneFilesMock.mockClear();
    // … unchanged …
```

At :152 (preserves an explicit None), wrap the store update while the hook is mounted:

```ts
act(() => useReconstructionStore.getState().setLoadedFiles({ ...buildLoadedFiles(), splatFile: a, splatFiles: [a, b],
  splatFileSources: [{ id: 'a.spz', path: 'a.spz', file: a }, { id: 'b.spz', path: 'b.spz', file: b }],
}));
```

At :176-188 (captures the selection revision):

```ts
// The drop shows its loading state synchronously; start it inside act().
let pending!: Promise<void>;
act(() => { pending = result.current.handleDrop(event); });
await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
await act(async () => { await useReconstructionStore.getState().selectSplatSource(''); });
await act(async () => { resolve(buildFile('colmapview.yaml')); await pending; });
```

At :192 (rejects saved local settings), wrap the call: `act(() => useReconstructionStore.getState().clear());`

At :205-235 (keeps None through actual local COLMAP commit):

```ts
// (drop the in-test `const actual = await vi.importActual(...)`; use actualWorkflow)
let resolve!: () => void;
let pending!: Promise<boolean>;
// The real workflow publishes progress to the mounted hook's store until it reaches the paint delay.
await act(async () => {
  pending = actualWorkflow.processFileDropzoneFiles(files, { ...deps, logger: noopLogger,
    parseFiles: async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), usedWasmPath: false }),
    buildReconstruction: async () => ({ reconstruction: buildReconstruction(), pointCount: 0 }),
    delay: () => new Promise<void>(done => { resolve = done; }),
    clearCaches: vi.fn(), shouldPreloadSplatRuntime: () => false,
  }, options);
  await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
});
await act(async () => { await useReconstructionStore.getState().selectSplatSource(''); });
await act(async () => { resolve(); expect(await pending).toBe(true); });
```

The validated mirror version keeps `const actual = actualWorkflow;`, which is equivalent.

**Validated:** with only the `afterEach` change, 12 tests stop warning and 4 still warn. With all the changes, all 16 pass and the output is pristine. Top-level `await` is accepted by ESLint (typescript-eslint parser) and by Vitest.

**Dependency notes:** Track A (Reload keeps the on-screen selection, local and None) will probably add `reloadFiles` tests to this file. Those tests benefit from the new afterEach, which unmounts and restores spies. Land this first.

---

## Part 2 — Coverage gaps

### C1 — `#d=` stripping through `cancelLoading` / `clearUrlLoadRequestFromLocation`

**Verified.** The production code strips in two places:

- `clearUrlLoadRequestFromLocation` (reconstructionStore.ts:151-169) deletes `?url=` and the `d` hash param, keeping other params.
- `cancelLoading` calls it at :609 (the splat-only decode-cancel path, I2) and at :616 (`!reconstruction`).

The tests leave a gap:

- The cancellation tests (reconstructionStore.test.ts:1240-1435) only use `?url=`.
- `#d=` is covered only indirectly, through `abandonUrlAutoLoadRequest` at :1211.
- **Mutation:** `has('d')` changed to `has('never')`. Only the abandon test fails today. With this item, 6 tests fail.

**Change** (reconstructionStore.test.ts):

```ts
import { abandonUrlAutoLoadRequest, clearUrlLoadRequestFromLocation, hasUrlToLoad, useReconstructionStore } from './reconstructionStore';
```

New describe, placed before 'reconstruction store splat renderer sync':

```ts
describe('clearUrlLoadRequestFromLocation', () => {
  function locationAt(href: string) {
    const replaceState = vi.fn();
    return { win: { location: { href } as Location, history: { replaceState } as unknown as History }, replaceState };
  }

  it.each([
    ['https://viewer.example/app/#d=abc', '/app/'],
    ['https://viewer.example/app/#d=abc&foo=bar', '/app/#foo=bar'],
    ['https://viewer.example/app/?url=https%3A%2F%2Fx.example%2Fscene&keep=1#d=abc', '/app/?keep=1'],
    ['https://viewer.example/app/?keep=1#foo=bar', '/app/?keep=1#foo=bar'],
  ])('rewrites %s to %s', (href, expected) => {
    const { win, replaceState } = locationAt(href);
    clearUrlLoadRequestFromLocation(win);
    expect(replaceState).toHaveBeenCalledExactlyOnceWith(null, '', expected);
  });

  it('never lets a failed URL rewrite block the cancel', () => {
    const win = { location: { href: 'https://viewer.example/#d=abc' } as Location,
      history: { replaceState: () => { throw new DOMException('Blocked', 'SecurityError'); } } as unknown as History };
    expect(() => clearUrlLoadRequestFromLocation(win)).not.toThrow();
  });
});
```

In 'reconstruction store loading cancellation', after 'returns to the landing page when a startup link is cancelled…':

```ts
it('strips a shared #d= link cancelled before anything loaded, keeping other hash parameters', () => {
  window.history.replaceState(null, '', '/#d=eyJ4IjoxfQ&foo=bar');
  useReconstructionStore.setState({ urlLoading: true, urlProgress: { percent: 0, message: 'Initializing...' } });

  useReconstructionStore.getState().cancelLoading();

  expect(hasUrlToLoad()).toBe(false);
  expect(window.location.hash).toBe('#foo=bar');
});

it('strips a shared #d= link when cancelling its splat-only decode returns to the landing page', () => {
  window.history.replaceState(null, '', '/#d=eyJ4IjoxfQ');
  const splat = new File(['a'], 'scene.spz');
  useReconstructionStore.getState().setLoadedFiles({ imageFiles: new Map(), hasMasks: false,
    splatFile: splat, splatFiles: [splat], splatFileSources: [{ id: 'scene.spz', path: 'scene.spz', file: splat }] });
  useReconstructionStore.setState({ reconstruction: buildReconstruction(), urlLoading: true,
    urlProgress: getSplatLoadingProgress(splat, { startPercent: 60 }) });

  useReconstructionStore.getState().cancelLoading();

  expect(useReconstructionStore.getState().loadedFiles).toBeNull();
  expect(hasUrlToLoad()).toBe(false);
  expect(window.location.hash).toBe('');
});
```

**Dependency notes:** Track B (shared COLMAP-only and renderer-owns-progress helpers) will restructure `cancelLoading`. These tests pin only public behavior: `cancelLoading`, `hasUrlToLoad()` and `location`. **Land them before Track B** as its regression net.

### C2 — `checkHuggingFaceDatasetAccess` with a thrown `DOMException('…','TimeoutError')`

**Verified.** datasetAccess.ts:81 treats only `name === 'AbortError'` as cancellation, so a TimeoutError warns and returns. No test covers it.

**Mutation:** make TimeoutError fatal at :82. The new test fails and the other 44 pass.

**Change** (after the 'cannot be reached' test):

```ts
it('lets the dataset files decide when a stalled Hub API times out', async () => {
  // fetchWithTimeout aborts a stalled request with a TimeoutError while the load itself is live.
  const error = new DOMException('Request timed out', 'TimeoutError');
  const fetchImpl = vi.fn(async (): Promise<Response> => { throw error; });
  const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
  await expect(checkHuggingFaceDatasetAccess(info, fetchImpl, new AbortController().signal)).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledExactlyOnceWith(CONTINUE_AFTER_FAILED_CHECK, error);
});
```

The production shape comes from fetchWithTimeout.ts:22, which aborts with `DOMException('Request timed out','TimeoutError')`.

**Dependency notes:** none.

### C3 — `useUrlLoader`: the `load.remoteCatalogMerged` condition is unpinned

**Verified.** useUrlLoader.ts:169-173 offers the picker only if `load.remoteCatalogMerged`. Today, mutating that check to `true` breaks no test.

**Mutation:** with this item, both new cases fail.

**Change** (after 'opens the picker once the load settles…'):

```ts
it.each([
  ['an archive', 'https://example.com/scene.tar'],
  ['a direct splat', 'https://example.com/scene.spz'],
] as const)('does not offer the picker after %s load that listed no remote catalog', async (_kind, url) => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => String(input).endsWith('colmapview.yaml')
    ? new Response(null, { status: 404 }) : new Response(new Uint8Array([1, 2, 3]))));
  if (url.endsWith('.tar')) {
    vi.spyOn(archiveSource, 'loadZipUrlSource').mockImplementation(async (_url, deps) =>
      (await deps.processFiles(new Map([['cameras.bin', new File(['c'], 'cameras.bin')]]), undefined, { throwOnError: true })) !== false);
  }
  // The load ends with a splat listed but none showing, and nobody chose None.
  processFilesMock.mockImplementationOnce(async () => {
    useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({ splatFileSources: [
      { id: 'splats/a.spz', path: 'splats/a.spz', url: 'https://example.com/splats/a.spz', size: 100 }] }));
  });
  const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
  await act(async () => { expect(await result.current.loadFromUrl(url)).toBe(true); });
  const state = useReconstructionStore.getState();
  expect(state.loadedFiles?.splatFileSources).toHaveLength(1);
  expect(state.loadedFiles?.splatFile).toBeUndefined();
  // Only a merged remote catalog asks; this load never listed one.
  expect(state.showSplatPicker).toBe(false);
});
```

**Dependency notes:** none. There is no saved state, so Track C's `applySavedViewerState` change does not touch this path.

### C4 — strengthen 'opens the picker once the load settles when several splats need a choice' (:577-593)

**Verified.** The test asserts only the end state, `showSplatPicker === true`.

**Mutation:** make `mergeRemoteSplatCatalog` open the picker on its own, which was the old behavior. Only the strengthened test fails.

**Change:** replace the body after `processFilesMock.mockImplementationOnce(...)`:

```ts
// The picker state at the moment both splats are first listed, i.e. while the load still runs.
const pickerWhenListed: boolean[] = [];
const unsubscribe = useReconstructionStore.subscribe((state, previous) => {
  if (state.loadedFiles?.splatFileSources?.length === 2 && previous.loadedFiles?.splatFileSources?.length !== 2) {
    pickerWhenListed.push(state.showSplatPicker);
  }
});
const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
try {
  await act(async () => { expect(await result.current.loadFromUrl(baseUrl)).toBe(true); });
  expect(pickerWhenListed).toEqual([false]);
  expect(useReconstructionStore.getState().showSplatPicker).toBe(true);
  expect(request.mock.calls.filter(([url, init]) => String(url).endsWith('.spz') && init?.method !== 'HEAD')).toEqual([]);
} finally { unsubscribe(); }
```

**Dependency notes:** none.

### C5 — Task 5: a real downloaded-splat switch (same basename, different folder)

**Verified.** The test 'still clears a superseded download indicator…' (reconstructionStore.test.ts:479-494) has the download progress for `b.spz`, then selects `a.spz`, **the splat already active**. So the same-object check `source.file === loadedFiles.splatFile` at reconstructionStore.ts:445 is never exercised. `isSplatLoadingProgressForFile` matches by **name** (splatLoadingProgressPolicy.ts:133-143).

**Mutation:** drop the same-object check. Only the new test fails.

**Change** (after the 'keeps the renderer progress…' test):

```ts
it('clears the decoding splat\'s progress when switching to another downloaded splat of the same name', async () => {
  const fileA = new File(['a'], 'scene.spz');
  const fileB = new File(['b'], 'scene.spz');
  useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
    splatFile: fileA, splatFiles: [fileA, fileB],
    splatFileSources: [
      { id: 'a/scene.spz', path: 'a/scene.spz', file: fileA },
      { id: 'b/scene.spz', path: 'b/scene.spz', file: fileB },
    ],
  }));
  // The renderer is decoding a/scene.spz; by name alone its progress would also match b/scene.spz.
  useReconstructionStore.setState({ urlLoading: true, urlProgress: getSplatLoadingProgress(fileA, { startPercent: 60 }),
    urlError: { type: 'network', message: 'Failed to load splat' } });

  await useReconstructionStore.getState().selectSplatSource('b/scene.spz');

  const state = useReconstructionStore.getState();
  expect(state.loadedFiles?.splatFile).toBe(fileB);
  expect(state.urlLoading).toBe(false);
  expect(state.urlProgress).toBeNull();
  expect(state.urlError).toBeNull();
});
```

**Dependency notes:** this is the regression net for **Track B's renderer-owns-progress helper**, which must keep the same-object condition. Land it before Track B.

### C6 — Task 5: `urlError` preservation when the renderer owns progress

**Verified.** When `rendererOwnsProgress` is true, the branch at reconstructionStore.ts:450 leaves `urlLoading`, `urlProgress` *and* `urlError` untouched. No test sets `urlError` there.

**Mutation:** clear `urlError` in that branch. Only the extended test fails.

**Change:** extend the existing test at :464-477 instead of adding one.

```ts
const progress = getSplatLoadingProgress(fileA, { startPercent: 60 });
// The loading state belongs to the renderer, including an error it is showing.
const urlError = { type: 'network' as const, message: 'Failed to load splat' };
useReconstructionStore.setState({ urlLoading: true, urlProgress: progress, urlError });

await useReconstructionStore.getState().selectSplatSource('a.spz', { restore: true });

expect(useReconstructionStore.getState().urlLoading).toBe(true);
expect(useReconstructionStore.getState().urlProgress).toBe(progress);
expect(useReconstructionStore.getState().urlError).toBe(urlError);
```

**Dependency notes: decision point for Track B.** The ledger notes an inconsistency, and B's "COLMAP only" helper may unify it:

- The picker's COLMAP-only path clears `urlError` (reconstructionStore.ts:436).
- `cancelLoading`'s decode path does not.

This test is on the `selectSplatSource` restore path, not the cancel path. If B deliberately decides that the renderer-owned branch should also clear `urlError`, flip this one assertion in the same commit. Otherwise it stands.

### C7 — splatFileSourcePolicy.test.ts: the duplicated helper and the local+remote merge

**Verified.** splatFileSourcePolicy.test.ts:347 declares `const loaded = …` inside `describe('carryOverRemoteSplatSources')`. It is byte-for-byte the module helper at :18-20, which it shadows.

None of the 5 carry-over tests combine reloaded **local** splats with carried **remote** ones.

**Mutations:** with the new test, all of these fail:

- carried sources placed first
- `splatFiles` not rebuilt
- the reload default winning over the carried active file

Before this item, two of them (carried-first and default-wins) broke **no test**.

**Change:** delete line :347. After 'prefers a reloaded local file…', add:

```ts
it('lists the reloaded local splats first, then the remote tiles, keeping the remote splat on screen', () => {
  const localFile = new File(['local'], 'local.spz');
  const current = loaded({ splatFile: remoteFile, splatFiles: [localFile, remoteFile],
    splatFileSources: [{ id: 'local.spz', path: 'local.spz', file: localFile }, remoteActive, remoteLazy] });
  // A reload re-reads the local files and defaults to their first splat.
  const reloadedLocal = { id: 'local.spz', path: 'local.spz', file: localFile };
  const result = carryOverRemoteSplatSources(current,
    { splatFile: localFile, splatFiles: [localFile], splatFileSources: [reloadedLocal] });
  expect(result.splatFileSources).toEqual([reloadedLocal, remoteActive, remoteLazy]);
  // Rebuilt from the merged sources: the local bytes and the downloaded remote tile, not the lazy one.
  expect(result.splatFiles).toEqual([localFile, remoteFile]);
  expect(result.splatFile).toBe(remoteFile);
});
```

**Dependency notes: Track A will generalize `carryOverRemoteSplatSources`** to keep a local pick and None.

- This test pins behavior A must keep: reloaded-first ordering, rebuilt `splatFiles`, and a carried remote active file that wins.
- If A renames the function or changes its signature, update the call.
- **Do not** add a test that pins "a LOCAL active splat falls back to the reload default", or "None is lost when the reload has a default". Those are exactly what A changes.
- The existing test 'keeps COLMAP only when no splat was showing' only covers `reloaded.splatFile === undefined`, so it stays valid.

### C8–C11 — fileDropzoneWorkflow.test.ts

**Verified:**

- **C9.** The `it.each([true,false])` test at :938-959 fakes `getLoadedFiles: vi.fn(() => current)` with a fixed `current`. After the commit, the workflow reads the store back (fileDropzoneWorkflow.ts:543): `committedSplatFile = deps.getLoadedFiles()?.splatFile ?? splatFile`. With `preserve=false`, that read-back returns the stale remote file, so "no hand-off" comes from `splatAlreadyRendered` instead of from "no splat". This is the coincidence the reviewer flagged.
- **C8.** There is no test for re-reading an unchanged **local** splat.
- **C10.** The test at :987-1008 commits into the real `useReconstructionStore`, `useTransformStore` and, through `setLoadedFiles` side effects, the UI and pointCloud stores, with no reset. The test at :136 already shows the four-store `finally` pattern.
- **C11.** The precedence test at :1010-1026 uses `toHaveBeenCalledWith`. It would still pass if the source's settings were *also* applied.

**Mutation checks:**

- "Always hand off": the new local test and the existing remote and store re-pick tests fail.
- "Judge the provisional file": the store re-pick test fails.

**Change:**

```ts
import type { LoadedFiles, Reconstruction } from '../types/colmap';

/** A loaded-files store that, like the real one, reads back what the workflow committed. */
function loadedFilesStore(initial: LoadedFiles | null) {
  let current = initial;
  return {
    getLoadedFiles: vi.fn(() => current),
    setLoadedFiles: vi.fn((files: LoadedFiles) => { current = files; }),
  };
}
```

C9 replaces the it.each test:

```ts
it.each([true, false])('carries remote splat tiles across a reload only when asked (%s)', async preserve => {
  const remoteFile = new File(['remote'], 'scene.spz');
  const store = loadedFilesStore(loadedFiles({
    splatFile: remoteFile, splatFiles: [remoteFile],
    splatFileSources: [{ id: 'splats/scene.spz', path: 'splats/scene.spz', url: 'https://x/splats/scene.spz', size: 6, file: remoteFile }],
  }));
  const deps = createDeps({
    ...store,
    parseFiles: vi.fn(async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false })),
    buildReconstruction: vi.fn(async () => ({ reconstruction: createReconstruction(), pointCount: 0 })),
  });
  const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin'].map(name => [name, file(name)]));

  await expect(processFileDropzoneFiles(files, deps, { preserveRemoteSplatSources: preserve })).resolves.toBe(true);

  expect(deps.setLoadedFiles).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(preserve
    ? { splatFile: remoteFile, splatFileSources: [expect.objectContaining({ id: 'splats/scene.spz', file: remoteFile })] }
    : { splatFile: undefined, splatFileSources: [] }));
  expect(store.getLoadedFiles()?.splatFile).toBe(preserve ? remoteFile : undefined);
  // Kept: the renderer already shows it. Dropped: nothing is left to render. Either way, no wait.
  expect(deps.setUrlProgress).not.toHaveBeenCalledWith(expect.objectContaining({ currentFile: 'scene.spz' }));
  expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
});
```

C8 is a new test, added after the it.each:

```ts
it('does not wait on the renderer when a reload re-reads the local splat it already shows', async () => {
  const local = new File(['local'], 'scene.spz');
  const store = loadedFilesStore(loadedFiles({
    splatFile: local, splatFiles: [local], splatFileSources: [{ id: 'scene.spz', path: 'scene.spz', file: local }],
  }));
  const deps = createDeps({
    ...store,
    parseFiles: vi.fn(async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false })),
    buildReconstruction: vi.fn(async () => ({ reconstruction: createReconstruction(), pointCount: 0 })),
  });
  // Reload passes the same dropped files back, so the splat is the very File on screen.
  const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin'].map(name => [name, file(name)]));
  files.set('scene.spz', local);

  await expect(processFileDropzoneFiles(files, deps, { preserveRemoteSplatSources: true })).resolves.toBe(true);

  expect(store.getLoadedFiles()?.splatFile).toBe(local);
  expect(deps.setUrlProgress).not.toHaveBeenCalledWith(expect.objectContaining({ currentFile: 'scene.spz' }));
  expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
});
```

C10: in 'restores the saved alignment that came with a reloaded URL dataset', wrap the call and the assertion:

```ts
try {
  await expect(processFileDropzoneFiles(files, deps, {
    viewerState: saved,
    onViewerState: viewerState => applySavedViewerState(viewerState, null),
  })).resolves.toBe(true);

  expect(useTransformStore.getState().splatTransform.translationX).toBe(5);
} finally {
  useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  useTransformStore.setState(useTransformStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
}
```

C11 (precedence):

```ts
// The file inside replaces the source's settings; they are not applied as well.
expect(onViewerState).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ config: { ui: { backgroundColor: '#222222' } } }));
```

**Dependency notes:** Track A changes this workflow's Reload carry-over. A may rename `preserveRemoteSplatSources` or move the selection logic.

- The `loadedFilesStore` helper and the C8/C9 tests are the natural base for A's new cases: a local pick, None, and re-picking after a second Reload. The ledger's "second Reload drops a user's LOCAL pick" belongs to A.
- **Land C8–C11 before A**, or hand them to A's implementer.

### C12 — Reload buttons

**Verified:**

- **TransformPanel.tsx:61 and :171.** The button calls `resetTransform(); reloadFiles(droppedFiles)` **without** `confirmReload()`. This pre-existing ⚠️ is noted in the ledger.
- **ExportPanel.tsx:70 and :202-207.** The button calls `confirmReload()`, then `resetTransform()` and `reloadFiles`.
- **Existing component tests:**
  - TransformPanel.test.tsx renders the panel at :13-21 and only checks that a Reload button exists (:54-67).
  - **ExportPanel has no component test** (only ExportPanelSections.test.tsx).
- **Executors are already covered:**
  - globalContextMenuActionExecutor.test.ts:222-240 asserts `reloadFiles` is called with the files after confirmation and not called when denied.
  - transformGizmoContextMenuExecutor.test.ts:32-66 asserts the same for both the confirm and deny paths.
- **The remaining gap is the facade wiring.** The facades are useGlobalContextMenuActionStoreFacade.ts:58-61 and useTransformGizmoStoreFacade.ts:39 and :52. Their tests (:38 and :41) assert only `expect.any(Function)`.
- **Types don't catch a mis-wire.** `processFiles(files, range?, options?)` is assignable to the `reloadFiles: (files) => …` dependency type.
- **Mutation:** wire `processFiles` in place of `reloadFiles` in all four places. All four new or strengthened tests fail.

**Change, TransformPanel.test.tsx.** Add `waitFor` to the RTL import, then:

```tsx
const { reloadFilesMock, processFilesMock } = vi.hoisted(() => ({
  reloadFilesMock: vi.fn(async () => true),
  processFilesMock: vi.fn(async () => true),
}));

vi.mock('../../../hooks/useFileDropzone', () => ({
  useFileDropzone: () => ({ reloadFiles: reloadFilesMock, processFiles: processFilesMock }),
}));
// in beforeEach: vi.clearAllMocks();

it('reloads the dropped files through the Reload path, which keeps remote splat tiles', async () => {
  const droppedFiles = new Map([['sparse/0/cameras.bin', new File(['c'], 'cameras.bin')]]);
  useReconstructionStore.setState({ droppedFiles });
  renderPanel();

  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

  // waitFor: still holds if this button gains the confirmReload() step the other three have.
  await waitFor(() => expect(reloadFilesMock).toHaveBeenCalledExactlyOnceWith(droppedFiles));
  expect(processFilesMock).not.toHaveBeenCalled();
});
```

The test deliberately leaves the transform at identity. If the TransformPanel ⚠️ is later fixed by adding `confirmReload()`, nothing will prompt, and the `waitFor` absorbs the async step.

**Change, new file `src/components/viewer3d/panels/ExportPanel.test.tsx`:**

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeletionStore, useReconstructionStore, useTransformStore } from '../../../store';
import { buildReconstruction } from '../../../test/builders';
import { createIdentityEuler } from '../../../utils/sim3dTransforms';
import { ExportPanel } from './ExportPanel';

const { reloadFilesMock, processFilesMock, requestConfirmationMock } = vi.hoisted(() => ({
  reloadFilesMock: vi.fn(async () => true),
  processFilesMock: vi.fn(async () => true),
  requestConfirmationMock: vi.fn(async () => true),
}));

vi.mock('../../../hooks/useFileDropzone', () => ({
  useFileDropzone: () => ({ reloadFiles: reloadFilesMock, processFiles: processFilesMock }),
}));

vi.mock('../../../utils/confirmation', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../utils/confirmation')>(),
  requestConfirmation: requestConfirmationMock,
}));

function renderPanel() {
  return render(<ExportPanel activePanel="export" setActivePanel={vi.fn()}
    onOpenDeletionModal={vi.fn()} onOpenConversionModal={vi.fn()} />);
}

describe('ExportPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
    useReconstructionStore.setState({ reconstruction: buildReconstruction() });
  });

  afterEach(() => {
    cleanup();
  });

  it('reloads the dropped files through the Reload path, which keeps remote splat tiles', async () => {
    const droppedFiles = new Map([['sparse/0/cameras.bin', new File(['c'], 'cameras.bin')]]);
    useReconstructionStore.setState({ droppedFiles });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

    await waitFor(() => expect(reloadFilesMock).toHaveBeenCalledExactlyOnceWith(droppedFiles));
    expect(processFilesMock).not.toHaveBeenCalled();
  });

  it('asks before a Reload that would discard a pending transform, and stays put when declined', async () => {
    const droppedFiles = new Map([['sparse/0/cameras.bin', new File(['c'], 'cameras.bin')]]);
    const transform = { ...createIdentityEuler(), scale: 1.5 };
    useReconstructionStore.setState({ droppedFiles });
    useTransformStore.setState({ transform });
    requestConfirmationMock.mockResolvedValueOnce(false);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

    await waitFor(() => expect(requestConfirmationMock).toHaveBeenCalledOnce());
    expect(reloadFilesMock).not.toHaveBeenCalled();
    expect(useTransformStore.getState().transform).toEqual(transform);
  });
});
```

It renders fine in jsdom. `useDataset()` is store-based and needs no provider. `confirmReload()` returns true without prompting when there is nothing to lose. sessionActions.ts imports `../../utils/confirmation.js`, and the `vi.mock` above matches it. The second test is optional.

**Change, useGlobalContextMenuActionStoreFacade.test.ts.** Add `vi` to the vitest import, use the same `vi.hoisted` and `vi.mock('../../../hooks/useFileDropzone', …)` as above, and call `vi.clearAllMocks()` in beforeEach. Then:

```ts
it('reloads through the Reload path, which keeps remote splat tiles', async () => {
  const files = new Map([['sparse/0/cameras.bin', new File(['c'], 'cameras.bin')]]);
  const { result } = renderHook(() => useGlobalContextMenuActionStoreFacade());

  await act(async () => { await result.current.reloadFiles(files); });

  expect(reloadFilesMock).toHaveBeenCalledExactlyOnceWith(files);
  expect(processFilesMock).not.toHaveBeenCalled();
});
```

**Change, useTransformGizmoStoreFacade.test.ts.** Add `vi` to the vitest import, then:

```ts
const { reloadFilesMock } = vi.hoisted(() => ({ reloadFilesMock: vi.fn(async () => true) }));

vi.mock('../../hooks/useFileDropzone', () => ({
  useFileDropzone: () => ({ reloadFiles: reloadFilesMock, processFiles: vi.fn(async () => true) }),
}));
// in 'collects transform gizmo dependencies…', replace the expect.any(Function) line:
// The Reload path that keeps remote splat tiles, not a fresh load of the same files.
expect(result.current.actions.reloadFiles).toBe(reloadFilesMock);
```

**Dependency notes:** if Track A changes the `reloadFiles` signature (for example by adding an options argument), adapt the `ExactlyOnceWith` expectations. Otherwise these tests are independent.

### C13 — urlLoaderViewerState.test.ts: titles claim a "before needed" order that is never set up

**Verified.** In both :66 and :75, `settle()` runs synchronously right after `start…()`, before the request's microtasks settle.

**Mutation:** remove the `settle` memo (`result ??=`). The strengthened :66 fails. The timer count also pins "no second deadline".

**Change:**

```ts
import * as datasetViewerSettings from '../utils/datasetViewerSettings';
/** Lets a request that is already answered finish before anything asks for its result. */
const flushRequest = () => new Promise(resolve => setTimeout(resolve, 0));

it('returns settings that arrived before they were needed, once, without a second deadline', async () => {
  const parse = vi.spyOn(datasetViewerSettings, 'parseDatasetViewerSettings');
  const request = vi.fn(async () => new Response('ui:\n  background_color: "#123456"\n'));
  const pending = startOptionalDatasetViewerSettings(manifest.baseUrl, request);
  await flushRequest();
  expect(parse).toHaveBeenCalledOnce();
  vi.useFakeTimers();
  const first = pending.settle();
  expect(pending.settle()).toBe(first);
  expect(vi.getTimerCount()).toBe(1);
  await expect(first).resolves.toMatchObject({ timedOut: false, state: { config: { ui: { backgroundColor: '#123456' } } } });
  expect(vi.getTimerCount()).toBe(0);
  expect(request).toHaveBeenCalledOnce();
});

it('counts a transport timeout that happened before the result was needed as a timeout', async () => {
  const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
  // fetchWithTimeout gives up on a stalled request after 30 s, long before slow parsing ends.
  const request = vi.fn(async (): Promise<Response> => { throw new DOMException('Request timed out', 'TimeoutError'); });
  const pending = startOptionalDatasetViewerSettings(manifest.baseUrl, request);
  await flushRequest();
  // The request has already failed when the result is first needed.
  expect(warn).toHaveBeenCalledExactlyOnceWith(SKIPPED_SETTINGS_WARNING);
  await expect(pending.settle()).resolves.toEqual({ state: null, timedOut: true });
});
```

One `setTimeout(0)` was enough to finish the fetch, the `readBoundedResponse`, the NodeBlob `text()` and the parse. The `parse` spy proves this inside the test.

The spy on a module-namespace export works in this setup; useUrlLoader.test.ts:453 already does the same with `vi.spyOn(archiveSource, …)`. It is optional: dropping it keeps the order but no longer *proves* it.

**Dependency notes:** none.

### C14 — urlLoaderViewerState.test.ts: outer abort before `settle()`

**Verified.** The test at :90 ("keeps cancellation fatal…", added in 3e698f7) aborts before settle, but its request *rejects* on abort, so either race arm can answer. The `if (signal?.aborted) { cancel(); return; }` branch at urlLoaderViewerState.ts:46 is never isolated.

**Mutation:** remove that line. Only the new test fails, and it fails cleanly: the deadline is armed and later resolves `{timedOut:true}`.

**Change** (after the :75 test):

```ts
it('rejects at once when the load was cancelled before the settings were needed, even if the request ignores it', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const pending = startOptionalDatasetViewerSettings(manifest.baseUrl, () => new Promise<Response>(() => {}), false, controller.signal);
  controller.abort();
  const settled = expect(pending.settle()).rejects.toMatchObject({ name: 'AbortError' });
  // No deadline is armed for a load that is already gone; the cancellation, not a timeout, answers.
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS);
  await settled;
});
```

**Dependency notes:** none.

### C15 — useUrlLoader: the archive-path optional-settings timeout warning

**Verified.** useUrlLoader.ts:236-244 probes the settings beside an archive only when `!load.hasEmbeddedViewerSettings`. Neither the warning nor the guard has a test (grep found none).

**Mutations:**

- Drop the timeout callback in `applyOptionalSettingsBeside`. The `inside:false` case and the direct-splat test fail.
- Probe even when the archive has settings inside. The `inside:true` case fails.

**Change** (after the direct-splat warning test):

```ts
it.each([
  { inside: false, warnings: 1 },
  { inside: true, warnings: 0 },
])('warns about settings beside an archive that do not arrive in time (settings inside: $inside)', async ({ inside, warnings }) => {
  vi.useFakeTimers();
  vi.stubGlobal('Blob', NodeBlob);
  const request = vi.fn((_url: string | URL) => new Promise<Response>(() => {}));
  vi.stubGlobal('fetch', request);
  const files = new Map([['cameras.bin', new File(['c'], 'cameras.bin')]]);
  if (inside) files.set('colmapview.yaml', new File(['ui: {}'], 'colmapview.yaml'));
  vi.spyOn(archiveSource, 'loadZipUrlSource').mockImplementation(async (_url, deps) =>
    (await deps.processFiles(files, undefined, { throwOnError: true })) !== false);
  processFilesMock.mockResolvedValueOnce();
  const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
  let pending!: Promise<boolean>;
  act(() => { pending = result.current.loadFromUrl('https://example.com/project/scene.tar'); });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS);
    expect(await pending).toBe(true);
  });
  // Settings inside the archive are the dataset's own; nothing is fetched beside it.
  expect(request.mock.calls.map(([url]) => String(url))).toEqual(inside ? [] : ['https://example.com/project/colmapview.yaml']);
  expect(settingsTimeoutWarnings()).toHaveLength(warnings);
});
```

**Dependency notes:** none.

### C16 — useUrlLoader: pin exactly one warning, not `toContainEqual`

**Verified.** The `toContainEqual` and `not.toContainEqual` checks at :543-544, :768-769 and :773-774 would not catch a stacked duplicate warning.

**Change.** Add a file-level helper next to `hubEntries`:

```ts
/** Timeout warnings on screen; pinning the whole list catches a stacked duplicate. */
function settingsTimeoutWarnings() {
  return useNotificationStore.getState().notifications
    .filter(notification => notification.message === OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE);
}
```

Then replace the assertions:

```ts
expect(settingsTimeoutWarnings()).toEqual([expect.objectContaining({ type: 'warning' })]); // :543, :768
expect(settingsTimeoutWarnings()).toEqual([]);                                             // :773 (next load removed it)
```

**Dependency notes:** none.

### C17 — reconstructionStore: `setSourceViewerState` with no `droppedFiles`, and with `null`

**Verified.** `setSourceViewerState` at reconstructionStore.ts:360-363 stores `{files, state}` only when both are present. The existing test at :108-126 never calls it without files, and never calls it with `null`.

**Mutation:** store the state even without files. Only the new test fails.

**Change** (after the :108 test):

```ts
it('keeps saved source settings only while files are loaded, and forgets them on null', () => {
  const state: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null, config: { ui: { backgroundColor: '#123456' } } };
  // Without files there is nothing for Reload to re-read, so nothing to bind the settings to.
  useReconstructionStore.getState().setSourceViewerState(state);
  expect(useReconstructionStore.getState().sourceViewerState).toBeNull();

  const files = new Map([['cameras.bin', new File([''], 'cameras.bin')]]);
  useReconstructionStore.getState().setDroppedFiles(files);
  useReconstructionStore.getState().setSourceViewerState(state);
  expect(useReconstructionStore.getState().sourceViewerState).toEqual({ files, state });

  // A load without saved settings replaces the previous dataset's.
  useReconstructionStore.getState().setSourceViewerState(null);
  expect(useReconstructionStore.getState().sourceViewerState).toBeNull();
});
```

**Dependency notes:** low risk. Track A keeps or extends the Reload state; if A changes how `sourceViewerState` binds, adapt this test.

### C18 — abortSignals.test.ts: identity of the released listener

**Verified.** The assertion at :46 is `expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))`.

**Mutation:** remove a *different* function (`() => onAbort(event)`), which leaks the real listener. The original test **still passes**; the new one fails.

**Change:**

```ts
const add = vi.spyOn(second.signal, 'addEventListener');
const remove = vi.spyOn(second.signal, 'removeEventListener');
anySignal([first.signal, second.signal]);
expect(add).toHaveBeenCalledOnce();
const [type, listener] = add.mock.calls[0];
first.abort();
// The very listener it registered, so the surviving input no longer holds the combined signal.
expect(remove).toHaveBeenCalledExactlyOnceWith(type, listener);
```

**Dependency notes:** none.

---

## Part 3 — Flaky tests under parallel load

### Measurements

The current config sets no `testTimeout`, so the default is 5 s. `maxWorkers` defaults to `availableParallelism() - 1`, which is **19 on this 20-thread machine**. CI runs on ubuntu-latest with 4 vCPUs, which gives 3 workers.

| Test | Alone | Full suite (19 workers) | 3 suites at once (57 workers) | Reported flake | Budget |
|---|---|---|---|---|---|
| sparkImportBoundary 'names the spark package…' | 52 ms | 201 ms | 441–891 ms | **24.4 s** | 15 s |
| sparkImportBoundary 'gates every spark download…' | 57 ms | 160 ms | 469–739 ms | (one of the two) | 15 s |
| prepareArchive test 1 | 33 ms | 173 ms | 140–353 ms | **5.4 s** | 5 s |
| useFileDropzone 'keeps None through actual…' | 1.1 s | 1.37 s | **4.83 s** (near miss) | — | 5 s |

Three concurrent full suites took about 5 min of wall time and did **not** reproduce the two recorded failures. They did produce an unrelated flake (X5). The recorded failures came from heavier contention: the SDD session ran an implementer's full suite while codex reviews ran their own suite and builds.

One measurement was decisive. The **first** scan by sparkImportBoundary over a freshly written copy of `src/` took **7,035 ms standalone**; the next run took 72 ms. A whole-tree synchronous read is dominated by per-file I/O latency on a cold or just-edited tree (cold cache or on-access AV scan). That latency, not CPU, produces 100–400× slowdowns. It is exactly the state right after agents edit files.

### F1 — `src/utils/sparkImportBoundary.test.ts` (24.4 s against 15 s)

**Verified.** Two tests, at :101-126 and :160-181, each call `collectSourceFiles(SRC_ROOT)` and `readFileSync` **every** production file: 820 `.ts`/`.tsx` files, 3.6 MB. The budget is `SPARK_IMPORT_SCAN_TIMEOUT_MS = 15_000` at :40.

Profile of one scan, outside Vitest:

| Phase | Time |
|---|---|
| walk | 10–16 ms |
| reads | **47–74 ms (≈85%)** |
| `stripComments` over all files (the second test strips every file before its substring check) | 5–7 ms |

**Root cause:**

- The suite does synchronous, sequential whole-tree I/O inside test bodies, twice per run.
- On a cold or contended file system, each read waits on disk and AV latency.
- Vitest cannot pre-empt a synchronous test. It checks the budget only after the function returns (`runWithTimeout`, hence a "timeout" reported at 24.4 s), so the budget guards nothing; it only converts slowness into failure.

Sharing a cache between the two tests is **not enough**. The first test would still pay a full scan, so the worst case is unchanged.

**Change:** read once at collection time. Module scope runs during file collection, and no per-test timeout applies there. Both checks then filter the sources in memory.

```ts
// delete: const SPARK_IMPORT_SCAN_TIMEOUT_MS = 15_000;

// after toRepoRelative():
// Walked and read once, while this file is collected: no per-test timeout applies there, and both
// whole-tree checks below then filter the same in-memory sources in milliseconds. The reads are
// most of the scan, and on a loaded machine (or a cold, just-edited tree) one in-test scan took
// 24.4 s against a 15 s budget. Vitest cannot interrupt a synchronous test, so a budget on it only
// turns a slow-but-correct run into a failure.
const PRODUCTION_SOURCES = collectSourceFiles(SRC_ROOT).map((file) => ({
  relativePath: toRepoRelative(file),
  source: readFileSync(file, 'utf8'),
}));
```

Test 1:

```ts
for (const { relativePath, source: rawSource } of PRODUCTION_SOURCES) {
  if (relativePath === RUNTIME_MODULE_PATH) continue;
  // (existing comment)
  if (!rawSource.includes(SPARK_PACKAGE)) continue;
  // … unchanged …
}
expect(violations).toEqual([]);
});   // no timeout argument
```

Test 4:

```ts
for (const { relativePath, source: rawSource } of PRODUCTION_SOURCES) {
  if (DOCUMENTED_NON_DOWNLOAD_PRELOAD_SITES.has(relativePath)) continue;
  // Same cheap pre-check as above: stripping comments never adds a call.
  if (!rawSource.includes(`${SPARK_PRELOAD_ENTRYPOINT}(`)) continue;

  const source = stripComments(rawSource);
  // … unchanged …
}
expect(violations).toEqual([]);
});   // no timeout argument
```

The pre-check is sound. `stripComments` replaces a block comment with a space and a line comment with nothing up to the newline, so it can never *form* `preloadSparkModule(`.

**Validated:**

- The tests now take 2–4 ms each, with the scan moved into "import" (about 107 ms).
- **Mutation:** a NEED gate in SplatLayer.tsx is still caught by test 4.
- **Mutation:** a static `@sparkjsdev/spark` import in `src/utils/download.ts` is still caught by test 1.

**Alternatives rejected:**

- *Async reads.* componentStoreBoundary already uses them, and it was *slower* under load: 2.4 s against 0.36 s in the same full run.
- *A larger timeout.* It masks the cost and keeps the work.

**Same class, not in scope:** `src/components/componentStoreBoundary.test.ts` fills its cache inside the first test with a 15 s budget (2.4 s in a normal full run). The same collection-time pattern (a top-level `await` of the scan) would apply.

**Dependency notes:** none.

### F2 — `src/features/googleDrive/prepareArchive.test.ts`, test 1 (5.4 s against 5 s)

**Verified:**

- prepareArchive.ts:78 runs `const sdk = await import('@huggingface/hub');` lazily, on purpose, for bundle splitting.
- Test 1 at :24-34 is the first to call `prepareDriveArchive` in each fresh worker, so it pays the cold SDK load: **19–20 ms alone, 0.1 ms warm**. That is about 60% of test 1's 33 ms.
- Its remaining work is a COLMAP binary export plus a size check.

**Root cause:** a one-time cold module load is charged to whichever test first calls the lazy import, inside the 5 s default budget. Module loading (disk, parse, link) degrades by orders of magnitude under host contention, which is the same mechanism as F1.

**Change:** warm the SDK at collection time.

```ts
import { ARCHIVE_SIZE_LIMIT } from '../../utils/zipValidation';
// prepareDriveArchive imports the Hub SDK lazily; load it with the file so the first test's budget
// does not absorb a cold module load under parallel runs.
import '@huggingface/hub';
```

**Validated:** test 1 dropped from 33–35 ms to 10–22 ms, all 6 tests pass, and ESLint is clean. Do not change the production lazy import.

**Rejected:**

- *Mocking `@huggingface/hub`.* Test 2 exercises the real `datasetInfo` and `listFiles` over fake fetch.
- *A per-test timeout.* It is a band-aid for a known one-time cost.

**Dependency notes:** none.

### F3 — useFileDropzone.test.ts 'keeps None through actual local COLMAP commit…' (found while verifying; same class)

**Verified.** `vi.importActual('./fileDropzoneWorkflow')` inside the test takes **976–1069 ms of its 1.1 s**. The file mocks that module, so the real module graph is transformed cold inside the test. It reached **4,834 ms against the 5 s budget** in the 3-suite run, the closest default-budget test to failing.

**Change:** hoist the import to module scope as a top-level `await`. The code is in N4.

**Validated:** the test now takes 87–88 ms, and the cost moved to the import phase.

**Dependency notes:** none.

### Config-level options (measured; not recommended as the fix)

- **Cap `maxWorkers`.** At `--maxWorkers=50%` (10 workers) a single full run takes **131 s, against 107 s** at the default 19 (+22%). A cap would reduce oversubscription when several agents run suites at once. It would not help cold-cache I/O, and it slows the common case. CI with 3 workers is unaffected either way.
  - Suggestion instead: agents running *concurrent* suites can pass `--maxWorkers=50%` on the CLI.
- **Raise the global `testTimeout`.** This would delay hang detection for every async test and hide real slowdowns. Not recommended.
- **Policy worth recording in test conventions:** *one-time costs belong to collection (module scope), not to the first test's budget.* That covers cold `import()` of lazily loaded SDKs, `vi.importActual` of a mocked module, and whole-tree file scans.

---

## Part 4 — Type errors in test files

### Current typecheck coverage

- `tsc -b` runs in `typecheck`, in `build`, and therefore in CI's `npm run check`.
- `tsconfig.app.json` excludes `src/**/*.test.ts`, `src/**/*_test.ts` and `src/test/cssRootTokens.ts`, but **not `*.test.tsx`**.
- So the **70 `.test.tsx` files and the 7 builder modules are type-checked**, under the app config with DOM types and no Node types. The **496 `.test.ts` files are never type-checked.** `tsc -p tsconfig.app.json --listFilesOnly` shows 70 / 0 / 7.
- Vitest strips types without checking them. ESLint uses non-type-aware `tseslint.configs.recommended`.
- The exclude comment's claim that tests are "checked by vitest" is therefore inaccurate.

### Measuring a test-inclusive typecheck

A scratch `tsconfig.test.json` extends the app config with `"types": ["vite/client", "node"]`, `"include": ["src"]`, `"exclude": []` and `"tsBuildInfoFile": null`.

On the pristine tree it reports **232 errors in 63 files**. The main kinds are:

| Code | Count | Note |
|---|---|---|
| TS2345 | 46 | |
| TS2339 | 36 | |
| TS2322 | 34 | |
| TS2304 | 26 | all `vi` used as a global in builders.test.ts, which relies on `globals: true` |
| TS18048 | 22 | |

The largest files are:

| File | Errors |
|---|---|
| cameraModelConversions.test.ts | 34 |
| visibleSplatRendererAdapter.test.ts | 33 |
| builders.test.ts | 27 |
| nodes.test.ts | 13 |
| zipLoader.test.ts | 12 |

### T1 — `src/utils/zipLoader.test.ts`: TS2345 `ArchiveReader` mismatch

**Verified.** There are 12 errors:

- TS2345 at :41, 55, 67, 78, 91, 102, 110, 146, 167, 182 and 218, all `vi.mocked(Archive.open).mockResolvedValue(buildArchiveReader(…))`
- TS2322 at :126

**Root cause:** libarchive.js 2.0.2 ships its own types. `Archive.open(file): Promise<ArchiveReader>` returns a **class with private fields** (`node_modules/libarchive.js/dist/build/compiled/archive-reader.d.ts`), and no object literal can satisfy one.

`src/types/libarchive.d.ts` has top-level exports, which makes its `declare module 'libarchive.js' { … }` (:5-40) an *augmentation*. Its duplicate `class Archive` does not replace the shipped one. With `skipLibCheck: false` this shows up as "Duplicate identifier 'Archive' / 'ArchiveOptions'", which `skipLibCheck: true` hides today.

Production compiles because the class is assignable *to* the local `ArchiveReader` interface (:55-61). The test fakes go the other direction. Only zipLoader.test.ts mocks `Archive.open`.

**Cheapest correct fix:** a single typed mock handle in the test, with no builder change. `buildArchiveReader` keeps returning the local interface that every other consumer uses.

```ts
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ArchiveReader } from '../types/libarchive';

vi.mock('libarchive.js', () => ({ Archive: { init: vi.fn(), open: vi.fn() } }));
// libarchive.js types Archive.open with its ArchiveReader class, whose private fields no fake can
// satisfy. zipLoader only uses the reader through the local ArchiveReader interface.
const openArchive = vi.mocked(Archive.open) as unknown as Mock<(file: File) => Promise<ArchiveReader>>;
```

Then replace every `vi.mocked(Archive.open)` with `openArchive`: 12 sites, including `openArchive.mock.calls[0][0].name` at :175.

**Validated:** 0 errors in this file under the test config, 24/24 tests pass, and ESLint is clean.

**Rejected:** typing `buildArchiveReader` as `Awaited<ReturnType<typeof Archive.open>>` via a cast. Every fake would then claim to be the private-field class, and the builders would import libarchive.js.

**Optional cleanup (production-adjacent, types only):** delete the stale augmentation block at :5-40 of `src/types/libarchive.d.ts`. In the mirror, `tsc -p tsconfig.app.json` still passes without it. On its own it does not fix T1.

**Dependency notes:** none.

### T2 — `src/test/builders` fakes

**Verified.** Under the test config there are **6** errors; the brief said "about 8", and the difference may be a different type environment. They exist only when `@types/node` is in scope. `tsc -b` (app config, no Node types) is clean for these files.

- **fileFakes.ts:281 and :383** (TS2416), plus their knock-on errors at :402, :412 and :621. `*[Symbol.iterator](): IterableIterator<T>` does not match DOM's `ArrayIterator<T>`, which Node's typings extend with `[Symbol.dispose]`.
- **browserFakes.ts:472** (TS2741). `typeof setTimeout` under Node carries `__promisify__`.

**Fix** (correct in both environments):

```ts
// fileFakes.ts, TestFileList
[Symbol.iterator](): ArrayIterator<File> {
  return this.files[Symbol.iterator]();
}
// fileFakes.ts, TestDataTransferItemList
[Symbol.iterator](): ArrayIterator<DataTransferItem> {
  return this.items[Symbol.iterator]();
}
// browserFakes.ts, buildSetTimeoutImplementation
const implementation = (handler: TimerHandler, timeout?: number) => {
  onSchedule(handler, timeout);
  return handle;
};
// With Node types in scope, setTimeout also carries a promisify helper the fake never needs.
return implementation as unknown as typeof setTimeout;
```

A plain `as typeof setTimeout` fails with TS2352, so the double cast is required.

**Validated:**

- The test config drops from 232 to **214** errors (zipLoader 12 → 0, fakes 6 → 0).
- `tsc -p tsconfig.app.json` still reports 0 errors.
- The affected suites pass: builders, zipLoader, imageZipExport, reconstructionZipExport, writers, fileDropzoneDropPayload and useFileDropzone, 97 tests.

**Dependency notes:** none.

### T3 — Should test files be type-checked? Recommendation

Yes, eventually. The 232 errors include real drift: fakes that cannot match the APIs they stand in for, and mocks typed against the wrong `ArchiveReader`. It is **not trivial** today, though, because 214 errors remain across about 58 files after T1 and T2. So do not wire it into CI in this track.

Proposed follow-up, as a separate backlog task:

1. Add `tsconfig.test.json`: extend the app config, `"types": ["vite/client", "node"]`, include `src`, no test excludes, `tsBuildInfoFile` under `node_modules/.tmp`.
2. Add `"typecheck:test": "tsc -p tsconfig.test.json --noEmit"`. It takes about 25 s locally.
3. Fix the errors file by file. The largest buckets are the four files listed above, and adding `vi` to the vitest import in builders.test.ts clears 26.
4. When it is clean, add it to `npm run check`, or add it as a reference in `tsconfig.json` so `tsc -b` covers it.
5. Also fix the misleading exclude comment in `tsconfig.app.json`, and decide deliberately whether `*.test.tsx` should stay in the app project.

---

## Part 5 — Extra findings (optional or out of scope)

- **X1 (optional, cheap; validated).** Two files already being touched still print:
  - **zipLoader.test.ts,** 4 × `[Archive Loader] Skipping unavailable or oversized colmapview.yaml settings.` from the `it.each(['oversized','unreadable'])` test at :76. Fix: add `import { appLogger } from './logger';`, change the describe.each `afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });`, and in that test spy on `appLogger.warn` and add `expect(warn).toHaveBeenCalledExactlyOnceWith('[Archive Loader] Skipping unavailable or oversized colmapview.yaml settings.');`.
  - **prepareArchive.test.ts,** 3 × `[Export] No points3D data available for export` (reconstructionExportData.ts:28; the fixture reconstructions have no points). Fix:

    ```ts
    import { appLogger } from '../../utils/logger';
    beforeEach(() => {
      vi.stubGlobal('Blob', NodeBlob);
      // The fixture reconstructions have no 3D points, which the COLMAP export notes as a warning.
      vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
    ```

  With X1 applied, all 16 touched suites are pristine.
- **X2 (out of scope): the other noisy files in the full run**, with block counts:

  | File | Blocks | Content |
  |---|---|---|
  | urlLoaderManifestFetch.test.ts | 7 | `[URL Loader] Optional file …` |
  | useSceneContextMenuController.test.ts | 7 | 13 act warnings |
  | reconstructionAuthority.test.ts | 5 | `[WASM] Parsed …` |
  | useAsyncImageCache.test.ts | 5 | `Idle callback …` |
  | GoogleDrivePublishModal.test.tsx | 4 | 8 act warnings |
  | zipImageFiles.test.ts | 3 | |
  | cameras.test.ts | 2 | |
  | SplatLayer.test.tsx | 2 | |
  | reconstructionService.test.ts, imageSourceResolution.test.ts, asyncImageCacheScheduler.test.ts, publicationMetadata.test.ts, preparePublication.test.ts, SplatPsnrEvaluator.test.tsx | 1 each | |

  The raw log is `<scratchpad>/full_default.log`. Before claiming a *suite-wide* pristine output, a separate sweep is needed.
- **X3 (types cleanup, optional).** Remove the stale `declare module 'libarchive.js'` augmentation; see T1.
- **X4 (pre-existing, ledger ⚠️).** TransformPanel's Reload skips `confirmReload()`. The C12 test is written to survive that fix.
- **X5 (new load flake observed).** `src/components/viewer3d/ViewerToolModals.test.tsx` 'loads open tool modals and passes their close handlers' failed once in the 3-suite run: "Unable to find an element by: [data-testid="deletion-modal"]". `findByTestId` has a 1 s default, and the modals are lazily imported, so this is the same cold-import class.
  - Fix idea: statically import the lazy modal modules in that test file, or pass `{ timeout }` to `findBy*`.
  - Also near budget: `src/parsers/integrity.test.ts` reached 10.9 s against `FIXTURE_SUITE_TIMEOUT_MS = 15000` under triple load.

---

## Dependency matrix (production tracks)

| Item | A: Reload keeps selection (local + None) | B: store helpers (COLMAP only, renderer-owns-progress) | C: nav fields before early fly-to |
|---|---|---|---|
| N1, C3, C4, C15, C16 (useUrlLoader.test.ts) | — | — | same file: land first or rebase (assertions unchanged) |
| N2, C13, C14 (urlLoaderViewerState) | — | — | — |
| N3, C2 (datasetAccess) | — | — | — |
| N4, F3 (useFileDropzone.test.ts) | A adds Reload tests here; land first | — | — |
| C1, C5, C17 (reconstructionStore.test.ts) | C17: low | **regression net: land before B** | — |
| C6 (urlError kept when renderer owns progress) | — | **B decides; keep or flip one assertion** | — |
| C7 (carry-over merge test) | **A must keep; adapt if renamed. Don't pin local-default or lost-None** | — | — |
| C8–C11 (workflow) | **A's base (`loadedFilesStore`); land before A or give to A** | — | — |
| C12 (Reload buttons, facades) | adapt if `reloadFiles` signature changes | — | — |
| C18, F1, F2, T1, T2, X1 | — | — | — |

## Recommended task grouping

The file sets are disjoint, so the four tasks can run in parallel. Each ends with the full `vitest run` (deploy CI runs it), `npm run lint` and `tsc -b`.

1. **Task R2-1: URL loader and settings test hygiene.** N1–N3, C2, C3, C4, C13–C16.
   - Files: `src/hooks/useUrlLoader.test.ts`, `src/hooks/urlLoaderViewerState.test.ts`, `src/features/huggingface/datasetAccess.test.ts`.
   - Before Track C, or coordinate the rebase.
2. **Task R2-2: Drop and Reload tests.** N4, F3, C7–C12.
   - Files: `src/hooks/useFileDropzone.test.ts`, `src/hooks/fileDropzoneWorkflow.test.ts`, `src/utils/splatFileSourcePolicy.test.ts`, `src/components/viewer3d/panels/TransformPanel.test.tsx`, `src/components/viewer3d/panels/ExportPanel.test.tsx` (new), `src/components/viewer3d/contextMenu/useGlobalContextMenuActionStoreFacade.test.ts`, `src/components/viewer3d/useTransformGizmoStoreFacade.test.ts`.
   - **Land before production Track A** (A builds on `loadedFilesStore` and C7–C9), or merge into A's first task.
3. **Task R2-3: store cancellation and selection pins.** C1, C5, C6, C17.
   - File: `src/store/reconstructionStore.test.ts`.
   - **Land before production Track B**; B's reviewer re-runs it after the helper extraction (C6 is B's decision point).
4. **Task R2-4: flakes and types.** F1, F2, T1, T2, C18, plus X1.
   - Files: `src/utils/sparkImportBoundary.test.ts`, `src/features/googleDrive/prepareArchive.test.ts`, `src/utils/zipLoader.test.ts`, `src/test/builders/fileFakes.ts`, `src/test/builders/browserFakes.ts`, `src/utils/abortSignals.test.ts`.
   - Independent.
5. **Backlog (separate plan):**
   - T3 (test-inclusive typecheck: 214 errors, ~58 files)
   - X2 (16 other noisy files)
   - X3 (libarchive augmentation)
   - X5 (ViewerToolModals findBy, integrity budget)
   - the componentStoreBoundary collection-time scan (same as F1)
