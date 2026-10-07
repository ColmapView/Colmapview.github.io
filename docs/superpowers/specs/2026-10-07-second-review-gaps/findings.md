# Second review: verified findings (2026-10-07)

**Scope.** All unreleased changes on local `main` since v0.15.4 (`v0.15.4..e8a2a43`, 123 commits). That covers the original six Drive/dual-host/deferred-splat commits, the load-path review fixes, and the "close the review gaps" work, all merged locally and unpushed.

**Sources:**
- A `/code-review` pass. Every finding was independently verified against the code; most were reproduced with real-store scratch tests. Those tests are in the session scratchpad `rev2/`, in `verify_reload_cancel/`, `vt/src/hooks/zipCancelSettings.test.ts`, `vr/src/hooks/verifyR123.test.ts` and `v15m/src/`.
- An independent `codex review --base v0.15.4`.

Line numbers are at e8a2a43.

## G: the 15 confirmed defects, most severe first

**G1. A completed Drive job is never cleared.** `src/features/googleDrive/publishDataset.ts:175`
- `invalidate()` only sets `canRetry: false`.
- After the user publishes dataset A and loads dataset B, the Drive dialog still shows "Dataset saved to Google Drive" with A's viewer link and Copy button. The modal shows the form only when the phase is `idle`, so the user can share A's link believing B was saved.
- Hugging Face resets a finished publication when the source changes; Drive has no equivalent.
- `publicationRuntime.ts:17-18` calls `invalidate()`.

**G2. A cancelled or failed Reload drops the saved alignment.**
- All four Reload entry points call `resetTransform()` before the async `reloadFiles()`:
  - `TransformPanel.tsx:65`
  - `ExportPanel.tsx:205`
  - `globalContextMenuActionExecutor.ts:287`
  - `transformGizmoContextMenuExecutor.ts:25`
- Scenario: a dataset whose `colmapview.yaml` (or bound URL settings) saves alignment T is unedited. `confirmReload` skips the prompt because the transform equals T (`sessionActions.ts:60`), and the transform resets to identity. If the user then cancels during the parse, or the parse fails (for example `NotReadableError`), `complete()` never runs. The old scene stays at identity with no prompt.
- With applied edits, a confirmed-then-cancelled Reload keeps the edits and the marks but loses T.
- The controller set this aside in the previous final review. The new prompt baseline makes it reachable without any confirmation.

**G3. Cancelling a renderer decode also aborts the URL load that is still running.** `src/store/reconstructionStore.ts:649`
- Open a ZIP URL that contains COLMAP files and a splat, with a `colmapview.yaml` beside it and none inside.
- `processFiles` commits and hands the splat to the renderer, while `loadFromUrl` still awaits `applyOptionalSettingsBeside` (`useUrlLoader.ts:247`; up to 3 s, or several sequential HF probes).
- Cancel runs `showColmapOnly` plus `urlLoadController.abort()`. The settings wait rejects, `runLoad`'s catch returns silently, and `setSourceViewerState`/`applySavedViewerState` never run.
- Result: a COLMAP-only scene at identity with the default view, which Reload can't fix. Choosing None in the same window keeps the settings (repro: `transformX` 5 vs 0).

**G4. The revision pin requires `info.name === repoId`.** `src/features/googleDrive/prepareArchive.ts:92`
- `repoId` keeps the loaded URL's spelling, but the Hub returns the canonical id.
- Loading `https://huggingface.co/datasets/opsiclear/ngs` redirects to `OpsiClear/NGS` (checked live). Publishing to Drive then throws a non-permanent `GoogleDrivePublishError('Could not pin the source dataset revision.')`, and Retry fails forever.
- The same check at `hubClient.ts:39` tells HF publishers that their public dataset is not public and ungated.

**G5. The splat-only cancel fallback clears the whole scene even when other splats are listed.** `src/store/reconstructionStore.ts:642`
- Drop `a.spz` and `b.spz` with no COLMAP files, press `n` to switch to b, and cancel b's decode. `clear()` and `clearUrlLoadRequestFromLocation()` run, back to the landing page, losing a too.
- Choosing None, or cancelling during b's download, keeps the scene.
- Commit f301242 targeted "the only splat", and every test uses a single source.

