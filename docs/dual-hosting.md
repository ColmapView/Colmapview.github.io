# Independent GitHub and custom hosting

ColmapView has two deployment profiles from the same release commit:

| Host | App base | Google Drive | Account configuration |
| --- | --- | --- | --- |
| `https://colmapview.github.io/latest/` | `/latest/` | Disabled; offers an explicit link to the custom viewer | Existing GitHub Hugging Face production registration, when enabled |
| `https://colmapview.opsiclear.com/` | `/` | Enabled only at this exact HTTPS origin | Separate production Google project; optional separate Hugging Face registration |
| Isolated `*.pages.dev` preview | `/` | Disabled, including when a custom artifact is served there | Provider authentication and publication disabled in preview builds |

Keep GitHub Pages' **Custom domain** empty and do not add `CNAME` to the repository or its Pages branch. Associate `colmapview.opsiclear.com` with a separate Cloudflare Pages project. Assigning that domain to GitHub Pages would make it GitHub's canonical custom address; this setup keeps two independently served applications. Browsers treat the hosts as separate sites: local preferences, loaded scenes and account sessions are not shared between them.

The application enforces the origin restriction before Drive SDK, API, Picker or upload access. The GitHub build explicitly sets `VITE_GOOGLE_DRIVE_ENABLED=false` and clears all Drive configuration. Custom production sets it to `true` with `VITE_GOOGLE_DRIVE_ALLOWED_ORIGIN=https://colmapview.opsiclear.com`. Copying that build to a Pages preview or GitHub origin does not enable Drive there. A pasted valid Drive file link on a disabled host offers **Use Google Drive**; following it carries only the canonical file ID and optional resource key, and does not grant private-file access.

## One-time hosting setup

**Confirmed 2026-10-06 UTC, live baseline `c517`:** the owner's Cloudflare account controls `opsiclear.com`; Pages projects `colmapview-opsiclear` and `colmapview-preview` exist with production branch `main`. The custom domain/CNAME is associated, Cloudflare reports **Active**, and public DNS A records resolve. The custom viewer and canonical policy pages return HTTP 200. The HTML-only `no-transform` fix is deployed: public HTTP and fresh Chromium checks match the prepared artifact's exact HTML checksum, with no idle analytics or provider traffic.

The separate Google project `colmapview-prod-20261006` has Drive+Picker enabled, a Web client registered for exactly `https://colmapview.opsiclear.com`, and a browser key restricted to those APIs with referrers `https://colmapview.opsiclear.com/*` and `https://docs.google.com/*`. It declares only `drive.file` and is **External / Production**. Verification Center explicitly says scope verification is not required because no sensitive or restricted scopes are requested. Canonical Branding URLs `/about`, `/privacy` and `/terms` are saved. After Publish branding, Google confirms **branding is verified and being shown to users**. Google consent uses the available owner support identity `opsiclear@gmail.com`; public support/privacy remains `info@opsiclear.com`. The separate development project remains Testing.

Search Console Domain property **`opsiclear.com` reports Ownership verified** under project owner `opsiclear@gmail.com` using the new DNS TXT proof; the production authorized domain is `opsiclear.com`. Google's dashboard confirms the numeric production project number matches the configured Picker app ID. Domain and branding verification are separate completed checks. Configuration is stored in ignored local files and corresponding GitHub settings; no credential values are recorded here. `CLOUDFLARE_PAGES_ENABLED=true` is saved and read back, enabling paired deployments for future release tags. The manual custom upload remains separate from a paired tag release.

Real Google production publisher consent and **private ZIP publication passed** on `c517`. The success receipt verified size, MD5 and publication ownership; sharing stayed private (`shared=false`). Reopening its exact private viewer link in a fresh page required a new local connection. After sign-in using the existing Google grant and explicit native Picker selection, the ZIP loaded **one camera, two images and one point**; both gallery images decoded as native **4 × 3 JPEGs**. Picker disposed its frames after selection. The rehearsal created private disposable files in the operator's Drive; no file IDs or tokens are recorded here.

