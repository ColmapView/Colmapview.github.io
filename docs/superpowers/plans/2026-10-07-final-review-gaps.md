# Close the Final Review's Findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This plan runs as one agentic workflow** (Appendix A), as the user chose ("same process as the last round"). Each task's implementer and reviewer follow the SDD implementer and task-reviewer contracts. The controller does the steps marked *(controller)*.

**Goal:** Fix the 15 findings of the final pre-push review of `v0.15.4..main` (F1–F15) and the low-severity extras the specs chose to fix. Then verify against the full CI gate, merge locally, update the project `CLAUDE.md`, and push once the user confirms.

**Architecture:**
- 18 implementation tasks form a dependency graph.
- Tasks that share a file run one after another. Everything else runs in parallel: critical-path tasks start as soon as their dependencies finish, and the rest share three slots.
- Each task gets implement → review → up to three fix rounds, at an effort level matched to its risk.
- Then the controller runs the full CI gate (`npm run check`, `npm run test:deployment`, `npx playwright test --project=chromium`) and the Codex gate.
- A second, small workflow runs the max-effort whole-branch review, one fix wave and one re-review.
- The controller merges, updates `CLAUDE.md`, and pushes after confirmation.

**Tech Stack:** TypeScript 5.9, React 19, Zustand, React Three Fiber, Vitest 4 (jsdom), Playwright, ESLint 9, GitHub Actions, the Node test runner for deployment scripts.

**Spec:** `docs/superpowers/specs/2026-10-07-final-review-gaps/design.md` holds the scope, the user decisions and the rulings. The binding detail is in the same folder: `findings.md`, `Q1-url-load-restore.md`, `Q2-splat-choice-cancel.md`, `Q3-publishing-drive.md` and `Q4-release-deploy-docs.md`.

## Global Constraints

**Checks before every commit**
- The full `npx vitest run` passes with pristine output: no stray stdout or stderr, no act warnings.
- `npx tsc -b --force` exits 0, and `npm run lint` is clean.
- A task with e2e specs runs them before its last commit:
  - command: `COLMAP_WEBVIEW_E2E_PORT=<5400+task number> npx playwright test <specs> --project=chromium --reporter=list --output=<scratch>/e2e-out/task-<n>`;
  - use only your own port and output folder;
  - never use the HTML reporter.
- A deploy-script task also runs `npm run test:deployment`.
- A failure plainly caused by another task's in-progress files: re-run once, then report it.

**Code rules**
- Components reach stores only through `*StoreFacade` modules (`componentStoreBoundary`).
- Use `anySignal` and `timeoutSignal`, never `AbortSignal.any` or `AbortSignal.timeout` (lint-enforced).
- Use hand-written CSS only, and add no new classes. Keep comments brief, and only where they explain why.
- Keep each file's line endings. Check with `git ls-files --eol`, and never rewrite a whole file. Q2's ownership table lists each of its files' endings.

**Specs**
- Where a spec gives code or tests, that code is the requirement. Adapt it only to earlier tasks' changes, and record every deviation in the report.
- A spec's recommended option is binding unless `design.md` says otherwise.

**Commits**
- Commit messages say what the user sees, and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commit with `git commit --only -m … -- <paths>`, then check `git show --stat HEAD`.
- Never amend or push.

**Files you must not touch**
- `C:\Users\HEQ\Projects\colmap_webview\CLAUDE.md`. Only the controller edits it.

## Review Focus

These are the conditions most likely to bite a user, the behaviour a person would expect, and which task's tests pin it:

1. **A remote archive with and without its own `colmapview.yaml`.** A self-contained archive makes no sidecar request. One without settings still has them in place before the scene appears. (Task 1, e2e `dataset-viewer-settings.spec.ts`.)
2. **A directory listing that is slow but still answering, and one that has stalled.** The slow one keeps every tile. The stalled one gives up within 30 s of its last answer, and every listing gives up within 120 s, with the persistent warning. (Task 2.)
3. **A share link made while no splat shows, compared with an explicit None.** The first carries no splat choice, so recipients get the dataset's default. The second carries None. (Task 7.)
4. **A Reload or tile download in progress while an older splat finishes or fails decoding, in Spark and WebGPU.** The newer work keeps its overlay and Cancel, and Cancel stops it. (Task 8.)
5. **Drive publishing of an over-limit Hub dataset, and of mask hosts that answer 403 or without CORS headers.** The first is refused before any image downloads. The second publishes the masks the viewer shows. (Tasks 11 and 13.)

---

## Execution

Tasks 1–18 run in one workflow (Appendix A) that follows this graph. The *Critical* tasks start as soon as their dependencies finish; the others share three slots, lower *Prio* first. A task with a *Deploy* mark runs `npm run test:deployment`. *E2e* lists the specs a task runs; "all" means the full chromium project.

