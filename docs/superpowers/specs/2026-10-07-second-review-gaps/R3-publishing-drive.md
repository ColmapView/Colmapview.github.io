# R3: publishing and Google Drive (implementation spec)

Repo `C:/Users/HEQ/Projects/colmap_webview/colmap-webview`, branch `fix/second-review-gaps` at `e8a2a43`. Findings G1, G4, G10, G15, E1, E5, E10, E12 and E15 from `findings.md`. Line numbers are at `e8a2a43`.

## Verdict summary

| Item | Confirmed? | Fix in one line | Effort (implementer / reviewer) |
|---|---|---|---|
| G1 finished Drive job never cleared | **Yes**, RED in a unit test and end to end through the real runtime | `invalidate()` resets a `completed` job to the idle form, as HF does | medium / high |
| G4 revision pin requires `info.name === repoId` | **Yes**, live: `opsiclear/ngs` → 307 → `OpsiClear/NGS`; `imdb` → 307 → `stanfordnlp/imdb` | Drop the id equality at both sites; the commit sha pins the files | low / medium |
| G10 Drive mask probing unbounded | **Yes**: 20 mask-less images make 40 probes | Viewer's 8-image absence rule; HF masks download while packaging; held masks capped at the ZIP limit | high / high |
| G15 untested Drive paths | **Yes**, all four paths have no test | Eight new test blocks (ten cases); each kills the mutations listed | medium / medium |
| E1 128 MiB cap hits `images.bin` | **Yes** | Exempt kind `colmap` (both hosts); R5 updates two doc lines | low / medium |
| E5 URL dialog hand-off uses `?url=` | **Yes** | Reuse `getGoogleDriveHandoffUrl` (`#d=`); update the deploy smoke spec | low / medium |
| E10 picker advice on hosts without a picker | **Yes** | Add the picker sentence only when `getGoogleDrivePickerConfig()` is set | low / low |
| E12 button reads a store directly; boundary test blind | **Yes**: the scan matches only `use…Store(` names | Route through the button facade; scan also matches every `src/store` export by name | medium / medium |
| E15 dead Drive mode for readers without an API key | **Yes, dead**: a reader session only comes from the picker, which needs the key | Remove it from the account dialog and from `resolveGoogleDriveArchive` | low / medium |

No deliberate decision changes. G10 keeps C2's retry-then-fail rule. G1 keeps D5's release semantics.

### How this was validated

Nothing in the repo was edited except this file.
- I copied `src/`, `package.json`, `tsconfig*`, `vite.config.ts`, `viteLocalAliasPolicy.ts`, `eslint.config.js` and `tests/colmapFixturePaths.ts` into `scratchpad/rev3/r3/ws`. That copy has a `node_modules` junction and its own git history: one commit per item over a `baseline` commit. Validated per-file diffs are in `scratchpad/rev3/r3/diffs/` (paths flattened with `__`).
- Every new test was run against the unmodified code (RED, with the stated failure), then against the fix (GREEN). Tests that cover existing behavior (G15, some guards) were instead checked against the mutations listed in each item. Each mutation failed the named test.
- Final runs on the patched copy:
  - The 94 affected test files pass (837 tests).
  - In the full `vitest run`, 566 files pass and 3 fail: `gaussianToolboxPackaging`, `sogBundle.fixture` and HF `auth` (callback page). All three read `vendor/`, `package-lock.json` or `public/`, which the copy lacks.
  - `tsc -p tsconfig.app.json` and `tsc -p tsconfig.test.json` are clean.
  - ESLint is clean on all 29 changed files.
- The scratch copy has no `.env.local`, as CI does not. Locally the repo's `.env.local` sets Drive keys. Tests that depend on Drive configuration therefore stub every relevant variable. A second run with a synthetic `.env.local` (fake HF and Drive values under the same variable names) also passed: 93 files, 827 tests.

---

## G1: a completed Drive job is never cleared

### 1. Verified
- `src/features/googleDrive/publishDataset.ts:146-148`: completion sets `phase: 'completed'` with the `receipt`, then `release(current)`. `job` stays set.
- `:175`: `invalidate() { if (job) { job.invalid = true; cancel(); release(job); set({ canRetry: false }); } }`. For a completed job this only flips `canRetry`. Phase and receipt stay.
- `src/features/googleDrive/publicationRuntime.ts:15-21` calls `invalidate()` when another dataset loads.
- `src/components/modals/GoogleDrivePublishModal.tsx:30` shows the form only when `phase === 'idle'`. `:95-107` renders the receipt: "Dataset saved to Google Drive", the viewer link and **Copy**.
- HF resets instead: `src/features/datasetPublishing/publishDataset.ts:200-205` (`if (!job && !controller) { if (state.phase === 'completed') reset(); return; }`). It is tested at `publishDataset.test.ts:50-60` (commit `8fde2e2`).
- RED, unit: after `invalidate()` the snapshot is still `phase: 'completed'` with A's `receipt` and `fileUrl`.
- RED, end to end (scratch-only check, code under Tests): with the real runtime and controller and a stub Drive client, publish A and then set another `sourceUrl` in `useReconstructionStore`. The result is `expected 'completed' to be 'idle'`.

### 2. Root cause
Drive keeps the finished job in `job`, which lets `retry()` refuse to run it again (`:47`). `invalidate()` then treats it like any other stale job and only clears `canRetry`. Nothing returns the dialog to the form. HF ends its job on completion (`job = null`), so its `invalidate()` can recognise a finished publication and reset it.

### 3. Fix (code)
Hoist `reset` and reset a completed publication on invalidation. In-flight, failed and cancelled jobs keep today's path, D5's `release(job)` included. A completed job was already released at completion (`:148`), so dropping it loses only bookkeeping that can never be used again.
```diff
--- a/src/features/googleDrive/publishDataset.ts
+++ b/src/features/googleDrive/publishDataset.ts
@@ -162,4 +162,5 @@ export function createDrivePublicationController(client: DriveUploadClient) {
   };
   const cancel = () => { if (active) { set({ phase: 'cancelling', message: 'Cancelling upload…' }); active.abort(); } };
+  const reset = () => { if (!active) { job = null; state = initial(); listeners.forEach(listener => listener()); } };
   return {
     getSnapshot: () => state,
@@ -173,6 +174,10 @@ export function createDrivePublicationController(client: DriveUploadClient) {
     retry: run,
     cancel,
-    invalidate() { if (job) { job.invalid = true; cancel(); release(job); set({ canRetry: false }); } },
-    reset() { if (!active) { job = null; state = initial(); listeners.forEach(listener => listener()); } },
+    invalidate() {
+      // A finished publication belongs to the previous dataset; the new one starts from a fresh form.
+      if (state.phase === 'completed') { reset(); return; }
+      if (job) { job.invalid = true; cancel(); release(job); set({ canRetry: false }); }
+    },
+    reset,
   };
 }
```
`active` is null in `completed` except while the completed state's own notification runs: completion is `run`'s last synchronous step before its `finally` clears `active`. No listener calls `invalidate()` from that notification, because the runtime's status listener only mirrors the phase. So `reset()` applies whenever a dataset change arrives.

### 4. Tests (code)
In **`src/features/googleDrive/publishDataset.test.ts`**, inside `describe('Drive publication lifecycle')`, before 'invalidates a changed dataset during preparation…':
```ts
  it('returns a finished publication to a fresh form when the dataset changes', async () => {
    const { controller, client, prepare } = fixture();
    await controller.publish('scene', true, prepare);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'completed', receipt: { shared: true } });
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.invalidate();
    expect(controller.getSnapshot()).toEqual({ phase: 'idle', message: '', bytesDone: 0, bytesTotal: 0, filesDone: 0, filesTotal: 0, canRetry: false });
    expect(listener).toHaveBeenCalledOnce();
    await controller.retry();
    expect(controller.getSnapshot().phase).toBe('idle');
    expect(client.file).toHaveBeenCalledTimes(3);
  });
```
- RED: the snapshot still holds `phase: 'completed'` and the receipt.
- GREEN: 29/29 in the file, including the D5 memory tests and 'invalidates a changed dataset during preparation…' (in-flight path unchanged).
- Mutation: deleting the new `completed` line fails it.

G15's runtime test (below) proves the runtime calls `invalidate()` on a dataset change, so the two tests cover the chain. An optional end-to-end test that was RED/GREEN in scratch must live in its own file, because it mocks `./upload` while the runtime test mocks `./publishDataset`. Example: `src/features/googleDrive/publicationReceiptReset.test.ts`:
```ts
import { Blob as NodeBlob } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import { useReconstructionStore } from '../../store';
import { buildReconstruction } from '../../test/builders';

const client = vi.hoisted(() => {
  let file: Record<string, unknown> | null = null;
  let name = ''; let operation = '';
  return {
    owner: async () => 'account', generateId: async () => 'DRIVE_FILE_123456789', file: async () => file,
    start: async (_id: string, filename: string, marker: string) => { name = filename; operation = marker; return 'session'; },
    status: async () => ({ complete: false, offset: 0 }),
    chunk: async (_url: string, blob: Blob) => {
      file = { id: 'DRIVE_FILE_123456789', name, size: String(blob.size), mimeType: 'application/zip', md5Checksum: 'md5',
        appProperties: { colmapviewOperation: operation }, permissions: [] };
      return { complete: true, offset: blob.size };
    },
    share: async () => {},
  };
});
vi.mock('./upload', async importOriginal => ({ ...await importOriginal<typeof import('./upload')>(), createDriveUploadClient: () => client }));

describe('Drive publication receipt', () => {
  it('clears a finished Drive receipt when another dataset loads', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const { drivePublication } = await import('./publicationRuntime');
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), sourceType: 'url', sourceUrl: 'https://example.test/a/' });
    await drivePublication.publish('a', false, async () => ({ blob: new Blob(['zip']), md5: 'md5', viewerBaseUrl: 'https://viewer.example/' }));
    expect(drivePublication.getSnapshot().phase).toBe('completed');
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), sourceUrl: 'https://example.test/b/' });
    expect(drivePublication.getSnapshot().phase).toBe('idle');
    expect(drivePublication.getSnapshot().receipt).toBeUndefined();
  });
});
```
(Use `toBeUndefined()`, not `toMatchObject({ receipt: undefined })`, because the reset snapshot has no `receipt` key.)

### 5. Risks and interactions
- **The Drive runtime invalidates on more than source changes.** It also fires on `reconstructionEditRevision` changes and on any pending deletions (`publicationRuntime.ts:17,21`). HF fires only on source changes. So after a save, applying an edit or marking a deletion also returns the dialog to the form.
  - That is consistent with the finding: the dataset on screen is no longer the one saved, and the form then asks to apply the deletions.
  - The file stays in Drive. The receipt's "Google Drive ↗" link goes with the receipt.