Live checks on `c517` accepted the user's public **1,649,626,624-byte TAR** metadata without authentication; the full archive was not downloaded or rendered. Real custom-host Hugging Face login returned through canonical `/hf-callback` using an existing app grant, then loaded the operator-owned private `test2` COLMAP dataset and **14 decoded gallery images**. Selecting **None — COLMAP only** immediately started no subsequent PLY request, including full requests without a Range header; the pre-choice default request was cancelled before receiving body bytes. HF publication was not tested.

All `c517` CI checks passed: **4,338 unit tests, 89 E2E tests, nine deployment configuration tests and seven compiled-artifact browser cases**, plus lint and builds. The real private Drive ZIP round trip passed separately. Custom HF publication and full rendering of the 1.65 GB public TAR remain untested.

1. Use a Cloudflare Pages **Direct Upload** project named `colmapview-opsiclear`, with production branch **`main`**. Use a separate project, `colmapview-preview`, for manual previews. The CI deploy command targets existing projects; it does not create them or alter domain bindings. Wrangler is pinned to **4.147.0**. In this CLI version, creating a new project may delegate to Workers; the owner should create an actual Pages project through the dashboard or inspect the pinned CLI's explicit Pages creation option. Do not let a release create an unexpected project.
2. In the production project's **Custom domains**, add `colmapview.opsiclear.com`. Associate it with the Pages project before creating the DNS record. Since `opsiclear.com` already uses Cloudflare nameservers, keep that zone and its existing records; add the requested `colmapview` record pointing at the production project's `.pages.dev` hostname. Wait for Cloudflare's domain and certificate status to become active.
3. Keep the GitHub Pages source on `gh-pages` and its custom domain blank. Both hosts should return their own viewer, without an HTTP redirect from GitHub to the custom host.
4. Configure the GitHub Actions values below, keeping `CLOUDFLARE_PAGES_ENABLED=false` until the custom domain and separate Google production configuration are ready.

| GitHub Actions setting | Type | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secret | Account-scoped token with Cloudflare Pages write permission; rotate before its expiry |
| `CLOUDFLARE_ACCOUNT_ID` | Variable | Account owning both Pages projects |
| `CLOUDFLARE_PAGES_PROJECT` | Variable | `colmapview-opsiclear`, production branch `main` |
| `CLOUDFLARE_PREVIEW_PROJECT` | Variable | `colmapview-preview`; must differ from production |
| `CLOUDFLARE_PAGES_ENABLED` | Variable | Strict `true` or `false`; unset defaults to disabled |
| `CUSTOM_GOOGLE_DRIVE_API_KEY` | Secret | Browser-visible API key from the **production** Google project, restricted as described below |
| `CUSTOM_GOOGLE_DRIVE_CLIENT_ID` | Variable | Production web OAuth client ID |
| `CUSTOM_GOOGLE_DRIVE_APP_ID` | Variable | Same production project's numeric project number |
| `CUSTOM_HF_AUTH_ENABLED`, `CUSTOM_HF_PUBLISH_ENABLED` | Variables | Optional custom-host HF features; both default to `false` |
| `CUSTOM_HF_OAUTH_CLIENT_ID`, `CUSTOM_HF_OAUTH_REDIRECT_URI` | Variables | Separate HF registration with exact canonical callback `https://colmapview.opsiclear.com/hf-callback` |

The old `GOOGLE_DRIVE_*` repository settings belong to the audited Testing setup and are not read by production profiles. Browser API keys and OAuth client IDs are public build configuration, even when supplied through an Actions secret. Do not configure a Google client secret, service-account key or user token in a frontend build. Cloudflare's deployment token is exposed only to the trusted Wrangler upload step. Preflight checks a computed token-present flag; npm installation, selected-ref builds, tests and public checks receive no deployment token. A preview is built without credentials and transferred as an artifact to a separate job that checks out trusted default-branch deployment code and rechecks the artifact before uploading.

## Google production setup and approval

Create a separate Google Cloud production project, enable Drive API and Google Picker API, and configure a Web application OAuth client with JavaScript origin **`https://colmapview.opsiclear.com`**. This popup token flow needs no application redirect URI. Declare only **`https://www.googleapis.com/auth/drive.file`**. Restrict the browser API key to both APIs and website referrers `https://colmapview.opsiclear.com`, `https://colmapview.opsiclear.com/*` and **`https://docs.google.com/*`** for the Picker iframe. Keep localhost and its testing keys/clients in a separate project.

