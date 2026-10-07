# Close the Second Review's Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This plan runs as one agentic workflow** (Appendix A; user decision 3). Each task's implementer and reviewer follow the SDD implementer and task-reviewer contracts. The controller does the steps marked *(controller)*.

**Goal:** Fix every gap found by the second review of the unreleased work (v0.15.4..e8a2a43): 15 defects, 16 smaller issues and one Codex finding. Also start each newly opened dataset at identity, verify, merge locally, and update the project `CLAUDE.md`.

**Architecture:**
- 20 implementation tasks form a dependency graph.
- Tasks that share a file run one after another. Everything else runs in parallel: critical-path tasks start the moment their dependencies finish, and the others share three slots.
- Each task gets implement → review → up to three fix rounds, at an effort level matched to its risk.
- Then the controller verifies and runs the Codex gate. A second, small workflow runs the max-effort whole-branch review, one fix wave and one re-review.
- The controller merges and updates `CLAUDE.md`.

**Tech Stack:** TypeScript 5.9, React 19, Zustand, React Three Fiber, Vitest 4 (jsdom), ESLint 9, GitHub Actions, Node test runner for deployment scripts, Playwright deploy smoke.

**Spec:** `docs/superpowers/specs/2026-10-07-second-review-gaps/design.md` (scope, user decisions and rulings). The binding detail is in `findings.md`, `R1-cancel-reload.md`, `R2-load-lifecycle.md`, `R3-publishing-drive.md`, `R4-hf-access-auth.md` and `R5-privacy-docs-deploy.md` in the same folder.

## Global Constraints

- **Branch:** `fix/second-review-gaps`, cut from local `main` at e8a2a43. Run every command from `colmap-webview/`.
- **Commands:**
  - Focused tests: `npx vitest run <path>`.
  - Full suite: `npx vitest run`.
  - Typecheck: `npx tsc -b --force`. It now covers the test files too, so `npm run typecheck:tests` is the faster test-only check.
  - Lint: `npm run lint`.
  - Deploy-script tests: `node --test scripts/deployment/profiles.test.mjs` and `npm run test:deployment:config`.
  - Deploy browser smoke: `npm run test:deployment`.
- **Before every commit:** the full `npx vitest run` passes with pristine output (no stray stdout/stderr, no `act(...)` warnings), `npx tsc -b --force` exits 0, and `npm run lint` is clean. Tasks that touch deploy scripts or workflows also run `npm run test:deployment:config`.
- **Store access:** components reach stores only through `*StoreFacade` modules, enforced by `src/components/componentStoreBoundary.test.ts`. Task 16 makes that test stricter.
- **Styling:** hand-written CSS only; add no new classes.
- **Abort signals:** use `anySignal` from `src/utils/abortSignals.ts`, never `AbortSignal.any`. After Task 18, use `timeoutSignal`, never `AbortSignal.timeout`. Supported browsers include Safari/iOS below 17.4.
- **Comments:** keep them brief, and only where they explain why.
- **Line endings:** keep each file's endings, whether CRLF, LF or mixed. Check with `git ls-files --eol <file>`, and never rewrite a whole file.
- **Spec code:** where a research spec gives code or test code, that code is the requirement. Adapt it only to fit changes made by earlier tasks, and record every deviation in the report.
- **Commits:** each message says what the user sees and ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit with explicit pathspecs, and never use `git add -A`, `git add .`, `git commit -a`, `git stash`, or `git checkout -- <path>` on another task's files. If `.git/index.lock` exists, wait and retry; never delete it. Never amend. Never push.
- **Concurrency:** tasks running at the same time never share files. A task must edit only the files its brief lists. If it needs another file, it stops with NEEDS_CONTEXT. If a full-suite failure plainly comes from another task's in-progress files, re-run once, then report it.
- **Owner actions are out of scope:**
  - pushing;
  - tagging;
  - the privacy effective date;
  - GA4;
  - cache deletion;
  - the local-only tags v0.10.0 and v0.11.0;
  - deleting `src/store/viewerStore_test.ts` and `deno.json`.

## Review Focus

1. **A URL dataset whose settings or splat list is slow** (Task 1).
   - The overlay stays up with Cancel available until the scene appears, already restored.
   - Cancel during the wait leaves the previous scene, or the landing page with the URL request stripped.
   - Nothing lands late over the user's camera or selection.
2. **Cancelling or failing a Reload** (Tasks 4 and 6).
   - The scene, transform, edits and marks stay exactly as they were.
   - The next Reload doesn't prompt unless edits exist.
   - Cancelling one splat's decode in a multi-splat dataset keeps the dataset.
3. **Switching datasets** (Tasks 3, 6, 7 and 17). The new dataset gets:
   - its own default or saved splat;
   - an identity transform unless its settings set one;
   - no Drive success message from the previous dataset;
   - no transform from a cancelled startup link.
4. **The splat picker left open while `n` activates a tile** (Task 10). Escape, from the picker or from Help on top of it, keeps the tile.
5. **A signed-in Hugging Face user opening a public, renamed or re-cased repo** (Tasks 8 and 14).
   - No token retries on plain 404s.
   - No false settings-timeout warning.
   - Drive and HF publishing pin the canonical repo.

---

## Execution

*(controller, before the run)*
- [ ] Commit this plan and the spec folder on `fix/second-review-gaps`.
- [ ] Create the ledger at `.superpowers/sdd/2026-10-07-second-review-gaps/progress.md`.
- [ ] Extract briefs 1–20 with `bash scripts/task-brief <plan> N` from the SDD skill.
- [ ] The user raises **Dynamic workflow size** in `/config` (user decision 3), because the run uses roughly 45–60 agents. At most five tasks run at once, and each task runs one agent at a time.
- [ ] **Expected duration:** several hours. The critical path is 1 → 2 → 3 → 4 → 5, then 8 → 6 and 8 → 9: about seven tasks in sequence, each with its review.

### Dependency graph and effort

| # | Task | Findings | Depends on | Effort (implement / review) |
|---|---|---|---|---|
| 1 | A URL dataset appears only once its restore inputs are known | E13, G6 | — | max / max |
| 2 | A timed-out splat list is visible | ruling 4 | 1 | medium / medium |
| 3 | Each load gets only its own splat request, and keeps its overlay for a picked tile | G7, G11, G12 | 2 | high / high |
| 4 | Cancelling one splat's decode keeps the rest of the dataset | G5, G3 (ruling 1) | 3 | high / max |
| 5 | A splat Spark cannot draw leaves the points visible, and stale renderer callbacks leave a new load alone | E2, ruling 5 | 4 | high / high |
| 6 | A new scene starts at identity, and the transform resets only when a scene commits | G2, ruling 2 | 5, 8 | high / high |
| 7 | A startup link's alignment waits for its own scene | E6 | 3 | low / medium |
| 8 | Hugging Face reads retry with the session only when access may be denied | G9, E11 | 3, 4, 12, 13 | high / high |
| 9 | A failed shared link can be retried after sign-in, and read-only scenes can sign in again | G14 | 3, 7, 8, 10, 15, 16 | high / high |
| 10 | Closing the splat picker keeps a splat chosen meanwhile, and Escape closes only the top dialog | G13 | — | medium / high |
| 11 | `clearReconstruction` no longer offers a ZIP option it can't honour | C1 | — | low / low |
| 12 | `fetchWithTimeout` reports its own timeout reason, and the stale re-export is removed | E14, E16 | — | medium / medium |
| 13 | The privacy policy discloses the HF scopes and Drive metadata in use | G8 | — | low / high |
| 14 | Publishing pins Hub sources by commit, bounds Drive mask probing, and exempts the exported model from the copy limit | G4, G10, E1 | — | high / high |
| 15 | Drive hand-offs use the fragment, folder advice matches the host, and the dead Drive mode is removed | E5, E10, E15 | 13 | medium / medium |
| 16 | The Drive toolbar button reads through its facade, and the boundary test sees every store | E12 | — | medium / medium |
| 17 | A finished Drive publication clears when the dataset changes, and Drive's untested paths get tests | G1, G15 | — | medium / high |
| 18 | Older Safari gets a timer fallback for `AbortSignal.timeout` | E4 | 2, 14 | medium / medium |
| 19 | A later push can't cancel a waiting tag deploy | E3 | — | low / medium |
| 20 | The OAuth demo script, custom-host callback and Drive limits match the app | E7, E9, E1 docs, G1/G10 notes | 13, 14, 15, 17 | low / medium |