- **Pre-existing, out of scope:** a *permanent* failure (`job = null`, `phase: 'failed'`) still shows the previous dataset's error after a dataset change, in both controllers. It is harmless, because **Start a new publication** resets it. The same `reset()` could be applied to `failed` when `!job` as a follow-up.
- **D5:** unchanged. The memory tests 'releases the published dataset once the upload completes' and the three related ones pass.
- **Other areas:** no files shared.

### 6. Effort
Implementer **medium**: small change. Reviewer **high**: it is a state-machine edit, and the reviewer must confirm the in-flight invalidation and D5 paths are untouched.

---

## G4: the revision pin requires `info.name === repoId`

### 1. Verified
- **Drive:** `src/features/googleDrive/prepareArchive.ts:92`: `if (info.name !== repoId || !/^[a-f0-9]{40,64}$/i.test(info.sha)) throw new GoogleDrivePublishError('Could not pin the source dataset revision.')`. The error is non-permanent, so Retry repeats it forever.
- **HF:** `src/features/huggingface/hubClient.ts:39`: `if (info.private || info.gated || info.name !== repoId || …) throw new HfError('Publication requires a public, ungated Hugging Face dataset.')`.
- `@huggingface/hub@2.17.5` `datasetInfo` returns `name: data.id`. That is the id in the Hub's JSON *after* `fetch` follows redirects.
- **Live, read-only `curl`, 2026-10-07:**
  - `GET /api/datasets/opsiclear/ngs/revision/main?expand=sha` → `307 Location: /api/datasets/OpsiClear/NGS/revision/main?expand=sha`. The target answers `{"id":"OpsiClear/NGS","sha":"6cdf8e69…"}`.
  - Renamed or transferred repositories redirect the same way: `imdb` → `stanfordnlp/imdb`, `squad` → `rajpurkar/squad`, `mnist` → `ylecun/mnist`, each a 307.
  - With `Origin: https://colmapview.github.io`, the 307s for `/api/datasets/…`, `/datasets/…/resolve/<sha>/…` and `/api/datasets/…/tree/<sha>` all carry `Access-Control-Allow-Origin`. So browser `fetch` follows them for downloads and listings too.
- **RED** (4 tests below):
  - Drive: `GoogleDrivePublishError: Could not pin the source dataset revision.`
  - HF: `promise rejected "HfError: Publication requires a public, ungated Hugging Face dataset." instead of resolving`.

### 2. Root cause
The check treats the loaded URL's spelling as the repository's identity. The Hub matches ids case-insensitively and redirects old names to the repository it now serves. The loaded URL, the pinned download URLs, the mask listing and `datasetInfo` all follow the same redirect, so they reach the same repository. The check rejects only these legitimate redirects. It never ensured anything about content, which the commit sha already pins.

### 3. Fix (code)
**Which id is pinned:** the commit sha of the repository the Hub serves for the loaded name, which is `info.name`. The URL spelling stays as loaded: the Hub redirects it, CORS-enabled (verified above), to that same repository.

