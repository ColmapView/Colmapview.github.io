# R3: publishing and Google Drive fixes (implementation spec)

Repo: `C:/Users/HEQ/Projects/colmap_webview/colmap-webview`, branch `fix/load-path-review-findings`, head `15f1b69`.
Scope: review findings C1, C2, C3, D2, D4, D5, D6 from `v0.15.4..0a1d01c`. All Drive and publishing code came from commit `5af7c3a`.
None of the items was fixed between `0a1d01c` and `HEAD`.

## Verdict summary

| Item | Real? | Severity | Files to change |
|---|---|---|---|
| C1 unknown splat size 0 is treated as exact | **Yes** (regression from `5af7c3a`) | High: every HF publication with an unsized lazy tile fails on every retry. The Drive path has the same check. | `features/datasetPublishing/preparePublication.ts` |
| C2 Drive mask probe aborts on 403/429/5xx | **Yes**, and broader than reported | High: **every** S3 dataset without ListBucket fails Drive publication, even with no masks, because `maskUrlBase` always defaults to `masks/` | `features/googleDrive/prepareArchive.ts` |
| C3 same-tab Drive link discards the scene | **Yes** | Medium (data loss of edits) | `components/viewer3d/GoogleDrivePublishButton.tsx`, plus a new helper and a new facade with its test |
| D2 `/u/N/` Drive links rejected as "folder link" | **Yes** | Low/Medium | `utils/googleDriveUrl.ts` |
| D4 private HF source shows "connection expired" | **Yes**. Hub answers 401 to the **anonymous** revision read (checked live). | Medium (misleading loop: reconnecting cannot help) | `features/huggingface/hubClient.ts` |
| D5 Drive controller retains PublicationInput | **Yes**. GC probe confirms retention after completion and after invalidation. | Medium (whole previous dataset pinned) | `features/googleDrive/publishDataset.ts` |
| D6 >128 MiB remote mask gives generic, retryable error | **Yes** | Low/Medium | `utils/publishedViewerState.ts`, `features/googleDrive/{upload,prepareArchive,publishDataset}.ts` |

### How this was validated (nothing in the repo was edited)

- The baseline focused suites pass on HEAD: 21 files and 376 tests in `src/features/{googleDrive,datasetPublishing,huggingface}`, `utils/googleDriveUrl.test.ts`, `GoogleDrivePublishButton.test.tsx` and `UrlInputModal.test.tsx`.
- I ran a scratch vitest harness outside the repo at `scratchpad/probe/`. It has its own `vitest.config.mts` (jsdom, React plugin, the repo `src/test/setup.ts`) and a `node_modules` junction to the repo.
  - Every fix below was applied to **copies** of the modules (`probe/src/patched/*`). Each test below was run against both the patched and the original modules.
  - Patched: 11 files and **128 tests pass**. That count includes the repo's existing tests for `preparePublication`, `prepareArchive`, Drive `publishDataset`, `hubClient`, `googleDriveUrl` and `GoogleDrivePublishButton`, re-pointed at the patches.
  - Original modules: **exactly the 25 new tests fail**, for the reasons described in each item.
  - `tsc` passed with `tsconfig.app.json` settings (strict, `erasableSyntaxOnly`, `noUnusedLocals`), and ESLint passed with the repo `eslint.config.js`. Both checks cover every patched module and probe test (0 findings).
- Unified diffs of the validated patches, with repo-relative imports, are in `scratchpad/probe/diffs/*.diff`. The test code below is the validated probe code with its imports rewritten to repo-relative paths.

Project rules that apply here:
- Store access goes through `*StoreFacade` modules, and each facade has a colocated test, which `componentStoreBoundary.test.ts:161-178` enforces.
- No CSS changes.
- No `AbortSignal.any`. `boundedFetch` already uses `anySignal`.
- Comments are brief "why" comments.
- External links use `target="_blank"`.

---

## C1: the catalog's "unknown size" 0 becomes an exact 0-byte asset

### Verified

`src/features/datasetPublishing/preparePublication.ts:184-196`:
```ts
for (const source of publicationSplats(captured)) {
  if (input.splats === 'active' && source.id !== input.activeSplatId) continue;
  const path = `splats/${publicationPath(source.path)}`;
  if (source.file?.size) add(fixed(path, source.file, 'splat'));
  else if (source.url) {
    const asset = await remote(source.url, path, 'splat');
    asset.size = source.size ?? null;          // :190  0 survives `??`
    add(asset);
  }
```
`git diff v0.15.4..0a1d01c` shows that `5af7c3a` added `:190`. Before that, the branch was `add(await remote(source.url, path, 'splat'))`, and `remote()` (`:106-111`) returns `size: null`.

The catalog stores 0 for an unknown size:
- `src/hooks/urlLoaderManifestFetch.ts:540-544`, directory discovery: `const size = await getRemoteFileContentLength(...); ... size: size ?? 0`.
- `:670-671`, manifest `splats`: `{ path, size: size ?? 0, splatCount }`. The size is null when HEAD is blocked or 405, when CORS fails, or when there is no Content-Length.
- `src/utils/splatFileSourcePolicy.ts:165` copies it verbatim into `SplatFileSource.size`.

Everywhere else, 0 means unknown:
- `urlLoaderPolicy.ts:659`: `!source.size || source.size <= 0` gives an unknown estimate.
- `splatPickerViewModel.ts:54-56`: `bytes <= 0` gives no label.
- `reconstructionStore.ts:106` and `useUrlState.ts:90` use `source.size ?? 0` for budgets.

Downstream consumers of `asset.size` (all consumers of `source.size` within publishing):

| Site | Effect of `size === 0` |
|---|---|
| `preparePublication.ts:68` `if (asset.size !== null) checkAssetSize(...)` | 0 passes validation |
| `datasetPublishing/publishDataset.ts:111` `unbounded = asset.size === null && asset.kind === 'splat'` | false, so the tile is not isolated |
| `:112` batch break test `bytes + asset.size > MAX` | 0 never breaks, so the tile is "batched as small" |
| `:116-118` `content = await asset.open(signal)` … `if (asset.size !== null && content.size !== asset.size) throw new HfError('The size of ${path} changed. Start a new publication.')` | Full download, then a throw. Retrying re-opens and throws again (`canRetry` is `job !== null`). |
| `googleDrive/prepareArchive.ts:24` pre-check sum `asset.size ?? 0` | Unaffected (it contributes 0 either way) |
| `googleDrive/prepareArchive.ts:48-50` `asset.size !== null && asset.size !== blob.size` | Throws "The source file splats/x changed. Publish again." This is the same bug on the Drive path. |
| `publicationVerification.ts:28`, `publishDataset.ts:39,74` | Use the opened `content.size` and inventory, so they are unaffected |

Reproduced in the probe on current code:
- HF: the controller ends `failed` with `"The size of splats/tile.ply changed. Start a new publication."`.
- Drive: `"The source file splats/tile.ply changed. Publish again."`.

Lazy tiles hit the HF path because HF publishes **all** catalog tiles (`splats: 'all'`). Drive packages only the active tile, which is usually downloaded (`file` set). Drive therefore hits this only for a byte-less active tile (touch devices) with an unknown size.

### Root cause
At the publishing boundary, `??` treats the catalog's sentinel 0 as a real byte count. The publisher then uses `asset.size` as an **exact** expected size for both batching and change detection.

### Fix (code)
Keep the catalog's 0. Convert it at the boundary. This keeps positive sizes, which the Drive 2 GiB pre-check needs (see the existing test "rejects a catalogued oversized active remote splat before any download").
```diff
--- a/src/features/datasetPublishing/preparePublication.ts
+++ b/src/features/datasetPublishing/preparePublication.ts
@@ -187,7 +187,8 @@
     if (source.file?.size) add(fixed(path, source.file, 'splat'));
     else if (source.url) {
       const asset = await remote(source.url, path, 'splat');
-      asset.size = source.size ?? null;
+      // Discovery records an unknown size as 0; only a positive size is a byte count to verify.
+      asset.size = source.size !== undefined && source.size > 0 ? source.size : null;
       add(asset);
     }
```
With `null`, HF isolates the tile in its own batch (`unbounded`) and skips the equality check, which is the pre-`5af7c3a` behavior. Drive downloads are still bounded by `maxAssetBytes: ARCHIVE_SIZE_LIMIT` and by the streaming ZIP total.

