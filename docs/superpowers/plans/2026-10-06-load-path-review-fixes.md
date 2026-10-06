# Load-Path Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the nine load-path regressions (F1–F9) found in the review of `v0.15.4..0a1d01c` so cancelling, opening, restoring and reloading datasets behave as they did before or better.

**Architecture:**
- A small `anySignal()` helper replaces every `AbortSignal.any` call, and a lint rule keeps it that way.
- The reconstruction store gains two actions:
  - `cancelLoading` stops in-flight work without touching the scene.
  - `offerSplatPicker` opens the picker; the URL loader calls it only after restoration has settled.
- Hugging Face requests go through the existing token-aware `fetchDatasetResource`. The access pre-check becomes fatal only for definitive answers.
- Reload passes an explicit `preserveRemoteSplatSources` option. A pure policy helper then carries remote splat tiles across the re-parse.
- Reload also re-applies a URL dataset's saved settings. The store retains them bound to the dataset's file map, as a local project's `colmapview.yaml` already would be.
- The optional settings request is split into a "start" step and a "settle with deadline" step, so its deadline begins when the result is needed. Transport timeouts count as timeouts.

**Tech Stack:** TypeScript 5, React 19, Zustand, Vitest 4 (jsdom) with Testing Library, ESLint 9 flat config.

**Spec:** `docs/superpowers/specs/2026-10-06-load-path-review-fixes-design.md`

## Global Constraints

- **Working directory:** run every command from `colmap-webview/`.
  - Single test file: `npx vitest run <path>`.
  - Full suite: `npx vitest run`.
  - Type check: `npx tsc -b --force`.
  - Lint: `npm run lint`.
  - Build: `npm run build`.
- **Baseline:** before this work, 564 test files and 4,343 tests pass. Nothing may regress.
- **Store access:** components reach Zustand stores only through `*StoreFacade` modules. `src/components/componentStoreBoundary.test.ts` enforces this.
- **Styling:** add no CSS classes. Styling is hand-written CSS in `src/index.css`, and `classContract.test.ts` enforces that every referenced class is defined.
- **Comments:** comment density matches the surrounding code. Write a short "why" comment only where behavior is non-obvious. Never narrate the change.
- **Commits:** one commit per task.
  - The message summarizes the user-visible fix and ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Never push. Never amend.
- **`AbortSignal.any`:** after Task 1, no code may call it directly. Use `anySignal` from `src/utils/abortSignals.ts`.

## Review Focus

1. **Cancel when nothing is in flight**, for example a double click or a stale overlay. Only the loading state resets; nothing throws. *Task 2.*
2. **Cancel immediately followed by a new load.** The new load runs normally, and the cancelled loader's cleanup cannot end or hide it. *Task 2.*
3. **An automatically chosen splat fails to download.** The error stays visible and the picker opens, so the user can retry or pick another tile. *Task 4.*
4. **Reload while the active splat is a byte-less placeholder** (phones). The placeholder stays active with no re-download, and the overlay does not stick. *Task 6.*
5. **`settle()` is called twice, or after the settings already arrived.** Both calls return the same result immediately, and no second deadline starts. *Task 7.*

---

### Task 1: Replace `AbortSignal.any` with a fallback-safe `anySignal` (F3)

**Files:**
- Create: `src/utils/abortSignals.ts`
- Create: `src/utils/abortSignals.test.ts`
- Modify, one line each:
  - `src/features/huggingface/auth.ts:122`
  - `src/features/huggingface/http.ts:24`
  - `src/features/huggingface/transferTimeout.ts:17`
  - `src/hooks/fileDropzoneWorkflow.ts:274-275`
  - `src/hooks/urlLoaderManifestSource.ts:75`
  - `src/hooks/urlLoaderViewerState.ts:26`
  - `src/hooks/useUrlLoader.ts:119-120`
  - `src/utils/zipValidation.ts:43`
- Modify: `eslint.config.js`, the rules of the `files: ['**/*.{ts,tsx}']` block.

**Interfaces:**
- Produces: `export function anySignal(signals: readonly AbortSignal[]): AbortSignal`. It aborts with the reason of the first input to abort, and is already aborted if any input already is.

- [ ] **Step 1: Write the failing test** — `src/utils/abortSignals.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anySignal } from './abortSignals';

const nativeAny = Object.getOwnPropertyDescriptor(AbortSignal, 'any');

afterEach(() => {
  if (nativeAny) Object.defineProperty(AbortSignal, 'any', nativeAny);
});

describe.each(['native', 'fallback'] as const)('anySignal (%s)', mode => {
  beforeEach(() => {
    // Safari/iOS < 17.4, Chrome < 116 and Firefox < 124 have no AbortSignal.any.
    if (mode === 'fallback') Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true, writable: true });
  });

  it('is already aborted, with that reason, when an input is already aborted', () => {
    const idle = new AbortController();
    const stopped = new AbortController();
    stopped.abort('stopped');
    const signal = anySignal([idle.signal, stopped.signal]);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('stopped');
  });

  it('aborts once, with the first reason, when any input aborts later', () => {
    const first = new AbortController();
    const second = new AbortController();
    const signal = anySignal([first.signal, second.signal]);
    const onAbort = vi.fn();
    signal.addEventListener('abort', onAbort);
    expect(signal.aborted).toBe(false);
    second.abort('second');
    first.abort('first');
    expect(signal.reason).toBe('second');
    expect(onAbort).toHaveBeenCalledOnce();
  });
});

it('releases its listeners from the other inputs once it aborts (fallback)', () => {
  Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true, writable: true });
  const first = new AbortController();
  const second = new AbortController();
  const remove = vi.spyOn(second.signal, 'removeEventListener');
  anySignal([first.signal, second.signal]);
  first.abort();
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/abortSignals.test.ts`
Expected: FAIL, because `./abortSignals` cannot be resolved.

- [ ] **Step 3: Implement `src/utils/abortSignals.ts`**

```ts
type AbortSignalWithAny = typeof AbortSignal & { any?: (signals: AbortSignal[]) => AbortSignal };

/**
 * AbortSignal.any with a fallback for browsers that lack it (Safari/iOS < 17.4,
 * Chrome < 116, Firefox < 124). Aborts with the reason of the first input to abort.
 */
export function anySignal(signals: readonly AbortSignal[]): AbortSignal {
  const native = (AbortSignal as AbortSignalWithAny).any;
  if (typeof native === 'function') return native.call(AbortSignal, [...signals]);
  const controller = new AbortController();
  const aborted = signals.find(signal => signal.aborted);
  if (aborted) {
    controller.abort(aborted.reason);
    return controller.signal;
  }
  const onAbort = (event: Event) => {
    for (const signal of signals) signal.removeEventListener('abort', onAbort);
    controller.abort((event.target as AbortSignal).reason);
  };
  for (const signal of signals) signal.addEventListener('abort', onAbort);
  return controller.signal;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/abortSignals.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Replace all eight call sites.** In each file, add the import and rewrite the one expression. Keep the rest of the line unchanged.

| File | Import | Replace | With |
|---|---|---|---|
| `src/features/huggingface/auth.ts` | `import { anySignal } from '../../utils/abortSignals';` | `AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)])` | `anySignal([controller.signal, AbortSignal.timeout(180_000)])` |
| `src/features/huggingface/http.ts` | `import { anySignal } from '../../utils/abortSignals';` | `AbortSignal.any([signal, AbortSignal.timeout(timeout)])` | `anySignal([signal, AbortSignal.timeout(timeout)])` |
| `src/features/huggingface/transferTimeout.ts` | `import { anySignal } from '../../utils/abortSignals';` | `AbortSignal.any([signal, timeout.signal])` | `anySignal([signal, timeout.signal])` |
| `src/hooks/fileDropzoneWorkflow.ts` | `import { anySignal } from '../utils/abortSignals';` | `AbortSignal.any([job.signal, normalizedOptions.signal])` | `anySignal([job.signal, normalizedOptions.signal])` |
| `src/hooks/urlLoaderManifestSource.ts` | `import { anySignal } from '../utils/abortSignals';` | `AbortSignal.any([deps.signal, settingsController.signal])` | `anySignal([deps.signal, settingsController.signal])` |
| `src/hooks/urlLoaderViewerState.ts` | `import { anySignal } from '../utils/abortSignals';` | `AbortSignal.any([signal, controller.signal])` | `anySignal([signal, controller.signal])` |
| `src/hooks/useUrlLoader.ts` | `import { anySignal } from '../utils/abortSignals';` | `AbortSignal.any([signal, init.signal])` | `anySignal([signal, init.signal])` |
| `src/utils/zipValidation.ts` | `import { anySignal } from './abortSignals';` | `AbortSignal.any([controller.signal, options.signal])` | `anySignal([controller.signal, options.signal])` |

Then confirm that nothing is left: `grep -rn "AbortSignal\.any" src`. Expected: no output.

- [ ] **Step 6: Add the lint guard.** In `eslint.config.js`, in the first config object (`files: ['**/*.{ts,tsx}']`), add this entry to `rules`, next to `@typescript-eslint/no-unused-vars`:

```js
      'no-restricted-properties': ['error', {
        object: 'AbortSignal',
        property: 'any',
        message: 'Use anySignal() from src/utils/abortSignals: AbortSignal.any is missing on Safari/iOS < 17.4.',
      }],
```

Prove the rule fires, then remove the probe:

```bash
printf 'export const probe = AbortSignal.any([]);\n' > src/utils/abortSignalsLintProbe.ts
npx eslint src/utils/abortSignalsLintProbe.ts; echo "exit=$?"
rm src/utils/abortSignalsLintProbe.ts
```

Expected: one `no-restricted-properties` error and `exit=1`.

- [ ] **Step 7: Run the affected tests and lint**

Run: `npx vitest run src/utils src/hooks src/features/huggingface && npm run lint`
Expected: all PASS, and lint reports no errors.

- [ ] **Step 8: Commit**

```bash
git add src/utils/abortSignals.ts src/utils/abortSignals.test.ts src/features/huggingface/auth.ts src/features/huggingface/http.ts src/features/huggingface/transferTimeout.ts src/hooks/fileDropzoneWorkflow.ts src/hooks/urlLoaderManifestSource.ts src/hooks/urlLoaderViewerState.ts src/hooks/useUrlLoader.ts src/utils/zipValidation.ts eslint.config.js
git commit -m "Open datasets on browsers without AbortSignal.any

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: "Cancel loading" stops only the work in progress (F1, F2)

**Files:**
- Modify: `src/store/reconstructionStore.ts`. Change the interface (near line 233, next to `clear`), add the action next to `clear` (near line 568), and add `isSplatLoadingProgressForFile` to the existing `../utils/splatLoadingProgressPolicy` import (line 29).
- Modify: `src/components/dropzone/useDropZoneStoreFacade.ts` (replace `clear` with `cancelLoading`).
- Modify: `src/components/dropzone/DropZone.tsx:38-41,290`.
- Test: `src/store/reconstructionStore.test.ts` (new `describe` block at the end of the file).
- Test: `src/components/dropzone/useDropZoneStoreFacade.test.ts`.
- Test: `src/components/dropzone/DropZone.test.tsx`.

