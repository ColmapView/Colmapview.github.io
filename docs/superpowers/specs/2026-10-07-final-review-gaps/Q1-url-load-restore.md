# Q1. URL load lifecycle and restore: fix spec

**Findings:** F1, F3, F7, F9, F15. **Extras:** X1, X6, X8, X11(d), X11(e).
**Base:** `fix/final-review-gaps` at `1984de8`. Line numbers below are at that commit.
**Scratch evidence:** `scratchpad/rev4/q1/` (a copy of `src/`, `e2e/`, `public/`, the configs and `tests/colmapFixturePaths.ts`). Every RED and GREEN run named below has its log in `scratchpad/rev4/q1/logs/`.

## Summary

| Item | Verdict | Disposition | Effort (implementer / reviewer) |
|---|---|---|---|
| F1 | Confirmed: e2e RED at HEAD | Fix: start the request beside an archive only once processing shows the archive has no settings of its own | medium / high |
| F3 | Confirmed | Fix: wait on a listing while it keeps answering, with a 120 s ceiling. **Decision change** | high / high |
| F7 | Confirmed | Fix: when the retry is withdrawn, the dead link leaves the address bar | medium / medium |
| F9 | Confirmed, also in Chromium | Fix: the late restore no longer re-applies the alignment | medium / high |
| F15 | Confirmed: five unpinned hand-offs | Fix: tests only, each RED from a targeted mutation | medium / high |
| X1 | Confirmed | Fix the wording. **User decision** on the `gated-repos` scope | low / low |
| X6 | Confirmed | Fix: a local load clears the warnings when it replaces the scene, not when it starts | low / medium |
| X8 | Confirmed | Fix: an explicit manifest splat whose size check answers 404 or 410 is left out and logged | low / medium |
| X11(d) | Confirmed, with one correction | Set aside: refactor only | — |
| X11(e) | Confirmed | Set aside: refactor only | — |

**Validation of the whole set, in the scratch copy, with every fix and test below applied:**
- `npx vitest run`: 578 files and 4795 tests passed; 2 files and 5 tests skipped, as at HEAD (`logs/full_vitest_final.log`).
- `npx tsc -p tsconfig.test.json --noEmit` is clean, and `npx eslint` on every touched file is clean (`logs/typecheck_final.log`, `logs/lint_final.log`).
- `npx playwright test --project=chromium`: 89 passed with F1 alone (`logs/F1_full_chromium.log`), and 89 passed with every Q1 fix (`logs/ALL_full_chromium.log`).
- All new tests run against the HEAD production files (`logs/ALL_tests_at_HEAD_prod.log`): 18 tests fail and nothing else does. They are the 17 marked "RED at HEAD" below, plus the F3 ceiling guard, whose constant does not exist at HEAD. The F15 tests and the F7 retry guard pass at HEAD, as intended.

**Line endings.** Every touched file is `i/lf` with `core.autocrlf=true`. The working trees are CRLF, except `src/hooks/urlLoaderManifestFetch.ts`, which is already `w/mixed` at HEAD (lines 656–678 are LF). After each commit, check that `git ls-files --eol` still shows `i/lf` and that `git diff --stat` touches only the intended lines.

---

## F1. Self-contained archives make a sidecar request, so the CI e2e test fails

### Verified
- `src/hooks/useUrlLoader.ts:88-89`: `settingsBesideOnce` calls `startOptionalDatasetViewerSettings(url, …)` as soon as it is created. The archive branch creates it at `:284`, before `loadZipUrlSource` downloads the archive. Whether the archive carries its own settings (`load.hasEmbeddedViewerSettings`, set at `:171`) is known only once processing starts.
- An archive with its own `colmapview.yaml` therefore asks for the one beside it during the download. The load's end aborts that request (`finishUrlLoad` aborts the load signal), but it has already reached the host.
- **e2e RED at HEAD** (scratch, port 5311): `e2e/dataset-viewer-settings.spec.ts:46`, "restores colmapview.yaml from a remote archive", fails with `Expected: 0, Received: 1` (`logs/F1_e2e_RED.log`). The other three rows pass.
- `src/hooks/useUrlLoader.test.ts:1084-1109` pins the extra, aborted request for `inside: true`.
- History: bd47de0 (last round's Task 8, carrying R2's note on R4 §G9) made the start eager for both branches.

### Root cause
The request start serves two cases that know different things at different times. A direct splat or point-cloud file can never carry settings, so its request can start with the download. An archive's need is known only after the download. The eager start was applied to both.

### Options considered
1. **Recommended: start the request once processing starts, and only for an archive without its own settings.** `settingsBesideOnce` gets an idempotent `start()`. The splat branch calls it at once, as today. The archive branch calls it from a `processFiles` wrapper, after `load.processFiles` has set `hasEmbeddedViewerSettings`. A self-contained archive makes no request. The request still overlaps parsing, which for a large model takes seconds, and the 3 s deadline still starts after parsing in `beforeSceneCommit`.
2. **Lazy for archives** (start inside `settle()`, as at e8a2a43). This is simpler, with no wrapper. But the request then starts with the 3 s deadline, so the deadline covers the whole round trip and none of the parse time. That is the latency G9 set out to remove.
3. **Keep the eager start and relax the e2e and unit expectations.** Rejected. Every self-contained archive would cost a request to its host. On the Hub that is one more anonymous request, and for a signed-in reader possibly the token-retry path. The e2e pins "no sidecar request for an archive" on purpose.
4. **Learn the archive's entries before the download ends** (range requests for the ZIP central directory). Rejected: complex, and the loader downloads the whole archive anyway.

The Drive branch (`:245-254`) has no settings beside it and is unchanged.

### Fix (code)
`src/hooks/useUrlLoader.ts`:
```diff
@@ -80,16 +80,18 @@
 }
 
 /**
- * The settings beside `url`, read once. They are asked for now, during the download (the load's end
- * aborts a request it never used), and their deadline starts when the load needs them: just before its
- * scene appears, so the restore lands with the scene, and again afterwards for a load that merged rather
- * than replaced.
+ * The settings beside `url`, read once. `start` asks for them as soon as the load knows it needs them
+ * (the load's end aborts a request it never used). Their deadline starts when the load needs them: just
+ * before its scene appears, so the restore lands with the scene, and again afterwards for a load that
+ * merged rather than replaced.
  */
 function settingsBesideOnce(url: string, load: UrlLoadContext) {
-  const request = startOptionalDatasetViewerSettings(url, load.fetchImpl, true, load.signal);
+  let request: OptionalViewerSettingsRequest | undefined;
+  const start = () => request ??= startOptionalDatasetViewerSettings(url, load.fetchImpl, true, load.signal);
   let settled: Promise<void> | undefined;
-  const settle = () => settled ??= applyOptionalSettingsBeside(request, load);
+  const settle = () => settled ??= applyOptionalSettingsBeside(start(), load);
   return {
+    start,
     beforeSceneCommit: () => {
       load.setUrlProgress({ percent: 90, message: 'Loading saved view settings...' });
       return settle();
@@ -267,6 +269,8 @@
       load.clearCachesOnFailure = false;
       load.setUrlProgress({ percent: 0, message: 'Loading 3D file...' });
       const settings = settingsBesideOnce(normalizedUrl, load);
+      // A lone file never holds settings of its own: ask for the ones beside it during its download.
+      settings.start();
       const loaded = await loadSplatUrlSource(normalizedUrl, {
         ...load,
         log: logInfo,
@@ -283,7 +287,13 @@
       logInfo(getArchiveUrlDetectedLogMessage(normalizedUrl));
       const settings = settingsBesideOnce(normalizedUrl, load);
       const loaded = await loadZipUrlSource(normalizedUrl, { ...load, log: logInfo,
-        // Known once processing starts: settings inside the archive are its own.
+        // Known once processing starts: settings inside the archive are its own. Only an archive
+        // without them asks for the ones beside it, while it parses.
+        processFiles: (files, range, options) => {
+          const processing = load.processFiles(files, range, options);
+          if (!load.hasEmbeddedViewerSettings) settings.start();
+          return processing;
+        },
         beforeSceneCommit: async () => { if (!load.hasEmbeddedViewerSettings) await settings.beforeSceneCommit(); } });
       if (loaded && !load.hasEmbeddedViewerSettings) {
         await settings.settle();
```
Notes:
- `load.processFiles` is the guarded wrapper from `runLoad`. It sets `hasEmbeddedViewerSettings` synchronously (`:171`) before it starts the workflow, so the flag is current when the wrapper reads it. A stale load throws in the guard before any request starts.
- The workflow does only light synchronous work before its first `await`. Parsing therefore starts after the request is in flight.
- An archive whose lone splat merges into an open scene still settles after the load (`:288-290`); `settle()` starts the request if needed. The test at `useUrlLoader.test.ts:894` covers this path and stays green.