| # | Items | Spec task | Implementer / reviewer | Depends on | Critical | Prio | E2e / Deploy |
|---|---|---|---|---|---|---|---|
| 1 | F1 | Q1-A | medium / high | — | yes | 0 | `e2e/dataset-viewer-settings.spec.ts` |
| 2 | F3, X8 | Q1-B | high / high | 1 | — | 1 | `e2e/dataset-viewer-settings.spec.ts e2e/hugging-face-publish.spec.ts` |
| 3 | F9 | Q1-C | medium / high | — | yes | 0 | — |
| 4 | F7 | Q1-D | medium / medium | — | — | 3 | `e2e/hugging-face-publish.spec.ts` |
| 5 | X6, F15 | Q1-E | medium / high | 7 | yes | 0 | `e2e/drop-zone.spec.ts e2e/dataset-viewer-settings.spec.ts` |
| 6 | X1 | Q1-F | low / low | — | — | 7 | — |
| 7 | F2 | Q2-A | high / high | 1, 3 | yes | 0 | `e2e/hugging-face-publish.spec.ts e2e/dataset-viewer-settings.spec.ts` |
| 8 | F4, F10, X9 | Q2-B | high / max | 7 | yes | 0 | all |
| 9 | F11, X11(b) | Q2-C | medium / medium | 5 | yes | 0 | `e2e/viewer-controls.spec.ts` |
| 10 | X5 | Q2-D | low / medium | — | — | 4 | `e2e/drop-zone.spec.ts e2e/modals.spec.ts` |
| 11 | F8 | Q3-T1 | medium / high | — | yes | 0 | — |
| 12 | F12 | Q3-T2 | high / max | 11 | yes | 0 | — |
| 13 | F5, X3, X2 | Q3-T3 | high / high | 7, 12 | yes | 0 | — |
| 14 | F13 | Q3-T4 | medium / high | 13 | yes | 0 | `e2e/hugging-face-publish.spec.ts` |
| 15 | F6 part 2 | Q4-T1 | low / medium | — | — | 2 | Deploy |
| 16 | F14, X4 | Q4-T2 | low / medium | 15 | — | 6 | Deploy |
| 17 | X12 | Q4-T3 | low / low | — | — | 8 | — |
| 18 | F6 part 1 | Q4-T4 | low / medium | — | — | 5 | — |

**Why these edges.** Two tasks that edit the same file never run at once (design ruling 4):

| File | Order |
|---|---|
| `useUrlLoader.test.ts` | 1 → 7 |
| `useUrlState.ts` and its test | 3 → 7 |
| `useFileDropzone.ts` | 7 → 5 |
| `fileDropzoneWorkflow.test.ts` | 7 → 5 → 9 |
| `reconstructionStore.ts` and its test | 7 → 8 |
| `preparePublication.ts` and its test | 7 → 13 → 14 |
| `prepareArchive.ts`, the Drive controller test and `docs/google-drive-publishing.md` | 11 → 12 → 13 → 14 |
| `profiles.test.mjs` and `docs/dual-hosting.md` | 15 → 16 |

Task 2 waits for Task 1 only for its e2e gate.

**Specs written against other states.** Q2's hunks assume Q1 has not run, and Q1's assume Q2 has not. An implementer adapts hunks to the earlier tasks' changes, which are separate hunks in the same files, and records each adaptation.

---

### Task 1: A self-contained archive makes no sidecar request (F1)

**Spec:** Q1 §F1 is binding in full (Fix, Tests, RED and GREEN). This task unblocks CI.

**Files:**
- `src/hooks/useUrlLoader.ts`: `settingsBesideOnce` gains `start()`; the splat branch starts it at once; the archive branch starts it from a `processFiles` wrapper.
- `src/hooks/useUrlLoader.test.ts`: replace the test at `:1084-1109` and add Q1's new test.

**Interfaces:**
- **Produces:** `settingsBesideOnce(url, load)` returns `{ start, beforeSceneCommit, settle }`, where `start()` is idempotent. An archive starts the request only when `load.hasEmbeddedViewerSettings` is false once `processFiles` begins.

**Review focus:**
- A direct splat URL still asks for its settings during the download. `useUrlLoader.test.ts`'s direct-splat tests at `:936-975` stay green.
- An archive without settings starts the request while parsing, never after the commit, and its deadline still starts after parsing.
- An archive with settings makes no request and shows no warning.
- The e2e `dataset-viewer-settings.spec.ts` passes all four rows.

- [ ] **Step 1:** Write Q1's tests. Run them RED, implement, and run them GREEN. Run the full checks and the e2e spec. Commit: "Request no settings file beside an archive that carries its own".

### Task 2: A slow splat list that is still answering keeps its tiles; a listed splat that is gone is skipped (F3, X8)

**Spec:** Q1 §F3 (including "Decision change", accepted by design ruling 1) and Q1 §X8 are binding in full.

**Files:**
- `src/hooks/urlLoaderManifestSource.ts`: `SPLAT_DISCOVERY_LIMIT_MS`, `settleWhileAnswering`, answer tracking and the log text.
- `src/hooks/urlLoaderManifestFetch.ts`: `probeRemoteFile`; the explicit catalog drops a 404 or 410.
- Their tests: `urlLoaderManifestSource.test.ts` and `urlLoaderManifestFetch.test.ts`.

**Interfaces:**
- **Keeps:** the splat-list timeout warning from `src/hooks/splatListWarning.ts`, and the load-time catalog's "size 0 means unknown" convention (`size: probe.size ?? 0`). Task 14 relies on it.

**Review focus:**
- **Deadline:** a listing that answers at least every 30 s is never cut off before 120 s after parsing. One silent for 30 s gives up, with the warning.
- **Timers:** none leak after the commit or a Cancel.
- **Explicit splats:** a HEAD answering 404 or 410 is logged and left out, as in v0.15.4: no error toast and no picker. Other failures behave as today.

- [ ] **Step 1:** F3. Write the tests and run them RED, implement, and run them GREEN. Run the full checks and the e2e specs. Commit: "Keep a slow splat list that is still answering, and skip listed splats that are gone". If F3 and X8 are clearer apart, use two commits with the same meaning.

### Task 3: Alignment changes made while a restored splat downloads are kept (F9)

**Spec:** Q1 §F9 is binding in full.

**Files:**
- `src/hooks/useUrlState.ts`: `restorationConfig` (`:131-144`) no longer carries `transform` or `splat.transform`.
- `src/hooks/useUrlState.test.ts`: one `it.each`.

