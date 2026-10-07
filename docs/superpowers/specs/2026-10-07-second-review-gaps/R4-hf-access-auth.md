# R4: Hugging Face access and auth — fix spec

**Findings:** G9, G14, E4, E11, E14, E16 (from `findings.md`). **Base:** `fix/second-review-gaps` at `e8a2a43`. Line numbers are at that commit.

**How this was checked**
- Two scratch copies of `src/` (+ `package.json`, `tsconfig*`, `vite.config.ts`, `viteLocalAliasPolicy.ts`, `eslint.config.js`, `public/hf-callback.*`) under `scratchpad/rev3/r4/`: `base` (HEAD + the new tests) and `fix` (HEAD + tests + fixes). Every test below was run in both. `RED` = fails on `base`, `GREEN` = passes on `fix`. Tests marked *guard* pass on both on purpose: they pin behaviour the fix could break.
- Full suite on `fix`: 4639 passed. The only failures (5 tests in `src/parsers/integrity.test.ts`, `transform_export.test.ts`, `src/splat/gaussianToolboxPackaging.test.ts`, `sogBundle.fixture.test.ts`) fail identically on `base`: the scratch copy has no `tests/` fixtures or `vendor/`. `tsc -p tsconfig.app.json`: clean. `tsc -p tsconfig.test.json`: only the same missing-fixture imports. `eslint` on every changed file: clean.
- The Hub's answers were checked live, read-only, with `curl` and `Origin: https://colmapview.github.io` (no browser automation, no credentials). Results are in the next section.

**Summary**

| Finding | Verdict | Fix in one line | Effort (impl / review) |
|---|---|---|---|
| G9 | Confirmed; reproduced with fake latency | Retry with the session only when the anonymous answer could be an access denial (`X-Error-Code`); ask all `colmapview.yaml` folders at once, nearest still decides | high / high |
| E11 | Confirmed | One message that names both cases; a gated repo is named as gated | low / low (ships with G9) |
| G14 | Confirmed | Keep a failed startup/shared link retryable in the tab (**Retry shared link** in the 🤗 dialog); toolbar 🤗 account button in read-only builds | high / high |
| E4 | Confirmed; reproduced | `timeoutSignal()` helper with a timer fallback for all 5 uses + lint rule | medium / medium |
| E14 | Confirmed; reproduced | `fetchWithTimeout` throws its signal's reason; workarounds kept (none needs removal) | medium / medium |
| E16 | Confirmed | Delete the re-export | low / low |

No decision changes.

## Live Hub semantics (verified 2026-10-07)

| Anonymous request | Answer |
|---|---|
| Missing repo, file: `/datasets/zz-no-such-owner-7f3a/zz-no-such-repo/resolve/main/colmapview.yaml` (GET and HEAD) | `401`, **no** `X-Error-Code`, `X-Error-Message: Invalid username or password.` |
| Missing repo, API: `/api/datasets/<missing>?expand=private`, `/tree/main`, `/revision/main` | `401`, no `X-Error-Code` (same as above) |
| Missing repo under an existing owner (`OpsiClear/zz-no-such-repo`) | `401`, no code |
| Missing file in a public repo: `/datasets/OpsiClear/NGS/resolve/main/<missing>` (GET and HEAD) | `404`, `X-Error-Code: EntryNotFound` |
| Missing folder in the tree API (`/api/datasets/OpsiClear/NGS/tree/main/<missing>`) | `404`, `EntryNotFound` |
| Missing revision (`resolve/no-such-branch-zz/…`, `tree/…`, `revision/…`) | `404`, `X-Error-Code: RevisionNotFound` |
| Gated dataset (`bigcode/the-stack`), data file **and** a missing file | `401`, `X-Error-Code: GatedRepo` |
| Same gated dataset: metadata API, tree API, `README.md` | `200` |
| Wrong owner/name case (`opsiclear/ngs`) | `307` to the canonical spelling |
| CORS | `Access-Control-Expose-Headers` lists `X-Error-Code` and `X-Error-Message`, so the browser can read them. Preflight for `Authorization`: `200`, `Access-Control-Max-Age: 86400` (browsers cap it; it is cached per URL) |
| Owner namespace: `/api/users/<missing>/overview`, `/api/organizations/<missing>/overview` | `404` (an existing org answers `200`) |

Private repos cannot be probed without credentials; `huggingface_hub` documents that the Hub answers them like missing repos (`RepositoryNotFoundError`: "it doesn't exist, or … it is set to `private` and you do not have access"), and its error handler treats an unauthenticated 401 as "private, gated or missing". With a bogus token, a missing file in a public repo still answers `404 EntryNotFound` and a missing repo `401`.

Consequence: an anonymous `404` marked `EntryNotFound`/`RevisionNotFound` comes only from a repo that anonymous readers can see. No account can change it. Private, gated and missing repos all answer `401`.

---

## G9. Signed-in users retry every anonymous 404 with the token

### Verified
- `src/features/huggingface/datasetAccess.ts:47-52`: `if (![401, 403, 404].includes(response.status)) return response;` and then any signed-in reader retries with the token (`authenticated()`), which sends `Authorization` and `cache: 'no-store'` (`:21-24`), so every retried URL also needs its own CORS preflight. Nothing records that a repo is public (`privateRepos` only records private ones, `:8`, `:35-39`).
- Optional files are 404s by design: `colmapview.yaml` candidates, masks, discovery probes. For a signed-in reader of a *public* repo each costs anonymous GET + OPTIONS + authenticated GET.
- The settings walk is sequential (`src/hooks/urlLoaderViewerState.ts:116-141`) over up to 8 candidates (`src/utils/huggingFaceUrl.ts:48-62`). For splat and archive URLs, `applyOptionalSettingsBeside` (`src/hooks/useUrlLoader.ts:72-76`, called at `:237` and `:247` after the download) calls `fetchOptionalDatasetViewerSettingsResult`, which starts the request and its 3 s deadline (`urlLoaderViewerState.ts:11`, `:67-76`) at the same time. A timeout shows the "saved view settings did not load in time" warning, keeps defaults and skips the splat auto-load.
- **Reproduced** (scratch, fake timers): a splat at `…/resolve/main/a/b/c/scene.spz` has 4 candidates. With 1 s per request and only the repo-root YAML present, HEAD returns `{ state: null, timedOut: true }` at 3 s and misses the root settings. A signed-in walk over a public repo with two missing folders makes 5 requests at HEAD instead of 3.

### Root cause
The retry condition is the status alone. The Hub already answers private, gated and missing repos with 401 and marks a public repo's missing file with `X-Error-Code: EntryNotFound`, but the code ignores the mark. Separately, the walk pays one round trip per folder in sequence, inside a deadline sized for one request.

### Fix (code)

**Approach chosen:** classify the anonymous answer per response, and probe the candidate folders in parallel while keeping "nearest folder decides".

Rejected alternatives:
- **Remember per repo that it is public.** Live evidence: a gated repo answers its metadata, tree and `README.md` anonymously with `200` but its files with `401 GatedRepo`. A "public" mark taken from any anonymous success would suppress the token retry that gated or newly-private files need, and a repo can change visibility mid-session. With the `X-Error-Code` check, the memory would save nothing anyway: a public repo's 404s are no longer retried, and successes never were.
- **Start the beside-file settings request before the download** (like `urlLoaderManifestSource.ts:78-80`). This works, but it restructures `loadFromUrl` in `useUrlLoader.ts`, the same code as R2's G6 and R1's G3. It complements the parallel walk; it does not replace it. It is left to R2 if G6 moves that wait.
- **Lengthening the 3 s deadline** contradicts the deliberate deadline decision and keeps the user waiting longer.

`src/features/huggingface/datasetAccess.ts` (the E11 messages are part of the same hunk):
```diff
@@ -8,6 +8,25 @@
 const privateRepos = new WeakMap<HfAuthState, Set<string>>();
 const discard = (response: Response) => { void response.body?.cancel().catch(() => {}); };
 
+/** The Hub's marks for a missing file or revision in a repo that anonymous readers can see. */
+const MISSING_FROM_VISIBLE_REPO = new Set(['EntryNotFound', 'RevisionNotFound']);
+
+/** Private, gated and missing repos all answer anonymous reads with 401; an unmarked 404 may hide one too. */
+function mayBeAccessDenial(response: Response): boolean {
+  if (response.status === 401 || response.status === 403) return true;
+  return response.status === 404 && !MISSING_FROM_VISIBLE_REPO.has(response.headers.get('X-Error-Code') ?? '');
+}
+
+/** Anonymously, the Hub cannot say whether a repo is missing or private. */
+const MISSING_OR_PRIVATE = 'Hugging Face dataset not found, or it is private. Check the URL. '
+  + 'Sign in with Hugging Face to open a private dataset, then retry.';
+
+function signedOutDenial(response: Response): HfError {
+  return new HfError(response.headers.get('X-Error-Code') === 'GatedRepo'
+    ? 'This Hugging Face dataset is gated: only accounts its owner has approved can open its files.'
+    : MISSING_OR_PRIVATE, response.status);
+}
+
 /** Public reads stay anonymous. Private reads use only the tab's current OAuth session. */
 export async function fetchHuggingFaceDatasetRequest(url: string, init: RequestInit = {}): Promise<Response> {
@@ -44,7 +63,8 @@
   if (token) return authenticated(token);
   const response = await fetch(url, request);
   init.signal?.throwIfAborted();
-  if (![401, 403, 404].includes(response.status)) return response;
+  // Only an answer an account could change is retried: a public repo's missing file stays one request.
+  if (!mayBeAccessDenial(response)) return response;
   const retryToken = hfAuth.getReadAccessToken();
   if (retryToken) {
     discard(response);
@@ -52,7 +72,7 @@
   }
   if (response.status !== 404) {
     discard(response);
-    throw new HfError('Sign in with Hugging Face to open private datasets, then retry the URL.', response.status);
+    throw signedOutDenial(response);
   }
   return response;
 }
@@ -87,7 +107,7 @@
   if (response.ok) return;
   if (response.status === 404) throw new HfError(hfAuth.getReadAccessToken()
     ? 'Hugging Face dataset not found or unavailable to this account. Check the URL and repository permissions.'
-    : 'Hugging Face dataset not found or private. Sign in with Hugging Face and check the URL.', 404);
+    : MISSING_OR_PRIVATE, 404);
```
An unmarked 404 is still retried. The live Hub never sends one on these endpoints, and treating it as possibly private keeps the old safety margin (all existing private-routing tests keep passing).