### Tests (code)
**`src/features/datasetPublishing/preparePublication.test.ts`**. Reuse the `input()` and `deps()` fixtures. Add `import { createPublicationController } from './publishDataset';` and `import type { HubClient } from '../huggingface/hubClient';`.
```ts
  const tileUrl = 'https://huggingface.co/datasets/owner/source/resolve/main/tile.ply';
  it.each([[0, null], [undefined, null], [42, 42]] as const)('treats a catalogued splat size of %s as %s bytes', async (size, expected) => {
    const source = input();
    source.dataset.loadedFiles!.splatFileSources = [{ id: 'tile', path: 'tile.ply', url: tileUrl, size }];
    const prepared = await preparePublication(source, new AbortController().signal, deps());
    expect(prepared.assets.find(asset => asset.kind === 'splat')!.size).toBe(expected);
  });

  it('publishes a lazy remote tile whose size discovery could not read', async () => {
    const source = input();
    source.dataset.loadedFiles!.splatFileSources = [{ id: 'tile', path: 'tile.ply', url: tileUrl, size: 0 }];
    vi.stubGlobal('fetch', vi.fn(async () => new Response('remote splat bytes')));
    let commit = 1;
    const client: HubClient = { create: vi.fn().mockResolvedValue('a'.repeat(40)), head: vi.fn(),
      upload: vi.fn().mockImplementation(async () => (++commit).toString(16).padStart(40, '0')),
      reconcile: vi.fn().mockResolvedValue(null), files: vi.fn(), resolveRevision: vi.fn() };
    const controller = createPublicationController(client, vi.fn().mockResolvedValue(undefined));
    await controller.publish('owner', { name: 'scene', title: 'Scene', description: '', license: 'cc0-1.0' },
      signal => preparePublication(source, signal, deps()));
    expect(controller.getSnapshot()).toMatchObject({ phase: 'completed', error: undefined });
    const batches = vi.mocked(client.upload).mock.calls.map(call => call[1].map(file => file.path));
    expect(batches).toContainEqual(['splats/tile.ply', 'colmapview-upload.json']);
  });
```
**`src/features/googleDrive/prepareArchive.test.ts`** (Drive regression). Add this inside the new `describe('Drive remote sources')` block shown under C2, which reuses `remoteInput`, `bucket` and `entries`:
```ts
  it('packages an active remote splat whose catalogued size is unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === bucket + 'tile.ply' ? new Response('splat bytes') : new Response(null, { status: 404 })));
    const source = remoteInput({ loadedFiles: buildLoadedFiles({ splatFileSources: [{ id: 'tile', path: 'tile.ply', url: bucket + 'tile.ply', size: 0 }] }) }, []);
    source.activeSplatId = 'tile';
    const archive = await prepareDriveArchive(source, new AbortController().signal, () => {}, () => {});
    expect(strFromU8((await entries(archive))['splats/tile.ply'])).toBe('splat bytes');
  });
```

### Risks
- A **positive** catalog size is still treated as exact.
  - HF tree sizes are exact. However, the tree is read at the revision the user loaded (e.g. `main`), while the publication pins the sha at publish time. If `main` moved in between, "changed" is the correct outcome, but "Start a new publication" will not help until the dataset is reloaded.
  - HEAD-derived sizes (directory listings and manifest `splats`) could be a compressed `Content-Length` if a host serves `.ply` with `Content-Encoding` on HEAD. The download would then mismatch, which is the same symptom. This is rare for binary files. The robust follow-up is to split `PublishAsset.size` into an exact size and a `sizeHint` used only for budgets and batching. That is out of scope here.
- No change to the catalog semantics, so the picker and auto-load are unaffected.

---

## C2: Drive mask probe aborts on the first non-404 failure

### Verified
`src/features/googleDrive/prepareArchive.ts:118-125` (`readRemoteMask`, non-HF hosts have `paths === null`):
```ts
for (const candidate of buildMaskUrlCandidates(base, name)) {
  if (paths && !paths.has(parseHfAssetUrl(candidate.url).path)) continue;
  const response = await fetchDatasetResource(await pinAssetUrl(candidate.url), undefined, { signal });
  if (response.status === 404) { await response.body?.cancel(); continue; }
  if (!response.ok) { await response.body?.cancel(); throw new GoogleDrivePublishError(`Could not read the mask for ${name}.`); }  // :122
  return readBoundedResponse(response, MAX_BUFFERED_PUBLICATION_FILE_BYTES);
}
```
- `maskUrlBase` **always** defaults to `<base>/masks/` for URL and manifest sources, even when the dataset has no masks: `src/hooks/urlLoaderPolicy.ts:744-751` (`const masksPath = manifest.masksPath ?? 'masks/'`).
- The candidate order is `[<img>, <img>.png]`: `src/utils/imageFileLookupPolicy.ts:187-207` (`const maskNames = [normalizedName, `${normalizedName}.png`]`).
- S3 with public GetObject but no `s3:ListBucket` answers a missing key with **403 AccessDenied**. The first probe `masks/photo.jpg` therefore throws, whether the real mask is `masks/photo.jpg.png` or the dataset has no masks at all.
- Reproduced in the probe on current code, in both cases: `GoogleDrivePublishError: Could not read the mask for photo.jpg.`
- No retry on 429 or 5xx: `fetchDatasetResource` (`utils/fetchDatasetResource.ts`) is `fetchWithTimeout` plus HF routing, with no retry.

The viewer's own mask loader is `src/utils/urlImageFiles.ts:95-131` (`fetchUrlMask`) together with `src/dataset/urlMediaScheduler.ts:123-156`:
```ts
// urlMediaScheduler.run: 404 → 'absent'; any other non-OK → { kind: 'failure', status } (403 included);
// 429 → per-origin cooldown honoring Retry-After (fallback min(30 s, 1 s·2^n)·jitter), up to 2 retries.
// fetchUrlMask loop (:109-126): on ANY non-success it continues to the next candidate;
if (result.kind !== 'absent') allAbsent = false;
failure ??= transferError(result, url);   // reported only after all candidates fail; the mask is just absent
```
So the viewer tolerates 403 (and any other failure) and moves on. It retries only 429.

A retrying fetch already exists: `src/features/huggingface/http.ts:23-39` `boundedFetch(signal, timeout, fetchImpl)`.
- It retries GET and HEAD on 429/502/503/504, up to 2 retries.
- It honors `Retry-After`, otherwise backs off at `500·2^n + jitter`, and uses `anySignal`.
- `downloadRemoteFile.ts:11` already wraps it around `fetchHuggingFaceDatasetRequest` with `timeout: null`.

### Root cause
The Drive copy of the mask lookup treats only 404 as "not this name". Hosts that hide existence (S3 and GCS without list permission) answer 403. It also performs a single attempt, so one transient 429 or 5xx fails the whole archive.

### Fix (code)
Mirror the viewer: 403 and 404 both mean "try the next name", and all-absent means no mask. Retry 429/502/503/504 through `boundedFetch`. After retries are exhausted, fail with a specific, retryable message rather than silently dropping a mask, which would publish an incomplete dataset. D6's change to the same lines is included here because they edit the same `return`.
```diff
--- a/src/features/googleDrive/prepareArchive.ts
+++ b/src/features/googleDrive/prepareArchive.ts
@@ -10,6 +10,7 @@
 import { buildMaskUrlCandidates } from '../../utils/imageFileLookupPolicy';
 import { awaitWithAbort } from '../../utils/awaitWithAbort';
 import { GoogleDrivePublishError } from './upload';
+import { boundedFetch } from '../huggingface/http';
@@ -78,6 +79,8 @@
   const sdk = await import('@huggingface/hub');
   const read: typeof fetch = (value, init) => fetchDatasetResource(typeof value === 'string' ? value : value instanceof URL ? value.href : value.url,
     undefined, { ...init, signal });
+  // Throttled or briefly unavailable hosts get the same bounded backoff as Hub reads (429/502/503/504).
+  const readMask = boundedFetch(signal, null, read);
@@ -117,10 +120,16 @@
     for (const candidate of buildMaskUrlCandidates(base, name)) {
       if (paths && !paths.has(parseHfAssetUrl(candidate.url).path)) continue;
-      const response = await fetchDatasetResource(await pinAssetUrl(candidate.url), undefined, { signal });
-      if (response.status === 404) { await response.body?.cancel(); continue; }
-      if (!response.ok) { await response.body?.cancel(); throw new GoogleDrivePublishError(`Could not read the mask for ${name}.`); }
-      return readBoundedResponse(response, MAX_BUFFERED_PUBLICATION_FILE_BYTES);
+      const response = await readMask(await pinAssetUrl(candidate.url));
+      // Like the viewer's mask loader, try the next name: S3 or GCS without list access answers a missing key with 403.
+      if (response.status === 404 || response.status === 403) { await response.body?.cancel(); continue; }
+      if (!response.ok) {
+        await response.body?.cancel();
+        throw new GoogleDrivePublishError(`Could not read the mask for ${name} (HTTP ${response.status}). Retry the publication.`);
+      }
+      return readBoundedResponse(response, MAX_BUFFERED_PUBLICATION_FILE_BYTES, () => new GoogleDrivePublishError(
+        `The mask for ${name} (${candidate.filename}) exceeds the 128 MiB publication limit for non-splat files. Shrink it in the source dataset, then publish again.`,
+        undefined, true));
     }
```
The `readBoundedResponse` third argument and the `GoogleDrivePublishError` third argument (`permanent`) come from D6. If C2 lands first, keep the old `return readBoundedResponse(response, MAX_BUFFERED_PUBLICATION_FILE_BYTES);` line.

