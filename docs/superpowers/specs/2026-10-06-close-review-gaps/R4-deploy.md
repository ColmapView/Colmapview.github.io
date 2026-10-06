# R4: deploy, CI, privacy policy and Hugging Face `/dev/` implementation spec

Repository: `C:/Users/HEQ/Projects/colmap_webview/colmap-webview`, branch `fix/load-path-review-findings` at `15f1b69`. The workflows and deployment scripts on this branch match `0a1d01c` (`origin/main`).
Research date: 2026-10-06. This was read-only research: no repository files changed, and no git state changed. The evidence comes from file reads, `git show`/`git log`, read-only `gh` queries (variables, caches, run logs, artifact listings), anonymous `curl` GET/HEAD requests to the public hosts, and `npm view`/`npm pack` run in the scratchpad.

Baseline: `node --test scripts/deployment/profiles.test.mjs` passes 9/9, and `npx vitest run src/features/huggingface/config.test.ts` passes 28/28.

Every proposed test below was run in the scratchpad (`scratchpad/gaps/*.mjs`) against the current files, or against in-memory copies with the proposed edits applied. Each one fails on today's files where it should and passes on the proposed version.

| Item | Verdict | Priority |
| --- | --- | --- |
| HF-DEV | **Real.** `/dev/` has shipped without HF since 2026-10-06 (CI env dump shows `VITE_HF_PUBLISH_ENABLED: false`) | High (user decision) |
| C5 cache poisoning | **Real, and demonstrated in CI.** A preview build job of a selected ref tried to save main's npm cache key and lost only a reservation race | **Highest (security)** |
| C4 privacy | **Real.** 56 archived GitHub version directories plus today's `/latest/` load GA `G-7K5H83SEMY`; the policy says no analytics | High (accuracy and Google OAuth branding) |
| Smoke report | **Real.** The report is written to `scripts/deployment/.tmp/...` and never uploaded; the e2e artifact contains only fixture builds | Low |
| Gate-order test | **Real.** The test still passes after renaming, removing, or moving a gate step past publication | Low–medium |
| check-live | **Partly real.** There is no retry after readiness, but the stale-CDN mechanism is largely refuted (see the surprise in §6) | Low |
| Preview subdomain | **Latent.** The current project is unaffected | Low |

---

## 1. HF-DEV: restore Hugging Face sign-in and publishing on `/dev/`

### Verified

- `.github/workflows/deploy.yml:41-45` (current):
  ```yaml
      # GitHub production HF registration stays distinct; branch previews have no provider auth.
      VITE_HF_PUBLISH_ENABLED: ${{ github.ref_type == 'tag' && vars.HF_PUBLISH_ENABLED == 'true' }}
      VITE_HF_AUTH_ENABLED: ${{ github.ref_type == 'tag' && vars.HF_AUTH_ENABLED == 'true' }}
      VITE_HF_OAUTH_CLIENT_ID: ${{ github.ref_type == 'tag' && vars.HF_OAUTH_CLIENT_ID || '' }}
      VITE_HF_OAUTH_REDIRECT_URI: ${{ github.ref_type == 'tag' && vars.HF_OAUTH_REDIRECT_URI || '' }}
  ```
- The previous wiring was added in `5da816c` (2026-09-28) and shipped through v0.15.4 (`git show v0.15.4:.github/workflows/deploy.yml`):
  ```yaml
      VITE_HF_PUBLISH_ENABLED: ${{ github.ref_type == 'tag' && vars.HF_PUBLISH_ENABLED == 'true' || github.ref_type != 'tag' && vars.HF_DEV_PUBLISH_ENABLED == 'true' }}
      VITE_HF_OAUTH_CLIENT_ID: ${{ github.ref_type == 'tag' && vars.HF_OAUTH_CLIENT_ID || github.ref_type != 'tag' && vars.HF_DEV_OAUTH_CLIENT_ID || '' }}
      VITE_HF_OAUTH_REDIRECT_URI: ${{ github.ref_type == 'tag' && vars.HF_OAUTH_REDIRECT_URI || github.ref_type != 'tag' && vars.HF_DEV_OAUTH_REDIRECT_URI || '' }}
  ```
  `5af7c3a` (2026-10-05, "Add Drive dataset workflows and isolated dual-host deployment") replaced this with the tag-only form. The same commit added `VITE_HF_AUTH_ENABLED` and the `HF_AUTH_ENABLED`/`HF_DEV_AUTH_ENABLED` docs.
- Variable names compared with the live repository variables (`gh variable list`):

  | Variable | Old workflow | Documented in | Repository state |
  | --- | --- | --- | --- |
  | `HF_PUBLISH_ENABLED` | yes | publishing.md:127 | `true` (set 2026-09-29) |
  | `HF_OAUTH_CLIENT_ID` | yes | publishing.md:128 | set |
  | `HF_OAUTH_REDIRECT_URI` | yes | publishing.md:129 | `https://colmapview.github.io/latest/hf-callback.html` |
  | `HF_AUTH_ENABLED` | no | loading.md:34 | **unset** |
  | `HF_DEV_PUBLISH_ENABLED` | yes | publishing.md:130 | `true` (set 2026-09-29) |
  | `HF_DEV_OAUTH_CLIENT_ID` | yes | publishing.md:131 | set (same public client) |
  | `HF_DEV_OAUTH_REDIRECT_URI` | yes | publishing.md:132 | `https://colmapview.github.io/dev/hf-callback.html` |
  | `HF_DEV_AUTH_ENABLED` | no | loading.md:34 | **unset** |

- Live effect: the env dump of deploy run 37404234466 (main, 2026-10-06) shows `VITE_HF_PUBLISH_ENABLED: false`, `VITE_HF_AUTH_ENABLED: false`, and empty client ID and redirect.
- Doc contradictions:
  - `docs/hugging-face-loading.md:34` and `docs/hugging-face-publishing.md:130-134` describe `HF_DEV_*` as live.
  - `docs/dual-hosting.md:61` says: "Branch and branch-manual runs update GitHub `/dev/` with Drive and provider authentication disabled".
  - Separately, `hugging-face-publishing.md:5` ("Development and production publishing remain disabled in GitHub Actions") and `:87` ("`HF_PUBLISH_ENABLED` and `HF_DEV_PUBLISH_ENABLED` remain `false`") are stale: both variables have been `true` since 2026-09-29 (v0.15.1; CHANGELOG:42 "Enable Hugging Face publishing on colmapview.github.io").
- Scripts: **none of them asserts that the GitHub dev build has providers off.**
  - `profileEnvironment('github')` (`scripts/deployment/profiles.mjs:63-88`) passes `VITE_HF_*` through unless `--fixture` is set.
  - `profileEnvironment('custom')` replaces all four from `CUSTOM_HF_*`, and `preview` clears them.
  - `build-profile.mjs:34` records only `googleDrive`.
  - `preflight.mjs` mentions providers only in the preview summary.
  - `profiles.test.mjs:18-30` asserts that github erases Drive and that preview erases HF. Both stay true.

  A scratch run of `profileEnvironment` confirmed the following. GitHub passes dev HF through. `github --fixture`, `preview`, and `custom` without `CUSTOM_HF_*` all yield `false/false/''/''`. **No script logic change is required.**
- The app side is ready.
  - `resolveHfAccountConfiguration` (`src/features/huggingface/config.ts:14-18`): publish implies sign-in (read and contribute scopes), and auth alone gives read-only sign-in.
  - At idle there is no HF network traffic: the account button only renders, and the publisher modal is lazily imported. In the current workflow, tag runs would smoke an HF-enabled GitHub artifact, but no tag has run on it yet. Restoring `/dev/` makes every main push exercise that path.

### Change (exact)