**Review focus:**
- The early restore still applies the saved or shared alignment: restore order is a deliberate decision.
- The late restore applies only the display.
- E6, a link's alignment applied once the scene exists, still holds.
- New datasets still start at identity.

- [ ] **Step 1:** Write the test and run it RED, implement, and run it GREEN. Run the full checks. Commit: "Keep alignment changes made while a restored splat downloads".

### Task 4: A failed shared link leaves the address bar once another dataset loads (F7)

**Spec:** Q1 §F7 is binding in full.

**Files:**
- `src/appStartupRetry.ts`: `abandon` strips the dead `?url=` or `#d=` link, unless the Retry itself withdraws it.
- `src/appStartupLoad.test.ts`: imports and one `describe`.

**Review focus:**
- The Retry still re-reads the link.
- Every other withdrawal removes the link from the address bar, so its camera is not restored onto the next dataset and F5 does not re-run it.
- A successful link is untouched.
- G14's Retry stays offered until another load starts.
- This task only imports from `reconstructionStore.ts`; it does not edit it.

- [ ] **Step 1:** Write the tests and run them RED, implement, and run them GREEN. Run the full checks and the e2e spec. Commit: "Drop a failed shared link from the address bar once another dataset loads".

### Task 5: The open scene's warnings survive a dropped load that fails; the load hand-offs are pinned (X6, F15)

**Spec:** Q1 §X6 and §F15 are binding in full.
- F15's tests get their RED from targeted mutations: each deleted hand-off must turn exactly one new test RED. Revert each mutation with a targeted edit and confirm with `git diff`.
- Adapt to Task 7, which edited `getSplatSelectionState` in `useFileDropzone.ts` and helpers in `fileDropzoneWorkflow.test.ts`.

**Files:**
- `src/hooks/useFileDropzone.ts`: warnings are dismissed at the scene replacement, not at load start.
- `src/hooks/fileDropzoneLocalSources.ts`: `LocalSourceLoad.onSceneReplaced`, called at three commits.
- Tests: `useFileDropzone.test.ts`, `fileDropzoneLocalSources.test.ts` and `fileDropzoneWorkflow.test.ts` (the point-cloud `it.each`).

**Review focus:**
- A failed or cancelled drop keeps the open scene's timeout warnings. A successful drop removes them when its scene replaces the old one.
- A URL load still dismisses them at its start.
- Each F15 test runs through the real `useFileDropzone` hook and workflow, not a mock.
- The test "keeps None picked while a dropped folder is still being read" stays green with Task 7's flag.

- [ ] **Step 1:** X6. Write the test and run it RED, implement, and run it GREEN. Run the full checks.
- [ ] **Step 2:** F15. Write the tests and prove each with its mutation. Run the full checks and the e2e specs. Commit both steps together: "Keep the open scene's warnings when a dropped load fails, and pin the load hand-offs", or as two commits.

### Task 6: A gated Hugging Face dataset is reported as gated after sign-in (X1)

**Spec:** Q1 §X1, option B (wording only, user decision 2). No OAuth scope change, and no edit to `docs/hugging-face-loading.md`'s scope lines.

**Files:** `src/features/huggingface/datasetAccess.ts` (the gated 403 text) and `datasetAccess.test.ts` (one test).

**Review focus:**
- The message for a signed-in reader matches what `docs/hugging-face-loading.md:36` promises.
- The signed-out and plain-403 messages are unchanged.

- [ ] **Step 1:** Write the test and run it RED, implement, and run it GREEN. Run the full checks. Commit: "Say a Hugging Face dataset is gated after sign-in too".

### Task 7: Share links and publications keep the dataset's own splat unless None was chosen (F2)

**Spec:** Q2 §F2 is binding in full, with its recommended option for publications.
- Adapt to Task 1, which replaced the test at `:1084`, and to Task 3, which edited `restorationConfig`. Both are separate hunks.

**Files:**
- `src/utils/splatFileSourcePolicy.ts` and its test
- `src/store/reconstructionStore.ts` and its test
- `src/hooks/useUrlState.ts` (`collectShareConfig`) and its test
- `src/hooks/useFileDropzone.ts` (`getSplatSelectionState`)
- `src/features/datasetPublishing/preparePublication.ts` (`:203-207`) and its test
- `src/hooks/useUrlLoader.test.ts` (helpers at `:94`, `:507`)
- `src/hooks/fileDropzoneWorkflow.test.ts` (helpers)

**Interfaces:**
- **Produces:** the store flag `splatNoneChosen`. It records a None chosen explicitly, by saved settings or by a link.
- **Reading:** `getShareActiveSplatSourceId` returns `''` only when that flag is set, and `null` otherwise. The in-load reading follows the same rule.
- **Consumers:** Tasks 5, 8, 9 and 13 work on top of this.

**Review focus:**
- Each way None can be chosen sets the flag: picker, panel, `n`, saved settings and link. Every activation clears it.
- A sharer whose splat list timed out, or whose splat failed, shares no choice.
- G11 still holds: an explicit None in a link is honoured before any decode.
- Publications and embeds follow the same rule. Drive (`prepareArchive.ts:157`) inherits it.

- [ ] **Step 1:** Write the tests and run them RED, implement, and run them GREEN. Run the full checks and the e2e specs. Commit: "Keep the dataset's own splat in share links and publications unless None was chosen".

### Task 8: A Reload's or tile download's overlay and Cancel stay while an earlier splat finishes decoding (F4, F10, X9)

**Spec:** Q2 §F4, §F10 and §X9 are binding in full, together with design ruling 2.
- The commit body also says: "A splat-only scene whose only splat fails returns to the landing page, as cancelling its decode does."
- Adapt to Task 7 in `reconstructionStore.ts` and its test.