Use the saved canonical Branding URLs **`https://colmapview.opsiclear.com/about`**, **`https://colmapview.opsiclear.com/privacy`** and **`https://colmapview.opsiclear.com/terms`**. Google's current domain guide requires a DNS-verified Search Console **Domain property**; `opsiclear.com` now reports Ownership verified as recorded above. Confirm the final authorized-domain entry before review. The earlier GitHub HTML/URL-prefix file is not a substitute for DNS Domain-property verification. Verified domain ownership and saved Branding fields do not establish Google app approval.

The sole `drive.file` scope is non-sensitive; restricted-scope verification and its security assessment are not needed for this scope, as the production Verification Center confirms. Production audience, client configuration, verified/published Branding and the real private ZIP publication/Picker rehearsal are complete. See the [verification packet](google-oauth-verification.md) and [demo script](oauth-review-demo-script.md).

## Release and preview behavior

`.github/workflows/deploy.yml` calls the reusable validation workflow, including production-artifact smoke tests. A version tag such as `v0.15.5` builds the GitHub version directory and `/latest/`, and, when the explicit custom gate is enabled, the custom root artifact from that **same checkout/SHA**. It validates configuration and smoke-tests all prepared artifacts **before the first upload**. It then deploys GitHub and the existing Cloudflare Pages project, attaching the release's source SHA to the Cloudflare deployment.

When the custom gate is `true`, any missing production token, project, API key, client ID or numeric project number fails preflight. When disabled, GitHub can still release and the Actions summary clearly reports **GitHub only**. Branch and branch-manual runs update GitHub `/dev/` with Drive and provider authentication disabled; they do not update custom production. Automated production Cloudflare uploads require a tag. A separately authorized initial manual custom upload must use a clean explicit commit, prepared artifact, smoke tests and exact-manifest public check; it does not create a paired GitHub release. Manual **Deploy isolated hosting preview** requires an explicit ref, resolves its commit SHA, uses only the separate preview project and disables all provider configuration.

Each artifact includes public `deployment.json` with source SHA, package version, release, profile, base path, Drive capability and the SHA-256 digest of its `index.html`. It contains no API key, client ID or token. After upload, public HTTP/browser checks compare metadata with the **local prepared artifact manifest** and require the delivered HTML bytes to match that digest in both HTTP and browser navigation. The HTML's Vite content-hashed module URLs bind it to that build's entry assets; fresh metadata paired with stale HTML fails verification. Checks also require genuine policy pages, successful app startup, expected account controls and no idle provider/analytics traffic. GitHub must remain on its own origin. An old cached release is retried and ultimately fails the job rather than being reported as success.

The two provider uploads are separate operations. A provider or final public-check failure can leave one host updated; the job fails and does not report a completed dual release. Compare both public `deployment.json` files and rerun the same tag workflow after resolving the failure. No automatic rollback deletes a published release.

Custom and preview artifacts include `_headers` with `Cross-Origin-Opener-Policy: same-origin-allow-popups` and `Referrer-Policy: strict-origin`. They do not force `Cross-Origin-Embedder-Policy`, so Google popup communication and the app's existing worker paths remain available. The GitHub profile continues using GitHub's static hosting headers.

