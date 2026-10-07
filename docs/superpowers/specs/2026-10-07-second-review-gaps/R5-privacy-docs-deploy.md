# R5: privacy, docs and deploy (G8, E3, E7, E8, E9)

**Base.** Branch `fix/second-review-gaps` at `e8a2a43`. Line numbers are at that commit.

**Scratch.** All validation ran in `scratchpad/rev3/r5/`, a copy of `src/`, `public/`, `docs/`, `README.md`, `.github/workflows/`, `scripts/deployment/` and the config files, with a junction to the repository's `node_modules` (removed afterwards). The scratch copy has its own git baseline, so `git diff` there shows exactly the changes below. Repro tests that are not proposed for the repository are marked as such.

| Finding | Status | Implementer / reviewer effort |
| --- | --- | --- |
| G8 privacy policy misstates provider data flows | Confirmed and reproduced | low / medium |
| E3 a later push cancels a waiting tag deploy | Confirmed (GitHub semantics, run history) | low / medium |
| E7 OAuth demo script names a button that doesn't exist | Confirmed; scenes 4 and 9 are also impossible as written | low / low |
| E8 project `CLAUDE.md` release section is stale | Confirmed; also found a `--tags` hazard | low (owner edit) |
| E9 wrong custom-host callback path in the HF publishing doc | Confirmed | low / low |

No decision changes. None of these items touches the deliberate load, cancel, Reload or restore decisions.

---

## G8. The privacy policy misstates provider data flows

### Verified

**Hugging Face (privacy.html:79–80, about.html:59, README.md:43).**
- `privacy.html:79` says "For private datasets, you choose to authorize repository read access", and `:80` says "Publishing requests additional permission".
- The code says otherwise:
  - The Load Dataset account dialog signs in with `getHfAccountConfiguration()` (`DatasetAccountButtons.tsx:37`, `:206-207`).
  - `resolveHfAccountConfiguration` returns the publishing configuration, with no `readOnly`, whenever `VITE_HF_PUBLISH_ENABLED === 'true'` (`config.ts:14-15`; pinned by `config.test.ts:19`).
  - `connect` then requests `HF_SCOPES = 'openid profile read-repos contribute-repos'` (`auth.ts:10-11`, `:133`).
  - `exchangeOAuthCode` rejects a non-read-only session without `contribute-repos` (`auth.ts:49`; pinned by `auth.test.ts` "requires repository read permission…").
- In-app text already discloses this. The account dialog hint reads "Allows reading private repositories and creating datasets with this app." (`DatasetAccountButtons.tsx:56`). The publishing dialog reads "Sign-in lets ColmapView read private repositories and create datasets." (`PublishDatasetModal.tsx:94`). Only the static pages understate it.
- Every hosted channel is publish-enabled today. The repository variables on 2026-10-07 are `HF_PUBLISH_ENABLED=true`, `HF_DEV_PUBLISH_ENABLED=true` and `CUSTOM_HF_PUBLISH_ENABLED=true`, with `HF_AUTH_ENABLED` and `HF_DEV_AUTH_ENABLED` unset. So in practice every sign-in on every hosted viewer asks for `contribute-repos`, the custom host included. The finding named only `/latest/` and `/dev/`.
- Scratch repro `src/components/dropzone/g8LoadingScopes.repro.test.tsx` (not for the repo) passes:
  - It stubs a publish-enabled build, opens the 🤗 account dialog and clicks **Sign in with Hugging Face**.
  - It asserts that `oauthLoginUrl` received `scopes === HF_SCOPES === 'openid profile read-repos contribute-repos'`.

**Drive publication (privacy.html:73).**
- The paragraph says only that the publisher uploads, verifies and optionally shares a ZIP.
- The code also does the following:
  - It reads the account's Drive permission ID with `GET /drive/v3/about?fields=user(permissionId)` (`upload.ts:123-127`) and binds retries to it (`publishDataset.ts:76-80`).
  - It writes an app-private marker, `appProperties: { colmapviewOperation: <random UUID> }`, on the created file (`upload.ts:136-144`).
  - It reads the file back, including `md5Checksum`, `appProperties` and `permissions`, and checks it (`upload.ts:24`, `publishDataset.ts:58-70`).
- The verification packet already discloses all of this (`docs/google-oauth-verification.md:102`, `:127`), so the public policy is behind the packet.

### Root cause
The policy text was written for the original split, where read-only viewing asked for `read-repos` and publishing added `contribute-repos`. Publish-enabled builds later merged both into one sign-in (`resolveHfAccountConfiguration`), but only the in-app hints and the packet were updated. The Drive paragraph summarised publication and never listed the account-identifier read or the marker write.

### Fix
Change only the paragraphs below. Do **not** change the effective date (`privacy.html:29`). Bumping it is the owner's release item; see "Owner items". The page title, `h1`, navigation and section structure stay as they are.

**`public/privacy.html` line 73.** Replace the whole paragraph with:
```html
            <p>For publication, ColmapView requests the same <code>drive.file</code> permission in a separate local session. The current publisher uses it to read your Drive account's permission ID, an identifier Google uses for your account in file permissions, and keeps that ID in the tab's memory so a retry continues in the same account. It then uploads a new dataset ZIP, labels that file with a random publication marker in its app-private metadata (<code>appProperties</code>) so a retry can recognize its own upload, and reads the file's metadata, including its size, checksum, marker, and sharing permissions, to verify it. The marker stays with the file in your Drive. Only if you select link sharing does the publisher create a permission allowing anyone with the link to read that uploaded file. The app does not request <code>drive.readonly</code> or full-Drive read/write access.</p>
```