**G6. Regression from v0.15.4: manifest and HF loads finish after the overlay is gone.**
- These loads wait for splat-catalog discovery and the optional `colmapview.yaml` after `processFiles`' `finally` has already cleared `urlLoading` (`fileDropzoneWorkflow.ts:644`; `urlLoaderManifestSource.ts:142`). The settings wait is up to 3 s after parsing, and discovery has no deadline.
- So the overlay disappears mid-load, and the late restore overrides the user's orbit and `selectedImageId`. The overlay then returns for the splat download.
- A folder dropped in the gap cancels the URL load and silently loses its tiles, saved alignment and view, and the Reload binding. A new URL load in the gap is refused with no message.
- v0.15.4 fetched settings and ran discovery before `processFiles`.

**G7. `requestedSplatSourceId` survives across datasets.** `src/store/reconstructionStore.ts:478`
- Every activation leaves it set, and so does every restore, including the automatic pick (`useUrlState.ts:167`).
- The next dataset's commit re-picks it through `setLoadedFiles` by id, path or bare file name, overriding that dataset's default. Example: 3DGS `point_cloud/iteration_7000/point_cloud.ply` across datasets, or `scene.ply` in different folders.
- This contradicts `fileDropzoneWorkflow.ts:358` ("any other load shows the files' default").

**G8. The privacy policy misstates provider data flows.** `public/privacy.html:79`
- It says opening a private HF dataset only authorizes repository read access. On publish-enabled builds (GitHub `/latest/` and `/dev/`), the loading dialog's sign-in requests `read-repos` and `contribute-repos`, and rejects the session without `contribute-repos`:
  - `config.ts:15`
  - `auth.ts:133`
  - `auth.ts:49`
- The Drive section (`:73`) omits that publishing reads the account's Drive `permissionId` and writes an `appProperties` marker (`upload.ts:124`, `:143`). `docs/google-oauth-verification.md:127` already discloses both.
- The same understatement is in `about.html:59` and `README.md:43`.

**G9. Signed-in users retry every anonymous 404 with the token.** `src/features/huggingface/datasetAccess.ts:47`
- This happens for public repos too. Each retry costs a CORS preflight plus a no-store GET, and nothing remembers that a repo is public.
- Splat and archive URLs walk the `colmapview.yaml` candidates one at a time under a fixed 3 s deadline that starts after the download.
- Together these produce false "saved view settings did not load in time" warnings, and can miss a parent-folder YAML that aligns the splat.
- The retry doubles mask and discovery probes, against the docs' "Public reads remain anonymous".
- The Hub answers anonymous requests for private or missing repos with 401, and marks missing files with `X-Error-Code: EntryNotFound`.
- This one was not reproduced; it needs real latency.

**G10. Drive preparation probes both mask URL candidates for every image.** `src/features/googleDrive/prepareArchive.ts:127`
- Probes are sequential and never give up; the viewer stops after 8 misses.
- Every URL or manifest load sets `maskUrlBase` to `masks/` by default. A remote non-HF dataset without masks (S3, GCS or a static host) therefore makes thousands of requests in a row before packaging (`preparePublication.ts:172-180`): 2,000 images means 4,000 GETs, about 2–10 minutes.
- One transient 500 aborts preparation, and Retry repeats every probe.
- Masks that are found are fully downloaded and held until packaging.
- Commit ffb63d6 routed S3/GCS onto this path.

**G11. An explicit None in a startup share link is applied before any scene exists.** `src/hooks/useUrlState.ts:186`
- `App.tsx:84` calls `applyShareConfig`, which calls `selectSplatSource('', { restore: true })`. That returns early because `loadedFiles` is null and records nothing.
- A non-empty id, by contrast, is stored by `setRequestedSplatSourceId` and re-picked at commit.
- So an archive URL commits and decodes its bundled default splat before the post-load restore turns it off. That is the GPU and memory spike None exists to avoid, and phones are hit worst.

**G12. A tile download started during the restore phase runs invisibly.** `src/hooks/useUrlLoader.ts:198`
- `runLoad`'s `finally` clears `urlLoading` unless the progress belongs to the active splat file.
- A tile the user starts during the restore (via `n`, or a pick in the point-cloud panel portaled above the overlay) cancels the restore download and starts tile X. The `finally` then sees `loadedFiles.splatFile` undefined and runs `setUrlLoading(false)`.
- The download keeps running with no overlay, no progress and no Cancel.

