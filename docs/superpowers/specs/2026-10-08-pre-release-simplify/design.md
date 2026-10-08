# Pre-Release Simplify: Design

**Date:** 2026-10-08
**Branch:** `refactor/pre-release-simplify`, cut from local `main` at a972b95 (unpushed). When the work is complete and verified, it merges back locally.

**User request (2026-10-08):** "can we clean up and simplify?" Four read-only Opus reviewers searched the unreleased range `v0.15.4..main` for behaviour-preserving simplifications. Their findings are in [S1.md](S1.md) (load path), [S2.md](S2.md) (store and renderers), [S3.md](S3.md) (publishing and accounts) and [S4.md](S4.md) (deploy, UI shell, CSS and test support). The reviewers' brief, including the deliberate decisions not to undo, is [BRIEF.md](BRIEF.md).

## User decisions (AskUserQuestion, 2026-10-08)
1. **Apply all four groups:**
   - merge duplicates;
   - remove dead code;
   - consolidate test helpers;
   - the bigger optional refactors: S1-7, S1-8 and S3-4, and the small optional helpers.
2. **Fix both behaviour issues the reviewers noticed**, test-first:
   - **Bug 1 (S2 §S2-4 note).** Spark's splat load start writes the progress overlay without asking the ownership rule (`SplatLayer.tsx:269-277`), while WebGPU's start asks (`WebGpuSplatCanvasLayer.tsx:159-165`). So a WebGPU-to-Spark fallback during a tile download can briefly retake that download's overlay. Spark's start must ask the same rule.
   - **Bug 2 (S3 "Noticed").** On a 401 or insufficient-scope answer, Drive expires whichever session is current (`googleDrive/api.ts:142-147`, `upload.ts:103`). A user who signs in again while a Drive request is in flight can be signed out by that request's 401. Like HF (`datasetAccess.ts:49`), Drive must expire only the session that made the request.

## Controller rulings
1. **Overlaps go to one owner.**

   | Item | Owner |
   |---|---|
   | S4-3, the warning modules | S1-1 |
   | S4-8, the `reloadFiles` wrapper | S2-8 |
   | S2-2 and S4-1, `holdUrlLoadBeforeSceneCommit` | one shared helper at `src/test/urlLoadHolds.ts` (S4-1's name) |
   | S1-6, the in-file `processWithStore` copy | S4-2 |

2. **Simplifications must not change behaviour.**
   - Existing tests keep passing unchanged, except tests that are themselves the subject of a change: dead tests of deleted code, ported tests, and moved helpers.
   - Where a spec says a path or text is unpinned, the pinning test lands first and passes before and after the change.
   - Error text the user sees, the order of side effects and DOM output stay identical.
3. **Bugs are fixed test-first.** Each fix starts with a test that fails before it and passes after.
4. **The deliberate decisions stay.** BRIEF.md lists them. No spec raised a "Decision to revisit".
5. **Tasks that share a file run one after another; the rest run in two parallel lanes.**
   - Lane A: Tasks 1 → 2 → 3.
   - Lane B: Tasks 4 → 5 → 6.
   - Task 3 also waits for Task 4, because both edit `src/store/index.ts`.
   - Task 7 runs last.
6. **Every agent is Opus**, per the user's standing mandate.
   - Each task: an implementer, then a reviewer, then fix rounds until the reviewer approves.
   - Before the merge: the full CI gate (`CI=true`: `npm run check`, `npm run test:deployment`, chromium e2e) and a Codex review.

## Constraints
- **Before every commit:** the full `npx vitest run` passes with pristine output, `npx tsc -b --force` exits 0, and `npm run lint` is clean.
- **Store and abort conventions:**
  - Components reach stores only through `*StoreFacade` modules.
  - Use `anySignal` and `timeoutSignal`, never `AbortSignal.any` or `AbortSignal.timeout`.
- **CSS:** hand-written only. Classes must be defined in `src/index.css`.
- **Line endings:** keep each file's line endings, and never rewrite a whole file. Mutations use targeted edits and are confirmed with `git diff`. Never copy a backup over a repo file.
- **Commits:**
  - Commit with `git commit --only -- <paths>`.
  - Messages say what changed, and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Never amend or push.