`src/hooks/urlLoaderViewerState.ts`. The walk passes its own signal so it can stop the folders it no longer needs. The wrapper in `startOptionalDatasetViewerSettings` must therefore combine signals instead of overwriting them:
```diff
@@ -27,8 +27,8 @@
   signal?.throwIfAborted();
   const controller = new AbortController();
   const requestSignal = signal ? anySignal([signal, controller.signal]) : controller.signal;
-  const settings = readDatasetViewerSettings(url,
-    (candidate, init) => fetchImpl(candidate, { ...init, signal: requestSignal }), isFile)
+  const settings = readDatasetViewerSettings(url, (candidate, init) => fetchImpl(candidate,
+    { ...init, signal: init?.signal ? anySignal([requestSignal, init.signal]) : requestSignal }), isFile)
     .catch((error): OptionalViewerSettingsResult => {
@@ -116,28 +116,40 @@
 async function readDatasetViewerSettings(url: string,
   fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, isFile: boolean): Promise<OptionalViewerSettingsResult> {
   // The first candidate sits beside the loaded project or file; later ones are parent folders.
-  for (const [index, candidate] of settingsUrls(url, isFile).entries()) {
-    try {
-      const response = await fetchImpl(candidate, { credentials: 'omit' });
-      if (!response.ok) {
-        await response.body?.cancel();
-        if (response.status === 404) continue;
-        return { state: null, timedOut: false };
+  // All are requested at once, so a deep path costs one round trip; the nearest answer still decides.
+  const unneeded = new AbortController();
+  const requests = settingsUrls(url, isFile).map(candidate => {
+    const response = fetchImpl(candidate, { credentials: 'omit', signal: unneeded.signal });
+    response.catch(() => {});
+    return { candidate, response };
+  });
+  try {
+    for (const [index, { candidate, response: pending }] of requests.entries()) {
+      try {
+        const response = await pending;
+        if (!response.ok) {
+          await response.body?.cancel();
+          if (response.status === 404) continue;
+          return { state: null, timedOut: false };
+        }
+        const text = await (await readBoundedResponse(response, MAX_VIEWER_STATE_BYTES)).text();
+        const state = parseDatasetViewerSettings(text);
+        return {
+          state: index === 0 || (isFile && savesFileAsActiveSplat(state, candidate, url)) ? state : displaySettingsOnly(state),
+          timedOut: false,
+        };
+      } catch (error) {
+        const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined;
+        if (name === 'AbortError') throw error;
+        appLogger.warn(SKIPPED_SETTINGS_WARNING);
+        return { state: null, timedOut: name === 'TimeoutError' };
       }
-      const text = await (await readBoundedResponse(response, MAX_VIEWER_STATE_BYTES)).text();
-      const state = parseDatasetViewerSettings(text);
-      return {
-        state: index === 0 || (isFile && savesFileAsActiveSplat(state, candidate, url)) ? state : displaySettingsOnly(state),
-        timedOut: false,
-      };
-    } catch (error) {
-      const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined;
-      if (name === 'AbortError') throw error;
-      appLogger.warn(SKIPPED_SETTINGS_WARNING);
-      return { state: null, timedOut: name === 'TimeoutError' };
     }
+    return { state: null, timedOut: false };
+  } finally {
+    // Folders above the deciding answer are no longer needed.
+    unneeded.abort();
   }
-  return { state: null, timedOut: false };
 }
```
Semantics kept exactly: candidates are judged in order. The first one that answers anything but 404 decides. A stalled nearer folder still waits for the deadline rather than letting a parent win. Only the timing changes, from the sum of the round trips to the slowest prefix. The deadline, the timeout warning, "no splat auto-load after a timeout" and "only the load's own cancellation is fatal" (`.catch` at `:32-37`) are unchanged. Aborting `unneeded` also aborts the deciding candidate's combined signal; that is harmless because its body has been read or cancelled by then.

`docs/hugging-face-loading.md` (G9 + E11 lines; G14 adds its own lines, below):
```diff
-Public reads remain anonymous. After a successful authenticated read, subsequent files from that repo use the current session directly. …
+Public reads remain anonymous, including checks for optional files a public repo does not have. After a successful authenticated read, subsequent files from that repo use the current session directly. …
@@ (line 36)
-… For private/missing repositories returning an ambiguous 404, also check the URL. Expired or rejected credentials …
+… Signed out, Hugging Face answers for a missing repository exactly as for a private one, so also check the URL. Gated datasets are reported as gated. Expired or rejected credentials …
```
(Lines elided with `…` are unchanged.)

