# Browser connections

Google Drive and Hugging Face access tokens and bucket keys stay in the current tab. ColmapView does not send them to its Worker, persist them in browser storage or create an account-session cookie. Loading and publishing reuse the tab connection when its scopes permit. Reconnect after reload or expiry; the provider's existing login can reduce password prompts, but silent reconnection is not guaranteed.

## Browser behavior

Google Identity Services supplies the access token directly to the tab. Ordinary viewing and publishing request `drive.file`; only **Add to Google Drive** also requests `drive.install`. No Google refresh token, `openid` grant, server callback or client secret is used. The custom host remains the supported Google origin; GitHub and preview hosts offer a handoff.

Drive Open with preserves the selected archive during explicit sign-in and loads it without a second Picker selection. The launch account ID is an untrusted login hint, not authorization. A previous tab token is cleared; Google enforces file permissions. Raw launch state is removed from the address bar and account hints do not enter shared links.

Hugging Face uses a public OAuth client and PKCE. The callback returns a code to the signing-in tab, which exchanges it directly with HF using an in-memory verifier. Read-only builds request `openid profile read-repos`; publishing-enabled builds also request `contribute-repos`. The token and repository username stay in memory. A read-only grant cannot publish.

S3-compatible keys sign requests directly in the browser, restricted to the configured bucket root. The render snapshot contains no key material. Successful connection clears the key fields; Disconnect clears the connection. Password-manager autofill is supported, with any saving controlled by that manager. No app-managed credential vault is introduced. Transfers go directly to the bucket; its CORS policy must permit the viewer origin, methods and headers.

Disconnect clears the tab connection and cancels the relevant active operations. It does not revoke the provider grant or delete provider files. Other tabs may retain their own tokens. Reloading also loses upload state; remembering provider login does not resume interrupted uploads.

## Server contract

The viewer makes no `/auth/` requests. The Hub Worker has no credential storage binding, provider OAuth secrets in its configuration, token exchange or bucket signing code. For cached older viewers, `GET /auth/session` reports all capabilities disabled and other `/auth/*` requests return 410 without reading their bodies or contacting a provider. A supplied legacy cookie is expired. Responses are uncacheable and have no CORS allowance.

This removes server credential custody. Active browser code can still use tab credentials, so script/dependency protection remains necessary. Public Hub cards intentionally retain submitted metadata and dataset URLs under the [privacy policy](../public/privacy.html); ordinary hosting also processes page requests. This change does not mean that the service processes no user data at all.

## Deployment and rollback