**`public/privacy.html` lines 79–80.** Replace both paragraphs. Line 81, the callback paragraph, is unchanged.
```html
            <p>Public dataset links can be opened without signing in. To open a private dataset, you choose to sign in with Hugging Face. Where publishing is enabled, every Hugging Face sign-in, including one started on the dataset-loading page only to open a private dataset, requests both repository read access (<code>read-repos</code>) and permission to create repositories and write to the ones the app creates (<code>contribute-repos</code>), and the viewer does not connect unless both are granted. A viewer configured only for private viewing requests repository read access alone. Before you sign in, the Hugging Face account control and the publishing dialog state which access the viewer requests. Hugging Face returns a short-lived access token and account profile information; ColmapView uses your username to identify the connected account and the token to retrieve permitted repository metadata, listings, reconstruction files, images, masks, and other referenced assets.</p>
            <p>Publishing uses the <code>contribute-repos</code> permission and the connected username to create a new dataset under your account. Where publishing is enabled, the same connection serves loading and publishing, but connecting never starts a publication; you start one explicitly in the publishing dialog. Passwords are entered with Hugging Face. Tokens and connected account state stay in the current tab's memory rather than persistent app storage.</p>
```
Each claim maps to code:
- **Scopes per build.** `config.ts:14-17`, `auth.ts:10-11`, `:133`.
- **"Does not connect unless both are granted".** `auth.ts:48-49`.
- **Dialog disclosure.** `DatasetAccountButtons.tsx:53-57`, `PublishDatasetModal.tsx:93-95`.
- **One shared connection.** The `hfAuth` singleton serves both dialogs, and `getAccessToken` publishes only when `canPublish` is set (`auth.ts:103-110`).
- **`contribute-repos` meaning.** Hugging Face's OAuth docs: "Create repositories and access those created by this app. Cannot access any other repositories unless additional permissions are granted."

The wording deliberately says "where publishing is enabled" rather than naming hosts. The publish flags are repository variables, and `/dev/` and older versioned builds differ from `/latest/` over time. The dialog sentence gives users the per-viewer answer. If the owner prefers to name hosts, append ", currently every hosted ColmapView viewer," after "Where publishing is enabled". That is true on 2026-10-07 per the variables above, but must then be kept in step with them.

**`public/about.html` line 59.** Replace with:
```html
          <p>Google Drive uses per-file access for archives you select through Google's file picker and dataset ZIPs created by the app. Pasting a private link alone does not grant access. Hugging Face read access lets the viewer download private repository files. Where publishing is enabled, every Hugging Face sign-in, including one only to open a private dataset, also requests permission to create repositories and write to the ones the app creates.</p>
```

**`README.md` line 43.** Replace with:
```markdown
- **Private Hugging Face datasets** - Connect with the 🤗 account icon, approve the requested access, and paste a dataset, folder, manifest, or archive link. Sign-in asks for repository read access; where Hugging Face publishing is enabled, it also asks for permission to create datasets and write to the ones ColmapView creates. Images and masks load with the same session. See [Hugging Face setup](docs/hugging-face-loading.md).
```

**`docs/google-oauth-verification.md` line 130.** Keeps the packet consistent with the policy. Its old text, "uses `openid profile read-repos` for private reading and adds `contribute-repos` for publishing", has the same understatement. Replace the row with:
```markdown
| Hugging Face | Separate OAuth with PKCE. Where publishing is enabled, every sign-in, including private reading from the loading dialog, requests `openid profile read-repos contribute-repos` and is refused without `contribute-repos`; a build configured only for private reading requests `openid profile read-repos`. The app retains its username and token in tab memory. Private repository content may download with the authorized session. Current publishing creates a **public** repository and uploads dataset files, preview, and a dataset card; files can become public before the upload finishes. |
```
The packet's Drive rows (`:102`, `:127`) already match the new policy paragraph, so they are unchanged.

**`docs/hugging-face-loading.md` line 6.** This is the same understatement in user steps. It overlaps R4 (G14 edits lines 15–17 of this file); see "Cross-area notes". Replace with:
```markdown
2. Select **Sign in with Hugging Face** and approve the requested access: repository read access and, where publishing is enabled, permission to create datasets and write to the ones ColmapView creates. For an organization-owned dataset, also authorize that organization; your account must already be allowed to read the repo.
```

**Not changed.**
- `privacy.html` "At a glance" ("Account access is optional and requested for private access or publishing") is still accurate.
- `terms.html` makes no scope claim.
- `docs/hugging-face-publishing.md:65` and `:107` already state the publish-build scopes correctly.

### Deploy smoke tests
No assertion needs updating. The checks that read these pages, and why they still pass:
- `scripts/deployment/tests/artifacts.spec.ts:117-125`, for `about.html`, `privacy.html` and `terms.html`:
  - HTTP 200, plus `cache-control` on non-GitHub profiles;
  - a visible `h1`;
  - every **Main navigation** link is same-origin, and one equals the viewer URL.
- `scripts/deployment/check-live.mjs:55-60`: a same-host HTTP 200, then `verifyPolicyHtml` (`artifact-verification.mjs:122-125`), which requires `<title>Privacy policy · ColmapView</title>` and `<title>About ColmapView</title>`.
- `profiles.test.mjs:364-367` unit-tests `verifyPolicyHtml` only.