### Tests (code)
`src/features/huggingface/datasetAccess.test.ts`. Add `import { fetchOptionalDatasetViewerSettingsResult } from '../../hooks/urlLoaderViewerState';` after the `frustumTextureCache` import, then add after the `'explains ambiguous private/not-found metadata with connected=%s'` test:
```ts
  it.each(['EntryNotFound', 'RevisionNotFound'])('keeps a signed-in reader anonymous for a %s 404', async code => {
    connected();
    request.mockResolvedValue(new Response('Entry not found', { status: 404, headers: { 'X-Error-Code': code } }));
    const response = await fetchDatasetResource(root + 'colmapview.yaml');
    expect(response.status).toBe(404);
    await response.body?.cancel();
    expect(request).toHaveBeenCalledOnce();
    expect(authorization(request.mock.calls[0][1])).toBeNull();
    expect(hfAuth.getReadAccessToken).not.toHaveBeenCalled();
  });

  it('walks a public repo’s settings folders with one anonymous request each while signed in', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    connected();
    request.mockImplementation(async url => url === root + 'colmapview.yaml'
      ? new Response('ui:\n  background_color: "#123456"\n')
      : new Response('Entry not found', { status: 404, headers: { 'X-Error-Code': 'EntryNotFound' } }));
    await expect(fetchOptionalDatasetViewerSettingsResult(root + 'a/b/scene.spz',
      (url, init) => fetchDatasetResource(url, undefined, init), true))
      .resolves.toMatchObject({ timedOut: false, state: { config: { ui: { backgroundColor: '#123456' } } } });
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.every(([, init]) => authorization(init) === null)).toBe(true);
  });
```
(`vi.stubGlobal('Blob', NodeBlob)` is needed because jsdom's `Blob` cannot back `readBoundedResponse`; the file already imports `NodeBlob`.)

`src/hooks/urlLoaderViewerState.test.ts`, after `'falls back from a subfolder to the repository root at the same revision'`:
```ts
  const deepFile = manifest.baseUrl + 'a/b/c/scene.spz';
  const deepCandidates = ['a/b/c/', 'a/b/', 'a/', ''].map(folder => manifest.baseUrl + folder + 'colmapview.yaml');
  it('reaches the repository root of a deep file within the deadline when every request is slow', async () => {
    vi.useFakeTimers();
    const request = vi.fn((url: string) => new Promise<Response>(resolve => setTimeout(() => resolve(url === deepCandidates[3]
      ? new Response('ui:\n  background_color: "#123456"\n')
      : new Response('Entry not found', { status: 404, headers: { 'X-Error-Code': 'EntryNotFound' } })), 1_000)));
    const pending = fetchOptionalDatasetViewerSettingsResult(deepFile, request, true);
    await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({
      state: expect.objectContaining({ config: { ui: { backgroundColor: '#123456' } } }), timedOut: false });
    expect(request.mock.calls.map(([url]) => url)).toEqual(deepCandidates);
  });
  it('lets the nearest settings decide even when a parent folder answers first', async () => {
    vi.useFakeTimers();
    const request = vi.fn((url: string) => new Promise<Response>(resolve => setTimeout(() => resolve(new Response(
      `ui:\n  background_color: "${url === deepCandidates[0] ? '#111111' : '#222222'}"\n`)), url === deepCandidates[0] ? 900 : 100)));
    const pending = fetchOptionalDatasetViewerSettingsResult(deepFile, request, true);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toMatchObject({ state: { config: { ui: { backgroundColor: '#111111' } } }, timedOut: false });
  });
  it('stops asking parent folders once the nearest settings decide', async () => {
    const signals: AbortSignal[] = [];
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      signals.push(init!.signal!);
      return signals.length === 1 ? new Response('ui:\n  background_color: "#123456"\n') : new Promise<Response>(() => {});
    });
    // The deadline has not started; nothing but the decision itself may stop the parent folders.
    startOptionalDatasetViewerSettings(deepFile, request, true);
    await vi.waitFor(() => expect(signals.slice(1).every(signal => signal.aborted)).toBe(true));
    expect(signals).toHaveLength(4);
  });
```
Three existing expectations now see the walk's signal. Change `{ credentials: 'omit' }` to `{ credentials: 'omit', signal: expect.any(AbortSignal) }` in `'discovers YAML for manifests on any HTTP host'` (`:146`), `'looks beside direct files without carrying credentials or URL parameters'` (`:151`) and `'discovers YAML automatically for a plain Hugging Face dataset path'` (`:161`). Leave `:141` alone: the explicit-path read does not walk.

**Results.** `RED` on base: both `keeps a signed-in reader anonymous…` cases (called 2 times), `walks a public repo’s settings folders…` (5 calls), `reaches the repository root…` (`{ state: null, timedOut: true }`), and `stops asking parent folders…` (1 request). `lets the nearest settings decide…` is a *guard*. `GREEN`: `datasetAccess.test.ts` + `urlLoaderViewerState.test.ts` + `useUrlLoader.test.ts`, 150/150.

### Risks and interactions
- **More concurrent Hub requests.** At most 8 small GETs per walk instead of a sequence; typical HF paths give 2–4. The unneeded ones are aborted as soon as the nearest answer decides. Non-HF URLs have one candidate, so nothing changes for them.
- **Private repos.** Anonymous answers are 401, so the first access check still adds the repo to `privateRepos` and later requests go straight to the session. A signed-in reader denied access still sees 403 → "cannot read the dataset".
- **G3 (R1) and G6 (R2)** both hinge on the post-download settings wait. A faster walk shrinks their window but fixes neither. If R2 moves the splat/archive settings request earlier (G6), the parallel walk still applies inside it. `urlLoaderViewerState.ts` is a shared file: the change is confined to `readDatasetViewerSettings` and the wrapper line in `startOptionalDatasetViewerSettings`.
- **Deliberate decisions:** "deadline starts after parsing", "any abort while the load is live counts as a timeout" and "a timeout does not auto-load the splat" are untouched. `anySignal` is used, never `AbortSignal.any`.

### Effort
Implementer **high**, reviewer **high**: ordered parallel async with abort ownership, and Hub semantics that tests can only simulate.

---

## E11. A signed-out user who mistypes an HF URL is told to sign in

### Verified
`datasetAccess.ts:53-55` throws `'Sign in with Hugging Face to open private datasets, then retry the URL.'` for any signed-out 401/403. Live: a missing repo (any endpoint) answers 401 with no error code, the same as a private one (see the table). `checkHuggingFaceDatasetAccess` (`:66-96`) reaches that message through `load.fetchImpl` for every mistyped dataset URL.

### Root cause
The Hub cannot tell missing from private anonymously, and the message assumes private.

### Fix (code)
This is in the G9 `datasetAccess.ts` diff above (`MISSING_OR_PRIVATE`, `signedOutDenial`):
- One message names both cases and puts **Check the URL** first. It keeps the substring `Sign in with Hugging Face`, so existing assertions keep passing: `datasetAccess.test.ts:146`, `:155` and `useUrlLoader.test.ts:113` (R2's file, not edited).
- The signed-out 404 branch of the access check now uses the same text.
- `GatedRepo` is the one case the Hub does name, so it gets its own message. The message does not promise that signing in helps. The viewer requests `read-repos`, and the Hub documents a separate `gated-repos` scope for gated content; whether `read-repos` reads a gated repo the user was approved for is unverified.

Rejected alternative: probe the owner namespace (`/api/users/<owner>/overview` or `/api/organizations/<owner>/overview` answer `404` for a missing owner). It would catch only owner typos, adds two requests to the failure path, and depends on undocumented endpoints.

### Tests (code)
`datasetAccess.test.ts`, next to the G9 tests:
```ts
  it('tells a signed-out reader that a 401 repo may be missing, not only private', async () => {
    // The Hub answers anonymous reads of missing and private repos alike, without an error code.
    request.mockImplementation(async () => new Response('Invalid username or password.', { status: 401 }));
    await expect(checkHuggingFaceDatasetAccess(info, url => fetchDatasetResource(url)))
      .rejects.toThrow('Hugging Face dataset not found, or it is private. Check the URL.');
  });

  it('names a gated dataset to a signed-out reader', async () => {
    request.mockImplementation(async () => new Response(null, { status: 401, headers: { 'X-Error-Code': 'GatedRepo' } }));
    await expect(fetchDatasetResource(root + 'sparse/0/cameras.bin')).rejects.toThrow('gated');
  });
```
`RED` on base (both got the old message). `GREEN` on fix.

### Risks and interactions
- Message text only; the `HfError.status` values are unchanged.
- The authenticated 403 for gated content keeps the generic "cannot read the dataset" text; a gated-specific wording there is a possible follow-up.
- G14's recovery depends on the "…then retry." wording pointing to the Retry action.

### Effort
Implementer **low**, reviewer **low**.

---

## G14. "Sign in and retry" cannot work for `#d=` links; no in-scene sign-in in read-only builds

### Verified
- `src/components/dropzone/useDropZoneStoreFacade.ts:33-34` exposes the landing page after a failed shared link "so users can sign in and retry".
- For `#d=` links the dataset URL (or an inline manifest) exists only in the compressed fragment. `App.tsx:50-56` runs the startup check once (`hasCheckedUrl`), `:75-79` decodes it, `:81-117` loads it, and nothing records the failed request.
- `UrlInputModal.tsx:46` starts with an empty URL and clears it on close (`:55-61`). An inline-manifest link has no URL at all.
- The HF session lives only in the `createHfAuth` closure (`auth.ts:85`), so reloading the tab to re-run the link drops the sign-in, and the link fails again.
- `docs/hugging-face-loading.md:17` promises "retry the dataset URL through **Load URL**".
- **Related gap:** the landing panels render only without a scene (`DropZone.tsx:231`, `:247`). In builds where publishing is off, `HuggingFacePublishButton.tsx:19` returns `null`. A loaded private scene therefore has no sign-in control once `getReadAccessToken()` expires the session (`auth.ts:94-97`). Lazy images then fail through `fetchHuggingFaceDatasetRequest`'s signed-out branch, which surfaces only as failed media. Any host with sign-in on and publishing off is such a build. The custom host's `CUSTOM_HF_AUTH_ENABLED` and `CUSTOM_HF_PUBLISH_ENABLED` are independent and both default to `false` (`docs/dual-hosting.md:45`), and its publishing is untested.

### Root cause
The startup request is consumed once and forgotten, and the only recovery path for HF access is the landing page plus a URL the user may not have. Read-only builds never received an in-scene equivalent of the publish dialog's **Sign in**.

### Fix (code)

**Approach chosen:** keep the failed startup request, which is the decoded plan plus the App's override-applying loaders, as an in-tab retry. Offer **Retry shared link** in the 🤗 account dialog once signed in. Nothing needs to survive a reload.

Rejected alternative: prefill the **Load URL** dialog. It cannot serve inline-manifest links. It would also load through DropZone's `useUrlLoader()` (no `applyUrlOverrides`), which drops the link's view, transforms, splat choice and selection.

New `src/appStartupRetry.ts`:
```ts
import { useReconstructionStore } from './store';

type Retry = () => Promise<void>;

const listeners = new Set<() => void>();
let current: Retry | null = null;
let release = () => {};

function publish(next: Retry | null): void {
  release();
  release = () => {};
  current = next;
  for (const listener of listeners) listener();
}

/** A failed startup or shared link that this tab can run again, for example after signing in. */
export const startupLinkRetry = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  getSnapshot: (): Retry | null => current,
};

/** Kept while its failure is the one on screen: any later load, success or clear withdraws it. */
export function offerStartupLinkRetry(run: Retry): void {
  const failure = useReconstructionStore.getState().urlError;
  if (!failure) return;
  const retry: Retry = () => {
    publish(null);
    return run();
  };
  publish(retry);
  release = useReconstructionStore.subscribe(state => {
    if (state.urlError !== failure) publish(null);
  });
}
```
Validity is keyed to the identity of the `urlError` object. `runLoad` clears `urlError` at the start of every load and `handleUrlLoadFailure` sets a new object per failure (`useUrlLoader.ts:155`, `urlLoaderErrorHandling.ts:76`). A new URL load, a success, `clear()` or another failure therefore all withdraw the offer. A cancelled or guard-refused link leaves no `urlError`, so nothing is offered.

New `src/appStartupLoad.ts`. This is the body of `App.tsx`'s `checkUrlAndLoad`, unchanged except for the last line:
```ts
import type { ColmapManifest } from './types/manifest';
import { abandonUrlAutoLoadRequest, useCameraStore } from './store';
import { applyShareConfig } from './hooks/useUrlState';
import { runGuardedUrlLoad } from './appUrlLoadGuard';
import { APP_SHARED_CONFIG_LOG_MESSAGE, type AppStartupLoadPlan } from './appStartupPolicy';
import { offerStartupLinkRetry } from './appStartupRetry';
import { appLogger } from './utils/logger';

export interface StartupLoaders {
  loadFromUrl: (url: string) => Promise<boolean>;
  loadFromManifest: (manifest: ColmapManifest) => Promise<boolean>;
}

/** Runs a startup or shared link. A failed one stays retryable in this tab, since a reload drops a Hugging Face sign-in. */
export async function runStartupLoadPlan(plan: AppStartupLoadPlan, loaders: StartupLoaders): Promise<void> {
  // Applied before loading so display settings and the requested splat take effect during the load.
  if (plan.config) {
    appLogger.info(APP_SHARED_CONFIG_LOG_MESSAGE);
    applyShareConfig(plan.config);
  }
  if (plan.kind === 'none') return;
  appLogger.info(plan.logMessage);
  // The loader re-applies the URL's settings after the load (applyUrlOverrides).
  const loaded = plan.kind === 'inline-manifest'
    ? await loaders.loadFromManifest(plan.manifest)
    : await runGuardedUrlLoad({ manifestUrl: plan.manifestUrl, loadFromUrl: loaders.loadFromUrl, onDeclined: abandonUrlAutoLoadRequest });
  if (loaded && plan.selectedImageId !== null) useCameraStore.getState().setSelectedImageId(plan.selectedImageId);
  if (!loaded) offerStartupLinkRetry(() => runStartupLoadPlan(plan, loaders));
}
```
(`legacy-url` plans always have `selectedImageId: null`, so merging the two URL branches changes nothing.)

`src/App.tsx`:
```diff
@@ -9,7 +9,6 @@
 import {
-  abandonUrlAutoLoadRequest,
   initStoreMigration,
@@ -18,14 +17,13 @@
 import { useUrlLoader } from './hooks/useUrlLoader';
-import { decodeShareData, applyShareConfig } from './hooks/useUrlState';
+import { decodeShareData } from './hooks/useUrlState';
 import { detectTouchDevice } from './hooks/useIsTouchDevice';
 import { TOUCH_BREAKPOINTS } from './theme/sizing';
 import { appLogger } from './utils/logger';
-import { runGuardedUrlLoad } from './appUrlLoadGuard';
+import { runStartupLoadPlan } from './appStartupLoad';
 import {
   APP_EMBED_MODE_LOG_MESSAGE,
-  APP_SHARED_CONFIG_LOG_MESSAGE,
   getAppStartupLoadPlan,
@@ -73,48 +71,10 @@
     const checkUrlAndLoad = async () => {
       const shareData = await decodeShareData(window.location.hash);
-      const loadPlan = getAppStartupLoadPlan({
+      await runStartupLoadPlan(getAppStartupLoadPlan({
         shareData,
         legacyManifestUrl: new URLSearchParams(search).get('url'),
-      });
-      … (the old lines 81-117: applyShareConfig, the three load branches, selectedImageId) …
+      }), { loadFromUrl, loadFromManifest });
     };
```
The retry runs through App's `useUrlLoader({ applyUrlOverrides: true })`, so `runLoad` re-reads the still-present `#d=` hash and re-applies the link's overrides after the load, as on first open. Only `clearUrlLoadRequestFromLocation` rewrites the hash: Cancel when nothing is on screen, a declined crash-loop prompt, or the splat-only fallback. `useUrlState()`'s hash writer has no caller. Each of those paths also ends the failure the retry is keyed to.

`src/components/dropzone/DatasetAccountButtons.tsx`. Reading an external store with `useSyncExternalStore` follows the pattern this component already uses for `hfAuth` and `googleDriveAuth`, and `componentStoreBoundary.test.ts` allows it:
```diff
@@ -2,6 +2,7 @@
 import { hfAuth } from '../../features/huggingface/auth';
 import { getHfAccountConfiguration } from '../../features/huggingface/config';
+import { startupLinkRetry } from '../../appStartupRetry';
@@ -30,6 +31,8 @@
   const hf = useSyncExternalStore(hfAuth.subscribe, hfAuth.getSnapshot);
+  // A shared link's dataset URL is hidden in its fragment, and a reload would drop the sign-in.
+  const retryLink = useSyncExternalStore(startupLinkRetry.subscribe, startupLinkRetry.getSnapshot);
   const clientId = getGoogleDrivePickerConfig()?.clientId;
@@ -198,8 +201,10 @@
               {connected ? 'Disconnect' : 'Cancel sign-in'}
             </button>
             <button type="button" disabled={connecting}
-              className={getButtonClass(connecting ? 'secondary' : 'primary', 'sm', connecting)}
+              className={getButtonClass(connecting ? 'secondary' : retryLink ? 'ghost' : 'primary', 'sm', connecting)}
               onClick={() => { close(); onOpenUrlModal(); }}>Load URL</button>
+            {connected && retryLink && <button type="button" className={getButtonClass('primary', 'sm')}
+              onClick={() => { close(); void retryLink(); }}>Retry shared link</button>}
           </> : <>
```
Flow: the link fails, the landing page shows the E11 toast ("…then retry."), the user opens 🤗 and selects **Sign in with Hugging Face**. The open dialog then turns into **Disconnect · Load URL · Retry shared link**. The Retry button appears only when connected: before sign-in the primary action stays **Sign in**.

**Related gap.** Add a read-only account button to the toolbar. New `src/components/viewer3d/HuggingFaceAccountButton.tsx`. It reuses only class strings that `DatasetAccountButtons.tsx` already uses (no new CSS classes), and `panelId="publish"`, which is free because the publish button is absent in these builds:
```tsx
import { useId, useState, useSyncExternalStore } from 'react';
import { hfAuth } from '../../features/huggingface/auth';
import type { HfConfig } from '../../features/huggingface/config';
import { floatingPanelStyles, getButtonClass, modalStyles, panelStyles, Z_INDEX } from '../../theme';
import { CheckIcon, CloseIcon } from '../../icons';
import { ModalDialogShell } from '../ui/ModalDialogShell';
import { PolicyLinks } from '../PolicyLinks';
import { ControlButton, type PanelType } from './ControlComponents';

interface HuggingFaceAccountButtonProps {
  config: HfConfig;
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
}

/** Read-only builds have no publishing dialog, so a loaded scene signs in again here once the session expires. */
export function HuggingFaceAccountButton({ config, activePanel, setActivePanel }: HuggingFaceAccountButtonProps) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const hf = useSyncExternalStore(hfAuth.subscribe, hfAuth.getSnapshot);
  const connected = hf.status === 'connected';
  const connecting = hf.status === 'connecting';
  const close = () => {
    if (connecting) hfAuth.disconnect();
    setIsOpen(false);
  };
  return <>
    <ControlButton panelId="publish" activePanel={activePanel} setActivePanel={setActivePanel}
      icon={<span aria-hidden="true" className="text-2xl leading-none">🤗</span>}
      tooltip={connected ? `Hugging Face: ${hf.identity?.username}` : 'Hugging Face account'}
      isActive={isOpen || connected} onClick={() => { setActivePanel(null); setIsOpen(true); }} />
    <ModalDialogShell isOpen={isOpen} onClose={close} ariaLabelledBy={`${id}-title`} ariaDescribedBy={`${id}-description`}
      overlayClassName={`${panelStyles.overlay} p-4`} overlayStyle={{ zIndex: Z_INDEX.modalOverlay }}
      panelClassName={`${floatingPanelStyles.dialog} w-full max-w-sm overflow-hidden`} panelStyle={{ maxHeight: '90dvh' }}>
      <div className={`${modalStyles.popupHeader} flex-shrink-0`}>
        <h3 id={`${id}-title`} className={modalStyles.toolHeaderTitle}>Hugging Face</h3>
        <button type="button" className={modalStyles.toolHeaderClose} aria-label="Close account dialog" onClick={close}>
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className={`${panelStyles.scrollBody} text-sm`}>
        {(connected || connecting) && <div role="status" className="flex items-center gap-1.5 mb-2 text-ds-primary">
          {connected && <CheckIcon className="w-3.5 h-3.5 text-ds-success flex-shrink-0" />}
          <span className="min-w-0 truncate" title={hf.identity?.username}>
            {connected ? `Connected as ${hf.identity?.username}` : 'Waiting for sign-in…'}
          </span>
        </div>}
        <p id={`${id}-description`} className="m-0 text-ds-secondary">
          {connected ? 'Files from private datasets load with this account.' : 'Sign in to keep loading files from private datasets.'}
        </p>
        <PolicyLinks align="start" />
        {hf.error && <p role="alert" className="m-0 mt-3 text-ds-warning text-xs">{hf.error}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2 mt-4">
          {connected || connecting
            ? <button type="button" className={getButtonClass('ghost', 'sm')} onClick={() => hfAuth.disconnect()}>
              {connected ? 'Disconnect' : 'Cancel sign-in'}
            </button>
            : <button type="button" className={getButtonClass('primary', 'sm')} onClick={() => { void hfAuth.connect(config); }}>
              Sign in with Hugging Face
            </button>}
        </div>
      </div>
    </ModalDialogShell>
  </>;
}
```
`src/components/viewer3d/HuggingFacePublishButton.tsx`:
```diff
-import { getHfConfiguration } from '../../features/huggingface/config';
+import { getHfAccountConfiguration, getHfConfiguration } from '../../features/huggingface/config';
 import { ControlButton, type PanelType } from './ControlComponents';
 import { useHuggingFacePublishButtonStoreFacade } from './useHuggingFacePublishButtonStoreFacade';
 import { LazyToolModal } from './LazyToolModal';
+import { HuggingFaceAccountButton } from './HuggingFaceAccountButton';
@@
   const { publicationActive } = useHuggingFacePublishButtonStoreFacade();
-  if (getHfConfiguration().status === 'disabled') return null;
+  if (getHfConfiguration().status === 'disabled') {
+    const account = getHfAccountConfiguration();
+    return account.status === 'ready'
+      ? <HuggingFaceAccountButton config={account.config} activePanel={activePanel} setActivePanel={setActivePanel} /> : null;
+  }
```
After a fresh sign-in, lazy media recover on their next request. Failed transfers are not negatively cached: the `failedImages` set in `asyncImageDecode.ts` covers decode failures only.

`docs/hugging-face-loading.md` (G14 lines):
```diff
-Shared links to private datasets still require each recipient to sign in with an account that can read the repository. Reloading the page requires signing in again. The account **Disconnect** button forgets the local token; it does not remove an already downloaded scene.
+Shared links to private datasets still require each recipient to sign in with an account that can read the repository. Reloading the page requires signing in again. The account **Disconnect** button forgets the local token; it does not remove an already downloaded scene. When the sign-in expires (after about 8 hours), the **🤗** button in the viewer toolbar signs in again, so the open scene keeps loading private images. With publishing enabled, that button opens the publishing dialog, which has its own **Sign in** button.
 
-If a private shared link opens while signed out, the viewer returns to **Load Dataset** after the access check fails. Sign in using the account icon, then retry the dataset URL through **Load URL**.
+If a private shared link opens while signed out, the viewer returns to **Load Dataset** after the access check fails. Select the **🤗** account icon and sign in, then select **Retry shared link** in the same dialog. The retry opens the same link, with its view and settings, without reloading the page, which would end the sign-in.
```

### Tests (code)
New `src/appStartupLoad.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runStartupLoadPlan } from './appStartupLoad';
import { startupLinkRetry } from './appStartupRetry';
import { getAppStartupLoadPlan } from './appStartupPolicy';
import { useCameraStore, useReconstructionStore } from './store';
import { clearUrlLoadAttempt } from './utils/urlLoadAttemptGuard';
import { createDefaultManifest } from './hooks/urlLoaderPolicy';
import type { UrlLoadError } from './types/manifest';

const datasetUrl = 'https://huggingface.co/datasets/owner/private';
const accessDenied: UrlLoadError = { type: 'unknown', message: 'Hugging Face dataset not found, or it is private.' };
const sharedLink = (manifestUrl: string | null, manifest = null as ReturnType<typeof createDefaultManifest> | null) =>
  getAppStartupLoadPlan({ shareData: { manifestUrl, manifest, viewState: null, config: { camera: { selectedImageId: 7 } } },
    legacyManifestUrl: null });
/** Like runLoad: a new attempt clears the previous error; a failure records its own. */
const loader = (...outcomes: boolean[]) => vi.fn(async () => {
  useReconstructionStore.getState().setUrlError(null);
  const loaded = outcomes.shift() ?? true;
  if (!loaded) useReconstructionStore.getState().setUrlError({ ...accessDenied });
  return loaded;
});

function reset() {
  clearUrlLoadAttempt();
  useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  useCameraStore.setState(useCameraStore.getInitialState(), true);
}
beforeEach(reset);
afterEach(reset);

describe('startup link loading', () => {
  it('keeps a failed shared link retryable in this tab, with its settings and selection', async () => {
    const loadFromUrl = loader(false, true);
    await runStartupLoadPlan(sharedLink(datasetUrl), { loadFromUrl, loadFromManifest: vi.fn() });
    const retry = startupLinkRetry.getSnapshot();
    expect(retry).not.toBeNull();
    useCameraStore.setState({ selectedImageId: null });
    await retry!();
    expect(loadFromUrl.mock.calls).toEqual([[datasetUrl], [datasetUrl]]);
    expect(useCameraStore.getState().selectedImageId).toBe(7);
    expect(startupLinkRetry.getSnapshot()).toBeNull();
  });

  it('retries a shared inline manifest the same way', async () => {
    const manifest = createDefaultManifest(datasetUrl + '/resolve/main/');
    const loadFromManifest = loader(false, true);
    await runStartupLoadPlan(sharedLink(null, manifest), { loadFromUrl: vi.fn(), loadFromManifest });
    await startupLinkRetry.getSnapshot()!();
    expect(loadFromManifest.mock.calls).toEqual([[manifest], [manifest]]);
  });

  it('offers it again when the retry fails too', async () => {
    const loadFromUrl = loader(false, false);
    await runStartupLoadPlan(sharedLink(datasetUrl), { loadFromUrl, loadFromManifest: vi.fn() });
    await startupLinkRetry.getSnapshot()!();
    expect(startupLinkRetry.getSnapshot()).not.toBeNull();
  });

  it('offers nothing when the link was cancelled or refused, which leaves no error', async () => {
    await runStartupLoadPlan(sharedLink(datasetUrl), { loadFromUrl: vi.fn(async () => false), loadFromManifest: vi.fn() });
    expect(startupLinkRetry.getSnapshot()).toBeNull();
  });

  it('withdraws the retry once any other load starts or the viewer is cleared', async () => {
    await runStartupLoadPlan(sharedLink(datasetUrl), { loadFromUrl: loader(false), loadFromManifest: vi.fn() });
    expect(startupLinkRetry.getSnapshot()).not.toBeNull();
    useReconstructionStore.getState().setUrlError(null);
    expect(startupLinkRetry.getSnapshot()).toBeNull();
    await runStartupLoadPlan(sharedLink(datasetUrl), { loadFromUrl: loader(false), loadFromManifest: vi.fn() });
    useReconstructionStore.getState().clear();
    expect(startupLinkRetry.getSnapshot()).toBeNull();
  });
});
```
`src/components/dropzone/DatasetAccountButtons.test.tsx`:
- Imports: add `import { offerStartupLinkRetry } from '../../appStartupRetry';` and `import { useReconstructionStore } from '../../store';`.
- In `afterEach`, add `useReconstructionStore.getState().setUrlError(null);` after the disconnects. This withdraws any offered retry.
- Before `'keeps a pending Hugging Face sign-in instead of letting Load URL cancel it'`, add:
```tsx
  it('retries a failed shared link from the dialog once signed in to Hugging Face', () => {
    vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue({ status: 'connected', identity: { username: 'test-user' }, error: null });
    useReconstructionStore.getState().setUrlError({ type: 'unknown', message: 'Hugging Face dataset not found, or it is private.' });
    const retry = vi.fn(async () => {});
    offerStartupLinkRetry(retry);
    const props = createProps();
    render(<DatasetAccountButtons {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hugging Face account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry shared link' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(props.onOpenUrlModal).not.toHaveBeenCalled();
  });

  it('offers no retry before sign-in or without a failed shared link', () => {
    useReconstructionStore.getState().setUrlError({ type: 'unknown', message: 'Hugging Face dataset not found, or it is private.' });
    offerStartupLinkRetry(vi.fn(async () => {}));
    render(<DatasetAccountButtons {...createProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hugging Face account' }));
    expect(screen.queryByRole('button', { name: 'Retry shared link' })).not.toBeInTheDocument();
    cleanup();
    useReconstructionStore.getState().setUrlError(null);
    vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue({ status: 'connected', identity: { username: 'test-user' }, error: null });
    render(<DatasetAccountButtons {...createProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hugging Face account' }));
    expect(screen.queryByRole('button', { name: 'Retry shared link' })).not.toBeInTheDocument();
  });
```
`src/components/viewer3d/HuggingFacePublishButton.test.tsx`:
- Add `import { hfAuth } from '../../features/huggingface/auth';`.
- Change `afterEach` to `afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });`.
- In `'keeps publishing hidden on deployments with the feature disabled'`, add `expect(screen.queryByRole('button', { name: 'Hugging Face account' })).not.toBeInTheDocument();`.
- Add:
```tsx
  it('lets a read-only viewer sign in again inside a loaded scene once the session expired', () => {
    vi.stubEnv('VITE_HF_PUBLISH_ENABLED', 'false');
    vi.stubEnv('VITE_HF_AUTH_ENABLED', 'true');
    vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue({
      status: 'disconnected', identity: null, error: 'Your Hugging Face connection expired. Sign in again.' });
    const connect = vi.spyOn(hfAuth, 'connect').mockResolvedValue(undefined);
    const setActivePanel = vi.fn();
    render(<HuggingFacePublishButton activePanel={null} setActivePanel={setActivePanel} />);
    expect(screen.queryByRole('button', { name: 'Publish to Hugging Face' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hugging Face account' }));
    expect(setActivePanel).toHaveBeenCalledWith(null);
    expect(screen.getByRole('alert')).toHaveTextContent('connection expired');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Hugging Face' }));
    expect(connect).toHaveBeenCalledExactlyOnceWith({
      clientId: 'public-client', redirectUri: `${window.location.origin}/hf-callback.html`, readOnly: true });
  });

  it('shows the signed-in reader and disconnects from the scene', () => {
    vi.stubEnv('VITE_HF_PUBLISH_ENABLED', 'false');
    vi.stubEnv('VITE_HF_AUTH_ENABLED', 'true');
    vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue({ status: 'connected', identity: { username: 'reader' }, error: null });
    const disconnect = vi.spyOn(hfAuth, 'disconnect').mockImplementation(() => undefined);
    render(<HuggingFacePublishButton activePanel={null} setActivePanel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hugging Face: reader' }));
    expect(screen.getByRole('status')).toHaveTextContent('Connected as reader');
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(disconnect).toHaveBeenCalledOnce();
  });
```
**Results.** RED was checked on base plus `appStartupRetry.ts` plus an `appStartupLoad.ts` that is HEAD's startup sequence verbatim, without the offer line. That way the failures are behavioural, not missing modules. `RED`: the four retry/withdraw runner tests, `retries a failed shared link from the dialog…`, and both read-only toolbar tests. *Guards*: `offers nothing when the link was cancelled…` and `offers no retry before sign-in…`. `GREEN`: these files plus `appStartupPolicy.test.ts` and `appUrlLoadGuard.test.ts`, 49/49. Full suite clean apart from the environment-only failures noted at the top.

### Risks and interactions
- **`App.tsx` overlaps R2 and R1.** R2's G11 (`App.tsx:84` `applyShareConfig`, explicit None) and R1's E6 (a startup link's transform after Cancel) may edit the same startup block. Land R4's G14 after them, and move whatever they changed in `checkUrlAndLoad` into `runStartupLoadPlan`. The retry re-runs that sequence, so a G11/E6 fix applies to retries automatically.
- **Retry offered for non-HF failures.** A network or CORS failure of a startup link also gets the offer. It is shown only in the HF dialog when connected, so this is harmless. Drive links are not helped: private Drive files need the picker, not a retry (R3's area).
- **Retry after the fragment was stripped.** Cancelling a retry with nothing on screen strips `#d=` (`cancelLoading` → `clearUrlLoadRequestFromLocation`), as on first open. The offer was already consumed when the retry started, so no stale retry remains.
- **`componentStoreBoundary`.** `startupLinkRetry` is a plain external store read with `useSyncExternalStore`, like `hfAuth`. If R3 tightens the boundary rule for E12, treat it like `hfAuth`. It is not a Zustand store and lives outside `src/store` by design.
- **Deliberate decisions:** the restore order, cancel semantics and the URL loader lifecycle are untouched. The retry calls the same loaders. No new CSS classes (`classContract.test.ts` passed).
- **Possible follow-up, not needed for this finding:** a one-time warning toast when a session expires while a private scene is open. Today only the toolbar button's state and the dialog's alert show it.

### Effort
Implementer **high**, reviewer **high**: multi-file UI and startup-flow change with a store-subscription lifecycle and ordering against R1/R2.

---

## E4. `AbortSignal.timeout` breaks HF sign-in on Safari/iOS 15.4–15.x

### Verified
- Every use in `src`: `auth.ts:123` (sign-in), `http.ts:30` (`boundedFetch`: token exchange, userinfo, all publishing reads), `hubClient.ts:62` and `:69` (repo creation checks), `datasetPublishing/publishDataset.ts:62` (upload reconcile). No other use exists in `src/` or `public/`. `@huggingface/hub`'s `dist` uses neither `AbortSignal.timeout` nor `.any`. The built chunks contain exactly these five calls. `scripts/deployment/*.mjs` use it in Node, which is fine and outside the lint `files` glob.
- Browser support (MDN browser-compat-data 8.1.4, from the reviewer's scratch `rev2/verif_abort/bcd.json`): `AbortSignal.timeout` is Safari/iOS **16**, Chrome 103 (aborts with `AbortError`, not `TimeoutError`, until 124) and Firefox 100. `signal.reason` and `throwIfAborted`, which the app already needs, are Safari/iOS **15.4**. So 15.4–15.x is the affected supported range.
- `connect()` opens the popup (`auth.ts:117`) before `AbortSignal.timeout(180_000)` throws synchronously (`:123`). `pending` is never set, the state stays `disconnected` without an error, and the exception escapes `onClick={() => { void hfAuth.connect(…) }}` (`DatasetAccountButtons.tsx:207`, `PublishDatasetModal.tsx:78`). The `about:blank` popup stays open and nothing is shown.
- **Reproduced:** with `AbortSignal.timeout` undefined, `auth.connect()` and `boundedFetch(...)()` throw `TypeError: AbortSignal.timeout is not a function`.

### Root cause
A Safari 16 API is used directly in code that the 15.4 floor must support.

### Fix (code)
`src/utils/abortSignals.ts`. Native first, like `anySignal`, so existing fake-timer tests see the same behaviour (vitest fakes do not touch the native timer):
```diff
@@ -1,4 +1,5 @@
 type AbortSignalWithAny = typeof AbortSignal & { any?: (signals: AbortSignal[]) => AbortSignal };
+type AbortSignalWithTimeout = typeof AbortSignal & { timeout?: (milliseconds: number) => AbortSignal };
@@ -20,3 +21,12 @@
   for (const signal of signals) signal.addEventListener('abort', onAbort);
   return controller.signal;
 }
+
+/** AbortSignal.timeout with a fallback for browsers that lack it (Safari/iOS < 16). Aborts with a TimeoutError. */
+export function timeoutSignal(milliseconds: number): AbortSignal {
+  const native = (AbortSignal as AbortSignalWithTimeout).timeout;
+  if (typeof native === 'function') return native.call(AbortSignal, milliseconds);
+  const controller = new AbortController();
+  setTimeout(() => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')), milliseconds);
+  return controller.signal;
+}
```
Replace the five calls:
- `src/features/huggingface/auth.ts`: import `{ anySignal, timeoutSignal }`, and `anySignal([controller.signal, timeoutSignal(180_000)])`.
- `src/features/huggingface/http.ts`: import `{ anySignal, timeoutSignal }`, and `anySignal([signal, timeoutSignal(timeout)])`.
- `src/features/huggingface/hubClient.ts`: add `import { timeoutSignal } from '../../utils/abortSignals';` after the `awaitWithAbort` import; `const check = timeoutSignal(20_000);` and `client.head(repoId, timeoutSignal(20_000))`.
- `src/features/datasetPublishing/publishDataset.ts`: add `import { timeoutSignal } from '../../utils/abortSignals';` after the `../huggingface/http` import; `client.reconcile(…, timeoutSignal(20_000))`.

`eslint.config.js` (cheap, same shape as the existing `any` rule):
```diff
       'no-restricted-properties': ['error', {
         object: 'AbortSignal',
         property: 'any',
         message: 'Use anySignal() from src/utils/abortSignals: AbortSignal.any is missing on Safari/iOS < 17.4.',
+      }, {
+        object: 'AbortSignal',
+        property: 'timeout',
+        message: 'Use timeoutSignal() from src/utils/abortSignals: AbortSignal.timeout is missing on Safari/iOS < 16.',
       }],
```
Checked: with this config, `eslint` reports exactly the 5 uses at HEAD and 0 after the fix. The helper's `(AbortSignal as …).timeout` and the tests' `getOwnPropertyDescriptor`/`defineProperty` calls are not flagged.

### Tests (code)
`src/utils/abortSignals.test.ts`:
- Import `{ anySignal, timeoutSignal }`.
- Add `const nativeTimeout = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');` and restore it in the existing `afterEach` (`if (nativeTimeout) Object.defineProperty(AbortSignal, 'timeout', nativeTimeout);`).
- Add:
```ts
describe.each(['native', 'fallback'] as const)('timeoutSignal (%s)', mode => {
  beforeEach(() => {
    // Safari/iOS < 16 has no AbortSignal.timeout.
    if (mode === 'fallback') Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true, writable: true });
  });

  it('aborts with a TimeoutError once the time has passed', async () => {
    const signal = timeoutSignal(10);
    expect(signal.aborted).toBe(false);
    await vi.waitFor(() => expect(signal.aborted).toBe(true));
    expect(signal.reason).toMatchObject({ name: 'TimeoutError' });
  });
});
```
`src/features/huggingface/http.test.ts`, replacing the header:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedFetch, HfError } from './http';

const nativeTimeout = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
afterEach(() => { if (nativeTimeout) Object.defineProperty(AbortSignal, 'timeout', nativeTimeout); });
```
and appending:
```ts
describe('boundedFetch', () => {
  it('bounds requests on engines without AbortSignal.timeout (Safari/iOS 15.4–15.x)', async () => {
    Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true, writable: true });
    const request = vi.fn(async () => new Response('ok'));
    const response = await boundedFetch(new AbortController().signal, 20, request)('https://huggingface.co/api/whoami-v2');
    expect(await response.text()).toBe('ok');
    const signal = (request.mock.calls[0] as unknown as [string, RequestInit])[1].signal!;
    await vi.waitFor(() => expect(signal.aborted).toBe(true));
    expect(signal.reason).toMatchObject({ name: 'TimeoutError' });
  });
});
```
`src/features/huggingface/auth.test.ts`, before `'does not surface provider request URLs or credentials in UI errors'`:
```ts
  it('signs in on engines without AbortSignal.timeout (Safari/iOS 15.4–15.x)', async () => {
    const nativeTimeout = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
    Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true, writable: true });
    try {
      vi.stubGlobal('BroadcastChannel', undefined);
      const popup = { location: { href: '' }, closed: false, close: vi.fn() };
      vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'test-read', expires_in: 60, scope: HF_READ_SCOPES }))
        .mockResolvedValueOnce(Response.json({ preferred_username: 'reader' })));
      const auth = createHfAuth();
      const pending = auth.connect({ ...config, readOnly: true });
      await vi.waitFor(() => expect(popup.location.href).toContain('oauth/authorize'));
      const returnedState = new URL(popup.location.href).searchParams.get('state')!;
      window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: popup as unknown as Window,
        data: { type: HF_CALLBACK_TYPE, url: `${config.redirectUri}?${new URLSearchParams({ code: 'code', state: returnedState })}` } }));
      await pending;
      expect(auth.getSnapshot()).toMatchObject({ status: 'connected', identity: { username: 'reader' }, error: null });
    } finally {
      if (nativeTimeout) Object.defineProperty(AbortSignal, 'timeout', nativeTimeout);
    }
  });