**Run rules:**
- Fix rounds run at the implementer's effort, and re-reviews at the reviewer's.
- A task that ends BLOCKED or NEEDS_CONTEXT stops its dependents. They are reported as skipped, and the controller resolves them after the run.
- A task whose findings stay open after three fix rounds lets its dependents proceed. Its open findings go to the final review.
- Every review's Minor findings are carried to the final review (ruling 13).
- Tasks 13 and 15 both run the deploy browser smoke, which builds into the shared `.tmp/deployment-smoke/` and Playwright output folders. So Task 15 waits for Task 13 (Codex plan review).
- The scripts keep `export const meta`: the Workflow runtime requires it.
- Agents commit with `git commit --only -- <their paths>`, never a bare `git commit`, because parallel tasks share one git index (Codex plan review).

**Critical path:** 1 → 2 → 3 → 4 → 5, then 4 → 8 → 6 and 8 → 9.
- Tasks 1–6, 8 and 9 are marked `critical`. They start the moment their dependencies finish; there are at most two critical chains at once.
- Every other task waits for one of three shared slots, lowest `prio` first.
- At most five tasks run at once.
- Edge reasons:
  - Task 8 waits for Task 4, because both may touch `useUrlLoader.test.ts`.
  - Task 6 waits for Task 8, because Task 6's test sweep may touch files Task 8 edits.

---

### Task 1: A URL dataset appears only once its restore inputs are known (E13, G6)

**Spec:** these R2 sections are binding: §E13; §G6, in full (Fix, the `beforeSceneCommit` hook, "The gap after the fix", "Discovery bound", Tests); and "Recommended task grouping", tasks R2-A and R2-B.
- Do E13 first, as its own commit, so the test doubles report scene replacements before G6 relies on them.
- G6's archive test, "settles the settings beside an archive before handing its bundled splat to the renderer", pins G3's outcome (ruling 1).

**Files:**
- `src/hooks/urlLoaderManifestSource.ts`
- `src/hooks/urlLoaderSplatSource.ts`
- `src/hooks/urlLoaderZipSource.ts`
- `src/hooks/useUrlLoader.ts` (`settingsBesideOnce`, the splat and archive branches of `loadFromUrl`)
- `src/hooks/fileDropzoneWorkflow.ts`
- `src/hooks/fileDropzonePointCloudOnly.ts`
- `src/hooks/useFileDropzone.ts` (`processFiles` only)
- the tests for these files: `urlLoaderManifestSource.test.ts`, `urlLoaderSplatSource.test.ts`, `useUrlLoader.test.ts`, `fileDropzoneWorkflow.test.ts`, `fileDropzonePointCloudOnly.test.ts`

**Interfaces:**
- **Produces:** `FileDropzoneWorkflowOptions.beforeSceneCommit?: () => Promise<void>`, and `SPLAT_DISCOVERY_TIMEOUT_MS` (equal to `FETCH_TIMEOUT`, counted from the end of parsing).
- **Consumes:** `FETCH_TIMEOUT` from `src/utils/fetchWithTimeout.ts`. Task 12 keeps it exported.
- **Constraint:** add no `AbortSignal.timeout`; use timers with `anySignal`, because Task 18 adds a lint rule against it.

**Review focus:**
- Every row of the spec's "gap after the fix" table holds.
- The settings deadline and the discovery deadline both start after parsing, and the guard test pins this.
- The picker is offered only after restoration.
- During the settle, `n` is ignored, drops are ignored, and Cancel restores the previous scene or the landing page and strips `?url=`.
- After the commit, the only await is the restored splat download.
- Reload, the in-load splat choice and its restore-revision re-base (`ignoredSplatSelectionRevision` in `fileDropzoneWorkflow.ts`), and Reload's first-load announcements (the workflow test "announces a Reload exactly as its first load") are unchanged.

- [ ] **Step 1:** E13. Write its tests and update the doubles; run RED, then GREEN. Run the full checks. Commit: "Install a URL's source only for the scene it replaced".
- [ ] **Step 2:** G6. Write its tests, including the `processWithStore` helper and the archive test; run RED, then GREEN. Run the full checks. Commit: "Show a URL dataset only once its splat list and saved settings are known".

### Task 2: A timed-out splat list is visible (ruling 4)

**Spec:** design ruling 4, and R2 §G6 "Discovery bound" (On timeout). Today, when discovery times out, the scene appears without splats and only a log line says so.

**Required behaviour:** when the splat listing times out, show one persistent warning, modelled on `src/hooks/optionalSettingsWarning.ts`:
- Use a module with `show` and `dismiss`, holding the notification id in module state. Showing again replaces the previous warning.
- Text: "This dataset's splat list did not load in time, so its splats are not shown. Open the dataset link again to retry."
- Dismiss it when a new load starts (where the settings warning is dismissed: `runLoad` after `tryStartUrlLoad`, and `beginLocalLoad`) and when the scene is cleared (`clear()`).
- A discovery that simply fails, as opposed to timing out, keeps today's behaviour.
- Add no `AbortSignal.timeout`. Task 18 adds a lint rule against it.

**Files:**
- new `src/hooks/splatListWarning.ts` and its test
- the site in `src/hooks/urlLoaderManifestSource.ts` where the Task 1 timeout fires
- `src/hooks/useUrlLoader.ts` (the dismiss at load start)
- `src/hooks/useFileDropzone.ts` (`beginLocalLoad` dismiss)
- `src/store/reconstructionStore.ts` (the dismiss in `clear()`)
- tests: `urlLoaderManifestSource.test.ts`, `useUrlLoader.test.ts`, `reconstructionStore.test.ts`

**Tests (RED first):**
- **Module unit tests:** show, show again (exactly one warning), dismiss.
- **A manifest load whose listing never resolves:** after the 30 s bound (use fake timers), the scene commits without tiles and the warning is shown exactly once.
- **A new load,** and separately **`clear()`,** removes the warning.

**Review focus:**
- The warning appears only on a timeout, never on a plain failure.
- It never stacks.
- Its module import adds no cycle.

- [ ] Step 1: RED, then GREEN, then the full checks. Commit: "Say when a dataset's splat list did not load in time".

### Task 3: Each load gets only its own splat request, and keeps its overlay for a picked tile (G7, G11, G12)

**Spec:** these R2 sections are binding:
- §G7, §G11 and §G12 (Fix, Tests);
- "Recommended task grouping", tasks R2-C and R2-D;
- the "large-touch assertion" update.