**Files:**
- `src/components/viewer3d/WebGpuSplatCanvasLayer.tsx` and its test (LF endings)
- `src/components/viewer3d/useScene3DStoreFacade.ts` and its test (the test has LF endings)
- `src/components/viewer3d/Scene3D.tsx`
- `src/components/viewer3d/PointCloud/SplatLayer.tsx` and its test
- `src/components/viewer3d/PointCloud/SplatLayerStoreFacade.ts` and its test
- `src/store/reconstructionStore.ts` and its test

**Review focus:**
- **Who owns the overlay:** both renderers decide ownership by when an attempt started. They leave the overlay, progress and URL error to a dataset load or tile download that began after them.
- **Cancel during a settle (R1 §G3):** a decode Cancel during a URL load's settle is still None. `cancelLoading` is unchanged.
- **A failed splat under a download:** `dropFailedSplat` drops it but leaves the overlay to the download. When the downloaded tile lands, its activation display is decided then.
- **X9:** a splat-only scene whose only splat fails takes the `clear()` path, like a cancelled decode. "Cancel never calls `clear()`" is untouched.
- **E2e:** the full chromium project passes, including `sog-splats.spec.ts`.

- [ ] **Step 1:** F4. Write the tests and run them RED, implement, and run them GREEN. Run the full checks.
- [ ] **Step 2:** F10 and X9. Same cycle. Run the full checks and the full chromium project. Commit: "Keep a Reload's or tile download's overlay and Cancel while an earlier splat finishes decoding", or one commit per step.

### Task 9: The Point Cloud panel ignores splat picks while a dataset load replaces the scene (F11, X11(b))

**Spec:** Q2 §F11 and §X11(b) are binding in full. Adapt to Tasks 5 and 7 in `fileDropzoneWorkflow.test.ts`.

**Files:**
- `src/components/viewer3d/useViewerControlsController.ts` and its test
- `src/hooks/fileDropzoneWorkflow.ts` (`:582-599`)
- `src/hooks/fileDropzoneWorkflow.test.ts`

**Review focus:**
- The panel select follows `n`: it is ignored while a dataset load is pending, so the overlay, Cancel and the drop gate stay.
- The workflow resolves an in-load pick by id, path or file name itself, not through `requestedSplatSourceId`'s leftover. Behaviour is unchanged.
- Task 5's F15 test "keeps None picked while a dropped folder is still being read" stays green.

- [ ] **Step 1:** Write the tests and run them RED, implement, and run them GREEN. Run the full checks and the e2e spec. Commit: "Ignore splat picks in the Point Cloud panel while a dataset load replaces the scene".

### Task 10: Files dropped on an open dialog are ignored (X5)

**Spec:** Q2 §X5 is binding in full.

**Files:** `src/components/dropzone/DropZone.tsx` and `DropZone.test.tsx`.

**Review focus:**
- A drop while the Load URL dialog, or any modal dialog, is open starts no load.
- Drops on the viewer and the landing page still work, and every e2e spec that drops a dataset still passes.

- [ ] **Step 1:** Write the test and run it RED, implement, and run it GREEN. Run the full checks and the e2e specs. Commit: "Ignore files dropped on an open dialog instead of loading them underneath".

### Task 11: Drive publishes the masks the viewer shows when their host answers 403 or blocks CORS (F8)

**Spec:** Q3 §F8 (T1) is binding in full, with D1's option A (user decision 3).

**Files:** `src/features/googleDrive/prepareArchive.ts` and its test; `docs/google-drive-publishing.md:18`.

**Review focus:**
- **403 or network error:** a 403 or a CORS-less network error on a probe skips that mask name and does not count toward the 8-image rule.
- **Deliberate handling kept:** timeouts, 500, 401 and 410 still fail with Retry (C2, G10).
- **Parity:** the behaviour matches the viewer's `fetchUrlMask`.

- [ ] **Step 1:** Write the tests and run them RED, implement, and run them GREEN. Update the doc line. Run the full checks. Commit: "Publish Drive datasets whose mask host answers 403 or blocks CORS, as the viewer shows them".

### Task 12: A stopped Drive publication clears when another dataset loads; a built ZIP keeps uploading through edits and marks (F12)

**Spec:** Q3 §F12 (T2) is binding in full.

**Files:**
- `src/features/googleDrive/publishDataset.ts` and its test
- `src/features/googleDrive/publicationRuntime.ts` and its test
- `src/features/googleDrive/publicationReceiptReset.test.ts`
- `docs/google-drive-publishing.md:8`, `:24`

**Review focus:**
- **Dataset change:** loading another dataset resets a failed, cancelled or finished job to the form, so nothing of the old dataset shows.
- **Edits and deletion marks:** they stop a job only until its ZIP is built, as HF publishing does. After that the upload continues, or offers Retry once the mark is removed, as the spec says.
- **G1:** its "a finished job clears" still holds.

- [ ] **Step 1:** Write the tests and run them RED, implement, and run them GREEN. Update the doc lines. Run the full checks. Commit: "Clear a stopped Drive publication when another dataset loads, and keep uploading a built ZIP through edits and deletion marks".

### Task 13: An over-limit Hub dataset is refused before download; Hub reads retry; Hub model and Space files are copied (F5, X3, X2)

**Spec:** Q3 §F5, §X3 and §X2 (T3) are binding in full; X2 follows user decision 4. Adapt to Task 7's hunk in `preparePublication.ts` (`:203-207`).

**Files:**
- `src/features/googleDrive/prepareArchive.ts` and its test
- `src/features/datasetPublishing/preparePublication.ts` (the dep and image branch)
- `docs/google-drive-publishing.md:16`, `:18`

