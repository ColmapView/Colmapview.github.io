# Close the Review Gaps: Design

**Date:** 2026-10-06
**Branch:** `fix/load-path-review-findings` (continues from 15f1b69). The work merges to `main` locally once it is complete and verified.

**User request (2026-10-06):** "1, and close all the gaps": merge locally, and first close every open gap. The user decided that Hugging Face sign-in and publishing return to `/dev/`.

## Sources

The binding detail for each item lives in five research specs. Read-only research agents wrote them on 2026-10-06. Each item was verified against 15f1b69, and almost every proposed test was confirmed red-before and green-after in a scratch copy.

| Spec | Scope |
|---|---|
| [R1-load-path.md](R1-load-path.md) | A1–A9: the open Important N1 (navigation vs early fly-to), the warning on clear, the splat-tuned display without a splat, A4 binding, A5 HEAD, two store refactors, Reload keeps the splat state, Reload confirmation |
| [R2-tests.md](R2-tests.md) | Test noise, coverage gaps, flaky tests (root causes), test-file type errors |
| [R3-publishing.md](R3-publishing.md) | C1 unknown size 0, C2 Drive mask probe, C3 Drive link hand-off, D2 `/u/N/` links, D4 private HF message, D5 controller retention, D6 oversized mask |
| [R4-deploy.md](R4-deploy.md) | C5 CI cache poisoning, HF on `/dev/`, C4 privacy policy, smoke report, gate-order test, check-live, preview URL |
| [R5-ui.md](R5-ui.md) | D1 Load URL cancels sign-in, D3 `n` during a load drops the incoming splat |

Where a spec gives code, that code is the requirement. Where a spec offers options, the "recommended" option is binding unless a ruling below says otherwise.

## Controller rulings (beyond the specs)

1. **Lazy tile failures must be visible.** Today `selectSplatSource`'s failure sets only `urlError`, and its only reader is the landing-panel gate (R1, out-of-scope note). A failed tile download therefore shows nothing. The failure also sets the store `error`, which the DropZone error toast shows, with the text `Failed to load splat <name>: <details>`. A later successful activation, or None, clears that error, and only that error.
2. **Reload keeps the splat state on every path** (extends R1 A8). The splat-only path (`updateLoadedSplatFile`) and the images-only path (`runImagesOnlyLoad`) keep the on-screen splat state on Reload too: the active splat, or None. That is the same rule as the COLMAP path.
3. **The zip URL source commits only its own scene** (extends R1 A4). `loadZipUrlSource` must not install the active archive or source info when processing merged into the open scene without replacing it.
4. **The Reload prompt compares against what Reload restores** (extends R1 A9). `hasUnsavedReloadState` currently treats any non-identity scene or splat transform as unsaved. With the TransformPanel now confirming as well, every published dataset with a saved alignment would prompt even when nothing was edited.
   - The baseline is what Reload would re-apply, computed from the Reload inputs at prompt time:
     1. the retained `sourceViewerState` for the current `droppedFiles`;
     2. otherwise the project's own `colmapview.yaml` among the files;
     3. otherwise identity.
   - It is never recorded per settings application, because merges and settings-only imports apply settings that Reload does not restore. This revision follows the Codex plan review.
5. **The two remaining flaky test patterns are in scope** (from R2 Part 5): `ViewerToolModals.test.tsx` cold lazy imports with `findBy*`, and the `integrity.test.ts` budget. The same applies to the collection-time scan in `componentStoreBoundary.test.ts`.
6. **Pristine test output and test-file type checking are in scope.**
   - R2's X2 noise sweep (16 other noisy files) brings suite-wide output to pristine.
   - R2's T3 (`.test.ts` files not type-checked; 214 errors after T1/T2) closes with a test-inclusive type check wired into `npm run check`, plus fixes for every error.
   - The stale `libarchive.js` augmentation (X3) is removed.

## Explicitly out of scope

- Refactor-only notes from the original review:
  - Drive re-implements HF pinning and mask listing.
  - The GIS/Picker loaders are duplicated.
  - `DropZone.prepareUrlLoad` copies the load guard.
  - There is a dead `deferSplatDownloads` fallback.
  - Upload chunks are 8 MiB.
  - `profiles.test.mjs` uses `node:test`.

  None of them is a correctness or UX gap.
- Owner actions with outside effects. These are surfaced to the user, not performed:
  - deleting GitHub Actions caches (`gh cache delete --all`);
  - GA4 property retention/deletion;
  - tagging a release so the new privacy policy reaches `/latest/` and the custom origin;
  - pushing anything.

## Constraints

- Before every commit, run the full `npx vitest run`, `npx tsc -b --force` and `npm run lint`. Run `npm run build` at the end.
- Components reach stores only through `*StoreFacade` modules.
- Use hand-written CSS only.
- Use `anySignal`, never `AbortSignal.any`.
- Keep comments brief and say why.
- Keep CRLF line endings where a file already uses them (R1 notes `fileDropzoneWorkflow.test.ts`, `splatFileSourcePolicy.test.ts`, `useFileDropzone.test.ts`, `useTransformPanelStoreFacade.test.ts`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never amend or push.