**`.github/workflows/deploy.yml:41-45`**: replace with:
```yaml
      # GitHub Pages HF: release tags read HF_* (stable /latest/ callback); branch runs read HF_DEV_* (/dev/ callback).
      # Each side is guarded by ref_type, so an unset value becomes '' instead of borrowing the other channel's.
      # Custom builds replace all VITE_HF_* with CUSTOM_HF_*, and isolated previews clear them (profiles.mjs).
      VITE_HF_PUBLISH_ENABLED: ${{ github.ref_type == 'tag' && vars.HF_PUBLISH_ENABLED == 'true' || github.ref_type != 'tag' && vars.HF_DEV_PUBLISH_ENABLED == 'true' }}
      VITE_HF_AUTH_ENABLED: ${{ github.ref_type == 'tag' && vars.HF_AUTH_ENABLED == 'true' || github.ref_type != 'tag' && vars.HF_DEV_AUTH_ENABLED == 'true' }}
      VITE_HF_OAUTH_CLIENT_ID: ${{ github.ref_type == 'tag' && vars.HF_OAUTH_CLIENT_ID || github.ref_type != 'tag' && vars.HF_DEV_OAUTH_CLIENT_ID || '' }}
      VITE_HF_OAUTH_REDIRECT_URI: ${{ github.ref_type == 'tag' && vars.HF_OAUTH_REDIRECT_URI || github.ref_type != 'tag' && vars.HF_DEV_OAUTH_REDIRECT_URI || '' }}
```
Do **not** simplify to `tag && A || B`. In that form an empty `A` on a tag run falls through to `B` (the dev value). The explicit `ref_type != 'tag'` guard prevents leakage across channels.

The expression semantics were simulated (`scratchpad/gaps/hf-expr-sim.mjs`):

| Run | Variables | Result |
| --- | --- | --- |
| tag | live | prod ID, `/latest/` callback, publish `true` |
| branch | live | dev ID, `/dev/` callback, publish `true` |
| tag | prod unset | all off/empty, no dev leak |
| branch | dev unset | all off/empty, no prod leak |
| branch | only `HF_DEV_AUTH_ENABLED` | read-only sign-in |

Do not touch `deploy-preview.yml`, the custom env (`CUSTOM_HF_*`, `deploy.yml:37-40`), or `profiles.mjs`. The custom build and the preview build are unchanged.

**`scripts/deployment/profiles.test.mjs`** (required; it pins the restored wiring so a later edit cannot silently drop `/dev/` HF again):

1. Add a new test after the existing `'Cloudflare deployment token...'` test:
```js
test('GitHub Pages builds read release HF settings on tags and development HF settings on branches', () => {
  const env = yaml.load(readFileSync('.github/workflows/deploy.yml', 'utf8')).jobs.deploy.env;
  const flag = (release, dev) => `\${{ github.ref_type == 'tag' && vars.${release} == 'true' || github.ref_type != 'tag' && vars.${dev} == 'true' }}`;
  const value = (release, dev) => `\${{ github.ref_type == 'tag' && vars.${release} || github.ref_type != 'tag' && vars.${dev} || '' }}`;
  assert.equal(env.VITE_HF_PUBLISH_ENABLED, flag('HF_PUBLISH_ENABLED', 'HF_DEV_PUBLISH_ENABLED'));
  assert.equal(env.VITE_HF_AUTH_ENABLED, flag('HF_AUTH_ENABLED', 'HF_DEV_AUTH_ENABLED'));
  assert.equal(env.VITE_HF_OAUTH_CLIENT_ID, value('HF_OAUTH_CLIENT_ID', 'HF_DEV_OAUTH_CLIENT_ID'));
  assert.equal(env.VITE_HF_OAUTH_REDIRECT_URI, value('HF_OAUTH_REDIRECT_URI', 'HF_DEV_OAUTH_REDIRECT_URI'));
  assert.ok(!Object.keys(env).some(name => name.startsWith('VITE_GOOGLE_DRIVE_')), 'GitHub builds receive no Drive configuration');
  assert.doesNotMatch(readFileSync('.github/workflows/deploy-preview.yml', 'utf8'), /VITE_HF_|vars\.(?:CUSTOM_)?HF_/, 'previews receive no provider configuration');
});
```
2. Extend the first test (`'disabled profiles erase inherited test credentials...'`, after line 29) so that GitHub keeps channel HF while preview and custom never inherit it:
```js
  const devHf = { VITE_HF_PUBLISH_ENABLED: 'true', VITE_HF_AUTH_ENABLED: 'true', VITE_HF_OAUTH_CLIENT_ID: 'dev-id', VITE_HF_OAUTH_REDIRECT_URI: 'https://colmapview.github.io/dev/hf-callback.html' };
  const hfOf = env => [env.VITE_HF_PUBLISH_ENABLED, env.VITE_HF_AUTH_ENABLED, env.VITE_HF_OAUTH_CLIENT_ID, env.VITE_HF_OAUTH_REDIRECT_URI];
  assert.deepEqual(hfOf(profileEnvironment('github', devHf)), Object.values(devHf));
  assert.deepEqual(hfOf(profileEnvironment('github', devHf, true)), ['false', 'false', '', '']);
  for (const profile of ['preview', 'custom']) {
    assert.deepEqual(hfOf(profileEnvironment(profile, { ...FIXTURE_GOOGLE_CONFIG, ...devHf })), ['false', 'false', '', ''], profile);
  }
```

**Optional (recommended): `scripts/deployment/preflight.mjs`.** This fails fast on an incomplete or swapped channel config and writes the HF state to the run summary. It catches enabled-but-broken setups, not silently-disabled ones; the contract test covers the latter.

- `profiles.mjs`: add an export.
```js
export const GITHUB_ORIGIN = 'https://colmapview.github.io';

/** GitHub Pages builds: release tags use the stable /latest/ callback, branch builds the /dev/ callback. */
export function validateGithubHfConfiguration(env, isRelease) {
  const publish = strictFlag(env.VITE_HF_PUBLISH_ENABLED, 'VITE_HF_PUBLISH_ENABLED');
  const auth = strictFlag(env.VITE_HF_AUTH_ENABLED, 'VITE_HF_AUTH_ENABLED');
  if (!publish && !auth) return { hf: 'disabled' };
  const prefix = isRelease ? 'HF' : 'HF_DEV';
  if (!/^[A-Za-z0-9_-]+$/.test(env.VITE_HF_OAUTH_CLIENT_ID?.trim() ?? '')) throw new Error(`${prefix}_OAUTH_CLIENT_ID is missing or invalid.`);
  const callback = `${GITHUB_ORIGIN}/${isRelease ? 'latest' : 'dev'}/hf-callback.html`;
  if (env.VITE_HF_OAUTH_REDIRECT_URI !== callback) throw new Error(`${prefix}_OAUTH_REDIRECT_URI must be ${callback}.`);
  return { hf: publish ? 'publish' : 'read-only' };
}
```
- `preflight.mjs`: compute `const isRelease = process.env.GITHUB_REF_TYPE === 'tag';`, pass `isRelease` to `validateReleaseConfiguration`, then add `const githubHf = preview ? null : validateGithubHfConfiguration(process.env, isRelease);`. After the existing summary line, add:
  `if (githubHf && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, \`GitHub Pages Hugging Face (\${isRelease ? 'release HF_*' : 'development HF_DEV_*'}): \${githubHf.hf}.\n\`);`
- Test cases, all verified in `scratchpad/gaps/github-hf-preflight.mjs`:
  - Accepts: live dev values on a branch, live release values on a tag, all empty (disabled), and auth-only (read-only).
  - Rejects with the named variable: the `/latest/` callback on a branch, the `/dev/` callback on a tag, a missing client ID, and a non-boolean flag (`'yes'`).

**Docs (all three must agree):**