With `timeout: null`, `boundedFetch` passes the publication `signal` through unchanged. `fetchDatasetResource` keeps its 30 s inactivity timeout and HF token routing.

### Tests (code)
In **`src/features/googleDrive/prepareArchive.test.ts`**, add a block. It reuses the file's builders (`buildReconstruction`, `buildCamera`, `buildImage`, `buildDatasetState`, `buildLoadedFiles`), `createIdentityEuler`, `unzipSync`/`strFromU8`, and the existing `vi.mock('../huggingface/auth')`.
```ts
describe('Drive remote sources', () => {
  const bucket = 'https://bucket.s3.amazonaws.com/scene/';
  const remoteInput = (dataset: Parameters<typeof buildDatasetState>[0], images = [buildImage({ name: 'photo.jpg' })]) => ({
    sourceKey: 'remote', modelRevision: 0, source: null, reconstruction: buildReconstruction({ cameras: [buildCamera()], images }),
    dataset: buildDatasetState({ sourceType: 'url', ...dataset }), activeSplatId: null as string | null,
    transform: createIdentityEuler(), splatTransform: createIdentityEuler(), config: {}, viewState: null,
    appVersion: 'test', viewerBaseUrl: 'https://viewer.example/' });
  const s3Input = () => remoteInput({ imageUrlBase: bucket + 'images/', maskUrlBase: bucket + 'masks/' });
  const entries = async (archive: { blob: Blob }) => unzipSync(new Uint8Array(await archive.blob.arrayBuffer()));
  const original = (url: string) => url === bucket + 'images/photo.jpg' ? new Response('original') : null;

  // (C1 test from above goes here)

  it('skips a forbidden mask name like the viewer, as S3 answers missing keys without ListBucket', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => original(url)
      ?? (url === bucket + 'masks/photo.jpg' ? new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 })
        : url === bucket + 'masks/photo.jpg.png' ? new Response('mask') : new Response(null, { status: 500 }))));
    const files = await entries(await prepareDriveArchive(s3Input(), new AbortController().signal, () => {}, () => {}));
    expect(strFromU8(files['images/photo.jpg'])).toBe('original');
    expect(strFromU8(files['masks/photo.jpg.png'])).toBe('mask');
  });
  it('publishes without a mask when every mask name is forbidden', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => original(url) ?? new Response(null, { status: 403 })));
    const files = await entries(await prepareDriveArchive(s3Input(), new AbortController().signal, () => {}, () => {}));
    expect(Object.keys(files).filter(path => path.startsWith('masks/'))).toEqual([]);
  });
  it.each([429, 503])('retries a %i mask response before packaging the mask', async status => {
    let limited = false;
    const request = vi.fn(async (url: string) => {
      if (original(url)) return original(url)!;
      if (url === bucket + 'masks/photo.jpg') return new Response(null, { status: 404 });
      if (!limited) { limited = true; return new Response(null, { status, headers: { 'Retry-After': '0' } }); }
      return new Response('mask');
    });
    vi.stubGlobal('fetch', request);
    const files = await entries(await prepareDriveArchive(s3Input(), new AbortController().signal, () => {}, () => {}));
    expect(strFromU8(files['masks/photo.jpg.png'])).toBe('mask');
    expect(request.mock.calls.filter(([url]) => url === bucket + 'masks/photo.jpg.png')).toHaveLength(2);
  });
  it('names the mask and status once retries are exhausted', async () => {
    const request = vi.fn(async (url: string) => original(url) ?? new Response(null, { status: 503, headers: { 'Retry-After': '0' } }));
    vi.stubGlobal('fetch', request);
    await expect(prepareDriveArchive(s3Input(), new AbortController().signal, () => {}, () => {}))
      .rejects.toMatchObject({ message: 'Could not read the mask for photo.jpg (HTTP 503). Retry the publication.', permanent: false });
    expect(request.mock.calls.filter(([url]) => url === bucket + 'masks/photo.jpg')).toHaveLength(3);
  });
  // (D6 test goes here)
});
```
- `Retry-After: '0'` keeps the backoff instant, so no fake timers are needed.
- `permanent: false` requires D6. Drop that property from the matcher if C2 lands alone.
- The existing test "copies private Hub images and masks using read authorization and a pinned revision" still passes with exactly 4 authorized GETs. This proves `boundedFetch` adds no requests on HF.

### Risks
- **Masks that exist but are genuinely forbidden** (403) are now silently omitted. That matches what the viewer shows, since the viewer cannot read them either.
- `boundedFetch` sets `credentials: 'omit'`.
  - Mask reads on a **same-origin** host previously sent cookies (the `fetch` default is `same-origin`). They now behave like the publication's image downloads, which already omit credentials (`downloadRemoteFile`).
  - Cross-origin hosts are unaffected.
  - The HF path already omits credentials (`datasetAccess.ts:16`).