The edits change paragraph text only. Validated in scratch:
- `check-policy-pages.mjs` (parse5 against `HEAD`) found no WHATWG parse errors. Title, `h1`, navigation links and the effective `<time>` are identical. `verifyPolicyHtml` accepts both pages. The changed lines are exactly privacy.html 73, 79, 80 and about.html 59.
- `smoke-policy.mjs` repeats the artifacts.spec.ts policy checks with Playwright against the edited `public/` served by `static-server.mjs`. about, privacy and terms all pass (status 200, `h1` visible, four same-origin navigation links including the viewer).

### Tests (code)
New file `src/features/privacyPolicyContract.test.ts`. It ties the policy to the scope constants, so a future scope change fails until the policy names it.
```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GOOGLE_DRIVE_PUBLISH_SCOPE, GOOGLE_DRIVE_READ_SCOPE } from './googleDrive/auth';
import { HF_SCOPES } from './huggingface/auth';

/** Visible text only: a scope named in markup or a comment is not a disclosure. */
function privacyPolicyText(): string {
  return readFileSync(resolve('public/privacy.html'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

describe('privacy policy discloses the provider access the code requests', () => {
  it('names every Hugging Face repository scope, which publishing builds request at every sign-in', () => {
    const policy = privacyPolicyText();
    const repositoryScopes = HF_SCOPES.split(' ').filter(scope => scope.endsWith('-repos'));
    expect(repositoryScopes.length).toBeGreaterThan(0);
    for (const scope of repositoryScopes) expect(policy.includes(scope), `privacy.html must name ${scope}`).toBe(true);
  });

  it('names the Drive scope, the account identifier publication reads and the file marker it writes', () => {
    const policy = privacyPolicyText();
    const driveScopes = new Set([GOOGLE_DRIVE_READ_SCOPE, GOOGLE_DRIVE_PUBLISH_SCOPE].map(scope => scope.split('/').at(-1)!));
    // upload.ts owner() reads about?fields=user(permissionId); start() writes the operation marker.
    for (const term of [...driveScopes, 'permission ID', 'appProperties']) {
      expect(policy.includes(term), `privacy.html must name ${term}`).toBe(true);
    }
  });
});
```
- **RED at e8a2a43.** `npx vitest run src/features/privacyPolicyContract.test.ts` gives 2 failed: `privacy.html must name read-repos: expected false to be true` and `privacy.html must name permission ID: expected false to be true`.
- **GREEN after the fix.** 2 passed. Run with `src/features/huggingface/auth.test.ts`, 17/17 passed.
- ESLint is clean. The file type-checks under `tsconfig.test.json`. The only errors in the partial scratch copy were the missing `tests/colmapFixturePaths`, which is unrelated.

### Risks and interactions
- **R3 / E5.** That fix may edit `public/privacy.html` section 2 (line 66), and E1 may edit `README.md` (the Drive publishing bullet, line 36). Those are different paragraphs and lines, but the same files, so sequence the tasks; see "Cross-area notes".
- **R4 / G14.** That fix edits `docs/hugging-face-loading.md:15-17`; this fix edits line 6. If R4 changes the account-dialog hint strings, the sentence "the Hugging Face account control and the publishing dialog state which access the viewer requests" must stay true.
- **Scope changes.** The contract test imports the scope constants. A future scope change (for example `write-repos`) fails the test until the policy names the scope. That is intended.
- The effective date stays as it is. Releasing this text without bumping it is an owner decision; see "Owner items".

### Effort
- **Implementer: low.** The exact text and test are given.
- **Reviewer: medium.** Each policy claim must be checked against `config.ts`/`auth.ts`/`upload.ts` and the packet.

---

## E3. A waiting tag deploy can be cancelled by a later push to `main`

### Verified
- `deploy.yml:12-14` sets `group: pages-deploy` and `cancel-in-progress: false`, with no `queue`.
- GitHub's workflow syntax reference: "By default, any existing `pending` job or workflow in the same concurrency group will be canceled and the new queued job or workflow will take its place." The default `queue: single` allows "at most one" pending run.
- So while any deploy runs:
  - a pushed tag waits as the single pending run;
  - the next push to `main` cancels it ("higher priority waiting request").
- The old comment "cancel-in-progress: false means both still run — they just take turns" (added in `0179059`) was wrong. `5af7c3a` deleted the comment but kept the behaviour.
- **Only tag runs update `/latest/`, the root redirect and the custom host.** `deploy.yml:66-78` makes any tag a release. `preflight.mjs:5-8` with `profiles.mjs:45-53` sets `custom_enabled` only for tags with `CLOUDFLARE_PAGES_ENABLED=true`, which is the live value since 2026-10-06. `deploy.yml:129-132` is the only Cloudflare production upload. A cancelled tag therefore leaves `colmapview.opsiclear.com` on the previous release. Nothing reruns it.
- **The window is real.** In run history (`gh run list --workflow deploy.yml`), every release pushed `main` and the tag together, and the tag waited behind the `main` run:
  - v0.15.4: main 05:00:38–05:07:04, tag finished 05:13:19;
  - v0.15.3: main 13:39:04–13:45:15, tag finished 13:51:04.

  A further push to `main` during those ~6 minutes would have cancelled the tag.
- **The window is now longer.** Main runs on the new workflow take about 7.7 min (three runs on 2026-10-06). A tag run now does even more:
  - `npm ci`;
  - a Playwright install;
  - three builds;
  - a three-profile browser smoke;
  - three gh-pages pushes and a Wrangler upload;
  - two live checks, the GitHub one allowing up to 60 × 5 s for Pages readiness (`check-live.mjs:32`).