**Interfaces:**
- Produces: the store action `cancelLoading: () => void`. It aborts:
  - the URL-load controller,
  - the lazy splat download (`cancelPendingSplatLoad`),
  - the pending reconstruction job (`cancelPendingReconstructionLoad`).

  It resets `urlLoading`, `urlLoadActive`, `urlLoadController` and `urlProgress`. When the renderer is still decoding the active splat, it clears that splat and bumps `splatSelectionRevision`. When `reconstruction` is null, it strips `?url=`/`#d=` from the address bar.
- Produces: `DropZoneStoreFacadeActions.cancelLoading` replaces `DropZoneStoreFacadeActions.clear`.

- [ ] **Step 1: Write the failing store tests.** Add these imports to the top of `src/store/reconstructionStore.test.ts`, keeping the existing ones:

```ts
import { beginReconstructionLoad } from '../wasm/reconstructionLoadLifecycle';
import type { ReconstructionSource } from '../wasm/reconstructionService';
import { getSplatLoadingProgress } from '../utils/splatLoadingProgressPolicy';
import { buildReconstruction } from '../test/builders';
```

If the existing `import { buildArchiveReader } from '../test/builders';` line is present, merge `buildReconstruction` into it. Then append this block:

```ts
describe('reconstruction store loading cancellation', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  afterEach(() => {
    useReconstructionStore.getState().clear();
    window.history.replaceState(null, '', '/');
    vi.unstubAllGlobals();
  });

  it('stops a URL load without touching the scene already on screen', async () => {
    const loadedFiles = baseLoadedFiles({});
    const droppedFiles = new Map([['cameras.bin', loadedFiles.camerasFile!]]);
    const dispose = vi.fn();
    const archive = buildArchiveReader();
    const close = vi.spyOn(archive, 'close');
    setActiveZipArchive(archive, new Map());
    useReconstructionStore.setState({
      reconstruction: buildReconstruction(), loadedFiles, droppedFiles,
      wasmReconstruction: { dispose } as unknown as ReconstructionSource,
      sourceType: 'url', sourceUrl: 'https://example.com/old',
    });
    const signal = useReconstructionStore.getState().tryStartUrlLoad()!;
    useReconstructionStore.setState({ urlLoading: true, urlProgress: { percent: 40, message: 'Downloading...' } });

    useReconstructionStore.getState().cancelLoading();
    await Promise.resolve();

    const state = useReconstructionStore.getState();
    expect(signal.aborted).toBe(true);
    expect(state).toMatchObject({
      urlLoading: false, urlLoadActive: false, urlLoadController: null, urlProgress: null,
      loadedFiles, droppedFiles, sourceType: 'url', sourceUrl: 'https://example.com/old',
    });
    expect(state.reconstruction).not.toBeNull();
    expect(dispose).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(getActiveZipImageIndex()).not.toBeNull();
  });

  it('aborts a pending reconstruction parse', () => {
    const job = beginReconstructionLoad();
    useReconstructionStore.setState({ urlLoading: true, urlProgress: { percent: 20, message: 'Parsing COLMAP files...' } });
    useReconstructionStore.getState().cancelLoading();
    expect(job.signal.aborted).toBe(true);
    expect(useReconstructionStore.getState().urlLoading).toBe(false);
  });

  it('stops a lazy splat download and keeps the splat that was showing', async () => {
    const fileA = new File(['a'], 'a.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA, splatFiles: [fileA],
      splatFileSources: [
        { id: 'splats/a.ply', path: 'splats/a.ply', file: fileA },
        { id: 'splats/b.ply', path: 'splats/b.ply', url: 'https://x/ds/splats/b.ply', size: 20 },
      ],
    }));
    let requestSignal: AbortSignal | null | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      requestSignal = init?.signal;
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    })));
    const pending = useReconstructionStore.getState().selectSplatSource('splats/b.ply');
    await vi.waitFor(() => expect(requestSignal).toBeDefined());
    expect(useReconstructionStore.getState().urlLoading).toBe(true);

    useReconstructionStore.getState().cancelLoading();
    await pending;

    const state = useReconstructionStore.getState();
    expect(requestSignal?.aborted).toBe(true);
    expect(state.loadedFiles?.splatFile).toBe(fileA);
    expect(state.urlLoading).toBe(false);
    expect(state.urlError).toBeNull();
  });

  it('treats cancelling a splat the renderer is still decoding as choosing COLMAP only', () => {
    const fileA = new File(['a'], 'a.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA, splatFiles: [fileA],
      splatFileSources: [{ id: 'splats/a.ply', path: 'splats/a.ply', file: fileA }],
    }));
    useReconstructionStore.setState({ urlLoading: true, urlProgress: getSplatLoadingProgress(fileA, { startPercent: 60 }) });
    const revision = useReconstructionStore.getState().splatSelectionRevision;

    useReconstructionStore.getState().cancelLoading();

    const state = useReconstructionStore.getState();
    expect(state.loadedFiles?.splatFile).toBeUndefined();
    expect(state.loadedFiles?.splatFileSources?.map(source => source.id)).toEqual(['splats/a.ply']);
    expect(state.splatSelectionRevision).toBe(revision + 1);
    expect(state.urlLoading).toBe(false);
  });

  it('returns to the landing page when a startup link is cancelled before anything loaded', () => {
    window.history.replaceState(null, '', '/?url=https%3A%2F%2Fexample.com%2Fscene');
    useReconstructionStore.setState({ urlLoading: true, urlProgress: { percent: 0, message: 'Initializing...' } });
    useReconstructionStore.getState().cancelLoading();
    expect(hasUrlToLoad()).toBe(false);
    expect(useReconstructionStore.getState().urlLoading).toBe(false);
  });

  it('keeps the address bar when a scene is already loaded', () => {
    window.history.replaceState(null, '', '/?url=https%3A%2F%2Fexample.com%2Fscene');
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), urlLoading: true,
      urlProgress: { percent: 10, message: 'Downloading...' } });
    useReconstructionStore.getState().cancelLoading();
    expect(hasUrlToLoad()).toBe(true);
  });

  it('lets a new load start right after a cancel, and a second cancel is harmless', () => {
    const first = useReconstructionStore.getState().tryStartUrlLoad()!;
    useReconstructionStore.getState().cancelLoading();
    useReconstructionStore.getState().cancelLoading();
    const second = useReconstructionStore.getState().tryStartUrlLoad();
    expect(second).toBeInstanceOf(AbortSignal);
    // The cancelled loader's cleanup must not end the new load.
    useReconstructionStore.getState().finishUrlLoad(first);
    expect(useReconstructionStore.getState().urlLoadController?.signal).toBe(second);
    expect(second!.aborted).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/store/reconstructionStore.test.ts -t "loading cancellation"`
Expected: FAIL with `cancelLoading is not a function`.

- [ ] **Step 3: Implement `cancelLoading` in `src/store/reconstructionStore.ts`.**

Extend the progress-policy import:

```ts
import { getSplatDownloadProgress, getSplatPhaseProgress, isSplatLoadingProgressForFile } from '../utils/splatLoadingProgressPolicy';
```

Add to `interface ReconstructionState`, directly above `clear: () => void;`:

```ts
  /** Stop the load in progress (URL load, splat download, parse or splat decode) and keep the scene on screen. */
  cancelLoading: () => void;
```

Add the action directly above `clear: () => {`:

```ts
  cancelLoading: () => {
    const { urlLoadController, urlProgress, loadedFiles, reconstruction, splatSelectionRevision } = get();
    // With no tile download pending, splat progress for the active file means the renderer is
    // still decoding it; cancelling that leaves the scene without the splat (COLMAP only).
    const cancelsRendererDecode = !activeSplatController
      && isSplatLoadingProgressForFile(urlProgress, loadedFiles?.splatFile);
    cancelPendingSplatLoad();
    urlLoadController?.abort();
    cancelPendingReconstructionLoad();
    // A startup or shared link that never produced a scene would keep the landing page hidden.
    if (!reconstruction) clearUrlLoadRequestFromLocation();
    set({
      urlLoading: false,
      urlLoadActive: false,
      urlLoadController: null,
      urlProgress: null,
      ...(cancelsRendererDecode && loadedFiles ? {
        loadedFiles: clearActiveSplatFile(loadedFiles),
        requestedSplatSourceId: null,
        splatSelectionRevision: splatSelectionRevision + 1,
      } : {}),
    });
  },
```

- [ ] **Step 4: Run the store tests to verify they pass**

Run: `npx vitest run src/store/reconstructionStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing facade and DropZone tests.**

In `src/components/dropzone/useDropZoneStoreFacade.test.ts`, replace the first test (`'cancels an active URL request and clears its loading state'`) with the two tests below. Add `buildLoadedFiles` to the existing `../../test/builders/colmapBuilders` import.

```ts
  it('cancels an active URL request without clearing the loaded scene', () => {
    const loadedFiles = buildLoadedFiles();
    const reconstruction = buildReconstruction();
    useReconstructionStore.setState({ loadedFiles, reconstruction });
    const signal = useReconstructionStore.getState().tryStartUrlLoad()!;
    useReconstructionStore.getState().setUrlLoading(true);
    const { result } = renderHook(() => useDropZoneStoreFacade());
    act(() => { result.current.actions.cancelLoading(); });
    expect(signal.aborted).toBe(true);
    expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: false, urlLoadActive: false, loadedFiles, reconstruction });
  });

  it('shows the landing controls again after a startup link is cancelled', () => {
    window.history.replaceState(null, '', '/?url=https%3A%2F%2Fexample.com%2Fscene');
    useReconstructionStore.setState({ urlLoading: true });
    const { result, rerender } = renderHook(() => useDropZoneStoreFacade());
    expect(result.current.data.hasUrlLoadRequest).toBe(true);
    act(() => { result.current.actions.cancelLoading(); });
    // DropZone re-renders on urlLoading; the gate is read during that render.
    rerender();
    expect(result.current.data.hasUrlLoadRequest).toBe(false);
  });