- `boundedFetch` honors `Retry-After` without a cap (`http.ts:31-36`). A host returning `Retry-After: 3600` pauses preparation until then, and the user can cancel. The viewer's scheduler also honors server deadlines verbatim.
- 500 and 408 are not retried (`boundedFetch`'s list is 429/502/503/504). Those statuses still fail with the named, retryable message. Widening the list would affect every HF read and is out of scope.
- A network error (`TypeError`) or the 30 s inactivity timeout still propagates as the generic retryable Drive error. That is unchanged.

---

## C3: the toolbar Drive icon on Drive-disabled hosts navigates in the same tab

### Verified
`src/components/viewer3d/GoogleDrivePublishButton.tsx:16-19`:
```tsx
if (!isGoogleDriveEnabled()) return <a href={GOOGLE_DRIVE_ENABLED_ORIGIN} aria-label="Use Google Drive"
  className={getControlButtonClass(false, false)} {...getTooltipProps('Use Google Drive', 'left')}>
```
The link has no `target`, so it is a same-tab navigation from the viewer toolbar (`ViewerControlsToolbar.tsx:104`). The loaded scene, edits, transforms and pending deletions are lost, and there is no `beforeunload` guard unless a publication is running. The custom host gets no dataset.

Does the destination accept a dataset? Yes, it accepts both forms:
- Custom and preview builds use root base `/` (`scripts/deployment/profiles.mjs:96-97` `validateBase`).
- `App.tsx:74-117` decodes `#d=` share data (`decodeShareData`) and the legacy `?url=` (`:78`).
- `appStartupPolicy.ts:86-128` routes both through `runGuardedUrlLoad` and then `loadFromUrl`. An inline manifest goes through `loadFromManifest`.
- Precedents for the custom origin: the URL-modal hand-off uses `?url=` (`components/modals/urlInputModalViewModel.ts:118-130`), and the Drive receipt viewer link uses `?url=` (`googleDrive/publishDataset.ts:137-138`).

How share links are built:
- `utils/shareUrl.ts:26-44` `buildShareableUrl({ baseUrl, manifestUrlOrManifest, viewState, config })` is pure. It writes `#d=` (`utils/shareDataCodec.ts:130-205`, which supports a URL **or** an inline manifest).
- `hooks/useUrlState.ts:296-308` `generateShareableUrl` hard-wires `getShareBaseUrl(window.location, …)`, so it cannot target another origin. Reuse `buildShareableUrl` directly.

The share source is selected by `components/viewer3d/panels/sharePanelViewModel.ts:8-13` `getShareSource(sourceUrl, sourceManifest)`:
- URL, folder, archive and splat-URL loads set `sourceUrl` (`urlLoaderPolicy.ts:781-787`, `urlLoaderZipSource.ts:85`, `urlLoaderSplatSource.ts:99`).
- Inline-manifest loads set `sourceManifest` with `sourceUrl: null` (`:771-778`).
- Local drops set both to null (`fileDropzoneLocalSources.ts:96,148`).

Sibling same-tab links that break the `target="_blank"` rule:
- `components/dropzone/DatasetAccountButtons.tsx:149`
- `components/modals/UrlInputModal.tsx:146`

Both render only when no reconstruction is loaded (`DropZone.tsx:231,247`), so they cause no data loss.

### Root cause
The disabled-host affordance was written as a plain same-tab anchor to the origin root. It ignores both the open scene and the remote source the viewer already knows.

### Fix (code)
1. **New pure helper** `src/components/viewer3d/googleDriveHandoff.ts`. It uses `#d=` for both source kinds:
   - Only `#d=` can carry an inline manifest.
   - A fragment never reaches the custom host's server logs. This matters because a source URL can carry pre-signed query credentials that cannot be stripped.
   - It reuses the share-link encoder.
   - No view or config is carried, matching the URL-modal hand-off rule "never … unrelated viewer state".
```ts
import type { ColmapManifest } from '../../types/manifest';
import { buildShareableUrl } from '../../utils/shareUrl';

/**
 * The Drive host reopens a remote dataset from the same `#d=` payload a share link uses: it covers URL and
 * inline-manifest sources, and a fragment never reaches the host's server logs. Local files cannot travel.
 */
export function getGoogleDriveHandoffUrl(origin: string, source: string | ColmapManifest | null): string {
  if (!source) return origin;
  return buildShareableUrl({ baseUrl: new URL('/', origin).href, manifestUrlOrManifest: source, viewState: null, config: null });
}
```
2. **New facade** `src/components/viewer3d/useGoogleDrivePublishButtonStoreFacade.ts`:
```ts
import { useReconstructionStore } from '../../store';
import { getShareSource } from './panels/sharePanelViewModel';

/** The remote source another host can reopen; local drops have neither a URL nor a manifest. */
export function useGoogleDrivePublishButtonStoreFacade() {
  const sourceUrl = useReconstructionStore(state => state.sourceUrl);
  const sourceManifest = useReconstructionStore(state => state.sourceManifest);
  return { handoffSource: getShareSource(sourceUrl, sourceManifest) };
}
```
3. **Button**. Call the hook before the early returns:
```diff
--- a/src/components/viewer3d/GoogleDrivePublishButton.tsx
+++ b/src/components/viewer3d/GoogleDrivePublishButton.tsx
@@ -6,15 +6,20 @@
 import { ControlButton, type PanelType } from './ControlComponents';
 import { LazyToolModal } from './LazyToolModal';
 import { getControlButtonClass, getTooltipProps } from '../../theme';
+import { getGoogleDriveHandoffUrl } from './googleDriveHandoff';
+import { useGoogleDrivePublishButtonStoreFacade } from './useGoogleDrivePublishButtonStoreFacade';
 
 const loadPublisher = () => import('../modals/GoogleDrivePublishModal').then(module => ({ default: module.GoogleDrivePublishModal }));
 export const GoogleDrivePublishButton = memo(function GoogleDrivePublishButton({ activePanel, setActivePanel }: {
   activePanel: PanelType; setActivePanel: (panel: PanelType) => void;
 }) {
   const [isOpen, setIsOpen] = useState(false);
   const active = useDrivePublicationStatus(state => state.active);
-  if (!isGoogleDriveEnabled()) return <a href={GOOGLE_DRIVE_ENABLED_ORIGIN} aria-label="Use Google Drive"
-    className={getControlButtonClass(false, false)} {...getTooltipProps('Use Google Drive', 'left')}>
+  const { handoffSource } = useGoogleDrivePublishButtonStoreFacade();
+  // A new tab keeps this scene and its edits; a remote dataset reopens there.
+  if (!isGoogleDriveEnabled()) return <a href={getGoogleDriveHandoffUrl(GOOGLE_DRIVE_ENABLED_ORIGIN, handoffSource)}
+    target="_blank" rel="noopener noreferrer" aria-label="Use Google Drive" className={getControlButtonClass(false, false)}
+    {...getTooltipProps(handoffSource ? 'Open this dataset with Google Drive in a new tab' : 'Use Google Drive in a new tab', 'left')}>
     <GoogleDriveIcon className="w-5 h-5" />
   </a>;
```
4. **Optional, rule consistency.** Add `target="_blank" rel="noopener noreferrer"` to `DatasetAccountButtons.tsx:149` and to the `<a href={driveHandoffUrl}>` at `UrlInputModal.tsx:146`.

Not recommended: carrying the camera and config. If wanted later, compute `buildShareableUrl({ …, viewState: hasEdits ? null : currentViewState, config: hasEdits ? null : collectShareConfig() })` in an `onClick` handler, as `SharePanel.tsx:54-62` does. Computing it at render time would make the href stale.

### Tests (code)
**`src/components/viewer3d/GoogleDrivePublishButton.test.tsx`**:
- Keep the existing mocks (`isGoogleDriveEnabled`, `useControlButtonStoreFacade`, `LazyToolModal`). Add a facade mock, reset it in `beforeEach`, and add the imports below.
- Extend the existing disabled-host `it.each` with the two `target`/`rel` assertions.
- With the real store and no mock, the 7 existing tests also pass unchanged, because the source is null and the href stays `https://colmapview.opsiclear.com`.
```ts
import { decodeShareData } from '../../utils/shareDataCodec';
import type { ColmapManifest } from '../../types/manifest';

const facade = vi.hoisted(() => ({ handoffSource: null as string | object | null }));
vi.mock('./useGoogleDrivePublishButtonStoreFacade', () => ({ useGoogleDrivePublishButtonStoreFacade: () => facade }));
// beforeEach: facade.handoffSource = null;

// inside the existing 'links to Google Drive on $host …' it.each (rename: 'opens Google Drive on $host in a new tab, keeping this scene'):
    const link = screen.getByRole('link', { name: 'Use Google Drive' });
    expect(link).toHaveAttribute('href', 'https://colmapview.opsiclear.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

  it('hands a remote dataset URL to the Drive host', async () => {
    vi.mocked(isGoogleDriveEnabled).mockReturnValue(false);
    facade.handoffSource = 'https://huggingface.co/datasets/owner/scene/tree/main/sparse';
    render(<GoogleDrivePublishButton activePanel={null} setActivePanel={vi.fn()} />);
    const destination = new URL(screen.getByRole('link', { name: 'Use Google Drive' }).getAttribute('href')!);
    expect(destination.origin + destination.pathname + destination.search).toBe('https://colmapview.opsiclear.com/');
    expect((await decodeShareData(destination.hash))?.manifestUrl).toBe('https://huggingface.co/datasets/owner/scene/tree/main/sparse');
  });
  it('hands an inline manifest to the Drive host', async () => {
    vi.mocked(isGoogleDriveEnabled).mockReturnValue(false);
    const manifest: ColmapManifest = { version: 1, baseUrl: 'https://example.test/scene/',
      files: { cameras: 'sparse/0/cameras.bin', images: 'sparse/0/images.bin', points3D: 'sparse/0/points3D.bin' } };
    facade.handoffSource = manifest;
    render(<GoogleDrivePublishButton activePanel={null} setActivePanel={vi.fn()} />);
    const destination = new URL(screen.getByRole('link', { name: 'Use Google Drive' }).getAttribute('href')!);
    expect((await decodeShareData(destination.hash))?.manifest).toMatchObject(manifest);
  });
```
**New `src/components/viewer3d/useGoogleDrivePublishButtonStoreFacade.test.ts`** is required by `componentStoreBoundary.test.ts:161-178`. Its style follows `useHuggingFacePublishButtonStoreFacade.test.ts`:
```ts
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store';
import type { ColmapManifest } from '../../types/manifest';
import { useGoogleDrivePublishButtonStoreFacade } from './useGoogleDrivePublishButtonStoreFacade';

describe('useGoogleDrivePublishButtonStoreFacade', () => {
  beforeEach(() => useReconstructionStore.setState(useReconstructionStore.getInitialState(), true));

  it('offers only a remote source for the Drive hand-off', () => {
    const { result } = renderHook(() => useGoogleDrivePublishButtonStoreFacade());
    expect(result.current.handoffSource).toBeNull();
    act(() => useReconstructionStore.setState({ sourceUrl: 'https://example.test/scene/' }));
    expect(result.current.handoffSource).toBe('https://example.test/scene/');
    const manifest = { version: 1, baseUrl: 'https://example.test/scene/', files: { cameras: 'c.bin', images: 'i.bin', points3D: 'p.bin' } } as ColmapManifest;
    act(() => useReconstructionStore.setState({ sourceUrl: null, sourceManifest: manifest }));
    expect(result.current.handoffSource).toBe(manifest);
  });
});
```
Optional (step 4):
- `DatasetAccountButtons.test.tsx:159`: add `.toHaveAttribute('target', '_blank')`.
- `UrlInputModal.test.tsx:86`: add `expect(handoff).toHaveAttribute('target', '_blank')`.

### Risks
- The new tab reloads the **original** dataset. Data edits (deletions, applied edits) and unsaved transforms stay in the old tab and are not handed off.
  - This is acceptable now that nothing is lost.
  - The tooltip could say "(edits stay in this tab)".
- A `#d=` produced by a newer `/dev/` build is decoded by the tag-deployed custom host.
  - The flags used here (none, compressed, and wide lengths only for payloads over 64 KiB) are long-standing.
  - `?url=` for URL sources is a safe alternative. The destination accepts it, but it puts the source URL in server logs, and an inline manifest still needs `#d=`.
- A very large inline manifest (big `imageNameToPath`) makes a long href. Share links already have the same property.
- The deployment smoke test `scripts/deployment/tests/artifacts.spec.ts:145-149` checks only the URL-modal hand-off (`?url=`), which is unchanged.

---

## D2: account-scoped (`/u/N/`) Drive links rejected as "folder link"

### Verified
`src/utils/googleDriveUrl.ts:15-24`:
```ts
const pathId = /^\/file\/d\/([A-Za-z0-9_-]+)(?:\/(?:view|preview|edit))?\/?$/.exec(url.pathname)?.[1];
const queryIds = url.searchParams.getAll('id');
const queryId = ['/', '/open', '/uc'].includes(url.pathname) && queryIds.length === 1 ? queryIds[0] : undefined;
...
throw new Error('Paste a Google Drive file link to a ZIP or TAR archive rather than a folder link. For a private archive, use the Google Drive picker.');
```
- `https://drive.google.com/file/u/0/d/<ID>/view` has path `/file/u/0/d/<ID>/view`, which matches neither branch, so it throws the folder message.
- `https://drive.google.com/u/0/uc?id=<ID>&export=download` has path `/u/0/uc`, which is not in `['/', '/open', '/uc']`, so it throws the folder message.

All 9 new tests below fail on HEAD. Consumers:
- `hooks/useUrlLoader.ts:202` (load).
- `components/modals/urlInputModalViewModel.ts:122` (the hand-off on disabled hosts; currently it returns null for these links, so no hand-off is offered).

Forms handled today:
- `/file/d/<id>[/view|/preview|/edit][/]`
- `/`, `/open` and `/uc` with exactly one `?id=`
- `resourcekey`

Other parameters (`usp`, `authuser`, `export`, `confirm`, `access_token`) are discarded by canonicalization.

Forms not handled (optional follow-ups, not required by the finding):
- `drive.usercontent.google.com/download?id=<id>&export=download[&authuser&confirm&uuid&at]`, the current browser download host. It returns `null` today and falls through to generic loaders.
- Legacy Workspace links `/a/<domain>/file/d/<id>/view` and `/a/<domain>/open?id=`.
- `docs.google.com/uc?id=`.

### Root cause
The path patterns are anchored to account-less paths. Google inserts `/u/<n>/` when several accounts are signed in. Every unmatched Drive URL then falls into the single "folder" error.

### Fix (code)
```diff
--- a/src/utils/googleDriveUrl.ts
+++ b/src/utils/googleDriveUrl.ts
@@ -12,15 +12,19 @@
   if (url.protocol !== 'https:' || url.username || url.password || url.port) {
     throw new Error('Use an HTTPS Google Drive file sharing link.');
   }
-  const pathId = /^\/file\/d\/([A-Za-z0-9_-]+)(?:\/(?:view|preview|edit))?\/?$/.exec(url.pathname)?.[1];
+  // Multi-account links add /u/<n>/ ("/u/0/uc?id=…", "/file/u/0/d/<id>/view"); it picks a signed-in account, not a file.
+  const path = url.pathname.replace(/^\/u\/\d+(?=\/)/, '').replace(/^\/file\/u\/\d+\/d\//, '/file/d/');
+  const pathId = /^\/file\/d\/([A-Za-z0-9_-]+)(?:\/(?:view|preview|edit))?\/?$/.exec(path)?.[1];
   const queryIds = url.searchParams.getAll('id');
-  const queryId = ['/', '/open', '/uc'].includes(url.pathname) && queryIds.length === 1 ? queryIds[0] : undefined;
+  const queryId = ['/', '/open', '/uc'].includes(path) && queryIds.length === 1 ? queryIds[0] : undefined;
   const fileId = pathId ?? queryId;
   const keys = url.searchParams.getAll('resourcekey');
   if (!fileId || !/^[A-Za-z0-9_-]{1,200}$/.test(fileId) || queryIds.length > 1
     || (pathId && queryIds.length && queryIds[0] !== pathId)
     || keys.length > 1 || (keys.length && !/^[A-Za-z0-9_-]{1,200}$/.test(keys[0]))) {
-    throw new Error('Paste a Google Drive file link to a ZIP or TAR archive rather than a folder link. For a private archive, use the Google Drive picker.');
+    throw new Error(/\/folders\//.test(path)
+      ? 'Paste a Google Drive file link to a ZIP or TAR archive rather than a folder link. For a private archive, use the Google Drive picker.'
+      : 'Paste a Google Drive file sharing link to a ZIP or TAR archive, such as https://drive.google.com/file/d/FILE_ID/view.');
   }
```
- Folder links (`/drive/folders/…`, `/drive/u/0/folders/…`, `/u/0/drive/folders/…`) keep the folder message.
- `useUrlLoader.test.ts:283-303` ('folder' case) still expects `'folder link'` and passes.

### Tests (code)
In **`src/utils/googleDriveUrl.test.ts`**, add the following in the same style:
```ts
describe('Google Drive multi-account links', () => {
  it.each([
    'https://drive.google.com/file/u/0/d/file-id_123/view',
    'https://drive.google.com/file/u/1/d/file-id_123/view?usp=sharing',
    'https://drive.google.com/u/0/uc?id=file-id_123&export=download',
    'https://drive.google.com/u/2/open?id=file-id_123',
    'https://drive.google.com/u/0/file/d/file-id_123/view',
  ])('resolves the account-scoped link %s to the canonical sharing URL', value => {
    expect(parseGoogleDriveFileUrl(value)).toEqual({ fileId: 'file-id_123', resourceKey: undefined,
      sourceUrl: 'https://drive.google.com/file/d/file-id_123/view' });
  });
  it('keeps resource keys on account-scoped links', () => {
    expect(parseGoogleDriveFileUrl('https://drive.google.com/file/u/0/d/file123/view?resourcekey=0-key&authuser=0'))
      .toEqual({ fileId: 'file123', resourceKey: '0-key', sourceUrl: 'https://drive.google.com/file/d/file123/view?resourcekey=0-key' });
  });
  it.each(['https://drive.google.com/drive/u/0/folders/folder123', 'https://drive.google.com/u/0/drive/folders/folder123'])(
    'still explains that %s is a folder', value => {
      expect(() => parseGoogleDriveFileUrl(value)).toThrow('rather than a folder link');
    });
  it.each(['https://drive.google.com/u/x/uc?id=a', 'https://drive.google.com/file/u/0/d/a/view?id=b', 'https://drive.google.com/drive/my-drive'])(
    'rejects %s without calling it a folder', value => {
      expect(() => parseGoogleDriveFileUrl(value)).toThrow('Paste a Google Drive file sharing link');
    });
});
```
In **`src/components/modals/urlInputModalViewModel.test.ts`**, add the following next to 'hands off only the canonical Drive file and resource key':
```ts
  it('hands off an account-scoped Drive link in canonical form', () => {
    const destination = new URL(getUrlInputDriveHandoffUrl('https://drive.google.com/file/u/0/d/FILE_123/view?usp=sharing', false)!);
    expect(destination.origin).toBe('https://colmapview.opsiclear.com');
    expect(destination.searchParams.get('url')).toBe('https://drive.google.com/file/d/FILE_123/view');
  });
```

### Risks
- The behavior is purely additive. Canonicalization still drops `authuser`, so a link that worked only because of a specific signed-in account is resolved through the normal Drive API path (API key or picker OAuth), as before.
- Non-folder unrecognized links get new error text. No test or e2e asserts the old text for non-folder cases. Searching for `folder link` finds only `useUrlLoader.test.ts:301`, which is the folder case.

---

## D4: publishing a loaded private HF dataset says "connection expired"

### Verified
The call chain is:
1. `publicationRuntime.ts:31`
2. `preparePublication` → `media()` / `remote()` → `pin()` (`preparePublication.ts:91-97`)
3. `resolveSha` → `client.resolveRevision` (`features/huggingface/hubClient.ts:31-37`):
```ts
async resolveRevision(repoId, revision, signal) {
  const info = await (await sdk()).datasetInfo({ name: repoId, revision, additionalFields: ['sha'], fetch: boundedFetch(signal) });
  if (info.private || info.gated || info.name !== repoId || !/^[a-f0-9]{40,64}$/i.test(info.sha)) {
    throw new HfError('Publication requires a public, ungated Hugging Face dataset.');
  }
```
- The request is `GET https://huggingface.co/api/datasets/<owner>/<repo>/revision/<rev>?expand=…&expand=sha`. It has **no `accessToken`**, and `boundedFetch` forces `credentials: 'omit'` (`http.ts:29`). It is anonymous by design, so it is never a check of the user's connection.
- The Hub answers anonymous metadata reads of private or missing repos with **401**. I checked live with a missing repo: `/api/datasets/<nonexistent>/revision/main` returned `HTTP/1.1 401`, `X-Error-Message: Invalid username or password.`. The Python `huggingface_hub` client (`hf_raise_for_status`) treats such anonymous 401s as "repository not found or private" for this reason. I did not test a private repo live; the existing tests in `datasetAccess.test.ts:60-67` model the same 401/403/404 private answer.
- `@huggingface/hub@2.17.5` `createApiError` throws `HubApiError` with `statusCode = 401`. `errorStatus` (`http.ts:8-12`) reads `statusCode`.
- The HF controller's prepare failure (`datasetPublishing/publishDataset.ts:188-189`) then calls `publicationErrorMessage`, `http.ts:43`, which returns `'Your Hugging Face connection expired. Reconnect the same account, then retry.'`. Reconnecting cannot help.
- Probe on HEAD: 401 maps to "connection expired". 403 maps to "Hugging Face denied this operation…". 404 maps to "Publication could not finish. Check your connection…".

For contrast, Drive's `resolveRevision` (`prepareArchive.ts:79-89`) passes `fetch: read`, which goes through `fetchDatasetResource` and then `fetchHuggingFaceDatasetRequest`. That path authenticates private reads, and Drive deliberately supports private HF sources (existing test 'copies private Hub images and masks …').

### Root cause
`publicationErrorMessage` maps HTTP status to account-level messages. That is right for the **authenticated destination writes** (`create`/`upload` with the token). The same mapping is applied to the **anonymous source-policy read**, where a 401, 403 or 404 means "this source is not public", not "your session expired". The policy message at `:34` is never reached for private repos.

### Fix (code)
The correct behavior is to refuse, as intended: HF publication copies into a **public** repo, so private and gated sources stay excluded. Do this with a source-specific message and no status, so `publicationErrorMessage` shows it verbatim. Leave transient errors (429/5xx) untouched.
```diff
--- a/src/features/huggingface/hubClient.ts
+++ b/src/features/huggingface/hubClient.ts
@@ -19,6 +19,7 @@
 export const BATCH_RECEIPT_PATH = 'colmapview-upload.json';
 export const CREATION_MARKER_PATH = 'colmapview-publication.json';
+const PUBLIC_SOURCE_REQUIRED = 'Publication requires a public, ungated Hugging Face dataset.';
 export const commitTitle = (marker: string) => `ColmapView publication ${marker}`;
@@ -29,9 +30,14 @@
     async resolveRevision(repoId, revision, signal) {
-      const info = await (await sdk()).datasetInfo({ name: repoId, revision, additionalFields: ['sha'], fetch: boundedFetch(signal) });
+      const info = await (await sdk()).datasetInfo({ name: repoId, revision, additionalFields: ['sha'], fetch: boundedFetch(signal) })
+        .catch((error: unknown): never => {
+          // This read is anonymous: 401/403/404 mean a private, gated or missing source, never an expired connection.
+          if ([401, 403, 404].includes(errorStatus(error) ?? 0)) throw new HfError(`${PUBLIC_SOURCE_REQUIRED} This source dataset is private or no longer available.`);
+          throw error;
+        });
       if (info.private || info.gated || info.name !== repoId || !/^[a-f0-9]{40,64}$/i.test(info.sha)) {
-        throw new HfError('Publication requires a public, ungated Hugging Face dataset.');
+        throw new HfError(PUBLIC_SOURCE_REQUIRED);
       }
```
`client.files()` (anonymous mask listing) always runs after `resolveSha` for the same repo (`preparePublication.ts:100-105`), so it needs no change.

Optional UX follow-up, not required: warn before the form is filled. `datasetAccess.ts:8` `privateRepos` already knows which repos were read with the token. A small `isKnownPrivateHuggingFaceRepo(url)` export, surfaced through `usePublishDatasetStoreFacade`, could disable "Publish" with the same message, and could suggest Drive where it is enabled.

### Tests (code)
In **`src/features/huggingface/hubClient.test.ts`**, reuse the hoisted `sdk` mock and the `signal()` helper. Add `import { publicationErrorMessage } from './http';` (`HfError` is already imported).
```ts
  it.each([401, 403, 404])('explains an unreadable source (%i) instead of an expired connection', async status => {
    sdk.datasetInfo.mockRejectedValue(Object.assign(new Error('Repository not found'), { statusCode: status }));
    const error = await createHubClient(() => 'test-token').resolveRevision('owner/private', 'main', signal()).catch((value: unknown) => value);
    expect(publicationErrorMessage(error)).toBe('Publication requires a public, ungated Hugging Face dataset. This source dataset is private or no longer available.');
  });
  it('keeps transient metadata failures retryable', async () => {
    sdk.datasetInfo.mockRejectedValue(Object.assign(new Error('Busy'), { statusCode: 503 }));
    await expect(createHubClient(() => 'test-token').resolveRevision('owner/scene', 'main', signal())).rejects.toMatchObject({ statusCode: 503 });
  });
  it.each([{ private: true }, { gated: 'auto' }])('refuses a readable non-public source: %o', async flags => {
    sdk.datasetInfo.mockResolvedValue({ name: 'owner/scene', sha: 'c'.repeat(40), private: false, gated: false, ...flags });
    await expect(createHubClient(() => 'test-token').resolveRevision('owner/scene', 'main', signal())).rejects.toThrow('Publication requires a public, ungated Hugging Face dataset.');
  });
  it('pins a public source', async () => {
    sdk.datasetInfo.mockResolvedValue({ name: 'owner/scene', sha: 'c'.repeat(40), private: false, gated: false });
    await expect(createHubClient(() => 'test-token').resolveRevision('owner/scene', 'main', signal())).resolves.toBe('c'.repeat(40));
  });
```

### Risks
- A dataset that was deleted or renamed after loading also gets this message. "no longer available" covers it.
- An anonymous 403 from a WAF or abuse block would show the policy message instead of a generic one. This is rare, and better than "expired".
- There is no change to destination-write status mapping (`create`/`upload`/`reconcile` keep `publicationErrorMessage`).

---

## D5: the Drive controller retains the previous dataset's PublicationInput

### Verified
- `src/features/googleDrive/publicationRuntime.ts:31-35`:
```ts
const input = capturePublicationInput();
const assertCurrent = () => assertPublicationInputCurrent(input);
return drivePublication.publish(name, shared, (signal, progress) => prepareDriveArchive(input, signal, progress, assertCurrent), assertCurrent);
```
  Both closures capture `input`. Its contents (`publicationSnapshot.ts:20-35`) are `reconstruction`, the WASM `source` snapshot, `dataset.loadedFiles` (all image and splat `File`s), `config`, `viewState` and `preview`.
- `src/features/googleDrive/publishDataset.ts`:
  - `:27-30`: `Job` holds `prepare` and `assertCurrent`.
  - `:158`: `publish` stores them.
  - On completion (`:139-141`), only `current.archive = undefined`, and `job` stays.
  - On invalidation (`:164`), `job.invalid = true; cancel(); job.archive = undefined; set({ canRetry: false })`, and `job` stays. `run()` never runs again (`:40` `job.invalid`).
  - Either way, the job and its closures, and therefore the whole previous dataset, stay reachable from the module-level singleton `drivePublication` until the next `publish()` or `reset()`.
- GC probe (WeakRef plus forced GC) on HEAD: the dataset is **not collected** after completion, and not after invalidating a failed job.

### Root cause
The controller drops only the ZIP. The closures that hold the captured input live on the `Job` for the controller's lifetime, even after the job can no longer run.

### Fix (code)
Release the closures and the ZIP on the `Job` object itself, not only by dropping `job`, so nothing that still references the job (an XHR progress closure, a test mock) can pin the dataset. This hunk also contains D6's `permanent` handling, because it sits in the same `catch`.
```diff
--- a/src/features/googleDrive/publishDataset.ts
+++ b/src/features/googleDrive/publishDataset.ts
@@ -28,6 +28,13 @@
   name: string; shared: boolean; operationId: string; prepare: PrepareArchive; assertCurrent: () => void;
   archive?: DriveArchive; ownerId?: string; fileId?: string; sessionUrl?: string; invalid: boolean;
 }
+const staleDataset = () => new GoogleDrivePublishError('The dataset changed. Start a new Drive publication.');
+/** A finished or stale job keeps only its Drive bookkeeping; its closures held the previous dataset. */
+function release(target: Job): void {
+  target.archive = undefined;
+  target.prepare = async () => { throw staleDataset(); };
+  target.assertCurrent = () => { throw staleDataset(); };
+}
@@ -138,15 +145,19 @@
       update({ phase: 'completed', message: 'Dataset saved to Google Drive.', canRetry: false, fileUrl: driveUrl,
         receipt: { fileId: current.fileId, driveUrl, viewerUrl: viewerUrl.href, shared: current.shared } });
-      current.archive = undefined;
+      release(current);
     } catch (error) {
+      const permanent = !signal.aborted && error instanceof GoogleDrivePublishError && error.permanent;
       if (current === job) {
         const cancelled = signal.aborted;
         set({ phase: cancelled ? 'cancelled' : 'failed', message: cancelled
           ? current.invalid ? 'The dataset changed. Start a new Drive publication.' : 'Upload cancelled. Completed files may remain in Drive.'
           : 'Drive publication could not finish.', error: cancelled ? undefined : drivePublicationErrorMessage(error),
-          canRetry: !current.invalid });
+          canRetry: !current.invalid && !permanent });
+        // A size limit fails the same way on every retry: end the job, which also releases its dataset.
+        if (permanent) job = null;
       }
+      if (current.invalid) release(current);
     } finally { if (active === controller) active = null; }
@@ -161,7 +172,7 @@
-    invalidate() { if (job) { job.invalid = true; cancel(); job.archive = undefined; set({ canRetry: false }); } },
+    invalidate() { if (job) { job.invalid = true; cancel(); release(job); set({ canRetry: false }); } },
```
- `if (current.invalid) release(current)` in `catch` also covers a ZIP that **finishes after** invalidation. `:66` would attach it to the job, and then `check()` throws. That path is tested below.
- Without D6, delete the `permanent` lines. `GoogleDrivePublishError` gets `permanent` in D6.
- After completion, `retry()` already returns early (`state.phase === 'completed'`). After invalidation, it returns early on `job.invalid`. The replaced closures are therefore never called. The throwing stand-ins make any future misuse loud.

### Tests (code)
In **`src/features/googleDrive/publishDataset.test.ts`**, reuse `fixture()`.
- Add `import { setFlagsFromString } from 'node:v8'; import { runInNewContext } from 'node:vm';`.
- This is the jest-leak-detector technique. The probe ran it under vitest 4.0.17 (jsdom, forks) on Node 24.
- The closures passed to `publish` are the only references to a stand-in input. Use plain functions, not `vi.fn`, because mocks record their arguments.
```ts
/** Force collection: V8 keeps WeakRef targets alive until the current task ends. */
async function collected(ref: WeakRef<object>): Promise<boolean> {
  setFlagsFromString('--expose-gc');
  const gc = runInNewContext('gc') as () => void;
  for (let attempt = 0; attempt < 10 && ref.deref(); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 0));
    gc();
  }
  return ref.deref() === undefined;
}
/** Publishes with closures that are the only references to a stand-in for the captured PublicationInput. */
function publishTracked(controller: ReturnType<typeof fixture>['controller'], prepare: (signal: AbortSignal) => Promise<unknown>) {
  let ref!: WeakRef<object>;
  const attempt = (() => {
    const input = { reconstruction: new Uint8Array(1024) };
    ref = new WeakRef(input);
    return controller.publish('scene', false, async signal => { void input; return await prepare(signal) as never; }, () => { void input; });
  })();
  return { attempt, ref };
}

describe('Drive publication memory', () => {
  it('releases the published dataset once the upload completes', async () => {
    const { controller, blob } = fixture();
    const { attempt, ref } = publishTracked(controller, async () => ({ blob, md5: 'fixture-md5', viewerBaseUrl: 'https://viewer.example/latest/' }));
    await attempt;
    expect(controller.getSnapshot().phase).toBe('completed');
    expect(await collected(ref)).toBe(true);
  });
  it('releases a failed publication’s dataset when the dataset changes, and never retries it', async () => {
    const { controller, client, blob } = fixture();
    client.chunk.mockRejectedValueOnce(new GoogleDrivePublishError('Interrupted'));
    const { attempt, ref } = publishTracked(controller, async () => ({ blob, md5: 'fixture-md5', viewerBaseUrl: 'https://viewer.example/latest/' }));
    await attempt;
    controller.invalidate();
    await controller.retry();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: false });
    expect(client.chunk).toHaveBeenCalledOnce();
    expect(await collected(ref)).toBe(true);
  });
  it('drops a ZIP that finishes preparing after the dataset changed', async () => {
    const { controller, client } = fixture();
    let finish!: () => void;
    let late!: WeakRef<object>;
    const { attempt, ref } = publishTracked(controller, () => new Promise(resolve => {
      finish = () => { const blob = new Blob(['late']); late = new WeakRef(blob); resolve({ blob, md5: 'md5', viewerBaseUrl: 'https://viewer.example/' }); };
    }));
    controller.invalidate();
    finish();
    // The resolver would otherwise keep the settled promise, and so the ZIP, reachable from this test.
    finish = () => {};
    await attempt;
    expect(controller.getSnapshot()).toMatchObject({ phase: 'cancelled', canRetry: false });
    expect(client.owner).not.toHaveBeenCalled();
    expect(await collected(ref)).toBe(true);
    expect(await collected(late)).toBe(true);
  });
});
```
The D6 controller test below also asserts collection.

### Risks
- **GC-based tests** depend on V8's behavior. They pass reliably in the probe with the 10-yield loop. If CI ever flakes, keep the behavioral assertions (`canRetry`, no `owner()` call) and skip only the `collected` lines on the affected runner.
- The real code has no other retention. The controller is a module singleton (`publicationRuntime.ts:9`), so a released job is the only fix needed.
- Related, out of scope: the **HF** controller keeps `job.prepared` after `invalidate()` while it is not running (`datasetPublishing/publishDataset.ts:198-203`) until `retry()` or `reset()`. Its retry path needs only `repoId` and `pending.{parent,marker,receipt}`, so `prepared` could be dropped the same way.

---

## D6: a remote mask over 128 MiB gives a generic, retryable error

### Verified
- The bounded read is at `src/features/googleDrive/prepareArchive.ts:123`: `return readBoundedResponse(response, MAX_BUFFERED_PUBLICATION_FILE_BYTES);`, where `types.ts:4` sets the limit to 128 MiB.
- `src/utils/publishedViewerState.ts:102-130` throws a **plain** `Error('File exceeds the supported size.')` at `:107` (declared `content-length`), `:111` (no body) and `:122` (streamed overflow).
- The error is mapped at `src/features/googleDrive/publishDataset.ts:13-16`. Anything that is not a `GoogleDrivePublishError` or `HfError` becomes `'Drive publication could not finish. Check your connection and retry in this tab.'`.
- `:145-148` sets `canRetry: !current.invalid`, so the error is retryable. A retry re-runs `prepare` (the `archive` is unset) and fails the same way.
- Probe on HEAD: `Error: File exceeds the supported size.`
- For contrast, the HF path uses listing sizes and `checkAssetSize` (`preparePublication.ts:48-53`), which gives a specific `HfError` at prepare time.

### Root cause
The Drive-only mask read uses the generic bounded reader. Its overflow error carries neither the file nor the limit, and nothing marks it as non-retryable.

### Fix (code)
1. Add an optional error factory to `readBoundedResponse`. The default is unchanged for the other callers (`publicationVerification.ts:17`, `upload.ts:107`, `hubClient.ts:29`, `urlLoaderViewerState.ts:127,155`). No test asserts the old text.
```diff
--- a/src/utils/publishedViewerState.ts
+++ b/src/utils/publishedViewerState.ts
@@ -99,16 +99,18 @@
-export async function readBoundedResponse(response: Response, maxBytes: number): Promise<Blob> {
+/** `tooLarge` lets a caller name the file and its limit instead of the generic message. */
+export async function readBoundedResponse(response: Response, maxBytes: number,
+  tooLarge: () => Error = () => new Error('File exceeds the supported size.')): Promise<Blob> {
   if (!response.ok) throw new Error(`File request failed (${response.status})`);
   const declared = Number(response.headers.get('content-length'));
   if (declared > maxBytes) {
     await response.body?.cancel();
-    throw new Error('File exceeds the supported size.');
+    throw tooLarge();
   }
   if (!response.body) {
     const blob = await response.blob();
-    if (blob.size > maxBytes) throw new Error('File exceeds the supported size.');
+    if (blob.size > maxBytes) throw tooLarge();
     return blob;
   }
@@ -119,7 +121,7 @@
-      if (size > maxBytes) throw new Error('File exceeds the supported size.');
+      if (size > maxBytes) throw tooLarge();
```
2. Add a `permanent` flag to the Drive error. There are no TS parameter properties, because of `erasableSyntaxOnly`.
```diff
--- a/src/features/googleDrive/upload.ts
+++ b/src/features/googleDrive/upload.ts
@@ -5,7 +5,11 @@
 export class GoogleDrivePublishError extends Error {
   readonly status?: number;
-  constructor(message: string, status?: number) { super(message); this.name = 'GoogleDrivePublishError'; this.status = status; }
+  /** Retrying cannot succeed, e.g. a file over a size limit; the dataset itself must change. */
+  readonly permanent: boolean;
+  constructor(message: string, status?: number, permanent = false) {
+    super(message); this.name = 'GoogleDrivePublishError'; this.status = status; this.permanent = permanent;
+  }
 }
```
3. Change `prepareArchive.ts`:
   - The mask read passes `() => new GoogleDrivePublishError('The mask for ${name} (${candidate.filename}) exceeds the 128 MiB publication limit for non-splat files. Shrink it in the source dataset, then publish again.', undefined, true)`. This is already in the C2 diff.
   - Recommended for consistency: mark the deterministic 2 GiB ZIP limit permanent as well, at `prepareArchive.ts:23`: `new GoogleDrivePublishError('The dataset ZIP exceeds the viewer’s 2 GiB archive limit. Use a smaller dataset or splat.', undefined, true)`.
4. In the controller, a permanent failure sets `canRetry: false` and ends the job (`job = null`). See the D5 diff. The modal (`GoogleDrivePublishModal.tsx:86-94`) then hides "Check upload and retry", and "Start a new publication" still resets. `drivePublicationErrorMessage` already shows `GoogleDrivePublishError` text verbatim.

### Tests (code)
In **`src/features/googleDrive/prepareArchive.test.ts`**, add this to the `describe('Drive remote sources')` block from C2:
```ts
  it('names an oversized mask and the limit, and does not offer a retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => original(url)
      ?? (url === bucket + 'masks/photo.jpg.png'
        ? new Response('mask', { headers: { 'content-length': String(128 * 1024 * 1024 + 1) } })
        : new Response(null, { status: 404 }))));
    await expect(prepareDriveArchive(s3Input(), new AbortController().signal, () => {}, () => {})).rejects.toMatchObject({
      message: 'The mask for photo.jpg (photo.jpg.png) exceeds the 128 MiB publication limit for non-splat files. Shrink it in the source dataset, then publish again.',
      permanent: true });
  });
```
The `content-length` header triggers the declared-size path without allocating 128 MiB.

In **`src/features/googleDrive/publishDataset.test.ts`**, add this to the `describe('Drive publication memory')` block from D5:
```ts
  it('ends a publication that failed a size limit instead of offering a retry', async () => {
    const { controller, client } = fixture();
    const limit = new GoogleDrivePublishError('The mask for photo.jpg exceeds the 128 MiB publication limit for non-splat files.', undefined, true);
    const { attempt, ref } = publishTracked(controller, async () => { throw limit; });
    await attempt;
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: false, error: limit.message });
    await controller.retry();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', canRetry: false, error: limit.message });
    expect(client.owner).not.toHaveBeenCalled();
    expect(await collected(ref)).toBe(true);
  });
```

### Risks
- Only `GoogleDrivePublishError` carries `permanent`. Two deterministic `HfError` limits stay retryable in Drive, and in the HF upload phase:
  - `downloadRemoteFile.ts:9`, for images over 128 MiB or a splat over 2 GiB.
  - `preparePublication.ts:50-52` (`checkAssetSize`).

  Their messages are specific, but they still offer a pointless retry. The follow-up is to give `HfError` the same flag and honor it in both controllers.
- The message hard-codes "128 MiB", which matches `checkAssetSize`'s existing wording. It must be updated if `MAX_BUFFERED_PUBLICATION_FILE_BYTES` changes, and the same is true of the existing message.

---

## Recommended task grouping

| Task | Items | Files | Depends on | Tests |
|---|---|---|---|---|
| **T1: publication source correctness** | C1, D4 | `datasetPublishing/preparePublication.ts`, `huggingface/hubClient.ts` | none | `preparePublication.test.ts` (C1 unit and HF integration), `hubClient.test.ts` (D4) |
| **T2: Drive archive and controller robustness** | C2, D6, D5, plus the C1 Drive regression test | `googleDrive/prepareArchive.ts`, `googleDrive/upload.ts`, `utils/publishedViewerState.ts`, `googleDrive/publishDataset.ts` | **after T1**, because its C1 Drive regression test needs T1's fix | `prepareArchive.test.ts` (new `Drive remote sources` block: C1, C2, D6), `googleDrive/publishDataset.test.ts` (D5 and D6 `memory` block) |
| **T3: Drive links and hand-off** | C3, D2, plus optional sibling `target="_blank"` links | `components/viewer3d/GoogleDrivePublishButton.tsx`, new `googleDriveHandoff.ts`, new `useGoogleDrivePublishButtonStoreFacade.ts` (+ test), `utils/googleDriveUrl.ts`, optionally `DatasetAccountButtons.tsx` and `UrlInputModal.tsx` | none; can run in parallel with T1 | `GoogleDrivePublishButton.test.tsx`, the new facade test, `googleDriveUrl.test.ts`, `urlInputModalViewModel.test.ts` |

Ordering notes:
- Within T2, apply D6's `upload.ts` and `publishedViewerState.ts` changes before the C2 and D5 hunks, because both reference `permanent` and `tooLarge`. D5 and D6 edit the same `catch` block, so implement them together.
- After each task, run the focused suites:
  - `npx vitest run src/features/googleDrive src/features/datasetPublishing src/features/huggingface src/utils/googleDriveUrl.test.ts src/components/viewer3d src/components/modals src/components/dropzone src/components/componentStoreBoundary.test.ts`
  - Then `npx tsc -b --force` and `npm run lint`.
  - Before pushing, run the full `vitest run`, per project memory.

The validated probe sources for copy and paste are `scratchpad/probe/src/patched/*` and `scratchpad/probe/src/*.patched.test.ts(x)`. Their diffs are in `scratchpad/probe/diffs/`. In the C3 button diff there, the dynamic `import('…/GoogleDrivePublishModal')` keeps an absolute probe path; use the repo's `'../modals/GoogleDrivePublishModal'`.