```
**Results.** `RED`: 4 (both `timeoutSignal` modes, "timeoutSignal is not a function"; `boundedFetch` and `connect`, "AbortSignal.timeout is not a function"). `GREEN`: `abortSignals` + `src/features/huggingface` + `src/features/datasetPublishing`, 220/220.

### Risks and interactions
- `hubClient.ts` is R3's file (G4 at `:39`). This change touches only the import block and `:62`/`:69`. Merge with R3's hunk, or land after it.
- The fallback leaves a timer pending until it fires, as the native one does. Native-first keeps Chrome 103–123's `AbortError` reason; none of the five callers inspects the reason. A future caller that needs `TimeoutError` must not rely on it.
- This fixes sign-in only on the engine side. Safari 15.x has other limits (e.g. `AbortSignal.any`, already handled), so a smoke test on a real 15.x device is advisable before claiming support.

### Effort
Implementer **medium**, reviewer **medium**: mechanical replacements plus a helper and a lint rule.

---

## E14. `fetchWithTimeout` throws the browser's own error instead of its timeout reason

### Verified
`src/utils/fetchWithTimeout.ts:22` aborts the request with `DOMException('Request timed out', 'TimeoutError')`, and `:25` forwards the caller's reason. The headers-phase `catch` (`:94-97`) rethrows whatever `fetchImpl` rejected with. Engines without abort-reason propagation reject an aborted fetch with their own generic `AbortError`, so a 30 s stall looks like a cancellation. The body phase already reports the reason (`abortBody`, `:32-36`). **Reproduced:** with a fetch that rejects with a plain `AbortError` on abort, HEAD rejects with that `AbortError` instead of `TimeoutError`, and instead of the caller's own reason object.

### Root cause
The catch does not prefer the signal's reason when it was the signal that stopped the request.

### Fix (code)
```diff
   } catch (error) {
     cleanup();
+    // Some engines reject an aborted fetch with their own AbortError instead of the signal's reason.
+    if (controller.signal.aborted && controller.signal.reason !== undefined) throw controller.signal.reason;
     throw error;
   }