**Review focus:**
- **Over-limit Hub dataset:** each Hub image folder is listed once at the pinned commit. An over-limit dataset is refused before any image downloads, with the permanent 2 GiB message.
- **Graceful degradation:** a failed listing, or a non-Hub host, behaves as today.
- **X3:** Hub revision reads and listings back off on 429 and 5xx, as mask probes do.
- **X2:** Hub model and Space files are copied unpinned, like any other host. 2c9dfd8's refusal is gone, and its other permanent cases (non-HTTP(S) URLs, URLs with credentials) stay.

- [ ] **Step 1:** F5 and X3. Write the tests and run them RED, implement, and run them GREEN. Run the full checks.
- [ ] **Step 2:** X2. Same cycle. Commit: "Refuse a Hugging Face dataset too large for a Drive ZIP before downloading it, retry throttled Hub reads, and copy Hub model or Space files", or one commit per step.

### Task 14: A splat that changed since loading no longer fails publication; unloaded local images end it (F13)

**Spec:** Q3 §F13 (T4) is binding in full.

**Files:**
- `src/features/datasetPublishing/types.ts`
- `src/features/datasetPublishing/preparePublication.ts` and its test
- `src/features/datasetPublishing/publishDataset.ts` (the HF controller) and its test
- `src/features/googleDrive/prepareArchive.ts` (the pre-check) and its test
- `src/features/googleDrive/publishDataset.test.ts` (the F13(a) Drive test)

**Review focus:**
- **(a) Missing local original:** an original missing from a local dataset's captured files fails permanently, like its siblings.
- **(b) Splat sizes:** the size read at load only plans batches and the 2 GiB limit; it is never checked against the download. Drive checks Hub splats against their size at the pinned commit.
- **Permanence:** input-bound failures stay permanent.
- **E2e:** `hugging-face-publish.spec.ts` passes.

- [ ] **Step 1:** Write the tests and run them RED, implement, and run them GREEN. Run the full checks and the e2e spec. Commit: "Stop failing publications on a splat that changed since loading, and end publications whose local images were not loaded".

### Task 15: A release tag that does not match `package.json` is refused (F6 part 2)

**Spec:** Q4 §F6 Part 2 (T1) is binding in full.

**Files:**
- `scripts/deployment/profiles.mjs` (`validateReleaseTag`)
- `scripts/deployment/preflight.mjs`
- `scripts/deployment/profiles.test.mjs`
- `docs/dual-hosting.md:62`
- `CONTRIBUTING.md`

**Interfaces:**
- **Produces:** `validateReleaseTag(tag, version)`. It throws `Release tag ${tag} must be v plus package.json's version (${version}). Commit the version bump before tagging.`

**Review focus:**
- **When it runs:** preflight rejects the mismatch before any build or upload, on tag runs only. `main` and preview runs are unaffected.
- **Test strength:** the tests include the two mutation REDs that Q4 recorded.

- [ ] **Step 1:** Write the test and run it RED, implement, and run it GREEN. Update the docs. Run the full checks and `npm run test:deployment`. Commit: "Refuse a release tag that does not match package.json's version".

### Task 16: Previews of older releases pass the trusted check; previews publish static files only (F14, X4)

**Spec:** Q4 §F14 and §X4 (T2) are binding in full. Adapt to Task 15 in `profiles.test.mjs` and `docs/dual-hosting.md`.

**Files:**
- `scripts/deployment/tests/artifacts.spec.ts`
- `scripts/deployment/profiles.test.mjs` (the preview-step contract)
- `.github/workflows/deploy-preview.yml` (comment only)
- `docs/dual-hosting.md:50`

**Review focus:**
- **Version-skew guard:** it applies to the preview profile only, and the github profile stays strict.
- **Static files only:** `_worker.js`, `_routes.json` and `functions` are refused before the token step uploads anything.
- **Trust model:** it is documented in `dual-hosting.md` and the workflow comment.

- [ ] **Step 1:** Write the tests and run them RED, implement, and run them GREEN. Run the full checks and `npm run test:deployment`. Commit: "Let previews of older releases pass the trusted check, and publish previews as static files only".

### Task 17: The OAuth verification doc says how to end the Drive session with a scene open (X12)

**Spec:** Q4 §X12 (T3).

**Files:** `docs/google-oauth-verification.md:140`.

- [ ] **Step 1:** Edit the bullet. Run `npm run lint`; the full suite is not needed for a docs-only change. Commit: "Say how to end the Drive loading session while a scene is open".

### Task 18: Share and embed links made on `/dev/` open `/dev/` (F6 part 1)

**Spec:** Q4 §F6 Part 1, option A (user decision 1).

**Files:** `src/utils/shareUrl.ts` and `shareUrl.test.ts`.

**Review focus:**
- **`/dev/` and `/dev/index.html`** link to `https://colmapview.github.io/dev/`.
- **`/latest/` and version directories** still link to `/v<version>/`; the existing test stays.
- **Previews and the custom host** link to themselves.

- [ ] **Step 1:** Write the test and run it RED, implement, and run it GREEN. Run the full checks. Commit: "Open Share and embed links made on /dev/ in /dev/".

### Task 19: Verify the branch and run the Codex gate *(controller)*

- [ ] **Ledger each task's outcome** from the workflow's result: status, commits, rounds, open findings, concerns and carried Minors. Verify the commit trailers, and check each commit's files against its task.
- [ ] **Resolve any task that was skipped or stopped.** Resume or re-dispatch it with the missing context, and ledger the ruling.
- [ ] **Run the full CI gate on a quiet tree:**
  - `npx tsc -b --force`;
  - `npm run check` (pristine vitest output);
  - `npm run test:deployment`;
  - `npx playwright test --project=chromium --reporter=list`.
