# Close the Final Review's Findings: Design

**Date:** 2026-10-07
**Branch:** `fix/final-review-gaps`, cut from local `main` at 1984de8, which has not been pushed. When the work is complete and verified, it merges back locally.

**User request (2026-10-07):** "can you run a final review?" The review of `v0.15.4..main` found 15 confirmed findings, so `main` was not ready to push. The user then chose "Fix all 15, then push (Recommended)": the same process as the last round, with the low-severity extras triaged in the plan.

**User decisions (AskUserQuestion, 2026-10-07):**
1. **F6-D1: `/dev/` links open `/dev/` itself.** Share and embed links made on `/dev/` open `/dev/`, not `/v<package.json version>/`. Links made on `/latest/` or a version directory keep opening that release's `/vX.Y.Z/`. Previews and the custom host link to themselves.
2. **X1: wording only.** A signed-in reader of a gated HF dataset is told that it is gated. No `gated-repos` OAuth scope is requested this round, so the OAuth app needs no owner change.
3. **Drive D1 (F8): viewer parity.** A 403 or a CORS-less network error on a mask probe skips that mask name and does not count toward the 8-image rule. On such hosts this costs two probes per image.
4. **Drive D2 (X2): copy Hub model and Space files.** Drive copies them unpinned, like any other host. This reverses 2c9dfd8's permanent refusal.
5. **Project `CLAUDE.md`: apply Q4's full draft after the merge.**
   - Step 1 of "Creating a Release" becomes `npm version` plus `CHANGELOG.md`.
   - Two bullets are added: how to recover from a rejected tag, and where share links open.
   - The text is in Q4 §"Project `CLAUDE.md`". Only the controller applies it.
6. **Push only after confirmation.** The user chose "then push". The controller pushes only after the merge, a green full CI gate on `main`, and an explicit confirmation at that moment. The command is `git push origin main`, never `--tags`.

## Sources

| File | Content |
|---|---|
| [findings.md](findings.md) | F1–F15, the extras X1–X12, and the refuted items |
| [Q1-url-load-restore.md](Q1-url-load-restore.md) | F1, F3, F7, F9, F15; X1, X6, X8, X11(d), X11(e) |
| [Q2-splat-choice-cancel.md](Q2-splat-choice-cancel.md) | F2, F4, F10, F11; X5, X7, X9, X11(a), X11(b), X11(c) |
| [Q3-publishing-drive.md](Q3-publishing-drive.md) | F5, F8, F12, F13; X2, X3, X10 |
| [Q4-release-deploy-docs.md](Q4-release-deploy-docs.md) | F6, F14; X4, X12; the `CLAUDE.md` draft |

Read-only research agents wrote these specs on 2026-10-07:
- Every finding was confirmed.
- Every proposed test was run RED at 1984de8 and GREEN with the fix, in a scratch copy.
- Where e2e behaviour changes, the e2e spec was run too. Q1's scratch copy with all its fixes passed the full chromium project 89/89.

Where a spec gives code, that code is the requirement. Where a spec offers options, its recommended option is binding unless a decision above or a ruling below says otherwise.

## Controller rulings

1. **F3's decision change is accepted.** The splat-list deadline changes from "30 s after parsing" to "30 s without an answer from the listing, at most 120 s after parsing" (Q1 §F3). Settle-before-commit, the start after parsing and the persistent warning stay. A slow listing that keeps answering no longer loses its splats, and a stalled one still gives up after 30 s.
2. **Q2's refinements are accepted.** The main one: R1 §E2 had `dropFailedSplat` stand aside entirely for a tile download. Now it drops the failed splat, and only the overlay stays with the download (Q2 §F10). Q2 lists the others. None changes a deliberate decision.
3. **Extras dispositions are accepted as specified.**
   - **Fixed:** X1 (wording), X2, X3, X4, X5, X6, X8, X9, X11(b) and X12.
   - **Set aside:** X7 (pre-existing), X10 (performance only), X11(a), X11(c), X11(d) and X11(e) (refactor only). Each spec gives the reason.
   - Q1 corrects the findings: the archive's post-load settle and the zip loader's `committed` flag are not dead code.