### Root cause
One concurrency group with GitHub's default single pending slot. The group was chosen to serialize gh-pages pushes, but the default makes "serialize" mean "keep only the newest waiting run", and tag and main runs share it.

### Options considered
- **A, recommended: `queue: max` on the existing workflow-level group.** GitHub changelog 2026-05-07, "GitHub Actions concurrency groups now allow larger queues": up to 100 pending runs, processed FIFO by the time each started waiting. Nothing is cancelled. Tag and main runs still take turns on gh-pages, and tags deploy the custom host in push order. One line. Cost: a burst of `main` pushes now deploys `/dev/` once per push instead of coalescing. That is harmless (the final state is the newest commit) but uses more runner time. GitHub forbids `queue: max` together with `cancel-in-progress: true`; that is not the case here.
- **B: per-ref workflow groups plus a job-level `pages-publish` group with `queue: max` on the `deploy` job.** This keeps main coalescing and validates tags in parallel. But two tags then validate in parallel and publish in validation-finish order, which can leave `/latest/` and the custom host on the older tag. More moving parts. Rejected.
- **C: separate groups for tags and `main`.** Tag and main runs would push gh-pages concurrently, which is the race `0179059` fixed. Rejected.
- **D: `cancel-in-progress: ${{ github.ref_type != 'tag' }}`.** It is evaluated for the arriving run, so a main push would cancel an in-progress *tag* run, and it does not touch the pending-slot replacement. Rejected.

### Fix
`.github/workflows/deploy.yml`:
```diff
 concurrency:
   group: pages-deploy
   cancel-in-progress: false
+  # Wait in line. With the default single pending slot, a later push cancels a waiting tag deploy.
+  queue: max
```
`docs/dual-hosting.md` line 62 ("Release and preview behavior") gains one sentence at the end of the paragraph:
```diff
-… It then deploys GitHub and the existing Cloudflare Pages project, attaching the release's source SHA to the Cloudflare deployment.
+… It then deploys GitHub and the existing Cloudflare Pages project, attaching the release's source SHA to the Cloudflare deployment. Deploy runs wait in one queue (`pages-deploy`, `queue: max`), so a tag pushed during another deploy runs after it instead of being cancelled by a later push to `main`.
```
`e2e.yml` is unchanged. Its per-ref `cancel-in-progress: true` group (`:23-27`) is now pinned by the test below.

### Tests (code)
In `scripts/deployment/profiles.test.mjs`, insert after the "publication gate check rejects …" test (after line 142):
```js
/**
 * Deploy runs wait in one queue. By default GitHub keeps one pending run per group and cancels it when another
 * arrives, so a later push to main could drop a waiting tag deploy: the only run that updates the custom host.
 */
function assertDeployRunsQueue(workflow, validation) {
  const { concurrency } = workflow;
  assert.ok(concurrency !== null && typeof concurrency === 'object', 'deploy.yml must declare concurrency as a mapping with queue: max');
  assert.equal(concurrency.group, 'pages-deploy', 'every deploy.yml run must share the pages-deploy group so gh-pages pushes take turns');
  assert.equal(concurrency.queue, 'max', 'deploy.yml runs must wait in line (queue: max) so a later push never cancels a waiting deploy');
  assert.ok([undefined, false].includes(concurrency['cancel-in-progress']), 'deploy.yml must never cancel a deploy in progress');
  for (const [name, job] of Object.entries(workflow.jobs)) {
    assert.equal(job.concurrency, undefined, `deploy.yml job ${name} must not add a concurrency group with its own single pending slot`);
  }
  // Every deploy run calls the validation workflow, which may cancel only an older run of the same ref.
  const inner = validation.concurrency;
  if (inner !== null && typeof inner === 'object' && ![undefined, false].includes(inner['cancel-in-progress'])) {
    assert.match(String(inner.group), /\$\{\{\s*github\.ref\s*\}\}/, 'e2e.yml may cancel in progress only within one ref');
  }
}

test('deploy runs queue in one group, so no later push cancels a waiting tag deploy', () => {
  const workflow = yaml.load(readFileSync('.github/workflows/deploy.yml', 'utf8'));
  const validation = yaml.load(readFileSync('.github/workflows/e2e.yml', 'utf8'));
  assertDeployRunsQueue(workflow, validation);
  const variants = [
    [deploy => { delete deploy.concurrency.queue; }, /queue: max/],
    [deploy => { deploy.concurrency.queue = 'single'; }, /queue: max/],
    [deploy => { deploy.concurrency = 'pages-deploy'; }, /mapping/],
    [deploy => { deploy.concurrency.group = 'pages-deploy-${{ github.ref }}'; }, /share the pages-deploy group/],
    [deploy => { deploy.concurrency['cancel-in-progress'] = true; }, /never cancel/],
    [deploy => { deploy.concurrency['cancel-in-progress'] = "${{ github.ref_type != 'tag' }}"; }, /never cancel/],
    [deploy => { deploy.jobs.deploy.concurrency = { group: 'pages-publish' }; }, /job deploy must not add/],
    [(deploy, e2e) => { e2e.concurrency.group = 'validation-${{ github.workflow }}'; }, /within one ref/],
  ];
  for (const [mutate, error] of variants) {
    const deploy = structuredClone(workflow);
    const e2e = structuredClone(validation);
    mutate(deploy, e2e);
    assert.throws(() => assertDeployRunsQueue(deploy, e2e), error);
  }
});
```
Each mutation is a regression that would bring the cancellation back:
- dropping `queue` or setting it to `single`;
- the string shorthand `concurrency: pages-deploy`;
- per-ref groups, which also reintroduce the gh-pages race;
- `cancel-in-progress` set to `true` or to an expression;
- a job-level single-slot group;
- an `e2e.yml` group that no longer includes the ref, which would let a PR's or another ref's validation cancel a tag's in-progress validation and skip its `deploy` job.

