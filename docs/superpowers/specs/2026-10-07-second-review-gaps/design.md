# Close the Second Review's Gaps: Design

**Date:** 2026-10-07
**Branch:** `fix/second-review-gaps`, cut from local `main` at e8a2a43 (unpushed). When the work is complete and verified it merges back locally.

**User request (2026-10-07):** after a second review of everything unreleased since v0.15.4, the user said: "can you create a plan for the fix with agentic workflow and appropraite effrot".

**User decisions (AskUserQuestion, 2026-10-07):**
1. **A new dataset starts at identity.** Opening a different dataset resets the scene transform unless the dataset's own `colmapview.yaml` or share link sets an alignment. Reload still restores the dataset's own saved alignment.
2. **Update the project `CLAUDE.md`.** Apply the drafted release-section text as the plan's last step, after the merge.
3. **One workflow.** Run every task as one agentic workflow, with the dynamic workflow size limit raised.

## Sources

| File | Content |
|---|---|
| [findings.md](findings.md) | The 32 verified findings: G1–G15, E1–E16, C1 |
| [R1-cancel-reload.md](R1-cancel-reload.md) | G2, G3, G5, E2, E6, C1 |
| [R2-load-lifecycle.md](R2-load-lifecycle.md) | G6, G7, G11, G12, G13, E13 |
| [R3-publishing-drive.md](R3-publishing-drive.md) | G1, G4, G10, G15, E1, E5, E10, E12, E15 |
| [R4-hf-access-auth.md](R4-hf-access-auth.md) | G9, G14, E4, E11, E14, E16 |
| [R5-privacy-docs-deploy.md](R5-privacy-docs-deploy.md) | G8, E3, E7, E8, E9 |

Read-only research agents wrote these on 2026-10-07. Every finding was confirmed. Every proposed test was run RED at e8a2a43 and GREEN with the fix in a scratch copy, and the full suites there were green apart from fixture gaps in the copies. Where a spec gives code, that code is the requirement. Where a spec offers options, its recommended option is binding unless a ruling below says otherwise.

## Controller rulings

1. **G3 re-scoped.** R2's G6 settles the URL load's settings and splat list before the scene commits. So a bundled splat decodes only after its URL load has applied and bound its settings, and G3's window disappears.
   - R2's test "settles the settings beside an archive before handing its bundled splat to the renderer" pins the outcome and replaces R1's G3 integration test.
   - R1's production change to the G3 decode branch (decode-Cancel equals None and does not abort the URL load) lands only if the implementer shows, with a test that fails on post-G6 code, a window that still exists.
   - G5 (keep a multi-splat scene) lands as specified.
