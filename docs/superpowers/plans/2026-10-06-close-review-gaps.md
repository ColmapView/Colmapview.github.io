# Close the Review Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every open gap from the load-path review work, then merge to `main` locally. The gaps are:
- the open Important N1;
- all deferred minors;
- original review items 6–9 and the verified lower-priority findings;
- Hugging Face on `/dev/`;
- flakes, test noise, and test-file type checking.

**Architecture:** Most items are small, targeted fixes. Each one is already specified in a research spec with verified code and tests. The task order lands test pins before the production changes they guard, and serializes tasks that share files.

**Tech Stack:** TypeScript 5, React 19, Zustand, Vitest 4 (jsdom), ESLint 9, GitHub Actions, Node test runner for deployment scripts.

**Spec:** `docs/superpowers/specs/2026-10-06-close-review-gaps/design.md` (scope and rulings). The binding detail lives in `R1-load-path.md`, `R2-tests.md`, `R3-publishing.md`, `R4-deploy.md` and `R5-ui.md` in the same folder.

## Global Constraints

- **Working directory:** run every command from `colmap-webview/`.
  - Focused tests: `npx vitest run <path>`.
  - Full suite: `npx vitest run`.
  - Typecheck: `npx tsc -b --force`.
  - Lint: `npm run lint`.
  - Deploy-script tests: `node --test scripts/deployment/profiles.test.mjs` (and `npm run test:deployment:config`).
- **Before every commit:** the full `npx vitest run` passes, `npx tsc -b --force` exits 0, and `npm run lint` is clean. Deploy CI runs the full suite.
- **Store access:** components reach stores only through `*StoreFacade` modules (`src/components/componentStoreBoundary.test.ts`).
- **Styling:** hand-written CSS only; add no new classes.
- **Abort signals:** use `anySignal` from `src/utils/abortSignals.ts`, never `AbortSignal.any`.
- **Comments:** keep them brief and only where they explain why.
- **Line endings:** keep CRLF in files that already use it:
  - `fileDropzoneWorkflow.test.ts`
  - `splatFileSourcePolicy.test.ts`
  - `useFileDropzone.test.ts`
  - `useTransformPanelStoreFacade.test.ts`
- **Spec code:** where a research spec gives code or test code, that code is the requirement. Adapt it only to fit changes made by earlier tasks in this plan, and record any deviation in your report.
- **Scratchpad patches:** the specs mention validated patches under the session scratchpad (`…/scratchpad/exp-r1/`, `…/scratchpad/probe/`, `…/scratchpad/mirror/`). These are optional reference material. The repository is the source of truth.
- **Commits:** each message summarizes the user-visible effect and ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never amend. Never push.
- **Owner actions are out of scope.** Do not perform them:
  - deleting GitHub caches;
  - GA4 property settings;
  - tagging a release;
  - pushing.

## Review Focus

1. **A restored view under navigation settings that differ from the visitor's** (horizon lock, axes convention, undistortion, projection). The camera must end at the saved view and stay there after a slow splat download. *Task 8.*
2. **Reload with no splat showing on a dataset whose saved display is tuned for splats.** The COLMAP points must stay visible. *Tasks 7, 8, 10.*
3. **Reload after picking a local splat, or None, then Reload again.** The choice must survive both reloads on the COLMAP, splat-only and images-only paths. *Task 10.*
4. **Pressing `n` while a new dataset loads.** The new dataset arrives with its own default or saved splat. *Task 16.*
5. **A preview of an untrusted ref, followed by a tag deploy.** No npm cache written by the preview's build job can reach a step that holds `CLOUDFLARE_API_TOKEN`. *Task 1.*

---

### Task 1: CI — no untrusted npm cache reaches the Wrangler token steps (C5)

**Spec:** R4 §2 "C5: CI cache poisoning into the token-holding Wrangler steps": Verified / Change (exact) / Validation / Risks.

**Files** (from the spec):
- `.github/workflows/deploy-preview.yml` (build `setup-node`; the "Upload preview only" env)
- `.github/workflows/deploy.yml` (the "Deploy custom production" env)
- `scripts/deployment/profiles.test.mjs` (the token/cache contract test)
- `docs/dual-hosting.md` (around :47)