Results:
- **RED at e8a2a43.** `node --test --test-name-pattern="deploy runs queue" scripts/deployment/profiles.test.mjs` fails with `deploy.yml runs must wait in line (queue: max) so a later push never cancels a waiting deploy`, `undefined !== 'max'`.
- **GREEN after the fix.** The test passes. The full `node --test scripts/deployment/profiles.test.mjs` passes 19/19. ESLint is clean.

### Risks and interactions
- **`queue: max` is recent (GitHub changelog 2026-05-07).** A host that rejected the key would fail workflow validation, and nothing would deploy. After merge, confirm the next `main` push starts a "Deploy viewer hosts" run with no "Invalid workflow file" annotation. `actionlint` is not in CI and may not know the key yet.
- **FIFO is by when each run started waiting**, and GitHub states ordering "is not guaranteed" for near-simultaneous runs. Two release tags in one push can therefore deploy in either order, and the older one can end up on `/latest/` and the custom host. E8 tells the owner to push one tag at a time. A "newest tag only" guard in `deploy.yml` would also cover this. It is not proposed: old tags run their own old workflow, so the guard could not stop them, and it would block deliberate redeploys.
- Runs triggered from old tags (for example `v0.10.0` or `v0.11.0` if pushed) use their old `deploy.yml` without `queue`. See E8.
- `deploy-preview.yml` (`cloudflare-viewer-preview`, manual) keeps the single pending slot. A second dispatched preview replaces a pending one. That is low stakes and left unchanged.
- E8's queue bullet depends on this change.

### Effort
- **Implementer: low.** One YAML key, one doc sentence and the given test.
- **Reviewer: medium.** The GitHub concurrency semantics cannot be exercised locally; check them against the docs and the run history above.

---

## E7. The OAuth demo script tells the operator to click a button that doesn't exist

### Verified
- **Scene 3 (`docs/oauth-review-demo-script.md:51`) says "Click Sign in with Google."**
  - The Load Dataset **Google Drive** dialog has only these controls (`DatasetAccountButtons.tsx:181-195`):
    - **Disconnect**, **Cancel sign-in** or **Cancel selection**;
    - **Load URL**;
    - **Choose archive from Drive**, which reads **Loading sign-in…** until the GIS SDK loads, or **Retry sign-in** after an SDK error.
  - While signed out, **Choose archive from Drive** itself starts Google sign-in, then opens Picker (`chooseArchive`, `:102-123`). This is pinned by `DatasetAccountButtons.test.tsx` "signs in on Choose archive and automatically loads the selected … URL".
  - "Sign in with Google" exists only as the `aria-label` of the *publisher's* **Sign in** button (`GoogleDrivePublishModal.tsx:59-60`), and scene 5 already uses that correctly.
- **Scenes 4 and 9 (`:52`, `:57`) are also impossible as written.**
  - Scene 4 says "Separately reopen Picker and cancel to show the current scene stays intact".
  - Scene 9 says "disconnect the Drive loading account. Show that a loaded scene can remain visible".
  - `DatasetAccountButtons` is rendered only by the Load Dataset panels (`DropZonePanels.tsx:140`, `:261`), and `DropZone.tsx:231` and `:247` mount those panels only when `!reconstruction`. With a scene open there is no Picker entry point and no loading-session **Disconnect**.
  - Scratch repro `src/components/dropzone/e7LoadedScene.repro.test.tsx` (not for the repo) passes for desktop and touch: the panel renders with no reconstruction and is absent with one.
- The other named controls exist:
  - **Choose archive from Drive**, **Loading sign-in…**, **Waiting for sign-in…**, **Connected**, **Disconnect** and **Load URL** (`DatasetAccountButtons.tsx`);
  - **Sign in** and **Sign out**, **Anyone with the link can view**, **Save private dataset** and **Publish shared dataset** (`GoogleDrivePublishModal.tsx:58-60`, `:73`, `:117`);
  - **Publish public dataset** (`PublishDatasetModal.tsx:183`);
  - the version badge, which opens Help → About (`StatusBar.tsx:138-146`).

### Root cause
The script was written against an earlier account dialog that had a separate sign-in button. It also assumed the account controls stay reachable after a load.

