# Pre-Release Simplify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved behaviour-preserving simplifications of the unreleased code, and fix two behaviour issues the reviewers found.

**Architecture:**
- Seven tasks run in two lanes. Lane A is the load path and the store: Tasks 1 → 2 → 3. Lane B is publishing, accounts and the UI shell: Tasks 4 → 5 → 6.
- Task 3 also waits for Task 4, and Task 7 (test-support consolidation) runs last.
- Each task: an Opus implementer, then an Opus reviewer, then fix rounds until approved.

**Tech Stack:** TypeScript 5.9, React 19, Zustand, Vitest 4 (jsdom), Playwright, ESLint 9, the Node test runner for deployment scripts.

**Spec:** `docs/superpowers/specs/2026-10-08-pre-release-simplify/design.md`, with the binding item specs `S1.md`–`S4.md` and the reviewers' `BRIEF.md`, which lists the deliberate decisions not to undo.

## Global Constraints
**Behaviour**
- Simplifications must not change behaviour. Existing tests pass unchanged, except tests that are the subject of a change: tests of deleted code, ported tests, and moved helpers. Error text the user sees, the order of side effects and DOM output stay identical.
- Where a spec says a path or text is unpinned, add the pinning test first and show it passes before and after.
- Fix the bugs test-first: RED before the fix, GREEN after.

**Checks**
- Before every commit, the full `npx vitest run` passes with pristine output (no stray stdout or stderr, no act warnings), `npx tsc -b --force` exits 0, and `npm run lint` is clean.
- **E2e and deploy gates.** Tasks that list e2e specs run them as `COLMAP_WEBVIEW_E2E_PORT=<5600+task> npx playwright test <specs> --project=chromium --reporter=list --output=<scratch>/e2e-out/task-<n>`. Use only that port and that output folder.
- **Another task's in-progress files.** The other lane works in the same tree at the same time. If a run fails only because of another task's unfinished files, re-run once, then report it.

**Code rules**
- Components reach stores only through `*StoreFacade` modules.
- Use `anySignal` and `timeoutSignal`, never `AbortSignal.any` or `AbortSignal.timeout`.
- CSS is hand-written. Every class used must be defined in `src/index.css` (`classContract.test.ts`).
- Keep each file's line endings (`git ls-files --eol`), and never rewrite a whole file.
- Do mutation checks with targeted edits, then confirm with `git diff`. Never copy a backup over a repo file. Name scratch files by task.

**Commits**
- Commit with `git add` (for new files only), then `git commit --only -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <paths>`. Then check `git show --stat HEAD`.
- Never amend or push, and never dispatch subagents.
- Never edit `C:\Users\HEQ\Projects\colmap_webview\CLAUDE.md`.

---

### Task 1: Load path simplifications (S1-1, S1-2, S1-3, S1-4, S1-5)

**Spec:** S1 §S1-1 (which also covers S4-3), §S1-2, §S1-3, §S1-4 and §S1-5. Follow each item's change, evidence and test notes.

**Scope:**
- the two warning modules, merged into one (`src/hooks/datasetTimeoutWarnings.ts` per S1-1), and their call sites;
- `clearCachesOnFailure`, `onSplatFileFetched` and the dead `committed` guards;
- `processLocalFiles` and the duplicate `onViewerState` closure;
- `fetchOptionalDatasetViewerSettingsResult` and `getRemoteFileContentLength`;
- the tests of all of these.

**E2e:** the full chromium project (`npx playwright test --project=chromium`).

**Review focus:**
- Each deletion has zero consumers, including tests.
- The warning texts, the show and dismiss timing, and which loads dismiss which warning are unchanged.
- Cache clearing happens on exactly the same paths.

- [ ] One commit per item, or per tightly related pair, with subjects that say what changed.

### Task 2: Bigger load-path refactors (S1-7, S1-8)

**Spec:** S1 §S1-7, including the deletion of the unused `createUrlLoadGuard`, and S1 §S1-8.

**E2e:** the full chromium project.

**Review focus:**
- **S1-7:** `DropZone`'s preparation moves out of the component and shares `runLoad`'s URL-load claim. The overlay, progress text, Cancel, `?url=` stripping and the in-load splat revision behave identically. The component reaches the store only through a facade.
- **S1-8:** only the dead eager-splat path goes, and the ported tests still pin the deferred path, including the publication test.