```
(`reason` is undefined only before Safari 15.4, below the floor. The guard keeps the old behaviour there.)

### Workarounds this makes redundant, and what to do with them
| Caller | Workaround | Safe to remove after the fix? | Recommendation |
|---|---|---|---|
| `src/features/huggingface/datasetAccess.ts:66-67, 79-82` (+ `signal` param; args at `useUrlLoader.ts:225`, `:287`) | treats an `AbortError` while the load's signal is live as a stalled Hub API | **Yes for production**: every production `fetchImpl` goes through `fetchWithTimeout`, so a live-load `AbortError` can no longer be a timeout | **Keep for now.** Removing it means changing R2's `useUrlLoader.ts` and rewriting `useUrlLoader.test.ts:160-179`. Those tests throw an immediate plain `AbortError` that no real engine produces after this fix; a realistic version must stall and advance `FETCH_TIMEOUT` with fake timers. It would also drop `datasetAccess.test.ts:277-292`. No behaviour gain. Optional follow-up after R2 lands (diff in the appendix). |
| `src/hooks/urlLoaderViewerState.ts:32-37` | any rejection while the load is live → `{ timedOut: true }` | Not a pure workaround: it implements the deliberate decision "any abort while the load's own signal is live counts as a timeout", and it also covers `cancel()` before `settle()` | **Keep.** Its comment's parenthetical stays true for injected fetchers; `urlLoaderViewerState.test.ts:109-115` stays as its guard. |
| `src/utils/urlUtils.ts:28-29` `classifyFetchError` | maps `AbortError` to "Request timed out" | Display classification, not a workaround | **Keep.** |
| `src/utils/zipValidation.ts:74` | `AbortError` → "Size check timed out" | Its own 5 s deadline aborts without a reason; `fetchWithTimeout`'s 30 s timer never fires first | **Keep.** |
| `fileDropzoneWorkflow.ts:633`, `fileDropzoneLocalSources.ts:157/203/253` | `AbortError` → silent cancel | Not a workaround. After the fix a transport timeout reaching them is a `TimeoutError` and is reported instead of silently dropped, which is an improvement | No change. |
| Drive `api.ts:103`, `upload.ts:90` (R3) | none (no name checks) | n/a | No change; on old engines Drive now sees `TimeoutError`, as it does on current ones. |

### Tests (code)
`src/utils/fetchWithTimeout.test.ts`, at the end of the `describe`:
```ts
  /** Engines without abort-reason propagation reject an aborted fetch with their own AbortError. */
  function stubFetchWithoutAbortReasons() {
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    })));
  }

  it('reports its own timeout when fetch rejects with a plain AbortError', async () => {
    stubFetchWithoutAbortReasons();
    const rejected = expect(fetchWithTimeout('/stalled', 100)).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports the caller's own reason when fetch rejects with a plain AbortError", async () => {
    stubFetchWithoutAbortReasons();
    const controller = new AbortController();
    const reason = new DOMException('Dataset load cancelled', 'AbortError');
    const rejected = expect(fetchWithTimeout('/cancel', 100, { signal: controller.signal })).rejects.toBe(reason);
    controller.abort(reason);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a failure that is not an abort', async () => {
    const failure = new TypeError('Failed to fetch');
    vi.stubGlobal('fetch', vi.fn(async () => { throw failure; }));
    await expect(fetchWithTimeout('/offline', 100)).rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
  });
