# Q3: publishing and Google Drive (implementation spec)

Repo `C:/Users/HEQ/Projects/colmap_webview/colmap-webview`, branch `fix/final-review-gaps` at `1984de8`. Items F5, F8, F12 and F13 from `findings.md`, plus extras X2, X3 and X10. Line numbers are at `1984de8` unless a hunk header says otherwise.

## Verdict summary

| Item | Confirmed? | Fix in one line | Task | Effort (implementer / reviewer) |
|---|---|---|---|---|
| F8 Drive mask probe differs from the viewer | **Yes**, both halves (3 RED tests) | A network error or a 403 skips that mask name without counting toward the 8-image absence rule, as `fetchUrlMask` does. Timeouts and 500/401/410 stay fatal and retryable. | T1 | medium / high |
| F12 Drive job invalidation wrong both ways | **Yes**, both halves (11 RED tests, incl. the real runtime) | `invalidate(change)`: another dataset returns a failed, cancelled or finished job to the idle form. An edit or deletion mark stops a job only until its ZIP is built, as HF does. | T2 | high / max |
| F5 2 GiB check ignores remote images | **Yes** (RED: an over-limit Hub dataset is downloaded, not refused) | Drive lists each Hub image folder once at the pinned commit. Listed sizes feed the existing pre-check and the 128 MiB cap before any image downloads. Listing failures and non-Hub hosts degrade to today's behaviour. | T3 | high / high |
| F13 publication failures misclassified | **Yes**, both halves (7 RED tests) | (a) A local original missing from the loaded files fails permanently, like its siblings. (b) A splat size read at load becomes `estimatedSize`, which plans batches and the ZIP limit but is never checked. A Drive Hub splat gets its exact size at the pinned commit. | T4 | medium / high |
| X2 Hub model/Space assets refused by Drive | **Yes** | **Fix**: Drive copies model and Space repository files unpinned, like any other host. Only dataset files are pinned and listed. | T3 | low / medium |
| X3 Drive Hub reads have no backoff | **Yes** | **Fix**: the revision read and all Hub folder listings go through the same `boundedFetch` that mask probes already use. | T3 | low / low |
| X10 efficiency | n/a | **Set aside** (see the end of this spec) | n/a | n/a |

- **Decision changes:** none. These all stay as decided:
  - The 8-image rule and the 500/401/410 handling (C2, G10).
  - "Input-bound failures are permanent".
  - "HF publishing compares no repo ids".
  - G1's reset of a finished job.
  - D5's release of a stale job's dataset.