### Fix
In `docs/oauth-review-demo-script.md`, replace the "Actions to record" cell of scenes 3, 4 and 9. The narration cells are unchanged. Exact replacement rows:
```markdown
| 3. Per-file consent | In Load Dataset, open the Google Drive account icon beside Upload configuration. The Google Drive dialog has no separate sign-in button: while signed out, **Choose archive from Drive** starts Google sign-in. It reads **Loading sign-in…** until Google's script is ready, and the dialog shows **Waiting for sign-in…** while the popup is open. Click it. Show account selection, the complete English consent screen requesting files used with this app, and any genuine testing warning. Pause with the app name and client ID visible in the real popup. Let the operator approve; Google Picker opens next. | “Private archive loading requests drive.file. ZIP and TAR use this same permission for files selected for ColmapView or created by it. The app does not request broad read-only access to the account's Drive.” |
| 4. Pick, read, and inspect | Show the real Google Picker that opened after approval. Cancel it first: the Google Drive dialog returns showing **Connected**, and nothing loads. The account controls are only in Load Dataset, which is hidden while a scene is open, so show cancellation before the first load. Click **Choose archive from Drive** again, select the disposable private ZIP, and it loads. Orbit the scene and inspect a camera/image. To demonstrate TAR too, reload the tab, open the Google Drive account icon, click **Choose archive from Drive** (Google shows account selection again and reuses the existing grant), and select a synthetic TAR or compressed TAR fixture containing the same authorized data. | “Selecting this archive authorizes it for the app. Google sends its metadata and bytes directly to this browser. The viewer parses and displays cameras, points, and images. Cancelling Picker starts no load. A private pasted URL alone does not grant this authorization.” |
| 9. Disconnect and boundaries | In the loaded scene, open Publish to Google Drive and click **Sign out**; the scene stays visible. The Drive loading session has no control while a scene is open, so reload the tab, which ends both in-memory sessions; the Google Drive dialog in Load Dataset is signed out again. Click **Choose archive from Drive**, sign in, and cancel Picker. Click **Load URL** and paste the sharing URL of a different pre-existing private ZIP: the load is refused with a prompt to choose that archive in the Drive picker. Then open the Google Drive account icon and click **Disconnect**. | “These controls forget local access tokens. They do not revoke the Google account grant or delete already uploaded files. Closing or reloading the tab clears the viewer's in-memory sessions and transfer state. Files already authorized for the app can remain eligible after reconnecting; a new private file needs selection.” |
```
Supporting facts:
- **"Connected" after a Picker cancel.** `DatasetAccountButtons.tsx:95-99` and `:165-169`; pinned by "returns to the account dialog after picker cancellation without loading anything".
- **Account selection again.** `requestAccessToken({ prompt: 'select_account' })` (`googleDrive/auth.ts:135`).
- **Refused pasted private URL.** `api.ts` maps an authenticated 403/404 to "Choose this archive in the Drive picker to grant file access…".

### Tests
None in the repository; this is a docs-only change. Verify with:
- `rg -n "Sign in with Google" docs/oauth-review-demo-script.md` returns no match.
- `rg -n "Choose archive from Drive|Loading sign-in…|Waiting for sign-in…|'Disconnect'|Load URL" src/components/dropzone/DatasetAccountButtons.tsx` finds every label the rows use.

### Risks and interactions
- **R3 / E15** (dead Drive mode without an API key) may edit `DatasetAccountButtons.tsx`. If it renames **Load URL**, **Choose archive from Drive** or the **Connected** status, update these rows in the same task.
- The scene order changes: cancel before the first load, and reload for TAR and Disconnect. The owner should re-rehearse before any recording.

### Effort
- **Implementer: low.** It is a text replacement.
- **Reviewer: low.** Check the labels against the listed lines.

---

## E8. The project `CLAUDE.md` release section is stale (owner-approved edit)

**This file is outside the repository: `C:\Users\HEQ\Projects\colmap_webview\CLAUDE.md`.** It holds the user's project instructions. The text below is a draft for the owner to apply or approve. No agent or implementer may edit that file without the owner's explicit approval.

### Verified
- **`CLAUDE.md:131-139` is wrong about tags.** It says `v0.4.1-beta` deploys only `/v0.4.1-beta/ + /latest/` and never mentions the custom host. In fact every tag that matches `^v[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$`, `-beta` included, is a release (`deploy.yml:66-73`): it builds and pushes `/vX/`, `/latest/` and the root redirect, and, while `CLOUDFLARE_PAGES_ENABLED=true` (live since 2026-10-06), the custom production host (`deploy.yml:86-88`, `:129-132`; `profiles.mjs:45-53`).
- **`CLAUDE.md:128` says `git push origin main --tags`.** This clone has two tags that are not on the remote: `v0.10.0` and `v0.11.0` (`comm` of `git tag` against `git ls-remote --tags origin`). Both tagged commits carry the old `deploy.yml`, which deploys their builds to `/latest/` and the root redirect. Following the documented command would push them, and in either order they could overwrite `/latest/` with a months-old build.

### Fix
Replace `CLAUDE.md` lines 100–141 (`## Release Process` through the `keep_files` bullet; `### Asset Paths` and everything after it stay unchanged) with:
````markdown
## Release Process

Releases deploy to two independent hosts. GitHub Pages keeps each release at its own URL path. The custom production host (Cloudflare Pages, the only host with Google Drive) serves just the most recent release tag.

### URL Structure
```
https://colmapview.github.io/           → Redirects to /latest/
https://colmapview.github.io/latest/    → Most recently deployed release tag
https://colmapview.github.io/v0.3.2/    → Specific version (preserved forever)
https://colmapview.github.io/dev/       → Latest main branch build
https://colmapview.opsiclear.com/       → Custom production host: most recently deployed release tag
```

### Creating a Release

1. **Update version in `package.json`** (the tag is `v` plus this version)
   ```bash
   # Edit package.json version field
   ```

2. **Commit the version bump**
   ```bash
   git add package.json
   git commit -m "Bump version to 0.4.0"
   ```

3. **Create the tag and push only that tag**
   ```bash
   git tag v0.4.0
   git push origin main v0.4.0
   ```
   Do not use `git push --tags`. It also pushes tags that exist only in this clone (`v0.10.0` and `v0.11.0` as of 2026-10-07), and each pushed tag deploys its own old build to `/latest/`.

### What Happens Automatically