- `docs/dual-hosting.md`, table (lines 5-9): insert after line 7:
  ```markdown
  | `https://colmapview.github.io/dev/` | `/dev/` | Disabled; same explicit link to the custom viewer | GitHub Hugging Face development registration (`HF_DEV_*`), when enabled |
  ```
- `docs/dual-hosting.md`, settings table: append after line 45:
  ```markdown
  | `HF_PUBLISH_ENABLED`, `HF_AUTH_ENABLED`, `HF_OAUTH_CLIENT_ID`, `HF_OAUTH_REDIRECT_URI` | Variables | GitHub release tags (`/vX.Y.Z/`, `/latest/`); callback `https://colmapview.github.io/latest/hf-callback.html`. See [publishing setup](hugging-face-publishing.md#github-pages-configuration) |
  | `HF_DEV_PUBLISH_ENABLED`, `HF_DEV_AUTH_ENABLED`, `HF_DEV_OAUTH_CLIENT_ID`, `HF_DEV_OAUTH_REDIRECT_URI` | Variables | GitHub branch builds (`/dev/`); callback `https://colmapview.github.io/dev/hf-callback.html`. Never read by custom or preview builds |
  ```
- `docs/dual-hosting.md:61`: replace the sentence "Branch and branch-manual runs update GitHub `/dev/` with Drive and provider authentication disabled; they do not update custom production." with:
  > Branch and branch-manual runs update GitHub `/dev/` with Drive disabled and Hugging Face configured from the development `HF_DEV_*` variables (`/dev/hf-callback.html` callback); they do not update custom production.
- `docs/hugging-face-loading.md:34`: replace the whole paragraph with:
  > Restart Vite after changing environment variables. For GitHub Pages, set repository variable **`HF_AUTH_ENABLED=true`** for release builds (`/latest/` and versioned directories) or **`HF_DEV_AUTH_ENABLED=true`** for `/dev/` builds, together with `HF_OAUTH_CLIENT_ID`/`HF_OAUTH_REDIRECT_URI` or `HF_DEV_OAUTH_CLIENT_ID`/`HF_DEV_OAUTH_REDIRECT_URI`. `HF_PUBLISH_ENABLED` and `HF_DEV_PUBLISH_ENABLED` control publication independently. Publishing also enables sign-in, so the `*_AUTH_ENABLED` flags matter only for read-only viewing while publishing is off. Settings take effect on the next build. The custom host uses its own `CUSTOM_HF_*` settings (see [dual hosting](dual-hosting.md)); isolated previews never enable sign-in.
- `docs/hugging-face-publishing.md:5`: replace the sentence "Development and production publishing remain disabled in GitHub Actions pending deployment." with:
  > Publishing is enabled on colmapview.github.io since v0.15.1 (2026-09-29): release builds use the production settings and `/dev/` the development settings below.

  Keep the rest of the line.
- `docs/hugging-face-publishing.md:87`: replace with:
  > The same public client ID is saved in `HF_OAUTH_CLIENT_ID` and `HF_DEV_OAUTH_CLIENT_ID`. Both deployment callback variables are configured. `HF_PUBLISH_ENABLED` and `HF_DEV_PUBLISH_ENABLED` were set to `true` on 2026-09-29 (v0.15.1). `HF_AUTH_ENABLED` and `HF_DEV_AUTH_ENABLED` are unset because publishing already enables sign-in. The ignored `.env.local` enables the local integration with the registered `localhost:5173` callback.
- `docs/hugging-face-publishing.md:125-134`: replace the table and the following paragraph with:
  ```markdown
  | Variable | Value |
  | --- | --- |
  | `HF_PUBLISH_ENABLED` | `true` offers publication in release builds (`/latest/` and versioned directories); `false` withdraws it |
  | `HF_AUTH_ENABLED` | Optional `true` for read-only private viewing in release builds while publishing is `false` |
  | `HF_OAUTH_CLIENT_ID` | Registered production public client ID |
  | `HF_OAUTH_REDIRECT_URI` | Production `/latest/hf-callback.html` URL |
  | `HF_DEV_PUBLISH_ENABLED` | `true` offers publication in `/dev/` builds from `main` or a manual branch run |
  | `HF_DEV_AUTH_ENABLED` | Optional `true` for read-only private viewing in `/dev/` while development publishing is `false` |
  | `HF_DEV_OAUTH_CLIENT_ID` | Public client ID registered for the development callback |
  | `HF_DEV_OAUTH_REDIRECT_URI` | Development `/dev/hf-callback.html` URL |

  The deployment workflow selects production settings for release tags and development settings for branch builds: a tag build never reads `HF_DEV_*`, and a branch build never reads the production variables. Versioned releases and `/latest/` use the same production configuration. Google Drive stays disabled in every GitHub build. The custom host uses separate `CUSTOM_HF_*` settings ([dual hosting](dual-hosting.md)), and isolated previews disable all providers. Settings take effect on the next build. Before enabling a release, bump the application version through the normal release process so generated links target a release containing the new manifest-state loader.
  ```
- Optional, `docs/hugging-face-publishing.md:146`: "Keep `HF_PUBLISH_ENABLED=false` until this live check passes." becomes:
  > Publication was enabled on 2026-09-29; if it is withdrawn, keep `HF_PUBLISH_ENABLED=false` until this live check passes again.

### Validation

- `node --test scripts/deployment/profiles.test.mjs`. The new contract test fails on today's `deploy.yml` and passes on the proposed one; both were verified in `scratchpad/gaps/hf-contract.mjs`.
- `npm run test:deployment` (config tests, typecheck, three fixture builds, browser smoke). Fixture GitHub builds clear HF, so this proves no regression in the offline smoke.
- `npm run lint` and the full `npm run test:run` before pushing (project rule).
- After the next main push (read-only checks):
  - The deploy job's env dump should show `VITE_HF_PUBLISH_ENABLED: true` and `VITE_HF_OAUTH_REDIRECT_URI: https://colmapview.github.io/dev/hf-callback.html`.
  - The "Smoke prepared artifacts" step (profile `version`) now exercises an HF-enabled GitHub artifact on every main push, including the "no idle external request" assertion.
  - `check-live` asserts no idle provider traffic on the live `/dev/`.
  - Manually load a dataset on `/dev/` and confirm the 🤗 publish button shows.

### Risks

- `/dev/` again holds a working, registered OAuth callback with the `read-repos contribute-repos` scopes. Anything deployed to `/dev/` (main, or a `workflow_dispatch` from any branch by a write-access user) can obtain HF tokens from users who sign in there. This is the same exposure that existed before `5af7c3a` and was explicitly chosen by the user.
- If someone deletes the `HF_DEV_*` variables, `/dev/` silently loses HF again. Only the optional preflight summary line makes that visible.
- Tag behaviour is unchanged. Versioned builds keep using the `/latest/` callback, same origin.
- `HF_AUTH_ENABLED` and `HF_DEV_AUTH_ENABLED` do not exist yet and evaluate to `false`. That is harmless because publishing implies sign-in.

---

## 2. C5: CI cache poisoning into the token-holding Wrangler steps

### Verified

- `deploy-preview.yml:25-37`: the `build` job checks out `inputs.ref` and uses `actions/setup-node@v6` with `cache: npm`. It then runs selected-ref code (`npm ci` lifecycle scripts, and `npm run check` = lint, vitest, build). The job references no secrets, which is what the "credential-free" comment at line 35 relies on. Yet run 37399861700, "Set up job", shows **`Cache mode: write`**.
- Cache scope: all four recorded preview runs were dispatched from `main`, so the run's ref, and therefore its cache scope, is `refs/heads/main`. The checkout of `inputs.ref` does not change the scope. `gh api .../actions/caches` lists 3 npm caches, all `ref: refs/heads/main`.
- The cache key is computed from the **selected ref's** `package-lock.json`. A ref that keeps main's lockfile targets main's exact key (`node-cache-Linux-x64-npm-<hash>`). setup-node saves in its post step (`post-if: success()`, and only when the primary key missed; see setup-node `action.yml` and `src/cache-save.ts` via Context7). The saved path is `npm config get cache` = `/home/runner/.npm`.
- **Demonstrated, not hypothetical.** In preview run 37399861700 (build of ref `c450566…`), setup-node logged "npm cache is not found". Its post step then ran `tar` and logged "**Failed to save: Unable to reserve cache with key node-cache-Linux-x64-npm-0350b2cb…, another job may be creating this cache.**" It lost the race only because deploy run 37399829510's `validate / artifacts` job saved that key at 01:36:12Z. The **same preview run's publish job** then logged "Cache hit for: node-cache-Linux-x64-npm-0350b2cb…".
- Consumers holding the token:
  - `deploy-preview.yml:101-104`: `npx --yes wrangler@4.147.0 pages deploy …` with `CLOUDFLARE_API_TOKEN`.
  - `deploy.yml:125-130`, the same command on tag runs. Tag runs restore from the default-branch scope.
- npx reuses a planted install without any integrity check. In npm's own `libnpmexec/lib/index.js` (npm 10.9.8, bundled with Node 22.23.2; CI uses npm 10.9.9):
  - The install dir is `<cache>/_npx/<sha512('wrangler@4.147.0').slice(0,16)>`, which is deterministic.
  - `missingFromTree` returns the existing node when `spec.type === 'version' && node.pkgid === spec.raw` (lines 52-53). The install is skipped, and `installDir/node_modules/.bin` is put on PATH.
  - A planted `~/.npm/_npx/<hash>/node_modules/wrangler/package.json` with version 4.147.0 therefore runs with the token.
  - npm config defines `npxCache = join(cache, '_npx')` and `cacache = join(cache, '_cacache')` (npm `definitions.js` via Context7). Isolating only `_npx` would not be enough, because `npx` would then trust registry metadata from a planted `_cacache`. **The whole `cache` must be fresh.**
- `npm ci` on the restored cache is not a vector: it installs only lockfile entries with integrity verification. `npx playwright` resolves the local `node_modules/.bin`. No other step in either token job executes code from `~/.npm`.
- setup-node v6 semantics (Context7, setup-node `src/main.ts` and README): with `cache` empty, caching auto-enables **only** when `packageManager` or `devEngines.packageManager` in package.json names npm. `package-manager-cache: false` disables it, and that setting is recommended for elevated-security workflows. This package.json has neither field (`grep` exit 1). Removing `cache: npm` therefore disables caching today, and `package-manager-cache: false` keeps it disabled if someone later adds `packageManager`.
- Existing caches show no sign of poisoning:
  - `0350b2cb…` was created by a trusted `validate/artifacts` job.
  - `1bcd34ad…` (2026-10-04) and `1d93c419…` (2026-09-29) predate `deploy-preview.yml`'s first run (2026-10-06T01:34Z).
- Exploit preconditions: main's key must be absent, for example right after a lockfile change on main or after 7 days without access. The threat that matters is an operator previewing an **untrusted** ref (such as a fork PR head SHA, fetchable through the base repo). Write-access collaborators can already reach repository secrets with their own branch workflows.
- devDependency size assessment (unpacked, linux-x64, `npm view`):

  | Package | Size |
  | --- | --- |
  | wrangler 4.147.0 | 15.5 MB |
  | workerd | 5.0 MB |
  | **@cloudflare/workerd-linux-64** | **134.7 MB** |
  | miniflare 5.20261001.0-alpha | 24.6 MB |
  | esbuild 0.28.1 + @esbuild/linux-x64 (second copy; root has 0.27.2 via Vite) | 11.6 MB |
  | sharp 0.35.4 + libvips | ~20 MB |
  | undici, unenv and others | ~3 MB |
  | **Total** | **≈ 215 MB** |

  That would be added to **every** `npm ci`: 3 e2e jobs plus the deploy job per push, plus previews. Local `node_modules` is about 337 MB today, so this is roughly +60%. Windows dev installs would pull `@cloudflare/workerd-windows-64` (96.9 MB) as well. The npm cache archive (~80 MB) would also grow.

**Recommendation: (a) plus (b), not a devDependency.**

### Change (exact)

**(a) `deploy-preview.yml:31-35`, build job:**
```yaml
      - uses: actions/setup-node@v6
        with:
          node-version: '22'
          # This run is in the default branch's cache scope, which token-holding jobs restore.
          # Selected-ref code runs below, so never restore or save a dependency cache here.
          package-manager-cache: false
      # Selected-ref code is executed only in this credential-free, cache-free job.
```
This removes `cache: npm`. Keep `cache: npm` in the publish job (`:78-81`), because it runs trusted code and `npm ci` verifies integrity.

**(b) Fresh npm cache on both token steps.**

`deploy-preview.yml:101-104`:
```yaml
      - name: Upload preview only
        run: npx --yes wrangler@4.147.0 pages deploy .tmp/deployment/preview --project-name "$CLOUDFLARE_PREVIEW_PROJECT" --branch "$PREVIEW_BRANCH" --commit-hash "$DEPLOYMENT_SHA" --commit-dirty=false
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          # Fresh job-local cache: never run a restored ~/.npm (_npx install or registry metadata) with the token.
          npm_config_cache: ${{ runner.temp }}/wrangler-npm-cache
```
`deploy.yml:129-130`:
```yaml
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          # Fresh job-local cache: never run a restored ~/.npm (_npx install or registry metadata) with the token.
          npm_config_cache: ${{ runner.temp }}/wrangler-npm-cache
```

**`profiles.test.mjs`, the `'Cloudflare deployment token is scoped only to trusted upload steps'` test.** Import `WRANGLER_VERSION` from `./profiles.mjs` (currently an unused export) and append:
```js
  // Selected-ref code runs in the default branch's cache scope: it must neither restore nor save the npm cache.
  const buildSetup = preview.jobs.build.steps.find(step => step.uses?.startsWith('actions/setup-node@'));
  assert.equal(buildSetup.with.cache, undefined);
  assert.equal(buildSetup.with['package-manager-cache'], false);
  assert.ok(!preview.jobs.build.steps.some(step => step.uses?.startsWith('actions/cache')));
  // Steps holding the token resolve the pinned Wrangler from a fresh job-local npm cache, never a restored ~/.npm.
  const tokenSteps = [...releaseWorkflow.jobs.deploy.steps, ...preview.jobs.publish.steps].filter(step => step.env?.CLOUDFLARE_API_TOKEN);
  assert.deepEqual(tokenSteps.map(step => step.name), ['Deploy custom production', 'Upload preview only']);
  for (const step of tokenSteps) {
    assert.ok(step.run.startsWith(`npx --yes wrangler@${WRANGLER_VERSION} pages deploy `), step.name);
    assert.equal(step.env.npm_config_cache, '${{ runner.temp }}/wrangler-npm-cache', step.name);
  }
```
`scratchpad/gaps/c5-contract.mjs` confirmed that today's YAML fails ("selected-ref build must not restore or save the npm cache") and that the edited YAML passes. js-yaml parses `package-manager-cache: false` as a boolean.

**`docs/dual-hosting.md:47`**: append to the paragraph:
> The selected-ref build job neither restores nor saves the npm cache (its run uses the default branch's cache scope), and each Wrangler upload step uses a fresh, job-local npm cache, so no restored `npx` install or registry metadata runs with the token.

### Validation

- `node --test scripts/deployment/profiles.test.mjs`.
- Optional: run `actionlint` on the three workflows if it is available.
- After merging, dispatch one preview and check:
  - The build job has no "Cache restored" line and no post-step save. Its setup-node log shows no `npm config get cache` lookup.
  - The "Upload preview only" log shows a fresh npx install. Expect +10–40 s.
  - The next tag run's "Deploy custom production" does the same.

### Risks

- Preview builds lose the npm cache, adding about 30–60 s, and each token-holding upload downloads Wrangler and its dependencies fresh. These run rarely: tags and manual previews.
- Wrangler's transitive dependencies are still resolved at install time and are not lockfile-pinned. This is the status quo on any cache miss. A follow-up, not part of C5, is a dedicated `scripts/deployment/wrangler/{package.json,package-lock.json}` holding only Wrangler, installed by `npm ci --prefix scripts/deployment/wrangler` in the two token jobs. That gives full integrity pinning without the ~215 MB tax on every root `npm ci`.
- No purge is needed: there is no evidence of poisoning. A one-time owner action `gh cache delete --all` after merging is cheap insurance; it is state-changing, so it is not done here.
- Adjacent, not C5: a selected-ref artifact could include `_worker.js`, `_worker.bundle` or `_routes.json`, which `wrangler pages deploy` would turn into Pages Functions on the **preview** project. This does not expose the token. An optional trusted step can reject these files before upload.
- Stronger isolation, out of scope: move `CLOUDFLARE_API_TOKEN` into a GitHub Environment with required reviewers and deployment-branch rules.

---

## 3. C4: privacy policy versus Google Analytics in archived GitHub builds

### Verified

- `public/privacy.html:99`: "ColmapView is hosted on GitHub Pages and Cloudflare Pages." `:100`: "**ColmapView does not include analytics scripts or create analytics cookies.**" Section 1 (`:58`) scopes the policy to "the ColmapView website".
- GA history in `index.html`:
  - `git log -S'G-7K5H83SEMY' -- index.html` shows it added in `e92d921` (first tagged in **v0.2.1**) and removed in **`5af7c3a`** (2026-10-05, after v0.15.4). The replacement comment reads `<!-- Dataset URLs can contain private file identifiers. Do not load page analytics. -->`.
  - Checking every tag shows that **v0.2.1 through v0.15.4 inclusive all include GA**, and v0.1.0–v0.2.0 do not. No tag after the removal exists yet.
- The live `gh-pages` tree (`gh api .../git/trees/gh-pages`) has 56 version directories, `v0.3.3` through `v0.15.4`. These were never deployed: v0.4.0, v0.4.2, v0.4.4, v0.10.0 and v0.11.0. Live `curl` checks: `/latest/` (still v0.15.4), `/v0.15.4/` and `/v0.3.3/` contain `G-7K5H83SEMY`, and `/dev/` (built from `0a1d01c`) does not.
- Where the inaccurate statement is visible today:
  - `https://colmapview.github.io/dev/privacy.html` (200).
  - The custom origin's `/privacy`, which is the **Google OAuth Branding privacy URL**.
  - The next release's `/latest/privacy.html`.

  `/latest/privacy.html` is 404 today, while `README.md:173` links to it.
- Nothing checksums `privacy.html`:
  - `deployment.json` hashes only `index.html` (`build-profile.mjs:33`).
  - `verifyPolicyHtml` (`artifact-verification.mjs:13-16`) checks only `<title>Privacy policy · ColmapView</title>`.
  - `artifacts.spec.ts:117-125` checks HTTP 200, a visible `h1`, that the Main navigation links are same-origin and include the viewer, and the `cache-control` header (non-GitHub only).
  - No vitest reads `public/*.html`.

  **Keep the title, the `h1`, and the nav unchanged; no hash or fixture updates are needed.** `about.html` and `terms.html` make no analytics claim.

### Change (exact, `public/privacy.html`)

- **Line 29:** set the effective date to the day the change ships, for example `<p class="updated">Effective <time datetime="2026-10-07">October 7, 2026</time></p>`. Section 9 promises the date changes when practices change.
- **"At a glance"**: insert after line 53:
  ```html
              <li>Current versions include no analytics. Older versions kept at their versioned GitHub Pages addresses (v0.15.4 and earlier) load Google Analytics; see <a href="#older-versions">section 7</a>.</li>
  ```
- **Line 100**: replace the first sentence. The paragraph then begins:
  ```html
            <p>Current ColmapView versions do not include analytics scripts or create analytics cookies; see <a href="#older-versions">older versions</a> below. These policy pages load no third-party scripts or fonts. Opening an account control, …
  ```
  The rest of the paragraph is unchanged.
- **New paragraph** after line 100:
  ```html
            <p id="older-versions"><strong>Older versions on GitHub Pages:</strong> each released version stays available at its own address on <code>colmapview.github.io</code>, such as <code>/v0.15.4/</code>, so existing links keep working. ColmapView v0.15.4 and earlier versions, including <code>/latest/</code> until a newer release replaces it, load Google Analytics (Google tag <code>G-7K5H83SEMY</code>) when the viewer opens. In those versions your browser sends page-view information to Google, including the full page address with any dataset URL in its query string, the referring page, browser and device details, and connection information such as your IP address. The tag also sets Google Analytics cookies (<code>_ga</code> and <code>_ga_7K5H83SEMY</code>) for <code>colmapview.github.io</code>. Google handles this information as described in <a href="https://policies.google.com/technologies/partner-sites">How Google uses information from sites or apps that use its services</a>. To avoid it, use a current version instead of a versioned address from v0.15.4 or earlier, or block analytics in your browser.</p>
  ```
- **Line 108**, "Clear this browser" bullet: change "to remove local and session storage and cached responses" to:
  > to remove local and session storage, cookies (including Google Analytics cookies set by older versions), and cached responses

Do not claim that the custom host "never served" these builds unless the owner confirms in the Cloudflare dashboard that no `colmapview-opsiclear` deployment predates `5af7c3a`. All custom-profile builds necessarily postdate the removal, because the profile was introduced in the same commit, but manual uploads cannot be ruled out from here. Do not push to `gh-pages`.

**Optional guard test (`profiles.test.mjs`):**
```js
test('privacy policy discloses analytics in archived GitHub versions while current pages load none', () => {
  const policy = readFileSync('public/privacy.html', 'utf8');
  assert.ok(policy.includes('<title>Privacy policy · ColmapView</title>'), 'verifyPolicyHtml relies on this exact title');
  assert.match(policy, /G-7K5H83SEMY/);
  assert.match(policy, /v0\.15\.4 and earlier/);
  for (const file of ['index.html', 'public/about.html', 'public/privacy.html', 'public/terms.html', 'public/hf-callback.html']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /googletagmanager\.com|google-analytics\.com|gtag\(/, file);
  }
});
```

### Validation

- `node --test scripts/deployment/profiles.test.mjs`, if the guard is added.
- `npm run test:deployment`: the policy smoke at `/latest/` and `/` must stay green, which confirms the title, `h1` and nav are intact.
- Open `public/privacy.html` locally. Its CSP is `script-src 'none'`, so it is plain HTML.

### Risks

- The wording reaches `/dev/` on the next main push, but reaches the **custom `/privacy` (the Google Branding URL) and `/latest/` only on the next tag** (or a manual custom upload). Cut a release soon after merging.
- GA collection from the archives continues regardless of the wording. Owner options that do not touch `gh-pages`, to verify in GA admin:
  - Set the shortest data retention.
  - Configure data-stream redaction of the `url` query parameter. The tag is fetched live, so this applies to archived pages too.
  - Delete the stream or property.

  Browsers still request the Google tag from archived pages, so keep the disclosure while those directories exist. `docs/google-oauth-verification.md:132` already flags the review of historical GA retention.
- Keep the wording future-proof. "v0.15.4 and earlier" stays true permanently; do not say "GitHub Pages loads no analytics".

---

## 4. Smoke report never uploaded

### Verified

- `scripts/deployment/playwright.config.ts:10-11`: `outputDir: '../../.tmp/deployment-smoke/results'` and `['html', { outputFolder: '.tmp/deployment-smoke/report', … }]`.
- Playwright 1.58 resolves the reporter path relative to the **config directory**. In `node_modules/playwright/lib/util.js:254-256`, `resolveReporterOutputPath` returns `path.resolve(configDir, configValue)`. The local report exists at `scripts/deployment/.tmp/deployment-smoke/report/index.html`.
- CI evidence:
  - Deploy run 37404234466: "**No files were found with the provided path: .tmp/deployment-smoke/.**"
  - Preview publish job of run 37403513989: the same message.
  - Run 37405147355's `production-artifact-smoke` (e2e `artifacts` job, 12.5 MB) was downloaded to the scratchpad. It contains only the `custom/`, `github/` and `preview/` **fixture builds**, with no report and no results.
- Upload steps: `e2e.yml:49-56`, `deploy.yml:148-155`, `deploy-preview.yml:56-62` and `:109-115` all upload `.tmp/deployment-smoke/`.

### Change (exact)

- `scripts/deployment/playwright.config.ts:11`:
  ```ts
    reporter: [['list'], ['html', { outputFolder: '../../.tmp/deployment-smoke/report', open: 'never' }]],
  ```
  `report` and `results` are siblings, so Playwright's "HTML reporter output folder clashes" check (`html.js:75`) is not triggered.
- All four upload steps: replace `path: .tmp/deployment-smoke/` with the block below. This is required in `e2e.yml`, where it drops ~12.5 MB of reproducible fixture builds from every run. In the other three it is equivalent today but explicit.
  ```yaml
          path: |
            .tmp/deployment-smoke/report/
            .tmp/deployment-smoke/results/
  ```
- Contract test in `profiles.test.mjs` (`path` is already imported):
  ```js
  test('deployment smoke report and traces land in the uploaded .tmp/deployment-smoke directory', () => {
    const config = readFileSync('scripts/deployment/playwright.config.ts', 'utf8');
    const fromConfig = pattern => path.relative(process.cwd(), path.resolve('scripts/deployment', config.match(pattern)[1])).split(path.sep).join('/');
    assert.equal(fromConfig(/outputFolder: '([^']+)'/), '.tmp/deployment-smoke/report');
    assert.equal(fromConfig(/outputDir: '([^']+)'/), '.tmp/deployment-smoke/results');
    const uploads = ['e2e.yml', 'deploy.yml', 'deploy-preview.yml']
      .flatMap(file => Object.values(yaml.load(readFileSync(`.github/workflows/${file}`, 'utf8')).jobs))
      .flatMap(job => job.steps ?? [])
      .filter(step => step.uses?.startsWith('actions/upload-artifact@') && /smoke/.test(step.with.name));
    assert.equal(uploads.length, 4);
    for (const step of uploads) assert.match(step.with.path, /^\.tmp\/deployment-smoke\/report\/$/m, step.with.name);
  });
  ```
  Prototyped in `scratchpad/gaps/smoke-report-contract.mjs` and `upload-contract.mjs`. Today the report resolves to `scripts/deployment/.tmp/deployment-smoke/report`; the fixed config resolves to `.tmp/deployment-smoke/report`.
- `docs/dual-hosting.md:81` ("Reports and builds stay under ignored `.tmp/deployment-smoke/`") becomes accurate; no edit is needed.

### Validation

- `node --test scripts/deployment/profiles.test.mjs`.
- `npx eslint scripts/deployment/playwright.config.ts`.
- Locally, run `npm run test:deployment`. Alternatively, reuse the existing fixture builds with `DEPLOYMENT_SMOKE_ROOT=.tmp/deployment-smoke npm run test:deployment:browser`. Then confirm `.tmp/deployment-smoke/report/index.html` is fresh and `scripts/deployment/.tmp` is not recreated. The stale `scripts/deployment/.tmp/` is gitignored and can be deleted.

### Risks

Minimal. Anyone who relied on the fixture builds inside the e2e artifact loses them; they are reproducible with `node scripts/deployment/build-fixtures.mjs`.

---

## 5. Gate-order test is vacuous

### Verified

`profiles.test.mjs:65-71`:
```js
const firstPublish = steps.findIndex(step => step.uses?.startsWith('peaceiris/'));
for (const name of ['Preflight deployment configuration', 'Build custom production', 'Smoke prepared artifacts']) {
  assert.ok(steps.findIndex(step => step.name === name) < firstPublish, `${name} must precede publication`);
```
A missing name gives `findIndex = -1`, and `-1 < firstPublish` passes. `scratchpad/gaps/gate-vacuity.mjs` shows the current test **passes** in three cases: with the smoke step renamed, with the preflight step removed, and with the smoke step moved after publication and renamed. "Build version or dev" and "Build latest" are not gated at all. Yet the `deploy.yml:90` comment says "Both builds and offline checks pass before the first external mutation", and `dual-hosting.md:59` says every prepared artifact is smoke-tested before the first upload.

### Change (exact, `profiles.test.mjs`)

Add this above the test, and replace lines 67-71 with `assertGatesPrecedePublication(workflow); const steps = workflow.jobs.deploy.steps;`. Keep the rest of the test (custom deploy and pinning) unchanged.
```js
const PUBLICATION_GATES = ['Preflight deployment configuration', 'Build version or dev', 'Build latest', 'Build custom production', 'Smoke prepared artifacts'];
const UNCONDITIONAL_GATES = new Set(['Preflight deployment configuration', 'Build version or dev', 'Smoke prepared artifacts']);

/** Each gate must exist exactly once, by exact name, before the first gh-pages push or Wrangler upload. */
function assertGatesPrecedePublication(workflow) {
  const steps = workflow.jobs.deploy.steps;
  const mutations = steps.flatMap((step, index) =>
    step.uses?.startsWith('peaceiris/actions-gh-pages@') || /\bwrangler\b/.test(step.run ?? '') ? [index] : []);
  assert.ok(mutations.length > 0, 'deploy.yml must publish through gh-pages or Wrangler');
  const firstMutation = Math.min(...mutations);
  for (const name of PUBLICATION_GATES) {
    const matches = steps.flatMap((step, index) => step.name === name ? [index] : []);
    assert.equal(matches.length, 1, `deploy.yml must contain exactly one "${name}" step`);
    assert.ok(matches[0] < firstMutation, `${name} must precede publication`);
    if (UNCONDITIONAL_GATES.has(name)) assert.equal(steps[matches[0]].if, undefined, `${name} must always run`);
  }
}
```
Add a self-test that proves the check is not vacuous:
```js
test('publication gate check rejects renamed, removed, moved or conditional gates', () => {
  const workflow = yaml.load(readFileSync('.github/workflows/deploy.yml', 'utf8'));
  const smoke = steps => steps.findIndex(step => step.name === 'Smoke prepared artifacts');
  const variants = [
    steps => { steps[smoke(steps)].name = 'Smoke artifacts'; },
    steps => { steps.splice(steps.findIndex(step => step.name === 'Preflight deployment configuration'), 1); },
    steps => { steps.push(...steps.splice(smoke(steps), 1)); },
    steps => { steps[smoke(steps)].if = "github.ref_type == 'tag'"; },
  ];
  for (const mutate of variants) {
    const copy = structuredClone(workflow);
    mutate(copy.jobs.deploy.steps);
    assert.throws(() => assertGatesPrecedePublication(copy), /exactly one|must precede publication|must always run/);
  }
});
```
`scratchpad/gaps/gate-fixed.mjs`: the real `deploy.yml` passes. All five mutations (rename, remove, move after publish, make conditional, move the custom build after Wrangler) fail with the intended message.

### Validation

`node --test scripts/deployment/profiles.test.mjs`.

### Risks

Renaming a gate step now requires updating `PUBLICATION_GATES` (intended). The `\bwrangler\b` detector is deliberately conservative: a future `wrangler --version` step would count as a mutation.

---

## 6. check-live: bare URL, no retry after readiness

### Verified

- `check-live.mjs:33-44`: the readiness loop calls `fetchVerifiedArtifact` (`artifact-verification.mjs:19-34`). It requests `deployment.json?verify=<sha>` and `?verify=<sha>` for the viewer, with 60 attempts (GitHub) or 18 (others) at 5 s intervals.
- After readiness, nothing is retried:
  - The policy fetches (`:46-52`) use bare URLs.
  - The browser step (`:68-70`) does `page.goto(base.href)` on the **bare** URL, followed by `verifyIndexHtml`.
- In `deploy.yml`, both live checks (`:131-138`) run after both uploads (`:91-130`), so a failure there happens "after both hosts have been published". That part of the claim is correct.

**Surprise: the stale-CDN mechanism is largely refuted, and `?verify=` busts nothing on GitHub.** GitHub Pages serves `Cache-Control: max-age=600` through Fastly, and its cache key **ignores the query string**. A probe on `v0.4.3/favicon.ico` returned:

| Request | Result |
| --- | --- |
| `?q=A` | MISS, Age 0 |
| bare URL | HIT, Age 4 |
| `?q=B` (never requested before) | HIT, Age 7 |

The readiness loop therefore already waits on the same cache object the browser loads. GitHub also purges on deploy. In run 37405147355, `/dev/` turned fresh 50 s after the push, and the bare-URL browser check passed 4 s later. Cloudflare serves HTML as `cf-cache-status: DYNAMIC` (not edge-cached).

The residual risks are:
1. A transient failure in the zero-retry phase fails the run after both uploads. Examples: a network blip, a 5xx, or the 45 s navigation timeout.
2. The code and doc comments imply cache-busting that does not exist on GitHub.

### Change (exact)

- `artifact-verification.mjs` `fetchVerifiedArtifact`. Verify the exact public viewer URL inside the readiness loop, and create a fresh timeout per request:
```js
/** Compare with the trusted local build manifest, rather than trusting a remote SHA claim alone. */
export async function fetchVerifiedArtifact(base, expected, fetchImpl = fetch) {
  // `verify` only labels requests: GitHub Pages' CDN ignores query strings, so freshness there relies on
  // GitHub's deploy-time purge within the caller's retry window.
  const options = () => ({ redirect: 'error', signal: AbortSignal.timeout(10_000), cache: 'no-store' });
  const response = await fetchImpl(new URL(`deployment.json?verify=${expected.sourceSha}`, base), options());
  assert.equal(response.status, 200, 'Deployment metadata must be public HTTP 200.');
  const actual = await response.json();
  for (const name of ['schemaVersion', 'sourceSha', 'version', 'release', 'profile', 'base', 'indexHtmlSha256']) {
    assert.equal(actual[name], expected[name], `Public artifact ${name} differs from the prepared build.`);
  }
  assert.deepEqual(actual.googleDrive, expected.googleDrive);
  const labelled = new URL(base);
  labelled.searchParams.set('verify', expected.sourceSha);
  // Also check the exact URL people open, so the browser phase never starts on a stale entry.
  for (const viewer of [labelled, new URL(base)]) {
    const html = await fetchImpl(viewer, options());
    assert.equal(html.status, 200, 'Viewer HTML must be public HTTP 200.');
    verifyIndexHtml(Buffer.from(await html.arrayBuffer()), expected);
  }
  return actual;
}
```
- `check-live.mjs:46-80`:
  - Move the policy loop and the browser body into `async function verifyPublicPages(browser)`. It creates a new context and closes it in `finally`.
  - Launch Chromium once.
  - Run the function with a bounded retry:
```js
const PUBLIC_PAGE_ATTEMPTS = 3;
const browser = await chromium.launch({ args: ['--enable-webgl', '--use-gl=angle', '--ignore-gpu-blocklist'] });
try {
  for (let attempt = 1; ; attempt++) {
    try { await verifyPublicPages(browser); break; }
    catch (error) {
      if (attempt === PUBLIC_PAGE_ATTEMPTS) throw error;
      console.log(`Public page check failed (${attempt}/${PUBLIC_PAGE_ATTEMPTS}): ${String(error.message).split('\n')[0]}`);
      await delay(15_000);
    }
  }
} finally { await browser.close(); }
```
  - Keep `page.goto(base.href)` on the bare URL; it is now known to be fresh.
- New test in `profiles.test.mjs`:
```js
test('public verification also requires the exact public viewer URL to serve the prepared HTML', async () => {
  const preparedHtml = '<html><script type="module" src="/assets/new-entry-hash.js"></script></html>';
  const expected = { schemaVersion: 1, sourceSha: 'f'.repeat(40), version: '0.15.4', release: 'v0.15.4', profile: 'github', base: '/latest/', googleDrive: { enabled: false, allowedOrigin: null }, indexHtmlSha256: htmlSha256(preparedHtml) };
  let bareHtml = '<html><script type="module" src="/assets/old-entry-hash.js"></script></html>';
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const metadata = url.pathname === '/latest/deployment.json';
    response.writeHead(200, { 'Content-Type': metadata ? 'application/json' : 'text/html' });
    response.end(metadata ? JSON.stringify(expected) : url.searchParams.has('verify') ? preparedHtml : bareHtml);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/latest/`;
    await assert.rejects(fetchVerifiedArtifact(base, expected), /Delivered HTML does not match/);
    bareHtml = preparedHtml;
    assert.deepEqual(await fetchVerifiedArtifact(base, expected), expected);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
```
  Prototyped in `scratchpad/gaps/fetch-verified.mjs`. The existing test at `:100-116` still passes, because its server serves the same HTML for every URL.
- Optional, `docs/dual-hosting.md:63`: after "An old cached release is retried…", add:
  > Readiness includes the exact public viewer URL. GitHub Pages' CDN ignores query strings, so freshness there relies on GitHub's deploy-time purge within the retry window.

### Validation

- `node --test scripts/deployment/profiles.test.mjs`, then `node --check scripts/deployment/check-live.mjs`.
- Optional read-only end-to-end check:
  1. `curl -s https://colmapview.github.io/dev/deployment.json > <scratch>/dev.json`
  2. `DEPLOYMENT_SHA=<its sourceSha> node scripts/deployment/check-live.mjs https://colmapview.github.io/dev/ github --manifest=<scratch>/dev.json`

### Risks

- One extra request per readiness attempt.
- A real, persistent failure now takes up to about 2 × (45 s + 15 s) longer to report, but it still fails.
- Optional: GitHub readiness (60 × 5 s) is shorter than `max-age=600`. It relies on GitHub's purge; raising it is possible but costs job time (`timeout-minutes: 30`).

---

## 7. Preview URL assumes subdomain equals project name

### Verified

- `deploy-preview.yml:106` and `:108` build `https://$PREVIEW_BRANCH.$CLOUDFLARE_PREVIEW_PROJECT.pages.dev/`. Cloudflare assigns a suffixed `*.pages.dev` subdomain when the project name is already taken.
- The current project is unaffected: run 37403513989 printed "Deployment alias URL: https://preview-9129c1d95fb8.colmapview-preview.pages.dev".
- Wrangler 4.147.0 source (`npm pack` into the scratchpad, `wrangler-dist/cli.js`):
  - It honours `WRANGLER_OUTPUT_FILE_PATH` (and `_DIRECTORY`).
  - After a successful or unknown-status deploy, it appends ND-JSON `{type:"pages-deploy-detailed", pages_project, deployment_id, url, alias, environment, …}`.
  - `alias` is the first `.pages.dev` entry of `deployment.aliases`, and may be undefined if status polling failed.
  - On a failed deploy it throws and writes nothing.
  - The same schema is consumed by `cloudflare/wrangler-action` (Context7).

### Change (recommended: derive from Wrangler's output)

- `deploy-preview.yml:101-108`:
```yaml
      - name: Upload preview only
        run: npx --yes wrangler@4.147.0 pages deploy .tmp/deployment/preview --project-name "$CLOUDFLARE_PREVIEW_PROJECT" --branch "$PREVIEW_BRANCH" --commit-hash "$DEPLOYMENT_SHA" --commit-dirty=false
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          npm_config_cache: ${{ runner.temp }}/wrangler-npm-cache
          # Machine-readable result; the project's pages.dev subdomain can differ from its name.
          WRANGLER_OUTPUT_FILE_PATH: ${{ runner.temp }}/wrangler-preview-output.ndjson
      - name: Resolve preview alias
        run: node scripts/deployment/preview-url.mjs "$RUNNER_TEMP/wrangler-preview-output.ndjson"
      - name: Verify public preview
        run: node scripts/deployment/check-live.mjs "$PREVIEW_URL" preview --manifest=.tmp/deployment/preview/deployment.json
      - name: Record preview
        run: echo "Preview verified at $PREVIEW_URL (source SHA $DEPLOYMENT_SHA). Production was not deployed." >> "$GITHUB_STEP_SUMMARY"
```
- `profiles.mjs`: add an export.
```js
/** Return the branch alias URL Wrangler reported for this preview deployment, or fail closed. */
export function previewAliasUrl(ndjson, { project, branch }) {
  const entries = ndjson.split(/\r?\n/).filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  const deployment = entries.findLast(entry => entry?.type === 'pages-deploy-detailed' && entry.pages_project === project);
  if (!deployment) throw new Error(`Wrangler did not report a deployment of ${project}.`);
  if (deployment.environment !== 'preview') throw new Error('The preview upload must create a preview deployment, not production.');
  if (typeof deployment.alias !== 'string' || !deployment.alias) throw new Error('Wrangler did not report the preview branch alias.');
  const alias = new URL(deployment.alias);
  const [label, ...subdomain] = alias.hostname.split('.');
  if (alias.protocol !== 'https:' || label !== branch || subdomain.length !== 3 || subdomain.slice(-2).join('.') !== 'pages.dev'
    || alias.port || alias.username || alias.password || alias.search || alias.hash || alias.pathname !== '/') {
    throw new Error('Wrangler reported an unexpected preview alias URL.');
  }
  return `https://${alias.hostname}/`;
}
```
- New `scripts/deployment/preview-url.mjs`:
```js
import { appendFileSync, readFileSync } from 'node:fs';
import { previewAliasUrl } from './profiles.mjs';

const url = previewAliasUrl(readFileSync(process.argv[2], 'utf8'), {
  project: process.env.CLOUDFLARE_PREVIEW_PROJECT,
  branch: process.env.PREVIEW_BRANCH,
});
appendFileSync(process.env.GITHUB_ENV, `PREVIEW_URL=${url}\n`);
console.log(`Preview alias: ${url}`);
```
  The value is rebuilt from a parsed hostname, so it cannot inject newlines into `GITHUB_ENV`.
- Test in `profiles.test.mjs` (import `previewAliasUrl`):
```js
test('preview verification uses the branch alias Wrangler reports instead of assuming the project subdomain', () => {
  const entry = { type: 'pages-deploy-detailed', version: 1, pages_project: 'colmapview-preview', deployment_id: 'id', url: 'https://21fd00ac.colmapview-preview-4xk.pages.dev', alias: 'https://preview-9129c1d95fb8.colmapview-preview-4xk.pages.dev', environment: 'preview' };
  const output = (overrides = {}) => [{ type: 'wrangler-session', version: 1 }, { type: 'pages-deploy', version: 1, pages_project: 'colmapview-preview' }, { ...entry, ...overrides }].map(line => JSON.stringify(line)).join('\n');
  const options = { project: 'colmapview-preview', branch: 'preview-9129c1d95fb8' };
  assert.equal(previewAliasUrl(output(), options), 'https://preview-9129c1d95fb8.colmapview-preview-4xk.pages.dev/');
  assert.throws(() => previewAliasUrl(output({ environment: 'production' }), options), /not production/);
  assert.throws(() => previewAliasUrl(output({ alias: undefined }), options), /branch alias/);
  for (const alias of ['https://preview-000000000000.colmapview-preview.pages.dev', 'https://preview-9129c1d95fb8.attacker.example', 'https://preview-9129c1d95fb8.colmapview-preview.pages.dev/path?x=1']) {
    assert.throws(() => previewAliasUrl(output({ alias }), options), /unexpected/);
  }
  assert.throws(() => previewAliasUrl(output({ pages_project: 'colmapview-opsiclear' }), options), /did not report/);
  const publish = yaml.load(readFileSync('.github/workflows/deploy-preview.yml', 'utf8')).jobs.publish;
  assert.ok(!JSON.stringify(publish).includes('$CLOUDFLARE_PREVIEW_PROJECT.pages.dev'));
  assert.equal(publish.steps.find(step => step.name === 'Upload preview only').env.WRANGLER_OUTPUT_FILE_PATH, '${{ runner.temp }}/wrangler-preview-output.ndjson');
});
```
  Prototyped in `scratchpad/gaps/preview-alias.mjs`; all cases pass.
- Alternative: a configured variable `CLOUDFLARE_PREVIEW_SUBDOMAIN` (for example `colmapview-preview.pages.dev`), validated in `validatePreviewConfiguration` with `/^[a-z0-9-]+\.pages\.dev$/`, giving the URL `https://$PREVIEW_BRANCH.$CLOUDFLARE_PREVIEW_SUBDOMAIN/`. It is simpler, but it must be kept in sync by hand and loses the `environment === 'preview'` guard.
- Optional doc addition, `docs/dual-hosting.md:61`, after "…disables all provider configuration":
  > Its public check uses the branch alias URL that Wrangler reports for that deployment.

### Validation

`node --test scripts/deployment/profiles.test.mjs`. Then run one manual preview: the "Resolve preview alias" log must match Wrangler's "Deployment alias URL".

### Risks

- The approach depends on Wrangler's v1 output schema. A Wrangler bump could drift it, and only a real preview run would catch that.
- An undefined alias (status polling failed) fails verification after the upload. That is the same failure mode as a wrong URL today, and it fails closed.

---

## Recommended task grouping

1. **T1 Security (C5)**: do this first; it is small.
   - Files: `deploy-preview.yml` (build `setup-node`; "Upload preview only" env), `deploy.yml` ("Deploy custom production" env), the `profiles.test.mjs` token test, and `dual-hosting.md:47`.
   - Validate with `node --test scripts/deployment/profiles.test.mjs`, then post-merge preview and tag log checks.
   - Optional owner action: `gh cache delete --all`.
2. **T2 HF-DEV**.
   - Files: `deploy.yml:41-45`, the `profiles.test.mjs` contract test and profile assertions, and the docs (`dual-hosting.md`, `hugging-face-loading.md`, `hugging-face-publishing.md`).
   - Optional: `validateGithubHfConfiguration` plus the preflight summary.
   - Validate with `npm run test:deployment`, `npm run lint`, and the full `npm run test:run` before pushing. After the main push, check the deploy env dump and the 🤗 button on `/dev/`.
3. **T3 C4 privacy**: independent, so it can run in parallel with T1, T2 and T4.
   - Files: `public/privacy.html` (date, summary bullet, section 7, the "Clear this browser" bullet), plus the optional guard test.
   - **Follow with a tag release** so the custom `/privacy` (the Google Branding URL) and `/latest/` carry it.
   - Owner decision on the GA4 property (retention, redaction, deletion).
4. **T4 CI hygiene** (low priority). It can be split into:
   - **T4a**: smoke-report path (`playwright.config.ts`, the 4 upload paths, the contract test) and the gate-order test.
   - **T4b**: `check-live` readiness and retry (`artifact-verification.mjs`, `check-live.mjs`, test) and the preview alias (`profiles.mjs`, new `preview-url.mjs`, `deploy-preview.yml`, test).

**Conflicts:** T1, T2 and T4 all edit `profiles.test.mjs` and the workflows. T1 and T4b both edit the `Upload preview only` env block. Run them in order T1 → T2 → T4, or give them to one implementer. T3 touches only `public/privacy.html` and, optionally, one test.