2. **New datasets start at identity (user decision 1), merged with G2.**
   - `setReconstruction`'s scene-load branch (no `edited`) resets the scene transform, next to `clearPendingDeletions()`.
   - This is R1 §G2's rejected alternative, now chosen. It also fixes G2: the reset happens only when a scene actually commits, so the four Reload entry points drop their early `resetTransform()`, and a cancelled or failed Reload changes nothing.
   - R1's `onSceneReplaced` reset in `reloadFiles` is not needed.
   - `sessionActions.test.ts:164` ("A dataset without settings leaves the alignment on screen") flips.
   - Other tests that set a transform before `setReconstruction` are swept.
   - The facade entry R1 lists as unused after G2 (`useExportPanelStoreFacade`'s `transform.resetTransform`) is removed if nothing else uses it.
3. **E6 follows R1's approach.** `getAppStartupLoadPlan` drops the link's alignment from the pre-load config; the loader applies it once the scene exists. R2's suggested load-start reset points are used only if the implementer shows that R1's approach leaves a carry-over path. With ruling 2, a committed scene starts at identity anyway.
4. **A visible warning when the splat listing times out (new task).** R2's G6 bounds discovery at 30 s after parsing; on timeout the scene appears without splats, logged only. Losing a dataset's splats for the session should be visible, so a timed-out listing shows one persistent warning, like the settings-timeout warning. R2 lists this as an optional follow-up; the user asked to close every gap.
5. **The Spark callback race belongs to E2's task, and it is about loading ownership, not scene ownership.** This ruling was revised after the Codex plan review.
   - R1's out-of-scope note 4: a Spark failure for the old scene's splat calls `setUrlLoading(false)` over a new load's overlay.
   - During G6's settle, the old splat still belongs to the scene on screen, so a scene-ownership check isn't enough.
   - The failure handler, `dropFailedSplat` (through `showColmapOnly`, which clears loading, progress and `urlError`), and Spark's success and progress callbacks must not change the loading state, progress or URL error while another load owns them. Another load owns them while a dataset load is pending (`isReconstructionLoadPending()`), or by a load generation if that is cleaner.
   - Dropping a failed old splat must still restore its display without touching the new load's overlay.
   - Pin it with tests: fire each callback while `beforeSceneCommit` is held and the old file is still active.
6. **E12 lands before G14.** E12 tightens `componentStoreBoundary` to see every store exported from `src/store`. G14 adds a toolbar account button that reads HF session state, so it is written against the stricter rule.
7. **Shared-file order is a dependency graph, not lanes.** Tasks that touch the same file never run at the same time; everything else runs in parallel. The graph is in the plan.
8. **E1's doc lines and R3's optional G1/G10 doc notes go to the docs task.** They land after the code that they describe.
9. **G4 compares no ids.** Drop the id comparison at both sites: the commit sha pins the files, and the Hub redirects renamed and re-cased repos to the canonical id (R3, verified live).
10. **E3 uses `queue: max`.** GitHub added it in May 2026, so the owner watches the first push after the merge.
11. **E8 is applied by the controller after the merge (user decision 2).** It replaces lines 100–141 of `C:\Users\HEQ\Projects\colmap_webview\CLAUDE.md` with R5 §E8's text. Agents never edit that file.
12. **Effort is set per role.** Each task's implementer and reviewer run at the effort in the plan's table:
    - `max` for the URL-load restructure (G6);
    - `high` for multi-file logic;
    - `medium` for contained changes;
    - `low` for mechanical edits and docs.

    Fix rounds use the implementer's effort, and re-reviews the reviewer's. The final whole-branch review runs at `max`, the final fix wave at `xhigh`, and its re-review at `high`. Every agent uses the session model (Opus 5.5), per the user's standing Opus mandate.
13. **Minor findings ride to the end.** Each task review's Minor findings are collected and passed to the final whole-branch review. The reviewer triages them, and the one final fix wave fixes those it keeps. This replaces the separate deferred-minor tasks of the last plan.

## Codex plan review (2026-10-07): dispositions

Codex reviewed the plan read-only and reported 13 findings. It confirmed three things: every finding maps to the right task and spec sections, no two concurrent tasks share a declared file, and rulings 2 and 4 and G6's settle-before-commit design hold.

1. **Rejected.** "`export const meta` doesn't parse." The Workflow runtime requires that line. The scripts were checked by parsing them as async bodies and running a stub simulation.
2. **Accepted.** Ruling 5 now guards loading ownership, so callbacks during G6's settle are covered. Task 5's effort is raised to high/high.
3. **Accepted.** Tasks 13 and 15 both run the deploy browser smoke into shared folders, so Task 15 now waits for Task 13.
4. **Accepted.** Agents commit with `git commit --only -- <their paths>` and then check `git show --stat HEAD`, because parallel tasks share one index.
5. **Accepted.** A failed review, a blocked or failed fix, and a failed re-review all stop a task and skip its dependents. Only findings still open after three completed rounds let dependents proceed.
6. **Accepted.** Task 4 decides G3 with an integration test through the real post-Task-1 path. R1's hand-built state proves nothing about a remaining window.
7. **Accepted.** Task 9's retry is invalidated by any later load start, using the load lifecycle, and is tested through a real local load.
8. **Accepted.** A negative review verdict, or a re-review that is not "addressed", without blocking findings becomes a finding to resolve.
9. **Accepted.** The workflow returns every commit (implementation plus fix rounds) with each round's evidence.
10. **Accepted.** A test that only adds coverage of correct behaviour (G15) gets its RED from a mutation.
11. **Accepted.** Appendix B no longer claims every task passed. Open task findings must be disposed of explicitly.
12. **Partly accepted.** Task 13 runs at implementer `low`, matching R5. Its review stays `high`, because the text is public legal disclosure that Google's OAuth verification compares against.
13. **Accepted.** Stale cross-plan task references are replaced with function and test names.

## Out of scope

- **R4's appendix (the E14 follow-up).** After E14 the `datasetAccess` workaround is redundant but harmless, and removing it needs `useUrlLoader.ts` and its tests. That is refactor-only.
- **R1's E2 residuals.** Failures under the forced `?splatBackend=webgpu` debug flag.
- **Owner actions, surfaced rather than performed:**
  - pushing;
  - tagging a release;
  - the privacy policy's effective date;
  - GA4 retention;
  - `gh cache delete --all`;
  - the local-only tags v0.10.0 and v0.11.0;
  - deleting `src/store/viewerStore_test.ts` and `deno.json`;
  - watching the first `queue: max` deploy.

## Constraints

- Before every commit, the full `npx vitest run` passes with pristine output, `npx tsc -b --force` exits 0 (it now covers tests), and `npm run lint` is clean. Deploy-script tasks also run `npm run test:deployment:config`. At the end, run `npm run check` and `npm run build`.
- Components reach stores only through `*StoreFacade` modules.
- Use hand-written CSS only, and add no new classes.
- Use `anySignal`, never `AbortSignal.any`. After E4, use `timeoutSignal`, never `AbortSignal.timeout`.
- Keep comments brief, and only where they explain why.
- Keep each file's line endings: check with `git ls-files --eol`, and never rewrite a whole file.
- Commit messages say what the user sees and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never amend or push.
