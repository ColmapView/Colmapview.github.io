# Q4: release, deploy and docs (F6, F14, X4, X12)

**Base.** Branch `fix/final-review-gaps` at `1984de8` (equal to local `main`). Line numbers are at that commit.

**Scratch.** Everything ran in `scratchpad/rev4/q4/`:
- `cur/` is `git archive HEAD` with every change below applied.
- `old/` is `git archive 0a1d01c` (`origin/main`). `prod/` is `git archive c51741b` (live production).
  - Both have the same `package-lock.json` as HEAD, so all three trees use a junction to the repo's `node_modules`. The junctions were removed afterwards.
  - The trees are not git checkouts, so every build there sets `DEPLOYMENT_SHA`.
- `head/` holds pristine copies of the touched files. `q4-all.diff` is the full diff from `head/` to `cur/`.
- The logs are named in the [validation record](#validation-record).

| Item | Status | Disposition | Implementer / reviewer effort |
| --- | --- | --- | --- |
| F6 `/dev/` share links open `/v0.15.4/`; no tag/`package.json` check | Confirmed, both parts | Fix. Part 1 needs a user decision | low / medium |
| F14 trusted preview smoke fails for refs before 41d8919 | Confirmed and reproduced (0a1d01c, c51741b) | Fix | low / low |
| X4 preview upload deploys a `_worker.js` with the account token | Confirmed and reproduced | Fix (small guard + trust model) | low / medium |
| X12 OAuth doc points at a Disconnect that a loaded scene hides | Confirmed | Fix (one doc bullet) | low / low |

There are no decision changes; nothing here touches the load, Cancel, Reload, restore or publishing rulings. There is one user decision, **F6-D1** (below).

The e2e suite is unaffected. None of the 89 `chromium` specs runs on `colmapview.github.io` or opens a Share or embed link (`grep` of `e2e/`). `hugging-face-publish.spec.ts:68` pins publication links, which come from `getPublicationViewerBaseUrl`, and that function does not change.

The affected gates are:
- `npm run test:deployment`: config contract, typecheck, three fixture builds, 7 browser cases. It ran GREEN with every change applied.
- `npm run check`'s unit suite: 4,771 passed, 5 skipped.

---

## F6. `/dev/` share links open the old `/v0.15.4/` build, and nothing ties a release tag to `package.json`

### Verified

**Part 1: where `/dev/` links point.**
- `src/utils/shareUrl.ts:19-24`, `getShareBaseUrl`, returns `https://colmapview.github.io/v${appVersion}/` for every page on that host, whatever its path.
- `src/hooks/useUrlState.ts:333` passes `__APP_VERSION__`. `generateEmbedUrl` (`:345-352`) builds on the same URL.
  - The callers are `ShareButton.tsx:86, :138, :143, :148` and `SharePanel.tsx:60, :67, :74, :89, :108`.
- `__APP_VERSION__` is `package.json`'s version (`vite.config.ts:44`), which is `0.15.4` (`package.json:4`).
- Branch runs build `/dev/` from `main` with that same `package.json` (`deploy.yml:76-79`).
- So once `main` is pushed, every Share or embed link made on `/dev/` opens `/v0.15.4/`. What that build does:
  - It loads Google Analytics: `git show v0.15.4:index.html` lines 6-10 hold `gtag/js?id=G-7K5H83SEMY`. HEAD's `index.html` has none.
  - It cannot open private HF datasets. `git grep read-repos v0.15.4 -- src` finds nothing; HEAD has it in `src/features/huggingface/auth.ts`.
  - It has none of this range's fixes.
- `public/privacy.html` contradicts this:
  - `:54` says `/dev/` "is already current".
  - `:102` recommends "the development build at `colmapview.github.io/dev/`" to avoid that collection.
- Publications already handle this case.
  - `getPublicationViewerBaseUrl` (`src/features/datasetPublishing/publicationMetadata.ts:59-62`) keeps `/dev/` on `/dev/`. This is pinned by `publicationMetadata.test.ts:33`.
  - The HF sharing plan ruled the same (`docs/hugging-face-dataset-sharing-plan.md:187`): "Development links must target the actual preview build, not an unreleased `/v<package-version>/` directory."
- Isolated previews (`*.pages.dev`) and the custom host already link to the page they run on (`shareUrl.ts:23`).
- Scratch RED: the new test below receives `https://colmapview.github.io/v0.15.4/` (`F6a-RED-shareUrl.log`).

**Part 2: no tag check.**
- `deploy.yml:68-80` checks only the tag's shape. The tag also names the version directory (`version=$GITHUB_REF_NAME`, `base_path=/$GITHUB_REF_NAME/`).
- Everything the release then reports comes from `package.json`:
  - the status bar and About (`StatusBar.tsx:142-146`, `HotkeyHelpModal.tsx:72`);
  - `deployment.json`'s `version` (`build-profile.mjs:29`);
  - the HF dataset card ("Published by … with ColmapView 0.15.4", `publicationMetadata.ts:95`) and `colmapview.yaml`'s `viewerVersion` (`preparePublication.ts:213`);
  - `/latest/` share links (`/v${__APP_VERSION__}/`).
- Every existing check compares `package.json` with itself, or the tag with itself, so they all pass:
  - `build-profile.mjs:29-30` records `version` and `release` side by side and never compares them.
  - `artifacts.spec.ts:102` compares `deployment.json` with `package.json`.
  - `check-live.mjs:26` compares the manifest's `release` with `DEPLOYMENT_RELEASE`.
- This has happened before. `v0.2.0` was tagged on `package.json` 0.1.5, and `v0.3.1` on 0.3.0 (a `git show <tag>:package.json` loop over all 71 tags).
- If `v0.16.0` were tagged on today's `package.json`:
  - `/v0.16.0/`, `/latest/` and `colmapview.opsiclear.com` would report 0.15.4.
  - `/latest/` share links would open `/v0.15.4/` permanently.

### Root cause
- **Part 1.** `getShareBaseUrl` assumes every `colmapview.github.io` page is a release whose `package.json` version names its own directory. `/dev/` breaks that, because `main` carries the last release's version until the next release commit.
- **Part 2.** The deploy names directories from the tag, while the app and the artifact metadata name the version from `package.json`. Nothing requires the two to be equal.

### Fix (code)

**Part 1 (option A of F6-D1, recommended).** `src/utils/shareUrl.ts`:
```diff
 export function getShareBaseUrl(location: ShareUrlLocation, appVersion: string): string {
   if (location.hostname === 'colmapview.github.io') {
+    // /dev/ is built from main, whose package.json still names the last release.
+    if (location.pathname.startsWith('/dev/')) return 'https://colmapview.github.io/dev/';
     return `https://colmapview.github.io/v${appVersion}/`;
   }
   return location.origin + location.pathname;