```

In `src/components/dropzone/DropZone.test.tsx`:
- Replace every `actions: { setError: vi.fn(), clear: vi.fn() }` with `actions: { setError: vi.fn(), cancelLoading: vi.fn() }`.
- Replace the mock that binds the real store action (`clear: useReconstructionStore.getState().clear`) with `cancelLoading: useReconstructionStore.getState().cancelLoading`.
- Add `buildReconstruction` to the `../../test/builders` import.
- Append:

```tsx
describe('DropZone loading overlay', () => {
  it('cancels only the work in progress', () => {
    const cancelLoading = vi.fn();
    vi.mocked(useUrlLoader).mockReturnValue({
      loadFromUrl: vi.fn(), loadFromManifest: vi.fn(), urlLoading: true,
      urlProgress: { percent: 40, message: 'Downloading...' },
      urlError: null, clearUrlError: vi.fn(), setUrlLoading: vi.fn(), setUrlProgress: vi.fn(),
    });
    vi.mocked(useDropZoneStoreFacade).mockReturnValue({
      data: { error: null, reconstruction: buildReconstruction(), touchMode: false, hasUrlLoadRequest: false },
      actions: { setError: vi.fn(), cancelLoading },
    });
    render(<DropZone><div>Viewer</div></DropZone>);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel loading' }));
    expect(cancelLoading).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run src/components/dropzone/useDropZoneStoreFacade.test.ts src/components/dropzone/DropZone.test.tsx`
Expected: FAIL. The facade has no `cancelLoading`, and DropZone does not call it.

- [ ] **Step 7: Wire the facade and the button.**

In `src/components/dropzone/useDropZoneStoreFacade.ts`:
- Replace `clear: ReturnType<typeof useReconstructionStore.getState>['clear'];` with `cancelLoading: ReturnType<typeof useReconstructionStore.getState>['cancelLoading'];`.
- Replace `const clear = useReconstructionStore((s) => s.clear);` with `const cancelLoading = useReconstructionStore((s) => s.cancelLoading);`.
- Replace `clear,` in `actions` with `cancelLoading,`.

In `src/components/dropzone/DropZone.tsx`:
- In the facade destructuring, replace `clear,` with `cancelLoading,`.
- Change the button's handler to `onClick={cancelLoading}`.

- [ ] **Step 8: Run the dropzone tests and the store-boundary test**

Run: `npx vitest run src/components/dropzone src/components/componentStoreBoundary.test.ts src/store/reconstructionStore.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/store/reconstructionStore.ts src/store/reconstructionStore.test.ts src/components/dropzone/useDropZoneStoreFacade.ts src/components/dropzone/useDropZoneStoreFacade.test.ts src/components/dropzone/DropZone.tsx src/components/dropzone/DropZone.test.tsx
git commit -m "Keep the loaded scene when loading is cancelled

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Hugging Face requests — token-aware archive HEAD and a non-fatal access check (F4, F5)

**Files:**
- Modify: `src/utils/zipLoader.ts:277`, plus a new import.
- Modify: `src/utils/zipValidation.ts:20-24`, the `ZipUrlValidationOptions.fetchImpl` type.
- Modify: `src/features/huggingface/datasetAccess.ts:59-73`.
- Test: `src/utils/zipLoader.test.ts` (new `describe`).
- Test: `src/features/huggingface/datasetAccess.test.ts` (new cases).
- Test: `src/hooks/useUrlLoader.test.ts` (one new case).

**Interfaces:**
- Consumes: `fetchDatasetResource(url, timeout?, init?)` from `src/utils/fetchDatasetResource.ts`.
- Produces: `ZipUrlValidationOptions.fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>`.
- Produces: `checkHuggingFaceDatasetAccess` keeps its signature. It now resolves on 408, 429, 5xx, timeouts and network errors.

- [ ] **Step 1: Write the failing archive test.** In `src/utils/zipLoader.test.ts`, add `import { hfAuth } from '../features/huggingface/auth';` and append:

```ts
describe('private Hugging Face archive URLs', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('checks the archive size with the signed-in account before downloading', async () => {
    const url = 'https://huggingface.co/datasets/owner/private/resolve/main/scene.zip';
    vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue({ status: 'connected', identity: { username: 'owner' }, error: null });
    vi.spyOn(hfAuth, 'getReadAccessToken').mockReturnValue('reader-token');
    const request = vi.fn(async (_url: string, init?: RequestInit) =>
      new Headers(init?.headers).get('Authorization') === 'Bearer reader-token'
        ? new Response(null, { status: 200, headers: { 'content-length': '7' } })
        : new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', request);
    vi.mocked(downloadZip).mockResolvedValue(new Blob(['archive']));
    const archive = buildArchiveReader({ getFilesArray: async () => colmapEntries() });
    vi.mocked(Archive.open).mockResolvedValue(archive);

    await expect(loadZipFromUrl(url, vi.fn())).resolves.toMatchObject({ archive });
    const heads = request.mock.calls.filter(([, init]) => init?.method === 'HEAD');
    expect(heads).toHaveLength(2);
    expect(new Headers(heads[1][1]?.headers).get('Authorization')).toBe('Bearer reader-token');
  });
});
```

- [ ] **Step 2: Write the failing access-check tests.** In `src/features/huggingface/datasetAccess.test.ts`, add `import { HfError } from './http';` and append these tests inside `describe('Hugging Face private dataset reads', ...)`:

```ts
  it.each([408, 429, 500, 503])('lets the dataset files decide when the access check returns %s', async status => {
    const fetchImpl = vi.fn(async () => new Response(null, { status }));
    await expect(checkHuggingFaceDatasetAccess(info, fetchImpl)).resolves.toBeUndefined();
  });

  it('lets the dataset files decide when the Hub API cannot be reached', async () => {
    const fetchImpl = vi.fn(async (): Promise<Response> => { throw new TypeError('Failed to fetch'); });
    await expect(checkHuggingFaceDatasetAccess(info, fetchImpl)).resolves.toBeUndefined();
  });

  it.each([
    ['cancellation', new DOMException('Dataset load cancelled', 'AbortError')],
    ['a sign-in answer', new HfError('Sign in with Hugging Face to open private datasets, then retry the URL.', 401)],
  ])('still stops on %s', async (_label, error) => {
    const fetchImpl = vi.fn(async (): Promise<Response> => { throw error; });
    await expect(checkHuggingFaceDatasetAccess(info, fetchImpl)).rejects.toBe(error);
  });

  it.each([400, 401, 403, 410])('still stops on a definitive %s answer', async status => {
    const fetchImpl = vi.fn(async () => new Response(null, { status }));
    await expect(checkHuggingFaceDatasetAccess(info, fetchImpl)).rejects.toMatchObject({ status });
  });
```

- [ ] **Step 3: Write the failing loader test.** In `src/hooks/useUrlLoader.test.ts`, add after the `'loads a private Hugging Face %s ...'` test:

```ts
  it('loads a public Hugging Face dataset when the access check is rate limited', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const request = vi.fn(async (url: string) => {
      if (url.endsWith('?expand=private')) return new Response(null, { status: 429 });
      if (url.includes('/tree/')) return Response.json(['cameras', 'images', 'points3D'].map(name => ({ type: 'file', path: `sparse/0/${name}.bin` })));
      if (/(cameras|images|points3D)\.bin$/.test(url)) return new Response(new Uint8Array([1, 2, 3]));
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', request);
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    await act(async () => { expect(await result.current.loadFromUrl('https://huggingface.co/datasets/owner/public')).toBe(true); });
    expect(processFilesMock).toHaveBeenCalledOnce();
  });
```

- [ ] **Step 4: Run all three to verify they fail**

Run: `npx vitest run src/utils/zipLoader.test.ts src/features/huggingface/datasetAccess.test.ts src/hooks/useUrlLoader.test.ts`
Expected: FAIL.
- The archive test rejects with `Failed to access archive (401)`.
- The transient-status and unreachable cases reject with `Could not check Hugging Face dataset access`.
- The loader test returns `false`.

- [ ] **Step 5: Implement.**

In `src/utils/zipValidation.ts`, change the option type:

```ts
export interface ZipUrlValidationOptions extends ZipValidationOptions {
  signal?: AbortSignal;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}
```

In `src/utils/zipLoader.ts`, add `import { fetchDatasetResource } from './fetchDatasetResource';` and replace the validation line:

```ts
  // The size check needs the signed-in account for private Hub archives, like the download.
  const validation = options ? validateArchiveSize(options.size) : await validateZipUrl(url, {
    signal,
    fetchImpl: (target, init) => fetchDatasetResource(target, undefined, init),
  });
```

In `src/features/huggingface/datasetAccess.ts`, add `import { appLogger } from '../../utils/logger';` and replace `checkHuggingFaceDatasetAccess` with:

```ts
/** A busy or unreachable metadata API says nothing about the files themselves. */
function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Fail before replacing the current scene, including Hub's deliberately ambiguous private 404s. */
export async function checkHuggingFaceDatasetAccess(infoUrl: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>): Promise<void> {
  // Only the status is needed. Avoid generating the repo's complete sibling listing.
  const accessUrl = new URL(infoUrl);
  accessUrl.searchParams.delete('expand[]');
  accessUrl.searchParams.set('expand', 'private');
  let response: Response;
  try {
    response = await fetchImpl(accessUrl.href);
  } catch (error) {
    // Cancellation and the account answers raised while fetching stand.
    if (error instanceof HfError
      || (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')) throw error;
    appLogger.warn('[Hugging Face] Dataset access check failed; continuing with the dataset files.', error);
    return;
  }
  discard(response);
  if (response.ok) return;
  if (response.status === 404) throw new HfError(hfAuth.getReadAccessToken()
    ? 'Hugging Face dataset not found or unavailable to this account. Check the URL and repository permissions.'
    : 'Hugging Face dataset not found or private. Sign in with Hugging Face and check the URL.', 404);
  if (isTransientStatus(response.status)) {
    appLogger.warn(`[Hugging Face] Dataset access check returned ${response.status}; continuing with the dataset files.`);
    return;
  }
  throw new HfError(`Could not check Hugging Face dataset access (${response.status}). Please retry.`, response.status);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/utils/zipLoader.test.ts src/utils/zipValidation.test.ts src/features/huggingface src/hooks/useUrlLoader.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/utils/zipLoader.ts src/utils/zipValidation.ts src/features/huggingface/datasetAccess.ts src/utils/zipLoader.test.ts src/features/huggingface/datasetAccess.test.ts src/hooks/useUrlLoader.test.ts
git commit -m "Open private Hub archives and tolerate a busy Hub API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The splat picker opens only after restoration settles with nothing showing (F6)

**Files:**
- Modify: `src/store/reconstructionStore.ts`:
  - interface `mergeRemoteSplatCatalog` doc (lines 219-223);
  - `mergeRemoteSplatCatalog` body (lines 366-378);
  - new `offerSplatPicker` action and interface member.
- Modify: `src/hooks/useUrlState.ts`. Add an exported `resolveRestoredSplatSourceId` and use it at line 112.
- Modify: `src/hooks/useUrlLoader.ts`:
  - `UrlLoadContext`;
  - `onRemoteSplatCatalog` (lines 110-115);
  - after `applySavedViewerState` (lines 148-151).
- Test: `src/store/reconstructionStore.test.ts`. Replace the three picker tests at lines 728-781.
- Test: `src/hooks/useUrlLoader.test.ts`. Add three tests and adapt one.

**Interfaces:**
- Produces: the store action `offerSplatPicker: () => void`. It sets `showSplatPicker: true` only when `loadedFiles.splatFileSources` is non-empty and `loadedFiles.splatFile` is unset.
- Produces: `export function resolveRestoredSplatSourceId(saved: PublishedViewerState | null, shared: SharedViewerOverrides | null, autoSplatSourceId?: string): string | undefined`. It returns the viewer URL's choice, else the saved choice, else the automatic pick. `''` means an explicit "None".
- Changes: `mergeRemoteSplatCatalog` no longer touches `showSplatPicker`.

- [ ] **Step 1: Write the failing store tests.** In `src/store/reconstructionStore.test.ts`, replace the three tests:
- `'opens the splat picker when multiple splats are merged with none active'`
- `'opens the splat picker when a lone non-auto-loaded splat is merged with none active'`
- `'does not open the splat picker when the merged lone splat is already active'`

with:

```ts
  it('lists merged splats without asking for a choice yet', () => {
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({ splatFileSources: [] }));
    useReconstructionStore.getState().mergeRemoteSplatCatalog(
      [{ path: 'splats/a.ply', size: 10 }, { path: 'splats/b.ply', size: 20 }],
      'https://x/ds'
    );
    expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(2);
    expect(useReconstructionStore.getState().showSplatPicker).toBe(false);
  });

  it('offers the picker when the dataset lists splats and none is showing', () => {
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({ splatFileSources: [] }));
    useReconstructionStore.getState().mergeRemoteSplatCatalog(
      [{ path: 'splats/huge.ply', size: 1_040_000_634 }],
      'https://x/ds'
    );
    useReconstructionStore.getState().offerSplatPicker();
    expect(useReconstructionStore.getState().showSplatPicker).toBe(true);
  });

  it('does not offer the picker when a splat is showing or none are listed', () => {
    const fileA = new File(['a'], 'a.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA, splatFiles: [fileA],
      splatFileSources: [{ id: 'splats/a.ply', path: 'splats/a.ply', file: fileA }],
    }));
    useReconstructionStore.getState().offerSplatPicker();
    expect(useReconstructionStore.getState().showSplatPicker).toBe(false);
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({ splatFileSources: [] }));
    useReconstructionStore.getState().offerSplatPicker();
    expect(useReconstructionStore.getState().showSplatPicker).toBe(false);
  });