### Tests (code)
`src/hooks/useUrlLoader.test.ts`: replace the test at `:1084-1109`, and add the new test right after it.
```ts
  it.each([
    { inside: false, requests: ['https://example.com/project/colmapview.yaml'], warnings: 1 },
    { inside: true, requests: [], warnings: 0 },
  ])('warns about settings beside an archive that do not arrive in time (settings inside: $inside)', async ({ inside, requests, warnings }) => {
    vi.useFakeTimers();
    vi.stubGlobal('Blob', NodeBlob);
    const request = vi.fn((_url: string | URL, _init?: RequestInit) => new Promise<Response>(() => {}));
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
    // Settings inside the archive are the dataset's own: an archive holding them asks for none beside it.
    expect(request.mock.calls.map(([url]) => String(url))).toEqual(requests);
    expect(request.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
    expect(settingsTimeoutWarnings()).toHaveLength(warnings);
  });

  it('asks for the settings beside an archive once it is downloaded without its own, while it parses', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const request = vi.fn((_url: string | URL, _init?: RequestInit) => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', request);
    let finishDownload: (() => void) | undefined;
    vi.spyOn(archiveSource, 'loadZipUrlSource').mockImplementation(async (_url, deps) => {
      await new Promise<void>(resolve => { finishDownload = resolve; });
      return (await deps.processFiles(new Map([['cameras.bin', new File(['c'], 'cameras.bin')]]), undefined,
        { throwOnError: true, beforeSceneCommit: deps.beforeSceneCommit })) !== false;
    });
    let finishParsing: (() => void) | undefined;
    processFilesMock.mockImplementationOnce(() => new Promise<void>(resolve => { finishParsing = resolve; }));
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromUrl('https://example.com/project/scene.zip'); });
    await waitFor(() => expect(finishDownload).toBeDefined());
    // While it downloads, nothing yet says whether the archive holds its own settings.
    expect(request).not.toHaveBeenCalled();
    act(() => finishDownload!());
    await waitFor(() => expect(finishParsing).toBeDefined());
    // Parsing has not finished, and the settings beside the archive are already on their way.
    await waitFor(() => expect(request.mock.calls.map(([url]) => String(url)))
      .toEqual(['https://example.com/project/colmapview.yaml']));
    act(() => useReconstructionStore.getState().cancelLoading());
    await act(async () => { finishParsing!(); expect(await pending).toBe(false); });
  });
```
`e2e/dataset-viewer-settings.spec.ts` is unchanged. It is the CI pin.