**Retirement completed — October 20, 2026:** viewer **0.19.3** (source `8f7ed97`) was deployed and verified on the custom site, GitHub `/latest/` and `/v0.19.3/`; the [release workflow](https://github.com/ColmapView/Colmapview.github.io/actions/runs/39370199310) passed. The approved Hub migration `v4-remove-account-sessions` permanently deleted the former `AccountSession` namespace and all saved connections. Cloudflare's namespace inventory confirmed that only `LookupGuard` remains. The three obsolete Worker auth secrets were removed. Hub **0.9.9** (source `c8170bb`) preserved public cards, catalog data and R2 objects.

Deploy the prepared Hub retirement first, remove unused Worker auth secrets, then publish the browser-only viewer and revised policy. Older viewers already have browser authentication as a fallback when `/auth/session` reports disabled capabilities; an open tab using the retired service may need a reload. Verify the public HF client and browser callback, Google popup/Open with, private reads, uploads, cancellation and reconnect behavior. All deployment profiles force the obsolete `VITE_ACCOUNT_SESSIONS_ENABLED` flag off; it is no longer read by the viewer. Do not supply user tokens or provider client secrets to Vite.

After namespace deletion, rolling back application code cannot restore saved connections. Preserve the public Google and HF registrations needed by browser authentication. Revoke the obsolete Google server client secret, retire the separate unused confidential HF app, and remove the old server callback registrations after checking browser sign-in. Deleting Worker bindings alone does not invalidate historical copies of a secret; deleting only an HF app secret converts that app to a public client. Preserve the Google browser client and Drive UI registration. Previously issued tokens or user-owned bucket keys require provider-side revocation if leakage is suspected.

## Validation

Focused tests exercise direct browser token use, PKCE callback checks, expiry, cancellation, bucket signing and credential-free snapshots. Drive launch tests preserve the selected file through sign-in. Compiled browser checks verify no server-auth traffic and reconnection after reload. Worker tests reject old credential endpoints without reading their bodies or opening old storage. Fixture checks do not establish production provider configuration; real-provider validation must be recorded for the released revision.

### Live checks — 2026-10-20

The three production manifests and HTML hashes match viewer `8f7ed97`. Privacy and terms are effective October 20, 2026. Both custom HF callback paths return `no-store, no-transform`; the callback's early referrer meta policy suppresses the script request's Referer header. The hosting response header itself is `strict-origin`.

Private HF browser sign-in and ZIP loading passed. Reload discarded the tab connection and required sign-in; reconnecting through the existing provider login and retrying loaded the private archive again. The retained public HF app has no client secret and keeps the custom, GitHub latest and GitHub dev callbacks. Both obsolete confidential HF connection apps were deleted. The Google server secret created October 19 was subsequently disabled and deleted at the provider, and `/auth/google/callback` was removed from the client. Google confirmed the save, and reopening the client confirmed the production JavaScript origin and original browser client were retained. The Drive UI registration was preserved. Google notes that credential changes can take five minutes to a few hours to propagate.

An actual NL3D load rendered 100,000 points and downloaded a model-only ZIP. Independent verification matched every point, all 50 camera poses and their calibrations to the pinned original source. Captured public-load traffic contained 60 requests and zero `/auth/` requests. All eight live Hub entries passed their counts, metadata and direct-open checks. A synthetic share passed creation, card, redirect, preview, manage and CSS checks and was deleted afterward.

The release's full GitHub checks, compiled deployment checks and Chromium suite passed. The final Hub revision passed its full checks and 62 browser cases before deployment. Drive private reads/save/Open with, HF publishing and disposable bucket transfers have automated coverage but were not repeated against real providers for this release. The October 19 receipts below apply to the earlier server-backed implementation.

**Follow-up — viewer 0.19.5:** the [release workflow](https://github.com/ColmapView/Colmapview.github.io/actions/runs/39414753867) passed. The custom, GitHub latest, versioned and dev manifests and HTML hashes matched source `c37d0116`. Live `/auth/session` still reports disabled server capabilities without an anonymous cookie; the old Google/HF callback and bucket endpoints return 410 without CORS. Both custom HF callbacks retain their uncacheable responses and referrer meta policy. The deployed Hub binding inventory still contains no auth storage or OAuth secrets, and its only Durable Object class is `LookupGuard`.

After Google credential retirement, a fresh browser sign-in loaded the retained private Drive ZIP through the selected-file handler without another Picker selection. Both original gallery images decoded at 256 × 192, and the canonical URL contained neither raw launch state nor an account hint. This check used valid selected-file launch state for the fixture; it did not originate from the Drive menu. The account's Add to Google Drive consent was confirmed, but installation and a fresh actual-menu launch remain unverified: Drive's full interface selected a different default account, and browser control stopped responding during the account switch. The dated October 19 actual-menu receipt remains separate. No Drive file or sharing permission was changed by these checks.

### Live checks — 2026-10-19

**Historical receipt:** the checks below cover the earlier remembered-connection implementation. They do not validate the browser-only revision or prove that its deletion migration has run.


The custom production host was checked in Chrome using synthetic data with viewer **0.19.1** (source `85e9998`) and Hub **0.8.2** (source `05e4358`). The [viewer release workflow](https://github.com/ColmapView/Colmapview.github.io/actions/runs/39304184357) passed, and the custom, GitHub latest and versioned manifests matched the release source. This is dated live evidence, separate from automated fixtures and later development commits.

| Connection | Live result |
| --- | --- |
| Google Drive | Private Open with, matching-account restoration, private ZIP save, share-link reopening, reload/separate-tab loading, forced renewal and disconnect/reconnect passed. |
| Hugging Face | Private ZIP publication and reads, forced renewal and disconnect/reconnect passed. A saved publishing grant reopened private data after reload and in a separate tab without sign-in or retry. The separate read-only grant is covered by automated fixtures. |
| R2 | Explicit Remember, read-only restoration, explicit upload enablement, private ZIP upload/download, reload/separate-tab loading and disconnect passed. |

The disposable R2 key was revoked and its objects, bucket and Hub card removed. The additional Drive save was moved to recoverable Trash and its Hub card removed. The original Drive fixture and private HF fixture were retained for retesting. Temporary operator pages and the synthetic fixture ZIP were removed from the Hub, with live 404 checks. No real provider credentials are committed in this evidence.

Safari still needs a real-device check. These checks do not establish a Marketplace listing, anonymous access to private datasets, complete large-dataset transfer coverage, or support for interrupted-upload resumption.