- [ ] Step 1: Add the spec's contract test to `profiles.test.mjs`. Run `node --test scripts/deployment/profiles.test.mjs` and confirm it FAILS on the current workflows.
- [ ] Step 2: Apply the spec's exact workflow changes:
  - in the preview build job, remove `cache: npm` and add `package-manager-cache: false`;
  - on both Wrangler upload steps, set `npm_config_cache: ${{ runner.temp }}/wrangler-npm-cache`.
- [ ] Step 3: Update the doc line, run the deploy-script tests (PASS), then the full suite, `tsc -b --force` and lint.
- [ ] Step 4: Commit with the subject "Keep untrusted preview builds from seeding the deploy token's npm cache".

### Task 2: Deploy — Hugging Face sign-in and publishing return to `/dev/` (HF-DEV, user decision)

**Spec:** R4 §1 "HF-DEV: restore Hugging Face sign-in and publishing on `/dev/`" (all subsections). Drive stays off on `/dev/`. Preview builds and the custom origin do not change.

**Files** (from the spec):
- `.github/workflows/deploy.yml` (around :41-45)
- `scripts/deployment/profiles.test.mjs` (contract test and profile assertions)
- `docs/dual-hosting.md`
- `docs/hugging-face-loading.md`
- `docs/hugging-face-publishing.md`

Also fix the two stale lines in `hugging-face-publishing.md` that say publishing is off; it has been on since v0.15.1. The optional `validateGithubHfConfiguration` and preflight summary from the spec are included only if the spec marks them recommended.

- [ ] Step 1: Write the spec's contract test (RED), then apply the workflow expressions (GREEN).
- [ ] Step 2: Update all three docs so they agree.
- [ ] Step 3: Run `npm run test:deployment:config`, the full suite, tsc and lint. Commit with the subject "Restore Hugging Face sign-in and publishing on /dev/".

### Task 3: Deploy hygiene — smoke report uploaded, gate order pinned, live check retries, preview URL from Wrangler

**Spec:** R4 §4 "Smoke report never uploaded", §5 "Gate-order test is vacuous", §6 "check-live: bare URL, no retry after readiness", and §7 "Preview URL assumes subdomain equals project name". Use the recommended variant: derive the URL from Wrangler's output.

**Files** (per the spec):
- `scripts/deployment/playwright.config.ts`
- the workflow upload paths
- `scripts/deployment/profiles.test.mjs`
- `scripts/deployment/check-live.mjs`
- `scripts/deployment/artifact-verification.mjs`
- `scripts/deployment/profiles.mjs`
- a new `scripts/deployment/preview-url.mjs` with its test
- `.github/workflows/deploy-preview.yml`

This task runs after Tasks 1–2, because it shares `profiles.test.mjs` and the workflow env blocks.

- [ ] Step 1: For each of §4–§7, write the spec's test (RED), apply the change (GREEN), and commit separately. Subjects:
  - "Upload the deployment smoke report"
  - "Make the gate-order test fail on a renamed or moved gate"
  - "Retry the live check after readiness"
  - "Read the preview URL from Wrangler"
- [ ] Step 2: Run the deploy-script tests, the full suite, tsc and lint after the last commit.

### Task 4: Privacy policy discloses Google Analytics in archived GitHub builds (C4)

**Spec:** R4 §3 "C4: privacy policy versus Google Analytics in archived GitHub builds". Change `public/privacy.html` as the spec specifies: the date, the summary bullet, section 7, and the "Clear this browser" bullet. Include the spec's optional guard test only if the spec recommends it. Nothing is pushed to gh-pages.

- [ ] Step 1: Apply the exact wording and run the smoke and content tests the spec names.
- [ ] Step 2: Run the full suite, tsc and lint. Commit with the subject "Disclose Google Analytics in archived GitHub Pages versions".

### Task 5: Test hygiene — URL loader and settings tests (R2-1)