```

- [ ] **Step 2: Write the failing loader tests.** In `src/hooks/useUrlLoader.test.ts`, add this helper below `createSplatLoadedFiles`:

```ts
function hubEntries(splats: Array<{ path: string; size: number }>) {
  return [
    ...['cameras', 'images', 'points3D'].map(name => ({ type: 'file', path: `sparse/0/${name}.bin`, size: 10 })),
    ...splats.map(splat => ({ type: 'file', ...splat })),
  ];
}
```

Then add these three tests next to `'leaves a small splat lazy when optional YAML times out ...'`:

```ts
  it('downloads an automatically chosen splat without opening the picker over it', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const baseUrl = 'https://huggingface.co/datasets/owner/auto/resolve/main/';
    let respondSplat!: (response: Response) => void;
    const request = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith('colmapview.yaml')) return new Response(null, { status: 404 });
      if (init?.method === 'HEAD') return new Response(null, { headers: { 'content-length': '100' } });
      if (String(url).endsWith('.spz')) return new Promise<Response>(resolve => { respondSplat = resolve; });
      if (String(url).includes('/api/datasets/')) return Response.json(hubEntries([{ path: 'splats/scene.spz', size: 100 }]));
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal('fetch', request);
    processFilesMock.mockImplementationOnce(async () => { useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles()); });
    const pickerStates: boolean[] = [];
    const unsubscribe = useReconstructionStore.subscribe(state => { pickerStates.push(state.showSplatPicker); });
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    try {
      let pending!: Promise<boolean>;
      act(() => { pending = result.current.loadFromUrl(baseUrl); });
      await waitFor(() => expect(request.mock.calls.some(([url, init]) => String(url).endsWith('.spz') && init?.method !== 'HEAD')).toBe(true));
      expect(useReconstructionStore.getState().showSplatPicker).toBe(false);
      await act(async () => {
        respondSplat(new Response(new Uint8Array([4, 5, 6])));
        expect(await pending).toBe(true);
      });
      expect(getActiveSplatSourceId(useReconstructionStore.getState().loadedFiles)).toBe('splats/scene.spz');
      expect(pickerStates).not.toContain(true);
    } finally { unsubscribe(); }
  });

  it('opens the picker once the load settles when several splats need a choice', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const baseUrl = 'https://huggingface.co/datasets/owner/many/resolve/main/';
    const request = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith('colmapview.yaml')) return new Response(null, { status: 404 });
      if (init?.method === 'HEAD') return new Response(null, { headers: { 'content-length': '100' } });
      if (String(url).includes('/api/datasets/')) return Response.json(hubEntries([
        { path: 'splats/a.spz', size: 100 }, { path: 'splats/b.spz', size: 200 }]));
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal('fetch', request);
    processFilesMock.mockImplementationOnce(async () => { useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles()); });
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    await act(async () => { expect(await result.current.loadFromUrl(baseUrl)).toBe(true); });
    expect(useReconstructionStore.getState().showSplatPicker).toBe(true);
    expect(request.mock.calls.filter(([url, init]) => String(url).endsWith('.spz') && init?.method !== 'HEAD')).toEqual([]);
  });

  it('asks again when the automatically chosen splat fails to download', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const baseUrl = 'https://huggingface.co/datasets/owner/flaky/resolve/main/';
    const request = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith('colmapview.yaml')) return new Response(null, { status: 404 });
      if (init?.method === 'HEAD') return new Response(null, { headers: { 'content-length': '100' } });
      if (String(url).endsWith('.spz')) return new Response(null, { status: 404 });
      if (String(url).includes('/api/datasets/')) return Response.json(hubEntries([{ path: 'splats/scene.spz', size: 100 }]));
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal('fetch', request);
    processFilesMock.mockImplementationOnce(async () => { useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles()); });
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    await act(async () => { expect(await result.current.loadFromUrl(baseUrl)).toBe(true); });
    const state = useReconstructionStore.getState();
    expect(state.loadedFiles?.splatFile).toBeUndefined();
    expect(state.urlError?.message).toBe('Failed to load splat');
    expect(state.showSplatPicker).toBe(true);
  });
```

Adapt the existing test `'keeps COLMAP only when the user chooses None before saved and shared source restoration'`. Its subscription relies on the picker opening at catalog merge, which no longer happens. Make it choose None the moment the catalog is listed instead:

```ts
    const unsubscribe = useReconstructionStore.subscribe(state => {
      if ((state.loadedFiles?.splatFileSources?.length ?? 0) === 2) {
        unsubscribe();
        void state.selectSplatSource('');
      }
    });
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/store/reconstructionStore.test.ts src/hooks/useUrlLoader.test.ts`
Expected: FAIL.
- The store tests fail with `offerSplatPicker is not a function`, and because merge still opens the picker.
- `'downloads an automatically chosen splat ...'` fails because `showSplatPicker` is true during the download.

- [ ] **Step 4: Implement.**

In `src/store/reconstructionStore.ts`, update the interface:

```ts
  /** Merge a discovered remote splat catalog so all tiles are listed (lazy). Never opens the picker. */
  mergeRemoteSplatCatalog: (
    catalog: ReadonlyArray<{ path: string; size: number; splatCount?: number | null }>,
    baseUrl: string
  ) => void;
  /** Ask the user to pick a splat when the dataset lists splats but none is showing. */
  offerSplatPicker: () => void;
```

Replace the `mergeRemoteSplatCatalog` implementation and add `offerSplatPicker` after it:

```ts
  mergeRemoteSplatCatalog: (catalog, baseUrl) => {
    const loadedFiles = get().loadedFiles;
    if (!loadedFiles) {
      return;
    }
    set({ loadedFiles: mergeRemoteSplatCatalogIntoLoadedFiles(loadedFiles, catalog, baseUrl) });
  },

  offerSplatPicker: () => {
    const loadedFiles = get().loadedFiles;
    if (loadedFiles?.splatFileSources?.length && !loadedFiles.splatFile) {
      set({ showSplatPicker: true });
    }
  },
```

In `src/hooks/useUrlState.ts`, add above `applySavedViewerState`:

```ts
/** The splat a finished load restores: the viewer URL's choice, then the saved one, then the automatic pick. */
export function resolveRestoredSplatSourceId(saved: PublishedViewerState | null, shared: SharedViewerOverrides | null,
  autoSplatSourceId?: string): string | undefined {
  return shared?.config?.splat?.activeSourceId ?? saved?.config.splat?.activeSourceId ?? autoSplatSourceId;
}
```

Inside `applySavedViewerState`, replace the `const sourceId = ...` line with:

```ts
  const sourceId = resolveRestoredSplatSourceId(saved, shared, autoSplatSourceId);
```

In `src/hooks/useUrlLoader.ts`:
- Import `resolveRestoredSplatSourceId` beside `applySavedViewerState`.
- Add `remoteCatalogMerged: boolean;` to `UrlLoadContext`, next to `hasEmbeddedViewerSettings`, and initialize it to `remoteCatalogMerged: false,` in the `load` object.
- Replace the `onRemoteSplatCatalog` entry with:

```ts
      onRemoteSplatCatalog: guard((catalog: RemoteSplatCandidate[], baseUrl = contextUrl) => {
        mergeRemoteSplatCatalog(catalog, baseUrl);
        load.remoteCatalogMerged = true;
      }),
```

Replace the `if (loaded) { ... }` block in `runLoad` with:

```ts
      if (loaded) {
        await applySavedViewerState(savedViewerState, shared, assertCurrent, initialSplatSelectionRevision, autoSplatSourceId);
        assertCurrent();
        // Ask only once restoration settled: an automatic or saved splat downloads without a
        // picker over it, and an explicit None or a choice made during the load stands.
        if (load.remoteCatalogMerged
          && resolveRestoredSplatSourceId(savedViewerState, shared, autoSplatSourceId) !== ''
          && useReconstructionStore.getState().splatSelectionRevision === initialSplatSelectionRevision) {
          useReconstructionStore.getState().offerSplatPicker();
        }
      }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/store/reconstructionStore.test.ts src/hooks/useUrlLoader.test.ts src/hooks/useUrlState.test.ts src/components/modals/SplatPickerModal.test.tsx`
Expected: PASS. If another existing test fails because it observed the picker opening at merge time, change that test to trigger on the catalog listing, as in Step 2. Keep its intent, and say in the report which test changed and why.

- [ ] **Step 6: Commit**

```bash
git add src/store/reconstructionStore.ts src/store/reconstructionStore.test.ts src/hooks/useUrlState.ts src/hooks/useUrlLoader.ts src/hooks/useUrlLoader.test.ts
git commit -m "Ask for a splat only after restoration leaves none showing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Re-selecting the splat already on screen keeps the renderer's progress (F8)

**Files:**
- Modify: `src/store/reconstructionStore.ts`, the `if (source.file) { ... }` branch of `selectSplatSource` (lines 409-424).
- Test: `src/store/reconstructionStore.test.ts`, inside `describe('reconstruction store URL load lifecycle')`.
- Test: `src/hooks/useUrlState.test.ts`.

**Interfaces:**
- Consumes: `isSplatLoadingProgressForFile`, which Task 2 already imported into `reconstructionStore.ts`.

- [ ] **Step 1: Write the failing tests.** In `src/store/reconstructionStore.test.ts`, add `getSplatDownloadProgress` to the `../utils/splatLoadingProgressPolicy` import. Then add:

```ts
  it('keeps the renderer progress when the restored splat is the one already decoding', async () => {
    const fileA = new File(['a'], 'a.spz');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA, splatFiles: [fileA],
      splatFileSources: [{ id: 'a.spz', path: 'a.spz', file: fileA }],
    }));
    const progress = getSplatLoadingProgress(fileA, { startPercent: 60 });
    useReconstructionStore.setState({ urlLoading: true, urlProgress: progress });

    await useReconstructionStore.getState().selectSplatSource('a.spz', { restore: true });

    expect(useReconstructionStore.getState().urlLoading).toBe(true);
    expect(useReconstructionStore.getState().urlProgress).toBe(progress);
  });

  it('still clears a superseded download indicator when switching to a downloaded splat', async () => {
    const fileA = new File(['a'], 'a.spz');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA, splatFiles: [fileA],
      splatFileSources: [
        { id: 'a.spz', path: 'a.spz', file: fileA },
        { id: 'b.spz', path: 'b.spz', url: 'https://x/b.spz', size: 5 },
      ],
    }));
    useReconstructionStore.setState({ urlLoading: true, urlProgress: getSplatDownloadProgress('b.spz', 1, 5) });

    await useReconstructionStore.getState().selectSplatSource('a.spz');

    expect(useReconstructionStore.getState().urlLoading).toBe(false);
    expect(useReconstructionStore.getState().urlProgress).toBeNull();
  });

  it('clears the indicator of a download it cancels, even when the file names match', async () => {
    const fileA = new File(['a'], 'scene.spz');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFile: fileA, splatFiles: [fileA],
      splatFileSources: [
        { id: 'a/scene.spz', path: 'a/scene.spz', file: fileA },
        { id: 'b/scene.spz', path: 'b/scene.spz', url: 'https://x/b/scene.spz', size: 5 },
      ],
    }));
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    })));
    try {
      const pending = useReconstructionStore.getState().selectSplatSource('b/scene.spz');
      expect(useReconstructionStore.getState().urlProgress?.currentFile).toBe('scene.spz');

      await useReconstructionStore.getState().selectSplatSource('a/scene.spz');
      await pending;

      expect(useReconstructionStore.getState().urlLoading).toBe(false);
      expect(useReconstructionStore.getState().urlProgress).toBeNull();
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(fileA);
    } finally {
      vi.unstubAllGlobals();
    }
  });
```

