# Final Pre-Push Review: Findings

**Date:** 2026-10-07
**Range reviewed:** `v0.15.4..main` (155 commits, head 1984de8). Local `main` is 149 commits ahead of `origin/main` and has not been pushed.
**Review:** `/code-review` (17 finder angles, one verifier per candidate, mostly through scratch tests with the real store, hooks and workflow, plus Chromium e2e probes). The reviewer's evidence is in the session scratchpad `scratchpad/rev3/`: `candidates.md` (verdict list), `mirror*/…/zz_*` (scratch tests), `ORCH_full_e2e.log`.
**Verdict:** not ready to push. F1 fails the deploy workflow's e2e gate. F2–F5 are regressions or new defects. F6–F15 are lower severity.

**User decision (2026-10-07):** fix all 15 findings, triage the low-severity extras in the plan, then push.

## Findings

**F1. Self-contained archives make a sidecar request, so the CI e2e test fails.** `src/hooks/useUrlLoader.ts:284` (`settingsBesideOnce`, :88)
- `settingsBesideOnce` starts the `colmapview.yaml` request beside every archive URL up front, even when the archive carries its own settings.
- `e2e/dataset-viewer-settings.spec.ts:46` ("restores colmapview.yaml from a remote archive") expects 0 sidecar requests and gets 1 on every run and retry.
- deploy.yml's `validate` job calls `e2e.yml`, which runs `npx playwright test --project=chromium`. Every push to `main` and every tag deploy is blocked.
- The controller's full chromium run at 1984de8: 88 passed, 1 failed (this test). The test passes on the e8a2a43 tree.
- Introduced by bd47de0 (Task 8, R4 §G9's "start the request early"), not by 925be72, where the request was still lazy.
- It conflicts with `src/hooks/useUrlLoader.test.ts:1084` ("warns about settings beside an archive … (settings inside: true)"), which pins the extra aborted request.

**F2. Share links force None when no splat is showing.** `src/utils/splatFileSourcePolicy.ts:262`
- `getShareActiveSplatSourceId` now returns `''` (explicit None) whenever a dataset is loaded and no splat is active. v0.15.4 returned `null` there, so links kept the dataset's defaults.
- Share and embed links (`src/hooks/useUrlState.ts:63`, `!== null`) and publication snapshots therefore record a None the sharer never chose, for example after the sharer's splat list timed out or a splat failed.
- A recipient opening the link gets `''` before the commit (`requestSplatForLoad`). It overrides the dataset's `colmapview.yaml` choice and the automatic pick, `runLoad` skips `offerSplatPicker` (`!== ''`), and no splat is shown. The reviewer verified this end to end through `runStartupLoadPlan` and `useUrlLoader` (`zz_VA1-3_1`).

**F3. The 30 s discovery cap drops every tile on slow listings.** `src/hooks/urlLoaderManifestSource.ts:112`
- `SPLAT_DISCOVERY_TIMEOUT_MS` is a 30 s wall-clock deadline, counted from the end of parsing, over a strictly serial directory-listing crawl (`src/hooks/urlLoaderManifestFetch.ts:513`, `:540`).
- A healthy listing that is still progressing is aborted and every tile is discarded, the same way on every retry.
- Example: an nginx or Apache autoindex dataset with 40 3DGS blocks (`output/block_XX/.../point_cloud.ply`), opened over ~150 ms RTT with a small COLMAP model. The crawl needs ~285 sequential requests (~43 s). At ~33 s discovery is aborted, the scene shows 0 of 120 splats with the persistent "did not load in time … Open the dataset link again" warning, and reopening fails the same way.
- v0.15.4 and e8a2a43, which had no deadline, listed every tile. Reproduced through the real `loadManifestSource` discovery path (`zz_VEf-6_1`, `zz_VEf-6_2`).

**F4. A decode Cancel no longer stops a pending Reload under WebGPU.** `src/store/reconstructionStore.ts:671`
- `cancelLoading`'s renderer-decode branch now picks None and returns without `cancelPendingReconstructionLoad()` or `urlLoadController.abort()`. These calls were removed in 847992a (R1 §G3).
- The WebGPU layer never yields loading state (`src/components/viewer3d/WebGpuSplatCanvasLayer.tsx:283`), unlike Spark. So once it has replaced the overlay with its decode progress, "Cancel loading" no longer stops a pending Reload.
- Scenario:
  1. Desktop WebGPU, a local dataset with 2 splats and unsaved edits (transform scale 3, one pending deletion).
  2. With the Transform or Export panel open (portaled at z 2000, above the z 500 overlay; Tab also reaches it), press `n`, then Reload and confirm.
  3. While the Reload parses, the WebGPU decode progress replaces the Reload's own.
  4. Cancel loading picks None and hides the overlay. `isReconstructionLoadPending()` stays true, and the Reload commits invisibly: transform 3 → 1, deletions 1 → 0.

  At e8a2a43 the same Cancel aborted the Reload. Verified with the real workflow and store.

**F5. The Drive 2 GiB size check ignores remote images, then fails after up to 2 GiB.** `src/features/googleDrive/prepareArchive.ts:25`
- Drive packaging counts every remote (URL or Hub) image as 0 bytes in the upfront 2 GiB check (`src/features/datasetPublishing/preparePublication.ts:110` creates them with `size: null`).
- An over-limit remote dataset therefore downloads up to ~2 GiB, one file at a time, before failing with the permanent 2 GiB error.
- Example: the canonical wildflow HF folder (6,590 images, 23.6 GB) with no splat active. The check sees only the ~335 MB model. Packaging downloads ~500 images (~1.8 GB, 8–12 min measured), then ends with the permanent "exceeds the viewer's 2 GiB archive limit" error, with no Retry and all bytes discarded.
- A listing of `images/` (already done for `masks/`), or the sizes seen at load time, would reject it in seconds.

**F6. `/dev/` share links open the old `/v0.15.4/` build.** `src/utils/shareUrl.ts:21`
- `package.json` is still 0.15.4, and `getShareBaseUrl` pins github.io share links to `/v${__APP_VERSION__}/`.
- Once `main` is pushed, every Share or embed link made on `/dev/` opens `/v0.15.4/`. The new privacy policy says that build loads Google Analytics, while it recommends `/dev/` to avoid it. Recipients also get none of the range's fixes and cannot open private HF datasets.
- `.github/workflows/deploy.yml:72` has no check that a release tag matches `package.json`. If v0.16.0 is tagged before the bump, `/latest/` and the custom host report 0.15.4 and their links also open `/v0.15.4/`. The build-profile, `artifacts.spec` and `check-live` checks all pass, because they compare `package.json` with itself.

**F7. A failed `#d=` link's camera lands on the next dataset.** `src/appStartupRetry.ts:39`
- After a failed `#d=` startup link, the landing page now shows (`src/components/dropzone/useDropZoneStoreFacade.ts:34`, `hasUrlToLoad() && !urlError`). The dead link stays in the address bar, and the next load only withdraws the retry.
- The trackball's once-per-session URL camera restore (`useTrackballUrlCameraRestore`) then applies the failed link's view to the next, unrelated dataset. F5 also re-runs the failed link.
- Example: a signed-out user opens a Share link (with a camera) to a private HF dataset, gets a 401 and the landing panel, then picks Try a Toy (no `colmapview.yaml`) or drops a folder. After `setReconstruction` and `resetView`, the camera moves to the dead link's pose ([90,190,307] for a scene of radius 0.9), so the scene looks empty until Reset View (`zz_VA1-1`).

**F8. Drive mask probing does not match the viewer's mask loader.** `src/features/googleDrive/prepareArchive.ts:138`
- (a) A network error on the default `masks/` probe fails the whole publication as retryable. For example, a 404 without CORS headers raises a TypeError. A mask-less dataset on nginx with `add_header Access-Control-Allow-Origin *` (no `always`) gives "Drive publication could not finish … retry", and every Retry fails on the same first probe, although the viewer loads the dataset (`fetchUrlMask` returns null).
- (b) A 403 counts as a miss, so the 8-miss cutoff silently drops masks the viewer still loads. Example: an S3 bucket without list access (403 for missing keys) whose first 8 images have no mask. The viewer shows the later masks, the Drive ZIP has none, and no warning is shown.
- The 500/401/410 handling is deliberate (earlier rulings C2 and G10); only the CORS-less network error and the 403 are in scope.

**F9. The restore re-applies transforms after the splat download.** `src/hooks/useUrlState.ts:133`
- `restorationConfig` keeps `...config`, so the saved or shared scene and splat transforms, already applied before the restore download, are applied again after it.
- This reverts any transform edit made during the download, and double-transforms the points after an "Apply transform to data" made then.
- Example: open a `?url=` dataset whose `colmapview.yaml` has transform T (+5 x) and a lazy active tile. While "Downloading splat" shows, Tab to the Transform panel (above the overlay) and press Apply: the data is baked by T and the transform becomes identity. When the download finishes the transform is T again, so the points render at T∘T (x+10) and the splat at T∘S (x+5). Verified in Chromium (`zz_VA1-5`).

**F10. Spark callbacks don't yield to a pending tile download.** `src/components/viewer3d/PointCloud/SplatLayer.tsx:349`
- The E2/G12 fixes are incomplete. Spark's finish and fail callbacks yield only to pending dataset loads, not to a pending tile download, so finishing or failing the old splat calls `setUrlLoading(false)` under a download started with `n` or from the panel.
- `dropFailedSplat` stands aside for that download. If the download then fails, the failed splat stays active in the near-invisible splat point preset (the E2 symptom).
- Example: remote tiles `old.ply` (Spark decoding, overlay up) and `next.ply` (lazy); press `n`, and `next` downloads.
  - If `old` finishes, `urlLoading` goes false and `next` downloads with no overlay or Cancel.
  - If `old` fails instead, `dropFailedSplat(old)` returns early. If `next`'s fetch then fails, `splatFile` stays `old.ply` with the splat point preset (size 1, opacity 0.2).
- The writers predate the range, but the fix range rewrote both callbacks.

**F11. A splat chosen in the panel during a load hides the overlay and Cancel.** `src/components/viewer3d/useViewerControlsController.ts:378`
- Only `n` is blocked during a pending dataset load. The Point Cloud panel's Splat File select still calls `selectSplatSource`, which clears the load's `urlLoading` and `urlProgress`. The overlay and Cancel disappear, and `handleDrop`'s gate reopens.
- A lazy pick still downloading at commit is read from the on-screen splat (`src/hooks/useFileDropzone.ts:110`), so the incoming dataset commits None, or the old splat's namesake, instead of its own saved choice.
- Example: in touch mode (the panel stays open, portaled above the overlay), or via Tab, drop a folder containing `default.spz`, `saved.spz` and a `colmapview.yaml` that selects `saved.spz`.
  - While "Parsing COLMAP files..." shows, pick None or a downloaded tile: the overlay and Cancel vanish, and a second drop is accepted and silently aborts the first load.
  - Pick a lazy tile of the old scene instead: its download is cancelled at commit, and the new dataset shows no splat (or the old namesake) instead of `saved.spz` (`zz` Si-1, A3-3/D-1).

**F12. Drive job invalidation is wrong in both directions.** `src/features/googleDrive/publishDataset.ts:179`
- (a) G1's fix resets only a completed job. A failed or cancelled job keeps the previous dataset's message, error and "Review file in Drive" link after the dataset changes. Example: publish dataset A as shared, and sharing is not confirmed, so the job fails. Load B: `invalidate()` only sets `canRetry` false. The dialog over B still shows A's failure and A's file link, with no Retry, and the toolbar icon highlighted.
- (b) Any pending deletion mark (`src/features/datasetPublishing/publicationRuntime.ts:21`) cancels an in-flight upload of an already-built ZIP, with no Retry, even after the mark is removed. Example: start a 1.5 GiB upload, close the dialog as it suggests, and mark one gallery image. The job is cancelled and the archive released; unmarking and Retry do nothing, so the ZIP must be rebuilt and re-uploaded. HF publishing keeps uploading in the same case.

**F13. Publication failures are misclassified in both directions.** `src/features/datasetPublishing/preparePublication.ts:172`
- (a) An original missing from a local dataset's captured file map throws a non-permanent HfError, although its siblings at :164 are permanent, so Drive offers Retry forever. Example: drop only `sparse/0` (no images) and Save to Drive. The error is "Could not retrieve selected file images/<first>.jpg." with Retry, and each Retry re-exports the model and fails the same way.
- (b) A remote splat now carries its load-time size (:197), so a source updated since the load fails permanently. The advice "Start a new publication" cannot succeed until the dataset URL is reopened. Example: load an HF folder, then the owner pushes a resized `tile_3.ply`. Publishing to HF fails on every attempt with the permanent "The size of splats/tile_3.ply changed. Start a new publication.", even after Reload, which keeps the stale size.

**F14. The preview smoke test fails for refs before the `#d=` hand-off.** `scripts/deployment/tests/artifacts.spec.ts:149`
- The trusted preview smoke runs the default branch's `artifacts.spec.ts` against the selected ref's artifact. It now requires the `#d=` Drive hand-off added in 41d8919, without the version-skew guard used at :101-102.
- So "Deploy isolated hosting preview" fails for any ref from 5af7c3a up to 41d8919, including live production c51741b and `origin/main` 0a1d01c.
- Example: dispatch the preview workflow with `ref=c51741b`, for instance to rehearse a rollback. The build job passes with that ref's own spec. The publish job runs main's spec, the old artifact's "Use Google Drive" href is `.../?url=...`, the `${customOrigin}/` expectation fails, and nothing is published.

**F15. No test pins G6's `beforeSceneCommit` hand-off.** `src/hooks/useFileDropzone.ts:115`
- G6's settle-before-commit reaches the workflow only through this hand-copied `beforeSceneCommit` field. No vitest or e2e test runs a URL load through the real hook: `useUrlLoader.test.ts` mocks `./useFileDropzone`, and `processWithStore` bypasses the copy.
- Also unpinned:
  - the in-load-pick revision hand-offs (`useFileDropzone.ts:40`, `:121`);
  - the point-cloud settle argument (`src/hooks/fileDropzoneWorkflow.ts:456`, `:497`);
  - the non-abort folder-picker error branch (`src/hooks/fileDropzoneLocalSources.ts:239`).
- Scratch mutations prove the gap:
  - Deleting line 115 leaves the full vitest suite and the related Playwright specs green, yet every manifest, HF, archive and splat URL load then commits before its settings and splat list settle.
  - The same holds for deleting `:40` or `:121` (a None picked while a folder scans is ignored, and the default splat decodes).
  - It also holds for dropping `settleBeforeCommit` at `fileDropzoneWorkflow.ts:456`/`:497` (point-cloud `.ply` URLs commit before their settings).

## Low-severity extras (confirmed, cut by the review's 15-item cap)

Each needs a disposition in the specs: fix it, or set it aside with a reason.

- **X1.** Signed in, a gated HF dataset gets the generic "account cannot read" message (`src/features/huggingFace/datasetAccess.ts:50`), although `docs/hugging-face-loading.md:36` says gated datasets are reported as gated. The `gated-repos` OAuth scope may also be missing.
- **X2.** Drive permanently refuses assets in HF model or Space repos (`src/features/googleDrive/prepareArchive.ts:102`), with a misleading error. The `?download=true` case is unreachable.
- **X3.** Drive's Hub API reads (`prepareArchive.ts:91`, `:117`) have no backoff for 429 or 5xx.
- **X4.** `.github/workflows/deploy-preview.yml:108` deploys whatever the selected ref's build output holds, including a `_worker.js`, with the account token. That contradicts the workflow's own isolation comment, for example when a maintainer previews an untrusted PR.
- **X5.** Dropping files while the Load URL dialog is open leaves "Cancel loading" hidden behind the locked dialog. A URL load over a visible scene is possible.
- **X6.** Timeout warnings are dismissed when a local load starts, so a failed or cancelled drop loses them.
- **X7.** Escape in Help also closes the image viewer and tool windows underneath. This predates the range.
- **X8.** A missing explicit manifest splat now produces an error toast and a picker. v0.15.4 only logged it.
- **X9.** A splat-only scene whose only splat fails decodes to an empty scene with the landing panels hidden. This is not a regression.
- **X10.** Efficiency: Drive packaging and mask probing are strictly serial, Retry re-downloads everything, and uploads use 8 MiB chunks.
- **X11.** Cleanup:
  - (a) `DropZone.prepareUrlLoad` reads the store through `getState()`, which the facade boundary test cannot see, and it has drifted from `runLoad`.
  - (b) `requestedSplatSourceId` is set after every activation, so the in-load pick rule silently depends on that leftover value, and the with-scene branch is dead.
  - (c) The four Reload entry points are copies of each other.
  - (d) There are dead branches: `clearCachesOnFailure`, the post-G6 `settle()`, and the `committed` guards.
  - (e) The two warning modules are duplicates.
- **X12.** `docs/google-oauth-verification.md:140` tells users to disconnect from a dialog that does not exist once a scene is open.

## Refuted, or covered by a deliberate ruling (no action)

- Picker Escape cancelling a download started with `n` (R2 §G13 rules this).
- A saved None decoding the default splat (no decode starts in that window).
- Reload losing a merged splat (documented and pinned by a test, R1-load-path.md:1180).
- A listed Hub mask that returns 404 failing the publication (G10 ruling).
- Reload during a Drive upload (a Reload creates a new ReconstructionService, so the job is invalidated correctly).
- The duplicate HF tree walk (predates the range, now overlapped with the downloads); zip download memory (predates the range; not the peak); E2 residual #2; the `importConfig` ordering.