- [ ] **Run the Codex gate:** `codex review --base 1984de8 < /dev/null` in the background, and read its findings when it finishes.

### Task 20: Final review, one fix wave, one re-review *(workflow, Appendix B)*

- [ ] **Launch Appendix B** with these inputs:
  - base `1984de8`;
  - the review packages: production `-U10` and tests `-U3`;
  - the Codex findings;
  - the carried Minors and concerns;
  - any open task findings.
- [ ] **Ledger the results:** the verdict, the set-aside items, the fix wave's commits and the re-review. Rule on any residuals and park them with rulings. There is no second fix wave.

### Task 21: Finish *(controller)*

- [ ] Re-run the full CI gate on the final tree.
- [ ] Present the finish options from superpowers:finishing-a-development-branch. The user chose a local merge in the last two rounds.
- [ ] **After the merge:**
  - run the full CI gate on `main`;
  - delete the branch;
  - apply Q4's `CLAUDE.md` draft (user decision 5) and show the diff;
  - update memory;
  - collect every `Ruling:` line;
  - delete the plan workspace.
- [ ] **Push (user decision 6):** ask for confirmation. Then run `git push origin main`, never `--tags`, and watch the deploy run (`gh run watch`). Report the result.
- [ ] **Report:** what changed, the verification results, "Rulings I made" (exhaustive), and the owner actions.

---

## Appendix A: implementation workflow (Tasks 1–18)

```js
export const meta = {
  name: 'close-final-review-gaps',
  description: 'Implement the 18 planned fixes as a dependency graph: each task is implemented, reviewed and fixed (up to 3 rounds) at its planned effort',
  phases: [
    { title: 'Tasks', detail: 'implement, review, fix; a task starts once the tasks it depends on are done; critical-path tasks never wait for a slot, the rest share three' },
  ],
}

const ROOT = 'C:/Users/HEQ/Projects/colmap_webview/colmap-webview'
const WS = ROOT + '/.superpowers/sdd/2026-10-07-final-review-gaps'
const SCRATCH = 'C:/Users/HEQ/AppData/Local/Temp/claude/C--Users-HEQ-Projects-colmap-webview/18fd85f8-55b2-4b0c-9e9a-5fc10492c0ad/scratchpad/rev4'
const SPECS = 'docs/superpowers/specs/2026-10-07-final-review-gaps/ (Q1-url-load-restore.md, Q2-splat-choice-cancel.md, Q3-publishing-drive.md, Q4-release-deploy-docs.md, design.md, findings.md)'
const CONSTRAINTS = 'the "Global Constraints" section of docs/superpowers/plans/2026-10-07-final-review-gaps.md (read only that section)'
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

const SHARED = 'Repository: ' + ROOT + ' (branch fix/final-review-gaps). Other tasks run at the same time on OTHER files and share this git index and working tree. ' +
  'Edit only the files your brief lists; if you must touch another file, stop with NEEDS_CONTEXT. To commit: `git add` only files you CREATED, then ' +
  '`git commit --only -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <every path you changed>`. ' +
  'Never run a bare `git commit`: another task may have staged files that it would sweep in. Never use git add -A or ., commit -a, stash, or checkout -- on files you did not change. ' +
  'If .git/index.lock exists, wait and retry; never delete it. After committing, check that `git show --stat HEAD` lists only your paths. ' +
  'A full-suite or e2e failure plainly in another task\'s in-progress files: re-run once, then report it. Never amend, never push, never dispatch subagents. ' +
  'Mutation checks: apply the mutation with a targeted edit and revert it with a targeted edit, then confirm with `git diff -- <file>`. Never restore a repo file by copying a backup over it ' +
  '(the scratchpad is shared across agents; name any scratch file with your task number). Never edit C:/Users/HEQ/Projects/colmap_webview/CLAUDE.md.'
const brief = t => WS + '/task-' + t.n + '-brief.md'
const report = t => WS + '/task-' + t.n + '-report.md'
const e2eStep = t => !t.e2e ? '' :
  ' Before your last commit also run the e2e gate: `COLMAP_WEBVIEW_E2E_PORT=' + (5400 + t.n) + ' npx playwright test ' + (t.e2e === 'all' ? '' : t.e2e + ' ') +
  '--project=chromium --reporter=list --output=' + SCRATCH + '/e2e-out/task-' + t.n + '` (your own port and output folder; never the HTML reporter).'

const implementPrompt = t =>
  'You are implementing Task ' + t.n + ': ' + t.title + '.\n' +
  'Read your brief first; it is your requirements: ' + brief(t) + '. It names the binding spec sections; the specs are in ' + SPECS + ', and the rules that bind every task are in ' + CONSTRAINTS + '. Where a spec gives code or tests, that code ' +
  'is the requirement: adapt it only to earlier tasks\' changes and record every deviation.\n' + SHARED + '\n' +
  'Work test-first: write each test, run it RED for the expected reason, implement, run it GREEN. A test that only adds coverage for behaviour ' +
  'that is already correct (for example F15) gets its RED from a mutation of the production code, which you then restore exactly. Before each commit run the full `npx vitest run` ' +
  '(pristine output), `npx tsc -b --force` and `npm run lint`' + (t.deploy ? ', plus `npm run test:deployment`' : '') + '.' + e2eStep(t) + ' ' +
  'Commit subjects come from the brief; every message ends with "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>".\n' +
  'Write your full report to ' + report(t) + ': per item what changed, RED/GREEN evidence, full-suite/tsc/lint/e2e results, files, deviations, concerns. ' +
  'Return the structured result (commits = short SHAs in order).' +
  (t.note ? '\nNOTE FROM THE CONTROLLER: ' + t.note : '')