```
End to end through the real stack, in `src/features/huggingface/datasetAccess.test.ts`, after `'lets the dataset files decide when a stalled Hub API times out'`. It calls the check without a `signal`, so only the E14 fix can make it pass:
```ts
  it('lets the dataset files decide when a stalled Hub API times out on an engine without abort reasons', async () => {
    vi.useFakeTimers();
    // Such engines reject the aborted fetch with their own AbortError; fetchWithTimeout reports its timeout.
    request.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    }));
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
    const checked = checkHuggingFaceDatasetAccess(info, url => fetchDatasetResource(url, 100));
    await vi.advanceTimersByTimeAsync(100);
    await expect(checked).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledExactlyOnceWith(CONTINUE_AFTER_FAILED_CHECK, expect.objectContaining({ name: 'TimeoutError' }));
  });
```
**Results.** `RED`: both "reports …" tests and the end-to-end test (HEAD throws the `AbortError`). `keeps a failure that is not an abort` is a *guard*. `GREEN`: all.

### Risks and interactions
- On old engines, a settings deadline that fires mid-request now reaches `readDatasetViewerSettings` as our `TimeoutError`. It adds one `SKIPPED_SETTINGS_WARNING` log line, exactly as on current engines; the result (`timedOut: true`) is unchanged.
- Drive (R3) and the media scheduler see `TimeoutError` instead of `AbortError` on old engines. Neither branches on the name.

### Effort
Implementer **medium**, reviewer **medium**: a two-line change, but the abort semantics deserve a careful review.

---

## E16. Leftover `fetchWithTimeout` re-export in `urlUtils`

### Verified
`src/utils/urlUtils.ts:11`: `export { fetchWithTimeout, FETCH_TIMEOUT } from './fetchWithTimeout';`. No importer exists in `src/`, `e2e/`, `tests/` or `scripts/`: every consumer imports `./fetchWithTimeout` directly, and no `vi.mock` of `urlUtils` relies on it. Only untracked scratch under `.tmp/` references it.

### Fix (code)
Delete the line.

### Tests (code)
Optional regression guard, appended to `src/utils/urlUtils.test.ts`:
```ts
describe('urlUtils module surface', () => {
  it('leaves the transport timeout to fetchWithTimeout and fetchDatasetResource', async () => {
    const urlUtils = await import('./urlUtils');
    expect(urlUtils).not.toHaveProperty('fetchWithTimeout');
    expect(urlUtils).not.toHaveProperty('FETCH_TIMEOUT');
  });
});
```
`RED` on base; `GREEN` after. The real verification is `tsc -b` plus the full suite, both clean.

### Effort
Implementer **low**, reviewer **low**.

---

## File ownership table

| File | Findings | Change |
|---|---|---|
| `src/utils/fetchWithTimeout.ts` | E14 | catch rethrows the signal's reason |
| `src/utils/fetchWithTimeout.test.ts` | E14 | 3 tests |
| `src/utils/urlUtils.ts` | E16 | delete re-export |
| `src/utils/urlUtils.test.ts` | E16 | 1 optional guard |
| `src/utils/abortSignals.ts` | E4 | `timeoutSignal` |
| `src/utils/abortSignals.test.ts` | E4 | native/fallback test |
| `src/features/huggingface/auth.ts` | E4 | use `timeoutSignal` |
| `src/features/huggingface/auth.test.ts` | E4 | Safari 15 sign-in test |
| `src/features/huggingface/http.ts` | E4 | use `timeoutSignal` |
| `src/features/huggingface/http.test.ts` | E4 | `boundedFetch` test |
| `src/features/huggingface/hubClient.ts` | E4 | import + `:62`, `:69` (**R3 also edits, G4 `:39`**) |
| `src/features/datasetPublishing/publishDataset.ts` | E4 | import + `:62` |
| `eslint.config.js` | E4 | restrict `AbortSignal.timeout` |
| `src/features/huggingface/datasetAccess.ts` | G9, E11 | retry classification, messages |
| `src/features/huggingface/datasetAccess.test.ts` | G9, E11, E14 | 5 + 2 + 1 tests |
| `src/hooks/urlLoaderViewerState.ts` | G9 | parallel walk, signal combine (**R2 may edit for G6**) |
| `src/hooks/urlLoaderViewerState.test.ts` | G9 | 3 tests, 3 expectation updates |
| `src/appStartupRetry.ts` (new) | G14 | retry holder |
| `src/appStartupLoad.ts` (new) | G14 | startup runner |
| `src/appStartupLoad.test.ts` (new) | G14 | 5 tests |
| `src/App.tsx` | G14 | call the runner (**R2 G11 / R1 E6 may edit**) |
| `src/components/dropzone/DatasetAccountButtons.tsx` | G14 | Retry shared link (**R3 may edit the Drive branch, E10/E15**) |
| `src/components/dropzone/DatasetAccountButtons.test.tsx` | G14 | 2 tests, afterEach |
| `src/components/viewer3d/HuggingFaceAccountButton.tsx` (new) | G14 | read-only toolbar account dialog |
| `src/components/viewer3d/HuggingFacePublishButton.tsx` | G14 | render the account button in read-only builds |
| `src/components/viewer3d/HuggingFacePublishButton.test.tsx` | G14 | 2 tests, 1 extra assertion, afterEach |
| `docs/hugging-face-loading.md` | G9/E11 (lines 13, 36), G14 (lines 15, 17) | wording |

Not changed (the E14 assessment says to leave them): `src/hooks/useUrlLoader.ts`, `src/hooks/useUrlLoader.test.ts`.

## Recommended task grouping and order

1. **T1, E14 + E16.** Files: `fetchWithTimeout.ts/.test.ts`, `urlUtils.ts/.test.ts`, the E14 test in `datasetAccess.test.ts`. Commit: *"Report fetchWithTimeout's own abort reason and drop the urlUtils re-export"*. Effort: medium/medium.
2. **T2, E4.** Files: `abortSignals.ts/.test.ts`, `auth.ts/.test.ts`, `http.ts/.test.ts`, `hubClient.ts`, `datasetPublishing/publishDataset.ts`, `eslint.config.js`. Commit: *"Fall back to a timer where AbortSignal.timeout is missing"*. Effort: medium/medium. It is independent, so it can run in parallel with T1, but merge `hubClient.ts` with R3.
3. **T3, G9 + E11.** Files: `datasetAccess.ts/.test.ts`, `urlLoaderViewerState.ts/.test.ts`, docs lines 13 and 36. Commit: *"Retry Hugging Face reads with the session only when access may be denied, and ask settings folders together"*. Effort: high/high. Run it after T1 (shared test file), and check `urlLoaderViewerState.ts` against R2's G6 before merging.
4. **T4, G14.** Files: `appStartupRetry.ts`, `appStartupLoad.ts/.test.ts`, `App.tsx`, `DatasetAccountButtons.tsx/.test.tsx`, `HuggingFaceAccountButton.tsx`, `HuggingFacePublishButton.tsx/.test.tsx`, docs lines 15 and 17. Commit: *"Retry a failed shared link after Hugging Face sign-in, and sign in again inside read-only scenes"*. Effort: high/high. Run it **after R2's App.tsx/useUrlState.ts work (G11) and R1's E6**, and after T3 (same doc file; the toast wording leads to the Retry).

## Cross-area notes
- **R2 (URL load lifecycle):**
  - `App.tsx`: T4 moves the startup block into `appStartupLoad.ts`. Order R2's G11 first and carry its edits over.
  - `urlLoaderViewerState.ts`: T3 edits `readDatasetViewerSettings` and the wrapper line in `startOptionalDatasetViewerSettings`; G6 may touch the settle/start timing in the same file.
  - `useUrlLoader.ts`: not edited by R4. If R2 restructures the splat/archive settings wait (G6), starting that request before the download complements T3.
  - The E14 follow-up (appendix) would edit `useUrlLoader.ts:225,287` and `useUrlLoader.test.ts:160-179`; it is deferred.
- **R1 (cancel and Reload):** G3's window (Cancel during the post-download settings wait) gets shorter with T3 but is not fixed by it. E6 may touch the startup-link flow that T4 extracts.
- **R3 (publishing and Drive):**
  - `hubClient.ts`: T2 at `:1-6`, `:62` and `:69`; G4 at `:39`.
  - `DatasetAccountButtons.tsx`: T4 edits the HF branch (`:196-208`), one import and one hook line; E10/E15 likely edit the Drive branch.
  - E12 may tighten `componentStoreBoundary`: `startupLinkRetry` is an external store read via `useSyncExternalStore`, like `hfAuth`.
- **R5 (privacy, docs, deploy):** `docs/hugging-face-loading.md` lines 13–17 and 36 are edited by T3/T4. G8's scope wording (`read-repos` + `contribute-repos`) lives in `privacy.html`, `about.html` and `README.md`, but if R5 also edits line 6 of this doc, merge.

## Appendix: optional E14 follow-up (after R2 lands; not recommended for this round)
```diff
--- a/src/features/huggingface/datasetAccess.ts
-/**
- * Fail before replacing the current scene, including Hub's deliberately ambiguous private 404s.
- * `signal` is the load's own; while it is live, an AbortError means a stalled Hub API.
- */
+/** Fail before replacing the current scene, including the Hub's ambiguous answers for private repos. */
 export async function checkHuggingFaceDatasetAccess(infoUrl: string,
-  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, signal?: AbortSignal): Promise<void> {
+  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>): Promise<void> {
@@
-    // Cancellation and the account answers raised while fetching stand. Some engines report the
-    // transport timeout as a plain AbortError too.
+    // Cancellation and the account answers raised while fetching stand. A stalled Hub API
+    // arrives as fetchWithTimeout's TimeoutError and, like an unreachable one, lets the files decide.
     const aborted = Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
-    if (error instanceof HfError || (aborted && (!signal || signal.aborted))) throw error;
+    if (error instanceof HfError || aborted) throw error;
--- a/src/hooks/useUrlLoader.ts  (lines 225, 287)
-      await checkHuggingFaceDatasetAccess(hfInfoUrl, load.fetchImpl, load.signal);
+      await checkHuggingFaceDatasetAccess(hfInfoUrl, load.fetchImpl);
```
Tests:
- Drop the third argument in `datasetAccess.test.ts`'s `'lets the dataset files decide when a stalled Hub API times out'`.
- Delete its `'… times out as a plain AbortError'` and `'still stops when the load was cancelled'` tests (`:277-292` at HEAD). The T1 end-to-end test and the `'still stops on %s'` cancellation case supersede them.
- Rewrite `useUrlLoader.test.ts:160-179` so the access-check request stalls until its signal aborts and then rejects with a plain `AbortError`. Under fake timers, advance `FETCH_TIMEOUT` (30 s), and expect the load to continue with the `Dataset access check failed` warning carrying a `TimeoutError`.

Checked in scratch: after the signature change, those two `useUrlLoader.test.ts` cases fail exactly as predicted, and nothing else does.