4. **Shared files are ordered by the dependency graph in the plan.** Two tasks that edit the same file never run at the same time, because `git commit --only -- <path>` commits the whole working-tree file. Everything else runs in parallel.
5. **The CI gate is the deploy workflow's `validate` job, in full.** It runs `npm run check`, `npm run test:deployment` and `npx playwright test --project=chromium`. The last round's gate missed the e2e suite.
   - Every task runs the full `npx vitest run`, `npx tsc -b --force` and `npm run lint`.
   - Tasks whose specs name e2e specs also run those, with `--reporter=list`, on their own port and output directory.
   - Deploy-script tasks run `npm run test:deployment`.
   - The controller runs the full gate on a quiet tree before the final review, after its fix wave, and on the merged `main`.
6. **Effort is set per role**, from each spec's recommendation, in the plan's table. Fix rounds use the implementer's effort, and re-reviews the reviewer's. The final whole-branch review runs at `max`, its fix wave at `xhigh`, and its re-review at `high`. Every agent uses the session model (Opus 5.5), per the user's standing Opus mandate.
7. **Minor findings ride to the end.** Each task review's Minors go to the final whole-branch review, which triages them for the one final fix wave.
8. **Agents never edit `C:\Users\HEQ\Projects\colmap_webview\CLAUDE.md`.** The controller applies decision 5 after the merge.

## Out of scope
- **The set-aside extras** (ruling 3), and Q2's "Residual risks" list.
- **Owner actions, surfaced rather than performed:**
  - the privacy policy's effective date at release;
  - GA4 retention;
  - `gh cache delete --all`;
  - the local-only tags `v0.10.0` and `v0.11.0`;
  - deleting `src/store/viewerStore_test.ts` and `deno.json`;
  - an optional Safari 15.x check;
  - watching the first `queue: max` deploy after the push.

## Constraints
- **Before every commit:** the full `npx vitest run` passes with pristine output, `npx tsc -b --force` exits 0, and `npm run lint` is clean. Add the task's e2e specs or `npm run test:deployment` where the plan lists them.
- **Stores and abort helpers:** components reach stores only through `*StoreFacade` modules. Use `anySignal` and `timeoutSignal`, never `AbortSignal.any` or `AbortSignal.timeout`.
- **Style:** use hand-written CSS only, and add no new classes. Keep comments brief, and only where they explain why.
- **Line endings:** keep each file's line endings. Check with `git ls-files --eol`, and never rewrite a whole file.
- **Commits:** messages say what the user sees and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never amend or push.

## Codex plan review (2026-10-07): dispositions

Codex reviewed the plan read-only and reported six findings. It confirmed three things:
- every finding and every chosen extra maps to the right task and spec sections;
- no two tasks that can run at once share a file;
- the fix logic and rulings show no further regressions.

1. **P1, accepted: amends Q4 §X4.** X4's static-only refusal must not trust the artifact's own label.
   - `metadata.profile` comes from the downloaded `deployment.json`, which the selected ref controls. A preview relabelled `github` would skip a check placed in the `metadata.profile !== 'github'` block, before the upload that holds the token.
   - Task 16 now asserts `metadata.profile` equals the trusted directory (`DEPLOYMENT_SMOKE_PROFILES`) before any profile-dependent check. It keys the refusal and F14's preview-only skew guard on that directory.
   - A spoofed-profile scratch reproduction must fail the smoke.
   - Task 16 is raised to medium / high.
2. **P2, accepted.** Appendix B now returns an explicit outcome for a missing review, a negative verdict without findings, and a blocked fix wave. It always runs the re-review once a fix wave has run.
3. **P2, accepted.** Appendix A keeps a task's implementation, review, rounds and Minors when an agent call throws mid-task, so committed work stays in the ledger.
4. **P2, accepted.** The controller's gates (Tasks 19 and 21) and the final fix wave run with `CI=true`, as GitHub does. Playwright then forbids `test.only` and uses CI's worker and retry settings, and Vitest refuses `.only`.
5. **P3, accepted.** Appendix A schedules tasks in priority order, so the first free slots go to the most urgent ready tasks.
6. **P3, accepted.** Task 7's review focus names a decode Cancel, not `n`, as a way to choose None. `n` cycles real sources and only clears the flag.