### RED and GREEN
| Test | RED | GREEN |
|---|---|---|
| e2e "restores colmapview.yaml from a remote archive" | HEAD: `Expected: 0, Received: 1` (`F1_e2e_RED.log`) | 4/4 rows pass (`F1_e2e_GREEN.log`) |
| "warns about … (settings inside: true)" | HEAD: `expected [ Array(1) ] to deeply equal []` (`F1_unit_RED.log`) | `F1_unit_GREEN.log` |
| "asks for the settings beside an archive once it is downloaded …" | HEAD: request called during the download. Mutation "lazy start" (delete the wrapper's `settings.start()`): request never made while parsing (`F1_unit_mut_lazy.log`) | `F1_unit_GREEN.log` |
| Full chromium project, F1 only | — | 89 passed (`F1_full_chromium.log`) |

### Risks and interactions
- **e2e:** `dataset-viewer-settings.spec.ts` turns GREEN. The "remote manifest" row (1 sidecar request) is unaffected. No other spec loads a remote archive.
- **Deliberate decisions:** the "settings deadline starts after parsing" rule is kept. The direct splat branch is unchanged, so `useUrlLoader.test.ts:976` (request during the download, deadline after parsing) stays green.
- **Q2:** F2 and X11(b) may edit `useUrlLoader.ts` (`requestSplatForLoad` at `:106-109`, the picker condition at `:211-215`). The hunks are disjoint from F1's; land sequentially.

### Effort
Implementer **medium** (a contained change with exact hunks). Reviewer **high**: request timing across download and parse; the reviewer must run the e2e spec.

---

## F3. The 30 s discovery cap drops every tile on slow listings

### Verified
- `src/hooks/urlLoaderManifestSource.ts:25`, `:70-85`, `:112-119`: `settleWithin(catalogTask, SPLAT_DISCOVERY_TIMEOUT_MS, …)` is one wall-clock timer, started after parsing. When it fires, discovery is aborted and every candidate is discarded.
- The directory crawl is strictly serial (`src/hooks/urlLoaderManifestFetch.ts:513` listing GETs, `:540` one HEAD per splat link). Its caps are 200 listings and 200 candidates (`:52-54`).
- The reviewer's probes `rev3/mirror/src/hooks/zz_VEf-6_1.test.ts` and `zz_VEf-6_2.test.ts` show it through the real `loadManifestSource`. For example, 40 3DGS blocks at 150 ms per request are about 285 serial requests (about 43 s): the scene commits at about 33 s with nothing listed, and every retry fails the same way.
- **Scratch RED at HEAD:** in the new test below, a listing that answers every second for 42 s gets `onSplatListTimeout` called (`logs/F3_unit_RED.log`).

### Root cause
The bound measures elapsed time, not whether the listing is stuck. A listing still answering after 30 s is treated like a stalled one.

### Options considered
1. **Recommended: wait while the listing keeps answering.** After parsing, the scene waits until the listing has given no answer for `SPLAT_DISCOVERY_TIMEOUT_MS` (still `FETCH_TIMEOUT`, 30 s), and never past `SPLAT_DISCOVERY_LIMIT_MS` (120 s) after parsing. Each discovery response (any status) counts as an answer. The wait still starts after parsing (G6).
   - A stalled listing is dropped as soon as today: one stalled request.
   - A healthy long crawl is kept. The ceiling is the crawl's own caps (200 listings and 200 size checks, one at a time) at 300 ms per request, which covers intercontinental round trips.
2. **A longer wall-clock cap only** (for example 120 s). This fixes the example, but a stalled listing would then hold the scene 120 s instead of 30 s, and larger or slower trees still hit the cliff.
3. **Commit at 30 s and merge a late catalog** (as the brief suggests weighing). Rejected:
   - It undoes G6's "the scene appears with its splat list".
   - Discovery would need a lifetime beyond `runLoad`, because `finishUrlLoad` aborts the load signal at the end of the load. It would also need its own currency check for a finished load.
   - The saved or automatic splat choice would need re-running on a late merge, because the restore has already run. `mergeRemoteSplatCatalog` never opens the picker, so a saved splat choice would be silently lost.
   - The persistent warning would need withdrawing on a late success.
4. **Keep the partial catalog at the deadline.** Rejected: a partial list of one auto-downloads (`getSplatAutoLoadDecision`), and the warning would have to say "some splats".
5. **A concurrent crawl** (bounded like classification, 6 at once). This is an efficiency gain (Ef-6) that would shrink the example to about 8 s, but the cliff stays and the crawl's cap order would change. It is an optional follow-up, not needed for correctness.

### Decision change
- **Was:** "the splat listing gets `SPLAT_DISCOVERY_TIMEOUT_MS` (30 s) after parsing; a slower one is dropped" (R2 §G6 "Discovery bound").
- **Now:** "after parsing, the scene waits on the listing while it keeps answering. It is dropped after 30 s without an answer, and at most 120 s after parsing."
- **Kept:**
  - The wait starts after parsing.
  - Settle-before-commit (G6).
  - One persistent warning when a listing is dropped, with the same text and raised at the same point.
  - A failed listing stays quiet.
- **Evidence:** the F3 example and the scratch test below. The warning is now shown only for a stalled or endless listing, never for one still answering, so its advice to reopen the link fits.
- **Cost:** a steady but long listing holds the parsed scene behind the overlay for up to 120 s, where today it shows the scene without splats at 30 s. Cancel still stops the whole load, as during any settle.

### Fix (code)
`src/hooks/urlLoaderManifestSource.ts`:
```diff
@@ -18,12 +18,18 @@
 export { OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS } from './urlLoaderViewerState';
 
 /**
- * How long the parsed scene waits for a splat listing that is still running. Discovery starts with
- * the downloads, so a listing unfinished this long after parsing is stalled; the scene then appears
- * without it, as when discovery fails.
+ * How long the parsed scene waits on a splat listing that has stopped answering: one stalled request.
+ * Discovery starts with the downloads; the wait starts after parsing and again with each answer. A
+ * dropped listing leaves the scene without splats, as when discovery fails.
  */
 export const SPLAT_DISCOVERY_TIMEOUT_MS = FETCH_TIMEOUT;
 
+/**
+ * However steadily a listing answers, the parsed scene waits at most this long after parsing: a folder
+ * crawl at its caps (200 listings and 200 size checks, one at a time) at 300 ms a request.
+ */
+export const SPLAT_DISCOVERY_LIMIT_MS = 120_000;
+
 const RESTORE_INPUTS_PROGRESS = { percent: 90, message: 'Looking for splats and saved settings...' };
 
 type ProcessFiles = (
@@ -66,15 +72,25 @@
   onAutoSplatSource?: (sourceId: string) => void;
 }
 
-/** Waits up to `ms` for work already running; the load's own cancellation still rejects. */
-async function settleWithin<T>(task: Promise<T>, ms: number, signal?: AbortSignal): Promise<{ value: T } | null> {
+/**
+ * Waits for work already running while it keeps answering: until `idleMs` pass without an answer (counted
+ * from this call at the earliest), and never past `limitMs` after it. The load's own cancellation still rejects.
+ */
+async function settleWhileAnswering<T>(task: Promise<T>, lastAnswerAt: () => number, idleMs: number, limitMs: number,
+  signal?: AbortSignal): Promise<{ value: T } | null> {
+  const start = Date.now();
   let timer: ReturnType<typeof setTimeout> | undefined;
   let cancel: (() => void) | undefined;
   const deadline = new Promise<null>((resolve, reject) => {
     cancel = () => reject(signal?.reason ?? new DOMException('Dataset load cancelled', 'AbortError'));
     if (signal?.aborted) { cancel(); return; }
     signal?.addEventListener('abort', cancel, { once: true });
-    timer = setTimeout(() => resolve(null), ms);
+    const check = () => {
+      const remaining = Math.min(Math.max(start, lastAnswerAt()) + idleMs, start + limitMs) - Date.now();
+      if (remaining <= 0) resolve(null);
+      else timer = setTimeout(check, remaining);
+    };
+    check();
   });
   try {
     return await Promise.race([task.then(value => ({ value })), deadline]);
@@ -102,18 +118,27 @@
   const fetchImpl = deps.fetchImpl ?? ((url, init) => fetchDatasetResource(url, undefined, init));
   const discoveryController = new AbortController();
   const discoverySignal = deps.signal ? anySignal([deps.signal, discoveryController.signal]) : discoveryController.signal;
+  let lastDiscoveryAnswer = 0;
   const discover = deps.discoverSplatCatalog ?? ((target: ColmapManifest) => discoverManifestSplatCatalog(target, {
-    fetchImpl: (url, init) => fetchImpl(url, { ...init, signal: discoverySignal }), log, isTouchDevice: deps.isTouchDevice,
+    // Each answer shows that a long listing is still moving rather than stalled.
+    fetchImpl: async (url, init) => {
+      const response = await fetchImpl(url, { ...init, signal: discoverySignal });
+      lastDiscoveryAnswer = Date.now();
+      return response;
+    },
+    log, isTouchDevice: deps.isTouchDevice,
   }));
   // Discovery and optional settings do not gate required file transfer or parsing.
   const catalogTask = discover(manifest).catch(() => [] as RemoteSplatCandidate[]);
   let catalogSettled: Promise<RemoteSplatCandidate[]> | undefined;
-  /** The listing, given SPLAT_DISCOVERY_TIMEOUT_MS from the first call; a slower one is dropped like a failed one. */
-  const settleCatalog = () => catalogSettled ??= settleWithin(catalogTask, SPLAT_DISCOVERY_TIMEOUT_MS, deps.signal)
+  /** The listing, waited for from the first call while it answers; a stalled or endless one is dropped like a failed one. */
+  const settleCatalog = () => catalogSettled ??= settleWhileAnswering(catalogTask, () => lastDiscoveryAnswer,
+    SPLAT_DISCOVERY_TIMEOUT_MS, SPLAT_DISCOVERY_LIMIT_MS, deps.signal)
     .then(result => {
       if (result) return result.value;
       discoveryController.abort(new DOMException('Splat discovery timed out', 'TimeoutError'));
-      log(`[URL Loader] Splat discovery took longer than ${SPLAT_DISCOVERY_TIMEOUT_MS / 1000} s after parsing; no splats are listed`);
+      log(`[URL Loader] Splat discovery stopped answering for ${SPLAT_DISCOVERY_TIMEOUT_MS / 1000} s, or ran `
+        + `${SPLAT_DISCOVERY_LIMIT_MS / 1000} s after parsing; no splats are listed`);
       deps.onSplatListTimeout?.();
       return [];
     });
```
Notes:
- `Math.max(start, lastAnswerAt())` keeps the "deadline after parsing" rule. An answer before parsing ended never shortens the wait.
- One timer is re-armed per idle window, not per answer. Vitest fake timers also fake `Date`, so the tests are deterministic.
- An injected `deps.discoverSplatCatalog` gives no answers. Its wait is the idle window from the first call, which matches today's single timer, so the existing tests at `urlLoaderManifestSource.test.ts:144`, `:174` and `:202` pass unchanged.
- Production requests keep their own 30 s inactivity timeout (`fetchWithTimeout`). A single stalled request drops the listing, as at HEAD.

### Tests (code)
`src/hooks/urlLoaderManifestSource.test.ts`:
- Import `SPLAT_DISCOVERY_LIMIT_MS` next to `SPLAT_DISCOVERY_TIMEOUT_MS` (line 5).
- Optionally retitle the test at `:144` to "shows the scene without a splat listing that has not answered for SPLAT_DISCOVERY_TIMEOUT_MS after parsing, and stops it". Its body is unchanged.
- Insert the two tests below after that test.
```ts
  it('keeps waiting for a splat listing that still answers, past SPLAT_DISCOVERY_TIMEOUT_MS after parsing', async () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    const tiles = Array.from({ length: 40 }, (_, index) => `tile_${index}.spz`);
    const listings = new Map([['https://example.com/dataset/', ['splats/']], ['https://example.com/dataset/splats/', tiles]]);
    // A slow autoindex host: every request answers a second after it is made, and the crawl makes one at a time.
    deps.fetchImpl.mockImplementation((url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        const entries = listings.get(url);
        resolve(init?.method === 'HEAD' ? new Response(null, { headers: { 'content-length': '100' } })
          : entries ? new Response(entries.map(name => `<a href="${name}">${name}</a>`).join('\n'))
            : new Response('', { status: 404 }));
      }, 1_000);
      init?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(init.signal!.reason); }, { once: true });
    }));
    const onRemoteSplatCatalog = vi.fn();
    const onSplatListTimeout = vi.fn();
    const loading = loadManifestSource(manifest, { type: 'manifest' },
      { ...deps, discoverSplatCatalog: undefined, onRemoteSplatCatalog, onSplatListTimeout, isTouchDevice: false });

    // Two listings and 40 size checks: 42 s of answers, nearly all of them after parsing.
    await vi.advanceTimersByTimeAsync(45_000);
    await expect(loading).resolves.toBe(true);
    expect(onSplatListTimeout).not.toHaveBeenCalled();
    expect(onRemoteSplatCatalog).toHaveBeenCalledOnce();
    expect(onRemoteSplatCatalog.mock.calls[0][0]).toHaveLength(40);
  });

  it('drops a splat listing still running SPLAT_DISCOVERY_LIMIT_MS after parsing, however steadily it answers', async () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    const folders = Array.from({ length: 199 }, (_, index) => `folder_${index}/`);
    deps.fetchImpl.mockImplementation((url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(url === 'https://example.com/dataset/'
        ? new Response(folders.map(name => `<a href="${name}">${name}</a>`).join('\n'))
        : new Response('', { status: url.endsWith('colmapview.yaml') ? 404 : 200 })), 1_000);
      init?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(init.signal!.reason); }, { once: true });
    }));
    const onRemoteSplatCatalog = vi.fn();
    const onSplatListTimeout = vi.fn();
    let settled = false;
    const loading = loadManifestSource(manifest, { type: 'manifest' },
      { ...deps, discoverSplatCatalog: undefined, onRemoteSplatCatalog, onSplatListTimeout }).finally(() => { settled = true; });

    // 200 folders, one listing a second: the crawl would need 200 s.
    await vi.advanceTimersByTimeAsync(SPLAT_DISCOVERY_LIMIT_MS - 1_000);
    expect(settled).toBe(false);
    expect(onSplatListTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onSplatListTimeout).toHaveBeenCalledOnce();
    await expect(loading).resolves.toBe(true);
    expect(deps.setSourceInfo).toHaveBeenCalledOnce();
    expect(onRemoteSplatCatalog).not.toHaveBeenCalled();
  });
```

### RED and GREEN
| Test | RED | GREEN |
|---|---|---|
| "keeps waiting for a splat listing that still answers …" | HEAD: `onSplatListTimeout` called once (`F3_unit_RED.log`) | `F3_unit_GREEN.log` |
| "drops a splat listing still running SPLAT_DISCOVERY_LIMIT_MS …" | Guard. Mutation "no ceiling" (`start + limitMs` → `Infinity`) makes it RED (`F3_unit_mut_nolimit.log`). It also fails at HEAD, where the constant does not exist | `F3_unit_GREEN.log` |
| The existing deadline tests (`:144`, `:174`, `:202`) and `useUrlLoader.test.ts:1030` | — | unchanged and green |

### Risks and interactions
- **e2e:** `dataset-viewer-settings.spec.ts` ("remote manifest" crawls the listing) and `hugging-face-publish.spec.ts` (the recipient opens a Hub dataset, which runs the tree discovery). Both passed in the all-fixes chromium run.
- **Overlay:** "Looking for splats and saved settings..." may now stay up to 120 s on a long but healthy crawl. A progress count in that message would help, but it is UI polish outside this fix.
- **X8** (below) edits `urlLoaderManifestFetch.ts` in the same discovery area. Same task.

### Effort
Implementer **high** and reviewer **high**: a deadline whose meaning changes (Decision change), timers, and fake-time tests.

---

## F7. A failed `#d=` link's camera lands on the next dataset

### Verified
- `src/appStartupRetry.ts:27-41`: a failed startup link publishes a Retry. The Retry is withdrawn when `urlError` changes (a URL load starts, or `clear()`) or a dataset load starts (`onReconstructionLoadStart`). The address bar is never touched, so the dead `#d=` (or `?url=`) link stays.
- `src/components/viewer3d/useTrackballUrlCameraRestore.ts:30-60` applies the hash's camera once per session, to the first scene that appears. After a failed link, that is the next, unrelated dataset. A page reload (F5) also re-runs the dead link.
- The reviewer's `rev3/mirror/src/components/viewer3d/zz_VA1-1_staleHashCamera.test.tsx`: after a failed link and a dropped dataset, the camera sits at the dead link's `[90,190,307]` for a scene of radius 0.9.
- **Scratch RED at HEAD:** the three withdrawal rows below see `hasUrlToLoad()` still `true` (`logs/F7_unit_RED.log`).

### Root cause
The Retry needs the link in the address bar, because the App's loader (`applyUrlOverrides`) re-reads the hash for the link's view and settings (R4 §G14). Nothing removes the link once the Retry no longer applies.

### Options considered
1. **Recommended: when the Retry is withdrawn by anything but itself, remove the dead link** (`clearUrlLoadRequestFromLocation`: `?url=` and `#d=`; other parameters stay). This fixes the camera restore and the F5 re-run together, at the moment G14 already treats as "the link is no longer the one on screen".
2. **Make the trackball skip the hash after a failed link** (a module flag). This fixes the camera only; F5 still re-runs the dead link, and the trackball would become coupled to startup state.
3. **Strip the link when it fails.** Rejected: it breaks the Retry, which re-reads the hash.

### Fix (code)
`src/appStartupRetry.ts`:
```diff
@@ -1,4 +1,5 @@
 import { useReconstructionStore } from './store';
+import { clearUrlLoadRequestFromLocation } from './store/reconstructionStore';
 import { onReconstructionLoadStart } from './wasm/reconstructionLoadLifecycle';
 
 type Retry = () => Promise<void>;
@@ -31,11 +32,17 @@
     publish(null);
     return run();
   };
+  // The retry reads the link from the address bar. Withdrawn, the dead link leaves it, so neither a
+  // page reload nor the next scene's camera restore runs it again.
+  const abandon = () => {
+    publish(null);
+    clearUrlLoadRequestFromLocation();
+  };
   publish(retry);
   const stopWatchingError = useReconstructionStore.subscribe(state => {
-    if (state.urlError !== failure) publish(null);
+    if (state.urlError !== failure) abandon();
   });
   // A local load never touches urlError, so its start is seen through the load lifecycle.
-  const stopWatchingLoads = onReconstructionLoadStart(() => publish(null));
+  const stopWatchingLoads = onReconstructionLoadStart(abandon);
   release = () => { stopWatchingError(); stopWatchingLoads(); };
 }
```
Notes:
- `retry()` releases the watchers before it runs, so the Retry itself never strips the link.
- A new offer replaces the old one through `publish` and does not strip.
- `clearUrlLoadRequestFromLocation` is not in the store barrel. Importing it directly, as `useUrlLoader.ts` imports `isSplatDownloadPending`, is allowed outside components.

### Tests (code)
`src/appStartupLoad.test.ts`. Add these imports:
```ts
import { hasUrlToLoad, useCameraStore, useReconstructionStore } from './store';
import { decodeCameraState } from './hooks/useUrlState';
import { decodeShareData, encodeShareData } from './utils/shareDataCodec';
import { beginReconstructionLoad } from './wasm/reconstructionLoadLifecycle';
```
Insert before `it('keeps the retry when the folder picker is cancelled, since nothing loads'`:
```ts
  describe('a failed link in the address bar', () => {
    const view = { position: [90, 190, 307] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number],
      target: [90, 190, 290] as [number, number, number], distance: 17 };
    async function failLinkInAddressBar(loadFromUrl: (url: string) => Promise<boolean> = loader(false)) {
      window.history.replaceState(null, '', '/?keep=1#' + encodeShareData(datasetUrl, view) + '&other=1');
      const plan = getAppStartupLoadPlan({ shareData: await decodeShareData(window.location.hash), legacyManifestUrl: null });
      await runStartupLoadPlan(plan, { loadFromUrl, loadFromManifest: vi.fn() });
      expect(startupLinkRetry.getSnapshot()).not.toBeNull();
    }
    afterEach(() => window.history.replaceState(null, '', '/'));

    it('stays there for its retry, which reads the view from it', async () => {
      // The App's loader reads the link's view and settings from the address bar.
      const hashes: string[] = [];
      const outcomes = loader(false, true);
      await failLinkInAddressBar(async () => { hashes.push(window.location.hash); return outcomes(); });
      await startupLinkRetry.getSnapshot()!();
      expect(hashes).toHaveLength(2);
      expect(await decodeCameraState(hashes[1])).toEqual(view);
      expect(hasUrlToLoad()).toBe(true);
    });

    it.each([
      ['a local load starts', () => beginReconstructionLoad().finish()],
      ['a URL load starts', () => useReconstructionStore.getState().setUrlError(null)],
      ['the viewer is cleared', () => useReconstructionStore.getState().clear()],
    ])('leaves it, with its view, once %s', async (_name, withdraw) => {
      await failLinkInAddressBar();
      withdraw();
      expect(startupLinkRetry.getSnapshot()).toBeNull();
      // A reload no longer runs the dead link, and the next scene's view restore finds no view.
      expect(hasUrlToLoad()).toBe(false);
      expect(await decodeCameraState(window.location.hash)).toBeNull();
      expect(window.location.search).toBe('?keep=1');
      expect(window.location.hash).toBe('#other=1');
    });
  });
```
`decodeCameraState` is exactly what `useTrackballUrlCameraRestore` reads (`useTrackballUrlCameraRestore.ts:41`).

### RED and GREEN
| Test | RED | GREEN |
|---|---|---|
| "leaves it, with its view, once …" (3 rows) | HEAD: `expected true to be false` (`hasUrlToLoad()`) (`F7_unit_RED.log`) | `F7_unit_GREEN.log` |
| "stays there for its retry, which reads the view from it" | Guard, green at HEAD. Mutation "strip on retry" (add `clearUrlLoadRequestFromLocation()` to `retry`) makes it RED (`F7_unit_mut_retrystrip.log`) | `F7_unit_GREEN.log` |

### Risks and interactions
- **G14 is kept:** the Retry still stays until another load starts. R4 §G14 listed the paths that rewrite the hash (Cancel with nothing on screen, a declined crash-loop prompt, the splat-only fallback); this adds a fourth.
- **Residual (out of scope):** a hand-made legacy `?url=X#c=Y` link keeps its `#c=` camera after the strip. `clearUrlLoadRequestFromLocation` keeps other hash parameters on purpose, because `#c=` alone is the camera-only Share link for local datasets. Share and the Drive hand-off always produce `#d=`.
- **e2e:** no spec covers a failed link. In `hugging-face-publish.spec.ts` the recipient opens a successful `?url=` link, which is unaffected. Green in the all-fixes run.
- **Q2:** F4 edits `cancelLoading` in `src/store/reconstructionStore.ts`. F7 only imports `clearUrlLoadRequestFromLocation` from that module.

### Effort
Implementer **medium**, reviewer **medium**: one module, with a clear rule about when the link leaves.

---

## F9. The restore re-applies transforms after the splat download

### Verified
- `src/hooks/useUrlState.ts:131-144`: `restorationConfig` spreads `...config`, so `transform` and `splat.transform` reach `applyShareConfig` (`:162-163`) a second time, after `activateSavedSplat` (`:160`). They were already applied with the view at `:156-157`.
- An edit made during the download is reverted. An "Apply transform to data" made then bakes T, and is followed by T again, so the points end at T∘T and the splat at T∘S.
- **Chromium, scratch** (the reviewer's `zz_VA1-5_reach` probe, with its assertion turned to the fixed outcome; `e2e/zz_q1_F9_apply_during_restore.spec.ts` in the scratch only):
  - Tab reaches the Transform panel during "Downloading splat", and Apply is pressed.
  - HEAD, after the restore: `{"tx":5,"splatTx":0,"editRevision":1}`, RED (`logs/F9_e2e_RED.log`).
  - Fixed: `{"tx":0,"splatTx":5,"editRevision":1}`, GREEN (`logs/F9_e2e_GREEN.log`).
- **Scratch unit RED at HEAD:** the new test below shows `translationX: 5` and `translationY: 2` re-applied over the user's edit, for both a saved and a shared alignment (`logs/F9_unit_RED.log`).

### Root cause
The late pass was written to apply display, but it inherits every section through the spread. Nothing in between resets the alignment:
- A restored activation goes through `selectSplatSource`, which never resets transforms.
- `setLoadedFiles` resets the splat transform (`reconstructionStore.ts:400-402`), but only at the commit, which happens before the restore, and in `clear()`.

The comment "Activating a file can reset its alignment" (`useUrlState.ts:189`) applies inside one `applyShareConfig` call that carries `activeSourceId`. `restorationConfig` deletes that field.

### Fix (code)
`src/hooks/useUrlState.ts`:
```diff
@@ -131,14 +131,17 @@
   const restorationConfig = (config: ShareConfig): ShareConfig => {
     const restored: ShareConfig = {
       ...config,
-      // Navigation and the selection went with the view; reapplied, they would undo a change made during the download.
+      // Alignment, navigation and the selection went with the view; reapplied, they would undo a change
+      // made during the download, and an alignment applied to the data then would be applied twice.
       camera: pickSectionFields(config.camera, VIEW_NAVIGATION_FIELDS.camera, false),
       ui: pickSectionFields(config.ui, VIEW_NAVIGATION_FIELDS.ui, false),
     };
+    delete restored.transform;
     if (config.splat) {
       // Apply the effective selection once, after merging saved and URL choices.
       restored.splat = { ...config.splat };
       delete restored.splat.activeSourceId;
+      delete restored.splat.transform;
     }
     return restored;
   };
```

### Tests (code)
`src/hooks/useUrlState.test.ts`: insert before `it("restores the selection with the navigation, the viewer URL's winning, and keeps a selection made during the download"`.
```ts
  it.each(['saved', 'shared'] as const)('keeps an alignment change made while the restored splat downloads (%s alignment)', async origin => {
    installSavedSplatSources();
    const download = stubPendingDownload();
    const alignment = { transform: { ...createIdentityEuler(), translationX: 5 },
      splat: { transform: { ...createIdentityEuler(), translationY: 2 } } };
    const saved = savedSplatState();
    const restoration = origin === 'saved'
      ? applySavedViewerState({ ...saved, config: { ...saved.config, ...alignment, splat: { ...saved.config.splat, ...alignment.splat } } }, null)
      : applySavedViewerState(saved, { config: alignment });
    // The alignment landed with the view, before the download.
    expect(useTransformStore.getState()).toMatchObject({ transform: alignment.transform, splatTransform: alignment.splat.transform });
    const edited = { ...createIdentityEuler(), rotationZ: 30 };
    useTransformStore.getState().setTransform(edited);
    useTransformStore.getState().setSplatTransform(createIdentityEuler());
    download.respond(new Response(new Blob(['splat']), { status: 200 }));
    await restoration;
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeDefined();
    expect(useTransformStore.getState()).toMatchObject({ transform: edited, splatTransform: createIdentityEuler() });
    // Display still lands once the splat is in.
    expect(useUIStore.getState().backgroundColor).toBe('#123456');
  });
```
An Apply during the download leaves the store in the same kind of state (transform at identity, splat transform composed), so this test covers that case too. The browser probe above shows it end to end.

### RED and GREEN
| Test | RED | GREEN |
|---|---|---|
| "keeps an alignment change made while the restored splat downloads" (saved, shared) | HEAD (`F9_unit_RED.log`) | `F9_unit_GREEN.log`: 9 files and 281 tests, including `sceneTransformLifecycle`, `sessionActions`, `TrackballControls`, the workflow's Reload tests and `useUrlLoader` |
| Chromium probe (scratch only) | HEAD: `tx` 5 | `tx` 0, `splatTx` 5 |

### Risks and interactions
- **Deliberate restore order:** "alignment lands early, display lands late" is kept. The alignment now lands only early, which is what the rule describes. The early `viewConfig` pass and E6 (the loader applies a share link's alignment once the scene exists) are unchanged.
- **Reload:** Reload restores through `complete()` with no activation (`withoutSplatChoice`), so the early pass alone gives the same result.
- **Q2 F2** edits `collectShareConfig` (`useUrlState.ts:62-65`) in the same file. The hunks are disjoint; land sequentially.
- **e2e:** no spec in the suite covers this. The browser probe is scratch evidence; it is not proposed for the repo, because it imports dev-server modules and tabs 44 times.

### Effort
Implementer **medium** (a two-line fix). Reviewer **high**: confirm that nothing between the early and late passes resets the alignment, as argued above.

---

## F15. No test pins G6's `beforeSceneCommit` hand-off

### Verified
Five hand-offs have no test. In the scratch copy, deleting each one leaves the existing suite green (only the new tests below fail):

| Id | Code at HEAD | What breaks without it |
|---|---|---|
| M1 | `src/hooks/useFileDropzone.ts:115` `beforeSceneCommit: options.beforeSceneCommit,` | Every URL load commits before its settings and splat list settle |
| M2 | `useFileDropzone.ts:121` `initialSplatSelectionRevision,` (options passed to the workflow) | A None picked while a folder scans is ignored, and the default splat decodes |
| M3 | `useFileDropzone.ts:40` `initialSplatSelectionRevision,` (`beginLocalLoad`'s return) | Same as M2 |
| M4a / M4b | `src/hooks/fileDropzoneWorkflow.ts:497` / `:456` (`settleBeforeCommit` passed to `runNewPointCloudOnlyLoad`) | Point-cloud `.ply` URLs (alone at `:497`; with a settings or config file at `:456`) commit before their settings |
| M5 | `src/hooks/fileDropzoneLocalSources.ts:239` `if (isAbortError(error)) return false;` (the error branch that follows it) | A folder-picker failure that is not a cancel would be swallowed as a cancel |

`useUrlLoader.test.ts` mocks `./useFileDropzone`, and its `processWithStore` helper calls the workflow directly, bypassing line 115.

### Fix (code)
Tests only. They run through the real `useFileDropzone` hook, and the hook-level tests also run the real workflow, with only parsing stubbed. The mocked module `./fileDropzoneWorkflow` passes through to the actual one.

### Tests (code)
**`src/hooks/useFileDropzone.test.ts`.**
- Change the imports:
  - `import { act, cleanup, renderHook, waitFor } from '@testing-library/react';`
  - `import { Blob as NodeBlob } from 'node:buffer';`
  - `import { useUrlLoader } from './useUrlLoader';`
  - `import { createDefaultManifest } from './urlLoaderPolicy';`
- Append this `describe` inside the top-level one, after the last test:
```ts
  describe('through the real workflow, with parsing stubbed', () => {
    const parseFiles = vi.fn(async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false }));
    beforeEach(() => {
      parseFiles.mockClear();
      processFileDropzoneFilesMock.mockImplementation((files, deps, options) => actualWorkflow.processFileDropzoneFiles(files, {
        ...deps, logger: noopLogger, clearCaches: vi.fn(), delay: async () => {}, shouldPreloadSplatRuntime: () => false, parseFiles,
        buildReconstruction: async () => ({ reconstruction: buildReconstruction(), pointCount: 0 }),
      }, options));
    });
    afterEach(() => {
      processFileDropzoneFilesMock.mockImplementation(async () => true);
      vi.unstubAllGlobals();
    });

    it('keeps a URL dataset off screen until its saved settings answer', async () => {
      vi.stubGlobal('Blob', NodeBlob);
      let respond: ((response: Response) => void) | undefined;
      vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => String(url).endsWith('colmapview.yaml')
        ? new Promise<Response>(resolve => { respond = resolve; }) : new Response(new Uint8Array([1, 2, 3]))));
      const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
      let pending!: Promise<boolean>;
      act(() => { pending = result.current.loadFromManifest(createDefaultManifest('https://example.com/project/')); });
      await waitFor(() => expect(parseFiles).toHaveBeenCalledOnce());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
      // Parsed, and held back behind the overlay and its Cancel until its settings answer.
      expect(useReconstructionStore.getState()).toMatchObject({ reconstruction: null, loadedFiles: null, urlLoading: true });
      await act(async () => {
        respond!(new Response('ui:\n  background_color: "#123456"\n'));
        expect(await pending).toBe(true);
      });
      expect(useReconstructionStore.getState().reconstruction).not.toBeNull();
      expect(useUIStore.getState().backgroundColor).toBe('#123456');
    });

    it('keeps None picked while a dropped folder is still being read', async () => {
      const a = buildFile('a.spz');
      useReconstructionStore.getState().setLoadedFiles({ ...buildLoadedFiles(), splatFile: a, splatFiles: [a],
        splatFileSources: [{ id: 'a.spz', path: 'a.spz', file: a }] });
      const entries = ['cameras.bin', 'images.bin', 'points3D.bin', 'default.spz'].map(name => buildFileSystemFileEntry({ name }));
      let finishScan!: () => void;
      const last = entries[3];
      const read = last.file.bind(last);
      vi.spyOn(last, 'file').mockImplementation((done, fail) => { finishScan = () => read(done, fail); });
      const { result } = renderHook(() => useFileDropzone());
      const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: {
        types: ['Files'], files: [], items: entries.map(entry => ({ kind: 'file', webkitGetAsEntry: () => entry })),
      } } as unknown as DragEvent<HTMLElement>;
      let pending!: Promise<void>;
      act(() => { pending = result.current.handleDrop(event); });
      await vi.waitFor(() => expect(finishScan).toBeTypeOf('function'));
      // None, for the files still being read.
      await act(async () => { await useReconstructionStore.getState().selectSplatSource(''); });
      await act(async () => { finishScan(); await pending; });
      const loaded = useReconstructionStore.getState().loadedFiles;
      expect(loaded?.splatFileSources?.map(source => source.path)).toEqual(['default.spz']);
      expect(loaded?.splatFile).toBeUndefined();
    });
  });
```

**`src/hooks/fileDropzoneWorkflow.test.ts`**: insert before `it('keeps the previous scene when the load is cancelled while the new one settles'`. It reuses `genericPointCloudPly` and `createDeps`.
```ts
  it.each([
    ['alone', () => new Map([['points.ply', genericPointCloudPly()]])],
    ['with its settings', () => new Map([['points.ply', genericPointCloudPly()], ['colmapview.yaml', new File(['ui: {}'], 'colmapview.yaml')]])],
  ])('replaces the scene with a point cloud (%s) only once beforeSceneCommit settles', async (_name, files) => {
    const order: string[] = [];
    let settle!: () => void;
    const deps = createDeps({ setLoadedFiles: vi.fn(() => { order.push('commit'); }) });
    const pending = processFileDropzoneFiles(files(), deps, {
      replaceSplatScene: true,
      beforeSceneCommit: () => new Promise<void>(resolve => { order.push('settle'); settle = resolve; }),
    });
    await vi.waitFor(() => expect(order).toEqual(['settle']));
    settle();
    expect(await pending).toBe(true);
    expect(order).toEqual(['settle', 'commit']);
  });
```

**`src/hooks/fileDropzoneLocalSources.test.ts`**: insert before `it('treats cancelled directory browsing as a no-op'`.
```ts
  it('reports a folder picker that fails for another reason, without starting a load', async () => {
    const blocked = Object.assign(new Error('Must be handling a user gesture to show a file picker.'), { name: 'SecurityError' });
    const deps = { ...makeBaseDeps(), beginLoad: vi.fn(beginReconstructionLoad), scanDirectoryHandle: vi.fn(),
      pickDirectory: vi.fn(async () => { throw blocked; }) };

    await expect(loadBrowsedDirectory(deps)).resolves.toBe(false);

    expect(deps.errorLog).toHaveBeenCalledWith('Error browsing for folder:', blocked);
    expect(deps.setError).toHaveBeenCalledWith('Must be handling a user gesture to show a file picker.');
    expect(deps.beginLoad).not.toHaveBeenCalled();
    expect(deps.cancelUrlLoad).not.toHaveBeenCalled();
    expect(deps.scanDirectoryHandle).not.toHaveBeenCalled();
  });
```
The error is a plain `Error` with a picker's `name`, so `getErrorMessage` reads its message in every realm.

### RED from targeted mutations
Each mutation is a one-line edit, reverted afterwards (`logs/mutate.py`, logs `logs/F15_mut_<id>.log`). Each makes exactly one new test RED and nothing else:

| Mutation | RED test |
|---|---|
| M1: delete `useFileDropzone.ts:115` | "keeps a URL dataset off screen until its saved settings answer" |
| M2: delete `useFileDropzone.ts:121` | "keeps None picked while a dropped folder is still being read" |
| M3: delete `useFileDropzone.ts:40` | "keeps None picked while a dropped folder is still being read" |
| M4a: `reportSceneReplacement, settleBeforeCommit);` → `reportSceneReplacement);` at `fileDropzoneWorkflow.ts:497` | "replaces the scene with a point cloud (alone) …" |
| M4b: the same at `:456` | "replaces the scene with a point cloud (with its settings) …" |
| M5: `if (isAbortError(error)) return false;` → `return false;` at `fileDropzoneLocalSources.ts:239` | "reports a folder picker that fails for another reason …" |

All four test groups pass at HEAD (`logs/ALL_tests_at_HEAD_prod.log`) and with every fix (`logs/F15_all_GREEN.log`).

### Risks and interactions
- **Q2 F11** changes the in-load pick read (`useFileDropzone.ts:108-111`) and probably adds tests to `useFileDropzone.test.ts` and `fileDropzoneWorkflow.test.ts`. "keeps None picked while a dropped folder is still being read" must stay green under F11's fix: a None picked during the load is honoured.
- **e2e:** none. These are unit and hook tests.

### Effort
Implementer **medium** (the test code is given). Reviewer **high**: re-run the six mutations.

---

## Extras

### X1. A signed-in reader of a gated dataset gets the generic message: **Fix**, plus a **User decision**

**Verified.**
- `src/features/huggingface/datasetAccess.ts:46-49`: an authenticated 403 always reads "This Hugging Face account cannot read the dataset…", although the Hub marks it `X-Error-Code: GatedRepo`.
- `docs/hugging-face-loading.md:36` promises "Gated datasets are reported as gated."
- The reviewer's `rev3/mirror/src/features/huggingface/zz_VF3-3_gatedSignedIn.test.ts` reproduces it.
- Hub docs (Context7, `/huggingface/hub-docs`, `oauth.md`): "`gated-repos`: Read the content of public gated repos the user has been granted access to. Unlike `read-repos`, this does not grant access to private repos." The app requests `openid profile read-repos` (`src/features/huggingface/auth.ts:10-11`). So even an approved account is very likely refused.

**Root cause.** The 403 branch ignores the Hub's mark. The requested scopes do not cover gated repos.

**Fix (code).** The signed-in text names the dataset as gated without promising that approval is enough, because the scope is missing.

`src/features/huggingface/datasetAccess.ts`:
```diff
@@ -21,8 +21,10 @@
 const MISSING_OR_PRIVATE = 'Hugging Face dataset not found, or it is private. Check the URL. '
   + 'Sign in with Hugging Face to open a private dataset, then retry.';
 
+const isGated = (response: Response) => response.headers.get('X-Error-Code') === 'GatedRepo';
+
 function signedOutDenial(response: Response): HfError {
-  return new HfError(response.headers.get('X-Error-Code') === 'GatedRepo'
+  return new HfError(isGated(response)
     ? 'This Hugging Face dataset is gated: only accounts its owner has approved can open its files.'
     : MISSING_OR_PRIVATE, response.status);
 }
@@ -49,7 +51,9 @@
     }
     if (response.status === 403) {
       discard(response);
-      throw new HfError('This Hugging Face account cannot read the dataset. Check repository and organization permissions.', 403);
+      // Without the gated-repos scope, an account its owner approved is refused too.
+      throw new HfError(isGated(response) ? 'This Hugging Face dataset is gated, and this sign-in cannot open its files.'
+        : 'This Hugging Face account cannot read the dataset. Check repository and organization permissions.', 403);
     }
     if (response.ok && hfAuth.getSnapshot() === connection) {
```

**Tests (code).** `src/features/huggingface/datasetAccess.test.ts`, after `it('names a gated dataset to a signed-out reader'`:
```ts
  it('names a gated dataset to a signed-in reader its owner has not approved', async () => {
    connected();
    // Anonymous reads of a gated repo answer 401; an account without access gets 403, both marked GatedRepo.
    request.mockImplementation(async (_url, init) => new Response(null, { status: authorization(init) ? 403 : 401,
      headers: { 'X-Error-Code': 'GatedRepo' } }));
    await expect(fetchDatasetResource(root + 'sparse/0/cameras.bin')).rejects.toThrow('gated');
    expect(request).toHaveBeenCalledTimes(2);
    expect(hfAuth.expire).not.toHaveBeenCalled();
  });
```
RED at HEAD: `expected … to throw error including 'gated' but got 'This Hugging Face account cannot read…'` (`logs/X1_unit_RED.log`). GREEN: `logs/X1_unit_GREEN.log` (5 files, 117 tests).

**User decision needed: request the `gated-repos` scope?**

| Option | What it takes | Cost |
|---|---|---|
| A. Request `gated-repos` | First, the owner adds `gated-repos` to the HF OAuth app's allowed scopes. Then append it to `HF_READ_SCOPES` (do not require it in the granted-scope check at `auth.ts:48`). Update the scope lines in `docs/hugging-face-loading.md` (`:21`, `:32`; Q4's file). Once it is in, the signed-in text can become "only accounts its owner has approved can open its files". | An owner action outside the repo, which must happen before the code ships. If the app does not allow a requested scope, the Hub may reject the sign-in for everyone; this is unverified. Users re-consent at their next sign-in. |
| B. Wording only (this spec) | Nothing more | Approved accounts still cannot open gated datasets, as today, but now they are told the dataset is gated. |

Recommendation: **B in this round**, and A as a follow-up once the owner has updated the OAuth app.

**Risks.** Only the message for a 403 marked `GatedRepo` changes. Expiry handling (401) and all other 403s are unchanged. No e2e covers this.

**Effort:** low / low.

### X6. A failed or cancelled drop loses the open scene's timeout warnings: **Fix**

**Verified.**
- `src/hooks/useFileDropzone.ts:30-33`: `beginLocalLoad` dismisses both warnings when a local load starts.
- A drop that fails (for example "Missing required COLMAP files") or is cancelled leaves the old scene on screen without its warnings (`rev3/mirror/src/hooks/zz_A3_4.test.ts`).

**Root cause.** The warnings describe the scene on screen, but they are taken down when a load starts rather than when its scene replaces the old one.

**Fix (code).** A local load dismisses the warnings when it replaces the scene. URL loads still dismiss when they start (`useUrlLoader.ts:139-140`), for two reasons:
- No UI starts a URL load over a visible scene, X5 aside.
- A URL load raises its own splat-list warning before its commit, so dismissing at its commit would remove that fresh warning.

A Reload starts no `beginLocalLoad`, so it keeps the warnings, which still describe the same dataset. This refines last round's Task 2 rule ("dismiss … in `beginLocalLoad`"); no deliberate decision changes.

`src/hooks/useFileDropzone.ts`:
```diff
@@ -28,9 +28,6 @@
 }
 
 function beginLocalLoad() {
-  // Timeout warnings describe the previous load.
-  dismissOptionalSettingsTimeoutWarning();
-  dismissSplatListTimeoutWarning();
   // A splat chosen for the previous dataset must not pick one of these files' splats at their commit.
   useReconstructionStore.getState().setRequestedSplatSourceId(null);
   const initialSplatSelectionRevision = useReconstructionStore.getState().splatSelectionRevision;
@@ -40,6 +37,11 @@
     initialSplatSelectionRevision,
     onViewerState: (state: Parameters<typeof applySavedViewerState>[0], splatSelectionRevision = initialSplatSelectionRevision) =>
       applySavedViewerState(state, null, load.assertCurrent, splatSelectionRevision),
+    // Timeout warnings describe the scene on screen, which a failed or cancelled load leaves in place.
+    onSceneReplaced: () => {
+      dismissOptionalSettingsTimeoutWarning();
+      dismissSplatListTimeoutWarning();
+    },
   };
 }
```
`src/hooks/fileDropzoneLocalSources.ts`:
```diff
@@ -24,7 +24,7 @@
 type LocalSourceLoad = ReturnType<typeof beginReconstructionLoad> &
-  Pick<FileDropzoneWorkflowOptions, 'onViewerState' | 'initialSplatSelectionRevision'>;
+  Pick<FileDropzoneWorkflowOptions, 'onViewerState' | 'initialSplatSelectionRevision' | 'onSceneReplaced'>;
@@ -147,6 +147,7 @@
       onSceneReplaced: () => {
         load.assertCurrent();
+        load.onSceneReplaced?.();
         deps.clearCaches();
@@ -200,7 +201,7 @@
-      onSceneReplaced: () => { load.assertCurrent(); commitLocalSceneSource(deps); },
+      onSceneReplaced: () => { load.assertCurrent(); load.onSceneReplaced?.(); commitLocalSceneSource(deps); },
@@ -262,7 +263,7 @@
-      onSceneReplaced: () => { load.assertCurrent(); commitLocalSceneSource(deps); },
+      onSceneReplaced: () => { load.assertCurrent(); load.onSceneReplaced?.(); commitLocalSceneSource(deps); },
```
The workflow reports every scene-replacing path (COLMAP, splat-only, images-only and point-cloud-only commits; `fileDropzoneWorkflow.ts:251`, `:399`, `:522`, `:608`). A splat merged into the open scene replaces nothing, so its warnings stay; they still describe that dataset.

**Tests (code).** In `src/hooks/useFileDropzone.test.ts`, the pin from a692b18 now commits a scene, as the workflow would. Replace `it('removes the previous dataset\'s settings and splat list timeout warnings when local files are dropped'` with the first test below, and add the second after it:
```ts
  it('removes the previous dataset\'s settings and splat list timeout warnings when dropped local files replace it', async () => {
    showOptionalSettingsTimeoutWarning();
    showSplatListTimeoutWarning();
    // Like the workflow's commit: the scene is replaced.
    processFileDropzoneFilesMock.mockImplementationOnce(async (_files, _deps, options) => {
      (options as import('./fileDropzoneWorkflow').FileDropzoneWorkflowOptions).onSceneReplaced?.();
      return true;
    });
    const { result } = renderHook(() => useFileDropzone());
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: {
      types: ['Files'], items: [], files: [new File(['x'], 'cameras.bin')],
    } } as unknown as DragEvent<HTMLElement>;
    await act(async () => { await result.current.handleDrop(event); });
    const { notifications } = useNotificationStore.getState();
    expect(notifications).not.toContainEqual(expect.objectContaining({ message: OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE }));
    expect(notifications).not.toContainEqual(expect.objectContaining({ message: SPLAT_LIST_TIMEOUT_MESSAGE }));
  });

  it.each([
    ['fails', async () => { throw new Error('Missing required COLMAP files'); }],
    ['is cancelled', async () => false],
  ])('keeps the timeout warnings of the scene on screen when a dropped load %s', async (_name, outcome) => {
    vi.spyOn(appLogger, 'error').mockImplementation(() => undefined);
    showOptionalSettingsTimeoutWarning();
    showSplatListTimeoutWarning();
    processFileDropzoneFilesMock.mockImplementationOnce(outcome);
    const { result } = renderHook(() => useFileDropzone());
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: {
      types: ['Files'], items: [], files: [new File(['x'], 'notes.txt')],
    } } as unknown as DragEvent<HTMLElement>;
    await act(async () => { await result.current.handleDrop(event); });
    const messages = useNotificationStore.getState().notifications.map(notification => notification.message);
    expect(messages).toEqual(expect.arrayContaining([OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE, SPLAT_LIST_TIMEOUT_MESSAGE]));
  });
```
In `src/hooks/fileDropzoneLocalSources.test.ts`, before `it('treats cancelled directory browsing as a no-op'`:
```ts
  it.each([
    ['a local ZIP', (deps: ReturnType<typeof makeBaseDeps>) => loadLocalZipFile(buildFile('scene.zip'), { ...deps,
      setActiveZipArchive: vi.fn(), loadZipFromFile: vi.fn(async () => ({ colmapFiles: new Map(), imageIndex: new Map(),
        archive: buildArchiveReader(), fileSize: 1, imageCount: 0 })) })],
    ['a dropped folder', (deps: ReturnType<typeof makeBaseDeps>) => loadDropPayload({ singleFile: null, entries: [], fallbackFiles: [buildFile('cameras.bin')] },
      { ...deps, isArchiveFile: vi.fn(() => false), processZipFile: vi.fn(), scanEntry: vi.fn(),
        collectDroppedFiles: vi.fn(async () => new Map([['cameras.bin', buildFile('cameras.bin')]])) })],
    ['a browsed folder', (deps: ReturnType<typeof makeBaseDeps>) => loadBrowsedDirectory({ ...deps,
      pickDirectory: vi.fn(async () => buildFileSystemDirectoryHandle()), scanDirectoryHandle: vi.fn(async () => {}) })],
  ])('tells its load when %s replaces the scene, and only then', async (_name, load) => {
    const onSceneReplaced = vi.fn();
    const deps = { ...makeBaseDeps(), beginLoad: () => ({ ...beginReconstructionLoad(), onSceneReplaced }) };
    deps.processFiles.mockImplementationOnce(async () => false);
    await expect(load(deps)).resolves.toBe(false);
    expect(onSceneReplaced).not.toHaveBeenCalled();
    deps.processFiles.mockImplementationOnce(async (_files, _progress, options) => { options?.onSceneReplaced?.(); return true; });
    await expect(load(deps)).resolves.toBe(true);
    expect(onSceneReplaced).toHaveBeenCalledOnce();
  });
```

**RED and GREEN.**
- The two "keeps the timeout warnings …" rows are RED at HEAD (`expected [] to deeply equal ArrayContaining{…}`, `logs/X6_unit_RED.log`).
- The three "tells its load …" rows are RED at HEAD (never called, `logs/X6_localsources_RED.log`).
- GREEN: `logs/X6_unit_GREEN.log` (4 files, 158 tests) and `logs/X6_localsources_GREEN.log`.

**Risks.**
- X5 (Q2) concerns a URL load started over a visible scene. That load still dismisses the warnings at its start, as today.
- **e2e:** `drop-zone.spec.ts` and the local rows of `dataset-viewer-settings.spec.ts` do not assert warnings. Green in the all-fixes run.

**Effort:** low / medium. Grouped with F15, which shares the test files.

### X8. A missing explicit manifest splat now raises an error and the picker: **Fix**

**Verified.**
- `src/hooks/urlLoaderManifestFetch.ts:668-672`: an explicit `splats:` entry whose HEAD answers 404 is kept with `size: 0`. A `.spz` or `.sog` entry is classified without any request, and a failed classification of a `.ply` keeps the entry.
- A lone dead entry then auto-loads. Its download fails with the error toast "Failed to load splat …", and the picker lists the dead entry (`rev3/mirror/src/hooks/zz_VA2-3_missingExplicitSplat.test.ts`).
- v0.15.4 downloaded explicit splats as optional files, and only logged "Optional file not found".

**Root cause.** The deferred catalog reads the size probe as a size only, so "not there" looks the same as "size unknown".

**Fix (code).** A 404 or 410 on the size probe leaves the entry out and logs as v0.15.4 did. Any other failure (403, 405, a network error, no `Content-Length`) keeps the entry, as before. The folder crawl is unchanged.

`src/hooks/urlLoaderManifestFetch.ts`:
```diff
@@ -461,25 +461,30 @@
-async function getRemoteFileContentLength(url: string, fetchImpl: FetchUrl): Promise<number | null> {
+/** A HEAD probe: the size when known, and whether the server says the file is not there. */
+async function probeRemoteFile(url: string, fetchImpl: FetchUrl): Promise<{ size: number | null; missing: boolean }> {
   let response: Response;
   try {
     response = await fetchImpl(url, { method: 'HEAD' });
   } catch {
-    return null;
+    return { size: null, missing: false };
   }
 
   if (!response.ok) {
-    return null;
+    return { size: null, missing: response.status === 404 || response.status === 410 };
   }
 
   const contentLength = response.headers.get('content-length');
   if (!contentLength) {
-    return null;
+    return { size: null, missing: false };
   }
 
   const size = Number(contentLength);
-  return Number.isFinite(size) && size >= 0 ? size : null;
+  return { size: Number.isFinite(size) && size >= 0 ? size : null, missing: false };
+}
+
+async function getRemoteFileContentLength(url: string, fetchImpl: FetchUrl): Promise<number | null> {
+  return (await probeRemoteFile(url, fetchImpl)).size;
 }
@@ -667,8 +672,13 @@
     const candidates = await mapWithConcurrency(paths, SPLAT_CLASSIFY_CONCURRENCY, async path => {
       const url = joinManifestUrlPath(manifest.baseUrl, path);
-      const [classification, size] = await Promise.all([classify(url), getRemoteFileContentLength(url, fetchImpl)]);
-      return classification.isSplat ? { path, size: size ?? 0, splatCount: classification.splatCount } : null;
+      const [classification, probe] = await Promise.all([classify(url), probeRemoteFile(url, fetchImpl)]);
+      // A listed splat the server says is gone is left out, as a missing optional file always was.
+      if (probe.missing) {
+        deps.log?.(`[URL Loader] Optional file not found: ${path}`);
+        return null;
+      }
+      return classification.isSplat ? { path, size: probe.size ?? 0, splatCount: classification.splatCount } : null;
     });
```

**Tests (code).** In `src/hooks/urlLoaderManifestFetch.test.ts`, after `it('catalogues explicit splats using bounded metadata requests without full file downloads'`:
```ts
  it.each([
    [404, false], [410, false], [405, true], [403, true],
  ] as const)('lists an explicit splat whose size check answers %i: %s', async (status, listed) => {
    const fetchImpl = vi.fn(async (url: string) => url.endsWith('gone.spz')
      ? new Response(null, { status }) : new Response(null, { headers: { 'content-length': '1000' } }));
    const log = vi.fn();
    const catalog = await discoverManifestSplatCatalog({ ...manifest, splats: ['splats/live.spz', 'splats/gone.spz'] }, {
      fetchImpl, log, classifySplatUrl: vi.fn(async () => ({ isSplat: true, splatCount: null })), isTouchDevice: false,
    });
    expect(catalog.map(candidate => candidate.path).sort()).toEqual(listed ? ['splats/gone.spz', 'splats/live.spz'] : ['splats/live.spz']);
    if (!listed) expect(log).toHaveBeenCalledWith('[URL Loader] Optional file not found: splats/gone.spz');
  });
```
In `src/hooks/urlLoaderManifestSource.test.ts`, after `it('says once that a splat listing which never answers was dropped, and commits the scene without it'`:
```ts
  it('leaves out a listed splat the server says is gone, so nothing offers or downloads it', async () => {
    const deps = makeDeps();
    deps.fetchImpl.mockImplementation(async () => new Response('Not Found', { status: 404 }));
    const onRemoteSplatCatalog = vi.fn();
    const onAutoSplatSource = vi.fn();
    await expect(loadManifestSource({ ...manifest, splats: ['tiles/old.spz'] }, { type: 'manifest' },
      { ...deps, discoverSplatCatalog: undefined, onRemoteSplatCatalog, onAutoSplatSource, isTouchDevice: false })).resolves.toBe(true);
    expect(onRemoteSplatCatalog).not.toHaveBeenCalled();
    expect(onAutoSplatSource).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith('[URL Loader] Optional file not found: tiles/old.spz');
  });
```
With no catalog, `runLoad` never merges one and never offers the picker (`useUrlLoader.ts:211`). No auto source means no download, and so no toast.

**RED and GREEN.**
- The 404 and 410 rows are RED at HEAD (`logs/X8_unit_RED.log`).
- The source test is RED at HEAD: `onRemoteSplatCatalog` was called (`logs/X8_source_RED.log`).
- GREEN: `logs/X8_unit_GREEN.log` and `logs/X8_source_GREEN.log`. The 403 and 405 rows pin that an unknown size keeps the entry.

**Risks.**
- A host that answers HEAD with 404 but serves GET would now hide that explicit splat. That is unusual (405 is the norm), and v0.15.4 also dropped it after a failed GET.
- Hub files missing from a visible repo answer 404 `EntryNotFound` and are left out. A signed-out private repo throws and keeps the entry, but its COLMAP files fail first anyway.
- **Q3 F13(b)** relies on discovery sizes. They are unchanged for files that exist.

**Effort:** low / medium. Grouped with F3 (discovery).

### X11(d). Dead branches: **Set aside** (refactor only; no behaviour change)
- `clearCachesOnFailure` (`useUrlLoader.ts:68`, `:176`, `:184`, `:221`, `:244`, `:267`, `:327`) always equals `sceneReplaced`. The catch could read `load.sceneReplaced`, and the three `= false` resets are no-ops.
- The splat branch's post-load `settings.settle()` (`:275-277`) is a memoized no-op, because a direct file always replaces the scene and settles before its commit.
- **Correction:** the archive branch's post-load settle (`:288-290`) is **not** dead. It is the only settle for a splat-only archive merged into an open scene, and `useUrlLoader.test.ts:894` covers it.
- The `committed` once-guards in `urlLoaderSplatSource.ts:97-104` and `urlLoaderManifestSource.ts:161-168` are dead, because the workflow reports each replacement once.
- **Correction:** in `urlLoaderZipSource.ts:82-90`, `committed` is still needed: `finally` closes an archive that was never installed (`:114`).

Removing these touches four loader files that F1 and F3 already change, and it would add review noise right before a push. Follow-up candidate.

### X11(e). Duplicate warning modules: **Set aside** (refactor only)
`optionalSettingsWarning.ts` and `splatListWarning.ts` are 18-line twins, each with its own tests. Merging them would touch both modules, three importers (`useUrlLoader.ts`, `useFileDropzone.ts`, `reconstructionStore.ts`) and four test files, for no behaviour change. A smaller version (a `createPersistentWarning(message)` factory behind the unchanged exports) is a follow-up candidate.

---

## e2e specs these fixes could affect
| Spec | Items | Result in the scratch copy |
|---|---|---|
| `e2e/dataset-viewer-settings.spec.ts` | F1 ("remote archive" pins it); F3 and X8 ("remote manifest" runs discovery) | RED at HEAD; 4/4 with F1; green with every fix |
| `e2e/hugging-face-publish.spec.ts` | F3 and X8 (Hub discovery for the recipient); F7 (a successful `?url=` link) | green with every fix |
| `e2e/drop-zone.spec.ts`, local rows of `dataset-viewer-settings.spec.ts` | X6 (warnings at a local commit) | green with every fix |
| None | F9 (scratch Chromium probe only), F15 (unit), X1 (unit) | — |

Full chromium project: 89/89 with F1 alone, and 89/89 with every Q1 fix.

## File ownership table
| File | Items | Change |
|---|---|---|
| `src/hooks/useUrlLoader.ts` | F1 | `settingsBesideOnce.start`, splat start, archive `processFiles` wrapper |
| `src/hooks/useUrlLoader.test.ts` | F1 | replace `:1084-1109`; one new test |
| `src/hooks/urlLoaderManifestSource.ts` | F3 | `SPLAT_DISCOVERY_LIMIT_MS`, `settleWhileAnswering`, answer tracking, log text |
| `src/hooks/urlLoaderManifestSource.test.ts` | F3, X8 | two F3 tests, one X8 test, one import, optional retitle of `:144` |
| `src/hooks/urlLoaderManifestFetch.ts` | X8 | `probeRemoteFile`; explicit catalog drops 404 and 410 |
| `src/hooks/urlLoaderManifestFetch.test.ts` | X8 | one `it.each` |
| `src/hooks/useUrlState.ts` | F9 | `restorationConfig` drops `transform` and `splat.transform` |
| `src/hooks/useUrlState.test.ts` | F9 | one `it.each` |
| `src/appStartupRetry.ts` | F7 | `abandon` strips the dead link |
| `src/appStartupLoad.test.ts` | F7 | imports; one `describe` (two tests, one with three rows) |
| `src/features/huggingface/datasetAccess.ts` | X1 | gated 403 text |
| `src/features/huggingface/datasetAccess.test.ts` | X1 | one test |
| `src/hooks/useFileDropzone.ts` | X6 | warnings dismissed at the scene replacement |
| `src/hooks/useFileDropzone.test.ts` | X6, F15 | imports; one test changed; X6 `it.each`; F15 `describe` (two tests) |
| `src/hooks/fileDropzoneLocalSources.ts` | X6 | `LocalSourceLoad.onSceneReplaced`, called at three commits |
| `src/hooks/fileDropzoneLocalSources.test.ts` | X6, F15 | X6 `it.each`; F15 picker test |
| `src/hooks/fileDropzoneWorkflow.test.ts` | F15 | point-cloud `it.each` |
| `docs/hugging-face-loading.md` | X1 option A only | scope lines `:21`, `:32` (Q4's file; not touched under option B) |

## Recommended task grouping and order
| Task | Items | Files | Commit subject | Effort (implementer / reviewer) |
|---|---|---|---|---|
| Q1-A | F1 | `useUrlLoader.ts` and test | "Request no settings file beside an archive that carries its own" | medium / high |
| Q1-B | F3, X8 | `urlLoaderManifestSource.ts`, `urlLoaderManifestFetch.ts` and tests | "Keep a slow splat list that is still answering, and skip listed splats that are gone" | high / high |
| Q1-C | F9 | `useUrlState.ts` and test | "Keep alignment changes made while a restored splat downloads" | medium / high |
| Q1-D | F7 | `appStartupRetry.ts`, `appStartupLoad.test.ts` | "Drop a failed shared link from the address bar once another dataset loads" | medium / medium |
| Q1-E | X6, F15 | `useFileDropzone.ts`, `fileDropzoneLocalSources.ts`, their tests, `fileDropzoneWorkflow.test.ts` | "Keep the open scene's warnings when a dropped load fails, and pin the load hand-offs" | medium / high |
| Q1-F | X1 | `datasetAccess.ts` and test | "Say a Hugging Face dataset is gated after sign-in too" | low / low |

Order:
- Q1-A first: it unblocks CI.
- Q1-B, Q1-C, Q1-D, Q1-E and Q1-F share no files with one another and can run in parallel after it.
- Each task's gate is `npm run check`, plus `npx playwright test e2e/dataset-viewer-settings.spec.ts --project=chromium` for Q1-A and Q1-B.
- After the last Q1 task, run the full chromium project once. CI runs it, and the last round's gate missed it.

## Cross-area notes
- **Q2 F2:**
  - `src/hooks/useUrlState.ts` (`collectShareConfig`, `:62-65`) is the same file as Q1-C (`restorationConfig`, `:131-144`). The hunks are disjoint; land the tasks sequentially and rebase.
  - F2 may also edit `src/hooks/useUrlLoader.ts` (`requestSplatForLoad` at `:106-109`, the picker condition at `:211-215`), which is Q1-A's file.
- **Q2 X11(b)** (`requestedSplatSourceId`): may touch `useUrlLoader.ts:106-109` and `src/store/reconstructionStore.ts`.
- **Q2 F11:**
  - `src/hooks/useFileDropzone.ts:108-111` and `src/components/viewer3d/useViewerControlsController.ts` overlap Q1-E's file. Q1-E edits only `beginLocalLoad` (`:30-44`).
  - F11 will likely add tests to `useFileDropzone.test.ts` and `fileDropzoneWorkflow.test.ts`, which Q1-E also extends.
  - F15's "keeps None picked while a dropped folder is still being read" must stay green under F11.
- **Q2 F4:** edits `cancelLoading` in `src/store/reconstructionStore.ts`. Q1-D imports `clearUrlLoadRequestFromLocation` from the same module but does not edit it.
- **Q2 X5:** a URL load started over a visible scene still dismisses the warnings at its start (see X6).
- **Q3:**
  - No shared files.
  - X8 keeps the discovery sizes of existing files, which F13(b) depends on.
  - X3's Hub backoff is in `prepareArchive.ts`, not `datasetAccess.ts`.
- **Q4:** X1 option A, if chosen, needs `docs/hugging-face-loading.md` (the scope lines) and an owner change to the HF OAuth app.

## Decision changes
- **F3:** the splat-list deadline changes from "30 s after parsing" to "30 s without an answer, at most 120 s after parsing". Settle-before-commit, the after-parsing start and the persistent warning are kept. The evidence is in §F3.

## User decisions needed
- **X1:** request the `gated-repos` OAuth scope (option A), or keep the wording-only fix (option B, recommended for this round). The costs are in §X1.

## Scratch hygiene
- The scratch copy is `scratchpad/rev4/q1/`. `full-e2e/` inside it served the full chromium runs.
- The `node_modules` junctions were removed with `rmdir`.
- No repo source file was edited. This spec is the only repo file created.