**Spec:** R2 sections N1, N2, N3, C2, C3, C4, C13, C14, C15 and C16.

**Files:**
- `src/hooks/useUrlLoader.test.ts`
- `src/hooks/urlLoaderViewerState.test.ts`
- `src/features/huggingface/datasetAccess.test.ts`

Test-only changes: silence or assert the noise, add the coverage tests, fix the titles, and pin exactly one warning. Each new coverage test must fail when its guarded line is mutated, as the spec's mutation notes describe. Record the mutation checks in your report.

- [ ] Step 1: Apply each section's test code.
- [ ] Step 2: Run the three files and confirm their output is pristine (no stray stdout/stderr). Then run the full suite, tsc and lint.
- [ ] Step 3: Commit with the subject "Quiet and tighten the URL loader and settings tests".

### Task 6: Test pins — store cancellation and selection (R2-3), before the store refactors

**Spec:** R2 C1 (`#d=` stripping), C5 (a real downloaded-splat switch with the same basename in a different folder), C6 (`urlError` kept when the renderer owns progress) and C17 (`setSourceViewerState` with no `droppedFiles` and with `null`).

**File:** `src/store/reconstructionStore.test.ts`.

C6 pins `urlError` preservation in the renderer-owned restore branch of `selectSplatSource`. It stays as written; Task 7 does not change that branch.

- [ ] Step 1: Add the tests, run the file, then the full suite, tsc and lint.
- [ ] Step 2: Commit with the subject "Pin cancellation and selection behaviour before the store refactor".

### Task 7: Store — one "COLMAP only" transition, visible points without a splat, warning cleared, failures visible