- **User decisions:** two (see [User decisions needed](#user-decisions-needed)). Both have a recommended default, so the plan can proceed without an answer:
  - **D1:** F8's extra probes on mask-less hosts that answer 403.
  - **D2:** X2's unpinned Hub model and Space files.
- **E2e:** no e2e spec pins any behaviour changed here.
  - `e2e/hugging-face-publish.spec.ts` covers preparation and the HF controller (T4 touches both). It passed 5/5 on port 5313 with all four tasks applied.
  - No e2e spec covers Drive publishing or remote-source publication.

### How this was validated

Nothing in the repo was edited except this file. The scratch workspace is `scratchpad/rev4/q3/ws`. It contains copies of `src/`, `e2e/`, `public/`, `tests/`, `vendor/gs-toolbox`, `package.json`, `package-lock.json`, `tsconfig*`, `vite.config.ts`, `viteLocalAliasPolicy.ts`, `eslint.config.js`, `playwright.config.ts`, `postcss.config.js` and `index.html`, plus a `node_modules` junction. It also has its own git history.

- **Branch `ordered`:** `baseline` (HEAD copy), then `normalize LF` (touched files only), then T1 `F8` (c9e4471), T2 `F12` (3afb46c), T3 `F5 X3 X2` (5c1292b) and T4 `F13a F13b`.
- **Per-task diffs** are in `scratchpad/rev4/q3/diffs/` (`T1-F8.diff`, `T2-F12.diff`, `T3-F5-X3-X2.diff`, `T4-F13.diff`, plus `T*-docs.diff`). The hunks below are copied from them.
- **RED, then GREEN:** each task's new tests ran first against the previous task's production code, then against its own.
  - The failing messages are quoted under each item.
  - Tests that only guard existing behaviour were checked by the mutations listed instead; every mutation failed the named test.
- **Final run on the full patched copy:**
  - `npx vitest run`: 578 files and 4,792 tests pass; 2 files (5 tests) are skipped.
  - `tsc -p tsconfig.app.json --noEmit` and `tsc -p tsconfig.test.json --noEmit` are clean.
  - ESLint is clean on `src/features/googleDrive` and `src/features/datasetPublishing`.
  - `tsc -b` reports only `e2e/performance/*` imports of `scripts/`, which the copy lacks.
  - `COLMAP_WEBVIEW_E2E_PORT=5313 npx playwright test e2e/hugging-face-publish.spec.ts --project=chromium --reporter=list`: 5 passed.
- **Line endings:** every touched file is `i/lf w/crlf`, except `src/features/googleDrive/publicationRuntime.ts` (`i/lf w/lf`). Keep each file's working-tree endings.

---

## F8: Drive mask probing does not match the viewer's mask loader (T1)

### 1. Verified
- **The viewer** (`src/utils/urlImageFiles.ts:94-130` with `src/dataset/urlMediaScheduler.ts:135-143`):
  - Only a 404 is `absent`. A 403, any other status, and a thrown fetch error (TypeError or timeout) are `failure`.
  - `fetchUrlMask` tries the next name after any non-success. It counts a miss only when **every** name was absent (`:106`, `:123`, `:127`).
  - So a 403 or a network error never advances the 8-image rule, and is never fatal.
- **Drive** (`src/features/googleDrive/prepareArchive.ts:137-155`):
  - `:138` `await readMask(...)` lets a fetch TypeError (a 404 without CORS headers) escape. The whole publication fails with the generic retryable message, and every Retry fails on the same first probe. This is **(a)**.
  - `:140` treats 403 like 404, and `:154` counts the image as a miss. After 8 such images, masks the viewer still shows are dropped without a warning. This is **(b)**.
- **RED** (tests below, on HEAD code):
  - (a): `TypeError: Failed to fetch`.
  - (b) with 403: `expected [] to deeply equal [ 'masks/photo11.jpg.png' ]`.
  - (b) with an unreadable name: `TypeError: Failed to fetch`.

### 2. Root cause
The Drive copy of the mask lookup took the viewer's "403 means try the next name" rule (C2). It did not take the viewer's split between *absent* (404, which counts toward the folder's absence) and *failed* (anything else, which skips the name). It also never caught thrown fetch errors.

### 3. Fix (code)
Mirror `fetchUrlMask`:
- A thrown TypeError or a 403 skips the name and marks the image "not proven absent".
- A miss is counted only when every name answered 404.

C2/G10's deliberate handling is unchanged. The viewer skips these too, but Drive deliberately fails loudly rather than silently publishing without a mask:
- 500/401/410 and other non-OK statuses still fail with the named, retryable "Could not read the mask … Retry the publication."
- A timeout (`DOMException` `TimeoutError` from `fetchWithTimeout`) still propagates as a retryable failure.
- Only `TypeError` is skipped, because a CORS-less 404 surfaces as exactly that, deterministically, so a retry could never pass it.

A cancelled publication still stops:
- `fetchWithTimeout` rethrows the caller's abort reason, which is not a `TypeError`.
- The `signal.aborted` guard makes that explicit.

```diff
--- a/src/features/googleDrive/prepareArchive.ts
+++ b/src/features/googleDrive/prepareArchive.ts
@@ -134,9 +134,18 @@ export async function prepareDriveArchive(input: PublicationInput, signal: Abort
     const absence = maskAbsence.get(base) ?? { misses: 0, found: false };
     maskAbsence.set(base, absence);
     if (!absence.found && absence.misses >= URL_MASK_ABSENCE_THRESHOLD) return null;
+    // Like the viewer's mask loader, only names that all answer 404 count toward the folder's absence.
+    let absent = true;
     for (const candidate of buildMaskUrlCandidates(base, name)) {
-      const response = await readMask(await pinAssetUrl(candidate.url));
-      // Like the viewer's mask loader, try the next name: S3 or GCS without list access answers a missing key with 403.
+      const url = await pinAssetUrl(candidate.url);
+      let response: Response;
+      try { response = await readMask(url); } catch (error) {
+        // A 404 without CORS headers reaches the browser as a network error; the viewer skips the name too.
+        if (signal.aborted || !(error instanceof TypeError)) throw error;
+        absent = false; continue;
+      }
+      // S3 or GCS without list access answers a missing key with 403, which the viewer skips without counting.
+      if (response.status === 403) absent = false;
       if (response.status === 404 || response.status === 403) { await response.body?.cancel(); continue; }
       if (!response.ok) {
         await response.body?.cancel();
@@ -151,7 +160,7 @@ export async function prepareDriveArchive(input: PublicationInput, signal: Abort
       if (heldMaskBytes > sizeLimit) throw archiveTooLarge();
       return { blob };
     }
-    absence.misses++;
+    if (absent) absence.misses++;
     return null;
   };
   const prepared = await preparePublication({ ...input, splats: 'active' }, signal, {
```
`pinAssetUrl` now runs outside the `try`, so its permanent URL errors are never mistaken for network errors.

**Docs** (`docs/google-drive-publishing.md:18`, mask sentence only):
```diff
-… On hosts without a file listing, masks are treated as absent when none of the first 8 images has one, as in the viewer. ZIP entries …
+… On hosts without a file listing, masks are treated as absent when every mask name of the first 8 images answers 404, as in the viewer. A host that answers 403 for missing files, or blocks the response, is asked for each image's mask. ZIP entries …
```

### 4. Tests (code)
**`src/features/googleDrive/prepareArchive.test.ts`**, in `describe('Drive remote sources')`, after 'keeps probing every image once the folder has produced a mask'. They reuse `bucket`, `masked`, `numbered` and `entries`.
```ts
  // A 404 without CORS headers (nginx add_header without `always`) reaches the browser as a network error.
  const unreadable = () => Promise.reject(new TypeError('Failed to fetch'));
  it('publishes a mask-less dataset whose host answers missing masks without CORS headers, as the viewer loads it', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith(bucket + 'images/') ? new Response('original') : unreadable()));
    const files = await entries(await prepareDriveArchive(masked(numbered(3)), new AbortController().signal, () => {}, () => {}));
    expect(Object.keys(files).filter(path => path.startsWith('images/'))).toHaveLength(3);
    expect(Object.keys(files).filter(path => path.startsWith('masks/'))).toEqual([]);
  });
  it.each([
    ['forbidden (S3 without ListBucket)', () => new Response(null, { status: 403 })],
    ['unreadable', unreadable],
  ])('keeps probing past 8 images whose mask names are %s, as only a 404 proves absence to the viewer', async (_, missing) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith(bucket + 'images/') ? new Response('original')
      : url === bucket + 'masks/photo11.jpg.png' ? new Response('mask') : missing()));
    const files = await entries(await prepareDriveArchive(masked(numbered(12)), new AbortController().signal, () => {}, () => {}));
    expect(Object.keys(files).filter(path => path.startsWith('masks/'))).toEqual(['masks/photo11.jpg.png']);
  });
  it('still fails a mask read that times out, which a retry can fix', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith(bucket + 'images/') ? new Response('original')
      : Promise.reject(new DOMException('Request timed out', 'TimeoutError'))));
    await expect(prepareDriveArchive(masked(numbered(1)), new AbortController().signal, () => {}, () => {}))
      .rejects.toMatchObject({ name: 'TimeoutError' });
  });
```
- **RED/GREEN:** the first three are RED on HEAD (quoted under Verified). All 35 tests in the file pass with the fix.
- **Unchanged and still passing:** 'stops probing a mask folder after 8 images without a mask, like the viewer' (16 probes on a 404 host), C2's 403, 429/503 and exhausted-retry tests, and 'keeps probing every image once the folder has produced a mask'.
- **Mutations** (each fails exactly the named test):
  - Count a 403 as absent (drop `if (response.status === 403) absent = false;`): fails the 'forbidden' case.
  - Drop `absent = false` in the `catch`: fails the 'unreadable' case.
  - Catch every error (drop `!(error instanceof TypeError)`): fails 'still fails a mask read that times out…'.

### 5. Risks and interactions
- **Cost on mask-less hosts that answer 403 or block CORS on 404.** Probing no longer stops after 8 images there. It costs 2 small requests per image, as the viewer pays per *viewed* image.
  - Measured on 100 mask-less images: 200 probes on a 403 host, against 16 at HEAD. A 404 host still makes 16.
  - S3 public buckets without `s3:ListBucket` (the common public-read policy) answer 403, so this is common.
  - Probing is serial (X10), so expect roughly 2 × RTT extra per image. My estimate, not measured: about +15–30% on a typical S3 publication, since each image is downloaded anyway. See **D1**.
- **A transient network error on a mask probe now drops that mask silently**, as the viewer does, instead of failing the publication with a Retry. C2 had left TypeErrors fatal "unchanged". The finding scopes this change in, because a CORS-less 404 cannot be told apart from a transient error. Timeouts stay fatal.
- **The 8-image rule is the viewer's, unchanged.** What counts as a miss now matches the viewer: a 404 on every name.
- **No overlap with other areas.** T3 later renames `readMask` and changes the HF-branch predicate in the same function.

### 6. Effort
Implementer **medium**: one function and three tests, with exact code. Reviewer **high**: confirm viewer parity, the C2/G10 boundary (timeouts and 500 stay fatal) and the D1 trade-off.

---

## F12: Drive job invalidation is wrong in both directions (T2)

### 1. Verified
**(a) A failed or cancelled job survives a dataset change.**
- `src/features/googleDrive/publishDataset.ts:176-180` resets only `completed` (G1).
- `:179` (`if (job) { job.invalid = true; cancel(); release(job); set({ canRetry: false }); }`) keeps phase, message, `error` and `fileUrl` for `failed`/`cancelled`.
- A permanently failed job (`job === null`, `:158`) is not touched at all.
- `GoogleDrivePublishModal.tsx:86-94` then shows the old dataset's status, its "Review file in Drive ↗" link and "Start a new publication" with no Retry. `publicationRuntime.ts:12` keeps the toolbar icon active (`phase !== 'idle'`).

**(b) Any deletion mark kills an upload of a built ZIP, with no way back.**
- `publicationRuntime.ts:21` calls `invalidate()` whenever `pendingDeletions.size` is non-zero.
- That sets `job.invalid`, aborts, and releases the ZIP.
- `run()`'s `check()` (`:52-56`) also calls `assertCurrent()` after every step, which throws on pending deletions (`publicationSnapshot.ts:39-41`).
- `retry()` returns at `:47` (`job.invalid`), even after the mark is removed.
- An applied edit (`reconstructionEditRevision`, `publicationRuntime.ts:17`) does the same.
- **HF keeps uploading** in both cases:
  - Its runtime invalidates only on a source-key change (`datasetPublishing/publicationRuntime.ts:16-18`).
  - Its `assertCurrent` is passed only to preparation (`:33`).

**RED** on HEAD code (11 tests; the tests are below):
- (a): `expected { phase: 'failed' … } to deeply equal { phase: 'idle' … }`, the same for `cancelled`, and for a permanent failure.
- The real runtime: `clears a failed Drive publication…` received `phase: 'failed'`.
- (b): `expected { phase: 'cancelled' … } to match object { phase: 'completed' … }`.
- The real runtime with the real deletion store: `phase: 'cancelled', receipt: undefined`.
- Runtime argument: `expected last "vi.fn()" call to have been called with [ 'dataset' ]`.

### 2. Root cause
- The controller keeps a stopped job so that Retry can resume it. `invalidate()` treats every stopped job like a live one, clearing only `canRetry` and keeping the state.
- The runtime has one signal for two different events:
  - a different dataset, which must end any job;
  - an edit or deletion mark, which can only affect a job that has not finished building its ZIP.
- A built ZIP is an immutable snapshot: `prepareDriveArchive` read the scene, and the upload only reads `archive.blob`.

### 3. Fix (code)
- `invalidate(change)`:
  - With `'dataset'` (the default), it ends an active job as before. It returns any finished, failed or cancelled job to the idle form.
  - With `'edit'`, it does nothing once `job.archive` exists.
- `check()` stops consulting `assertCurrent` once the ZIP is built. Only `invalidate('dataset')` (through `job.invalid`) can stop that upload.
- `reset()` now `release`s the job before dropping it. Callbacks from earlier transfers may still hold the job: the chunk progress closure captures `current`, and so do test mocks. Releasing keeps D5's guarantee that a stale job no longer pins the dataset. Without it, 'releases a failed publication's dataset when the dataset changes…' fails (the dataset stays reachable).

```diff
--- a/src/features/googleDrive/publishDataset.ts
+++ b/src/features/googleDrive/publishDataset.ts
@@ -52,7 +52,8 @@ export function createDrivePublicationController(client: DriveUploadClient) {
     const check = () => {
       signal.throwIfAborted();
       if (current.invalid || current !== job) throw new GoogleDrivePublishError('The dataset changed. Start a new Drive publication.');
-      current.assertCurrent();
+      // A built ZIP no longer reads the scene; only another dataset (invalidate) stops its upload.
+      if (!current.archive) current.assertCurrent();
     };
     const update = (next: Partial<DrivePublicationState>) => { check(); set(next); };
     const owned = (file: DrivePublishedFile) => {
@@ -161,7 +162,8 @@ export function createDrivePublicationController(client: DriveUploadClient) {
     } finally { if (active === controller) active = null; }
   };
   const cancel = () => { if (active) { set({ phase: 'cancelling', message: 'Cancelling upload…' }); active.abort(); } };
-  const reset = () => { if (!active) { job = null; state = initial(); listeners.forEach(listener => listener()); } };
+  // Callbacks from earlier transfers may still reference the job, so drop its dataset closures before forgetting it.
+  const reset = () => { if (!active) { if (job) release(job); job = null; state = initial(); listeners.forEach(listener => listener()); } };
   return {
     getSnapshot: () => state,
     subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
@@ -173,10 +175,12 @@ export function createDrivePublicationController(client: DriveUploadClient) {
     },
     retry: run,
     cancel,
-    invalidate() {
-      // A finished publication belongs to the previous dataset; the new one starts from a fresh form.
-      if (state.phase === 'completed') { reset(); return; }
-      if (job) { job.invalid = true; cancel(); release(job); set({ canRetry: false }); }
+    /** Another dataset ends any publication; an edit or deletion mark ends one only until its ZIP is built, as on Hugging Face. */
+    invalidate(change: 'dataset' | 'edit' = 'dataset') {
+      if (change === 'edit' && job?.archive) return;
+      if (active && job && state.phase !== 'completed') { job.invalid = true; cancel(); release(job); set({ canRetry: false }); return; }
+      // A finished, failed or cancelled publication belongs to the previous scene; the new one starts from a fresh form.
+      if (job || state.phase !== 'idle') reset();
     },
     reset,
   };
```
```diff
--- a/src/features/googleDrive/publicationRuntime.ts
+++ b/src/features/googleDrive/publicationRuntime.ts
@@ -15,10 +15,11 @@ let modelRevision = useReconstructionStore.getState().reconstructionEditRevision
 const reconstruction = useReconstructionStore.subscribe(state => {
   const nextKey = getPublicationSourceKey(state);
   if (nextKey !== sourceKey || state.reconstructionEditRevision !== modelRevision) {
-    sourceKey = nextKey; modelRevision = state.reconstructionEditRevision; drivePublication.invalidate();
+    const change = nextKey !== sourceKey ? 'dataset' : 'edit';
+    sourceKey = nextKey; modelRevision = state.reconstructionEditRevision; drivePublication.invalidate(change);
   }
 });
-const deletions = useDeletionStore.subscribe(state => { if (state.pendingDeletions.size) drivePublication.invalidate(); });
+const deletions = useDeletionStore.subscribe(state => { if (state.pendingDeletions.size) drivePublication.invalidate('edit'); });
 const beforeUnload = (event: BeforeUnloadEvent) => {
   if (isDrivePublishing(drivePublication.getSnapshot().phase)) { event.preventDefault(); event.returnValue = ''; }
 };
```
Resulting state table (no row is ambiguous):

| Job when the change arrives | `'dataset'` (another dataset) | `'edit'` (model edit or deletion mark) |
|---|---|---|
| idle, no job | no-op (no notification) | no-op |
| preparing (active, no ZIP yet) | cancel → `cancelled`, "The dataset changed…", no Retry (unchanged) | same as `'dataset'` (unchanged) |
| uploading / verifying / sharing (active, ZIP built) | cancel (unchanged) | **ignored**: the upload continues |
| failed or cancelled, ZIP built | **reset to idle** | **ignored**: Retry stays offered |
| failed or cancelled, no ZIP; or ended by a permanent failure | **reset to idle** | **reset to idle** (its snapshot is stale) |
| completed | reset to idle (G1, unchanged) | reset to idle (G1, unchanged) |

The "The dataset changed. Start a new Drive publication." notice from an in-flight cancellation is kept on purpose. That change produced it, and its "Review file in Drive" link may point at a partial file to clean up. The next dataset change or edit, or "Start a new publication", clears it.

**Docs** (`docs/google-drive-publishing.md:8` and `:24`):
```diff
-… After completion, copy the viewer link or open the file in Drive. The finished publication's link is cleared when another dataset loads or the model changes.
+… After completion, copy the viewer link or open the file in Drive. Loading another dataset returns the dialog to a new form, clearing a finished publication's link or a stopped one's status; editing the model also clears a finished publication's link.
@@ :24
-… Reconnect the same Google account if sign-in expires. Changing the reconstruction cancels the current publication and requires a new one.
+… Reconnect the same Google account if sign-in expires. Loading another dataset cancels the current publication and requires a new one. Editing the model or marking images for deletion cancels it only while the ZIP is being prepared; a built ZIP keeps uploading, as on Hugging Face.
```

### 4. Tests (code)
**`src/features/googleDrive/publishDataset.test.ts`**, in `describe('Drive publication lifecycle')`, after 'returns a finished publication to a fresh form when the dataset changes'. They reuse `fixture()`, `HfError` and `GoogleDrivePublishError`.
```ts
  const idle = { phase: 'idle', message: '', bytesDone: 0, bytesTotal: 0, filesDone: 0, filesTotal: 0, canRetry: false };
  it.each([
    ['a failed publication', 'failed', (drive: ReturnType<typeof fixture>) => {
      drive.client.share.mockRejectedValueOnce(new GoogleDrivePublishError('Organization denied sharing', 403));
    }],
    ['a cancelled publication', 'cancelled', (drive: ReturnType<typeof fixture>) => {
      drive.client.chunk.mockImplementationOnce(async (_url, _blob, _offset, signal: AbortSignal) => { drive.controller.cancel(); signal.throwIfAborted(); });
    }],
    ['a publication ended by a permanent failure', 'failed', (drive: ReturnType<typeof fixture>) => {
      drive.prepare.mockRejectedValueOnce(new GoogleDrivePublishError('The source file images/a.jpg changed. Publish again.', undefined, true));
    }],
  ])('returns %s to a fresh form when another dataset loads', async (_, phase, stop) => {
    const drive = fixture();
    stop(drive);
    await drive.controller.publish('scene', true, drive.prepare);
    expect(drive.controller.getSnapshot().phase).toBe(phase);
    drive.controller.invalidate();
    expect(drive.controller.getSnapshot()).toEqual(idle);
    await drive.controller.retry();
    expect(drive.controller.getSnapshot()).toEqual(idle);
  });
  it('keeps uploading a built ZIP when the scene is edited or images are marked for deletion, as Hugging Face does', async () => {
    const { controller, client, prepare } = fixture();
    let marked = false;
    const assertCurrent = () => { if (marked) throw new HfError('The reconstruction changed while preparing. Publish again.'); };
    const upload = client.chunk.getMockImplementation()!;
    client.chunk.mockImplementationOnce(async (...args: unknown[]) => { marked = true; controller.invalidate('edit'); return upload(...args); });
    await controller.publish('scene', false, prepare, assertCurrent);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'completed', receipt: { shared: false } });
  });
  it('offers a retry of a built ZIP while images are marked for deletion', async () => {
    const { controller, client, prepare } = fixture();
    let marked = false;
    const assertCurrent = () => { if (marked) throw new HfError('The reconstruction changed while preparing. Publish again.'); };
    client.chunk.mockRejectedValueOnce(new GoogleDrivePublishError('Interrupted'));
    await controller.publish('scene', false, prepare, assertCurrent);
    marked = true;
    controller.invalidate('edit');
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: true });
    await controller.retry();
    expect(controller.getSnapshot().phase).toBe('completed');
    expect(prepare).toHaveBeenCalledOnce();
  });
  it('still stops a publication whose scene is edited before its ZIP is built', async () => {
    const { controller, client } = fixture();
    let resolve!: (value: unknown) => void;
    const prepare = vi.fn().mockImplementation(() => new Promise(result => { resolve = result; }));
    const attempt = controller.publish('scene', false, prepare);
    controller.invalidate('edit');
    resolve({ blob: new Blob(['late']), md5: 'md5', viewerBaseUrl: 'https://viewer.example/' });
    await attempt; await controller.retry();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'cancelled', canRetry: false });
    expect(client.generateId).not.toHaveBeenCalled();
  });
  it('drops a failed preparation once the scene is edited, as its snapshot is stale', async () => {
    const { controller, prepare } = fixture();
    prepare.mockRejectedValueOnce(new HfError('x', 503));
    await controller.publish('scene', false, prepare);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: true });
    controller.invalidate('edit');
    expect(controller.getSnapshot()).toEqual(idle);
  });
```
In `describe('Drive publication memory')`, test 'releases a failed publication's dataset when the dataset changes, and never retries it' (`:287`): change the expectation from `{ phase: 'failed', canRetry: false }` to `{ phase: 'idle', canRetry: false }`. Its `collected(ref)` assertion is unchanged. It now proves that `reset()` releases.

**`src/features/googleDrive/publicationRuntime.test.ts`** (G15's mocked-controller test). Pin the argument:
```diff
     useReconstructionStore.setState({ reconstruction: buildReconstruction(), sourceType: 'url', sourceUrl: 'https://example.test/a/' });
     expect(controller.invalidate).toHaveBeenCalledTimes(1);
+    expect(controller.invalidate).toHaveBeenLastCalledWith('dataset');
     useReconstructionStore.setState({ urlLoading: false });
     expect(controller.invalidate).toHaveBeenCalledTimes(1);
     useReconstructionStore.setState(state => ({ reconstructionEditRevision: state.reconstructionEditRevision + 1 }));
     expect(controller.invalidate).toHaveBeenCalledTimes(2);
+    expect(controller.invalidate).toHaveBeenLastCalledWith('edit');
     useReconstructionStore.setState({ sourceUrl: 'https://example.test/b/' });
     expect(controller.invalidate).toHaveBeenCalledTimes(3);
+    expect(controller.invalidate).toHaveBeenLastCalledWith('dataset');
   });
 
-  it('invalidates the job once deletions are pending', () => {
+  it('invalidates the job as an edit once deletions are pending', () => {
     useDeletionStore.setState({ pendingDeletions: new Set() });
     expect(controller.invalidate).not.toHaveBeenCalled();
     useDeletionStore.setState({ pendingDeletions: new Set([7]) });
     expect(controller.invalidate).toHaveBeenCalledOnce();
+    expect(controller.invalidate).toHaveBeenCalledWith('edit');
   });
```

**`src/features/googleDrive/publicationReceiptReset.test.ts`** (the real runtime and controller with a stub client). The stub must keep one file per generated ID, so that later tests in the file do not see the first publication's file. The full replacement file:
```ts
import { Blob as NodeBlob } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import { useDeletionStore, useReconstructionStore } from '../../store';
import { buildReconstruction } from '../../test/builders';
import { assertPublicationInputCurrent, capturePublicationInput } from '../datasetPublishing/publicationSnapshot';
import { GoogleDrivePublishError } from './upload';

const client = vi.hoisted(() => {
  const files = new Map<string, Record<string, unknown>>();
  let ids = 0;
  let upload = { id: '', name: '', operation: '' };
  const hooks = { beforeChunk: () => {} };
  return {
    hooks,
    owner: async () => 'account', generateId: async () => `DRIVE_FILE_${String(++ids).padStart(9, '0')}`,
    file: async (id: string) => files.get(id) ?? null,
    start: async (id: string, name: string, operation: string) => { upload = { id, name, operation }; return 'session'; },
    status: async () => ({ complete: false, offset: 0 }),
    chunk: async (_url: string, blob: Blob) => {
      hooks.beforeChunk();
      files.set(upload.id, { id: upload.id, name: upload.name, size: String(blob.size), mimeType: 'application/zip', md5Checksum: 'md5',
        appProperties: { colmapviewOperation: upload.operation }, permissions: [] });
      return { complete: true, offset: blob.size };
    },
    share: async () => {},
  };
});
vi.mock('./upload', async importOriginal => ({ ...await importOriginal<typeof import('./upload')>(), createDriveUploadClient: () => client }));

const archive = async () => ({ blob: new Blob(['zip']), md5: 'md5', viewerBaseUrl: 'https://viewer.example/' });

describe('Drive publication receipt', () => {
  it('clears a finished Drive receipt when another dataset loads', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const { drivePublication } = await import('./publicationRuntime');
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), sourceType: 'url', sourceUrl: 'https://example.test/a/' });
    await drivePublication.publish('a', false, archive);
    expect(drivePublication.getSnapshot().phase).toBe('completed');
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), sourceUrl: 'https://example.test/b/' });
    expect(drivePublication.getSnapshot().phase).toBe('idle');
    expect(drivePublication.getSnapshot().receipt).toBeUndefined();
  });
  it('clears a failed Drive publication when another dataset loads', async () => {
    const { drivePublication } = await import('./publicationRuntime');
    client.hooks.beforeChunk = () => { client.hooks.beforeChunk = () => {}; throw new GoogleDrivePublishError('Interrupted'); };
    await drivePublication.publish('b', false, archive);
    expect(drivePublication.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: true, error: 'Interrupted' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), sourceUrl: 'https://example.test/c/' });
    expect(drivePublication.getSnapshot()).toMatchObject({ phase: 'idle', canRetry: false });
    expect(drivePublication.getSnapshot().error).toBeUndefined();
  });
  it('finishes uploading a built ZIP when an image is marked for deletion', async () => {
    const { drivePublication } = await import('./publicationRuntime');
    const input = capturePublicationInput();
    client.hooks.beforeChunk = () => { useDeletionStore.setState({ pendingDeletions: new Set([1]) }); };
    try {
      await drivePublication.publish('c', false, archive, () => assertPublicationInputCurrent(input));
      expect(drivePublication.getSnapshot()).toMatchObject({ phase: 'completed', receipt: { shared: false } });
    } finally {
      client.hooks.beforeChunk = () => {};
      useDeletionStore.setState({ pendingDeletions: new Set() });
    }
  });
});
```
- The third test uses the real `assertPublicationInputCurrent`, so it also proves `check()` skips it once the ZIP is built. The tests share the runtime singleton in file order.
- **GREEN:** all Drive tests pass (231 in `src/features/googleDrive`), plus `GoogleDrivePublishModal.test.tsx` and `useGoogleDrivePublishStoreFacade.test.ts`.

**Mutations** (each fails the named tests):

| Mutation | Fails |
|---|---|
| `reset()` without `release(job)` | 'releases a failed publication's dataset…' |
| edits always invalidate (drop the `'edit' && job?.archive` line) | the real-runtime 'finishes uploading…', 'keeps uploading a built ZIP…', 'offers a retry of a built ZIP…' |
| `check()` always calls `assertCurrent` | the same three |
| ignore every edit (`if (change === 'edit') return;`) | 'still stops a publication whose scene is edited before…', 'drops a failed preparation once…' |
| only `completed` resets (old line) | the three 'returns … to a fresh form', the real-runtime 'clears a failed…', 'drops a failed preparation…', the memory test |
| runtime passes no argument | both runtime tests, the real-runtime 'finishes uploading…' |

### 5. Risks and interactions
- **D5 memory:**
  - A failed job whose ZIP is built now keeps that ZIP (up to 2 GiB) while deletions are pending or after edits, until Retry, "Start a new publication", or another dataset. HF keeps its prepared snapshot the same way.
  - Every path that drops a job releases it first: the in-flight `invalidate` (unchanged) and `reset()` (new). This includes the dialog's "Start a new publication" button, which goes through `reset()`.
- **A receipt can describe a snapshot older than edits made during its upload**, as on HF. The next edit clears it (G1).
- **G1 is preserved:** a completed job resets on a dataset change and on an edit or mark. Its `archive` is already released, so `'edit'` falls through to `reset()`.
- **`capturePublicationInput`** (`publicationSnapshot.ts:24`) still refuses to *start* while deletions are pending. The dialog's "Apply N pending image deletions" form is unchanged.
- **No notification spam:**
  - The deletion subscription fires on every deletion-store change while marks are pending.
  - With no job and an idle state, `invalidate` returns without notifying.
- **HF parity note (out of scope):** HF still shows a *permanent* failure's error after a dataset change (R3 G1 risk note); Drive now clears it. Aligning HF is a one-line follow-up in `datasetPublishing/publishDataset.ts:203` if wanted.
- **Other areas:** no shared files.
- **E2e:** none covers Drive publication.

### 6. Effort
Implementer **high**: an exact but subtle state-machine edit across the controller, the runtime and three test files. Reviewer **max**: async run/abort ordering, G1 and D5 semantics, and the six-row state table must all be checked.

---

## F5: the Drive 2 GiB check ignores remote images (T3)

### 1. Verified
- `src/features/datasetPublishing/preparePublication.ts:108-113` creates every remote asset with `size: null`. Remote images return it unchanged (`:144`).
- `src/features/googleDrive/prepareArchive.ts:25` sums `asset.size ?? 0`, so remote images count as 0 bytes.
- Packaging (`:44-67`) downloads one file at a time. It throws the permanent "exceeds the viewer's 2 GiB archive limit" (`:17`) only once the running total passes the limit (`:37`, `:50`).
- **RED** on HEAD code: 'refuses a Hub dataset whose listed images exceed the ZIP limit before downloading any image' gets `promise resolved "{ …(3) }" instead of rejecting`. Every image was downloaded and packaged.

### 2. Root cause
Preparation knows exact sizes only for local files, ZIP entries, listed Hub masks (G10) and catalogued splats. It never asks the image host. The pre-check therefore sees only the COLMAP model, plus masks and splat where known.

### 3. Fix (code)

**Ways to learn remote image sizes:**

| Way | Coverage | Cost | Accuracy | Verdict |
|---|---|---|---|---|
| **Hub tree listing of each image folder, at the pinned commit** (as G10 does for `masks/`) | Hub dataset images, the canonical case | One listing per folder, paginated. The 6,590-image wildflow folder is about 7 pages, which takes seconds. | Exact for the bytes that will download: same commit. Tree sizes of LFS/Xet files are real sizes (verified live in R3 G10). | **Recommended** |
| Sizes seen at load time | Hub only (the load-time tree walk) | Free at publish time. Needs tree sizes plumbed from `urlLoaderManifestFetch.ts` (Q1's file) into the store. | Stale if `main` moved since load, the very F13(b) problem. | Rejected |
| HEAD / `Content-Length` per image, for plain URL hosts | Any host with CORS-readable Content-Length | N extra requests on *every* publication, serial today (X10), even far below the limit. HEAD may be blocked (405/CORS). | Content-Length can be the compressed size or missing, so it is an estimate only, never a checked size. | Not now; optional follow-up (see the note after the table) |

- **Degradation:** when a listing fails, or the host lists nothing, sizes stay unknown. Packaging's running cap stops at the limit, exactly as today.
- **Privacy:**
  - Hub listings are already disclosed: `privacy.html` §4 "listings", and Drive publishing already lists `masks/`.
  - No Drive API request is added, so §3's list of what Drive publishing requests is unchanged.
  - A per-image HEAD would also fall under §2's "requests to the file hosts", but it is not proposed.
  - No policy edit is needed.

**Optional follow-up (non-Hub hosts):** HEAD every remote image, 4–6 at a time, and stop as soon as the known total passes the limit. Treat the result as an estimate. This rejects plain-URL over-limit datasets in seconds. It costs N requests on every publication and a concurrency helper. Not recommended within this round.

**Code.** A new optional `PrepareDeps.remoteSize` lets preparation ask the host for an exact size. Drive implements it as a cached listing per Hub dataset folder, at the commit it already pins. HF publishing does not provide it, so it is unchanged. A listed image size also reaches `add()`'s `checkAssetSize`, so a listed image over 128 MiB fails at preparation (permanent) instead of during packaging.

X3 and X2 (below) edit the same lines and ship in this task. Their parts are marked.
```diff
--- a/src/features/datasetPublishing/preparePublication.ts
+++ b/src/features/datasetPublishing/preparePublication.ts
@@ -38,6 +38,8 @@ interface PrepareDeps {
   readRemoteMask?: (base: string, name: string, signal: AbortSignal) => Promise<{ blob: Blob } | { url: string; size: number } | null>;
   /** Bound a remote splat while downloading, before it becomes a complete Blob. */
   maxAssetBytes?: number;
+  /** The exact size of a remote image or splat at its pinned revision, or null where the host lists none. */
+  remoteSize?: (url: string, signal: AbortSignal) => Promise<number | null>;
 }
 
 function publicationSplats(dataset: DatasetState): SplatFileSource[] {
@@ -141,7 +143,10 @@ export async function preparePublication(input: PublicationInput, signal: AbortS
     if (isRemote) {
       const url = captured.imageNameToUrl?.[name] || (captured.imageUrlBase ? buildImageUrl(captured.imageUrlBase, name).url : null);
       if (!url) throw new HfError(`Original image ${name} is unavailable. Load its original file before publishing.`, undefined, true);
-      return remote(url, path, 'image');
+      const asset = await remote(url, path, 'image');
+      // A listed size lets the Drive ZIP limit refuse an oversized dataset before any image downloads.
+      asset.size = await deps.remoteSize?.(url, signal) ?? null;
+      return asset;
     }
     let failed = false;
     const read = async (targetSignal: AbortSignal) => {
```
```diff
--- a/src/features/googleDrive/prepareArchive.ts   (after T1)
+++ b/src/features/googleDrive/prepareArchive.ts
@@ -77,18 +77,23 @@ const DRIVE_BLOB_PART_BYTES = 8 * 1024 * 1024;
 function parseRemoteUrl(value: string): URL {
   try { return new URL(value); } catch { throw new GoogleDrivePublishError('The dataset has an invalid remote file URL.', undefined, true); }
 }
+/** Only Hub dataset files have a revision to pin and a folder to list; model and Space files copy like any other host's. */
+const isHubDatasetFile = (value: string) => {
+  const url = parseRemoteUrl(value);
+  return url.origin === 'https://huggingface.co' && url.pathname.startsWith('/datasets/');
+};
 
 export async function prepareDriveArchive(input: PublicationInput, signal: AbortSignal,
   progress: DriveArchiveProgress, assertCurrent: () => void, sizeLimit = ARCHIVE_SIZE_LIMIT): Promise<DriveArchive> {
   const sdk = await import('@huggingface/hub');
   const read: typeof fetch = (value, init) => fetchDatasetResource(typeof value === 'string' ? value : value instanceof URL ? value.href : value.url,
     undefined, { ...init, signal });
-  // Throttled or briefly unavailable hosts get the same bounded backoff as Hub reads (429/502/503/504).
-  const readMask = boundedFetch(signal, null, read);
+  // Throttled or briefly unavailable hosts, the Hub's API included, get a bounded backoff (429/502/503/504).
+  const readSource = boundedFetch(signal, null, read);
   const revisions = new Map<string, Promise<string>>();
   const resolveRevision = (repoId: string, revision: string) => {
     const key = `${repoId}/${revision}`;
-    if (!revisions.has(key)) revisions.set(key, sdk.datasetInfo({ name: repoId, revision, additionalFields: ['sha'], fetch: read }).then(info => {
+    if (!revisions.has(key)) revisions.set(key, sdk.datasetInfo({ name: repoId, revision, additionalFields: ['sha'], fetch: readSource }).then(info => {
       // The Hub redirects other spellings and renamed repositories (info.name is its current id); the commit pins the files.
       if (!/^[a-f0-9]{40,64}$/i.test(info.sha)) throw new GoogleDrivePublishError('Could not pin the source dataset revision.');
       return info.sha;
@@ -98,7 +103,7 @@ export async function prepareDriveArchive(input: PublicationInput, signal: Abort
   const pinAssetUrl = async (value: string): Promise<string> => {
     const url = parseRemoteUrl(value);
     if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new GoogleDrivePublishError('The dataset has an unsupported remote file URL.', undefined, true);
-    if (url.origin !== 'https://huggingface.co') return url.href;
+    if (!isHubDatasetFile(value)) return url.href;
     const parsed = parseHfAssetUrl(value);
     const sha = await resolveRevision(parsed.repoId, parsed.revision);
     parsed.url.pathname = parsed.url.pathname.replace(/(\/resolve\/)[^/]+\//, `$1${sha}/`);
@@ -108,13 +113,13 @@ export async function prepareDriveArchive(input: PublicationInput, signal: Abort
   const maskAbsence = new Map<string, { misses: number; found: boolean }>();
   let heldMaskBytes = 0;
   const readRemoteMask = async (base: string, name: string): Promise<{ blob: Blob } | { url: string; size: number } | null> => {
-    if (parseRemoteUrl(base).origin === 'https://huggingface.co') {
+    if (isHubDatasetFile(base)) {
       if (!maskListings.has(base)) maskListings.set(base, (async () => {
         const folder = parseHfAssetUrl(base.replace(/\/?$/, '/'));
         const revision = await resolveRevision(folder.repoId, folder.revision);
         const files = new Map<string, number>();
         try {
-          for await (const file of sdk.listFiles({ repo: { type: 'dataset', name: folder.repoId }, revision, path: folder.path, recursive: true, fetch: read })) {
+          for await (const file of sdk.listFiles({ repo: { type: 'dataset', name: folder.repoId }, revision, path: folder.path, recursive: true, fetch: readSource })) {
             if (file.type === 'file') files.set(file.path, file.size);
           }
         } catch (error) {
@@ -139,7 +144,7 @@ export async function prepareDriveArchive(input: PublicationInput, signal: Abort
     for (const candidate of buildMaskUrlCandidates(base, name)) {
       const url = await pinAssetUrl(candidate.url);
       let response: Response;
-      try { response = await readMask(url); } catch (error) {
+      try { response = await readSource(url); } catch (error) {
         // A 404 without CORS headers reaches the browser as a network error; the viewer skips the name too.
         if (signal.aborted || !(error instanceof TypeError)) throw error;
         absent = false; continue;
@@ -163,8 +168,30 @@ export async function prepareDriveArchive(input: PublicationInput, signal: Abort
     if (absent) absence.misses++;
     return null;
   };
+  const folderSizes = new Map<string, Promise<Map<string, number>>>();
+  /** A Hub file's exact size at the pinned revision, from one listing per folder; other hosts list nothing. */
+  const remoteSize = async (value: string): Promise<number | null> => {
+    if (!isHubDatasetFile(value)) return null;
+    const file = parseHfAssetUrl(value);
+    const revision = await resolveRevision(file.repoId, file.revision);
+    const folder = file.path.slice(0, Math.max(0, file.path.lastIndexOf('/')));
+    const key = `${file.repoId}/${revision}/${folder}`;
+    if (!folderSizes.has(key)) folderSizes.set(key, (async () => {
+      const sizes = new Map<string, number>();
+      try {
+        for await (const entry of sdk.listFiles({ repo: { type: 'dataset', name: file.repoId }, revision, path: folder, fetch: readSource })) {
+          if (entry.type === 'file') sizes.set(entry.path, entry.size);
+        }
+      } catch (error) {
+        // Unknown sizes only lose the early limit check: packaging still stops at the limit.
+        if (signal.aborted) throw error;
+      }
+      return sizes;
+    })());
+    return (await folderSizes.get(key)!).get(file.path) ?? null;
+  };
   const prepared = await preparePublication({ ...input, splats: 'active' }, signal, {
-    resolveRevision, listFiles: async () => [], pinAssetUrl, readRemoteMask, assertCurrent, maxAssetBytes: sizeLimit,
+    resolveRevision, listFiles: async () => [], pinAssetUrl, readRemoteMask, remoteSize, assertCurrent, maxAssetBytes: sizeLimit,
     progress: message => progress(message, 0, 0),
   });
   return packageDriveArchive(prepared, signal, progress, assertCurrent, sizeLimit);
```
Ownership of the hunks:
- **F5:** `remoteSize`, `folderSizes` and the deps entry.
- **X3:** `readSource` and the three `fetch: readSource`.
- **X2:** `isHubDatasetFile` in `pinAssetUrl` and `readRemoteMask`.

Notes on the listing:
- It is non-recursive per folder (the SDK default), so a folder with large subfolders is not walked. Images in N folders cost N listings. A flat `images/` costs 1.
- The cache key uses the resolved commit. Repo-id spellings follow the Hub's 307s (G4).
- A listing request is a GET to `/api/datasets/<repo>/tree/<sha>/<folder>`, which `fetchHuggingFaceDatasetRequest` routes for private repos. The private-Hub test below proves this: 5 authorized GETs, all pinned.
- `parseHfAssetUrl` cannot throw inside `remoteSize`. `remote()` → `pinAssetUrl` has already parsed the same URL, and would have thrown its permanent error first.

**Docs** (`docs/google-drive-publishing.md:18`, first sentence; X2's sentence is under X2):
```diff
-The complete ZIP must fit the viewer's **2 GiB** archive limit. Individual images …
+The complete ZIP must fit the viewer's **2 GiB** archive limit. Hugging Face lists file sizes, so a Hugging Face dataset that cannot fit is refused before any image downloads; on other hosts, packaging stops once the ZIP reaches the limit. Individual images …
```

### 4. Tests (code)
**`src/features/googleDrive/prepareArchive.test.ts`**:

Update 'copies private Hub images and masks using read authorization and a pinned revision' (`:42-71`). Serve the image folder listing, and expect one more authorized GET:
```diff
       if (url.includes('/revision/main')) return Response.json({ id: 'owner/private', _id: 'repo-id', sha, private: true, gated: 'auto' });
+      if (url.includes(`/tree/${sha}/images/nested?`)) return Response.json([{ type: 'file', path: 'images/nested/photo.jpg', size: 8 }]);
       if (url.includes(`/tree/${sha}/masks`)) return Response.json([{ type: 'file', path: 'masks/nested/photo.jpg.png', size: 4 }]);
 …
-    expect(authorized).toHaveLength(4);
+    expect(authorized).toHaveLength(5);
```
In `describe('Drive remote sources')`, after 'downloads Hub masks while packaging, as it does images, instead of holding them from preparation'. They reuse `remoteInput`, `numbered`, `entries` and `strFromU8`.
```ts
  const hubSha = 'c'.repeat(40);
  const hubRoot = 'https://huggingface.co/datasets/owner/scene/resolve/';
  const hubRevision = (url: string) => url.includes('/revision/main?') ? Response.json({ _id: 'repo-object-id', id: 'owner/scene', sha: hubSha }) : null;
  it.each([
    // 20 images of 120 MiB each fit the per-file limit but not the ZIP.
    ['whose listed images exceed the ZIP limit', 20, 120 * 1024 * 1024, '2 GiB archive limit'],
    ['with a listed image over the per-file limit', 1, 128 * 1024 * 1024 + 1, '128 MiB publication limit'],
  ])('refuses a Hub dataset %s before downloading any image', async (_, count, size, limit) => {
    const images = numbered(count);
    const request = vi.fn(async (url: string) => hubRevision(url)
      ?? (url.includes(`/tree/${hubSha}/images?`) ? Response.json(images.map(image => ({ type: 'file', path: `images/${image.name}`, size })))
        : new Response('original')));
    vi.stubGlobal('fetch', request);
    await expect(prepareDriveArchive(remoteInput({ imageUrlBase: `${hubRoot}main/images/` }, images), new AbortController().signal, () => {}, () => {}))
      .rejects.toMatchObject({ message: expect.stringContaining(limit), permanent: true });
    expect(request.mock.calls.filter(([url]) => url.includes('/resolve/'))).toEqual([]);
  });
  it('lists a Hub image folder once and checks each image against its listed size', async () => {
    const images = numbered(3);
    const request = vi.fn(async (url: string) => hubRevision(url)
      ?? (url.includes(`/tree/${hubSha}/images?`) ? Response.json(images.map(image => ({ type: 'file', path: `images/${image.name}`, size: 8 })))
        : url.startsWith(`${hubRoot}${hubSha}/images/`) ? new Response('original') : new Response(null, { status: 404 })));
    vi.stubGlobal('fetch', request);
    const files = await entries(await prepareDriveArchive(remoteInput({ imageUrlBase: `${hubRoot}main/images/` }, images), new AbortController().signal, () => {}, () => {}));
    expect(Object.keys(files).filter(path => path.startsWith('images/'))).toHaveLength(3);
    expect(request.mock.calls.filter(([url]) => url.includes('/tree/'))).toHaveLength(1);
  });
  it('still publishes Hub images whose folder listing fails, checking the ZIP limit while packaging', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => hubRevision(url)
      ?? (url.includes('/tree/') ? new Response(null, { status: 500 }) : new Response('original'))));
    const files = await entries(await prepareDriveArchive(remoteInput({ imageUrlBase: `${hubRoot}main/images/` }, numbered(2)), new AbortController().signal, () => {}, () => {}));
    expect(Object.keys(files).filter(path => path.startsWith('images/'))).toHaveLength(2);
  });
```
- **RED** on T2 code:
  - Both 'refuses …' cases: `promise resolved "{ …(3) }" instead of rejecting`.
  - 'lists a Hub image folder once…': `expected [] to have a length of 1 but got +0`.
  - Private test: `expected [ … ] to have a length of 5 but got 4`.
- **Guard test:** 'still publishes … whose folder listing fails' passes on both. It fails the mutation "rethrow listing errors", which also fails G4's two 'pins a Hub source…' tests and G10's 'downloads Hub masks while packaging…'. Their mocks answer the folder listing with 404.
- **Other mutations:**
  - `remoteSize` always null: 6 failures.
  - Image branch never assigns `asset.size`: 5 failures.
- **GREEN:** 39 tests in the file after T3, then 41 after T4.

### 5. Risks and interactions
- **The canonical wildflow folder** (6,590 images, 23.6 GB) is refused in seconds: the COLMAP export, one paginated listing, then the pre-check. Before, it downloaded about 1.8 GB over 8–12 minutes.
- **Non-Hub hosts are unchanged.** An over-limit plain-URL dataset still downloads up to 2 GiB before the permanent error. See the optional follow-up.
- **An image missing from the listing** (absent at the pinned commit) keeps an unknown size, and its download fails with the existing retryable "Could not retrieve…". This is unchanged; it is the remote half of the reviewer's E-1, not in scope. A listing-based permanent "missing at this revision" error would be a follow-up.
- **One extra Hub API call per image folder** for Hub datasets, plus pages.
- **The per-file 128 MiB cap now applies at preparation** for listed Hub images, from `checkAssetSize`. Its message: "The file images/… exceeds the 128 MiB publication limit for non-splat files.", permanent.
- **Shared contract:** `PrepareDeps.remoteSize` is optional. `publicationRuntime.ts` (HF) does not pass it, so HF publishing is untouched by T3.
- **Q1:** none. Load-time sizes are not used.

### 6. Effort
Implementer **high**: a shared contract plus async listing with caching and degradation, across two files. Reviewer **high**: judge the size semantics (exact versus unknown), degradation, private routing and the cost.

---

## F13: publication failures are misclassified in both directions (T4)

### 1. Verified
**(a) A missing local original is retried forever.**
- `src/features/datasetPublishing/preparePublication.ts:170-172` throws a non-permanent `HfError('Could not retrieve selected file …')` when a local original is missing.
- The local adapter returns `null` for a name missing from the captured map (`src/dataset/datasetSourceAdapters.ts:39-41`) and never calls `onError`, so this is deterministic.
- Its siblings are permanent: `:143` (a remote image with no URL) and `:164` (missing from the archive).
- The Drive controller offers Retry (`publishDataset.ts:150-156`). Each Retry re-exports the model and fails again.
- **RED:** `expected { phase: 'failed' … } … "canRetry": true, "error": "Could not retrieve selected file images/photo.jpg."`.

**(b) A remote splat that changed since load fails permanently.**
- `:197` turns the splat size catalogued **at load** (an HF tree size or a HEAD Content-Length, `urlLoaderManifestFetch.ts:540-543`, `:670-671`) into the asset's exact `size`.
- Both controllers then fail permanently on any difference:
  - HF: `datasetPublishing/publishDataset.ts:119`, "The size of … changed. Start a new publication.";
  - Drive: `prepareArchive.ts:49-51`.
- A new publication cannot succeed. Reload keeps the stale size, because `carryOverSplatState` (`splatFileSourcePolicy.ts:273-292`) carries remote sources with their sizes.
- **RED:**
  - HF: `"error": "The size of splats/tile.ply changed. Start a new publication.", "phase": "failed"`.
  - Drive: `GoogleDrivePublishError: The source file splats/tile.ply changed. Publish again.`.

### 2. Root cause
- **(a)** One condition merges two cases. "The read reported an error" (`failed`) might pass. "The captured files never had this original" cannot.
- **(b)** One field carries two meanings. `PublishAsset.size` means "exact byte count to verify". A load-time catalogue value is not that: the source may have moved since, and a Content-Length may describe compressed bytes. Images and masks are copied as the source serves them at publish time, pinned for Hub sources, with no such check (accepted in C1 and G4).

### 3. Fix (code)
**(b), option chosen: re-read at publish time where the host can say exactly; otherwise use the load-time size only to plan.**
- Drive gets the exact size of a Hub splat from T3's `remoteSize` (a listing at the pinned commit), and verifies it.
- Everywhere else the catalogue value becomes `estimatedSize`. It plans HF batches and Drive's 2 GiB pre-check as before, but is never compared with the downloaded bytes.
- "Input-bound failures are permanent" is unchanged for exact sizes.

**Why not the alternative message ("…changed since loading. Open the dataset link again")?**
- It would still fail only after everything before the splat has been sent. On HF that means a partially filled *public* repository; on Drive, up to 2 GiB downloaded.
- It forces a reload that Reload itself cannot do.
- It guards nothing images and masks get.

```diff
--- a/src/features/datasetPublishing/types.ts
+++ b/src/features/datasetPublishing/types.ts
@@ -7,7 +7,10 @@ export const MAX_PUBLICATION_BATCH_FILES = 49; // Plus one atomic batch receipt.
 export interface PublishAsset {
   path: string;
   kind: 'colmap' | 'image' | 'mask' | 'splat' | 'viewer-state' | 'preview';
+  /** The exact byte count, checked against the opened file; null when unknown. */
   size: number | null;
+  /** A size read when the dataset loaded: it plans batches and the ZIP limit, but the source may have changed since, so it is never checked. */
+  estimatedSize?: number;
   open: (signal: AbortSignal) => Promise<Blob>;
 }
 export interface PublicationDetails {
```
```diff
--- a/src/features/datasetPublishing/preparePublication.ts   (after T3)
+++ b/src/features/datasetPublishing/preparePublication.ts
@@ -174,7 +174,9 @@ export async function preparePublication(input: PublicationInput, signal: AbortS
     }
     const value = mask ? await manager.getMask(name, { signal, onError: () => { failed = true; } })
       : await manager.getOriginalImage(name, { signal, onError: () => { failed = true; } });
-    if (failed || (!value && !mask)) throw new HfError(`Could not retrieve selected file ${path}.`);
+    if (failed) throw new HfError(`Could not retrieve selected file ${path}.`);
+    // The captured files never gain the original, so a retry would fail the same way.
+    if (!value && !mask) throw new HfError(`Original image ${name} is unavailable. Load its original file before publishing.`, undefined, true);
     if (!value) return null;
     return fixed(path, value, mask ? 'mask' : 'image');
   };
@@ -198,8 +200,9 @@ export async function preparePublication(input: PublicationInput, signal: AbortS
     if (source.file?.size) add(fixed(path, source.file, 'splat'));
     else if (source.url) {
       const asset = await remote(source.url, path, 'splat');
-      // Discovery records an unknown size as 0; only a positive size is a byte count to verify.
-      asset.size = source.size !== undefined && source.size > 0 ? source.size : null;
+      asset.size = await deps.remoteSize?.(source.url, signal) ?? null;
+      // The catalogued size was read at load (0 when unknown); the source may have changed since, so it only plans.
+      if (asset.size === null && source.size !== undefined && source.size > 0) asset.estimatedSize = source.size;
       add(asset);
     }
     else throw new HfError(`Original splat ${source.path} is unavailable. Load its original file before publishing.`, undefined, true);
```
```diff
--- a/src/features/datasetPublishing/publishDataset.ts
+++ b/src/features/datasetPublishing/publishDataset.ts
@@ -109,8 +109,9 @@ export function createPublicationController(client: HubClient,
         while (end < current.prepared.assets.length && files.length < MAX_PUBLICATION_BATCH_FILES) {
           const asset = current.prepared.assets[end];
           // An unknown-size splat may be many gigabytes; never download one alongside a batch.
-          const unbounded = asset.size === null && asset.kind === 'splat';
-          if (files.length && (unbounded || (asset.size !== null && bytes + asset.size > MAX_PUBLICATION_BATCH_BYTES))) break;
+          const planned = asset.size ?? asset.estimatedSize ?? null;
+          const unbounded = planned === null && asset.kind === 'splat';
+          if (files.length && (unbounded || (planned !== null && bytes + planned > MAX_PUBLICATION_BATCH_BYTES))) break;
           let content = carried?.index === end ? carried.content : undefined;
           if (!content) {
             set({ phase: 'uploading', message: `Preparing ${asset.path}…` });
```
```diff
--- a/src/features/googleDrive/prepareArchive.ts   (after T3)
+++ b/src/features/googleDrive/prepareArchive.ts
@@ -22,7 +22,7 @@ export async function packageDriveArchive(prepared: PreparedPublication, signal:
   const check = () => { signal.throwIfAborted(); assertCurrent(); };
   check();
   if (prepared.assets.length > 60_000) throw new GoogleDrivePublishError('This dataset has too many files for a Drive ZIP.', undefined, true);
-  if (prepared.assets.reduce((sum, asset) => sum + (asset.size ?? 0), 0) > sizeLimit) throw archiveTooLarge();
+  if (prepared.assets.reduce((sum, asset) => sum + (asset.size ?? asset.estimatedSize ?? 0), 0) > sizeLimit) throw archiveTooLarge();
   const md5 = await awaitWithAbort(createMD5(), signal);
   check();
   const parts: Blob[] = [];
```
- HF batching is unchanged in behaviour: an estimate plans exactly as the old catalogued size did. An underestimate is absorbed by the existing carry logic (`:122`), so `docs/hugging-face-publishing.md:53` stays true.
- The verification at HF `:119` and Drive `:49` now applies only to exact sizes: local files, ZIP entries, and Hub listings at the pinned commit.

### 4. Tests (code)
**`src/features/datasetPublishing/preparePublication.test.ts`**:
```diff
-  it.each([[0, 'unknown', null], [undefined, 'unknown', null], [42, 'an exact byte count', 42]] as const)('treats a catalogued splat size of %s as %s', async (size, _reading, expected) => {
+  it.each([[0, 'unknown', undefined], [undefined, 'unknown', undefined], [42, 'an estimate it never checks', 42]] as const)('treats a catalogued splat size of %s as %s', async (size, _reading, expected) => {
     const source = input();
     source.dataset.loadedFiles!.splatFileSources = [{ id: 'tile', path: 'tile.ply', url: tileUrl, size }];
     const prepared = await preparePublication(source, new AbortController().signal, deps());
-    expect(prepared.assets.find(asset => asset.kind === 'splat')!.size).toBe(expected);
+    const tile = prepared.assets.find(asset => asset.kind === 'splat')!;
+    expect(tile.size).toBeNull();
+    expect(tile.estimatedSize).toBe(expected);
   });
 
-  it('publishes a lazy remote tile whose size discovery could not read', async () => {
+  it.each([
+    ['whose size discovery could not read', 0, true],
+    ['that changed size since the dataset loaded', 5, false],
+  ])('publishes a lazy remote tile %s', async (_, size, alone) => {
     const source = input();
-    source.dataset.loadedFiles!.splatFileSources = [{ id: 'tile', path: 'tile.ply', url: tileUrl, size: 0 }];
+    source.dataset.loadedFiles!.splatFileSources = [{ id: 'tile', path: 'tile.ply', url: tileUrl, size }];
     vi.stubGlobal('fetch', vi.fn(async () => new Response('remote splat bytes')));
 …(unchanged client/controller setup)…
     const batches = vi.mocked(client.upload).mock.calls.map(call => call[1].map(file => file.path));
-    expect(batches).toContainEqual(['splats/tile.ply', 'colmapview-upload.json']);
+    // An unknown size gets its own batch; a load-time estimate still plans batches but is never checked.
+    expect(batches.flat()).toContain('splats/tile.ply');
+    expect(batches).toContainEqual(alone ? ['splats/tile.ply', 'colmapview-upload.json'] : expect.arrayContaining(['sparse/0/cameras.bin', 'splats/tile.ply']));
   });
 …
-  it('requires every original image instead of silently publishing an incomplete dataset', async () => {
+  it('requires every original image instead of silently publishing an incomplete dataset, in a way no retry can fix', async () => {
     const source = input(); source.dataset.loadedFiles!.imageFiles.clear();
-    await expect(preparePublication(source, new AbortController().signal, deps())).rejects.toThrow('Could not retrieve');
+    await expect(preparePublication(source, new AbortController().signal, deps())).rejects.toMatchObject({
+      message: 'Original image nested/photo.png is unavailable. Load its original file before publishing.', permanent: true });
   });
```
**`src/features/datasetPublishing/publishDataset.test.ts`** (HF controller), after 'batches remote files of unknown size instead of committing each one alone':
```ts
  it('plans batches with a remote splat’s load-time estimate but publishes the bytes it downloads', async () => {
    const { controller, client } = setup();
    const prepared = fixture();
    prepared.assets.push({ path: 'splats/tile.ply', kind: 'splat', size: null, estimatedSize: 5, open: async () => new Blob(['changed splat']) });
    await controller.publish('owner', details, async () => prepared);
    expect(controller.getSnapshot().phase).toBe('completed');
    expect(vi.mocked(client.upload).mock.calls[0][1].map(file => file.path)).toEqual(['sparse/0/0.bin', 'sparse/0/1.bin', 'sparse/0/2.bin',
      'splats/tile.ply', 'colmapview-upload.json']);
  });
```
**`src/features/googleDrive/prepareArchive.test.ts`**, in `describe('Drive remote sources')`, after T3's tests (reuses `hubSha`, `hubRoot`, `hubRevision` and `bucket`). It also needs `buildLoadedFiles` and `ARCHIVE_SIZE_LIMIT`, both already imported.
```ts
  const activeTile = (url: string, size: number) => {
    const source = remoteInput({ loadedFiles: buildLoadedFiles({ splatFileSources: [{ id: 'tile', path: 'tile.ply', url, size }] }) }, []);
    source.activeSplatId = 'tile';
    return source;
  };
  it('packages an active remote splat that changed since the dataset loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === bucket + 'tile.ply' ? new Response('splat bytes') : new Response(null, { status: 404 })));
    const archive = await prepareDriveArchive(activeTile(bucket + 'tile.ply', 5), new AbortController().signal, () => {}, () => {});
    expect(strFromU8((await entries(archive))['splats/tile.ply'])).toBe('splat bytes');
  });
  it('checks an active Hub splat against its size at the pinned revision rather than the size seen at load', async () => {
    const request = vi.fn(async (url: string) => hubRevision(url)
      ?? (url.includes(`/tree/${hubSha}?`) ? Response.json([{ type: 'file', path: 'tile.ply', size: ARCHIVE_SIZE_LIMIT + 1 }]) : new Response('splat bytes')));
    vi.stubGlobal('fetch', request);
    await expect(prepareDriveArchive(activeTile(`${hubRoot}main/tile.ply`, 10), new AbortController().signal, () => {}, () => {}))
      .rejects.toMatchObject({ message: expect.stringContaining('2 GiB archive limit'), permanent: true });
    expect(request.mock.calls.filter(([url]) => url.includes('/resolve/'))).toEqual([]);
  });
```
**`src/features/googleDrive/publishDataset.test.ts`**:
- Add `buildLoadedFiles` to the builders import.
- Add this test after 'ends a publication whose image folder has 10,000 files':
```ts
  it('ends a publication of a local model dropped without its images', async () => {
    const { controller, client } = fixture();
    const input = { sourceKey: 'local', modelRevision: 0, source: null, activeSplatId: null,
      reconstruction: buildReconstruction({ cameras: [buildCamera()], images: [buildImage({ name: 'photo.jpg' })], points3D: [buildPoint3D()] }),
      dataset: buildDatasetState({ sourceType: 'local', loadedFiles: buildLoadedFiles({ imageFiles: new Map() }) }),
      transform: createIdentityEuler(), splatTransform: createIdentityEuler(), config: {}, viewState: null, appVersion: 'test', viewerBaseUrl: 'https://viewer.example/' };
    let prepares = 0;
    await controller.publish('scene', false, (signal, progress) => { prepares++; return prepareDriveArchive(input, signal, progress, () => {}); });
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: false,
      error: 'Original image photo.jpg is unavailable. Load its original file before publishing.' });
    await controller.retry();
    expect(prepares).toBe(1);
    expect(client.owner).not.toHaveBeenCalled();
  });
```
- **RED** on T3 code (7 tests):
  - 'treats … 42 as an estimate…': `expected 42 to be null`.
  - The HF and Drive "changed" tests: the messages quoted under Verified.
  - 'plans batches with … estimate': `expected [ 'sparse/0/0.bin', …(3) ] to deeply equal [ … 'splats/tile.ply', … ]`. With no estimate the tile was sent alone.
  - 'checks an active Hub splat…' received the "changed" error instead of the 2 GiB refusal.
  - 'requires every original image…', and 'ends a publication of a local model…' (`canRetry: true`, "Could not retrieve selected file images/photo.jpg.").
- **GREEN:** 341 tests in `src/features/googleDrive` + `src/features/datasetPublishing`.
- **Guard:** the existing 'rejects a catalogued oversized active remote splat before any download' passes unchanged, through `estimatedSize`. Mutation "pre-check ignores `estimatedSize`" fails it.
- **Other mutations:**
  - Catalogued size kept as exact: 3 failures.
  - HF planner ignores the estimate: 2 failures.

### 5. Risks and interactions
- **A stale estimate in Drive's pre-check:**
  - A tile that grew past the limit after load is stopped by packaging's cap, as for unknown sizes.
  - A tile that shrank below the limit, but was catalogued above it, is still refused permanently. This is only possible on non-Hub hosts, because Hub splats get their listed size. It is rare and acceptable.
- **The publication copies the splat the source serves now** (pinned for Hub), consistent with images and masks under C1 and G4. A tile retrained since load is published as retrained, and the viewer settings were tuned on the old one.
- **A splat deleted since load** still fails its download with the retryable "Could not retrieve…". This is unchanged and out of scope (E-1's remote half).
- **(a) is a message change for local datasets.** HF preparation failures already end without a job. The retryable `failed` branch stays for adapters that report read errors; the local adapter never does.
- **Q1:** its X8 change keeps `size: probe.size ?? 0` for explicit splats, so the "0 means unknown" convention that `source.size > 0` relies on holds.
- **Q2:** F2 may edit `preparePublication.ts:204-207` (the published `config.splat.activeSourceId`). That is adjacent to T4's splat-branch hunk (`:193-199`). There is no semantic overlap; apply sequentially.

### 6. Effort
Implementer **medium**: small hunks in five files, but a shared type and both controllers. Reviewer **high**: confirm that exact and estimated sizes are used correctly in batching, the pre-check and verification, and that the permanent rule stays intact.

---

## Extras

### X2: Drive refuses Hub model and Space repository assets (Fix, in T3)
- **Verified.**
  - `prepareArchive.ts:101-102` sends every `huggingface.co` URL to `parseHfAssetUrl` (`publicationPaths.ts:31-43`). That accepts only `/datasets/<repo>/resolve/<rev>/…`.
  - A model-repo image (`https://huggingface.co/owner/scene/resolve/main/images/…`, which the viewer loads as a plain URL dataset) therefore fails permanently with "Copy these remote assets locally before publishing. Only public Hugging Face asset URLs can be pinned." The asset *is* public, so the message misleads.
  - Model-repo mask bases fail the same way (`:111-113`).
  - The `?download=true` dataset link is a URL the viewer never produces (the reviewer's A4-2).
  - **RED:** `HfError: Copy these remote assets locally before publishing…`.
- **Root cause.** Pinning is possible only for dataset repos, through `datasetInfo`. Yet the Drive path treated every Hub origin as pinnable, while it copies every other host's files unpinned.
- **Fix.**
  - `isHubDatasetFile` gates pinning (`pinAssetUrl`), the mask listing (`readRemoteMask`) and F5's `remoteSize`. The code is in T3's hunk.
  - Model and Space files then copy unpinned, like S3, and their masks are probed with the 8-image rule.
  - A dataset URL with a query is still refused, unchanged.
- **Docs** (`docs/google-drive-publishing.md:16`):
  ```diff
  -… Private Hugging Face source assets require the existing repository read connection; their revision is pinned before copying. The source …
  +… Private Hugging Face source assets require the existing repository read connection; dataset files are pinned to a commit before copying, while files in Hugging Face model or Space repositories are copied unpinned, like other hosts' files. The source …
  ```
- **Tests** (`prepareArchive.test.ts`). Replace the three-row `it.each('fails in a way no retry can fix on %s, which cannot be pinned')` (`:197-206`) with the remaining refusal plus the new copy test:
  ```ts
  it('fails in a way no retry can fix on a Hugging Face dataset download link, which cannot be pinned', async () => {
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    await expect(prepareDriveArchive(remoteInput({ imageNameToUrl: { 'photo.jpg': 'https://huggingface.co/datasets/owner/scene/resolve/main/images/photo.jpg?download=true' } }),
      new AbortController().signal, () => {}, () => {})).rejects.toMatchObject({
      message: 'Copy these remote assets locally before publishing. Only public Hugging Face asset URLs can be pinned.', permanent: true });
    expect(request).not.toHaveBeenCalled();
  });
  it('copies images and masks from Hugging Face model and Space repositories unpinned, like any other host', async () => {
    const model = 'https://huggingface.co/owner/scene/resolve/main/';
    const space = 'https://huggingface.co/spaces/owner/app/resolve/main/';
    const request = vi.fn(async (url: string) => url === `${model}images/photo.jpg` ? new Response('original')
      : url === `${space}masks/photo.jpg.png` ? new Response('mask') : new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', request);
    const files = await entries(await prepareDriveArchive(remoteInput({ imageUrlBase: `${model}images/`, maskUrlBase: `${space}masks/` }),
      new AbortController().signal, () => {}, () => {}));
    expect(strFromU8(files['images/photo.jpg'])).toBe('original');
    expect(strFromU8(files['masks/photo.jpg.png'])).toBe('mask');
    expect(request.mock.calls.filter(([url]) => url.includes('/api/'))).toEqual([]);
  });
  ```
  - RED on T2 code, GREEN after T3.
  - Mutation "origin-only predicate" fails the copy test.
- **Risks.**
  - This reverses the model/Space half of 2c9dfd8, which refused them deliberately but permanently. They become unpinned copies, so a repo whose `main` moves mid-packaging could mix revisions, exactly as on S3. See **D2**.
  - Fallback if D2 says "keep refusing": revert the two `isHubDatasetFile` call sites in `pinAssetUrl` and `readRemoteMask`, keep it in `remoteSize`, restore the two test rows, and only reword the message, for example "Drive copies Hugging Face files only from dataset repositories…".
  - Private model repos are not readable, by the viewer or here (`fetchHuggingFaceDatasetRequest` routes datasets only).
- **Effort:** low / medium.

### X3: Drive's Hub API reads have no backoff (Fix, in T3)
- **Verified.**
  - `prepareArchive.ts:91` (`datasetInfo`) and `:117` (`listFiles`) use the raw `read`. A 429 or 503 from the Hub API fails the publication at once with the generic message.
  - HF publishing's `hubClient` wraps the same SDK calls in `boundedFetch`.
  - The mask probes' own comment claims "the same bounded backoff as Hub reads".
  - **RED:** `Error: Api error with status 429.`
- **Fix.**
  - One `readSource = boundedFetch(signal, null, read)` serves mask probes, the revision read, the mask listing and F5's folder listings (T3 hunk).
  - It retries 429/502/503/504 twice and honours `Retry-After`.
  - `timeout: null` keeps `fetchDatasetResource`'s 30 s inactivity timeout and its HF private-repo routing.
- **Test** (`prepareArchive.test.ts`, after F5's tests):
  ```ts
  it('retries throttled Hub revision reads and folder listings, like other Hub reads', async () => {
    const throttled = new Set<string>();
    const request = vi.fn(async (url: string) => {
      const read = url.includes('/revision/main?') ? 'revision' : url.includes('/tree/') ? url.split('?')[0] : null;
      if (read && !throttled.has(read)) {
        throttled.add(read);
        return new Response(null, { status: read === 'revision' ? 429 : 503, headers: { 'Retry-After': '0' } });
      }
      return hubRevision(url) ?? (read ? Response.json(read.endsWith('/masks') ? [{ type: 'file', path: 'masks/photo.jpg.png', size: 4 }] : [])
        : new Response(url.endsWith('.png') ? 'mask' : 'original'));
    });
    vi.stubGlobal('fetch', request);
    const files = await entries(await prepareDriveArchive(remoteInput({ imageUrlBase: `${hubRoot}main/images/`, maskUrlBase: `${hubRoot}main/masks/` }),
      new AbortController().signal, () => {}, () => {}));
    expect(strFromU8(files['images/photo.jpg'])).toBe('original');
    expect(strFromU8(files['masks/photo.jpg.png'])).toBe('mask');
    expect(request.mock.calls.filter(([url]) => url.includes('/revision/main?'))).toHaveLength(2);
    // The image folder and the mask folder are each listed after one retry.
    expect(request.mock.calls.filter(([url]) => url.includes('/tree/'))).toHaveLength(4);
  });
  ```
  - Mutations: each of `fetch: read` on `datasetInfo`, on the mask listing, or on the folder listing fails it.
- **Risks.**
  - A long `Retry-After` pauses preparation, which can be cancelled; C2 already accepted this for probes.
  - It adds no requests on success: the private test still counts exactly one GET per read.
- **Effort:** low / low.

### X10: efficiency (Set aside)
Set aside. These are pure performance changes with no correctness impact, and none is small and safe:
- Concurrent packaging or probing must keep ZIP entry order, the held-mask memory bound and progress semantics.
- Reusing downloads across a failed preparation would hold up to 2 GiB of partial blobs between attempts.
- Changing the 8 MiB Drive chunk size needs measurement against Drive. It must stay a 256 KiB multiple, and coarser chunks raise retry cost.

F8 makes concurrent mask probing more valuable on 403 hosts (D1), so it is the natural first follow-up.

---

## User decisions needed

**D1 (F8(b)): extra mask probes on mask-less hosts that answer 403 or block CORS.** Recommended: **A**.

| Option | Behaviour | Cost |
|---|---|---|
| **A. Viewer parity** (this spec) | Every mask the viewer would show is published. | A mask-less dataset on S3 without ListBucket, or on a CORS-less-404 host, makes 2 probes per image instead of 16 in total: 200 against 16 for 100 images (measured). By my estimate, not measured, that is about +15–30% publication time there; X10's concurrency would recover most of it later. |
| B. Count 403 and network errors as misses | Bounded at 16 probes. F8(a) is still fixed, since a network error is no longer fatal. | F8(b) stays: on those hosts, masks that first appear after 8 mask-less images are dropped silently. Change: in T1's hunk, keep `absent = true` for 403/TypeError; the 'keeps probing past 8 images…' test becomes a 16-probe test. |

**D2 (X2): copy Hugging Face model and Space repository files unpinned.** Recommended: **yes**. Drive already copies every non-Hub host's files unpinned. The alternative keeps the permanent refusal and only rewords its message; the fallback is spelled out under X2.

Not a decision, recorded for completeness: F5's optional HEAD probing of non-Hub images. It is not proposed in this round.

## E2e specs these fixes could affect
- **`e2e/hugging-face-publish.spec.ts`:** HF publishing of local datasets through `preparePublication` and the HF controller, touched by T4 (and T3's optional dep). It does not pin anything changed here, and passed 5/5 on port 5313 with T1–T4 applied.
- **No other e2e spec** exercises Drive publishing, the Drive runtime, remote-source publication or the viewer mask loader's absence rule. `mask-export.spec.ts` uses the viewer loader, which is unchanged.
- The deployment smoke tests (`scripts/deployment/tests/*`) are unaffected.

## File ownership

| File | Items |
|---|---|
| `src/features/googleDrive/prepareArchive.ts` | F8 (T1); F5, X3, X2 (T3); F13(b) pre-check (T4) |
| `src/features/googleDrive/prepareArchive.test.ts` | F8 (T1); F5, X3, X2 (T3); F13(b) (T4) |
| `src/features/googleDrive/publishDataset.ts` | F12 (T2) |
| `src/features/googleDrive/publishDataset.test.ts` | F12 (T2); F13(a) Drive test (T4) |
| `src/features/googleDrive/publicationRuntime.ts` | F12 (T2) |
| `src/features/googleDrive/publicationRuntime.test.ts` | F12 (T2) |
| `src/features/googleDrive/publicationReceiptReset.test.ts` | F12 (T2) |
| `src/features/datasetPublishing/preparePublication.ts` | F5 (T3); F13(a), F13(b) (T4) |
| `src/features/datasetPublishing/preparePublication.test.ts` | F13(a), F13(b) (T4) |
| `src/features/datasetPublishing/types.ts` | F13(b) (T4) |
| `src/features/datasetPublishing/publishDataset.ts` (HF controller) | F13(b) (T4) |
| `src/features/datasetPublishing/publishDataset.test.ts` | F13(b) (T4) |
| `docs/google-drive-publishing.md` | F8 `:18` (T1); F12 `:8`, `:24` (T2); F5 `:18`, X2 `:16` (T3) |

## Recommended task grouping and order
Apply in this order. T1 and T3 share `prepareArchive.ts`; T2 and T4 share the Drive controller test; T3 and T4 share `preparePublication.ts`. Each task's hunks above are relative to the previous task. Run `npx vitest run src/features/googleDrive src/features/datasetPublishing` after each task, and the full gate at the end: `npm run check` and `npm run test:deployment`. The chromium e2e run includes `hugging-face-publish.spec.ts`.

1. **T1 (F8).** *Publish Drive datasets whose mask host answers 403 or blocks CORS, as the viewer shows them.*
   - Files: `prepareArchive.ts`, `prepareArchive.test.ts`, docs `:18` (mask sentence).
   - Effort: medium / high. Needs D1 (default A).
2. **T2 (F12).** *Clear a stopped Drive publication when another dataset loads, and keep uploading a built ZIP through edits and deletion marks.*
   - Files: `googleDrive/publishDataset.ts`, `publicationRuntime.ts`, `publishDataset.test.ts`, `publicationRuntime.test.ts`, `publicationReceiptReset.test.ts`, docs `:8`, `:24`.
   - Effort: high / max.
3. **T3 (F5 + X3 + X2).** *Refuse a Hugging Face dataset too large for a Drive ZIP before downloading it, retry throttled Hub reads, and copy Hub model or Space files.*
   - Files: `prepareArchive.ts`, `prepareArchive.test.ts`, `preparePublication.ts` (dep and image branch), docs `:16`, `:18`.
   - Effort: high / high. X2 depends on D2 (default yes); its parts are separable.
4. **T4 (F13).** *Stop failing publications on a splat that changed since loading, and end publications whose local images were not loaded.*
   - Files: `types.ts`, `preparePublication.ts`, `datasetPublishing/publishDataset.ts`, `prepareArchive.ts` (pre-check), and the four test files listed above.
   - Effort: medium / high.

## Cross-area notes
- **Q1 (URL load):**
  - No shared files.
  - T4's estimate rule reads the load-time catalogue's "0 means unknown" convention (`urlLoaderManifestFetch.ts:543`, `:671`). Q1's X8 hunk keeps it (`size: probe.size ?? 0`).
  - F5 deliberately does not use load-time sizes, so Q1's discovery changes (F3) do not affect publishing.
- **Q2 (splat choice):**
  - If F2's fix edits `src/features/datasetPublishing/preparePublication.ts:204-207`, which sets the published `config.splat.activeSourceId`, or `publicationSnapshot.ts`, it touches the file T3/T4 edit at `:38-45`, `:141-148`, `:170-176` and `:193-199`.
  - There is no semantic overlap. Land them sequentially, and re-run `preparePublication.test.ts`.
- **Q4 (docs and release):** no shared files.
  - Q4 edits `docs/google-oauth-verification.md`, `docs/dual-hosting.md`, `CONTRIBUTING.md` and deployment scripts.
  - This spec edits `docs/google-drive-publishing.md` only.
  - `public/privacy.html` needs no change for these items (see F5's privacy row).