Alternatives considered:
- *Case-insensitive comparison only.* Rejected: renamed and transferred repositories still fail, and the finding's symptom (a Retry that can never succeed) remains for them.
- *Rewrite every URL to `info.name`.* It saves a redirect per file but changes `PrepareDeps.resolveRevision`'s contract for HF (`preparePublication.ts:86-97` pins only the revision). It also changes `fetchHuggingFaceDatasetRequest`'s private-repo routing key (R4's `datasetAccess.ts:8,14`). Not worth it.
- *Is a real mismatch permanent?* With the comparison gone there is no mismatch error left. If a reviewer insists on keeping a case-insensitive check, a mismatch (a rename) is fixed by the captured input. It must then be permanent (`new GoogleDrivePublishError(…, undefined, true)`) and tell the user to reload from the dataset's current URL.
- The remaining malformed-sha error stays retryable. It describes a Hub answer, not the input.

```diff
--- a/src/features/googleDrive/prepareArchive.ts
+++ b/src/features/googleDrive/prepareArchive.ts
@@ -90,5 +90,6 @@
     const key = `${repoId}/${revision}`;
     if (!revisions.has(key)) revisions.set(key, sdk.datasetInfo({ name: repoId, revision, additionalFields: ['sha'], fetch: read }).then(info => {
-      if (info.name !== repoId || !/^[a-f0-9]{40,64}$/i.test(info.sha)) throw new GoogleDrivePublishError('Could not pin the source dataset revision.');
+      // The Hub redirects other spellings and renamed repositories (info.name is its current id); the commit pins the files.
+      if (!/^[a-f0-9]{40,64}$/i.test(info.sha)) throw new GoogleDrivePublishError('Could not pin the source dataset revision.');
       return info.sha;
     }));
--- a/src/features/huggingface/hubClient.ts
+++ b/src/features/huggingface/hubClient.ts
@@ -38,5 +38,6 @@
         });
-      if (info.private || info.gated || info.name !== repoId || !/^[a-f0-9]{40,64}$/i.test(info.sha)) {
+      // The Hub redirects other spellings and renamed repositories (info.name is its current id); the commit pins the files.
+      if (info.private || info.gated || !/^[a-f0-9]{40,64}$/i.test(info.sha)) {
         throw new HfError(PUBLIC_SOURCE_REQUIRED);
       }
```
`private` and `gated` describe the repository actually served, which is the right policy subject.

### 4. Tests (code)
**`src/features/googleDrive/prepareArchive.test.ts`**, inside `describe('Drive remote sources')`. It reuses `remoteInput` and `entries`.
```ts
  it.each(['OpsiClear/NGS', 'lab/renamed-scene'])('pins a Hub source loaded as opsiclear/ngs that the Hub now names %s', async canonical => {
    const sha = 'e'.repeat(40);
    const root = 'https://huggingface.co/datasets/opsiclear/ngs/resolve/';
    // fetch follows the Hub's 307 to the canonical repository, which answers with its own id.
    const request = vi.fn(async (url: string) => url.startsWith('https://huggingface.co/api/datasets/opsiclear/ngs/revision/main?')
      ? Response.json({ _id: 'repo-object-id', id: canonical, sha })
      : url === `${root}${sha}/images/photo.jpg` ? new Response('original') : new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', request);
    const archive = await prepareDriveArchive(remoteInput({ imageUrlBase: `${root}main/images/` }), new AbortController().signal, () => {}, () => {});
    expect(strFromU8((await entries(archive))['images/photo.jpg'])).toBe('original');
  });
  it('refuses a Hub revision that does not resolve to a commit', async () => {
    const request = vi.fn(async (url: string) => url.includes('/revision/main?') ? Response.json({ _id: 'repo-object-id', id: 'owner/scene', sha: 'main' })
      : new Response('original'));
    vi.stubGlobal('fetch', request);
    await expect(prepareDriveArchive(remoteInput({ imageUrlBase: 'https://huggingface.co/datasets/owner/scene/resolve/main/images/' }),
      new AbortController().signal, () => {}, () => {})).rejects.toMatchObject({ message: 'Could not pin the source dataset revision.' });
    expect(request.mock.calls.filter(([url]) => url.includes('/resolve/'))).toEqual([]);
  });
```
**`src/features/huggingface/hubClient.test.ts`**, after 'pins a public source':
```ts
  it.each(['OpsiClear/NGS', 'lab/renamed-scene'])('pins a public source loaded as opsiclear/ngs that the Hub now names %s', async canonical => {
    // The Hub redirects other spellings and old names to the repository it now serves; datasetInfo reports that id.
    sdk.datasetInfo.mockResolvedValue({ name: canonical, sha: 'c'.repeat(40), private: false, gated: false });
    await expect(createHubClient(() => 'test-token').resolveRevision('opsiclear/ngs', 'main', signal())).resolves.toBe('c'.repeat(40));
  });
  it('refuses a source revision the Hub does not pin to a commit', async () => {
    sdk.datasetInfo.mockResolvedValue({ name: 'owner/scene', sha: 'main', private: false, gated: false });
    await expect(createHubClient(() => 'test-token').resolveRevision('owner/scene', 'main', signal())).rejects.toThrow('Publication requires a public, ungated Hugging Face dataset.');
  });
```
- RED: the four `…now names…` cases.
- GREEN: all.
- The two "refuses … commit" tests pass before and after. They guard the remaining sha check: deleting it fails both, at Drive and at HF.

### 5. Risks and interactions
- **The pin happens at publish time,** as before. If the loaded name now resolves elsewhere, the publication copies what the Hub serves at publish time. This is the same exposure as `main` moving between load and publish, which is accepted per the earlier C1 risk note.
  - An old name can be re-created only in its own namespace: by the owner for a case change or rename, or by the former owner after a transfer.
  - Removing the equality check doesn't widen this: the old check passed for a re-created name anyway.
- **Every file of a renamed repository costs one extra 307,** as it already does in the viewer.
- **R4** (`datasetAccess.ts`): private-repo routing keys on the loaded spelling. It is unchanged, because URLs are not rewritten.

### 6. Effort
Implementer **low**: two one-line edits. Reviewer **medium**: confirm the identity decision and the redirect evidence.

---

## G10: Drive preparation probes every image's mask candidates

### 1. Verified
- `src/features/googleDrive/prepareArchive.ts:107-139`, non-HF hosts. For every image, `readRemoteMask` GETs each of `buildMaskUrlCandidates` (two names) in sequence. It has no stop rule, and a found mask is fully read (`readBoundedResponse`) and returned as a `Blob`.
- `preparePublication.ts:116-122` wraps it with `fixed(path, value, 'mask')`, so every found mask is held in `prepared.assets` until packaging (`prepareArchive.ts:44-67`).
- `maskUrlBase` defaults to `masks/` for URL and manifest loads, so a mask-less S3, GCS or static dataset still probes. Commit `ffb63d6` routed those hosts here.
- The viewer stops after `URL_MASK_ABSENCE_THRESHOLD = 8` (`src/utils/urlImageFiles.ts:17,103-105,128`). That rule is per mask base: once 8 images have produced no mask, with no mask found yet, it never probes again. After a mask is found it never stops.
- Transient failures follow C2 (`ffb63d6`): `boundedFetch` retries 429/502/503/504 (2 retries, `Retry-After` honored). Any other non-OK answer fails with the named, retryable "Could not read the mask for X (HTTP s). Retry the publication."
- HF hosts use one recursive listing per mask folder (`:109-124`), but still GET and hold every found mask during preparation.
- RED:
  - 20 mask-less images (404) make **40** mask requests.
  - Five 10-byte masks with a 25-byte limit all download, and preparation resolves.
  - On HF the request order is `[masks/a, masks/b, images/a, images/b]`: masks are downloaded during preparation.

### 2. Root cause
The Drive copy of the mask lookup took the viewer's 403/404 rule (C2) but not its absence rule. Its only result type is "the mask bytes", which forces even listed HF masks to download during preparation and stay in memory until packaging.

### 3. Fix (code)
Decisions, per the guidance:
- **Bound.** Reuse the viewer's rule and constant. Move `URL_MASK_ABSENCE_THRESHOLD` to `imageFileLookupPolicy.ts`, the pure module both callers already import. Count 403 like 404, consistent with C2.
- **Transient failures:** keep C2 (retry, then a named retryable failure). The bound cuts a mask-less dataset's exposure from 2N requests to 16. Retrying a 500 would widen `boundedFetch` for every Hub read, which C2 declined. Re-probing on Retry is now cheap for mask-less datasets, so no cross-retry cache.
- **Holding.**
  - *HF* (cheap): the listing already proves existence and gives the exact size, verified live: for LFS/Xet files the tree `size` is the real size, 5,902,503 = `lfs.size`, not the pointer. So return the location and let `preparePublication` make an ordinary lazy `remote()` asset. The mask then downloads while packaging, like images: the same request count, nothing held, and the size is checked before any download.
  - *Other hosts* (not cheap): without a listing, the probe *is* the download. A lazy re-fetch would add one sequential request per found mask (about 2,000 × RTT for 2,000 masks) and transfer small masks twice. So keep holding them, but cap the held total at the archive limit. Masks the ZIP can never hold then fail early and permanently (an input-bound limit), instead of downloading gigabytes and failing at packaging.
- Keep HF hosts on their listing path: the bound applies only to probing.

```diff
--- a/src/utils/imageFileLookupPolicy.ts
+++ b/src/utils/imageFileLookupPolicy.ts
@@ -50,4 +50,7 @@ export interface UrlCandidate {
 }
 
+/** A mask URL folder with no mask for this many images before its first one is treated as absent. */
+export const URL_MASK_ABSENCE_THRESHOLD = 8;
+
 export function normalizeImagePath(path: string): string {
--- a/src/utils/urlImageFiles.ts
+++ b/src/utils/urlImageFiles.ts
@@ -1,3 +1,3 @@
-import { buildImageUrl, buildMaskUrlCandidates } from './imageFileLookupPolicy';
+import { buildImageUrl, buildMaskUrlCandidates, URL_MASK_ABSENCE_THRESHOLD } from './imageFileLookupPolicy';
@@ -15,5 +15,4 @@
 const maskAbsence = new Map<string, { misses: number; found: boolean }>();
-const URL_MASK_ABSENCE_THRESHOLD = 8;
```
```diff
--- a/src/features/datasetPublishing/preparePublication.ts
+++ b/src/features/datasetPublishing/preparePublication.ts
@@ -35,5 +35,6 @@ interface PrepareDeps {
   pinAssetUrl?: (url: string) => Promise<string>;
-  readRemoteMask?: (base: string, name: string, signal: AbortSignal) => Promise<Blob | null>;
+  /** A mask already read while probing, or the listed file to download with the images. */
+  readRemoteMask?: (base: string, name: string, signal: AbortSignal) => Promise<{ blob: Blob } | { url: string; size: number } | null>;
@@ -117,7 +119,11 @@
       if (deps.readRemoteMask) {
-        const value = await deps.readRemoteMask(captured.maskUrlBase, name, signal);
+        const found = await deps.readRemoteMask(captured.maskUrlBase, name, signal);
         check();
-        return value ? fixed(path, value, 'mask') : null;
+        if (!found) return null;
+        if ('blob' in found) return fixed(path, found.blob, 'mask');
+        const asset = await remote(found.url, path, 'mask');
+        asset.size = found.size;
+        return asset;
       }
```
(The `'blob' in` discriminant avoids `instanceof Blob`, which tests stub with `NodeBlob`. `readRemoteMask` has no other user.)
```diff
--- a/src/features/googleDrive/prepareArchive.ts
+++ b/src/features/googleDrive/prepareArchive.ts
@@ -8,5 +8,5 @@
-import { buildMaskUrlCandidates } from '../../utils/imageFileLookupPolicy';
+import { buildMaskUrlCandidates, URL_MASK_ABSENCE_THRESHOLD } from '../../utils/imageFileLookupPolicy';
@@ -15,4 +15,5 @@
 export type DriveArchiveProgress = (message: string, filesDone: number, filesTotal: number) => void;
+const archiveTooLarge = () => new GoogleDrivePublishError('The dataset ZIP exceeds the viewer’s 2 GiB archive limit. Use a smaller dataset or splat.', undefined, true);
@@ -22,6 +23,5 @@ export async function packageDriveArchive(…)
-  const tooLarge = () => new GoogleDrivePublishError('The dataset ZIP exceeds the viewer’s 2 GiB archive limit. Use a smaller dataset or splat.', undefined, true);
-  if (prepared.assets.reduce((sum, asset) => sum + (asset.size ?? 0), 0) > sizeLimit) throw tooLarge();
+  if (prepared.assets.reduce((sum, asset) => sum + (asset.size ?? 0), 0) > sizeLimit) throw archiveTooLarge();
   (and tooLarge() → archiveTooLarge() at the two other call sites, :37 and :50)
@@ -80,5 +80,5 @@
 export async function prepareDriveArchive(input: PublicationInput, signal: AbortSignal,
-  progress: DriveArchiveProgress, assertCurrent: () => void): Promise<DriveArchive> {
+  progress: DriveArchiveProgress, assertCurrent: () => void, sizeLimit = ARCHIVE_SIZE_LIMIT): Promise<DriveArchive> {
@@ -104,15 +105,16 @@
-  const maskListings = new Map<string, Promise<Set<string>>>();
-  const readRemoteMask = async (base: string, name: string): Promise<Blob | null> => {
-    let paths: Set<string> | null = null;
+  const maskListings = new Map<string, Promise<Map<string, number>>>();
+  const maskAbsence = new Map<string, { misses: number; found: boolean }>();
+  let heldMaskBytes = 0;
+  const readRemoteMask = async (base: string, name: string): Promise<{ blob: Blob } | { url: string; size: number } | null> => {
     if (parseRemoteUrl(base).origin === 'https://huggingface.co') {
       if (!maskListings.has(base)) maskListings.set(base, (async () => {
         const folder = parseHfAssetUrl(base.replace(/\/?$/, '/'));
         const revision = await resolveRevision(folder.repoId, folder.revision);
-        const files = new Set<string>();
+        const files = new Map<string, number>();
         try {
           for await (const file of sdk.listFiles({ repo: { type: 'dataset', name: folder.repoId }, revision, path: folder.path, recursive: true, fetch: read })) {
-            if (file.type === 'file') files.add(file.path);
+            if (file.type === 'file') files.set(file.path, file.size);
           }
@@ -121,8 +123,17 @@
         return files;
       })());
-      paths = await maskListings.get(base)!;
+      const files = await maskListings.get(base)!;
+      // The listing proves the mask exists, so it downloads with the images while packaging instead of being held.
+      for (const candidate of buildMaskUrlCandidates(base, name)) {
+        const size = files.get(parseHfAssetUrl(candidate.url).path);
+        if (size !== undefined) return { url: candidate.url, size };
+      }
+      return null;
     }
+    // Like the viewer's mask loader, stop asking a folder that had no mask for the first images (masks/ is a default).
+    const absence = maskAbsence.get(base) ?? { misses: 0, found: false };
+    maskAbsence.set(base, absence);
+    if (!absence.found && absence.misses >= URL_MASK_ABSENCE_THRESHOLD) return null;
     for (const candidate of buildMaskUrlCandidates(base, name)) {
-      if (paths && !paths.has(parseHfAssetUrl(candidate.url).path)) continue;
       const response = await readMask(await pinAssetUrl(candidate.url));
@@ -132,14 +143,20 @@
-      return readBoundedResponse(response, MAX_BUFFERED_PUBLICATION_FILE_BYTES, () => new GoogleDrivePublishError(
+      const blob = await readBoundedResponse(response, MAX_BUFFERED_PUBLICATION_FILE_BYTES, () => new GoogleDrivePublishError(
         `The mask for ${name} (${candidate.filename}) exceeds the 128 MiB publication limit for non-splat files. Shrink it in the source dataset, then publish again.`,
         undefined, true));
+      absence.found = true;
+      // Without a listing the probe is the download, so the mask is held until packaging; never more than the ZIP can take.
+      heldMaskBytes += blob.size;
+      if (heldMaskBytes > sizeLimit) throw archiveTooLarge();
+      return { blob };
     }
+    absence.misses++;
     return null;
   };
   const prepared = await preparePublication({ ...input, splats: 'active' }, signal, {
-    resolveRevision, listFiles: async () => [], pinAssetUrl, readRemoteMask, assertCurrent, maxAssetBytes: ARCHIVE_SIZE_LIMIT,
+    resolveRevision, listFiles: async () => [], pinAssetUrl, readRemoteMask, assertCurrent, maxAssetBytes: sizeLimit,
     progress: message => progress(message, 0, 0),
   });
-  return packageDriveArchive(prepared, signal, progress, assertCurrent);
+  return packageDriveArchive(prepared, signal, progress, assertCurrent, sizeLimit);
 }
```
- `sizeLimit` mirrors `packageDriveArchive`'s existing parameter. Production callers (`publicationRuntime.ts:34`) keep the default.
- The full validated file is `scratchpad/rev3/r3/ws/src/features/googleDrive/prepareArchive.ts`.

### 4. Tests (code)
**`src/features/googleDrive/prepareArchive.test.ts`**, inside `describe('Drive remote sources')`, before 'names an oversized mask…'. It reuses `bucket`, `remoteInput`, `entries`, `buildImage`, `strFromU8`.
```ts
  const numbered = (count: number) => Array.from({ length: count }, (_, index) => buildImage({ imageId: index + 1, name: `photo${index}.jpg` }));
  const masked = (images: ReturnType<typeof numbered>) => remoteInput({ imageUrlBase: bucket + 'images/', maskUrlBase: bucket + 'masks/' }, images);
  it('stops probing a mask folder after 8 images without a mask, like the viewer', async () => {
    const request = vi.fn(async (url: string) => url.startsWith(bucket + 'images/') ? new Response('original') : new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', request);
    const files = await entries(await prepareDriveArchive(masked(numbered(20)), new AbortController().signal, () => {}, () => {}));
    expect(Object.keys(files).filter(path => path.startsWith('images/'))).toHaveLength(20);
    expect(Object.keys(files).filter(path => path.startsWith('masks/'))).toEqual([]);
    expect(request.mock.calls.filter(([url]) => url.startsWith(bucket + 'masks/'))).toHaveLength(16);
  });
  it('keeps probing every image once the folder has produced a mask', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith(bucket + 'images/') ? new Response('original')
      : [bucket + 'masks/photo0.jpg.png', bucket + 'masks/photo11.jpg.png'].includes(url) ? new Response('mask') : new Response(null, { status: 403 })));
    const files = await entries(await prepareDriveArchive(masked(numbered(12)), new AbortController().signal, () => {}, () => {}));
    expect(Object.keys(files).filter(path => path.startsWith('masks/')).sort()).toEqual(['masks/photo0.jpg.png', 'masks/photo11.jpg.png']);
  });
  it('stops downloading masks once they alone exceed the archive limit', async () => {
    const request = vi.fn(async (url: string) => url.startsWith(bucket + 'images/') ? new Response('original')
      : url.endsWith('.png') ? new Response('mask bytes') : new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', request);
    await expect(prepareDriveArchive(masked(numbered(5)), new AbortController().signal, () => {}, () => {}, 25))
      .rejects.toMatchObject({ message: expect.stringContaining('2 GiB archive limit'), permanent: true });
    expect(request.mock.calls.filter(([url]) => url.endsWith('.png'))).toHaveLength(3);
  });
  it('downloads Hub masks while packaging, as it does images, instead of holding them from preparation', async () => {
    const sha = 'f'.repeat(40);
    const root = 'https://huggingface.co/datasets/owner/scene/resolve/';
    const request = vi.fn(async (url: string) => {
      if (url.includes('/revision/main?')) return Response.json({ _id: 'repo-object-id', id: 'owner/scene', sha });
      if (url.includes(`/tree/${sha}/masks`)) return Response.json([{ type: 'file', path: 'masks/a.jpg.png', size: 6 }, { type: 'file', path: 'masks/b.jpg.png', size: 6 }]);
      if (url.startsWith(`${root}${sha}/`)) return new Response(url.endsWith('.png') ? 'mask!!' : 'original');
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', request);
    const archive = await prepareDriveArchive(remoteInput({ imageUrlBase: `${root}main/images/`, maskUrlBase: `${root}main/masks/` },
      [buildImage({ imageId: 1, name: 'a.jpg' }), buildImage({ imageId: 2, name: 'b.jpg' })]), new AbortController().signal, () => {}, () => {});
    expect(request.mock.calls.map(([url]) => url).filter(url => url.includes('/resolve/')).map(url => url.slice(`${root}${sha}/`.length)))
      .toEqual(['images/a.jpg', 'masks/a.jpg.png', 'images/b.jpg', 'masks/b.jpg.png']);
    expect(strFromU8((await entries(archive))['masks/b.jpg.png'])).toBe('mask!!');
  });
```
**RED, on unmodified code:**
- probing: `expected … to have a length of 16 but got 40`
- cap: `promise resolved … instead of rejecting`
- HF: the order was `['masks/a.jpg.png', 'masks/b.jpg.png', 'images/a.jpg', 'images/b.jpg']`.

**GREEN:** all 31 tests in the file. These include, unchanged:
- the private-Hub test (still exactly 4 authorized requests, all pinned to the sha);
- C2's 403, 429/503-retry and exhausted-retry tests;
- D6's oversized-mask test (non-HF, still at preparation with its named message).

**Mutations** (each fails the named test):
- The bound ignores `found` fails 'keeps probing every image once…'.
- The cap is removed: fails 'stops downloading masks…'.
- A 403 counted as a failure instead of a miss fails three tests, C2's included.

The 'keeps probing…' test passes before the fix too; it guards the `found` half of the rule.

### 5. Risks and interactions
- **Masks that first appear after 8 mask-less images are not published.**
  - The viewer never shows them either: its rule is the same, so the ZIP holds what the viewer would display.
  - Drive counts in reconstruction order; the viewer counts in viewing order. Edge cases can differ.
- **HF masks over 128 MiB** now fail at preparation from the listing size, via `checkAssetSize`. The message is the generic 'The file masks/… exceeds the 128 MiB publication limit for non-splat files.', permanent, and nothing is downloaded. D6's mask-specific wording remains for non-HF hosts.
- **HF masks now download through `downloadRemoteFile`,** like images: a 15-minute idle timeout and `boundedFetch` retries. Before, they went through `fetchDatasetResource`, with a 30 s inactivity timeout. Both paths use R4's `fetchHuggingFaceDatasetRequest`, so R4's G9 change applies to both.
- `readRemoteMask` is a shared-file contract (`preparePublication.ts`), but Drive is its only user. The HF publication path (`listRemoteMasks`) is untouched.
- **Interaction with E1:** none, beyond both editing `preparePublication.ts`.

### 6. Effort
Implementer **high**: three files plus a shared contract and async probing. Reviewer **high**: judge the holding trade-off and the parity with the viewer.

---

## G15: untested Drive paths

### 1. Verified
- **(a)** `src/features/googleDrive/upload.ts:62-72` (XHR `onload` → `Response`, header parsing) has no test. Chunk tests inject `uploadImpl` (`upload.test.ts:12`). The XHR fixture at `:119-123` has no `onload`, `status` or `getAllResponseHeaders`.
- **(b)** `publicationRuntime.ts:12,15-25` (status, invalidation subscriptions, `beforeunload`) has no test file. No `src` test imports the Drive runtime unmocked.
- **(c)** The 409 lost-create branch, `publishDataset.ts:101-110`: no test throws 409 from `start`.
- **(d)** The private-file permission guard, `:140-142`: no test sets an `anyone` or `domain` permission with `shared: false`.

### 2. Root cause
The tests stub at the boundaries these paths sit behind: the injected transport, the mocked runtime in facade tests, and the happy-path `start`.

### 3. Fix (code)
Tests only. No production change.

### 4. Tests (code)
**(c) and (d), `src/features/googleDrive/publishDataset.test.ts`**, inside `describe('Drive publication lifecycle')`, after 'reconciles a lost final upload response…'. They reuse `fixture()`.
```ts
  it.each([
    { left: 'an empty file', size: '0', starts: 2, chunks: 1 },
    { left: 'the complete ZIP', size: '20', starts: 1, chunks: 0 },
  ])('adopts $left that a lost create response left behind instead of failing on the 409', async ({ size, starts, chunks }) => {
    const { controller, client, prepare, setFile, uploaded } = fixture();
    client.start.mockImplementationOnce(async (_id, filename, marker) => {
      setFile({ ...uploaded(), name: filename, appProperties: { colmapviewOperation: marker }, size, md5Checksum: size === '0' ? undefined : 'fixture-md5' });
      throw new GoogleDrivePublishError('The file already exists.', 409);
    });
    await controller.publish('scene', false, prepare);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'completed', receipt: { driveUrl: 'https://drive.google.com/file/d/DRIVE_FILE_123456789/view' } });
    expect(client.start).toHaveBeenCalledTimes(starts);
    expect(client.start.mock.calls.map(call => call[5])).toEqual(starts === 2 ? [false, true] : [false]);
    expect(client.chunk).toHaveBeenCalledTimes(chunks);
    expect(client.generateId).toHaveBeenCalledOnce();
  });
  it('keeps the 409 and offers a retry when no file came of the lost create', async () => {
    const { controller, client, prepare } = fixture();
    client.start.mockRejectedValueOnce(new GoogleDrivePublishError('The file already exists.', 409));
    await controller.publish('scene', false, prepare);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: true, error: 'The file already exists.' });
    expect(client.file).toHaveBeenCalledTimes(2);
    expect(client.chunk).not.toHaveBeenCalled();
  });
  it.each(['anyone', 'domain'])('does not report a private save while the file grants %s access', async type => {
    const { controller, client, prepare, setFile, uploaded } = fixture();
    client.chunk.mockImplementationOnce(async () => {
      setFile({ ...uploaded(), permissions: [{ type: 'user', role: 'owner' }, { type, role: 'reader' }] });
      return { complete: true, offset: 20 };
    });
    await controller.publish('scene', false, prepare);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: true,
      error: 'This file was shared outside the publication. Review its sharing settings in Drive.' });
    expect(controller.getSnapshot().receipt).toBeUndefined();
    expect(client.share).not.toHaveBeenCalled();
  });
```
**(a), `src/features/googleDrive/upload.test.ts`**, inside `describe('Drive resumable upload transport')`, before 'keeps active XHR uploads alive…'. It uses the file's `fileId`, `session`, `DRIVE_UPLOAD_CHUNK_BYTES`, `createDriveUploadClient`, `uploadDriveChunk` and the `NodeBlob` stub.
```ts
  /** Replays Drive's answers through XMLHttpRequest's onload, as a browser delivers them. */
  function stubDriveXhr(replies: Array<{ status: number; headers: string; body?: string }>) {
    const sent: Array<{ method: string; url: string; headers: Record<string, string>; size: number }> = [];
    class DriveXhrFixture {
      upload: { onprogress?: (event: { loaded: number }) => void } = {};
      onprogress?: () => void; onload?: () => void; onerror?: () => void;
      responseType = ''; status = 0; response: ArrayBuffer | null = null;
      private method = ''; private url = ''; private headers: Record<string, string> = {}; private replyHeaders = '';
      abort = vi.fn();
      open(method: string, url: string) { this.method = method; this.url = url; }
      setRequestHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value; }
      getAllResponseHeaders() { return this.replyHeaders; }
      send(body: Blob) {
        sent.push({ method: this.method, url: this.url, headers: this.headers, size: body.size });
        const reply = replies.shift()!;
        queueMicrotask(() => {
          this.upload.onprogress?.({ loaded: body.size });
          this.status = reply.status;
          this.replyHeaders = reply.headers;
          this.response = new TextEncoder().encode(reply.body ?? '').buffer;
          this.onload?.();
        });
      }
    }
    vi.stubGlobal('XMLHttpRequest', DriveXhrFixture);
    return sent;
  }
  it('reads a resumable 308’s Range and a final 200 through the browser upload transport', async () => {
    const sent = stubDriveXhr([
      { status: 308, headers: `range: bytes=0-${DRIVE_UPLOAD_CHUNK_BYTES - 1}\r\nx-guploader-uploadid: fixture:1\r\ncontent-length: 0\r\n` },
      { status: 200, headers: 'content-type: application/json; charset=UTF-8\r\n', body: `{"id":"${fileId}"}` },
    ]);
    // No uploadImpl: chunks take the real XMLHttpRequest path.
    const client = createDriveUploadClient({ getAccessToken: () => 'upload-test-token', fetchImpl: vi.fn() });
    const blob = new Blob([new Uint8Array(DRIVE_UPLOAD_CHUNK_BYTES + 13)]);
    const progress = vi.fn();
    const signal = new AbortController().signal;
    expect(await client.chunk(session, blob, 0, signal, progress)).toEqual({ complete: false, offset: DRIVE_UPLOAD_CHUNK_BYTES });
    expect(await client.chunk(session, blob, DRIVE_UPLOAD_CHUNK_BYTES, signal, progress)).toEqual({ complete: true, offset: blob.size });
    expect(sent).toEqual([
      { method: 'PUT', url: session, size: DRIVE_UPLOAD_CHUNK_BYTES, headers: { authorization: 'Bearer upload-test-token',
        'content-range': `bytes 0-${DRIVE_UPLOAD_CHUNK_BYTES - 1}/${blob.size}`, 'content-type': 'application/zip' } },
      { method: 'PUT', url: session, size: 13, headers: { authorization: 'Bearer upload-test-token',
        'content-range': `bytes ${DRIVE_UPLOAD_CHUNK_BYTES}-${blob.size - 1}/${blob.size}`, 'content-type': 'application/zip' } },
    ]);
    expect(progress.mock.calls.map(([bytes]) => bytes)).toEqual([DRIVE_UPLOAD_CHUNK_BYTES, 13]);
  });
  it('rejects an upload response that cannot become a Response instead of leaving the chunk pending', async () => {
    // A 204 cannot carry the (empty) array buffer XHR always hands back.
    stubDriveXhr([{ status: 204, headers: '' }]);
    await expect(uploadDriveChunk(session, { method: 'PUT', body: new Blob(['zip']) })).rejects.toMatchObject({
      name: 'GoogleDrivePublishError', message: 'Google Drive returned an unreadable upload response. Retry to check the upload.' });
  });
```
**(b), new file `src/features/googleDrive/publicationRuntime.test.ts`:**
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeletionStore, useReconstructionStore } from '../../store';
import { buildReconstruction } from '../../test/builders';
import { useDrivePublicationStatus } from './publicationStatus';
import './publicationRuntime';

