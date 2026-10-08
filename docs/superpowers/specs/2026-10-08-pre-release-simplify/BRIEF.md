# Simplify Brief: Unreleased ColmapView Code (Read-Only Discovery)

You are one of four read-only reviewers. Find **behaviour-preserving simplifications** in code that will ship in the next release: the range `v0.15.4..main`, in `C:/Users/HEQ/Projects/colmap_webview/colmap-webview`. Read it with `git diff v0.15.4..main -- <paths>`, `git log` and the files themselves.

- **Do not change anything.** No edits, no git commands that change state, and no subagents.
- **The user approves a list before anything is applied.** Your job is the list.

## What counts
- **Dead code:** exports, functions, parameters, branches or flags with no remaining consumer, or with only one possible value. Prove it with a repo-wide grep (tests included), and give the counts.
- **Duplication:**
  - near-identical modules, functions or blocks (including ones added in this range) that one helper could serve;
  - logic copied between call sites that has already drifted.
- **Needless indirection:** wrappers that only forward, options nobody sets, state that duplicates other state.
- **Over-complex logic:** conditions or control flow with a clearly simpler equivalent. Prove the equivalence.
- **Stale or misleading comments** in the changed code.
- **Test helpers duplicated across test files** that a shared helper should replace.

## What does not count
- **Any behaviour change.** That includes timing, the order of side effects, error text the user sees, and DOM output.
- **Undoing a deliberate decision.** These are rulings from three review rounds:
  - URL loads settle before commit (`beforeSceneCommit`).
  - The sidecar settings request is started only for archives without embedded settings.
  - The splat-list deadline is 30 s without an answer, at most 120 s.
  - `splatNoneChosen` follows its documented lifecycle.
  - Renderer overlay ownership is decided by when an attempt started.
  - `dropFailedSplat` runs under downloads.
  - New datasets start at identity; Reload never resets early.
  - Restore order: alignment early, display late.
  - The in-load pick rule, and `n` plus the panel select ignored during a pending load.
  - The Browse picker opens first, then the generation check.
  - Startup retry and address-bar stripping.
  - Drive mask parity, Drive job lifecycle, and permanent input-bound publication failures.
  - The release-tag check, and `/dev/` links pointing to `/dev/`.
  - The preview smoke trusts the directory, not the artifact.
  - Components reach stores only through `*StoreFacade` modules.
  - `anySignal` and `timeoutSignal`, never `AbortSignal.any` or `AbortSignal.timeout`.
  - Hand-written CSS only; classes must be defined in `src/index.css` (`classContract.test.ts`).

  If you believe one of these is wrong, list it separately as "Decision to revisit", with evidence. Do not mix it into the simplifications.
- Renames or style churn without a real gain.
- Code outside the range, unless it is the other half of a duplicate inside it.

## Known candidates to re-verify
Each was set aside earlier as refactor-only. Confirm or refute each one with current file:line evidence.
- **X11(a):** `DropZone.prepareUrlLoad` reads the store through `getState()`, which the facade boundary test cannot see, and it has drifted from `useUrlLoader`'s `runLoad`.
- **X11(c):** the four Reload entry points are copies of each other.
- **X11(d):** suspected dead branches: `clearCachesOnFailure`, the post-G6 `settle()`, and the `committed` guards. An earlier check found that the archive's post-load settle and the zip loader's `committed` flag are **not** dead, so re-check precisely.
- **X11(e):** the two timeout-warning modules, `src/hooks/optionalSettingsWarning.ts` and `src/hooks/splatListWarning.ts`, are near-duplicates.
- **Test helpers:** `holdUrlLoadBeforeSceneCommit` is duplicated in `reconstructionStore.test.ts` and `SplatLayer.test.tsx`.

## For each candidate, give
1. An id (your area letter plus a number), a title, and file:line.
2. The change, in one or two sentences, with a diff sketch if short.
3. Why it is simpler: lines removed, concepts removed.
4. The evidence: grep counts, call sites, and an equivalence argument.
5. Risk (low, medium or high), and why.
6. The tests that would change, and how behaviour preservation would be proven: which existing tests pin it, and whether a new test is needed first.
7. Size (S, M or L), and **Recommend** or **Optional**.

Keep at most 8 candidates in your area, best first. Quality beats count; an empty list is a valid answer.

## Output
- Write your list to `C:/Users/HEQ/AppData/Local/Temp/claude/C--Users-HEQ-Projects-colmap-webview/18fd85f8-55b2-4b0c-9e9a-5fc10492c0ad/scratchpad/simplify/<your area id>.md`.
- Your final message is a summary of at most 15 lines: one line per candidate (id, title, size, risk, Recommend or Optional), then any "Decision to revisit".