const reviewPrompt = (t, impl) =>
  'You are reviewing Task ' + t.n + ': ' + t.title + '. This is a task-scoped gate and your review is read-only: never modify the working tree, index or HEAD.\n' +
  'Brief: ' + brief(t) + '. It names the binding spec sections (specs: ' + SPECS + '; binding rules: ' + CONSTRAINTS + ') and a Review focus list; check each focus item with one focused check, naming what you checked. ' +
  'The implementer\'s report contains unverified claims: ' + report(t) + '. Commits: ' + impl.commits.join(', ') + '. Read them with `git show <sha>`; other tasks\' commits may interleave. ' +
  'Do not run the full suite; run a focused test only for a specific doubt.\n' +
  'Spec compliance: missing, extra or misunderstood items, each with file:line. Quality: correctness, tests that pin real behaviour (would each fail on the old code?), ' +
  'structure, pristine output, store facades, line endings. Severity: Critical or Important means the task cannot be trusted until fixed; Minor means polish. ' +
  'Never dispatch subagents. Return the structured verdict, with file:line in "where".'

const fixPrompt = (t, findings, round) =>
  'Fix round ' + round + ' for Task ' + t.n + ': ' + t.title + '. Your brief is ' + brief(t) + ' and the report is ' + report(t) + '.\n' + SHARED + '\n' +
  'Fix every finding below. Where a behaviour changes, write the test first and run it RED, then GREEN. Run the full checks before committing' +
  (t.deploy ? ' (including `npm run test:deployment`)' : '') + '.' + e2eStep(t) + ' ' +
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

**`args`** (one entry per row of the execution table):
```json
{ "maxConcurrentTasks": 3, "tasks": [
  { "n": 1, "title": "A self-contained archive makes no sidecar request (F1)", "deps": [], "critical": true, "prio": 0, "effort": "medium", "reviewEffort": "high", "e2e": "e2e/dataset-viewer-settings.spec.ts" },
  { "n": 2, "title": "A slow splat list that is still answering keeps its tiles; a listed splat that is gone is skipped (F3, X8)", "deps": [1], "critical": false, "prio": 1, "effort": "high", "reviewEffort": "high", "e2e": "e2e/dataset-viewer-settings.spec.ts e2e/hugging-face-publish.spec.ts" },
  { "n": 3, "title": "Alignment changes made while a restored splat downloads are kept (F9)", "deps": [], "critical": true, "prio": 0, "effort": "medium", "reviewEffort": "high" },
  { "n": 4, "title": "A failed shared link leaves the address bar once another dataset loads (F7)", "deps": [], "critical": false, "prio": 3, "effort": "medium", "reviewEffort": "medium", "e2e": "e2e/hugging-face-publish.spec.ts" },
  { "n": 5, "title": "The open scene's warnings survive a dropped load that fails; the load hand-offs are pinned (X6, F15)", "deps": [7], "critical": true, "prio": 0, "effort": "medium", "reviewEffort": "high", "e2e": "e2e/drop-zone.spec.ts e2e/dataset-viewer-settings.spec.ts" },
  { "n": 6, "title": "A gated Hugging Face dataset is reported as gated after sign-in (X1)", "deps": [], "critical": false, "prio": 7, "effort": "low", "reviewEffort": "low" },
  { "n": 7, "title": "Share links and publications keep the dataset's own splat unless None was chosen (F2)", "deps": [1, 3], "critical": true, "prio": 0, "effort": "high", "reviewEffort": "high", "e2e": "e2e/hugging-face-publish.spec.ts e2e/dataset-viewer-settings.spec.ts" },
  { "n": 8, "title": "A Reload's or tile download's overlay and Cancel stay while an earlier splat finishes decoding (F4, F10, X9)", "deps": [7], "critical": true, "prio": 0, "effort": "high", "reviewEffort": "max", "e2e": "all" },
  { "n": 9, "title": "The Point Cloud panel ignores splat picks while a dataset load replaces the scene (F11, X11(b))", "deps": [5], "critical": true, "prio": 0, "effort": "medium", "reviewEffort": "medium", "e2e": "e2e/viewer-controls.spec.ts" },
  { "n": 10, "title": "Files dropped on an open dialog are ignored (X5)", "deps": [], "critical": false, "prio": 4, "effort": "low", "reviewEffort": "medium", "e2e": "e2e/drop-zone.spec.ts e2e/modals.spec.ts" },
  { "n": 11, "title": "Drive publishes the masks the viewer shows when their host answers 403 or blocks CORS (F8)", "deps": [], "critical": true, "prio": 0, "effort": "medium", "reviewEffort": "high" },
  { "n": 12, "title": "A stopped Drive publication clears when another dataset loads; a built ZIP keeps uploading through edits and marks (F12)", "deps": [11], "critical": true, "prio": 0, "effort": "high", "reviewEffort": "max" },
  { "n": 13, "title": "An over-limit Hub dataset is refused before download; Hub reads retry; Hub model and Space files are copied (F5, X3, X2)", "deps": [7, 12], "critical": true, "prio": 0, "effort": "high", "reviewEffort": "high" },
  { "n": 14, "title": "A splat that changed since loading no longer fails publication; unloaded local images end it (F13)", "deps": [13], "critical": true, "prio": 0, "effort": "medium", "reviewEffort": "high", "e2e": "e2e/hugging-face-publish.spec.ts" },
  { "n": 15, "title": "A release tag that does not match package.json is refused (F6 part 2)", "deps": [], "critical": false, "prio": 2, "effort": "low", "reviewEffort": "medium", "deploy": true },
  { "n": 16, "title": "Previews of older releases pass the trusted check; previews publish static files only (F14, X4)", "deps": [15], "critical": false, "prio": 6, "effort": "low", "reviewEffort": "medium", "deploy": true },
  { "n": 17, "title": "The OAuth verification doc says how to end the Drive session with a scene open (X12)", "deps": [], "critical": false, "prio": 8, "effort": "low", "reviewEffort": "low" },
  { "n": 18, "title": "Share and embed links made on /dev/ open /dev/ (F6 part 1)", "deps": [], "critical": false, "prio": 5, "effort": "low", "reviewEffort": "medium" }
] }
```