- [ ] Commit S1-7 and S1-8 separately.

### Task 3: Store and renderer simplifications, plus Bug 1 (S2-1, S2-4, S2-5, S2-6, S2-7, S2-8)

**Spec:**
- S2 §S2-1, §S2-4, §S2-5, §S2-6 and §S2-7;
- S2 §S2-8, which also covers S4-8;
- design.md Bug 1.

**Bug 1.** Spark's splat-load start must ask the same overlay-ownership rule that WebGPU's start asks. With S2-4, that is the shared `yieldsLoadingState` in `splatLoadingProgressPolicy`.
- Write the failing test first: a WebGPU-to-Spark fallback, or a Spark start, under a pending tile download or dataset load must not retake that work's overlay, progress or URL error.
- The existing WebGPU test at `SplatLayer.test.tsx:2115` must stay green.

**E2e:** the full chromium project.

**Review focus:**
- Bug 1's test fails on the old code.
- No other ownership or `dropFailedSplat` behaviour changes.
- `reconstructionActions.ts` has no consumers.
- The `reloadFiles` wrapper removal keeps the global menu's await-then-close order.

- [ ] Commit the simplifications and the Bug 1 fix separately.

### Task 4: Publishing and accounts simplifications, plus Bug 2 (S3-1, S3-2, S3-3, S3-5, S3-6)

**Spec:** S3 §S3-1, §S3-2, §S3-3, §S3-5 and §S3-6, and design.md Bug 2. S3-2 adds its three pinning tests first.

**Bug 2.** A Drive 401 or insufficient-scope answer expires only the session that made the request, as HF does (`datasetAccess.ts:49`).
- Write the failing test first: sign in again while an older Drive request is in flight. That request's 401 must leave the new session connected.
- Cover both the reading path (`api.ts`) and the upload path (`upload.ts`).

**E2e:** `e2e/hugging-face-publish.spec.ts`.

**Review focus:**
- S3-2's rewrites are equivalent (the spec's exhaustive check).
- The Drive status store export works for every consumer.
- `pinHfAssetUrl` behaves identically at both sites.
- Bug 2 doesn't keep a really expired session alive: the session that made the request still expires.

- [ ] Commit the simplifications and the Bug 2 fix separately.

### Task 5: One account-dialog skeleton for the two Hugging Face account dialogs (S3-4)

**Spec:** S3 §S3-4. A DOM test that compares before and after lands first.

**E2e:** `e2e/hugging-face-publish.spec.ts` and `e2e/ui-polish.spec.ts`.

**Review focus:**
- The DOM and the accessible names of both dialogs are identical before and after.
- The privacy-mandated access hint still appears wherever it did.

- [ ] One commit.

### Task 6: Deploy scripts and UI shell (S4-4, S4-5, S4-6, S4-7)

**Spec:** S4 §S4-4 (a–g), §S4-5, §S4-6 and §S4-7.

**Deploy gate:** `npm run test:deployment` (config tests plus the browser smoke).

**E2e:** `e2e/ui-polish.spec.ts` and `e2e/modals.spec.ts`.

**Review focus:**
- **S4-4:** profile environments, preflight, the live check and the build output are unchanged for every profile.
- **S4-5:** the `PolicyLinks` DOM is identical at all three call sites.
- **S4-7:** the three contract scans still see exactly the same files and still catch their violations. Prove this with a mutation each.

- [ ] One commit per item.

### Task 7: Test-support consolidation (S2-2/S4-1, S2-3, S4-2, which also covers S1-6)

**Spec:**
- S4 §S4-1, with the helper at `src/test/urlLoadHolds.ts`. It replaces both copies; S2-2's SplatLayer setup part is optional.
- S2 §S2-3: `buildPendingFetch`, and `buildTextFile` for the `colmapview.yaml` fakes.
- S4 §S4-2: the shared "real workflow, parsing stubbed" stubs, and `processWithStore`'s `sourceType` parameter, which replaces its in-file copy (S1-6).

**E2e:** none. Test-only.

**Review focus:**
- Every converted test still asserts the same thing.
- No test became vacuous. Spot-check with mutations.
- The full suite's test count changes only where duplicates merged.

- [ ] One commit per helper.