```
- It uses `location.pathname`, like `getPublicationViewerBaseUrl`, so the signature and the call sites stay as they are.
- `/latest/` and version directories keep pinning `/v<version>/`, which Part 2 now guarantees is the release itself.
- Under option B the added line returns `'https://colmapview.github.io/latest/'` instead. Under option C there is no Part 1 change.

**Part 2.** `scripts/deployment/profiles.mjs`, inserted before `validatePreviewConfiguration`:
```diff
+/** The viewer reports package.json's version and GitHub share links open /v<version>/, so a release tag must name it. */
+export function validateReleaseTag(tag, version) {
+  if (tag !== `v${version}`) throw new Error(`Release tag ${tag} must be v plus package.json's version (${version}). Commit the version bump before tagging.`);
+}
+
 export function validatePreviewConfiguration(env) {
```
`scripts/deployment/preflight.mjs`:
```diff
-import { appendFileSync } from 'node:fs';
-import { validateGithubHfConfiguration, validatePreviewConfiguration, validateReleaseConfiguration } from './profiles.mjs';
+import { appendFileSync, readFileSync } from 'node:fs';
+import { validateGithubHfConfiguration, validatePreviewConfiguration, validateReleaseConfiguration, validateReleaseTag } from './profiles.mjs';

 const preview = process.argv.includes('--preview');
 const isRelease = process.env.GITHUB_REF_TYPE === 'tag';
+// A tag without its version bump would publish /latest/ and the custom host as the previous release.
+if (isRelease && !preview) validateReleaseTag(process.env.GITHUB_REF_NAME, JSON.parse(readFileSync('package.json', 'utf8')).version);
 const result = preview
```
- **Why preflight.** "Preflight deployment configuration" is already an unconditional gate that must precede every gh-pages push and Wrangler upload (`profiles.test.mjs` `PUBLICATION_GATES`/`UNCONDITIONAL_GATES`). It also runs before every build step. `deploy.yml` itself does not change.
- **Why `GITHUB_REF_NAME`.** It is what names the version directory. The comparison is an exact string match, so a `-beta` or `+build` suffix must be in `package.json` too. That matches "the tag is `v` plus this version".
- **Why `!preview`.** The preview workflow can be dispatched from a tag ref, but it publishes the selected ref, and its publish job checks out the default branch. Comparing that tag there would wrongly fail a preview.
- **Alternatives, rejected:**
  - (b) Compare in `build-profile.mjs` when `DEPLOYMENT_RELEASE` is set. It fails at the same point, but the rule would be spread over three builds.
  - (c) A bash test in "Determine deployment target". A test would have to extract the snippet from the YAML and run it in bash, unlike the pure functions that `profiles.test.mjs` already tests.

Docs (exact insertions):
- `docs/dual-hosting.md:62`. After "It validates configuration and smoke-tests all prepared artifacts **before the first upload**." insert:
  > ` Before anything is built, preflight rejects a tag that is not `v` plus `package.json`'s version, because the viewer reports that version and share links made on `/latest/` open `/v<version>/`.`
- `CONTRIBUTING.md:87`. Append to the Deployment paragraph:
  > ` A tag that is not `v` plus the `package.json` version is rejected before anything is built.`

### User decision needed (F6-D1): where should Share and embed links made on `/dev/` point?
Under every option, links made on an isolated preview (`*.pages.dev`) or on the custom host keep opening the page they were made on.

| Option | Recipients open | Cost |
| --- | --- | --- |
| **A. `/dev/` itself (recommended)** | The build the sharer used: no Google Analytics, this range's fixes, private HF reading | Links follow `main`, so they can behave differently later and never settle on a release. One line and one test. |
| B. `/latest/` | The newest release | Until the next release, `/latest/` is v0.15.4: Google Analytics, none of the fixes, no private HF datasets. After it, links still open an older build than the sharer's, which can misread newer link fields (for example the explicit None that F2 is about). Same size of change. |
| C. Keep `/v<package.json version>/` | The previous release, permanently | No code change. Every `/dev/` link opens the last release forever. Until a release without analytics ships, those links load Google Analytics, contrary to `privacy.html:54` and `:102`, for people who chose `/dev/` to avoid it. Bumping `package.json` ahead of the release instead points `/dev/` links at a `/v<next>/` directory that is a 404 until the release exists. |

**Recommendation: A.** It matches the publication links and the HF plan's ruling. It removes the privacy contradiction at the moment `main` is pushed, which is the moment the defect appears. Part 2 keeps `/latest/` links correct under every option.

### Tests (code)
**`src/utils/shareUrl.test.ts`** (inside `describe('share URL helpers')`, after the first test):
```ts
  it('links /dev/ to itself, not to the last release that package.json names', () => {
    for (const pathname of ['/dev/', '/dev/index.html']) {
      expect(getShareBaseUrl({
        hostname: 'colmapview.github.io',
        origin: 'https://colmapview.github.io',
        pathname,
      }, '0.15.4')).toBe('https://colmapview.github.io/dev/');
    }
  });
```
- RED at HEAD: expected `…/dev/`, received `…/v0.15.4/`.
- GREEN with the fix. `shareUrl`, `useUrlState`, `publicationMetadata` and `sharePanelViewModel` tests: 49/49.
- The existing `/latest/` → `/v0.6.1/` test stays and pins that release links keep their version.
- Under option B, change the expectation to `…/latest/`.

**`scripts/deployment/profiles.test.mjs`.** Add `validateReleaseTag` to the `./profiles.mjs` import and insert after the "enabled release fails before publication…" test:
```js
test('preflight rejects a release tag that is not v plus the package.json version', () => {
  validateReleaseTag('v0.16.0', '0.16.0');
  validateReleaseTag('v0.16.0-beta.1', '0.16.0-beta.1');
  for (const [tag, version] of [['v0.16.0', '0.15.4'], ['v0.16.0-beta', '0.16.0'], ['v0.16.0', '0.16.0-beta'], ['0.16.0', '0.16.0']]) {
    assert.throws(() => validateReleaseTag(tag, version), { message: `Release tag ${tag} must be v plus package.json's version (${version}). Commit the version bump before tagging.` });
  }
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  // Blank outputs, so a CI run of this test never writes to its own job's outputs or summary.
  const preflight = (env, ...args) => spawnSync(process.execPath, ['scripts/deployment/preflight.mjs', ...args], {
    env: { ...process.env, GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '', CLOUDFLARE_PAGES_ENABLED: 'false', VITE_HF_PUBLISH_ENABLED: 'false', VITE_HF_AUTH_ENABLED: 'false', ...env },
    encoding: 'utf8',
  });
  assert.equal(preflight({ GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: `v${version}` }).status, 0);
  const mismatch = preflight({ GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v999.0.0' });
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /Release tag v999\.0\.0 must be v plus package\.json's version/);
  assert.equal(preflight({ GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main' }).status, 0);
  // A preview can be started from a tag, but it publishes the selected ref, not a release.
  assert.equal(preflight({ GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v999.0.0', ...release, CLOUDFLARE_PREVIEW_PROJECT: 'colmapview-preview' }, '--preview').status, 0);
});
```
- The blanked `GITHUB_OUTPUT` and `GITHUB_STEP_SUMMARY` matter in CI. This test runs inside `e2e.yml`'s artifacts job, where both are real files.
- The explicit `false` flags stop a developer's shell `VITE_HF_*` from changing the preflight result.

| Run | Result |
| --- | --- |
| RED 1 (HEAD scripts) | The file fails to load: `does not provide an export named 'validateReleaseTag'` (`F6b-RED1-import.log`) |
| RED 2 (mutation: preflight's call commented out) | 19/20; `Expected "actual" to be strictly unequal to: 0`, so the mismatched tag passed (`F6b-RED2-mutation-no-preflight-call.log`) |
| RED 3 (mutation: `if (isRelease)` without `!preview`) | 19/20; preview exit `1 !== 0` (`F6b-RED3-mutation-preview-checked.log`) |
| GREEN | 20/20 (`F6b-GREEN-final.log`). The full `npm run test:deployment` is GREEN too. |

### Risks and interactions
- **Part 1, option A:**
  - It touches only `shareUrl.ts`. Q2's F2 changes what links carry (`splatFileSourcePolicy.ts`, `useUrlState.ts` `collectShareConfig`), not where they point, so there is no overlap.
  - `privacy.html` needs no edit under A. Under B or C its `:54`/`:102` advice stays contradicted until a release without analytics reaches `/latest/`.
- **The `/dev/` build still reports the last release.** The status bar, About and `deployment.json` show `0.15.4` on `/dev/`. This predates the range and is harmless; a follow-up could show the source SHA.
- **Part 2:**
  - The check runs in the deploy job, after the ~10-minute `validate` job. It fails before any build or upload, so a wrong tag publishes nothing.
  - A tag on a commit whose workflow predates this fix runs that old workflow. That includes the clone-only `v0.10.0`/`v0.11.0`, and the check cannot stop it. R5 (second review) made the same point at its line 266. The "push only that tag" rule in `CLAUDE.md` still matters.
  - Recovering from a rejected tag means deleting it locally and on GitHub, committing the bump and tagging again. This is safe because the rejected run published nothing.
- **Deliberate decisions.** `pages-deploy` with `queue: max` is untouched. `deploy.yml` does not change.
- **Line endings.** All touched files are `i/lf`. Several are CRLF in the working tree through autocrlf; edit them normally and confirm with `git ls-files --eol`.

### Effort
**low / medium.** The code is tiny. The reviewer must judge F6-D1 and the CI semantics (tag runs, preview dispatch from a tag, the old workflows of old tags).

---

## F14. The trusted preview smoke fails for refs before the `#d=` hand-off

### Verified
- **The publish job runs main's spec against the selected ref's artifact.**
  - `deploy-preview.yml:79-81` checks out the default branch.
  - `:97-100` downloads the selected ref's artifact.
  - `:102-106` runs `npm run test:deployment:browser` with `DEPLOYMENT_SMOKE_PROFILES: preview`, then `:107-108` uploads.
- **Only the version check has a skew guard.** `artifacts.spec.ts:101-102` skips the version equality for `preview` ("Trusted preview checks may run from a newer default branch…"). `:149-150` requires the current hand-off form for every profile.
- **The hand-off form changed in 41d8919.** Before that commit the link was `https://colmapview.opsiclear.com/?url=<encoded Drive URL>`, and the old spec checked `searchParams.get('url')` and that `access_token` was absent. From 41d8919 the file rides in `#d=`.
- **Scratch reproduction:**

  | Run | Result |
  | --- | --- |
  | HEAD spec vs 0a1d01c preview (`F14-RED-head-spec-vs-old-artifact.log`) | Fails at `:149`: expected `https://colmapview.opsiclear.com/`, received `https://colmapview.opsiclear.com/?url=https%3A%2F%2Fdrive.google.com%2Ffile%2Fd%2Fartifact_fixture_file%2Fview%3Fresourcekey%3Dfixture-resource` |
  | HEAD spec vs c51741b preview (`F14-RED-head-spec-vs-prod-c51741b.log`) | Same failure |
  | c51741b's own spec vs its artifact, i.e. the build job (`F14-context-c51741b-own-spec-build-job.log`) | Passes. The build job passes and the publish job fails, exactly as the finding says |
  | HEAD spec vs HEAD preview (`F14-control-head-spec-vs-cur-artifact.log`) | Passes |

- **Which refs are affected.** Every ref from c51741b to 41d8919^, 129 commits of linear history:
  - c51741b (live production), 9129c1d, f24874d and 0a1d01c (`origin/main`);
  - the 125 commits after 0a1d01c, up to 41d8919^.
- **Not covered, deliberately: 5af7c3a and c450566.** They also fail earlier, at `:121`. Their `_headers` has no HTML `no-transform` rule (`git show c450566:scripts/deployment/build-profile.mjs` line 36), and the server applies the artifact's own `_headers`. Those two commits predate the fix that keeps Cloudflare from rewriting HTML, so previewing them is not worth a guard.

### Root cause
The publish job deliberately runs trusted default-branch tests on an artifact built from another ref. `:149-150` then pins an app behaviour that changed after the live release, with no allowance for an older preview source.

### Fix (code)
`scripts/deployment/tests/artifacts.spec.ts:146-150`:
```diff
           const handoff = dialog.getByRole('link', { name: 'Use Google Drive', exact: true });
           const destination = new URL((await handoff.getAttribute('href'))!);
-          // The file ID rides in the fragment, which never reaches the custom host's server.
-          expect(destination.origin + destination.pathname + destination.search).toBe(`${customOrigin}/`);
-          expect((await decodeShareData(destination.hash))?.manifestUrl).toBe('https://drive.google.com/file/d/artifact_fixture_file/view?resourcekey=fixture-resource');
+          const sharedDriveUrl = 'https://drive.google.com/file/d/artifact_fixture_file/view?resourcekey=fixture-resource';
+          // Trusted preview checks may run on an older preview source, which hands the file over in ?url=.
+          if (metadata.profile === 'preview' && destination.searchParams.has('url')) {
+            expect(destination.origin + destination.pathname).toBe(`${customOrigin}/`);
+            expect(destination.searchParams.get('url')).toBe(sharedDriveUrl);
+            expect(destination.href).not.toContain('access_token');
+          } else {
+            // The file ID rides in the fragment, which never reaches the custom host's server.
+            expect(destination.origin + destination.pathname + destination.search).toBe(`${customOrigin}/`);
+            expect((await decodeShareData(destination.hash))?.manifestUrl).toBe(sharedDriveUrl);
+          }
```
- The legacy branch keeps the old spec's safety checks: the custom origin, the canonical file URL, and no `access_token`. The rest of the test still runs for old previews: the Enter refusal, no Drive requests, the direct `?url=` gate, local COLMAP loading and no external requests.
- **The current form stays pinned strictly.** In `npm run test:deployment` (the e2e.yml artifacts job and deploy.yml), the `github` profile and the custom profile at its two disabled origins take the strict branch. A regression to `?url=` still fails CI. Shown below with an old `github` artifact.
- **Alternatives:**
  - (b) Skip the strict form only when `metadata.sourceSha` differs from `git rev-parse HEAD` of the spec's checkout. It is more precise, but it needs git in every smoke context (it fails in non-git copies like this scratch) and adds a moving part.
  - (c) Limit the publish job's trusted run to security checks. That is a larger restructuring.
  - The profile guard matches `:101-102` and is the smallest change, so it is the one recommended.

### Tests (code)
There is no new permanent test: proving it needs an artifact built from an old ref, and building one in CI would cost a second full build per run. The guard is the test change. It was validated in scratch with this recipe:
```sh
# old/ = git archive 0a1d01c (or c51741b), node_modules junction; cur/ = HEAD + this spec's changes
(cd old && DEPLOYMENT_SHA=<full sha> node scripts/deployment/build-profile.mjs preview --skip-typecheck --out=.tmp/deployment/preview)
(cd cur && DEPLOYMENT_SHA=<same sha> DEPLOYMENT_SMOKE_ROOT=<old>/.tmp/deployment DEPLOYMENT_SMOKE_PROFILES=preview \
  npx playwright test --config=scripts/deployment/playwright.config.ts --reporter=list)
```

| Run | Result |
| --- | --- |
| Guarded spec vs 0a1d01c preview | Pass (`F14-GREEN-guarded-spec-vs-old-0a1d01c.log`) |
| Guarded spec vs c51741b preview | Pass (`F14-GREEN-guarded-spec-vs-prod-c51741b.log`) |
| Guarded spec vs HEAD preview | Pass (`F14-GREEN-guarded-spec-vs-cur.log`) |
| Scope check: guarded spec vs a **github** artifact from 0a1d01c | Still fails at the strict line (`F14-scope-guarded-spec-vs-old-github-stays-strict.log`), so production profiles are not loosened |
| Mutation: the legacy branch's `not.toContain('access_token')` flipped | Fails on the 0a1d01c preview (`F14-mutation-legacy-branch-bites.log`), so the branch runs and checks |
| Final spec (F14 + X4) | `npm run test:deployment`: config 20/20, typecheck, 3 fixture builds, 7/7 browser cases (`ALL-test-deployment-final.log`) |

**Ports.** The deployment smoke does not honour `COLMAP_WEBVIEW_E2E_PORT`, and it does not need to.
- `scripts/deployment/playwright.config.ts` has no `webServer`.
- `startArtifactServer` listens on port 0 on 127.0.0.1 (`static-server.mjs:53`), and `context.route` maps the real origins onto it.
- Parallel runs only collide on `.tmp/deployment-smoke/` inside one checkout.

### Risks and interactions
- **This is a general hazard.** Every future tightening of an app-behaviour assertion in `artifacts.spec.ts` can break previews of older refs the same way. The comment states the rule next to the existing one at `:101`.
- **Shared file with X4**, which adds a check in the same spec. They belong in one task.
- **Shared fixture with Q3.** If Q3 changes Drive loading or the "Use Google Drive" hand-off, this spec is the place that sees it. Q3's items are about publishing, so no overlap is expected.

### Effort
**low / low.** One guarded assertion in one test file, already validated against two old builds.

---

## X4. The preview upload deploys selected-ref server code with the account token

### Verified
- **The upload takes whatever is downloaded.** `deploy-preview.yml:107-108` runs `wrangler pages deploy .tmp/deployment/preview` with `CLOUDFLARE_API_TOKEN`, on whatever artifact the selected ref's build job uploaded.
- **What Cloudflare does with server code** (Context7, Cloudflare Pages docs):
  - A `_worker.js` (file or folder) in the output directory runs in advanced mode as Pages Functions server code for every request.
  - Wrangler bundles `_worker.js` on the runner by default (`--no-bundle`: "Whether to run bundling on `_worker.js` before deploying"). That happens in the step that holds the token.
  - A `functions` folder is compiled only from the directory Wrangler runs in, which here is the trusted checkout. So a `functions/` inside the artifact is inert today; it is refused anyway, as defence against a future `working-directory` change.
- **The workflow's own comments promise otherwise.**
  - `:37`: "Selected-ref code is executed only in this credential-free, cache-free job."
  - `:78`: "Use trusted deployment scripts/tests rather than executing selected-ref scripts with a token."
  - A maintainer previewing an untrusted PR (for example `refs/pull/<n>/head` of a fork) would deploy that PR's Worker into the account's preview project.
- **Scratch reproduction.**
  - A copy of the HEAD preview artifact plus `_worker.js` (`export default { async fetch(request, env) { return env.ASSETS.fetch(request); } };`) passes HEAD's trusted smoke (`X4-RED-head-spec-accepts-worker.log`, 1 passed).
  - In the publish job, that pass is followed by the upload.

### Disposition: fix
The guard is small and safe: no legitimate viewer artifact contains these entries (`public/` has none).

### Fix (code)
`scripts/deployment/tests/artifacts.spec.ts`. The check sits in the non-GitHub block, because only Cloudflare runs these files. It covers the preview profile in the trusted publish job, and the custom profile before "Deploy custom production" in `deploy.yml`.
```diff
-import { readFileSync } from 'node:fs';
+import { existsSync, readFileSync } from 'node:fs';
@@
         expect(headers).toContain('Cross-Origin-Opener-Policy: same-origin-allow-popups');
         expect(headers).not.toContain('Cross-Origin-Embedder-Policy');
+        // Static files only: Cloudflare runs a _worker.js as server code under the deploying account.
+        for (const entry of ['_worker.js', '_routes.json', 'functions']) expect(existsSync(path.join(output, entry)), entry).toBe(false);
       }
```
`.github/workflows/deploy-preview.yml` gets a comment only, documenting the trust model where X4 points:
```diff
       - run: npx playwright install --with-deps chromium
+      # These tests also refuse Pages server code (_worker.js), so the upload below publishes static files only.
       - name: Smoke downloaded preview with trusted tests
```
`docs/dual-hosting.md:50`. After "…and rechecks the artifact before uploading." insert:
> ` The recheck refuses Pages server code (`_worker.js`, `_routes.json` or a `functions` folder), so the upload that holds the token publishes static files only. The preview still serves the selected ref's own HTML and JavaScript at its `pages.dev` address: preview an untrusted pull request only if you would open its build yourself.`

**Refuse rather than strip.** Stripping would silently publish something other than what the build job's smoke tested. Refusing fails closed. If Pages Functions are ever wanted on the custom host, this line forces an explicit decision.

### Tests (code)
The guard only works if the trusted smoke checks the uploaded folder and stops the job before the upload. Today only the step's existence is pinned (`profiles.test.mjs:239`). Replace that line in the "Cloudflare deployment token is scoped only to trusted upload steps" test:
```diff
-  assert.ok(preview.jobs.publish.steps.some(step => step.name === 'Smoke downloaded preview with trusted tests'));
+  // The trusted smoke refuses Worker code, so it must check the uploaded folder and stop the job before the upload.
+  const publishSteps = preview.jobs.publish.steps;
+  const trustedSmoke = publishSteps.find(step => step.name === 'Smoke downloaded preview with trusted tests');
+  const upload = publishSteps.find(step => step.name === 'Upload preview only');
+  assert.ok(publishSteps.indexOf(trustedSmoke) >= 0 && publishSteps.indexOf(trustedSmoke) < publishSteps.indexOf(upload), 'The trusted smoke must precede the preview upload.');
+  assert.ok(trustedSmoke.if === undefined && [undefined, false].includes(trustedSmoke['continue-on-error']), 'The trusted smoke must always run and stop the job when it fails.');
+  assert.equal(`${trustedSmoke.env.DEPLOYMENT_SMOKE_ROOT}/${trustedSmoke.env.DEPLOYMENT_SMOKE_PROFILES}`, '.tmp/deployment/preview');
+  assert.match(upload.run, / pages deploy \.tmp\/deployment\/preview /);
```

| Run | Result |
| --- | --- |
| RED: HEAD spec vs the preview + `_worker.js` | Passes, so the Worker would be uploaded (`X4-RED-head-spec-accepts-worker.log`) |
| GREEN: final spec vs the same artifact | Fails with `Error: _worker.js … Expected: false, Received: true` (`X4-GREEN-worker-artifact-refused.log`) |
| Final spec vs the clean HEAD preview, the 0a1d01c preview, and all fixture profiles | Pass (`X4-GREEN-clean-artifact-passes.log`, `F14-X4-final-spec-vs-old.log`, `ALL-test-deployment-final.log`) |
| Contract RED (mutation: the smoke step moved after "Upload preview only" in a copy of the workflow) | 19/20, `The trusted smoke must precede the preview upload.` (`X4-RED-mutation-smoke-after-upload.log`). Restored afterwards: 20/20 |

### Risks and interactions
- **Residual risk.** A preview still serves arbitrary static HTML and JavaScript from the selected ref on the preview project's `pages.dev` host. The docs now say so.
- **What untrusted build code can still do.** It runs only in the credential-free build job, as before.
- **Shared files.** `artifacts.spec.ts` with F14 (same task); `profiles.test.mjs` and `docs/dual-hosting.md` with F6 Part 2 (separate hunks).

### Effort
**low / medium.** The code is one line. The reviewer should check the Pages semantics and the trust-model wording.

---

## X12. The OAuth doc points at a Disconnect that a loaded scene hides

### Verified
- **What the doc says.** `docs/google-oauth-verification.md:140`: "use Disconnect in the loading account dialog … These controls do not revoke the Google account's authorization grant or erase a loaded scene."
- **The only Disconnect for the Drive loading session is on the landing panel.**
  - That Disconnect is `googleDriveAuth.disconnect()`, in `DatasetAccountButtons.tsx:69-72` (buttons at `:186`, `:200`).
  - It is mounted only in `DropZonePanels.tsx:140` and `:261`.
  - `DropZone.tsx:231` and `:247` render those panels only when `!reconstruction`.
- **Nothing in the UI returns to the landing panel.** `resetSession` is used only by `Scene3DE2EProbe.tsx`, and `clearReconstruction` has no UI caller.
- **The publishing dialog's Sign out ends only the publishing session.** `GoogleDrivePublishModal.tsx:44` calls `publication.cancel(); googleDrivePublishAuth.disconnect()`.
- **The demo script already says this.** `oauth-review-demo-script.md:57`: "The Drive loading session has no control while a scene is open, so reload the tab, which ends both in-memory sessions".

### Disposition: fix
`docs/google-oauth-verification.md:140`, replace the bullet with:
> `- **Forget a local connection:** loading and publishing use different Google sessions; clear both when connected to both. **Sign out** in the publishing dialog ends the publishing session and cancels the active upload; the scene stays open. **Disconnect** in the Google Drive account dialog ends the loading session, but that dialog is only on Load Dataset, which is hidden while a scene is open. With a scene open, reload or close the tab instead, which ends both sessions. None of these revokes the Google account's authorization grant.`

### Tests
There are none; this is docs only. `privacy.html:108` ("Reload or close the viewer to end its in-memory sessions") and `google-drive-loading.md:17` already agree with the new text.

### Risks and interactions
If Q3's F12 changes what the publishing dialog's Sign out does, for example its cancel or invalidation behaviour, re-read this bullet. As written, it only claims Sign out "cancels the active upload", which `GoogleDrivePublishModal.tsx:44` does.

### Effort
**low / low.**

---

## Project `CLAUDE.md` (outside the repo): draft for the controller
Apply this only after the user approves F6 (Part 2 at least). It replaces `C:\Users\HEQ\Projects\colmap_webview\CLAUDE.md` lines 113-131 ("### Creating a Release" through the `--tags` warning). It inserts two bullets after line 142 ("Tags must match …"). Everything else stays.

Step 1 also moves to `npm version`. That matches `CONTRIBUTING.md:78-79` and what the v0.15.2, v0.15.3 and v0.15.4 release commits actually changed: `package.json`, `package-lock.json` and `CHANGELOG.md`. Drop that part if unwanted.

````markdown
### Creating a Release

1. **Update the version and changelog** (the tag is `v` plus this version)
   ```bash
   npm version 0.4.0 --no-git-tag-version   # updates package.json and package-lock.json
   # Move CHANGELOG.md's [Unreleased] entries under 0.4.0
   ```

2. **Commit the version bump**
   ```bash
   git add package.json package-lock.json CHANGELOG.md
   git commit -m "Bump version to 0.4.0"
   ```

3. **Create the tag and push only that tag**
   ```bash
   git tag v0.4.0
   git push origin main v0.4.0
   ```
   Do not use `git push --tags`. It also pushes tags that exist only in this clone (`v0.10.0` and `v0.11.0` as of 2026-10-07), and each pushed tag deploys its own old build to `/latest/`.
````
New bullets after "Tags must match …":
```markdown
- The deploy job rejects a tag that is not `v` plus `package.json`'s version before it builds or uploads anything, because the viewer reports that version and share links made on `/latest/` open `/v<version>/`. If your tag is rejected, delete it (`git tag -d v0.4.0` and `git push origin :refs/tags/v0.4.0`), commit the version bump, and tag again.
- Share and embed links made on `/latest/` or a version directory open that release's `/vX.Y.Z/` directory. Links made on `/dev/` open `/dev/`, and links made on the custom host or an isolated preview open that host.
```
Under option B, the second bullet's middle sentence becomes "Links made on `/dev/` open `/latest/`." Under option C it becomes "Links made on `/dev/` open the last release's directory." The URL Structure block needs no change.

Suggested release-note line for the next `CHANGELOG.md` entry (option A): "Share and embed links made on `/dev/` open `/dev/` instead of the previous release."

---

## File ownership

| File | Item |
| --- | --- |
| `src/utils/shareUrl.ts` | F6 Part 1 (after F6-D1) |
| `src/utils/shareUrl.test.ts` | F6 Part 1 |
| `scripts/deployment/profiles.mjs` | F6 Part 2 |
| `scripts/deployment/preflight.mjs` | F6 Part 2 |
| `scripts/deployment/profiles.test.mjs` | F6 Part 2 (new test), X4 (preview-step contract) |
| `scripts/deployment/tests/artifacts.spec.ts` | F14, X4 |
| `.github/workflows/deploy-preview.yml` | X4 (comment only) |
| `docs/dual-hosting.md` | F6 Part 2 (`:62`), X4 (`:50`) |
| `CONTRIBUTING.md` | F6 Part 2 |
| `docs/google-oauth-verification.md` | X12 |
| Project `CLAUDE.md` (outside the repo) | F6 draft; the controller applies it after approval |

## Recommended task grouping and order
1. **T1 (F6 Part 2).** *Refuse a release tag that does not match package.json's version.*
   - Files: `profiles.mjs`, `preflight.mjs`, `profiles.test.mjs` (new test), `dual-hosting.md:62`, `CONTRIBUTING.md`.
   - Effort: low / medium. Gate: `npm run test:deployment`.
2. **T2 (F14 + X4), after T1.** *Let previews of older releases pass the trusted check, and publish previews as static files only.*
   - Files: `artifacts.spec.ts`, `profiles.test.mjs` (preview-step contract), `deploy-preview.yml` (comment), `dual-hosting.md:50`.
   - It shares two files with T1 in separate hunks, so run it after T1.
   - Effort: low / medium. Gate: `npm run test:deployment`. Optionally, redo the old-artifact recipe above.
3. **T3 (X12), any time.** *Say how to end the Drive loading session while a scene is open.*
   - File: `docs/google-oauth-verification.md`. Effort: low / low.
4. **T4 (F6 Part 1), once F6-D1 is answered and before `main` is pushed.** *Open Share and embed links made on /dev/ in /dev/.* Under option B: *…in /latest/*. Under C: no task.
   - Files: `shareUrl.ts`, `shareUrl.test.ts`. Effort: low / medium.
   - Gate: `npm run check`. The e2e suite is unaffected; see the top of this spec.

## Cross-area notes
- **Q1 (`useUrlState.ts`, F9).** `generateShareableUrl` there calls `getShareBaseUrl`. T4 changes only `shareUrl.ts`; `useUrlState.ts` is untouched by Q4.
- **Q2 (F2).** F2 changes the share config, in `splatFileSourcePolicy.ts` and `useUrlState.ts`. T4 changes the link base. They are independent. Under F6-D1 option B or C, recipients open an older build, so F2's link contents reach a viewer that predates them.
- **Q3:**
  - `docs/google-oauth-verification.md` (X12) describes the Drive sessions. If Q3 edits that doc, or changes the publish dialog's Sign out (F12), merge the texts.
  - `artifacts.spec.ts` exercises Drive loading and the hand-off. Q3's items are publishing-side, so no conflict is expected.
- **Gates.** T1 and T2 change `npm run test:deployment`, which deploy.yml's `validate` runs through `e2e.yml`'s artifacts job. No Q4 change touches the 89-spec chromium suite.

## Validation record
All logs are in `scratchpad/rev4/q4/`.

| Log | What it shows |
| --- | --- |
| `F6a-RED-shareUrl.log` / `F6a-GREEN-shareUrl.log` | `/dev/` → `/v0.15.4/` at HEAD; 49/49 after the fix |
| `F6b-RED1-import.log`, `F6b-RED2-mutation-no-preflight-call.log`, `F6b-RED3-mutation-preview-checked.log`, `F6b-GREEN-final.log` | Tag check RED (import, mutations) and GREEN (20/20) |
| `F14-RED-head-spec-vs-old-artifact.log`, `F14-RED-head-spec-vs-prod-c51741b.log` | HEAD's trusted smoke fails at `:149` for 0a1d01c and c51741b previews |
| `F14-context-c51741b-own-spec-build-job.log` | c51741b's own spec passes, as in the build job |
| `F14-GREEN-guarded-spec-vs-old-0a1d01c.log`, `F14-GREEN-guarded-spec-vs-prod-c51741b.log`, `F14-GREEN-guarded-spec-vs-cur.log` | The guard passes old and current previews |
| `F14-scope-guarded-spec-vs-old-github-stays-strict.log`, `F14-mutation-legacy-branch-bites.log` | The guard is scoped to previews, and its legacy branch checks |
| `X4-RED-head-spec-accepts-worker.log`, `X4-GREEN-worker-artifact-refused.log`, `X4-GREEN-clean-artifact-passes.log`, `F14-X4-final-spec-vs-old.log`, `X4-RED-mutation-smoke-after-upload.log` | Worker refusal and the preview-step contract |
| `ALL-test-deployment-final.log` | `npm run test:deployment` with every change: 20/20 config, typecheck, 3 builds, 7/7 browser cases |
| `ALL-vitest-final.log` | Full unit suite with every change: 578 files, 4,771 passed, 5 skipped |
| `lint-changed.log`, `typecheck-tests.log` | ESLint on the changed code files and `tsc -p tsconfig.test.json`: clean |
| `q4-all.diff` | The exact diff of every change above |