## Appendix B: final review workflow (Task 20)

```js
export const meta = {
  name: 'final-review-final-gaps',
  description: 'Whole-branch review at max effort, then one fix wave for its findings (Codex and carried items included) under the full CI gate, then one scoped re-review',
  phases: [
    { title: 'Final review', detail: 'max effort; triages Codex findings, carried Minors and open task findings' },
    { title: 'Fix wave', detail: 'one fixer, xhigh effort, full CI gate' },
    { title: 'Re-review', detail: 'scoped to the fix wave, high effort' },
  ],
}

const ROOT = 'C:/Users/HEQ/Projects/colmap_webview/colmap-webview'
const SCRATCH = 'C:/Users/HEQ/AppData/Local/Temp/claude/C--Users-HEQ-Projects-colmap-webview/18fd85f8-55b2-4b0c-9e9a-5fc10492c0ad/scratchpad/rev4'
const PLAN = 'docs/superpowers/plans/2026-10-07-final-review-gaps.md'
const SPEC = 'docs/superpowers/specs/2026-10-07-final-review-gaps/'
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
  'You are the final whole-branch reviewer for "close the final review\'s findings" on branch fix/final-review-gaps (' + ROOT + '). Each task went through its own review; a task whose findings stayed open after three fix rounds is listed under open task findings below. Dispose of each one explicitly: fix it, or set it aside with a reason. You are the broad gate before a local merge and a push; your review is read-only.\n' +
  'Requirements: the plan ' + PLAN + ', and the design, rulings and findings in ' + SPEC + ' (design.md, findings.md, Q1-Q4). Deliberate decisions recorded in design.md and the Q-spec briefs are not defects unless they cause concrete harm.\n' +
  'Range: ' + args.base + '..HEAD. Review packages: ' + args.packages.join(', ') + '. Read the production package fully, in passes; sample the tests package on the riskiest areas.\n' +
  'Focus on cross-task interactions: the archive sidecar and the discovery deadline, share-link and publication splat choice, renderer ownership of the overlay under Reload and tile downloads, the in-load pick rule, drops on dialogs, the startup retry and address bar, Drive packaging and invalidation, publication failure classes, and the deploy checks.\n' +
  'Triage these carried items. Keep the real ones in your findings with a fix; set aside the rest in "declined", with reasons.\n' +
  'Codex findings: ' + JSON.stringify(args.codex) + '\nCarried Minors from task reviews: ' + JSON.stringify(args.minors) + '\nOpen task findings: ' + JSON.stringify(args.open) + '\n' +
  'For every behaviour you set aside as outside the plan, add a "declined" line with the reason. Never dispatch subagents.',
  { label: 'final review', phase: 'Final review', effort: 'max', schema: FINDINGS })
if (!review || review.findings.length === 0) return { review, fix: null, reReview: null }

phase('Fix wave')
const fix = await agent(
  'You are the one final fix wave for branch fix/final-review-gaps (' + ROOT + '). No other agent is running. Fix every finding below, writing the test first wherever behaviour changes. ' +
  'Global constraints are in ' + PLAN + ' (Global Constraints). Before each commit run the full `npx vitest run` (pristine output), `npx tsc -b --force` and `npm run lint`; ' +
  'at the end run the full CI gate: `npm run check`, `npm run test:deployment`, and `npx playwright test --project=chromium --reporter=list --output=' + SCRATCH + '/e2e-out/final-fix`. ' +
  'Make one commit per finding or tightly related pair, each ending with the Co-Authored-By trailer; never amend or push. ' +
  'Mutation checks: apply the mutation with a targeted edit and revert it with a targeted edit, then confirm with `git diff -- <file>`. Never restore a repo file by copying a backup over it; name any scratch file with the prefix final-fix. ' +
  'Never edit C:/Users/HEQ/Projects/colmap_webview/CLAUDE.md. ' +
  'Write your report to ' + ROOT + '/.superpowers/sdd/2026-10-07-final-review-gaps/final-fix-wave-report.md.\nFindings:\n' + JSON.stringify(review.findings, null, 1),
  { label: 'final fix wave', phase: 'Fix wave', effort: 'xhigh', schema: IMPL })

phase('Re-review')
const reReview = fix && fix.commits.length ? await agent(
  'Re-review the final fix wave on fix/final-review-gaps (' + ROOT + '). Your review is read-only. Fix commits: ' + fix.commits.join(', ') +
  '; the report is in .superpowers/sdd/2026-10-07-final-review-gaps/final-fix-wave-report.md. For each finding below decide ADDRESSED or NOT ADDRESSED with file:line evidence, ' +
  'then inspect the fix diff for new breakage. Never dispatch subagents.\nFindings:\n' + JSON.stringify(review.findings, null, 1),
  { label: 'final re-review', phase: 'Re-review', effort: 'high', schema: REREVIEW }) : null
return { review, fix, reReview }
```

**`args`:**
```json
{
  "base": "1984de8",
  "packages": ["<production package path>", "<tests package path>"],
  "codex": ["<Codex findings>"],
  "minors": ["<carried Minors and concerns, or a pointer to a file holding them>"],
  "open": ["<open task findings>"]
}
```