In `src/hooks/useUrlState.test.ts`, add `import { getSplatLoadingProgress } from '../utils/splatLoadingProgressPolicy';` and, inside `describe('URL state sharing')`:

```ts
  it('keeps the loading overlay while the renderer decodes a restored splat that is already loaded', async () => {
    const splat = buildFile('scene.spz', 'splat');
    useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({ splatFile: splat,
      splatFileSources: [{ id: 'scene.spz', path: 'scene.spz', file: splat }] }));
    const progress = getSplatLoadingProgress(splat, { startPercent: 60 });
    useReconstructionStore.setState({ urlLoading: true, urlProgress: progress });

    await applySavedViewerState(null, { config: { splat: { activeSourceId: 'scene.spz' } } });

    expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true, urlProgress: progress });
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/store/reconstructionStore.test.ts src/hooks/useUrlState.test.ts -t "already"`
Expected: FAIL. `urlLoading` is `false`.

The two "clears ..." tests pass before this change. They guard the existing behavior, and the identical-basename one fails if the guard in Step 3 omits `hadPendingDownload`.

- [ ] **Step 3: Implement.** In `selectSplatSource`, record whether a lazy download was pending immediately before the existing `cancelPendingSplatLoad();` call. Insert the new line directly above it:

```ts
    // A pending download's progress is never the renderer's, even for a same-named file.
    const hadPendingDownload = activeSplatController !== null;
    cancelPendingSplatLoad();
```

Then replace the `if (source.file) { ... }` branch with:

```ts
    // Already downloaded: activate immediately (and offload the previous tile). A superseded
    // download indicator is cleared, but re-selecting the splat that is already active (a
    // restored choice right after a load) keeps the renderer's progress while it decodes.
    if (source.file) {
      const rendererOwnsProgress = !hadPendingDownload
        && source.file === loadedFiles.splatFile
        && isSplatLoadingProgressForFile(get().urlProgress, source.file);
      set({
        requestedSplatSourceId: source.id,
        loadedFiles: applyActiveSplatFile(loadedFiles, source.id, source.file),
        ...(rendererOwnsProgress ? {} : { urlLoading: false, urlProgress: null, urlError: null }),
      });
      if (!hadSplatBefore) {
        applySplatActivationVisuals();
      }
      return;
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/store/reconstructionStore.test.ts src/hooks/useUrlState.test.ts src/hooks/useUrlLoader.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/reconstructionStore.ts src/store/reconstructionStore.test.ts src/hooks/useUrlState.test.ts
git commit -m "Keep the loading overlay while a restored splat decodes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Reload keeps remote splat tiles and the splat on screen (F7)

**Files:**
- Modify: `src/utils/splatFileSourcePolicy.ts`. Add `carryOverRemoteSplatSources` after `getShareActiveSplatSourceId`.
- Modify: `src/hooks/fileDropzoneWorkflow.ts`:
  - the `FileDropzoneWorkflowOptions` field;
  - the commit block at lines 528-584.
- Modify: `src/hooks/useFileDropzone.ts`:
  - the `processFiles` options pass-through (lines 58-115);
  - the new `reloadFiles`;
  - the return object.
- Modify the four Reload call sites:
  - `src/components/viewer3d/panels/TransformPanel.tsx:61,171`;
  - `src/components/viewer3d/panels/ExportPanel.tsx:70,202-207`;
  - `src/components/viewer3d/contextMenu/useGlobalContextMenuActionStoreFacade.ts:58-61`;
  - `src/components/viewer3d/useTransformGizmoStoreFacade.ts:25,39,52`.
- Test: `src/utils/splatFileSourcePolicy.test.ts`.
- Test: `src/hooks/fileDropzoneWorkflow.test.ts`.
- Test: `src/hooks/useFileDropzone.test.ts`.

**Interfaces:**
- Produces: `export function carryOverRemoteSplatSources(current: LoadedFiles | null, reloaded: Pick<LoadedFiles, 'splatFile' | 'splatFiles' | 'splatFileSources'>): Pick<LoadedFiles, 'splatFile' | 'splatFiles' | 'splatFileSources'>`.
- Produces: `FileDropzoneWorkflowOptions.preserveRemoteSplatSources?: boolean`.
- Produces: `useFileDropzone().reloadFiles(files: Map<string, File>): Promise<boolean>`.

- [ ] **Step 1: Write the failing policy tests.** Append to `src/utils/splatFileSourcePolicy.test.ts`. Add `carryOverRemoteSplatSources` to its import from `./splatFileSourcePolicy`, and import `LoadedFiles` from `../types/colmap` if it is not already imported.

```ts
describe('carryOverRemoteSplatSources', () => {
  const loaded = (overrides: Partial<LoadedFiles>): LoadedFiles => ({ imageFiles: new Map(), hasMasks: false, ...overrides });
  const remoteFile = new File(['remote'], 'scene.spz');
  const remoteActive = { id: 'splats/scene.spz', path: 'splats/scene.spz', url: 'https://x/splats/scene.spz', size: 6, file: remoteFile };
  const remoteLazy = { id: 'splats/other.spz', path: 'splats/other.spz', url: 'https://x/splats/other.spz', size: 9 };
  const nothingReloaded = { splatFile: undefined, splatFiles: [], splatFileSources: [] };

  it('keeps remote tiles and the active remote splat that the reloaded files do not contain', () => {
    const current = loaded({ splatFile: remoteFile, splatFiles: [remoteFile], splatFileSources: [remoteActive, remoteLazy] });
    const result = carryOverRemoteSplatSources(current, nothingReloaded);
    expect(result.splatFileSources?.map(source => source.id)).toEqual(['splats/scene.spz', 'splats/other.spz']);
    expect(result.splatFile).toBe(remoteFile);
    expect(result.splatFiles).toEqual([remoteFile]);
  });

  it('keeps a byte-less placeholder active', () => {
    const placeholder = new File([], 'other.spz');
    const current = loaded({ splatFile: placeholder, splatFiles: [], splatFileSources: [remoteLazy] });
    const result = carryOverRemoteSplatSources(current, nothingReloaded);
    expect(result.splatFile).toBe(placeholder);
    expect(result.splatFileSources).toEqual([remoteLazy]);
  });

  it('keeps COLMAP only when no splat was showing', () => {
    const current = loaded({ splatFileSources: [remoteLazy] });
    expect(carryOverRemoteSplatSources(current, nothingReloaded).splatFile).toBeUndefined();
  });

  it('prefers a reloaded local file over a remote copy of the same path', () => {
    const local = new File(['local'], 'scene.spz');
    const current = loaded({ splatFile: remoteFile, splatFiles: [remoteFile], splatFileSources: [remoteActive] });
    const reloaded = { splatFile: local, splatFiles: [local], splatFileSources: [{ id: 'splats/scene.spz', path: 'splats/scene.spz', file: local }] };
    expect(carryOverRemoteSplatSources(current, reloaded)).toBe(reloaded);
  });

  it('changes nothing for datasets without remote tiles', () => {
    const local = new File(['local'], 'local.spz');
    const current = loaded({ splatFile: local, splatFiles: [local], splatFileSources: [{ id: 'local.spz', path: 'local.spz', file: local }] });
    const reloaded = { splatFile: local, splatFiles: [local], splatFileSources: [{ id: 'local.spz', path: 'local.spz', file: local }] };
    expect(carryOverRemoteSplatSources(current, reloaded)).toBe(reloaded);
  });
});
```

- [ ] **Step 2: Write the failing workflow tests.** Append inside `describe('file dropzone workflow')` in `src/hooks/fileDropzoneWorkflow.test.ts`:

```ts
  it.each([true, false])('carries remote splat tiles across a reload only when asked (%s)', async preserve => {
    const remoteFile = new File(['remote'], 'scene.spz');
    const current = loadedFiles({
      splatFile: remoteFile, splatFiles: [remoteFile],
      splatFileSources: [{ id: 'splats/scene.spz', path: 'splats/scene.spz', url: 'https://x/splats/scene.spz', size: 6, file: remoteFile }],
    });
    const deps = createDeps({
      getLoadedFiles: vi.fn(() => current),
      parseFiles: vi.fn(async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false })),
      buildReconstruction: vi.fn(async () => ({ reconstruction: createReconstruction(), pointCount: 0 })),
    });
    const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin'].map(name => [name, file(name)]));

    await expect(processFileDropzoneFiles(files, deps, { preserveRemoteSplatSources: preserve })).resolves.toBe(true);

    expect(deps.setLoadedFiles).toHaveBeenCalledWith(expect.objectContaining(preserve
      ? { splatFile: remoteFile, splatFileSources: [expect.objectContaining({ id: 'splats/scene.spz', file: remoteFile })] }
      : { splatFile: undefined, splatFileSources: [] }));
    // The renderer already shows the kept splat, so the overlay must not wait for it.
    expect(deps.setUrlProgress).not.toHaveBeenCalledWith(expect.objectContaining({ currentFile: 'scene.spz' }));
    expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
  });
```

- [ ] **Step 3: Write the failing hook test.** Append inside `describe('useFileDropzone')` in `src/hooks/useFileDropzone.test.ts`:

```ts
  it('reloads the current dataset without dropping its remote splat tiles', async () => {
    const { result } = renderHook(() => useFileDropzone());
    const files = new Map([['cameras.bin', buildFile('cameras.bin')]]);
    await act(async () => { await result.current.reloadFiles(files); });
    expect(processFileDropzoneFilesMock).toHaveBeenLastCalledWith(files, expect.anything(),
      expect.objectContaining({ preserveRemoteSplatSources: true }));
    await act(async () => { await result.current.processFiles(files); });
    expect(processFileDropzoneFilesMock).toHaveBeenLastCalledWith(files, expect.anything(),
      expect.objectContaining({ preserveRemoteSplatSources: false }));
  });
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run src/utils/splatFileSourcePolicy.test.ts src/hooks/fileDropzoneWorkflow.test.ts src/hooks/useFileDropzone.test.ts`
Expected: FAIL. `carryOverRemoteSplatSources` and `reloadFiles` do not exist, and the `preserve=true` workflow case commits no sources.

- [ ] **Step 5: Implement the policy helper.** In `src/utils/splatFileSourcePolicy.ts`, after `getShareActiveSplatSourceId`:

```ts
/**
 * A reload re-reads the dataset's own files, which never contain remote (url-bearing) splat
 * tiles. Carry those tiles over with any downloaded bytes, and keep the active splat when it
 * is one of them (byte-less placeholders included). Local files of the same path win.
 */