**G13. Closing the splat picker now means choosing None.** `src/components/modals/SplatPickerModal.tsx:65`
- The picker stays open when a tile is activated with `n`, and every open `ModalDialogShell` listens for Escape on the document.
- So pressing Escape, or opening Help with `i` and then pressing Escape, runs `handleClose` and then `showColmapOnly`. The tile the user just activated is unloaded and its downloaded bytes are dropped.
- In v0.15.4, closing the picker only hid it.

**G14. The "sign in and retry" recovery can't work for `#d=` links.** `src/components/dropzone/useDropZoneStoreFacade.ts:34`
- These links come from the share panel and the new Drive hand-off. The dataset URL exists only inside the compressed fragment.
- The Load URL dialog opens empty, and the startup link runs only once (`App.tsx:55-56`). Reloading the tab drops the memory-only HF session.
- `docs/hugging-face-loading.md:15-17` promises this retry works.
- Related: read-only HF builds have no sign-in control inside a loaded scene once the 8-hour token expires (`DropZone.tsx:231`).

**G15. Untested Drive paths.**
- The conversion from the XHR `onload` event to a `Response` (`src/features/googleDrive/upload.ts:62`), including header parsing for the 308 `Range` response. Every real Drive chunk upload goes through it, but the chunk tests inject `uploadImpl`, and the XHR fake has no `onload`, `status` or `getAllResponseHeaders`.
- The Drive runtime's invalidation subscriptions (`publicationRuntime.ts:15-21`).
- The 409 lost-create branch (`publishDataset.ts:101-109`).
- The guard that rejects a private file carrying an `anyone`/`domain` permission (`:140`).

## E: confirmed issues cut from the 15-item list

- **E1.** Drive's 128 MiB per-file limit applies to the exported `images.bin`, so reconstructions above roughly 700 images can't be saved to Drive. The docs mention the limit but not that it covers the COLMAP binaries.
- **E2.** A failed splat decode leaves the points in the near-invisible splat display (pre-existing). It is the one transition the range's display fixes missed.
- **E3.** A waiting tag deploy can be cancelled by a later push to `main` (pre-existing). The window is longer now, and the custom host is left stale.
- **E4.** On Safari/iOS 15.4–15.x, `AbortSignal.timeout` breaks HF sign-in: the popup stays open and no error shows.
- **E5.** The Load URL dialog's Drive hand-off uses `?url=`, which sends the file ID in the custom host's request. That contradicts the privacy policy's own advice.
- **E6.** A startup link's transform carries into the next dataset after Cancel.
- **E7.** The OAuth demo script tells the operator to click a button that doesn't exist.
- **E8.** The release section of the project `CLAUDE.md` (`C:\Users\HEQ\Projects\colmap_webview\CLAUDE.md`, outside the repo) doesn't say that every tag, including `-beta`, now deploys the custom production host.
- **E9.** `docs/hugging-face-publishing.md` gives the wrong callback path for the custom host.
- **E10.** A Drive folder link on GitHub Pages gets advice to use a picker that host doesn't have.
- **E11.** A signed-out user who mistypes an HF URL is told to sign in, because the Hub answers missing repos with 401.
- **E12.** `GoogleDrivePublishButton` reads a store directly, and `componentStoreBoundary` can't detect it.
- **E13.** The manifest and splat loaders end with an unconditional `commitSource()`.
- **E14.** `fetchWithTimeout` throws the browser's own error instead of its timeout reason, which forces per-caller fixes.
- **E15.** There is a dead Drive mode for signed-in readers without an API key.
- **E16.** `urlUtils` still has a leftover `fetchWithTimeout` re-export.

## C: Codex (`codex review --base v0.15.4`)

**C1. [P2] `clear()` ignores the ZIP-preservation option.** `src/store/reconstructionStore.ts:668`
- `clearReconstruction({ preserveZip: true })` (`store/actions/reconstructionActions.ts`) preserves the ZIP cache, then calls `clear()`, which now closes the archive unconditionally (`clearActiveZipArchive()`, added in 5af7c3a).
- Latent: `clearReconstruction` has no production caller.