**Files:**
- `src/store/reconstructionStore.ts` (`setLoadedFiles`, `setRequestedSplatSourceId` and their docs, plus the new `isSplatDownloadPending` export)
- `src/hooks/useUrlLoader.ts` (`requestSplatForLoad`, the start of `runLoad`, the `finally` of `runLoad`)
- `src/hooks/useFileDropzone.ts` (`beginLocalLoad`)
- `src/hooks/useUrlState.ts` (the final block of `applySavedViewerState`)
- tests: `useUrlLoader.test.ts`, `useFileDropzone.test.ts`, `reconstructionStore.test.ts`, `useUrlState.test.ts`

**Review focus:**
- The in-load re-pick of an incoming source still works (the store's id, path and name matching), and the restore-revision re-base (`ignoredSplatSelectionRevision`) still lets the incoming YAML win over a stale pick.
- A share link's None commits as None, and the archive's bundled default is never handed to the renderer.
- The request is cleared at every load start, and the restore no longer re-arms it. The 3DGS `iteration_7000` example test passes.
- A tile picked during the restore keeps the overlay and Cancel. `runLoad`'s `finally` still drops loading when nothing is pending.

- [ ] Step 1: G7 + G11. RED, then GREEN, then the full checks. Commit: "Give each dataset load only its own splat request".
- [ ] Step 2: G12. RED, then GREEN, then the full checks. Commit: "Keep the overlay and Cancel for a tile picked during the restore".

### Task 4: Cancelling one splat's decode keeps the rest of the dataset (G5, G3 per ruling 1)

**Spec:**
- **R1 §G5** (Fix, Tests) is binding.
- **R1 §G3** applies only under ruling 1:
  1. On post-Task-1 code, write R1's G3 store test and integration test.
  2. If they pass without R1's G3 production change, drop that change. Keep only the store test if it adds coverage the Task 1 archive test lacks, and record "G3 window closed by Task 1" in the report.
  3. Otherwise, land R1's G3 change: a decode Cancel equals None and doesn't abort a URL load that is still settling.

  **How to decide (revised after the Codex plan review):** R1's G3 store test builds the old state by hand. R1's integration test assumes the renderer takes over before the settings settle, which is the ordering Task 1 removes. So neither proves a window still exists. Decide with an integration test that reaches the window through the real post-Task-1 load path: a URL load whose bundled splat is decoding while some part of the restore is still pending. If no such path exists, drop R1's G3 production change and its obsolete tests, and keep only what adds coverage.

**Files:**
- `src/store/reconstructionStore.ts` (`cancelLoading`, the new module function `hasOtherSplatToShow`, the `getActiveSplatSourceId` import, the `cancelLoading` doc)
- `src/store/reconstructionStore.test.ts`
- `src/hooks/useUrlLoader.test.ts` (only if G3 still has a window)

**Review focus:**
- "Available" means a listed source with bytes or a URL, matching what the picker, the panel select and `n` can activate.
- The single-splat fallback still clears the scene and strips `?url=`.
- `n` and the picker keep working after a Cancel.

- [ ] Step 1: RED, then GREEN, then the full checks. Commit: "Cancel a splat decode without discarding the rest of the dataset".

### Task 5: A splat Spark cannot draw leaves the points visible, and stale renderer callbacks leave a new load alone (E2, ruling 5)

**Spec:** R1 §E2 (Fix, Tests) is binding, together with design ruling 5, which covers R1 "Out of scope" note 4.

**Ruling 5 (revised after the Codex plan review):** guard by loading ownership, not scene ownership. During Task 1's settle, the old splat still belongs to the scene on screen.
- These must not change `urlLoading`, `urlProgress` or `urlError` while another load owns them:
  - Spark's failure handler (`SplatLayer.tsx` ~325);
  - its success and progress callbacks (~288);
  - `dropFailedSplat`, including through `showColmapOnly`, which clears all three.
- Another load owns them while `isReconstructionLoadPending()` is true. If that is cleaner, use a load generation and justify it.
- Dropping the failed old splat still restores the plain point display.
- **Tests (RED first):** hold a URL load in `beforeSceneCommit` (Task 1's hook) with the old splat still active. Then fire the old splat's failure, success and progress in turn. Each time, the new load's overlay, progress and Cancel survive.

**Files:**
- `src/store/reconstructionStore.ts` (the new `dropFailedSplat` and its interface entry)
- `src/components/viewer3d/PointCloud/SplatLayer.tsx`
- `src/components/viewer3d/PointCloud/SplatLayerStoreFacade.ts`
- tests: `SplatLayer.test.tsx`, `SplatLayerStoreFacade.test.ts`, `reconstructionStore.test.ts`

**Review focus:**
- The scene ends COLMAP-only with the plain point display, and the next splat activation still shows.
- The forced-WebGPU residual is out of scope.

- [ ] Step 1: RED, then GREEN, then the full checks. Commit: "Show the points again when Spark cannot draw the splat".

### Task 6: A new scene starts at identity, and the transform resets only when a scene commits (G2, ruling 2)

**Spec:**
- Design ruling 2, which records user decision 1.
- R1 §G2's Verified and Tests sections. Adapt the tests to this mechanism: the reset lives in the store's scene-load commit, not in `reloadFiles`.

**Required changes:**
- **Reset on scene load.** In `setReconstruction`'s scene-load branch (no `edited`), next to `clearPendingDeletions()`, reset the scene transform (`useTransformStore.getState().resetTransform()`). If importing the transform store from `reconstructionStore.ts` would create a cycle, use the same indirection that `clearPendingDeletions` uses, and say so in the report.
- **Drop the early resets.** Remove `resetTransform()` from the four Reload entry points:
  - `TransformPanel.tsx` (~65)
  - `ExportPanel.tsx` (~205)
  - `globalContextMenuActionExecutor.ts` (~287)
  - `transformGizmoContextMenuExecutor.ts` (~25)
- **Facade cleanup.** Remove the `useExportPanelStoreFacade` entry `transform.resetTransform` if nothing else uses it, and update its test.
- **Flip the old expectation.** `sessionActions.test.ts:164`, "A dataset without settings leaves the alignment on screen", flips: a new dataset starts at identity.
- **Sweep.** Find tests that set a transform before a `setReconstruction` scene load and expect it to survive. Update them, and list them in the report. Before editing any test file, check with `git status` that no other task has it modified.

**Tests (RED first):**
- **Cancelled and failed Reloads change nothing.**
  - A dataset with a saved alignment T: Reload, then cancel during the parse. The transform is still T, edits and marks are unchanged, and the next `confirmReload()` resolves `true` without a prompt.
  - The same, with a failed parse.
- **A Reload that commits lands on T in the same tick.** The scene is identity for no observable render.
- **A new dataset starts at identity.**
  - Apply a transform to dataset A, then load dataset B without settings: B is at identity.
  - With B's YAML alignment, B shows that alignment.
- **Edits, merges and camera conversions keep the transform.** These are `setReconstruction(…, { edited: true })` and the splat-merge path.

**Files:**
- `src/store/reconstructionStore.ts` (`setReconstruction`) and its test
- the four entry points and their tests
- `useExportPanelStoreFacade.ts` and its test
- `src/store/actions/sessionActions.test.ts`
- the swept test files

**Review focus:**
- The reset happens only on scene-load commits.
- No intermediate identity frame on a Reload or a URL restore.
- The Reload prompt's baseline (`confirmReload` in `src/store/actions/sessionActions.ts`, resolved through `resolveDatasetViewerSettings`) is still consistent.
- There is no import cycle.

- [ ] Step 1: RED, then GREEN, then the full checks. Commit: "Start each new scene at identity and leave the transform alone until a Reload commits".

### Task 7: A startup link's alignment waits for its own scene (E6)

**Spec:** R1 §E6 (Fix, Tests) is binding, with design ruling 3. `getAppStartupLoadPlan` drops the link's alignment from the pre-load config, and keeps `splat.activeSourceId`.

**Files:**
- `src/appStartupPolicy.ts` and its test

**Review focus:**
- Cancel, failure and a declined load leave nothing behind.
- The loader still applies the link's alignment once its scene exists.
- Task 3's G11 None still reaches the commit.

- [ ] Step 1: RED, then GREEN, then the full checks. Commit: "Leave a startup link's alignment to the scene it loads".

### Task 8: Hugging Face reads retry with the session only when access may be denied (G9, E11)

**Spec:**
- R4 §G9 and §E11 (Fix, Tests) are binding.
- R4's "Live Hub semantics": the token retry fires only on 401, 403 or an unmarked 404, there is no "repo is public" memory, and settings folders are probed in parallel with the nearest still winning.
- R2's cross-area note: start the beside-settings request inside `settingsBesideOnce` (Task 1's code) and settle it in `beforeSceneCommit`. This keeps the "deadline after parsing" decision.

**Files:**
- `src/features/huggingface/datasetAccess.ts` and its test
- `src/hooks/urlLoaderViewerState.ts` and its test
- `src/hooks/useUrlLoader.ts` and its test (only the request start in `settingsBesideOnce`)
- `docs/hugging-face-loading.md`, lines ~13 and ~36

**Review focus:**
- A signed-in user's public 404 makes exactly one request.
- A gated repo is named as gated.
- Missing and private repos share one accurate message.
- A YAML in a parent folder still wins over defaults when nearer ones are missing.
- The 3 s deadline still starts after parsing.

- [ ] Step 1: RED, then GREEN, then the full checks. Commit: "Retry Hugging Face reads with the session only when access may be denied, and ask settings folders together".

### Task 9: A failed shared link can be retried after sign-in, and read-only scenes can sign in again (G14)

**Spec:** R4 §G14 (Fix, Tests) is binding. G14 moves `App.tsx`'s startup block into `src/appStartupLoad.ts`. Carry Task 3's G11 runLoad change and Task 7's E6 policy change over unchanged.

The new toolbar account button must follow the stricter store-boundary rule from Task 16:
- Read hfAuth and startup-retry state through a facade.
- Use `ModalDialogShell`, with Task 10's top-dialog Escape.
- Add no CSS classes.

If it adds a sign-in surface that `public/privacy.html` describes, update the policy sentence and Task 13's contract test in the same commit.

**Retry lifetime (added after the Codex plan review):** R4's retry holder invalidates only when `urlError` changes, but local loads never touch `urlError`. So a failed link's retry would survive a later local load, whether it starts, fails or is cancelled.
- Invalidate the retry whenever any later dataset load starts, local or URL. Use the load lifecycle, for example a load generation from `src/wasm/reconstructionLoadLifecycle.ts`, rather than editing every loader.
- Test it through a real local-load path, not by calling `setUrlError(null)`.

**Files:**
- new `src/appStartupRetry.ts`
- new `src/appStartupLoad.ts` and its test
- `src/App.tsx`
- `src/components/dropzone/DatasetAccountButtons.tsx` (the HF branch) and its test
- new `src/components/viewer3d/HuggingFaceAccountButton.tsx` and its facade, if one is needed
- `src/components/viewer3d/HuggingFacePublishButton.tsx` and its test
- `src/wasm/reconstructionLoadLifecycle.ts` and its test (the load generation for the retry's lifetime)
- `docs/hugging-face-loading.md`, lines ~15 and ~17
- `public/privacy.html` and `src/features/privacyPolicyContract.test.ts`, only if needed

**Review focus:**
- "Retry shared link" re-runs the same decoded request, overrides included, and works for inline-manifest links.
- Nothing requires the session to survive a reload.
- The read-only toolbar button appears only where publishing is off and sign-in is on.
- The startup behaviour from Tasks 3 and 7 is unchanged.

- [ ] Step 1: RED, then GREEN, then the full checks. Commit: "Retry a failed shared link after Hugging Face sign-in, and sign in again inside read-only scenes".

### Task 10: Closing the splat picker keeps a splat chosen meanwhile, and Escape closes only the top dialog (G13)

**Spec:** R2 §G13 (Fix, Tests) is binding:
- Closing chooses None only while nothing shows.
- The None row stays an explicit None.
- One document listener sends Escape and the Tab trap only to the newest open dialog.

**Files:**
- `src/components/modals/SplatPickerModal.tsx` and its test
- `src/components/modals/useSplatPickerStoreFacade.ts`
- `src/components/ui/ModalDialogShell.tsx` and its test
- `src/components/ui/modalDialogShellPolicy.ts`

**Review focus:**
- Stacked dialogs: Help over the picker.
- A download started with `n` while the picker is open still means None on close, as the existing pinned test requires.
- Focus trapping works for every open dialog.

- [ ] Step 1: RED, then GREEN, then the full checks. Commit: "Close the splat picker without unloading a splat chosen meanwhile".

### Task 11: `clearReconstruction` no longer offers a ZIP option it can't honour (C1)

**Spec:** R1 §C1 (Fix, Tests) is binding. Remove `preserveZip` from `clearReconstruction`, and fix the doc example in `src/store/actions/index.ts`.

**Files:**
- `src/store/actions/reconstructionActions.ts`
- `src/store/actions/index.ts`
- new `src/store/actions/reconstructionActions.test.ts`

- [ ] Step 1: RED, then GREEN, then the full checks. The RED for this task is `npm run typecheck:tests`. Commit: "Drop clearReconstruction's ZIP option that clear() cannot honour".

### Task 12: `fetchWithTimeout` reports its own timeout reason, and the stale re-export is removed (E14, E16)

**Spec:** R4 §E14 (Fix, Tests) and §E16 are binding. Keep `FETCH_TIMEOUT` exported, because Task 1 imports it. R4's appendix (removing the `datasetAccess` workaround) is out of scope.

**Files:**
- `src/utils/fetchWithTimeout.ts` and its test
- `src/utils/urlUtils.ts` and its test
- `src/features/huggingface/datasetAccess.test.ts` (the E14 test only)

- [ ] Step 1: RED, then GREEN, then the full checks. Commit: "Report fetchWithTimeout's own abort reason and drop the urlUtils re-export".

### Task 13: The privacy policy discloses the HF scopes and Drive metadata in use (G8)

**Spec:** R5 §G8 (Fix, Tests, "Deploy smoke tests") is binding.
- Use the exact replacement text.
- Do not change the effective date.
- The deploy smoke must still pass.

**Files:**
- `public/privacy.html`
- `public/about.html`
- `README.md` (line ~43)
- `docs/google-oauth-verification.md` (line ~130)
- `docs/hugging-face-loading.md` (line ~6)
- new `src/features/privacyPolicyContract.test.ts`

**Review focus:**
- Every claim matches the code: scopes per build profile (`config.ts`, `auth.ts`), and the Drive `permissionId` read and `appProperties` write (`upload.ts`).
- The policy stays consistent with `docs/google-oauth-verification.md`.

- [ ] Step 1: RED (the contract test), then GREEN. Run the full checks and `npm run test:deployment`. Commit: "Disclose the Hugging Face scopes and Drive publication metadata the viewer uses".

### Task 14: Publishing pins Hub sources by commit, bounds Drive mask probing, and exempts the exported model from the copy limit (G4, G10, E1)

**Spec:** R3 §G4, §G10 and §E1 (code only; the doc lines go to Task 20) are binding.
- Order: G4's one-line edit first, then G10 (move the constant, change the contract, bound the probing), then E1.
- G4 drops the id comparison at both sites (ruling 9).

**Files:**
- `src/features/googleDrive/prepareArchive.ts` and its test
- `src/features/huggingface/hubClient.ts` and its test
- `src/features/datasetPublishing/preparePublication.ts` and its test
- `src/features/datasetPublishing/types.ts`
- `src/utils/imageFileLookupPolicy.ts`
- `src/utils/urlImageFiles.ts`

**Review focus:**
- A renamed or re-cased repo publishes and pins the commit.
- Mask probing stops after the viewer's 8-image rule, and C2's retry and skip behaviour is kept.
- HF masks download while packaging.
- Held masks are capped at the 2 GiB ZIP limit.
- The exported COLMAP files are exempt from the 128 MiB per-file cap; other assets keep it.

- [ ] Step 1: RED, then GREEN per item, then the full checks. Commit: "Pin Hub sources by commit, bound Drive mask probing, and lift the copy limit from the exported model". One commit per item is also fine.

### Task 15: Drive hand-offs use the fragment, folder advice matches the host, and the dead Drive mode is removed (E5, E10, E15)

**Spec:** R3 §E5, §E10 and §E15 are binding. E5 also changes the deploy smoke assertion in `scripts/deployment/tests/artifacts.spec.ts`.

**Files:**
- `src/components/modals/urlInputModalViewModel.ts` and its test
- `src/components/modals/UrlInputModal.test.tsx`
- `scripts/deployment/tests/artifacts.spec.ts`
- `src/utils/googleDriveUrl.ts` and its test
- `src/components/dropzone/DatasetAccountButtons.tsx` (the Drive branch) and its test
- `src/features/googleDrive/api.ts` and its test

- [ ] Step 1: RED, then GREEN, then the full checks and `npm run test:deployment`. Commit: "Hand Drive links over in the fragment and drop Drive advice a viewer cannot follow".

### Task 16: The Drive toolbar button reads through its facade, and the boundary test sees every store (E12)

**Spec:** R3 §E12 is binding. The tightened `componentStoreBoundary.test.ts` must also catch any other direct store read in `src/components`, and every hit must be fixed through a facade. If a hit is in a file another running task owns, stop with NEEDS_CONTEXT.

**Files:**
- `src/components/viewer3d/GoogleDrivePublishButton.tsx` and its test
- `useGoogleDrivePublishButtonStoreFacade.ts` and its test
- `src/components/componentStoreBoundary.test.ts`

- [ ] Step 1: RED, then GREEN, then the full checks. Commit: "Read the Drive toolbar status through its facade, and let the boundary scan see every store".

### Task 17: A finished Drive publication clears when the dataset changes, and Drive's untested paths get tests (G1, G15)

**Spec:** R3 §G1 and §G15 are binding. Mirror the HF controller's reset of a completed publication, and keep D5's release semantics.

**Files:**
- `src/features/googleDrive/publishDataset.ts` and its test
- `src/features/googleDrive/upload.test.ts`
- new `src/features/googleDrive/publicationRuntime.test.ts`
- new, optional: `publicationReceiptReset.test.ts`

**Review focus:**
- After a dataset change, the Drive dialog shows the form, not A's receipt.
- The XHR 308 `Range` parsing, the runtime subscriptions, the 409 lost-create branch and the private-file permission guard are each pinned, and each test catches a mutation.

- [ ] Step 1: RED, then GREEN, then the full checks. Commit: "Clear a finished Drive publication when the dataset changes, and test Drive's untested paths".

### Task 18: Older Safari gets a timer fallback for `AbortSignal.timeout` (E4)

**Spec:** R4 §E4 is binding:
- add `timeoutSignal` to `src/utils/abortSignals.ts`;
- replace every `AbortSignal.timeout` in `src`, including any that Tasks 1 or 2 added;
- add the ESLint rule.

**Files:**
- `src/utils/abortSignals.ts` and its test
- `src/features/huggingface/auth.ts` and its test
- `src/features/huggingface/http.ts` and its test
- `src/features/huggingface/hubClient.ts`
- `src/features/datasetPublishing/publishDataset.ts`
- `eslint.config.js`
- any further `src` site that `git grep "AbortSignal.timeout"` finds. If such a site is in a file another running task owns, stop with NEEDS_CONTEXT.

- [ ] Step 1: RED, then GREEN, then the full checks. Commit: "Fall back to a timer where AbortSignal.timeout is missing".

### Task 19: A later push can't cancel a waiting tag deploy (E3)

**Spec:** R5 §E3 is binding: `queue: max` on the `pages-deploy` concurrency group, plus a contract test with a mutation (ruling 10).

**Files:**
- `.github/workflows/deploy.yml`
- `scripts/deployment/profiles.test.mjs`
- `docs/dual-hosting.md`

- [ ] Step 1: RED, then GREEN. Run `npm run test:deployment:config` and the full checks. Commit: "Queue deploy runs so a later push never cancels a waiting tag deploy".

### Task 20: The OAuth demo script, custom-host callback and Drive limits match the app (E7, E9, E1 docs, G1/G10 notes)

**Spec:** these are binding:
- R5 §E7 and §E9;
- R3 §E1's doc text for `docs/google-drive-publishing.md:18` and `docs/hugging-face-publishing.md:53`;
- R3's optional cross-area notes for G1 and G10.

Check every quoted UI label against the code after Tasks 14, 15 and 17.

**Files:**
- `docs/oauth-review-demo-script.md`
- `docs/hugging-face-publishing.md`
- `docs/google-drive-publishing.md`

- [ ] Step 1: Edit the docs, then run the full checks. Commit: "Match the OAuth demo steps, the custom-host callback and the Drive limits to the app".

---

### Task 21: Verify the branch and run the Codex gate *(controller)*

- [ ] Write every task's outcome to the ledger from the workflow's result:
  - status, commits, rounds, open findings, concerns, carried Minors;
  - verify the commit trailers.
- [ ] Resolve any task that was skipped or stopped. Resume or re-dispatch it with the missing context, and ledger the ruling.
- [ ] Run a quiet-tree verification:
  - `npx vitest run` (pristine output);
  - `npx tsc -b --force`;
  - `npm run lint`;
  - `npm run test:deployment:config`;
  - `npm run build`.
- [ ] Run `codex review --base e8a2a43 < /dev/null` in the background, and read its findings when it finishes.

### Task 22: Final review, one fix wave, one re-review *(workflow, Appendix B)*

- [ ] Launch Appendix B with the inputs below. The reviewer triages the carried items itself and decides which to fix.
  - `base: 'e8a2a43'`
  - the review packages: production `-U10` and tests `-U3`, built as in the last plan
  - the Codex findings
  - the carried Minors
  - any open task findings
- [ ] Ledger the reviewer's verdict and its set-aside items. Ledger the fix wave's commits and the re-review result. Rule on any residuals: park them with rulings. There is no second fix wave.

### Task 23: Finish *(controller)*

- [ ] Re-run the full verification on the final tree, including `npm run check`.
- [ ] Present the finish options from superpowers:finishing-a-development-branch. Last time the user chose a local merge.
- [ ] After the merge:
  - verify the merged `main` with the full suite;
  - delete the branch.
- [ ] **E8 (user decision 2):** replace lines 100–141 of `C:\Users\HEQ\Projects\colmap_webview\CLAUDE.md` with R5 §E8's text. Show the diff in the report.
- [ ] Update project memory: the decisions this work added, and the new owner actions.
- [ ] Collect every `Ruling:` line from the ledger, then delete the plan workspace.
- [ ] Report: what changed, the verification results, "Rulings I made" (exhaustive), and the owner actions.

---

## Appendix A: implementation workflow (Tasks 1–20)

Pass this to the Workflow tool inline as `script`, with `args` set to the JSON below. Briefs must exist at `.superpowers/sdd/2026-10-07-second-review-gaps/task-N-brief.md` first.

```js
export const meta = {
  name: 'close-second-review-gaps',
  description: 'Implement the 20 planned fixes as a dependency graph: each task is implemented, reviewed and fixed (up to 3 rounds) at its planned effort',
  phases: [
    { title: 'Tasks', detail: 'implement, review, fix; a task starts once the tasks it depends on are done; critical-path tasks never wait for a slot, the rest share three' },
  ],
}

const ROOT = 'C:/Users/HEQ/Projects/colmap_webview/colmap-webview'
const WS = ROOT + '/.superpowers/sdd/2026-10-07-second-review-gaps'
const TASKS = args.tasks
const MAX_TASKS = args.maxConcurrentTasks || 3

const IMPL = { type: 'object', properties: {
  status: { type: 'string', enum: ['DONE', 'DONE_WITH_CONCERNS', 'BLOCKED', 'NEEDS_CONTEXT'] },
  commits: { type: 'array', items: { type: 'string' } },
  testSummary: { type: 'string' },
  concerns: { type: 'array', items: { type: 'string' } } },
  required: ['status', 'commits', 'testSummary', 'concerns'] }
const REVIEW = { type: 'object', properties: {
  verdict: { type: 'string', enum: ['approved', 'needs_fixes'] },
  specCompliant: { type: 'boolean' },
  findings: { type: 'array', items: { type: 'object', properties: {
    severity: { type: 'string', enum: ['critical', 'important', 'minor'] },
    where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } },
    required: ['severity', 'where', 'problem'] } } },
  required: ['verdict', 'specCompliant', 'findings'] }
const REREVIEW = { type: 'object', properties: {
  addressed: { type: 'boolean' },
  open: { type: 'array', items: { type: 'string' } },
  newBreakage: { type: 'array', items: { type: 'string' } },
  minors: { type: 'array', items: { type: 'string' } } },
  required: ['addressed', 'open', 'newBreakage', 'minors'] }

const SHARED = 'Repository: ' + ROOT + ' (branch fix/second-review-gaps). Other tasks run at the same time on OTHER files and share this git index. ' +
  'Edit only the files your brief lists; if you must touch another file, stop with NEEDS_CONTEXT. To commit: `git add` only files you CREATED, then ' +
  '`git commit --only -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <every path you changed>`. ' +
  'Never run a bare `git commit`: another task may have staged files that it would sweep in. Never use git add -A or ., commit -a, stash, or checkout -- on files you did not change. ' +
  'If .git/index.lock exists, wait and retry; never delete it. After committing, check that `git show --stat HEAD` lists only your paths. ' +
  'A full-suite failure plainly in another task\'s in-progress files: re-run once, then report it. Never amend, never push, never dispatch subagents.'
const brief = t => WS + '/task-' + t.n + '-brief.md'
const report = t => WS + '/task-' + t.n + '-report.md'

const implementPrompt = t =>
  'You are implementing Task ' + t.n + ': ' + t.title + '.\n' +
  'Read your brief first; it is your requirements: ' + brief(t) + '. It names the binding spec sections. Where a spec gives code or tests, that code ' +
  'is the requirement: adapt it only to earlier tasks\' changes and record every deviation.\n' + SHARED + '\n' +
  'Work test-first: write each test, run it RED for the expected reason, implement, run it GREEN. A test that only adds coverage for behaviour ' +
  'that is already correct (for example G15) gets its RED from a mutation of the production code, which you then restore exactly. Before each commit run the full `npx vitest run` ' +
  '(pristine output), `npx tsc -b --force` and `npm run lint`' + (t.deploy ? ', plus `npm run test:deployment:config`' : '') + '. ' +
  'Commit subjects come from the brief; every message ends with "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>".\n' +
  'Write your full report to ' + report(t) + ': per finding what changed, RED/GREEN evidence, full-suite/tsc/lint results, files, deviations, concerns. ' +
  'Return the structured result (commits = short SHAs in order).'

const reviewPrompt = (t, impl) =>
  'You are reviewing Task ' + t.n + ': ' + t.title + '. This is a task-scoped gate and your review is read-only: never modify the working tree, index or HEAD.\n' +
  'Brief: ' + brief(t) + '. It names the binding spec sections and a Review focus list; check each focus item with one focused check, naming what you checked. ' +
  'The implementer\'s report contains unverified claims: ' + report(t) + '. Commits: ' + impl.commits.join(', ') + '. Read them with `git show <sha>`; other tasks\' commits may interleave. ' +
  'Do not run the full suite; run a focused test only for a specific doubt.\n' +
  'Spec compliance: missing, extra or misunderstood items, each with file:line. Quality: correctness, tests that pin real behaviour (would each fail on the old code?), ' +
  'structure, pristine output, store facades, line endings. Severity: Critical or Important means the task cannot be trusted until fixed; Minor means polish. ' +
  'Never dispatch subagents. Return the structured verdict, with file:line in "where".'

const fixPrompt = (t, findings, round) =>
  'Fix round ' + round + ' for Task ' + t.n + ': ' + t.title + '. Your brief is ' + brief(t) + ' and the report is ' + report(t) + '.\n' + SHARED + '\n' +
  'Fix every finding below. Where a behaviour changes, write the test first and run it RED, then GREEN. Run the full checks before committing. ' +
  'Append a fix report to ' + report(t) + ' covering what changed, the tests you ran, and the output.\nFindings:\n' + JSON.stringify(findings, null, 1)

const reReviewPrompt = (t, findings, fix) =>
  'Re-review fix round for Task ' + t.n + ': ' + t.title + '. Your review is read-only. Brief: ' + brief(t) + '. Fix commits: ' + fix.commits.join(', ') +
  ' (read them with git show); the fix report is appended to ' + report(t) + '.\nFor each finding below, decide ADDRESSED or NOT ADDRESSED with file:line evidence. ' +
  'Then inspect the fix diff for new breakage. List any Minor notes separately. Never dispatch subagents.\nFindings:\n' + JSON.stringify(findings, null, 1)

// Critical-path tasks run as soon as their dependencies finish. Other tasks share MAX_TASKS slots, lowest prio first.
let free = MAX_TASKS
const waiting = []
const acquire = prio => free > 0 ? (free--, Promise.resolve()) : new Promise(resolve => { waiting.push({ prio, resolve }); waiting.sort((a, b) => a.prio - b.prio) })
const release = () => { const next = waiting.shift(); if (next) next.resolve(); else free++ }

// 'stopped' blocks dependents. Only 'open' (findings left after three completed fix rounds) and 'complete' release them.
const stop = (t, why, impl, rounds, minors) => {
  log('Task ' + t.n + ' stopped: ' + why)
  return { n: t.n, status: 'stopped', why, impl, rounds: rounds || [], open: [why], minors: minors || [] }
}
const unusable = r => !r || r.status === 'BLOCKED' || r.status === 'NEEDS_CONTEXT'

async function runTask(t) {
  const impl = await agent(implementPrompt(t), { label: 'T' + t.n + ' implement', phase: 'Tasks', effort: t.effort, schema: IMPL })
  if (unusable(impl) || impl.commits.length === 0) return stop(t, impl ? impl.status + ': ' + impl.concerns.join(' | ') : 'implementer failed', impl)
  const review = await agent(reviewPrompt(t, impl), { label: 'T' + t.n + ' review', phase: 'Tasks', effort: t.reviewEffort, schema: REVIEW })
  if (!review) return stop(t, 'review agent failed', impl)
  const minors = review.findings.filter(f => f.severity === 'minor').map(f => f.where + ': ' + f.problem)
  let open = review.findings.filter(f => f.severity !== 'minor')
  // A negative verdict with no blocking finding still has to be resolved, never waved through.
  if (!open.length && (review.verdict !== 'approved' || !review.specCompliant)) {
    open = [{ severity: 'important', where: '', problem: 'The reviewer marked the task ' + (review.specCompliant ? 'not approved' : 'not spec compliant') +
      ' without a blocking finding; reconcile the brief and the diff, and fix whatever the reviewer\'s Minor notes imply.' }]
  }
  const rounds = []
  let round = 0
  while (open.length && round < 3) {
    round++
    const fix = await agent(fixPrompt(t, open, round), { label: 'T' + t.n + ' fix ' + round, phase: 'Tasks', effort: t.effort, schema: IMPL })
    if (unusable(fix)) return stop(t, 'fix round ' + round + ' ' + (fix ? fix.status + ': ' + fix.concerns.join(' | ') : 'agent failed'), impl, rounds.concat([{ fix }]), minors)
    const rr = await agent(reReviewPrompt(t, open, fix), { label: 'T' + t.n + ' re-review ' + round, phase: 'Tasks', effort: t.reviewEffort, schema: REREVIEW })
    rounds.push({ fix, rr })
    if (!rr) return stop(t, 're-review ' + round + ' agent failed', impl, rounds, minors)
    minors.push(...rr.minors)
    open = rr.open.concat(rr.newBreakage).map(s => ({ severity: 'important', where: '', problem: s }))
    if (!open.length && !rr.addressed) open = [{ severity: 'important', where: '', problem: 'The re-reviewer did not confirm the findings as addressed; reconcile each one.' }]
  }
  if (open.length) log('Task ' + t.n + ' has ' + open.length + ' open finding(s) after 3 rounds; dependents proceed and the final review disposes of them')
  return { n: t.n, status: open.length ? 'open' : 'complete', impl, review, rounds, open, minors }
}

const byN = {}
TASKS.forEach(t => { byN[t.n] = t })
const started = {}
function schedule(n) {
  if (!started[n]) started[n] = (async () => {
    const t = byN[n]
    const deps = await Promise.all(t.deps.map(schedule))
    const stopped = deps.filter(d => d.status === 'stopped' || d.status === 'skipped')
    if (stopped.length) {
      log('Task ' + n + ' skipped: depends on ' + stopped.map(d => d.n).join(', '))
      return { n, status: 'skipped', blockedBy: stopped.map(d => d.n), minors: [], open: [] }
    }
    if (!t.critical) await acquire(t.prio)
    try { return await runTask(t) }
    catch (error) {
      log('Task ' + n + ' stopped by an error: ' + error)
      return { n, status: 'stopped', minors: [], open: [String(error)] }
    }
    finally { if (!t.critical) release() }
  })()
  return started[n]
}

phase('Tasks')
const results = await Promise.all(TASKS.map(t => schedule(t.n)))
return {
  results: results.map(r => ({
    n: r.n, status: r.status, why: r.why || '', blockedBy: r.blockedBy || [], open: r.open,
    // Every commit in order (implementation, then each fix round), so the controller can ledger them and check trailers.
    commits: (r.impl ? r.impl.commits : []).concat(...(r.rounds || []).map(x => (x.fix ? x.fix.commits : []))),
    implementation: r.impl ? { status: r.impl.status, testSummary: r.impl.testSummary, concerns: r.impl.concerns } : null,
    review: r.review ? { verdict: r.review.verdict, specCompliant: r.review.specCompliant, findings: r.review.findings } : null,
    rounds: (r.rounds || []).map(x => ({
      fix: x.fix ? { status: x.fix.status, commits: x.fix.commits, testSummary: x.fix.testSummary, concerns: x.fix.concerns } : null,
      reReview: x.rr || null })),
  })),
  minors: results.flatMap(r => r.minors.map(m => 'Task ' + r.n + ': ' + m)),
}
```

**`args`** (`critical` tasks never wait for a slot; the rest take the three shared slots in `prio` order):
```json
{
  "maxConcurrentTasks": 3,
  "tasks": [
    { "n": 1,  "prio": 1,  "critical": true, "title": "A URL dataset appears only once its restore inputs are known (E13, G6)", "deps": [], "effort": "max", "reviewEffort": "max" },
    { "n": 2,  "prio": 2,  "critical": true, "title": "A timed-out splat list is visible", "deps": [1], "effort": "medium", "reviewEffort": "medium" },
    { "n": 3,  "prio": 3,  "critical": true, "title": "Each load gets only its own splat request, and keeps its overlay for a picked tile (G7, G11, G12)", "deps": [2], "effort": "high", "reviewEffort": "high" },
    { "n": 4,  "prio": 4,  "critical": true, "title": "Cancelling one splat's decode keeps the rest of the dataset (G5, G3)", "deps": [3], "effort": "high", "reviewEffort": "max" },
    { "n": 5,  "prio": 5,  "critical": true, "title": "A splat Spark cannot draw leaves the points visible, and stale renderer callbacks leave a new load alone (E2)", "deps": [4], "effort": "high", "reviewEffort": "high" },
    { "n": 6,  "prio": 6,  "critical": true, "title": "A new scene starts at identity, and the transform resets only when a scene commits (G2)", "deps": [5, 8], "effort": "high", "reviewEffort": "high" },
    { "n": 12, "prio": 7,  "title": "fetchWithTimeout reports its own timeout reason, and the stale re-export is removed (E14, E16)", "deps": [], "effort": "medium", "reviewEffort": "medium" },
    { "n": 13, "prio": 8,  "title": "The privacy policy discloses the HF scopes and Drive metadata in use (G8)", "deps": [], "effort": "low", "reviewEffort": "high", "deploy": true },
    { "n": 8,  "prio": 9,  "critical": true, "title": "Hugging Face reads retry with the session only when access may be denied (G9, E11)", "deps": [3, 4, 12, 13], "effort": "high", "reviewEffort": "high" },
    { "n": 7,  "prio": 10, "title": "A startup link's alignment waits for its own scene (E6)", "deps": [3], "effort": "low", "reviewEffort": "medium" },
    { "n": 10, "prio": 11, "title": "Closing the splat picker keeps a splat chosen meanwhile, and Escape closes only the top dialog (G13)", "deps": [], "effort": "medium", "reviewEffort": "high" },
    { "n": 15, "prio": 12, "title": "Drive hand-offs use the fragment, folder advice matches the host, and the dead Drive mode is removed (E5, E10, E15)", "deps": [13], "effort": "medium", "reviewEffort": "medium", "deploy": true },
    { "n": 16, "prio": 13, "title": "The Drive toolbar button reads through its facade, and the boundary test sees every store (E12)", "deps": [], "effort": "medium", "reviewEffort": "medium" },
    { "n": 9,  "prio": 14, "critical": true, "title": "A failed shared link can be retried after sign-in, and read-only scenes can sign in again (G14)", "deps": [3, 7, 8, 10, 15, 16], "effort": "high", "reviewEffort": "high" },
    { "n": 14, "prio": 15, "title": "Publishing pins Hub sources by commit, bounds Drive mask probing, and exempts the exported model from the copy limit (G4, G10, E1)", "deps": [], "effort": "high", "reviewEffort": "high" },
    { "n": 18, "prio": 16, "title": "Older Safari gets a timer fallback for AbortSignal.timeout (E4)", "deps": [2, 14], "effort": "medium", "reviewEffort": "medium" },
    { "n": 17, "prio": 17, "title": "A finished Drive publication clears when the dataset changes, and Drive's untested paths get tests (G1, G15)", "deps": [], "effort": "medium", "reviewEffort": "high" },
    { "n": 20, "prio": 18, "title": "The OAuth demo script, custom-host callback and Drive limits match the app (E7, E9, E1 docs)", "deps": [13, 14, 15, 17], "effort": "low", "reviewEffort": "medium" },
    { "n": 11, "prio": 19, "title": "clearReconstruction no longer offers a ZIP option it can't honour (C1)", "deps": [], "effort": "low", "reviewEffort": "low" },
    { "n": 19, "prio": 20, "title": "A later push can't cancel a waiting tag deploy (E3)", "deps": [], "effort": "low", "reviewEffort": "medium", "deploy": true }
  ]
}
```

## Appendix B: final review workflow (Task 22)

```js
export const meta = {
  name: 'final-review-second-gaps',
  description: 'Whole-branch review at max effort, then one fix wave for its findings (Codex and carried items included), then one scoped re-review',
  phases: [
    { title: 'Final review', detail: 'max effort; triages Codex findings, carried Minors and open task findings' },
    { title: 'Fix wave', detail: 'one fixer, xhigh effort' },
    { title: 'Re-review', detail: 'scoped to the fix wave, high effort' },
  ],
}

const ROOT = 'C:/Users/HEQ/Projects/colmap_webview/colmap-webview'
const PLAN = 'docs/superpowers/plans/2026-10-07-second-review-gaps.md'
const SPEC = 'docs/superpowers/specs/2026-10-07-second-review-gaps/'
const FINDINGS = { type: 'object', properties: {
  ready: { type: 'string', enum: ['yes', 'with_fixes', 'no'] },
  findings: { type: 'array', items: { type: 'object', properties: {
    severity: { type: 'string', enum: ['critical', 'important', 'minor'] },
    where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } },
    required: ['severity', 'where', 'problem', 'fix'] } },
  declined: { type: 'array', items: { type: 'string' } } },
  required: ['ready', 'findings', 'declined'] }
const IMPL = { type: 'object', properties: {
  status: { type: 'string' }, commits: { type: 'array', items: { type: 'string' } },
  testSummary: { type: 'string' }, concerns: { type: 'array', items: { type: 'string' } } },
  required: ['status', 'commits', 'testSummary', 'concerns'] }
const REREVIEW = { type: 'object', properties: {
  addressed: { type: 'boolean' }, open: { type: 'array', items: { type: 'string' } },
  newBreakage: { type: 'array', items: { type: 'string' } } },
  required: ['addressed', 'open', 'newBreakage'] }

phase('Final review')
const review = await agent(
  'You are the final whole-branch reviewer for "close the second review\'s gaps" on branch fix/second-review-gaps (' + ROOT + '). Each task went through its own review; a task whose findings stayed open after three fix rounds is listed under open task findings below. Dispose of each one explicitly: fix it, or set it aside with a reason. You are the broad gate before a local merge; your review is read-only.\n' +
  'Requirements: the plan ' + PLAN + ', and the design, rulings and findings in ' + SPEC + ' (design.md, findings.md, R1-R5). Deliberate decisions recorded in design.md and the R-spec briefs are not defects unless they cause concrete harm.\n' +
  'Range: ' + args.base + '..HEAD. Review packages: ' + args.packages.join(', ') + '. Read the production package fully, in passes; sample the tests package on the riskiest areas.\n' +
  'Focus on cross-task interactions: the URL load settle and commit, cancel, Reload, splat choice, the identity reset, the picker, HF access and retry, publishing, and deploy.\n' +
  'Triage these carried items. Keep the real ones in your findings with a fix; set aside the rest in "declined", with reasons.\n' +
  'Codex findings: ' + JSON.stringify(args.codex) + '\nCarried Minors from task reviews: ' + JSON.stringify(args.minors) + '\nOpen task findings: ' + JSON.stringify(args.open) + '\n' +
  'For every behaviour you set aside as outside the plan, add a "declined" line with the reason. Never dispatch subagents.',
  { label: 'final review', phase: 'Final review', effort: 'max', schema: FINDINGS })
if (!review || review.findings.length === 0) return { review, fix: null, reReview: null }

phase('Fix wave')
const fix = await agent(
  'You are the one final fix wave for branch fix/second-review-gaps (' + ROOT + '). No other agent is running. Fix every finding below, writing the test first wherever behaviour changes. ' +
  'Global constraints are in ' + PLAN + ' (Global Constraints). Before each commit run the full `npx vitest run` (pristine output), `npx tsc -b --force` and `npm run lint`; ' +
  'at the end run `npm run check` and `npm run test:deployment:config`. Make one commit per finding or tightly related pair, each ending with the Co-Authored-By trailer; never amend or push. ' +
  'Write your report to ' + ROOT + '/.superpowers/sdd/2026-10-07-second-review-gaps/final-fix-wave-report.md.\nFindings:\n' + JSON.stringify(review.findings, null, 1),
  { label: 'final fix wave', phase: 'Fix wave', effort: 'xhigh', schema: IMPL })

phase('Re-review')
const reReview = fix && fix.commits.length ? await agent(
  'Re-review the final fix wave on fix/second-review-gaps (' + ROOT + '). Your review is read-only. Fix commits: ' + fix.commits.join(', ') +
  '; the report is in .superpowers/sdd/2026-10-07-second-review-gaps/final-fix-wave-report.md. For each finding below decide ADDRESSED or NOT ADDRESSED with file:line evidence, ' +
  'then inspect the fix diff for new breakage. Never dispatch subagents.\nFindings:\n' + JSON.stringify(review.findings, null, 1),
  { label: 'final re-review', phase: 'Re-review', effort: 'high', schema: REREVIEW }) : null
return { review, fix, reReview }
```

**`args`:**
```json
{
  "base": "e8a2a43",
  "packages": ["<production package path>", "<tests package path>"],
  "codex": ["<Codex findings>"],
  "minors": ["<from Appendix A's result>"],
  "open": ["<open task findings>"]
}
```