**Spec:** R1 "Recommended task grouping and order", Task 1: A7, then A6, then A3's store part, then A2. Each item's Fix and Tests sections are binding:
- A7 is the renderer-owns-progress helper.
- A6 is `showColmapOnly`. Cancelling a decode clears `urlError`, matching None. Assert that in a separate test on `cancelLoading`'s decode branch, and leave R2 C6 unchanged: C6 covers `selectSplatSource`'s renderer-owned restore branch (Codex plan review #3).
- A3 is the `restorePointDisplayWithoutSplat` export (renamed from `restorePointDisplayForSplatlessDataset`) and its call in `showColmapOnly`.
- A2 dismisses the timeout warning when the scene is cleared.

**Plus design ruling 1 (lazy tile failures are visible).**
- In `selectSplatSource`'s failure branch, also set `error: \`Failed to load splat ${splatName}: ${details}\``. Use the same `details` string as `urlError.details`. A superseded or aborted attempt still sets nothing.
- Test it in `reconstructionStore.test.ts`: a lazy tile whose fetch returns 404 leaves `error` containing `Failed to load splat`, and `urlError` is still set.
- Update any existing test that asserted `error` stays null in that path.
- **The toast must not outlive the failure (Codex plan review #4).**
  - A later successful activation of any splat clears the splat-failure `error`: the downloaded-file branch, a lazy download or a byte-less activation.
  - Choosing None clears it too.
  - Clear only the error this path set. Keep the message in module state and clear `error` only when it still equals that message, so unrelated load errors are untouched.
  - Test: a failure followed by a successful retry leaves `error` null. An unrelated `error` survives a successful activation.

**Files:**
- `src/store/reconstructionStore.ts`
- `src/hooks/optionalSettingsWarning.ts`
- `src/hooks/urlLoaderViewerState.ts` (per the spec)
- `src/store/index.ts` (the export)
- `src/store/reconstructionStore.test.ts`
- the test-import updates the spec lists

- [ ] Step 1: Run A7 and A6 as refactors. The existing pins stay green; run the A7 mutation check from the spec.
- [ ] Step 2: Write the A3 and A2 tests and the ruling-1 test (RED), then implement (GREEN).
- [ ] Step 3: Run the full suite, tsc and lint. Commit per item, or as two commits: "Share one COLMAP-only transition in the store" and "Keep points visible without a splat and surface failed splat downloads".

### Task 8: Restoration order — navigation goes with the view (A1, the open Important N1) plus A3's re-application

**Spec:** R1 Task 2, A1 (all subsections), and A3's re-application line. Apply the A1 code exactly as written:
- `VIEW_NAVIGATION_FIELDS` covers `cameraMode`, `cameraProjection`, `cameraFov`, `horizonLock`, `flyTransitionDuration`, `autoRotateMode`, `autoRotateSpeed`, `undistortionEnabled` and `ui.axesCoordinateSystem`;
- `pickSectionFields`, `viewConfig`, and `restorationConfig` skipping navigation;
- `restorePointDisplayWithoutSplat()` runs when no splat ends up active.

The spec notes this is the one patch the research could not execute. Run every A1 test RED then GREEN, and record that in the report.

**Undistortion re-fly must not overwrite a restored view (Codex plan review #1).**
- The problem:
  - Navigation (including `undistortionEnabled`) and the saved view now land in the same tick when no splat download intervenes, as in a Reload or a restoration without a download.
  - React batches those writes.
  - `TrackballControls`' undistortion effect (`src/components/viewer3d/TrackballControls.tsx`, around :239) then queues a panorama fly-to after the saved-view effect, and it overwrites the restored position.
- Fix: when a saved-view restoration is pending, the undistortion toggle must not re-fly to the selected panorama. For example, the camera store records that a restore fly is in progress, and the undistortion effect skips its fly while it is. Choose the smallest mechanism the effect code allows, and justify it.
- Add a mounted regression test that renders `TrackballControls` with a selected panorama. Apply saved settings where `undistortionEnabled` differs from the visitor's, with no splat download in the restore and Reload shapes. The camera must end at the saved view.

**Files:**
- `src/hooks/useUrlState.ts`
- `src/store/index.ts`
- `src/hooks/useUrlState.test.ts` (5 tests)
- `src/hooks/useUrlLoader.test.ts` (the extended I1 test)

- [ ] Step 1: Write the A1 and A3 re-application tests (RED).
- [ ] Step 2: Apply the code (GREEN), then run the full suite, tsc and lint.
- [ ] Step 3: Commit with the subject "Apply saved navigation with the restored view".

### Task 9: Test hygiene — drop and reload tests (R2-2), before the Reload change

**Spec:** R2 N4 (act warnings and logs in `useFileDropzone.test.ts`), F3, C7, C8–C11, and C12 (Reload button tests). Include the new `ExportPanel.test.tsx`, plus the context-menu and gizmo facade tests.

**Files:** as listed in R2's "Recommended task grouping", Task R2-2.

R2's dependency matrix is binding:
- `loadedFilesStore` and C7–C9 are the base Task 10 builds on;
- C12 is written to survive Task 12's TransformPanel confirm.

- [ ] Step 1: Apply the test code and confirm the touched files print nothing.
- [ ] Step 2: Run the full suite, tsc and lint. Commit with the subject "Tighten the drop and Reload tests".

### Task 10: Reload keeps the splat state on screen everywhere (A8, plus design ruling 2)

**Spec:** R1 Task 3, A8 (all subsections):
- `carryOverSplatState` and `getSplatFileKeptOnReload` in `splatFileSourcePolicy.ts`, with `findSplatSourceById`'s parameter widened;
- the workflow option renamed `preserveRemoteSplatSources` → `reload`;
- `withoutSplatChoice` moved into the workflow so it applies to retained settings AND the project's own YAML;
- `reloadFiles` passes `reload: true`.

Include A3's Reload integration test.

**Design ruling 2 (extension).** The non-COLMAP Reload paths keep the on-screen splat state too:
- in the splat-only update path (`updateLoadedSplatFile`, reached when files hold only splats), use the kept splat instead of `splatFiles[0]` when `reload` is set;
- in the images-only path, pass the kept splat to `runImagesOnlyLoad`;
- use `carryOverSplatState` / `getSplatFileKeptOnReload` for both.

Add tests:
- a splat-only scene with two local splats, pick the second, reload, and it stays;
- an images-only scene with a splat and None chosen: after reload it stays None.

**Files:**
- `src/utils/splatFileSourcePolicy.ts`
- `src/hooks/fileDropzoneWorkflow.ts`
- `src/hooks/useFileDropzone.ts`
- their test files

- [ ] Step 1: Write the A8 tests and the ruling-2 tests (RED), then implement (GREEN).
- [ ] Step 2: Run the full suite, tsc and lint. Commit with the subject "Keep the on-screen splat, or none, on every Reload".

### Task 11: URL loader hardening — settings bind only to the loader's own scene (A4 plus design ruling 3); the HF size check surfaces account answers (A5)

**Spec:** R1 Task 4, A4, the `sceneReplaced` flag, with its new test and the two mock updates. R1 Task 5, A5: `validateZipUrl` rethrows `HfError` but keeps the CORS/network fallback and the timeout.

**Design ruling 3 (extension).** `loadZipUrlSource` (`src/hooks/urlLoaderZipSource.ts`) installs the active archive and source info only when processing replaced the scene. A merge into the open scene installs neither. Add a test in `urlLoaderZipSource.test.ts` whose `processFiles` merges without calling `onSceneReplaced`: the archive and source info stay untouched. Make sure the merged-then-discarded archive is closed and does not leak.

**Files:**
- `src/hooks/useUrlLoader.ts` and its test
- `src/hooks/urlLoaderZipSource.ts` and its test
- `src/utils/zipValidation.ts`, `zipValidation.test.ts`, `zipLoader.test.ts`

- [ ] Step 1: For A4, ruling 3 and A5 in turn: RED, then GREEN, then a commit. Subjects:
  - "Record saved settings only for the loader's own scene"
  - "Install an archive only for the scene it loaded"
  - "Surface Hugging Face account answers from the archive size check"
- [ ] Step 2: Run the full suite, tsc and lint after the last commit.

### Task 12: Reload confirms everywhere, says what it does, and prompts only when something would be lost (A9 plus design ruling 4)

**Spec:** R1 Task 6, A9:
- TransformPanel confirms through its facade (`confirmReload` added to `useTransformPanelStoreFacade`; that facade's test pins its action keys);
- the new confirm wording in `sessionActions.ts`.

**Design ruling 4 (extension, revised after Codex plan review #2): the baseline is what Reload would re-apply.**
- Compute the baseline from the Reload inputs themselves, when the prompt is decided. Do not record it on every settings application: merges and settings-only imports apply settings without replacing `droppedFiles`, and Reload never re-applies those.
- The baseline is the scene and splat transforms from the first of these that applies:
  1. the retained `sourceViewerState`, when its `files` is the current `droppedFiles` (a URL dataset);
  2. otherwise, the project's own `colmapview.yaml` among `droppedFiles` (`findDatasetViewerSettingsEntry` + `parseDatasetViewerSettings`; read the file asynchronously);
  3. otherwise, identity.
- `confirmReload` is already async, so it computes this baseline and compares the current `transform` and `splatTransform` against it.
- If `hasUnsavedReloadState` has other synchronous callers, check them. Keep a synchronous identity fallback, or make the callers async, whichever the call sites allow. Justify the choice.

Tests:
- a published dataset with a saved alignment and no edits: `confirmReload()` resolves true without prompting;
- after changing the splat transform it prompts;
- a share-link override that differs from the saved alignment prompts, because Reload would change it;
- a dataset without settings keeps today's identity behaviour;
- a new dataset never inherits the previous baseline;
- a local project with its own `colmapview.yaml` alignment and no edits does not prompt;
- after a settings-only import or a merged load changed the transforms, it prompts: Reload would restore the dataset's own settings, not the import.

**Files:**
- `src/components/viewer3d/panels/TransformPanel.tsx` and `useTransformPanelStoreFacade.ts` and their tests
- `src/store/actions/sessionActions.ts` and its test (compute the baseline here from the Reload inputs)

- [ ] Step 1: Write the A9 tests and the ruling-4 tests (RED), then implement (GREEN).
- [ ] Step 2: Run the full suite, tsc and lint. Commit with the subject "Confirm every Reload and only when edits would be lost".

### Task 13: Publishing — unknown splat sizes and private-source messages (C1, D4)

**Spec:** R3 "Recommended task grouping", T1: C1 (keep positive sizes; treat the catalog's `0` as unknown) and D4 (the correct message for a private or gated HF source). Apply each section's Fix and Tests.

**Files:**
- `src/features/datasetPublishing/preparePublication.ts` and its test
- `src/features/huggingface/hubClient.ts` and its test

- [ ] Step 1: RED, then GREEN, then the full suite, tsc and lint. Commit with the subject "Publish remote splats of unknown size and explain private sources".

### Task 14: Drive publication — mask probing, oversized masks, released inputs (C2, D6, D5)

**Spec:** R3 T2: C2, D6 and D5, plus the C1 Drive regression test.
- Apply D6's `upload.ts` and `publishedViewerState.ts` changes before the C2 and D5 hunks.
- D5 and D6 share a `catch` block, so implement them together.
- D5 clears the job's closure fields; setting `job = null` alone is not enough.

**Files:**
- `src/features/googleDrive/prepareArchive.ts`
- `upload.ts`
- `publishDataset.ts`
- `src/utils/publishedViewerState.ts`
- their tests

- [ ] Step 1: RED, then GREEN, then the full suite, tsc and lint.
- [ ] Step 2: Commit as "Keep Drive publication going past missing masks" and "Release Drive publication inputs and name oversized masks", or one commit per item.

### Task 15: Drive links and account controls — hand-off, `/u/N/` links, new tabs, sign-in kept (C3, D2, D1)

**Spec:**
- R3 T3, C3: the `getGoogleDriveHandoffUrl` helper using `#d=` via `buildShareableUrl`, and the new `useGoogleDrivePublishButtonStoreFacade` with its test.
- R3 T3, D2: accept `/file/u/N/d/ID/view` and `/u/N/uc?id=`. Include the "optional" sibling `target="_blank"` fixes in `DatasetAccountButtons.tsx` and `UrlInputModal.tsx`; per the design these are in scope.
- R5, D1: disable Load URL while a sign-in is pending (`disabled={connecting}` on both buttons), with its two tests.

**Files:**
- `src/components/viewer3d/GoogleDrivePublishButton.tsx`
- the new `googleDriveHandoff.ts`
- the new facade
- `src/utils/googleDriveUrl.ts`
- `src/components/dropzone/DatasetAccountButtons.tsx`
- `src/components/modals/UrlInputModal.tsx`
- their tests

In the probe's C3 diff, the dynamic import path is absolute. Use the repo's `'../modals/GoogleDrivePublishModal'`.

- [ ] Step 1: Do C3, D2 and D1 in turn: RED, then GREEN, then commit. Subjects:
  - "Open the Drive host in a new tab with the dataset"
  - "Accept account-scoped Drive links"
  - "Keep a pending sign-in when loading a URL"
- [ ] Step 2: Run the full suite, tsc and lint after the last commit.

### Task 16: The `n` hotkey during a load (D3)

**Spec:** R5, D3.
- Part A (workflow): honor an in-load choice only if it is None (`''`) or names an incoming source.
- Part B (hotkey guard): add `isReconstructionLoadPending()` and expose it through the viewer-controls facade. `n` does nothing while a dataset load runs.
- Apply all three tests: workflow, controller hotkey, and lifecycle.

**An ignored stale choice must not suppress the incoming dataset's saved selection (Codex plan review #5).**
- A stale choice is one made during the load that names no incoming source. Part A ignores it at commit, but its `splatSelectionRevision` bump would still fail `applySavedViewerState`'s `canRestoreSplatSelection()` guard (`useUrlState.ts`, around :110).
- That bump can come from the guarded hotkey, but also from a splat picker left open.
- Without a fix, the incoming default would win over the dataset's YAML-selected splat.
- Carry the choice's validity into the restoration guard. For example, when the workflow ignores a stale choice, it re-bases the revision that its `onViewerState` restoration compares against. Choose the smallest mechanism and justify it.
- Add a workflow test: a non-default splat selected in the incoming dataset's own `colmapview.yaml`, plus a stale choice for an outgoing source made during the load. The YAML-selected splat must end up active.
- A valid in-load choice (an incoming source or None) still beats the YAML, as today.

**Files:**
- `src/hooks/fileDropzoneWorkflow.ts`
- `src/wasm/reconstructionLoadLifecycle.ts`
- the viewer-controls facade and hotkey hook
- their tests

- [ ] Step 1: RED, then GREEN, then the full suite, tsc and lint. Commit with the subject "Keep the incoming splat when n is pressed during a load".

### Task 17: Flakes and test-file types (R2-4, plus ruling 5 and X3)

**Spec:** R2 F1 (read the tree once at collection time), F2 (a static SDK import), C18, T1 (one typed mock handle for libarchive's `ArchiveReader`), T2 (the builder fake fixes) and X1. F3 is handled in Task 9. R2 X3 (remove the stale `declare module 'libarchive.js'` augmentation). R2 X5 (`ViewerToolModals.test.tsx`: statically import the lazily loaded modals, or give `findBy*` an explicit timeout; prefer the static import; and the `integrity.test.ts` budget). Apply the F1 collection-time pattern to `componentStoreBoundary.test.ts`.

**Files:** as listed in R2 Task R2-4, plus `src/components/viewer3d/ViewerToolModals.test.tsx`, `src/parsers/integrity.test.ts`, `src/components/componentStoreBoundary.test.ts`, and the `libarchive.js` declaration file.

- [ ] Step 1: Apply each item and measure the before and after durations of the formerly slow tests. Record them in the report.
- [ ] Step 2: Run the full suite twice. Both runs must be green with no timeouts. Then run tsc and lint.
- [ ] Step 3: Commit with the subject "Remove cold-start and full-tree-scan timeouts from the test suite".

### Task 18: Suite-wide pristine test output (R2 X2)

**Spec:** R2 Part 5, X2. It covers the 16 other noisy files (the table and raw-log path are in the spec).
- Silence expected logs by spying on the logger, and assert them where the log is the behaviour.
- Fix `act(...)` warnings by awaiting or wrapping updates, not by muting console.

After this task, the full `npx vitest run` prints no stray output.

- [ ] Step 1: Fix the files one by one.
- [ ] Step 2: Run the full suite and confirm the output is pristine. Then run tsc and lint.
- [ ] Step 3: Commit with the subject "Make the full test run quiet".

### Task 19: Type-check the test files too (R2 T3)

**Spec:** R2 Part 4, "Measuring a test-inclusive typecheck" and T3 "Should test files be type-checked? Recommendation".

1. Add a test-inclusive TypeScript project, for example `tsconfig.test.json`, extending the app config and including `src/**/*.test.ts(x)` and `src/test/**`.
2. Add a `typecheck:tests` script and include it in `npm run check`.
3. Fix every reported error. R2 measured about 214 after Task 17. Fix the types properly: no blanket `any` and no `@ts-expect-error` without a reason comment.
4. Keep runtime behaviour of the tests unchanged.

- [ ] Step 1: Add the config and script, run it, and record the error count.
- [ ] Step 2: Fix the errors area by area, committing per area.
- [ ] Step 3: Confirm `npm run check` passes end to end, then the full suite, `tsc -b --force` and lint.
- [ ] Step 4: The last commit's subject is "Type-check the test files".

### Task 20: Whole-branch verification and merge (controller)

- [ ] Step 1: Run the full `npx vitest run` (pristine output), `npx tsc -b --force`, `npm run lint`, `npm run build`, `npm run test:deployment:config` and `npm run typecheck:tests`.
- [ ] Step 2: Run the Codex review gate (`codex review --base 15f1b69`) and a final whole-branch review on the most capable model.
- [ ] Step 3: Do one fix wave and one scoped re-review.
- [ ] Step 4: Merge to `main` locally. Verify the merged result with the full suite, then delete the branch.