| Trigger | Deploys To | Updates /latest/ and the custom host |
|---------|------------|--------------------------------------|
| Push to `main` | `/dev/` | No |
| Push tag `v0.4.0` | `/v0.4.0/` + `/latest/` + root redirect + `colmapview.opsiclear.com` | Yes |
| Push tag `v0.4.1-beta` | `/v0.4.1-beta/` + `/latest/` + root redirect + `colmapview.opsiclear.com` | Yes |

- **Every tag is a production release, including `-beta` and other suffixed tags.** While the repository variable `CLOUDFLARE_PAGES_ENABLED` is `true` (it has been since 2026-10-06), each tag run also deploys `https://colmapview.opsiclear.com/` from the tagged commit. There is no pre-release channel: try a build on `/dev/` by pushing to `main`, or with the manual **Deploy isolated hosting preview** workflow.
- Tags must match `v[0-9]+.[0-9]+.[0-9]+`, optionally followed by a `-` or `+` suffix such as `-beta`. The deploy job rejects any other tag.
- Deploy runs wait in one queue (`pages-deploy`, `queue: max`), so a later push never cancels a tag that is waiting to deploy. Runs from one push can start in either order, so push one release tag at a time.
- A run that fails after its first upload can leave GitHub and the custom host on different releases. Fix the cause, then rerun the same tag's workflow (see `colmap-webview/docs/dual-hosting.md`).
- If a release changes what the viewer accesses or sends, update `public/privacy.html` and its effective date in the same release.
- Previous GitHub Pages versions are never deleted - they remain accessible forever
- The `peaceiris/actions-gh-pages` action preserves existing files with `keep_files: true`
````
**If this is applied before E3 is on `main`**, replace the queue bullet with: "A tag waiting behind another deploy is cancelled by any later push to `main`. Do not push `main` again until the tag's run has started, and rerun the tag's workflow if it shows as cancelled."

The scratch copy `scratchpad/rev3/r5/owner/CLAUDE.md` has the draft applied, preserving the file's CRLF endings. `git diff --no-index owner/CLAUDE.orig.md owner/CLAUDE.md` shows the exact change: 18 insertions, 12 deletions.

### Tests
None; the file is outside the repository.

### Risks and interactions
- **Owner decision on the local tags.** Should `v0.10.0` and `v0.11.0` be deleted locally (`git tag -d v0.10.0 v0.11.0`) or kept? Memory notes `v0.11.0` was intentionally left unpushed. The draft names them with a date, so update that sentence once they are gone.
- The queue bullet depends on E3. The privacy bullet supports the G8 effective-date item.

### Effort
**Owner, low:** apply one block of text.

---

## E9. `docs/hugging-face-publishing.md` gives the wrong callback path for the custom host

### Verified
- The doc gets the custom host wrong in two places:
  - `docs/hugging-face-publishing.md:75` says the callback must "end in `/hf-callback.html`".
  - The table (`:69-73`) has no custom-host row.
- For `https://colmapview.opsiclear.com` the code accepts only the exact path `/hf-callback`:
  - `config.ts:29-32`. A `.html` path makes `resolveOAuthConfiguration` return `unavailable` ("sign-in has not been set up correctly").
  - `config.test.ts:52` rejects `https://colmapview.opsiclear.com/hf-callback.html`.
  - The deploy preflight requires the same path (`profiles.mjs:39-41`).
- The live variable agrees: `CUSTOM_HF_OAUTH_REDIRECT_URI = https://colmapview.opsiclear.com/hf-callback`, as do `docs/dual-hosting.md:46` and `:74`.
- `:83` says "All three callback URLs above are registered". That line becomes inaccurate once the table has four rows.

### Fix
`docs/hugging-face-publishing.md`:
```diff
 | Development deployment | `https://colmapview.github.io/dev/hf-callback.html` |
+| Custom production host | `https://colmapview.opsiclear.com/hf-callback` |
 | Local development example | `http://localhost:5173/hf-callback.html` |
 