export function carryOverRemoteSplatSources(
  current: LoadedFiles | null,
  reloaded: Pick<LoadedFiles, 'splatFile' | 'splatFiles' | 'splatFileSources'>
): Pick<LoadedFiles, 'splatFile' | 'splatFiles' | 'splatFileSources'> {
  const reloadedSources = reloaded.splatFileSources ?? [];
  const reloadedPaths = new Set(reloadedSources.map((source) => normalizeSplatSourceId(source.path)));
  const carried = (current?.splatFileSources ?? []).filter((source) =>
    Boolean(source.url) && !reloadedPaths.has(normalizeSplatSourceId(source.path)));
  if (!carried.length) {
    return reloaded;
  }
  const sources = [...reloadedSources, ...carried];
  const activeId = getActiveSplatSourceId(current);
  const keepsActive = activeId !== null && carried.some((source) => source.id === activeId);
  return {
    splatFileSources: sources,
    splatFiles: sources.map((source) => source.file).filter((file): file is File => Boolean(file)),
    splatFile: keepsActive ? current?.splatFile : reloaded.splatFile,
  };
}
```

- [ ] **Step 6: Implement the workflow option.**

In `src/hooks/fileDropzoneWorkflow.ts`:
- Import `carryOverRemoteSplatSources` from `'../utils/splatFileSourcePolicy'`.
- Add this to `FileDropzoneWorkflowOptions`:

```ts
  /** Reload of the current dataset: keep remote splat tiles its files never contained. */
  preserveRemoteSplatSources?: boolean;
```

In the COLMAP commit path, replace everything from the `deps.setUrlProgress(splatFile ? getSplatLoadingProgress(...) : ...)` call, through the `deps.setLoadedFiles({ ... })` call, to the final `if (splatFile) { handOffLoadingToSplatRenderer(); }`. Keep the unchanged lines between them. The result:

```ts
    const currentLoadedFiles = deps.getLoadedFiles();
    const splatState = normalizedOptions.preserveRemoteSplatSources
      ? carryOverRemoteSplatSources(currentLoadedFiles, { splatFile, splatFiles, splatFileSources })
      : { splatFile, splatFiles, splatFileSources };
    splatFile = splatState.splatFile;
    // The renderer reloads only when the splat file changes; handing it the loading state for
    // the splat it already shows would leave the overlay up.
    const splatAlreadyRendered = Boolean(splatFile) && splatFile === currentLoadedFiles?.splatFile;
    deps.setUrlProgress(splatFile && !splatAlreadyRendered
      ? getSplatLoadingProgress(splatFile, { startPercent: splatRendererStartPercent })
      : { percent: mapProgress(95), message: 'Finalizing...' });

    clearCaches({ preserveZip: true });
    // Keep the previous files and WASM snapshot alive until every fallible parse/build
    // step has succeeded. These synchronous publications form the scene commit.
    reportSceneReplacement();
    deps.setDroppedFiles(files);
    deps.clearSplatPsnr?.();
    deps.setLoadedFiles({
      camerasFile,
      imagesFile,
      points3DFile,
      ...splatState,
      rigsFile,
      framesFile,
      imageFiles,
      hasMasks,
    });
```

Further down, change the final handoff to:

```ts
    if (splatFile && !splatAlreadyRendered) {
      handOffLoadingToSplatRenderer();
    }
```

- [ ] **Step 7: Implement `reloadFiles` and rewire the three call sites.**

In `src/hooks/useFileDropzone.ts`:
- Add `'preserveRemoteSplatSources'` to the `Pick<FileDropzoneWorkflowOptions, ...>` list of `processFiles`' options.
- Pass `preserveRemoteSplatSources: options.preserveRemoteSplatSources ?? false,` in the options object given to `processFileDropzoneFiles`, next to `replaceSplatScene`.
- Add, after `processFiles`:

```ts
  /** Re-read the current dataset (discarding edits) without dropping its remote splat tiles. */
  const reloadFiles = useCallback(
    (files: Map<string, File>) => processFiles(files, undefined, { preserveRemoteSplatSources: true }),
    [processFiles]
  );
```

- Return it: `return { handleDrop, handleDragOver, processFiles, reloadFiles, processZipFile, handleBrowse };`. Keep the existing order and add `reloadFiles` after `processFiles`.

Rewire the four call sites:
- `TransformPanel.tsx`: change `const { processFiles } = useFileDropzone();` to `const { reloadFiles } = useFileDropzone();`, and make the Reload button call `reloadFiles(droppedFiles)`.
- `ExportPanel.tsx`: in `handleReload`, call `reloadFiles(droppedFiles)` instead of `processFiles(droppedFiles)`, and list `reloadFiles` in its `useCallback` dependencies. Destructure `reloadFiles` from `useFileDropzone()`, and keep `processFiles` only if the file still uses it elsewhere.
- `useGlobalContextMenuActionStoreFacade.ts`: change `const { processFiles } = useFileDropzone();` to `const { reloadFiles: reloadDatasetFiles } = useFileDropzone();`, and make the callback `await reloadDatasetFiles(files);` with deps `[reloadDatasetFiles]`.
- `useTransformGizmoStoreFacade.ts`:
  - Change the type to `processFiles: ReturnType<typeof useFileDropzone>['reloadFiles'];`.
  - Change the hook line to `const { reloadFiles } = useFileDropzone();`.
  - Change the action entry to `processFiles: reloadFiles,`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/utils/splatFileSourcePolicy.test.ts src/hooks src/components/viewer3d`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/utils/splatFileSourcePolicy.ts src/utils/splatFileSourcePolicy.test.ts src/hooks/fileDropzoneWorkflow.ts src/hooks/fileDropzoneWorkflow.test.ts src/hooks/useFileDropzone.ts src/hooks/useFileDropzone.test.ts src/components/viewer3d/panels/TransformPanel.tsx src/components/viewer3d/panels/ExportPanel.tsx src/components/viewer3d/contextMenu/useGlobalContextMenuActionStoreFacade.ts src/components/viewer3d/useTransformGizmoStoreFacade.ts
git commit -m "Keep remote splat tiles when reloading a dataset

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Start the optional-settings deadline when its result is needed, and warn on timeout (F9)

**Files:**
- Modify: `src/hooks/urlLoaderViewerState.ts:10-48`.
- Modify: `src/hooks/urlLoaderManifestSource.ts`:
  - the deps interface;
  - lines 72-89 (the settings task);
  - lines 145-147 (`finally`).
- Modify: `src/hooks/useUrlLoader.ts`:
  - the `UrlLoadContext` field and the `load` entry;
  - the splat-URL path (lines 207-210);
  - the archive path (lines 218-221).
- Test: `src/hooks/urlLoaderViewerState.test.ts`. Migrate two tests and add three.
- Test: `src/hooks/urlLoaderManifestSource.test.ts`. Add one.
- Test: `src/hooks/useUrlLoader.test.ts`. Extend one and add one.

**Interfaces:**
- Produces: `export const OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE: string`.
- Produces: `export interface OptionalViewerSettingsRequest { settle(): Promise<OptionalViewerSettingsResult>; cancel(): void }`.
- Produces: `export function startOptionalDatasetViewerSettings(url, fetchImpl, isFile = false, signal?): OptionalViewerSettingsRequest`.
- Exports: `interface OptionalViewerSettingsResult { state: PublishedViewerState | null; timedOut: boolean }`.
- Produces: `LoadManifestSourceDeps.onOptionalSettingsTimeout?: () => void`.
- Removes: `fetchOptionalDatasetViewerSettings`. Its callers move to `fetchOptionalDatasetViewerSettingsResult`.

- [ ] **Step 1: Write the failing viewer-state tests.** In `src/hooks/urlLoaderViewerState.test.ts`:
- Change the import to `fetchDatasetViewerSettings, fetchOptionalDatasetViewerSettingsResult, fetchPublishedViewerState, OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS, startOptionalDatasetViewerSettings`.
- In the two existing tests, replace `fetchOptionalDatasetViewerSettings(` with `fetchOptionalDatasetViewerSettingsResult(`.
- In `'bounds automatic direct-file metadata ...'`, change `await expect(pending).resolves.toBeNull();` to `await expect(pending).resolves.toEqual({ state: null, timedOut: true });`.
- Add:

```ts
  it('starts the deadline when the result is needed, not when the request starts', async () => {
    vi.useFakeTimers();
    let respond!: (response: Response) => void;
    const request = vi.fn(() => new Promise<Response>(resolve => { respond = resolve; }));
    const pending = startOptionalDatasetViewerSettings(manifest.baseUrl, request);
    // COLMAP files take longer than the whole deadline to download and parse.
    await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS * 3);
    const result = pending.settle();
    await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS - 1);
    vi.useRealTimers();
    respond(new Response('ui:\n  background_color: "#123456"\n'));
    await expect(result).resolves.toEqual({
      state: expect.objectContaining({ config: { ui: { backgroundColor: '#123456' } } }), timedOut: false });
  });

  it('reports a timeout and aborts the request when the result is still missing at the deadline', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | null | undefined;
    const request = vi.fn((_url: string, init?: RequestInit) => { requestSignal = init?.signal; return new Promise<Response>(() => {}); });
    const pending = startOptionalDatasetViewerSettings(manifest.baseUrl, request);
    const result = pending.settle();
    await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS);
    await expect(result).resolves.toEqual({ state: null, timedOut: true });
    expect(requestSignal?.aborted).toBe(true);
  });

  it('returns settings that arrived before they were needed, once, without a second deadline', async () => {
    const request = vi.fn(async () => new Response('ui:\n  background_color: "#123456"\n'));
    const pending = startOptionalDatasetViewerSettings(manifest.baseUrl, request);
    const first = pending.settle();
    expect(pending.settle()).toBe(first);
    await expect(first).resolves.toMatchObject({ timedOut: false, state: { config: { ui: { backgroundColor: '#123456' } } } });
    expect(request).toHaveBeenCalledOnce();
  });

  it('counts a transport timeout that happened before the result was needed as a timeout', async () => {
    // fetchWithTimeout gives up on a stalled request after 30 s, long before slow parsing ends.
    const request = vi.fn(async (): Promise<Response> => { throw new DOMException('Request timed out', 'TimeoutError'); });
    const pending = startOptionalDatasetViewerSettings(manifest.baseUrl, request);
    await expect(pending.settle()).resolves.toEqual({ state: null, timedOut: true });
  });

  it('still reports a timed-out direct read as missing settings', async () => {
    const request = vi.fn(async (): Promise<Response> => { throw new DOMException('Request timed out', 'TimeoutError'); });
    await expect(fetchDatasetViewerSettings(manifest.baseUrl, request)).resolves.toBeNull();
  });
```

- [ ] **Step 2: Write the failing manifest-source test.** Append inside the `describe` in `src/hooks/urlLoaderManifestSource.test.ts`:

```ts
  it('waits for optional settings that arrive while slow COLMAP files download', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Blob', NodeBlob);
    const deps = makeDeps();
    let respond!: (response: Response) => void;
    deps.fetchImpl.mockImplementationOnce(() => new Promise<Response>(resolve => { respond = resolve; }));
    let finishDownload!: (files: Map<string, File>) => void;
    deps.fetchColmapFiles.mockImplementationOnce(() => new Promise<Map<string, File>>(resolve => { finishDownload = resolve; }));
    const onViewerState = vi.fn();
    const onOptionalSettingsTimeout = vi.fn();
    const loading = loadManifestSource(manifest, { type: 'manifest' }, { ...deps, onViewerState, onOptionalSettingsTimeout });
    await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS * 2);
    vi.useRealTimers();
    respond(new Response('ui:\n  background_color: "#123456"\n'));
    finishDownload(makeFiles());
    await expect(loading).resolves.toBe(true);
    expect(onViewerState).toHaveBeenCalledWith(expect.objectContaining({ config: { ui: { backgroundColor: '#123456' } } }));
    expect(onOptionalSettingsTimeout).not.toHaveBeenCalled();
  });
```

Extend the existing test `'bounds optional settings independently, aborts its request and ignores a late response'`:
- Pass `onOptionalSettingsTimeout` (a `vi.fn()`) in its deps.
- Assert `expect(onOptionalSettingsTimeout).toHaveBeenCalledOnce();` after the load resolves.

- [ ] **Step 3: Write the failing loader tests.** In `src/hooks/useUrlLoader.test.ts`:
- Add `import { useNotificationStore } from '../store/stores/notificationStore';`.
- Change the `./urlLoaderViewerState` import to `import { OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE, OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS } from './urlLoaderViewerState';`.
- Add `useNotificationStore.setState(useNotificationStore.getInitialState(), true);` to the `afterEach`.
- At the end of `'leaves a small splat lazy when optional YAML times out ...'`, add:

```ts
    expect(useNotificationStore.getState().notifications).toContainEqual(expect.objectContaining({
      type: 'warning', message: OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE }));
```

Then add after `'restores settings beside a direct splat file hosted outside Hugging Face'`:

```ts
  it('warns when settings beside a direct splat file do not arrive in time', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Blob', NodeBlob);
    const request = vi.fn((url: string | URL) => String(url).endsWith('colmapview.yaml')
      ? new Promise<Response>(() => {}) : Promise.resolve(new Response('splat bytes')));
    vi.stubGlobal('fetch', request);
    processFilesMock.mockResolvedValueOnce();
    const { result } = renderHook(() => useUrlLoader());
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromUrl('https://example.com/project/scene.spz'); });
    await act(async () => {
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
      await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS);
      expect(await pending).toBe(true);
    });
    expect(useNotificationStore.getState().notifications).toContainEqual(expect.objectContaining({
      type: 'warning', message: OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE }));
  });
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run src/hooks/urlLoaderViewerState.test.ts src/hooks/urlLoaderManifestSource.test.ts src/hooks/useUrlLoader.test.ts`
Expected: FAIL. `startOptionalDatasetViewerSettings` and `OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE` do not exist, and the slow-download test gets no viewer state.

- [ ] **Step 5: Implement the request split.** In `src/hooks/urlLoaderViewerState.ts`, replace lines 10-48 (from `OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS` through the end of `fetchOptionalDatasetViewerSettingsResult`) with:

```ts
export const OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS = 3_000;
export const OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE =
  "This dataset's saved view settings (colmapview.yaml) did not load in time, so default settings are shown. Load the dataset again to retry.";

export interface OptionalViewerSettingsResult { state: PublishedViewerState | null; timedOut: boolean }

/** Automatic settings discovery: the request starts now, its deadline when the result is needed. */
export interface OptionalViewerSettingsRequest {
  /** Resolves within OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS of the first call; a stalled request is aborted. */
  settle(): Promise<OptionalViewerSettingsResult>;
  cancel(): void;
}

export function startOptionalDatasetViewerSettings(url: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, isFile = false,
  signal?: AbortSignal): OptionalViewerSettingsRequest {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const requestSignal = signal ? anySignal([signal, controller.signal]) : controller.signal;
  const settings = readDatasetViewerSettings(url,
    (candidate, init) => fetchImpl(candidate, { ...init, signal: requestSignal }), isFile)
    .catch((error): OptionalViewerSettingsResult => {
      if (controller.signal.aborted && !signal?.aborted) return { state: null, timedOut: true };
      throw error;
    });
  // A failure before settle() is reported by settle(), not as an unhandled rejection.
  settings.catch(() => {});
  let result: Promise<OptionalViewerSettingsResult> | null = null;
  const settleWithDeadline = async (): Promise<OptionalViewerSettingsResult> => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let cancel: (() => void) | undefined;
    const deadline = new Promise<OptionalViewerSettingsResult>((resolve, reject) => {
      cancel = () => reject(signal?.reason ?? new DOMException('Dataset load cancelled', 'AbortError'));
      if (signal?.aborted) { cancel(); return; }
      signal?.addEventListener('abort', cancel, { once: true });
      timeout = setTimeout(() => {
        controller.abort(new DOMException('Optional viewer settings timed out', 'TimeoutError'));
        resolve({ state: null, timedOut: true });
      }, OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS);
    });
    try {
      return await Promise.race([settings, deadline]);
    } finally {
      clearTimeout(timeout);
      if (cancel) signal?.removeEventListener('abort', cancel);
      controller.abort();
    }
  };
  return {
    settle: () => (result ??= settleWithDeadline()),
    cancel: () => controller.abort(),
  };
}

export async function fetchOptionalDatasetViewerSettingsResult(url: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, isFile = false,
  signal?: AbortSignal): Promise<OptionalViewerSettingsResult> {
  const request = startOptionalDatasetViewerSettings(url, fetchImpl, isFile, signal);
  try {
    return await request.settle();
  } finally {
    request.cancel();
  }
}
```

Then replace the existing `fetchDatasetViewerSettings` (the candidate loop further down the file) with an internal reader that also reports transport timeouts, plus the unchanged public wrapper. Publication verification calls `fetchPublishedViewerState`, which relies on the wrapper still returning `null` on a timeout.

```ts
/** The candidate search; also says whether a stalled request (transport timeout) hid the settings. */
async function readDatasetViewerSettings(url: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, isFile: boolean): Promise<OptionalViewerSettingsResult> {
  // The first candidate sits beside the loaded project or file; later ones are parent folders.
  for (const [index, candidate] of settingsUrls(url, isFile).entries()) {
    try {
      const response = await fetchImpl(candidate, { credentials: 'omit' });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 404) continue;
        return { state: null, timedOut: false };
      }
      const text = await (await readBoundedResponse(response, MAX_VIEWER_STATE_BYTES)).text();
      const state = parseDatasetViewerSettings(text);
      return {
        state: index === 0 || (isFile && savesFileAsActiveSplat(state, candidate, url)) ? state : displaySettingsOnly(state),
        timedOut: false,
      };
    } catch (error) {
      const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined;
      if (name === 'AbortError') throw error;
      appLogger.warn('[URL Loader] Skipping unavailable or invalid colmapview.yaml settings.');
      return { state: null, timedOut: name === 'TimeoutError' };
    }
  }
  return { state: null, timedOut: false };
}

export async function fetchDatasetViewerSettings(url: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, isFile = false): Promise<PublishedViewerState | null> {
  return (await readDatasetViewerSettings(url, fetchImpl, isFile)).state;
}
```

- [ ] **Step 6: Use it on the manifest path.** In `src/hooks/urlLoaderManifestSource.ts`:
- Change the viewer-state import to `import { fetchPublishedViewerState, startOptionalDatasetViewerSettings } from './urlLoaderViewerState';`.
- Add this to `LoadManifestSourceDeps`:

```ts
  /** Optional dataset settings did not arrive in time; defaults stay in effect. */
  onOptionalSettingsTimeout?: () => void;
```

Replace the block from `const settingsController = new AbortController();` through the end of `getViewerState` with:

```ts
  // The optional request starts with the downloads; its deadline starts once parsing is done.
  const optionalSettings = manifest.viewerStatePath === undefined
    ? startOptionalDatasetViewerSettings(manifest.baseUrl, fetchImpl, false, deps.signal)
    : null;
  const explicitSettingsController = new AbortController();
  const explicitSettingsSignal = deps.signal
    ? anySignal([deps.signal, explicitSettingsController.signal]) : explicitSettingsController.signal;
  const explicitSettingsTask = optionalSettings ? null
    : fetchPublishedViewerState(manifest, (url, init) => fetchImpl(url, { ...init, signal: explicitSettingsSignal }))
      .then(state => ({ state }), error => ({ error }));
  let optionalSettingsTimedOut = false;
  const getViewerState = async () => {
    if (optionalSettings) {
      const result = await optionalSettings.settle();
      assertCurrent();
      optionalSettingsTimedOut = result.timedOut;
      if (result.timedOut) deps.onOptionalSettingsTimeout?.();
      return result.state;
    }
    const result = await explicitSettingsTask!;
    assertCurrent();
    if ('error' in result) throw result.error;
    return result.state;
  };
```

Replace the `finally { settingsController.abort(); }` body with:

```ts
  } finally {
    optionalSettings?.cancel();
    explicitSettingsController.abort();
  }
```

`OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS` is still re-exported at the top of the file. Leave that line as is.

- [ ] **Step 7: Notify from the URL loader.** In `src/hooks/useUrlLoader.ts`:
- Change the viewer-state import to `import { fetchOptionalDatasetViewerSettingsResult, OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE } from './urlLoaderViewerState';`.
- Add `onOptionalSettingsTimeout: () => void;` to `UrlLoadContext`.
- Add this entry to the `load` object:

```ts
      onOptionalSettingsTimeout: guard(() => {
        useNotificationStore.getState().addNotification('warning', OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE);
      }),
```

Add this module-level helper above `useUrlLoader`:

```ts
/** Settings beside a directly loaded file or archive; a timeout keeps defaults and says so. */
async function applyOptionalSettingsBeside(url: string, load: UrlLoadContext): Promise<void> {
  const settings = await fetchOptionalDatasetViewerSettingsResult(url, load.fetchImpl, true, load.signal);
  if (settings.timedOut) load.onOptionalSettingsTimeout();
  if (settings.state) await load.onViewerState(settings.state);
}
```

Replace both `const settings = await fetchOptionalDatasetViewerSettings(normalizedUrl, load.fetchImpl, true, load.signal); if (settings) await load.onViewerState(settings);` pairs, in the splat-URL branch and the archive branch, with `await applyOptionalSettingsBeside(normalizedUrl, load);`.

The manifest branch already spreads `...load` into `loadManifestSource`'s deps, so it passes `onOptionalSettingsTimeout` through.

