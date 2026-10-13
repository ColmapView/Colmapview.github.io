# ColmapView Hub review fixes: design

- **Date:** 2026-10-13
- **Status:** approved in chat; revised after the owner's review ("The design should be consistent with ColmapView"); awaiting review
- **Repos:** `colmap-webview` (viewer, v0.16.12) and `colmapview_hub` (Hub Worker, v0.3.0). Both use the branch `hub-review-fixes`.
- **Source:** the 2026-10-13 review (private artifact https://claude.ai/artifact/S7BDHZq2DyLTvpir1jsmM6). It has 33 findings (H1–H5, M1–M11, L1–L17) plus its conciseness, optimization and simplification items.

## Goal

Fix every finding and listed improvement in both repos, with tests. Hub pages and new viewer UI follow ColmapView's existing design. Keep the owner's deliberate choices: public by default, one-click publish, readable word-pair names, and no User-Agent exemptions.

**Done means:**
- Every row in the traceability table (§6) has a fix and a test.
- Viewer gates pass: `npm run check`, `npm run test:deployment` and `npx playwright test --project=chromium`.
- Hub gates pass: `npm run check` and `npm run test:browser`.
- Opus reviewers and the Codex branch gate pass.

This work pushes, tags, deploys and configures nothing. Versions are bumped at release.

**Process:** this spec, then one plan in two parts (Hub first, then viewer), then a Codex plan review. Execution uses Opus subagents per task with TDD, then the Codex branch gate.

## Decisions

| Topic | Decision |
|---|---|
| Which uploads get a Hub card | Every upload, on hosts where the Hub is enabled (§2.1). |
| Name length | Data anyone can open without signing in gets a short name (`HappyTree`). Everything else gets a long, unguessable name (`HappyTree-q3ZfK0aB7xLmP2Ws`, 96 bits). |
| "Public" means | One of: Hugging Face Public; Drive "Anyone with the link"; a bucket upload that passes the anonymous check on a non-internal host. |
| Opt-out | None. The disclosure line states what happens, and the private delete link removes a card. (Owner: "Private uploads get long links".) |
| Gallery listings | Off by default, behind `HUB_LISTINGS_ENABLED`. |
| Deploy order | Hub first, then the viewer release. |
| Look | Hub pages use a copy of the viewer's public-page stylesheet and its header and footer. New viewer UI reuses the upload dialog's parts (§1.6, §2.7). |

## Hub API contract

`POST /hub/api/links` (JSON):

| Field | Change |
|---|---|
| `access` | New and optional: `"public"` or `"private"`; any other value gets 400. When it's missing the link is public, so deployed viewers v0.16.10–v0.16.12 keep working. |
| `listed` | `true` returns 403 while listings are off, and 400 together with `access: "private"`. |
| `publicAcknowledged` | Still required to be `true`. The viewer sends it only from the state that shows the disclosure (§2.3). |
| `license` | Same shape. The viewer now sends `name` and `url` instead of a raw `id`. |

- **Response:** 201 `{ id, url, managementPath }`, unchanged. A private request returns a long ID.
- **Errors:**
  - 400: invalid input.
  - 403: origin not allowed, or listings off.
  - 409: changed draft, or no free name (today a 503).
  - 413 and 415: as today.
  - 429: with `Retry-After`.
  - 503: storage unavailable.
- **Stored record:** gains `access: "private"` on private links (missing means public). `schemaVersion` stays 1. Reads tolerate missing and unknown fields (§1.4).
- **Compatibility:**
  - The current Hub rejects unknown keys.
  - A new viewer talking to the old Hub still gets public links.
  - For private uploads it shows "Hub link not created"; private data never receives a short name.
  - Deploying the Hub first avoids even that window.

## 1. Hub Worker (`colmapview_hub`)

### 1.1 Names and access

- **Public requests:** the 16 HMAC word-pair candidates, as today.
- **Private requests:**
  - One long ID from the existing `link:<secret>` derivation, the legacy unlisted scheme. Retries replay it, and legacy long links keep resolving.
  - If another owner holds that ID, the request returns 409.
- **Renames and removals:**
  - Rename `deriveLegacyId` to `deriveLongId`. It now serves private and listed (`-L`) IDs.
  - Remove the legacy probe from public creation (`index.ts:63-67`). Keep legacy reads.
- **Private cards:**
  - They show the preview and the line "Viewers need access to open this dataset."
  - "Open in ColmapView ↗" replaces Play 3D, because signing in inside an iframe is unreliable.

### 1.2 Lookup guard (H2, H3, M1)

- **Key:** an HMAC of the IPv4 address, or of the IPv6 /64 prefix. IPv4-mapped IPv6 addresses count as IPv4.
- **State:**
  - One small value in the Durable Object's synchronous KV store replaces the two SQL tables.
  - A client with no misses, block or creations has no stored data.
- **Writes:**
  - Only state changes are written. A lookup hit writes nothing.
  - Reads ignore expired entries, and the alarm removes them.
  - `setAlarm` runs only when the earliest expiry changes.
  - When nothing is pending, the alarm calls `deleteAll()`. At compatibility date 2026-02-24 or later, that also removes the alarm.
- **One guard call per request:**
  - Lookups and deletions read R2 first, then call `lookup(missFingerprint)`, which returns the block delay. A blocked client gets 429 for hits too.
  - Creation calls only `admitCreation()`, which also checks the block.
- **Old storage cleanup:**
  - A new class, `LookupGuard`, replaces `ClientGuard`.
  - The migration deletes the old class, which removes all existing per-IP storage. Current cooldowns reset once, at deploy.
- **Miss fingerprints:** hash the ID with its word pair lowercased, so case variants of one guess count once. Long-ID suffixes stay as they are.

### 1.3 Abuse controls (M3, M4, M5, L11)

- **Cross-site subresources:**
  - A lookup with `Sec-Fetch-Site: cross-site` and a `Sec-Fetch-Dest` other than `document` gets 404 before any R2 read or strike.
  - `/api/` routes are exempt, because the GitHub Pages viewer calls them cross-site.
- **Verified bots:**
  - The optional secret `VERIFIED_BOT_TOKEN` enables this rule.
  - A Cloudflare Transform Rule adds the token as `X-Hub-Verified-Bot` for Cloudflare's known bots.
  - A request carrying it may make 30 misses per 10 minutes instead of 3, still per IP.
  - Without the secret nothing changes, and there are still no User-Agent checks.
- **Listings:**
  - `HUB_LISTINGS_ENABLED` is off by default.
  - While it's off, `/hub/` shows the landing page and `listed: true` gets 403. Existing listed records stay readable and deletable.
  - When it's on, the gallery HTML is cached for 60 s with the Cache API.
- **Loopback:** loopback origins are accepted only when the Hub itself runs on loopback (local dev). That covers API callers, viewer URLs and the player's frame source.
- **Credential denylist:**
  - Adds `x-amz-signature`, `x-amz-credential`, `x-amz-security-token`, `x-goog-signature`, `x-goog-credential`, `sig`, `signature`, `token` and `awsaccesskeyid`.
  - The check runs on the query and fragment parameters of both the viewer URL and its `url` source.

### 1.4 Reads, previews and routes (M2, M6, L8, L9, L12)

- **Tolerant reads:**
  - Rendering checks only what it needs: title and description strings, an http(s) viewer URL, the preview string, and optional license and assets. It ignores unknown keys.
  - Input rules (origins, path pattern, JPEG structure) apply only at creation.
  - Deletion and the candidate check read only `ownerHash` and `fingerprint`.
  - The gallery logs and skips a bad entry instead of failing the page.
- **Previews:**
  - Validated once, at creation, as today.
  - The image route decodes the base64 once with a plain loop and sends `Cache-Control: public, max-age=300`.
  - The card page no longer decodes the preview.
- **Writes and storage:**
  - Create-only writes use `onlyIf: new Headers({ 'If-None-Match': '*' })`.
  - Word lists are cached per isolate. Records and word lists get their own size limits instead of reusing `MAX_REQUEST_BYTES`.
- **Routes:**
  - `/hub/<id>/` redirects with 308 to `/hub/<id>`.
  - **Short names in other letter case:**
    - The name is resolved to its canonical form through the word lists, then looked up under that form.
    - A hit redirects (308); a miss is an ordinary 404 and strike.
    - Unused valid word pairs and invalid ones behave identically, so the private lists don't leak.
  - Long-ID suffixes are case-sensitive.
- **Errors:**
  - Page routes return HTML 404, 429 (with the wait) and 503 pages. `/api/` routes stay JSON.
  - HEAD bodies are stripped once, in `fetch`.

### 1.5 Pages (L13, L14, L15, L16)

- **Card:**
  - The asset line reads like "83 images · 83,749 points · 82 masks · 1 splat", with nonzero counts only.
  - The description gets its own line.
  - The license shows its name, linked when it has a URL.
  - The social description is the description, or the asset line when there's none.
- **Play 3D:** the frame grows to 70% of the viewport height (`70vh`) and receives focus.
- **Manage page:**
  - It reads the record, counted like a card lookup, and shows "Delete Hub link “<title>”?", its thumbnail and "The dataset stays where it is."
  - It has one "Delete permanently" button in the danger style (§1.6), with no checkbox.
  - On load, the script checks that the fragment holds a well-formed key. If it doesn't, the page says so and disables the button.
  - After deletion, focus moves to the status message.
- **Other pages** (heading, then lede):
  - Not found: "Link not found" / "Check the address, or ask for a new link."
  - Blocked: "Try again in N minutes" / "Too many missing links from your network."
  - Unavailable: "ColmapView Hub is unavailable" / "Try again in a few minutes."
  - Landing page (listings off): "Share links for ColmapView results." / "Links are created when you publish from ColmapView." Then [Open ColmapView].
  - Gallery images use `alt=""`, because the card text already names the link.

### 1.6 Look and feel (owner request)

Hub pages look and read like ColmapView's public pages (`about.html`, `privacy.html`, `terms.html`).

- **Stylesheets:**
  - `public/hub/colmapview.css` is a byte-for-byte copy of the viewer's `public/policy.css`. It provides IBM Plex Sans, the color and spacing tokens, the light scheme (`prefers-color-scheme`), and the header, nav, footer, button, intro and card styles.
  - `public/hub/styles.css` loads after it and adds only the Hub's parts: the player, the primary and danger buttons, the asset line, and status and error text. It uses the copied tokens, plus `--bg-void` and `--error` from the viewer's `index.css` in both schemes.
  - The font file and its `OFL.txt` are copied into `public/hub/fonts/`, where the copied stylesheet expects them, and `favicon.ico` into `public/hub/`. The CSP adds `font-src 'self'`.
- **Drift check:**
  - A test in each repo compares the SHA-256 of `policy.css` (viewer) or `colmapview.css` (Hub), with line endings normalized, against the same pinned value.
  - The failure message names the other repo's file, so changing one side fails until both match.
- **Page frame:**
  - Header and footer as on the viewer's public pages:
    - the "ColmapView" brand;
    - nav "Open viewer", "About", "Privacy" and "Terms";
    - the footer "ColmapView · Maintained by OpsiClear LLC" with About, Privacy, Terms and Contact.
    - Links go to `https://colmapview.opsiclear.com/`.
  - Each page has the skip link, the eyebrow "ColmapView Hub", an `h1`, and a lede when there's text for one. Titles end in "· ColmapView Hub".
  - Targets stay at least 44 px tall, with the shared focus ring.
- **Buttons:**
  - Primary (Play 3D): `--accent` background and `--bg-void` text, the viewer's primary pairing.
  - Danger (Delete permanently): `--error` background and `--bg-void` text, at least 4.5:1 in both schemes. The viewer's danger button uses white text, which is 3.9:1 on dark.
  - Everything else uses the shared `.button`.
- **Layouts:**
  - Card:
    - the eyebrow, the title, the description as the lede, then the asset line with the license;
    - the preview in a card frame with Play 3D centered on it, then [Open in ColmapView ↗];
    - a playing viewer fills the 752 px content column at `70vh`.
  - Manage: the same intro, the thumbnail in a card frame, then the danger button and the status line.
  - Gallery: the shared two-column `.cards` grid.
- **Wording:**
  - Sentence case and no exclamation marks.
  - "↗" marks links that open a new tab, as in the viewer.
  - "Open in ColmapView ↗" matches the Hugging Face dataset card.

### 1.7 Delivery and cleanup (L10, simplifications)

- `run_worker_first` lists only dynamic routes.
  - `styles.css`, `client.js` and the §1.6 files live in `public/hub/`, and Cloudflare serves them without invoking the Worker, with its default ETag revalidation.
  - `public/_headers` keeps `nosniff` on them.
- Remove the unreachable owner check in `replay` and the alarm's redundant reset.
- Split the long one-line templates (`pages.ts:48`, `index.ts:17`).

## 2. Viewer (`colmap-webview`)

### 2.1 Where the Hub runs (L6)

- **Base URL:**
  - `VITE_HUB_BASE_URL` when set (dev and e2e).
  - Otherwise `https://colmapview.opsiclear.com/hub` on `colmapview.opsiclear.com` and `colmapview.github.io`.
  - Otherwise none: no disclosure, no request, no Hub UI.
- Remove the localhost-to-production viewer URL rewrite.
- Playwright sets `VITE_HUB_BASE_URL` to a reserved test origin (`https://hub.invalid/hub`), so a missed intercept can't reach production.

### 2.2 Access per upload (M8, L4, L17)

- **Hugging Face:** the form's visibility.
- **Drive:** the sharing choice.
- **Bucket:**
  - After the upload, `bucketAccess()` returns `public`, `private` or `unknown`.
  - Internal hosts are `private` without a check: loopback, private IP ranges, `.local`, `.internal`, `.lan`, `.home.arpa` and single-label names.
  - Only `public` gets a short name.
  - While the check runs, the status reads "Checking public access…".
  - The result notice states the outcome:
    - public: "Anyone can open this link."
    - private: "Private. Viewers need bucket access."
    - unknown: "Public access unconfirmed, so the Hub link is unguessable."

### 2.3 Disclosure (H4, M9)

One line next to the publish button:
- **Public:** "Also creates a short ColmapView Hub link. Anyone with it sees the title, description and preview."
- **Private:** "Also creates an unguessable ColmapView Hub link. Anyone with it sees the title, description and preview; the data still needs access."
- **Bucket:** "Also creates a ColmapView Hub link (short if the bucket is public). Anyone with it sees the title, description and preview."
- **Original images:** when they're uploaded and access isn't private, the line adds "Original images keep their metadata, such as location."

`publicAcknowledged: true` comes from the same state that renders the line. It is no longer hard-coded.

### 2.4 Result and lifecycle (H5, M7, L5)

- **Result:**
  - A "Share link" field holds the Hub link when ready, otherwise the viewer link.
  - Buttons: [Open link ↗] and the provider link.
- **Below it:**
  - "Creating Hub link…" while the request runs.
  - On success, a visible row "Private delete link (don't share)" with Copy and "Delete Hub link ↗", which opens the manage page in a new tab.
- **Failure:** "Hub link not created: <reason>. The link above still works."
  - Reasons:
    - network: "Couldn't reach ColmapView Hub."
    - timeout: "ColmapView Hub didn't respond."
    - 429: "Too many requests from your network; try again in N min."
    - 5xx: "ColmapView Hub is unavailable."
    - anything else: the Hub's own message.
  - Retry appears only for network errors, timeouts, 5xx, 429 (enabled once `Retry-After` passes), and a missing preview, which is captured again on retry.
- **State outlives the receipt:**
  - Hub state belongs to the Hub controller, not the upload receipt.
  - When an edit, a deletion mark or a new dataset resets the receipt, a "Previous upload" block above the form keeps the share link and delete row (or the failure with Retry) until the next upload.
- **Finishing while the dialog is closed:** a toast appears, either "Hub link ready. Reopen the upload dialog to copy it and its delete link." or "Hub link not created. Reopen the upload dialog to retry."
- **Leaving the page** warns while a Hub request runs, or when a link was created but its delete row was never displayed.
- **Result titles:**
  - Hugging Face: "Published <repo>" or "Saved <repo> privately".
  - Drive: "Published to Google Drive" or "Saved privately to Google Drive".
  - Bucket: unchanged.

### 2.5 Share panel (M10)

- Copy link, X and LinkedIn use the newest ready Hub link whose source key and edit revision match the current dataset; otherwise they use today's link.
- The Hub link opens the view saved at upload, not the current camera.
- Embed URL and Embed HTML are unchanged.

### 2.6 Payload (L1, L2, L3, L7, L14, L17)

- **Dataset name helper:**
  - Tries, in order: the manifest name; the source URL's last path segment without its extension; the dropped folder or ZIP name (recorded at load); "colmap-dataset".
  - It sets the Drive file name and bucket folder defaults, and through them the card titles.
- **Description:** no synthetic "N images" description. The asset line carries the counts.
- **License:**
  - Known licenses send `{ name, url }` from `PUBLICATION_LICENSES`, which gains URLs.
  - Custom licenses send the entered name and URL.
- **Text:**
  - Collapse whitespace the way the Hub does.
  - Cut to the Hub's limits (title 120, description 280). Cut at the last space within the limit when that keeps at least 60% of the limit, otherwise at a grapheme boundary.
  - Append "…". The result's UTF-16 length stays within the limit.
- **Form validation:** the Hugging Face form strips control characters and caps the custom license name at 160 characters and its URL at 2048, matching the Hub.
- **Thumbnail:**
  - Crop to fill 600 × 315 instead of letterboxing.
  - Strip APP1 and COM segments if the encoder adds them: the Hub rejects them, and Safari's encoder is unverified.
- **Memory:** release the full-resolution preview once the payload is built. Retries reuse the payload.

### 2.7 UI cleanup (L15)

- **Bucket dialog:**
  - Remove the read-only Access row.
  - Accessible names match the visible labels ("Secret key", "Public URL (optional)").
- **Focus:**
  - After sign-in, the first form field.
  - After Publish, the progress status.
  - On completion, the result title.
  - After Retry, the Hub status.
- **Consistency:**
  - The new viewer UI reuses the upload dialog's parts: `publication-section`, `publication-note`, `publication-result-title`, `publication-result-actions`, `CopyableField` and the `getButtonClass` variants. That covers the disclosure line, the Hub status, the delete row and the Previous upload block.
  - Failures use `text-ds-error`, toasts use the notification store, and links that open a new tab end in "↗".
  - No new colors or sizes.

### 2.8 Code

- `bindHubPublication(controller, hub, select)` replaces the three copies of the subscribe and beforeunload wiring. Delete the dead HMR teardown: `vite.config.ts` sets `hmr: false`.
- `prepare(metadata, { access, preview, source })` replaces "an options object means public".
  - `source` holds the source key and edit revision for §2.5.
  - Remove `listed`, the one-element tuple and the unused `hub?` parameter of `publishCurrentDataset`.
- `HubLinkResult` takes `onRetry`, and one `hub.busy` replaces three `phase === 'creating'` checks.
- In `publication.ts`:
  - Remove the second URL resolution and the second hard-coded origin.
  - Inject the screenshot capture (the facade's `getScreenshotBlob`) instead of reading `useExportStore`.

## 3. Policy and docs (H1, L16)

- **`public/privacy.html`:**
  - **At a glance:** add a Hub bullet and state the current defaults (Hugging Face public, Drive "Anyone with the link").
  - **§5:**
    - What the Hub receives: viewer link, title, description, preview, license and asset counts.
    - OpsiClear stores it on Cloudflare until it's deleted.
    - Short vs unguessable names, and that anyone with a link sees its card.
    - "Directly from your browser to the selected provider" now applies to dataset files only.
  - **§7:** Cloudflare Workers, R2 and sampled request logs; the guard's keyed IP hash (IPv6 /64), whose state is kept for at most an hour after the client's last miss or creation.
  - **§8:** the delete link.
  - The effective date is the release date, set in the release commit.
- **`public/terms.html` §4:**
  - The current defaults.
  - Hub cards are user content the publisher is responsible for, and OpsiClear may remove them.
  - Requests go to info@opsiclear.com.
- **OAuth docs:**
  - `docs/google-oauth-verification.md`: the Drive dataflow includes the Hub card.
  - `docs/oauth-review-demo-script.md`, step 7: the disclosure line and the card.
- **Other viewer docs:** `README.md:45`, `docs/hugging-face-publishing.md`, `docs/google-drive-publishing.md`, and `CHANGELOG.md` under Unreleased.
- **Hub `README.md` and `AGENTS.md`:**
  - Access and long names; the listings flag.
  - The verified-bot rule and the cross-site rule: AGENTS.md's "same three-miss cooldown" rule gains these two exceptions.
  - Guard storage, and local development with `VITE_HUB_BASE_URL`.
  - The copied stylesheet and how to update it with its hash (§1.6).

## 4. Testing (M11)

- **Hub Workers tests (real runtime):**
  - Names and access:
    - private requests get a long ID and replay;
    - requests without `access` stay short;
    - the `listed` rules hold;
    - name exhaustion returns 409.
  - Guard:
    - hits leave the guard's storage empty, and so does the alarm;
    - one guard call per request;
    - IPv6 /64 and IPv4-mapped grouping;
    - a cross-site subresource gets 404 with no strike;
    - the bot token raises the threshold, and without it nothing changes.
  - Routes and reads:
    - trailing-slash and letter-case variants;
    - tolerant reads: an old-origin record renders and deletes, and a bad gallery entry is skipped.
  - Responses:
    - the new credential parameters are rejected;
    - HTML 404, 429 and 503 pages;
    - cache headers;
    - decode time for a 64 KiB preview.
  - Pages:
    - the manage page shows the title;
    - a private card has no Play 3D.
- **Hub browser tests:**
  - private card;
  - manage page (key check, focus, contrast);
  - taller player with focus;
  - landing page, header and footer;
  - look, in both color schemes:
    - IBM Plex Sans loads and the copied tokens apply;
    - the primary and danger buttons reach 4.5:1;
    - targets are at least 44 px tall;
    - there's no horizontal scroll at 360 px.
- **Drift check:** the pinned-hash test in each repo (§1.6).
- **Viewer unit and component tests:**
  - Rules:
    - base URL rules;
    - access per provider;
    - the bucket's three outcomes and internal hosts.
  - Disclosure:
    - the disclosure variants and the EXIF line;
    - the acknowledgment tied to the disclosure.
  - Errors: error mapping and retry rules.
  - Payload:
    - truncation;
    - license mapping;
    - thumbnail crop and segment stripping, using a fixture JPEG with APP1 and COM;
    - preview release.
  - Lifecycle:
    - state surviving receipt resets;
    - the Previous upload block;
    - the toast and the unload rule.
  - Share panel matching.
  - `bindHubPublication`.
  - `HubLinkResult` and `UploadResult`: the first tests in `src/components/upload/`.
- **Contract test:**
  - The viewer's payload builder output passes a copy of the Hub's creation rules (limits, keys, credential parameters).
  - The copy cites the Hub commit it mirrors.
- **E2E:**
  - Hugging Face public (short) and private (`access: "private"`, long);
  - a private bucket upload;
  - the Previous upload block after an edit;
  - the Share panel copying the Hub link.

## 5. Owner actions (not part of this work)

1. Deploy the Hub with `npm run deploy` and check `/hub/`, a card, a preview and the manage page. Then tag the viewer release.
2. Optional: add a Transform Rule that sets `X-Hub-Verified-Bot` for known bots on `/hub/*`, and run `wrangler secret put VERIFIED_BOT_TOKEN`.
3. Optional: add a WAF rate-limiting rule for `/hub/*`.
4. Set the privacy and terms effective dates in the release commit.
5. Decide whether the Google OAuth verification submission needs the updated dataflow. The scopes don't change.

## 6. Traceability

| ID | Fix | § |
|---|---|---|
| H1 | Privacy policy, terms and OAuth docs | 3 |
| H2 | /64 key; long names for non-public data; optional WAF rule | 1.2, 1.1, 5 |
| H3 | Storage only while needed; `deleteAll()`; old class deleted | 1.2 |
| H4 | Disclosure line; acknowledgment tied to it | 2.3 |
| H5 | Hub state outlives the receipt; visible delete row; toast; unload rule | 2.4 |
| M1 | No writes on hits; one guard call per request | 1.2 |
| M2 | Tolerant reads; gallery skips bad entries | 1.4 |
| M3 | Cross-site subresource rule | 1.3 |
| M4 | Verified-bot threshold; previews cached 5 minutes | 1.3, 1.4 |
| M5 | Listings flag, off by default | 1.3 |
| M6 | Validate at creation; decode once with a plain loop | 1.4 |
| M7 | Typed errors; Retry only when it can help; preview re-capture; 409 when no name is free | 2.4, 1.4 |
| M8 | Internal hosts count as private; three-outcome check | 2.2 |
| M9 | EXIF sentence | 2.3 |
| M10 | Share panel uses the Hub link | 2.5 |
| M11 | Tests | 4 |
| L1 | Dataset name helper; no synthetic description | 2.6 |
| L2 | License name and URL | 2.6 |
| L3 | Hugging Face validation matches the Hub | 2.6 |
| L4 | Three outcomes; "Checking public access…" | 2.2 |
| L5 | Error mapping | 2.4 |
| L6 | Base URL rules | 2.1 |
| L7 | Whitespace, word-boundary cut, "…" | 2.6 |
| L8 | HTML error pages | 1.4 |
| L9 | 308 for a trailing slash; letter-case resolution | 1.4 |
| L10 | Assets served without the Worker; preview caching | 1.7, 1.4 |
| L11 | Presigned-URL credential parameters | 1.3 |
| L12 | `If-None-Match` header | 1.4 |
| L13 | Manage page | 1.5 |
| L14 | Taller player; cover-crop thumbnail | 1.5, 2.6 |
| L15 | Focus, accessible names, `alt=""` | 1.5, 2.7 |
| L16 | README; footer links | 3, 1.6 |
| L17 | Preview released; private bucket drafts are now intended | 2.6 |
| Owner | Hub pages and new viewer UI match ColmapView | 1.6, 2.7 |

The conciseness, optimization and simplification items are covered in §1.2, §1.4, §1.5, §1.7, §2.4 and §2.8.

## Out of scope

- Moderation tools.
- Gallery ordering or search.
- Renaming existing IDs.
- An opt-out from Hub cards.
- Server-side fetching of dataset URLs, which AGENTS.md forbids.
- Accounts.