const controller = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let phase = 'idle';
  return {
    invalidate: vi.fn(), cancel: vi.fn(),
    getSnapshot: () => ({ phase }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    emit(next: string) { phase = next; listeners.forEach(listener => listener()); },
  };
});
vi.mock('./publishDataset', async importOriginal => ({
  ...await importOriginal<typeof import('./publishDataset')>(),
  createDrivePublicationController: () => controller,
}));

const unloading = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe('Drive publication runtime', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
    controller.emit('idle');
    controller.invalidate.mockClear();
  });

  it('invalidates the job when another dataset loads or the model is edited, and only then', () => {
    useReconstructionStore.setState({ urlLoading: true });
    expect(controller.invalidate).not.toHaveBeenCalled();
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), sourceType: 'url', sourceUrl: 'https://example.test/a/' });
    expect(controller.invalidate).toHaveBeenCalledTimes(1);
    useReconstructionStore.setState({ urlLoading: false });
    expect(controller.invalidate).toHaveBeenCalledTimes(1);
    useReconstructionStore.setState(state => ({ reconstructionEditRevision: state.reconstructionEditRevision + 1 }));
    expect(controller.invalidate).toHaveBeenCalledTimes(2);
    useReconstructionStore.setState({ sourceUrl: 'https://example.test/b/' });
    expect(controller.invalidate).toHaveBeenCalledTimes(3);
  });

  it('invalidates the job once deletions are pending', () => {
    useDeletionStore.setState({ pendingDeletions: new Set() });
    expect(controller.invalidate).not.toHaveBeenCalled();
    useDeletionStore.setState({ pendingDeletions: new Set([7]) });
    expect(controller.invalidate).toHaveBeenCalledOnce();
  });

  it('marks the toolbar until the dialog returns to idle, and guards unloading only while publishing', () => {
    expect(useDrivePublicationStatus.getState().active).toBe(false);
    expect(unloading()).toBe(false);
    controller.emit('uploading');
    expect(useDrivePublicationStatus.getState().active).toBe(true);
    expect(unloading()).toBe(true);
    controller.emit('completed');
    expect(useDrivePublicationStatus.getState().active).toBe(true);
    expect(unloading()).toBe(false);
    controller.emit('idle');
    expect(useDrivePublicationStatus.getState().active).toBe(false);
  });
});
```
All of these pass on HEAD, which they should: they cover existing behavior. Each one fails the mutations below. Every mutation was applied to the scratch copy and the test run.

| Path | Mutation | Failing test |
|---|---|---|
| 409 | rethrow every `start` failure | both 'adopts …' cases and 'keeps the 409 …' |
| 409 | second `start(…, true)` → `false` | 'adopts an empty file …' |
| 409 | delete `if (!file) throw error;` | 'keeps the 409 …' (the error becomes a generic `TypeError` message) |
| guard | delete the `anyone`/`domain` branch | both 'does not report a private save …' cases |
| guard | drop `|| permission.type === 'domain'` | the `domain` case |
| XHR | `status: xhr.status` → `200` | 'reads a resumable 308 …' |
| XHR | header value `line.slice(separator + 1)` → `line.slice(separator)` | 'reads a resumable 308 …' |
| XHR | drop `headers` from `new Response(…)` | 'reads a resumable 308 …' |
| XHR | remove the conversion's `catch` | 'rejects an upload response …' (fails at the 5 s timeout: the chunk stays pending, which is the regression) |
| XHR | stop forwarding `progress?.(event.loaded)` | 'reads a resumable 308 …' |
| runtime | drop the edit-revision clause (`:17`) | 'invalidates the job when …' |
| runtime | every store change invalidates | 'invalidates the job when …' |
| runtime | drop the deletion subscription body | 'invalidates the job once deletions …' |
| runtime | `active` = `isDrivePublishing(phase)` | 'marks the toolbar …' |
| runtime | `beforeunload` guards every non-idle phase | 'marks the toolbar …' |

### 5. Risks and interactions
- The runtime test imports the real runtime module. Its listeners live for that test file only, since vitest isolates files.
- It imports `useDrivePublicationStatus` from `./publicationStatus`. E12 below keeps that export, so the two don't conflict.
- `upload.test.ts` already stubs `Blob` with `NodeBlob`. Node's `Response` accepts status 308 and rejects a body with 204, as browsers do.

### 6. Effort
Implementer **medium**: an XHR fixture and module mocking of a side-effecting runtime. Reviewer **medium**: test-only.

---

## E1: the 128 MiB per-file limit covers the exported COLMAP binaries

### 1. Verified
- `preparePublication.ts:73` adds every exported binary as kind `colmap` with a known size. `add()` (`:68`) calls `checkAssetSize` (`:48-53`), which rejects any non-splat file over `MAX_BUFFERED_PUBLICATION_FILE_BYTES` (128 MiB, `types.ts:4`) with a permanent `HfError`.
- An `images.bin` stores 24 bytes per keypoint. 700 images × 8,000 keypoints is 134.4 MB, which exceeds 128 MiB (134.2 MB).
- RED: `HfError: The file sparse/0/images.bin exceeds the 128 MiB publication limit for non-splat files.`

**Why the limit exists.** It bounds files the publisher must *materialize* in memory:
- remote images and masks: `downloadRemoteFile` builds a Blob, capped at `:110`;
- ZIP entries, extracted when opened;
- Drive's held masks (`readBoundedResponse`).

The plan that introduced it says so: `docs/hugging-face-dataset-sharing-plan.md:241`, "bounds newly materialized remote/ZIP batch bytes … Local disk-backed Files and generated model buffers have different memory costs", and `:153`, "Account separately for generated COLMAP buffers that current export necessarily materializes". Splats are exempt because they transfer as native Blobs (`types.ts:3`).

The COLMAP binaries are already fully in memory before the check runs (`parsers/prepareReconstructionFiles.ts:19-30`: `new Blob([new Uint8Array(data)])` / `new Blob([writeImagesBinary(…)])`). The cap frees nothing and only refuses work that is already done.

### 2. Root cause
`checkAssetSize` keys the exemption on `kind !== 'splat'` and does not distinguish generated model files from copied media.

### 3. Fix (code)
**Recommendation: exempt kind `colmap` on both hosts** rather than documenting the cap.
- Downstream needs no change:
  - Drive streams each Blob into the ZIP (`prepareArchive.ts:55-64`) under the 2 GiB total.
  - HF puts a known-size asset of 128 MiB or more in a batch of its own (`datasetPublishing/publishDataset.ts:112,125`). It uploads through the SDK's LFS path, as for large splats (the 168 MB e2e fixture).
- The viewer has no per-file cap on COLMAP files when opening the result. `zipLoader.ts:181` limits only the settings entry, against the 2 GiB archive limit.
```diff
--- a/src/features/datasetPublishing/preparePublication.ts
+++ b/src/features/datasetPublishing/preparePublication.ts
@@ -48,5 +49,6 @@
 export function checkAssetSize(size: number, path: string, kind: PublishAsset['kind']): void {
   if (!Number.isSafeInteger(size) || size < 0) throw new HfError(`The file ${path} has an invalid size.`, undefined, true);
-  if (kind !== 'splat' && size > MAX_BUFFERED_PUBLICATION_FILE_BYTES) {
+  // The export already holds the COLMAP model in memory, so capping it frees nothing.
+  if (kind !== 'splat' && kind !== 'colmap' && size > MAX_BUFFERED_PUBLICATION_FILE_BYTES) {
--- a/src/features/datasetPublishing/types.ts
+++ b/src/features/datasetPublishing/types.ts
@@ -2,3 +2,3 @@
-// Splat files use native Blob transfers and are exempt from this buffer limit.
+// Splat files use native Blob transfers and the exported COLMAP model is generated in memory; both are exempt.
 export const MAX_BUFFERED_PUBLICATION_FILE_BYTES = 128 * 1024 * 1024;
```
**Docs (R5 owns these files):**
- `docs/google-drive-publishing.md:18`: "Individual non-splat files retain the existing **128 MiB** publication limit." → "Individual images and masks retain the existing **128 MiB** publication limit; the exported COLMAP files and the splat are bounded only by the ZIP."
- `docs/hugging-face-publishing.md:53`: "Other files retain a **128 MiB per-file limit**" → "Images, masks and other copied files retain a **128 MiB per-file limit**; the exported COLMAP files have none and get their own batch when large".

### 4. Tests (code)
**`src/features/datasetPublishing/preparePublication.test.ts`**, after 'retains size validation and the buffering limit for other assets…':
```ts
  it('exempts the exported COLMAP model, which the export already holds in memory', () => {
    // About 700 images with 8,000 keypoints each make a 128 MiB images.bin.
    expect(() => checkAssetSize(MAX_BUFFERED_PUBLICATION_FILE_BYTES + 1, 'sparse/0/images.bin', 'colmap')).not.toThrow();
    expect(() => checkAssetSize(-1, 'sparse/0/images.bin', 'colmap')).toThrow('has an invalid size');
  });
```
- RED as quoted above. GREEN.
- Mutation: removing `&& kind !== 'colmap'` fails it.
- The neighbouring test keeps the cap for images.

### 5. Risks and interactions
- No live HF test has uploaded a generated Blob over 128 MiB. The transport is the one the 168 MB local-PLY e2e covers. The HF controller isolates it in its own batch (`:125`, `bytes >= MAX`).
- The error text still says "non-splat files", which stays accurate for the files it now fires on: images, masks and the preview.
- R5 must land the two doc lines in the same release.

### 6. Effort
Implementer **low**: one condition. Reviewer **medium**: a policy decision on both hosts.

---

## E5: the Load URL dialog's Drive hand-off uses `?url=`

### 1. Verified
- `src/components/modals/urlInputModalViewModel.ts:118-130` builds `https://colmapview.opsiclear.com/?url=<drive link>`. The query string reaches the custom host's server.
- `public/privacy.html:66` warns that the host may log a Drive file ID sent in a query string.
- The toolbar uses `getGoogleDriveHandoffUrl` (`components/viewer3d/googleDriveHandoff.ts`), which puts `#d=` in a fragment. The destination handles `#d=` with a URL through the same `loadFromUrl` path (`App.tsx:74-106`: `manifest-url` plan → `runGuardedUrlLoad`).
- RED: 5 tests. Two view-model tests fail on `decodeShareData(hash) === null`, and three component cases on the decoded URL.

### 2. Root cause
The dialog's hand-off predates the toolbar's `#d=` helper (C3) and was not switched to it.

### 3. Fix (code)
```diff
--- a/src/components/modals/urlInputModalViewModel.ts
+++ b/src/components/modals/urlInputModalViewModel.ts
@@ -4,2 +4,3 @@
 import { parseGoogleDriveFileUrl } from '../../utils/googleDriveUrl';
+import { getGoogleDriveHandoffUrl } from '../viewer3d/googleDriveHandoff';
@@ -117,13 +118,10 @@
-/** Only carry a canonical file link, never credentials or unrelated viewer state. */
+/** Only carry a canonical file link, never credentials or unrelated viewer state, in the toolbar's #d= form. */
 export function getUrlInputDriveHandoffUrl(url: string, googleDriveEnabled: boolean): string | null {
   if (googleDriveEnabled) return null;
   try {
     const driveFile = parseGoogleDriveFileUrl(url.trim());
-    if (!driveFile) return null;
-    const destination = new URL(GOOGLE_DRIVE_ENABLED_ORIGIN);
-    destination.searchParams.set('url', driveFile.sourceUrl);
-    return destination.href;
+    return driveFile ? getGoogleDriveHandoffUrl(GOOGLE_DRIVE_ENABLED_ORIGIN, driveFile.sourceUrl) : null;
   } catch {
     return null;
   }
 }
```
(`components/modals` → `components/viewer3d` imports already exist, for example `FloorDetectionModal.tsx:9`.)

**Deploy smoke spec.** `scripts/deployment/tests/artifacts.spec.ts` runs in `deploy.yml:90` before every deploy. It asserts `?url=`, so it must change too.
```diff
--- a/scripts/deployment/tests/artifacts.spec.ts
+++ b/scripts/deployment/tests/artifacts.spec.ts
@@ -7,1 +7,2 @@
 import { loadTestDataset } from '../../../e2e/fixtures/load-test-data';
+import { decodeShareData } from '../../../src/utils/shareDataCodec';
@@ -145,5 +146,5 @@
           const handoff = dialog.getByRole('link', { name: 'Use Google Drive', exact: true });
           const destination = new URL((await handoff.getAttribute('href'))!);
-          expect(destination.origin).toBe(customOrigin);
-          expect(destination.searchParams.get('url')).toBe('https://drive.google.com/file/d/artifact_fixture_file/view?resourcekey=fixture-resource');
-          expect(destination.href).not.toContain('access_token');
+          // The file ID rides in the fragment, which never reaches the custom host's server.
+          expect(destination.origin + destination.pathname + destination.search).toBe(`${customOrigin}/`);
+          expect((await decodeShareData(destination.hash))?.manifestUrl).toBe('https://drive.google.com/file/d/artifact_fixture_file/view?resourcekey=fixture-resource');
```
- The decoded-URL equality replaces the `access_token` check: the fixture URL carries `&access_token=must-not-transfer`, and equality proves it was dropped.
- That `decodeShareData` (and the view model) import cleanly under Playwright's loader was confirmed with a one-off scratch spec run through `npx playwright test`; it passed. The full deploy browser test needs built artifacts and was not run.

### 4. Tests (code)
**`src/components/modals/urlInputModalViewModel.test.ts`.** Add `import { decodeShareData } from '../../utils/shareDataCodec';` and replace the two hand-off tests:
```ts
  it('hands off only the canonical Drive file and resource key, in a fragment the Drive host never receives', async () => {
    const link = getUrlInputDriveHandoffUrl('  https://drive.google.com/file/d/FILE_123/view?resourcekey=KEY_456&access_token=secret&state=discard#token=secret  ', false);
    const destination = new URL(link!);
    expect(destination.origin + destination.pathname + destination.search).toBe('https://colmapview.opsiclear.com/');
    expect(await decodeShareData(destination.hash)).toEqual({ manifestUrl: 'https://drive.google.com/file/d/FILE_123/view?resourcekey=KEY_456',
      manifest: null, viewState: null, config: null });
  });

  it('hands off an account-scoped Drive link in canonical form', async () => {
    const destination = new URL(getUrlInputDriveHandoffUrl('https://drive.google.com/file/u/0/d/FILE_123/view?usp=sharing', false)!);
    expect(destination.origin).toBe('https://colmapview.opsiclear.com');
    expect((await decodeShareData(destination.hash))?.manifestUrl).toBe('https://drive.google.com/file/d/FILE_123/view');
  });
```
**`src/components/modals/UrlInputModal.test.tsx`.** Add `import { decodeShareData } from '../../utils/shareDataCodec';`. In `it.each(…)('offers a safe Drive handoff on $host …')`, make the callback `async`, then replace its three `destination` assertions:
```ts
    const destination = new URL(handoff.getAttribute('href')!);
    // The file ID travels in the fragment, which the Drive host's server never receives.
    expect(destination.origin + destination.pathname + destination.search).toBe('https://colmapview.opsiclear.com/');
    expect((await decodeShareData(destination.hash))?.manifestUrl).toBe('https://drive.google.com/file/d/FILE_123/view?resourcekey=KEY_456');
```
RED: 5. GREEN: 28/28 across the two files and `GoogleDrivePublishButton.test.tsx`.

### 5. Risks and interactions
- Existing `?url=` links keep working: the destination still accepts `legacy-url`.
- **R4, G14:** sign-in-and-retry for `#d=` links. After E5, every Drive hand-off the app makes is `#d=`, so G14's fix covers it too. The likely shared test file is `UrlInputModal.test.tsx`; edits don't overlap.
- **R5:** `privacy.html:66` stays accurate and needs no change.
- **Follow-up, not in this scope:** the Drive receipt's viewer link (`publishDataset.ts:144-145`, asserted by `publishDataset.test.ts:37`) still uses `?url=`. It is the remaining app-made link that sends a Drive file ID in a query string.

### 6. Effort
Implementer **low**. Reviewer **medium**: the deploy spec is not run by vitest.

---

## E10: folder-link advice names a picker the host lacks

### 1. Verified
- `src/utils/googleDriveUrl.ts:25-26`. Every folder link gets "… rather than a folder link. For a private archive, use the Google Drive picker."
  - The picker needs an API key, a client ID and an app ID on an allowed host (`features/googleDrive/picker.ts:127-131`).
  - GitHub Pages and Pages previews are not allowed hosts. A key-only custom build has no picker either.
- `useUrlLoader.ts:208` parses before `assertGoogleDriveHostAllowed()`, so a folder link on GitHub Pages shows this text.
- RED: 2, with both no-picker configurations.

### 2. Root cause
The parser hard-codes advice that depends on deployment configuration.

### 3. Fix (code)
The change stays inside the parser, so `useUrlLoader.ts` (R2's area) is untouched.
```diff
--- a/src/utils/googleDriveUrl.ts
+++ b/src/utils/googleDriveUrl.ts
@@ -1,2 +1,4 @@
+import { getGoogleDrivePickerConfig } from '../features/googleDrive/picker';
+
 export interface GoogleDriveFileReference {
@@ -24,5 +26,6 @@
     throw new Error(/\/folders\//.test(path)
-      ? 'Paste a Google Drive file link to a ZIP or TAR archive rather than a folder link. For a private archive, use the Google Drive picker.'
+      // Only some viewers have the picker; GitHub Pages has no Drive at all.
+      ? `Paste a Google Drive file link to a ZIP or TAR archive rather than a folder link.${getGoogleDrivePickerConfig() ? ' For a private archive, use the Google Drive picker.' : ''}`
       : 'Paste a Google Drive file sharing link to a ZIP or TAR archive, such as https://drive.google.com/file/d/FILE_ID/view.');
```
- No import cycle: picker → auth/config/archivePolicy → zipLoaderPolicy, and none of them imports `googleDriveUrl.ts`.
- `utils` already imports from `features` (`fetchDatasetResource.ts:1`).
- On GitHub Pages the user then pastes a file link, which the dialog hands off (E5).

### 4. Tests (code)
**`src/utils/googleDriveUrl.test.ts`.** Change the vitest import to `import { afterEach, describe, expect, it, vi } from 'vitest';` and append:
```ts
describe('Google Drive folder link advice', () => {
  const folder = 'https://drive.google.com/drive/folders/folder123';
  const picker = { VITE_GOOGLE_DRIVE_API_KEY: 'test-key', VITE_GOOGLE_DRIVE_CLIENT_ID: '123-test.apps.googleusercontent.com', VITE_GOOGLE_DRIVE_APP_ID: '123' };
  const configure = (env: Record<string, string>) => {
    for (const [key, value] of Object.entries({ VITE_GOOGLE_DRIVE_ENABLED: 'true', VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN: '',
      VITE_GOOGLE_DRIVE_API_KEY: '', VITE_GOOGLE_DRIVE_CLIENT_ID: '', VITE_GOOGLE_DRIVE_APP_ID: '', ...env })) vi.stubEnv(key, value);
  };
  afterEach(() => vi.unstubAllEnvs());

  it('points to the Drive picker where this viewer has one', () => {
    configure(picker);
    expect(() => parseGoogleDriveFileUrl(folder)).toThrow(
      'Paste a Google Drive file link to a ZIP or TAR archive rather than a folder link. For a private archive, use the Google Drive picker.');
  });
  it.each([
    ['without Google Drive, such as GitHub Pages', { ...picker, VITE_GOOGLE_DRIVE_ENABLED: 'false' }],
    ['with public Drive links only', { VITE_GOOGLE_DRIVE_API_KEY: 'test-key' }],
  ])('offers no picker on a viewer %s', (_, env) => {
    configure(env);
    expect(() => parseGoogleDriveFileUrl(folder)).toThrow(/^Paste a Google Drive file link to a ZIP or TAR archive rather than a folder link\.$/);
  });
});
```
- Every variable is stubbed, because the developer's `.env.local` sets real Drive values.
- RED: 2. GREEN.
- Dependent suites stay green: 63 files and 398 tests, including `useUrlLoader.test.ts:296-317` ('folder link') and the URL modal tests.

### 5. Risks and interactions
- The message is now configuration-dependent. Existing assertions match only 'rather than a folder link' and 'folder link'.

### 6. Effort
Implementer **low**. Reviewer **low**.

---

## E12: `GoogleDrivePublishButton` reads a store directly; the boundary test cannot see it

### 1. Verified
- `src/components/viewer3d/GoogleDrivePublishButton.tsx:4,17` calls `useDrivePublicationStatus(state => state.active)`. That is a Zustand store: `src/store/stores/drivePublicationStatusStore.ts:4`, re-exported by `features/googleDrive/publicationStatus.ts`.
- The button already has a facade, `useGoogleDrivePublishButtonStoreFacade`. HF's button reads the same kind of status through its own facade (`useHuggingFacePublishButtonStoreFacade.ts`).
- **Why the test is blind:**
  - `componentStoreBoundary.test.ts:6` matches only `/\buse[A-Z][A-Za-z0-9]*Store\s*\(/`, a name *ending in* `Store`, and this store is `useDrivePublicationStatus`.
  - The third check (Zustand only under `src/store`) passes, because the store does live there.
  - The comment at `:8` acknowledges the escape only for stores *outside* `src/store`.
- RED for the strengthened scan, run against the unfixed button: both scans report `src/components/viewer3d/GoogleDrivePublishButton.tsx: useDrivePublicationStatus`.

### 2. Root cause
The facade rule relies on a naming convention that one store doesn't follow, and nothing checks the convention.

### 3. Fix (code)
**Route through the facade:**
```diff
--- a/src/components/viewer3d/useGoogleDrivePublishButtonStoreFacade.ts
+++ b/src/components/viewer3d/useGoogleDrivePublishButtonStoreFacade.ts
@@ -1,9 +1,11 @@
 import { useReconstructionStore } from '../../store';
+import { useDrivePublicationStatus } from '../../features/googleDrive/publicationStatus';
 import { getShareSource } from './panels/sharePanelViewModel';
 
-/** The remote source another host can reopen; local drops have neither a URL nor a manifest. */
+/** The remote source another host can reopen (local drops have neither a URL nor a manifest), and the Drive job's activity. */
 export function useGoogleDrivePublishButtonStoreFacade() {
   const sourceUrl = useReconstructionStore(state => state.sourceUrl);
   const sourceManifest = useReconstructionStore(state => state.sourceManifest);
-  return { handoffSource: getShareSource(sourceUrl, sourceManifest) };
+  const publicationActive = useDrivePublicationStatus(state => state.active);
+  return { handoffSource: getShareSource(sourceUrl, sourceManifest), publicationActive };
 }
--- a/src/components/viewer3d/GoogleDrivePublishButton.tsx
+++ b/src/components/viewer3d/GoogleDrivePublishButton.tsx
@@ -3,5 +3,4 @@
 import { GOOGLE_DRIVE_ENABLED_ORIGIN, isGoogleDriveEnabled } from '../../features/googleDrive/config';
-import { useDrivePublicationStatus } from '../../features/googleDrive/publicationStatus';
 import { GoogleDriveIcon } from '../../icons';
@@ -16,6 +15,5 @@
   const [isOpen, setIsOpen] = useState(false);
-  const active = useDrivePublicationStatus(state => state.active);
-  const { handoffSource } = useGoogleDrivePublishButtonStoreFacade();
+  const { handoffSource, publicationActive } = useGoogleDrivePublishButtonStoreFacade();
@@ -29,5 +27,5 @@
     <ControlButton panelId="publishDrive" activePanel={activePanel} setActivePanel={setActivePanel}
-      icon={<GoogleDriveIcon className="w-5 h-5" />} tooltip="Publish to Google Drive" isActive={isOpen || active}
+      icon={<GoogleDriveIcon className="w-5 h-5" />} tooltip="Publish to Google Drive" isActive={isOpen || publicationActive}
```
**Make the scan see every store by name.** This is recommended over renaming the store to `useDrivePublicationStatusStore`. The rename would fix only this store and needs four files. The scan instead catches any future store that skips the suffix, and changes no production code.
```diff
--- a/src/components/componentStoreBoundary.test.ts
+++ b/src/components/componentStoreBoundary.test.ts
@@ -4,5 +4,6 @@
 const SRC_ROOT = path.join(process.cwd(), 'src');
-const STORE_HOOK_CALL_PATTERN = /\buse[A-Z][A-Za-z0-9]*Store\s*\(/g;
+const HOOK_CALL_PATTERN = /\b(use[A-Z][A-Za-z0-9]*)\s*\(/g;
+const STORE_EXPORT_PATTERN = /export\s+const\s+(use[A-Za-z0-9]+)\s*=\s*create\b/g;
 const ZUSTAND_CREATE_IMPORT_PATTERN = /import\s*\{[^}]*\bcreate\b[^}]*\}\s*from\s*['"]zustand['"]/;
@@ -74,7 +75,18 @@
 const COMPONENT_SOURCES = PRODUCTION_SOURCES.filter(({ relativePath }) => relativePath.startsWith('src/components/'));
+// Every store under src/store counts by its exported name too, so one named without the Store suffix
+// (useDrivePublicationStatus) cannot escape the checks below.
+const STORE_HOOK_NAMES = new Set(PRODUCTION_SOURCES.filter(({ relativePath }) => isStoreModule(relativePath))
+  .flatMap(({ source }) => Array.from(source.matchAll(STORE_EXPORT_PATTERN), (match) => match[1])));
+
+function storeHookCalls(source: string): string[] {
+  return Array.from(source.matchAll(HOOK_CALL_PATTERN), (match) => match[1])
+    .filter((hookName) => hookName !== 'useSyncExternalStore' && (hookName.endsWith('Store') || STORE_HOOK_NAMES.has(hookName)));
+}
 
 describe('component store boundaries', () => {
   it('keeps production component store hooks behind facade modules', () => {
+    // An empty name set would quietly fall back to the suffix rule alone.
+    expect(STORE_HOOK_NAMES.has('useReconstructionStore')).toBe(true);
     const violations: string[] = [];
@@ -82,7 +94,5 @@
       if (isStoreFacadeFile(relativePath)) continue;
 
-      const matches = Array.from(source.matchAll(STORE_HOOK_CALL_PATTERN))
-        .map((match) => match[0].replace(/\s*\($/, ''))
-        .filter((hookName) => hookName !== 'useSyncExternalStore');
+      const matches = storeHookCalls(source);
@@ -106,7 +116,5 @@
-      const matches = Array.from(source.matchAll(STORE_HOOK_CALL_PATTERN))
-        .map((match) => match[0].replace(/\s*\($/, ''))
-        .filter((hookName) => hookName !== 'useSyncExternalStore');
+      const matches = storeHookCalls(source);
```
- The suffix rule's semantics are unchanged. `useSyncExternalStore` is still excluded, and `…StoreFacade(` names still don't match.
- On the patched tree the scan flags nothing else. `useUITheme` (`src/theme/uiTheme.ts`) lives outside `src/store`, so it is not collected, as the `:8` comment documents.

### 4. Tests (code)
**`src/components/viewer3d/useGoogleDrivePublishButtonStoreFacade.test.ts`**, full file:
```ts
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store';
import { useDrivePublicationStatus } from '../../features/googleDrive/publicationStatus';
import type { ColmapManifest } from '../../types/manifest';
import { useGoogleDrivePublishButtonStoreFacade } from './useGoogleDrivePublishButtonStoreFacade';

describe('useGoogleDrivePublishButtonStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useDrivePublicationStatus.setState(useDrivePublicationStatus.getInitialState(), true);
  });

  it('offers only a remote source for the Drive hand-off', () => {
    const { result } = renderHook(() => useGoogleDrivePublishButtonStoreFacade());
    expect(result.current.handoffSource).toBeNull();
    act(() => useReconstructionStore.setState({ sourceUrl: 'https://example.test/scene/' }));
    expect(result.current.handoffSource).toBe('https://example.test/scene/');
    const manifest = { version: 1, baseUrl: 'https://example.test/scene/', files: { cameras: 'c.bin', images: 'i.bin', points3D: 'p.bin' } } as ColmapManifest;
    act(() => useReconstructionStore.setState({ sourceUrl: null, sourceManifest: manifest }));
    expect(result.current.handoffSource).toBe(manifest);
  });

  it('reports an open Drive publication until it returns to idle', () => {
    const { result } = renderHook(() => useGoogleDrivePublishButtonStoreFacade());
    expect(result.current.publicationActive).toBe(false);
    act(() => useDrivePublicationStatus.setState({ active: true }));
    expect(result.current.publicationActive).toBe(true);
    act(() => useDrivePublicationStatus.setState({ active: false }));
    expect(result.current.publicationActive).toBe(false);
  });
});
```
**`src/components/viewer3d/GoogleDrivePublishButton.test.tsx`:**
- The facade mock becomes `vi.hoisted(() => ({ handoffSource: null as string | object | null, publicationActive: false }))`.
- `beforeEach` adds `facade.publicationActive = false;`.
- Before 'stays hidden when the Google client is unconfigured', add:
```ts
  it.each([false, true])('highlights the control while a Drive publication is open (%s)', open => {
    facade.publicationActive = open;
    render(<GoogleDrivePublishButton activePanel={null} setActivePanel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Publish to Google Drive' }).classList.contains('viewer-control-selected')).toBe(open);
  });
```
(`viewer-control-selected` is `controlPanelStyles.buttonActive`, the existing class that `getControlButtonClass(true, …)` emits. No new CSS.)

**Results:**
- The scan is RED as quoted, against the unfixed button. GREEN after the facade change: 18/18 across the three files.
- Mutations: the button ignoring `publicationActive` fails the `(true)` case. A facade returning a constant fails 'reports an open Drive publication…'.

### 5. Risks and interactions
- Other areas' new code: the stricter scan flags any component that calls a `src/store` hook directly, whatever its name. That is intended.
- Re-exports under another name, and import aliases, still escape. Both the old and new scans share that limit.

### 6. Effort
Implementer **medium**: mechanical facade wiring plus a small scan change. Reviewer **medium**: confirm the scan has no false positives or vacuous passes.

---

## E15: a dead Drive mode for signed-in readers without an API key

### 1. Verified that it is dead
- A read session is created only by `googleDriveAuth.connect(clientId, sdk)` at `src/components/dropzone/DatasetAccountButtons.tsx:122`, inside `chooseArchive`. That function returns early unless `clientId` is set (`:103`).
- `clientId` is `getGoogleDrivePickerConfig()?.clientId` (`:33`), and `getGoogleDrivePickerConfig` (`features/googleDrive/picker.ts:127-131`) returns null without the API key.
- The publish session (`googleDrivePublishAuth`) is a separate instance and is never used for reading (`api.ts:101-102`). So `google.status === 'connected'` implies an API key exists.
- Consequences:
  - `canLoadGoogleDriveUrl = Boolean(googleApiKey) || google.status === 'connected'` (`:35`) always equals `Boolean(googleApiKey)`.
  - 'Load a previously authorized dataset by URL.' (`:47`) is unreachable.
  - In `features/googleDrive/api.ts`, `useAccount = !apiKey` (`:113`) starts account-first requests only when there is no key. Without a key there is never a token, so `:128-130` throws first.
- Only the tests reach the mode: `DatasetAccountButtons.test.tsx:111-145` connect a session and *then* delete the key.
- RED: 2.
  - In the dialog with a simulated session, **Load URL** and the "previously authorized" text appear.
  - `resolveGoogleDriveArchive` with no key and an injected token sends an authorized metadata request and resolves.

### 2. Root cause
The code was written for an OAuth-only reader setup, but the only way to sign in is the picker, which needs the key.

### 3. Fix (code)
```diff
--- a/src/components/dropzone/DatasetAccountButtons.tsx
+++ b/src/components/dropzone/DatasetAccountButtons.tsx
@@ -32,6 +32,6 @@
   const clientId = getGoogleDrivePickerConfig()?.clientId;
+  // Drive URLs load with the API key; a reader session exists only through the picker, which needs the key too.
   const googleApiKey = getGoogleDriveConfiguration().apiKey;
-  const canLoadGoogleDriveUrl = Boolean(googleApiKey) || google.status === 'connected';
   const googleEnabled = isGoogleDriveEnabled();
@@ -44,6 +44,5 @@
       ? connected ? 'Choose a ZIP or TAR dataset from Google Drive.' : 'Choose a ZIP or TAR from Drive. Sign in to open private files.'
-      : googleApiKey ? 'Load a public dataset by URL.'
-        : canLoadGoogleDriveUrl ? 'Load a previously authorized dataset by URL.' : 'Google Drive loading is unavailable in this viewer.'
+      : googleApiKey ? 'Load a public dataset by URL.' : 'Google Drive loading is unavailable in this viewer.'
@@ -184,5 +183,5 @@
-            {canLoadGoogleDriveUrl && <button type="button" disabled={connecting}
+            {googleApiKey && <button type="button" disabled={connecting}
--- a/src/features/googleDrive/api.ts
+++ b/src/features/googleDrive/api.ts
@@ -111,5 +111,5 @@
-  let useAccount = !apiKey;
+  let useAccount = false;
@@ -126,5 +126,6 @@
-  if (!apiKey && !getAccessToken()) {
+  // The account only reaches files chosen in the picker, which also needs the API key.
+  if (!apiKey) {
     throw driveError(reference, 'Google Drive loading is not configured for this viewer. Contact the site administrator.');
   }
```
- Kept: the production check at `:98-100`, which a test pins with an injected key.
- Kept: the defensive `PROD && !clientId` check inside the account fallback (`:119-121`), which is reachable in tests.

### 4. Tests (code)
**`src/components/dropzone/DatasetAccountButtons.test.tsx`**: replace both tests at `:111-145` with:
```ts
  it.each([false, true])('offers no Drive URL loading without an API key, whatever the reader session (connected=%s)', connected => {
    // Only the picker, which needs the API key, signs a reader in: connected=true stands in for a session that cannot arise.
    configureDrive(connected);
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', '');
    vi.stubEnv('VITE_GOOGLE_DRIVE_APP_ID', '');
    vi.mocked(getGoogleDrivePickerConfig).mockReturnValue(null);
    render(<DatasetAccountButtons {...createProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive account' }));
    expect(screen.getByText('Google Drive loading is unavailable in this viewer.')).toBeVisible();
    expect(screen.getByText('Private file selection is unavailable.')).toBeVisible();
    expect(screen.queryByText(/public dataset|previously authorized/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load URL' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose archive from Drive' })).not.toBeInTheDocument();
    expect(loadGoogleOAuthSdk).not.toHaveBeenCalled();
    expect(chooseGoogleDriveArchive).not.toHaveBeenCalled();
  });
```
**`src/features/googleDrive/api.test.ts`**, before 'does not authenticate a production private fallback…':
```ts
  it('refuses Drive URL loading without an API key, even with a reader session', async () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', '');
    const fetchImpl = vi.fn().mockResolvedValue(Response.json(metadata));
    await expect(resolveGoogleDriveArchive(reference, { fetchImpl, getAccessToken: () => 'reader-token' })).rejects.toMatchObject({
      message: 'Google Drive loading is not configured for this viewer. Contact the site administrator.', failedFile: reference.sourceUrl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
```
RED: `connected=true` and the api test. GREEN: 22 files and 361 tests across dropzone, Drive and `useUrlLoader`.

### 5. Risks and interactions
- **No reachable behavior changes.** Production custom builds require all three Drive values (`docs/dual-hosting.md:64`). The docs never described the OAuth-only reader mode; `docs/google-drive-loading.md:52` stays true.
- **R4, G14:** may touch `DatasetAccountButtons.tsx` for the HF sign-in control. My hunks are in the Google branch.

### 6. Effort
Implementer **low**. Reviewer **medium**: confirm the mode is unreachable.

---

## File ownership

| File | Findings |
|---|---|
| `src/features/googleDrive/publishDataset.ts` | G1 |
| `src/features/googleDrive/publishDataset.test.ts` | G1, G15 |
| `src/features/googleDrive/upload.test.ts` | G15 |
| `src/features/googleDrive/publicationRuntime.test.ts` (new) | G15 |
| `src/features/googleDrive/publicationReceiptReset.test.ts` (new, optional) | G1 |
| `src/features/googleDrive/prepareArchive.ts` | G4, G10 |
| `src/features/googleDrive/prepareArchive.test.ts` | G4, G10 |
| `src/features/huggingface/hubClient.ts` | G4 |
| `src/features/huggingface/hubClient.test.ts` | G4 |
| `src/features/datasetPublishing/preparePublication.ts` | G10, E1 |
| `src/features/datasetPublishing/preparePublication.test.ts` | E1 |
| `src/features/datasetPublishing/types.ts` | E1 (comment) |
| `src/utils/imageFileLookupPolicy.ts` | G10 |
| `src/utils/urlImageFiles.ts` | G10 (constant moved, no behavior change) |
| `src/components/modals/urlInputModalViewModel.ts` | E5 |
| `src/components/modals/urlInputModalViewModel.test.ts` | E5 |
| `src/components/modals/UrlInputModal.test.tsx` | E5 |
| `scripts/deployment/tests/artifacts.spec.ts` | E5 |
| `src/utils/googleDriveUrl.ts` | E10 |
| `src/utils/googleDriveUrl.test.ts` | E10 |
| `src/components/viewer3d/GoogleDrivePublishButton.tsx` | E12 |
| `src/components/viewer3d/GoogleDrivePublishButton.test.tsx` | E12 |
| `src/components/viewer3d/useGoogleDrivePublishButtonStoreFacade.ts` | E12 |
| `src/components/viewer3d/useGoogleDrivePublishButtonStoreFacade.test.ts` | E12 |
| `src/components/componentStoreBoundary.test.ts` | E12 |
| `src/components/dropzone/DatasetAccountButtons.tsx` | E15 |
| `src/components/dropzone/DatasetAccountButtons.test.tsx` | E15 |
| `src/features/googleDrive/api.ts` | E15 |
| `src/features/googleDrive/api.test.ts` | E15 |
| `docs/google-drive-publishing.md:18`, `docs/hugging-face-publishing.md:53` | E1 text, **owned by R5** |

## Recommended task grouping and order

The four groups share no files, so they can run in any order or in parallel. The order below suits review.

| Task | Items | Commit subject | Effort (impl / review) |
|---|---|---|---|
| **T1** | G1, G15 | `Clear a finished Drive publication when the dataset changes, and test Drive's untested paths` | medium / high |
| **T2** | G4, G10, E1 | `Pin Hub sources by commit, bound Drive mask probing, and lift the copy limit from the exported model` | high / high |
| **T3** | E5, E10, E15 | `Hand Drive links over in the fragment and drop Drive advice a viewer cannot follow` | medium / medium |
| **T4** | E12 | `Read the Drive toolbar status through its facade, and let the boundary scan see every store` | medium / medium |

Notes:
- **T1** — files: `publishDataset.ts` and its test, `upload.test.ts`, the new `publicationRuntime.test.ts`, and optionally `publicationReceiptReset.test.ts`. Run `npx vitest run src/features/googleDrive`.
- **T2:**
  - Make the G4 edit first: it is one line in `prepareArchive.ts` that G10's hunk surrounds.
  - Then G10 (constant move, contract change, Drive probing), then E1.
  - Run `npx vitest run src/features/googleDrive src/features/datasetPublishing src/features/huggingface/hubClient.test.ts src/utils/urlImageFiles.test.ts src/utils/imageFileLookupPolicy.test.ts`.
  - Coordinate the E1 doc lines with R5.
- **T3:**
  - Run `npx vitest run src/components/modals src/components/dropzone src/features/googleDrive/api.test.ts src/utils/googleDriveUrl.test.ts src/hooks/useUrlLoader.test.ts`.
  - The deploy spec runs only in `npm run test:deployment:browser` and in CI.
- **T4:** run `npx vitest run src/components/componentStoreBoundary.test.ts src/components/viewer3d/GoogleDrivePublishButton.test.tsx src/components/viewer3d/useGoogleDrivePublishButtonStoreFacade.test.ts`.
- **After all four tasks:**
  - `npx tsc -b --force` and `npm run lint`.
  - The full `vitest run` before any push, as project memory requires.

## Cross-area notes

- **R5 (docs, privacy):**
  - E1 needs `docs/google-drive-publishing.md:18` and `docs/hugging-face-publishing.md:53` updated (text above).
  - Optional notes for the same doc:
    - (G1) A finished Drive publication's link is cleared when another dataset loads or the model changes.
    - (G10) Masks on hosts without a listing are treated as absent when none of the first 8 images has one, as in the viewer.
  - `public/privacy.html:66` needs no change for E5. The Drive receipt link (`publishDataset.ts:144-145`) is the remaining `?url=` Drive link, if R5 wants to note or change it.
- **R4 (HF access):**
  - G9 changes `fetchHuggingFaceDatasetRequest`, which G10's HF masks now reach through `downloadRemoteFile`, as images already do.
  - E14 (`fetchWithTimeout` errors) reaches Drive's `read` and upload `fetchImpl`. Drive maps unknown errors to its generic retryable message, so nothing depends on the error type.
  - G14 may edit `DatasetAccountButtons.tsx` (E15 here; different branch) and the URL dialog or its tests (E5 here: `UrlInputModal.test.tsx`).
  - G4 here changes `hubClient.ts`, which R4 does not own.
- **R2 (URL load):** E10 deliberately avoids `src/hooks/useUrlLoader.ts`. G10 edits `src/utils/urlImageFiles.ts`, moving only the constant.
- **R1:** no shared files.
- **`scripts/deployment/tests/artifacts.spec.ts`** (E5) runs in `deploy.yml` before deploying. If R5's E3 edits deploy workflows, this test file is not involved, but both land in the deploy gate.