The viewer, policy and Hugging Face callback HTML routes also send `Cache-Control: public, no-cache, no-transform`, including their canonical paths and `.html` aliases. This prevents Cloudflare from rewriting those HTML bytes or injecting its Web Analytics beacon; the exact HTML checksum check stays intact. Hashed JavaScript, CSS and WASM assets keep their normal hosting rules, and `deployment.json` keeps `no-cache`. Cloudflare documents the [Web Analytics no-transform behavior](https://developers.cloudflare.com/web-analytics/get-started/) and [payload-preservation directive](https://developers.cloudflare.com/cache/concepts/cache-control/). Keep Pages and hostname Web Analytics disabled; if a hostname still injects analytics, use a hostname-specific [Disable RUM configuration rule](https://developers.cloudflare.com/rules/configuration-rules/settings/#disable-real-user-monitoring-rum) and repeat the browser check.

Cloudflare Pages may redirect `/about.html` to `/about`, and likewise for Privacy and Terms. Public policy checks accept the same-host final HTTP 200 only when the page title identifies the expected policy; a missing file returning the SPA viewer is rejected. Custom Hugging Face configuration uses the canonical **`/hf-callback`** URI for the uploaded `hf-callback.html` page, matching the application's explicit custom-host callback policy. Its registration, enabled build settings and real private loading now pass the live check above; GitHub's existing `.html` callback configuration stays independent. Custom HF publication remains untested.

## Repeatable local and CI checks

```sh
npm ci
npx playwright install chromium
npm run test:deployment
```

This runs configuration/workflow-contract tests, TypeScript checks, three production builds and Chromium smoke tests. It uses synthetic public Google identifiers and mocks only Drive metadata/media; it requires no credentials or provider internet. Browser requests to the real HTTPS GitHub/custom/Pages origins are mapped to a local static HTTP server, preserving `window.location.origin`. Tests cover policy navigation at `/latest/` and `/`, native COLMAP parsing/rendering, public Drive ZIP/TAR/TAR.gz loading without OAuth, the custom-root native libarchive worker/WASM paths, and disabled Drive SDK/API access through pasted URLs and direct shared links on GitHub/Pages. The custom artifact is also tested when served at GitHub and Pages origins. Reports and builds stay under ignored `.tmp/deployment-smoke/`.

For an individual prepared profile, use `npm run build:deployment -- github --base=/latest/ --out=.tmp/deployment/github`, or `custom --out=.tmp/deployment/custom` with the production-prefixed configuration set. Add `--fixture` to use only synthetic configuration. `DEPLOYMENT_SMOKE_ROOT` and `DEPLOYMENT_SMOKE_PROFILES` select prepared artifacts for `npm run test:deployment:browser`. A local dirty worktree's SHA identifies its base commit; only a clean immutable CI checkout establishes a release commit.

Mocked checks establish application and hosting behavior. They do not establish real Google consent, a private-file grant, Google approval, successful full rendering of the user's 1.65 GB TAR, or a public deployment. These remain separate acceptance checks.

## Optional live provider checklist

Run this manual rehearsal on the exact verified custom build with the operator's account and consent. It complements required credential-free CI; account credentials, tokens and private file IDs must never enter CI or recorded reports.

1. Without signing in, check a public Drive archive's metadata and expected size/type. A metadata or bounded header probe is sufficient for the large public TAR; it does not count as full rendering.
2. Load a small synthetic COLMAP scene with **real decodable JPEG originals**, then publish a unique ZIP privately. Validate the images first; mock mask PNG/hash fixtures are not suitable originals. Confirm the success receipt's size, MD5, publication ownership and private sharing state.
3. Open the copied private viewer URL in a fresh page, sign in, and choose the same ZIP through native Google Picker. Confirm fixture camera/image/point counts, decoded gallery image dimensions and disposal of Picker frames. The verified fixture had one camera, two images, one point and two 4 × 3 JPEGs. Use a separately created private archive if testing a new per-file grant, rather than reopening an app-created file.
4. Sign in to HF through canonical `/hf-callback` and load the operator-owned private `test2` dataset. Select **None — COLMAP only** promptly; permit only bounded metadata/header probes while observing discovery. Confirm gallery decoding, cancellation of a pre-choice default request, and no further PLY request or full PLY download. This tests private reading; custom-host HF publication has only automated mocked coverage so far.
5. Record only build identity, counts, status and timing. Leave the disposable uploads private and identify them locally for owner cleanup. Optional live Picker cancellation/error cases, provider publication and a complete English demonstration video are separate follow-ups when needed.

Sources: [Cloudflare custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/), [Pages headers](https://developers.cloudflare.com/pages/configuration/headers/), [pinned CLI command contract](https://developers.cloudflare.com/workers/wrangler/commands/pages/), [Google DNS domain verification](https://support.google.com/cloud/answer/13804266?hl=en), [Google Picker API-key setup](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample), [Google OAuth project separation](https://developers.google.com/identity/protocols/oauth2/policies).