Confirm nothing references the removed wrapper: `grep -rn "fetchOptionalDatasetViewerSettings\b" src`. Expected: no output.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/hooks`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/hooks/urlLoaderViewerState.ts src/hooks/urlLoaderViewerState.test.ts src/hooks/urlLoaderManifestSource.ts src/hooks/urlLoaderManifestSource.test.ts src/hooks/useUrlLoader.ts src/hooks/useUrlLoader.test.ts
git commit -m "Give saved view settings until parsing ends, and say when they time out

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Reload re-applies a URL dataset's saved settings (F7, alignment)

**Why:** Reload re-parses `droppedFiles`. `setLoadedFiles` then resets the splat transform, because a new `imageFiles` map makes the commit a new dataset rather than an active-splat switch. Applying a transform also moves the splat (`src/store/actions/transformActions.ts`). A kept splat therefore needs the dataset's saved alignment re-applied.

A local project gets this already, because its `colmapview.yaml` is among the dropped files and the workflow applies it. A URL dataset's settings were fetched beside its files, so Reload must carry them in.

**Files:**
- Modify: `src/store/reconstructionStore.ts`:
  - new state `sourceViewerState` and action `setSourceViewerState`;
  - `setDroppedFiles` drops a binding for another file map;
  - `clear()` resets it.
- Modify: `src/hooks/useUrlLoader.ts`. Record the settings after a successful load, inside `if (loaded) { ... }` in `runLoad`.
- Modify: `src/hooks/fileDropzoneWorkflow.ts`. Add the `viewerState` option.
- Modify: `src/hooks/useFileDropzone.ts`. `processFiles` passes `viewerState` through, and `reloadFiles` supplies the retained settings.
- Test: `src/store/reconstructionStore.test.ts`.
- Test: `src/hooks/fileDropzoneWorkflow.test.ts`.
- Test: `src/hooks/useFileDropzone.test.ts`.
- Test: `src/hooks/useUrlLoader.test.ts`.

**Interfaces:**
- Consumes: `reloadFiles` from Task 6, the `hubEntries` test helper from Task 4, and `applySavedViewerState` from `src/hooks/useUrlState.ts`.
- Produces: the store state `sourceViewerState: { files: Map<string, File>; state: PublishedViewerState } | null`.
- Produces: the store action `setSourceViewerState(state: PublishedViewerState | null): void`. It binds the state to the current `droppedFiles`, and stores `null` when there are none.
- Produces: `FileDropzoneWorkflowOptions.viewerState?: PublishedViewerState`. When the files contain no settings file, the workflow applies this state through `onViewerState`. A settings file inside the files wins.

- [ ] **Step 1: Write the failing tests.**

In `src/store/reconstructionStore.test.ts`, add `import type { PublishedViewerState } from '../utils/publishedViewerState';` and, inside `describe('reconstruction store URL load lifecycle')`:

```ts
  it('keeps saved source settings only with the files they came with', () => {
    const state: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null, config: { ui: { backgroundColor: '#123456' } } };
    const files = new Map([['cameras.bin', new File([''], 'cameras.bin')]]);
    useReconstructionStore.getState().setDroppedFiles(files);
    useReconstructionStore.getState().setSourceViewerState(state);
    expect(useReconstructionStore.getState().sourceViewerState).toEqual({ files, state });

    // A reload commits the same file map again.
    useReconstructionStore.getState().setDroppedFiles(files);
    expect(useReconstructionStore.getState().sourceViewerState?.state).toBe(state);

    useReconstructionStore.getState().setDroppedFiles(new Map());
    expect(useReconstructionStore.getState().sourceViewerState).toBeNull();

    useReconstructionStore.getState().setDroppedFiles(files);
    useReconstructionStore.getState().setSourceViewerState(state);
    useReconstructionStore.getState().clear();
    expect(useReconstructionStore.getState().sourceViewerState).toBeNull();
  });
```

In `src/hooks/fileDropzoneWorkflow.test.ts`:
- Add `import type { PublishedViewerState } from '../utils/publishedViewerState';`.
- Extend the `./useUrlState` import with `applySavedViewerState`.
- Add inside `describe('file dropzone workflow')`:

```ts
  it('restores the saved alignment that came with a reloaded URL dataset', async () => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { transform: { ...createIdentityEuler(), translationX: 5 } } } };
    // An applied transform moved the splat; Reload must return it to the saved alignment.
    useTransformStore.getState().setSplatTransform({ ...createIdentityEuler(), translationX: 9 });
    const deps = createDeps({
      getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
      setLoadedFiles: useReconstructionStore.getState().setLoadedFiles,
      parseFiles: vi.fn(async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false })),
      buildReconstruction: vi.fn(async () => ({ reconstruction: createReconstruction(), pointCount: 0 })),
    });
    const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin'].map(name => [name, file(name)]));

    await expect(processFileDropzoneFiles(files, deps, {
      viewerState: saved,
      onViewerState: viewerState => applySavedViewerState(viewerState, null),
    })).resolves.toBe(true);

    expect(useTransformStore.getState().splatTransform.translationX).toBe(5);
  });

  it('lets a settings file inside the files win over settings from their source', async () => {
    const fromSource: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null,
      config: { ui: { backgroundColor: '#111111' } } };
    const inFiles = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null,
      config: { ui: { backgroundColor: '#222222' } } });
    const onViewerState = vi.fn();
    const deps = createDeps({
      parseFiles: vi.fn(async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false })),
      buildReconstruction: vi.fn(async () => ({ reconstruction: createReconstruction(), pointCount: 0 })),
    });
    const files = new Map<string, File>(['cameras.bin', 'images.bin', 'points3D.bin'].map(name => [name, file(name)]));
    files.set('colmapview.yaml', new File([inFiles], 'colmapview.yaml'));

    await processFileDropzoneFiles(files, deps, { viewerState: fromSource, onViewerState });

    expect(onViewerState).toHaveBeenCalledWith(expect.objectContaining({ config: { ui: { backgroundColor: '#222222' } } }));
  });
```

In `src/hooks/useFileDropzone.test.ts`, inside `describe('useFileDropzone')`:

```ts
  it('re-applies saved source settings only to the files they came with', async () => {
    const files = new Map([['cameras.bin', buildFile('cameras.bin')]]);
    const saved = { version: 1, viewerVersion: 'test', viewState: null, config: {} };
    useReconstructionStore.getState().setDroppedFiles(files);
    useReconstructionStore.getState().setSourceViewerState(saved);
    const { result } = renderHook(() => useFileDropzone());

    await act(async () => { await result.current.reloadFiles(files); });
    expect(processFileDropzoneFilesMock).toHaveBeenLastCalledWith(files, expect.anything(),
      expect.objectContaining({ viewerState: saved }));

    const other = new Map(files);
    await act(async () => { await result.current.reloadFiles(other); });
    expect(processFileDropzoneFilesMock).toHaveBeenLastCalledWith(other, expect.anything(),
      expect.objectContaining({ viewerState: undefined }));
  });
```

In `src/hooks/useUrlLoader.test.ts`, next to the Task 4 tests:

```ts
  it('remembers the saved settings that came with a URL dataset for Reload', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const baseUrl = 'https://huggingface.co/datasets/owner/saved/resolve/main/';
    const request = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith('colmapview.yaml')) return new Response('ui:\n  background_color: "#123456"\n');
      if (String(url).includes('/api/datasets/')) return Response.json(hubEntries([]));
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal('fetch', request);
    processFilesMock.mockImplementationOnce(async files => {
      useReconstructionStore.getState().setDroppedFiles(files);
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles());
    });
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    await act(async () => { expect(await result.current.loadFromUrl(baseUrl)).toBe(true); });
    const { sourceViewerState, droppedFiles } = useReconstructionStore.getState();
    expect(sourceViewerState?.files).toBe(droppedFiles);
    expect(sourceViewerState?.state.config).toEqual({ ui: { backgroundColor: '#123456' } });
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/store/reconstructionStore.test.ts src/hooks/fileDropzoneWorkflow.test.ts src/hooks/useFileDropzone.test.ts src/hooks/useUrlLoader.test.ts`
Expected: FAIL. `setSourceViewerState` does not exist, the workflow ignores `viewerState` (the alignment stays reset at 0), and `sourceViewerState` is undefined after the URL load.

- [ ] **Step 3: Implement the store state.** In `src/store/reconstructionStore.ts`:
- Add `import type { PublishedViewerState } from '../utils/publishedViewerState';`.
- Add to `ReconstructionState`, next to `droppedFiles`:

```ts
  /**
   * Saved settings a URL dataset brought from its source (its colmapview.yaml or published
   * state), bound to the file map they came with. Reload re-applies them like a local
   * project's own YAML.
   */
  sourceViewerState: { files: Map<string, File>; state: PublishedViewerState } | null;
  setSourceViewerState: (state: PublishedViewerState | null) => void;
```

- Initialize it with `sourceViewerState: null,` next to `droppedFiles: null,`.
- Replace `setDroppedFiles` with:

```ts
  setDroppedFiles: (droppedFiles) => set({
    droppedFiles,
    // Settings belong to the files they came with; another dataset must not inherit them.
    ...(get().sourceViewerState?.files === droppedFiles ? {} : { sourceViewerState: null }),
  }),

  setSourceViewerState: (state) => {
    const files = get().droppedFiles;
    set({ sourceViewerState: state && files ? { files, state } : null });
  },
```

- Add `sourceViewerState: null,` to the object that `clear()` sets.

- [ ] **Step 4: Record the settings after a URL load.** In `src/hooks/useUrlLoader.ts`, at the end of the `if (loaded) { ... }` block in `runLoad`, after the picker offer from Task 4:

```ts
        // Reload re-reads the downloaded files; these settings are not among them.
        useReconstructionStore.getState().setSourceViewerState(savedViewerState);
```

- [ ] **Step 5: Accept the settings in the workflow.** In `src/hooks/fileDropzoneWorkflow.ts`:
- Add to `FileDropzoneWorkflowOptions`:

```ts
  /** Settings that came with these files from their source; a settings file inside them wins. */
  viewerState?: PublishedViewerState;
```

- In `processFileDropzoneFiles`, change `let viewerState: PublishedViewerState | null = null;` to:

```ts
  let viewerState: PublishedViewerState | null = normalizedOptions.viewerState ?? null;
```

- [ ] **Step 6: Supply the retained settings on Reload.** In `src/hooks/useFileDropzone.ts`:
- Add `'viewerState'` to `processFiles`' `Pick<FileDropzoneWorkflowOptions, ...>` list, and pass `viewerState: options.viewerState,` in the options given to `processFileDropzoneFiles`.
- Replace `reloadFiles` with:

```ts
  /** Re-read the current dataset (discarding edits) without dropping its remote splat tiles. */
  const reloadFiles = useCallback((files: Map<string, File>) => {
    // A URL dataset's saved settings are not among its files; re-apply them like a project's own YAML.
    const retained = useReconstructionStore.getState().sourceViewerState;
    return processFiles(files, undefined, {
      preserveRemoteSplatSources: true,
      viewerState: retained?.files === files ? retained.state : undefined,
    });
  }, [processFiles]);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/store src/hooks src/components/viewer3d`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/store/reconstructionStore.ts src/store/reconstructionStore.test.ts src/hooks/useUrlLoader.ts src/hooks/useUrlLoader.test.ts src/hooks/fileDropzoneWorkflow.ts src/hooks/fileDropzoneWorkflow.test.ts src/hooks/useFileDropzone.ts src/hooks/useFileDropzone.test.ts
git commit -m "Restore a URL dataset's saved alignment on Reload

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Whole-branch verification (controller)

- [ ] **Step 1:** `npx vitest run`. Expected: all files pass, and the test count is at least 4,343 plus the tests added above.
- [ ] **Step 2:** `npx tsc -b --force`. Expected: exit 0.
- [ ] **Step 3:** `npm run lint`. Expected: no errors.
- [ ] **Step 4:** `npm run build`. Expected: exit 0.
- [ ] **Step 5:** Run the `codex review --base 0a1d01c` gate and a final whole-branch review on the most capable model. Fix confirmed findings in follow-up commits.