-Use the actual origin if hosting elsewhere. The configured callback must have the same origin as the viewer, end in `/hf-callback.html`, and have no query or fragment. Production requires HTTPS; loopback HTTP is accepted for local development. A stable `/latest/` callback serves both the latest and versioned release viewers. Keep the version-1 callback message protocol compatible when updating that static page.
+Use the actual origin if hosting elsewhere. The configured callback must have the same origin as the viewer and no query or fragment. Its path must end in `/hf-callback.html`, except on the custom host: Cloudflare Pages redirects `.html` addresses to their extensionless form, so `https://colmapview.opsiclear.com` accepts only the exact path `/hf-callback`, in `CUSTOM_HF_OAUTH_REDIRECT_URI` and in the app registration. Production requires HTTPS; loopback HTTP is accepted for local development. A stable `/latest/` callback serves both the latest and versioned release viewers. Keep the version-1 callback message protocol compatible when updating that static page.
```
```diff
-On 2026-09-27, the maintainer registered [ColmapView](https://huggingface.co/settings/applications/6ab992584abcf4acddced01e) under `opsiclear-admin` as a public app without a client secret. All three callback URLs above are registered, with default scopes `openid profile contribute-repos` and an eight-hour token lifetime.
+On 2026-09-27, the maintainer registered [ColmapView](https://huggingface.co/settings/applications/6ab992584abcf4acddced01e) under `opsiclear-admin` as a public app without a client secret. The two GitHub callbacks and the local callback above were registered then, with default scopes `openid profile contribute-repos` and an eight-hour token lifetime. Custom-host sign-in through the registered `/hf-callback` passed on 2026-10-06 ([dual hosting](dual-hosting.md)).
```

### Tests
None; this is a docs-only change. Verify that `rg -n "opsiclear.com/hf-callback" docs/hugging-face-publishing.md` shows the table row and the rule, and that both match `config.ts:30-32`.

### Risks and interactions
- No other area edits this file.
- **Optional follow-up, not changed.** `docs/dual-hosting.md:9` and `:46` describe a "separate" HF registration for the custom host, but `CUSTOM_HF_OAUTH_CLIENT_ID` currently equals `HF_OAUTH_CLIENT_ID` (compared without printing). The custom host is the same app with an extra callback.

### Effort
- **Implementer: low.**
- **Reviewer: low.**

---

## File ownership table

| Repository file | Finding | Change |
| --- | --- | --- |
| `.github/workflows/deploy.yml` | E3 | add `queue: max` and a comment |
| `scripts/deployment/profiles.test.mjs` | E3 | add `assertDeployRunsQueue` and its test |
| `docs/dual-hosting.md` | E3 | one sentence at line 62 |
| `public/privacy.html` | G8 | lines 73, 79 and 80 |
| `public/about.html` | G8 | line 59 |
| `README.md` | G8 | line 43 |
| `docs/google-oauth-verification.md` | G8 | line 130 (HF row) |
| `docs/hugging-face-loading.md` | G8 | line 6 (**shared with R4 / G14**, which edits lines 15–17) |
| `src/features/privacyPolicyContract.test.ts` (new) | G8 | contract test |
| `docs/oauth-review-demo-script.md` | E7 | scene rows 3, 4 and 9 (lines 51, 52, 57) |
| `docs/hugging-face-publishing.md` | E9 | callback table, line 75, line 83 |
| `C:\Users\HEQ\Projects\colmap_webview\CLAUDE.md` (outside repo) | E8 | **owner-approved only** |

## Recommended task grouping and order

1. **Task R5-1 (E3).** Files: `deploy.yml`, `profiles.test.mjs`, `dual-hosting.md`.
   - Commit subject: *Queue deploy runs so a later push never cancels a waiting tag deploy*.
   - Verify with `npm run test:deployment:config` (or `node --test scripts/deployment/profiles.test.mjs`).
2. **Task R5-2 (G8).** Files: `privacy.html`, `about.html`, `README.md`, `google-oauth-verification.md`, `hugging-face-loading.md` line 6, and the new contract test.
   - Commit subject: *Disclose the Hugging Face scopes and Drive publication metadata the viewer uses*.
   - Verify with `npx vitest run src/features/privacyPolicyContract.test.ts`, then the full `vitest run` before any push. `npm run test:deployment` gives a full smoke if wanted.
   - Order it after R3's and R4's tasks that touch `privacy.html`, `README.md` or `hugging-face-loading.md`, or have them follow this one. The hunks are disjoint either way.
3. **Task R5-3 (E7 + E9).** Docs that must match the app's real controls and callback.
   - Commit subject: *Match the OAuth demo steps and the custom-host Hugging Face callback to the app*.

The three tasks are independent. One reviewer can judge R5-2 and R5-3 together if preferred, since all of it is provider documentation checked against code. **E8** is an owner step after R5-1 reaches `main`.

## Cross-area notes
- **R3:**
  - **E5** (the Drive hand-off `?url=` against the policy's advice) may edit `public/privacy.html` section 2 (line 66) or the hand-off code. That is a different paragraph from G8's, but the same file.
  - **E1** (Drive limit docs) may edit `README.md` line 36 and `docs/google-drive-publishing.md`. G8 edits `README.md` line 43 only.
  - **E15** may change `DatasetAccountButtons.tsx`. E7's rows quote its labels.
- **R4:**
  - **G14** edits `docs/hugging-face-loading.md:15-17`, and G8 edits line 6. Apply them sequentially, or fold G8's line-6 replacement into R4's task.
  - **E11** may change the "Sign in with Hugging Face…" error strings (`datasetAccess.ts`), and possibly `hugging-face-loading.md:36`.
  - If R4 changes `HF_SCOPES` or the account-dialog hint strings, the G8 contract test or the new policy sentence about the dialogs must follow.
- **R1 and R2:** no shared files.

## Owner items
- **Bump the privacy effective date at release.** `public/privacy.html:29` (`<time datetime="2026-10-07">`) should become the release date of the build that ships the G8 text. This spec does not change it.
- **Apply the E8 text** to `CLAUDE.md`, and decide on the local-only tags `v0.10.0` and `v0.11.0`.
- **Optional:** name the hosted viewers in the policy's HF sentence (see G8), and the `dual-hosting.md` "separate registration" wording (see E9).

## Scratch artifacts (`scratchpad/rev3/r5/`)
- `scripts/deployment/profiles.test.mjs` and `.github/workflows/deploy.yml`: the E3 test and fix (RED then GREEN, 19/19).
- `src/features/privacyPolicyContract.test.ts`, `public/*.html`, `README.md`, `docs/*.md`: the G8, E7 and E9 edits (`git diff` against the scratch baseline).
- `check-policy-pages.mjs` (parse5 structure and changed-line check against the repository `HEAD`) and `smoke-policy.mjs` (Playwright mirror of the artifacts.spec.ts policy checks).
- `src/components/dropzone/g8LoadingScopes.repro.test.tsx` and `src/components/dropzone/e7LoadedScene.repro.test.tsx`: repros only, not for the repository.
- `owner/CLAUDE.orig.md`, `owner/CLAUDE.md`, `owner/release-section.md`: the E8 draft.
