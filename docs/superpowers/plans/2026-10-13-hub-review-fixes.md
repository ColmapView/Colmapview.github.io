# ColmapView Hub Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 33 findings from the 2026-10-13 Hub review, plus its conciseness, optimization and simplification items, in the Hub Worker and the viewer. Hub pages and new viewer UI follow ColmapView's design.

**Architecture:**
- **Part A (Hub):**
  - The Worker learns `access`: private links get one unguessable name, and public links keep short word pairs.
  - It reads stored records tolerantly.
  - It replaces the leaky per-IP guard with a storage-free-when-idle `LookupGuard`.
  - It renders every page in a byte-for-byte copy of ColmapView's public-page stylesheet.
- **Part B (viewer):**
  - Every upload, where the Hub is enabled, creates a card whose name length follows access.
  - Hub state lives in its controller, so it outlives upload receipts.
  - A disclosure line, a visible delete link and typed errors replace the silent flow.

**Tech Stack:**
- **Hub:** Cloudflare Workers, R2 and SQLite Durable Objects (sync KV API), with `@cloudflare/vitest-plugin` and Playwright.
- **Viewer:** React 19, Zustand, Vite, Vitest with Testing Library, and Playwright.

**Spec:** `colmap-webview/docs/superpowers/specs/2026-10-13-hub-review-fixes-design.md` (commits 8935110 and f58a7df). Read it with this plan; section numbers below (§) refer to it.

## Global Constraints

Every task's requirements implicitly include this section.

**Scope and process**
- Work only on branch `hub-review-fixes` in both repos.
  - Part A creates the branch in `colmapview_hub`.
  - The viewer branch already exists.
  - No push, tag, release, deploy or Cloudflare dashboard change. Versions are bumped at release, not here.
- Commands assume the working directory `C:\Users\HEQ\Projects\colmap_webview` and start with `cd colmapview_hub` or `cd colmap-webview`. In the Bash tool, use `/c/Users/HEQ/Projects/colmap_webview`.
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Python, if ever needed: `uv run`.

**Gates**
- Hub: `npm run check` and `npm run test:browser`.
- Viewer:
  - `npm run check` and `npm run test:deployment`;
  - `npx playwright test --project=chromium --reporter=list`;
  - for the e2e step, use `COLMAP_WEBVIEW_E2E_PORT=5401` if 5187 is busy.

**Viewer code rules**
- Components never call `use*Store` directly; they go through `*StoreFacade` hooks (componentStoreBoundary).
- There is no Tailwind. A utility-looking class must exist in `src/index.css` (`classContract.test.ts`).
- New semantic classes are named `publication-*` and go in `src/components/upload/upload.css`.
- No new colors or sizes in viewer UI.
- Lint uses `js.configs.recommended`, so regex literals must not contain control characters (`no-control-regex`). Use char-code loops instead.

**Hub code rules (AGENTS.md)**
- Web Crypto only.
- Never fetch submitted URLs on the server.
- No User-Agent exemptions.
- No standalone submission form.
- Never commit `.dev.vars`, private dictionaries or runtime state.

**Exact copy (from the spec)**
- **Disclosure lines:**
  - Public: "Also creates a short ColmapView Hub link. Anyone with it sees the title, description and preview."
  - Private: "Also creates an unguessable ColmapView Hub link. Anyone with it sees the title, description and preview; the data still needs access."
  - Bucket: "Also creates a ColmapView Hub link (short if the bucket is public). Anyone with it sees the title, description and preview."
  - Original images, when access isn't private, append: "Original images keep their metadata, such as location."
- **Bucket notices:**
  - public: "Anyone can open this link."
  - private: "Private. Viewers need bucket access."
  - unknown: "Public access unconfirmed, so the Hub link is unguessable."
  - While checking: "Checking public access…"
- **Hub status:**
  - "Creating Hub link…"
  - The delete row label is "Private delete link (don't share)", with the link "Delete Hub link ↗".
  - Failure: "Hub link not created: <reason>. The link above still works."
- **Failure reasons:**
  - network: "Couldn't reach ColmapView Hub."
  - timeout: "ColmapView Hub didn't respond."
  - 429: "Too many requests from your network; try again in N min."
  - 5xx: "ColmapView Hub is unavailable."
  - otherwise the Hub's own message.
- **Toasts:**
  - "Hub link ready. Reopen the upload dialog to copy it and its delete link."
  - "Hub link not created. Reopen the upload dialog to retry."
- **Result titles:**
  - Hugging Face: "Published <repo>" / "Saved <repo> privately".
  - Drive: "Published to Google Drive" / "Saved privately to Google Drive".
  - Bucket: unchanged ("Dataset saved to bucket storage").
- **Hub pages** (heading / lede):
  - "Link not found" / "Check the address, or ask for a new link."
  - "Try again in N minutes" / "Too many missing links from your network."
  - "ColmapView Hub is unavailable" / "Try again in a few minutes."
  - Landing: "Share links for ColmapView results." / "Links are created when you publish from ColmapView." plus [Open ColmapView].
  - Manage page: "Delete Hub link “<title>”?" / "The dataset stays where it is.", with the button "Delete permanently".
  - Private card: "Viewers need access to open this dataset." plus "Open in ColmapView ↗".
- **Limits:** title 120; description 280; license name 160; license URL 2048, all UTF-16 units. Preview: JPEG 600 × 315, ≤ 64 KiB, no APP1/COM segments.
- **Guard numbers:**
  - 3 distinct misses in 10 minutes → a 10-minute block.
  - With a verified-bot token, 30 misses instead.
  - 20 creations per hour.
  - IPv6 is keyed by /64.
- **Stylesheet drift hash** (LF-normalized SHA-256 of the viewer's `public/policy.css` today): `3f4a63e60475947785a400fc0e804ffe1b011f558beca064d127db266ed1409e`.

## Review Focus

These are inputs the spec implies but its listed tests don't reach. Each line's test is added to the owning task.

1. **IPv6 spellings in `CF-Connecting-IP`:**
   - Upper case, zero-padded hextets, `::` in different places and hex-form IPv4-mapped addresses (`::ffff:c000:201`) must land in the same guard as their canonical forms.
   - Test: Task A4, Step 1 (`clientNetwork` table plus a request-level check).
2. **Cross-origin 429 from `colmapview.github.io`:**
   - The viewer must still read `Retry-After`, so the Hub must send `Access-Control-Expose-Headers: Retry-After`.
   - The viewer falls back to 60 s when the header is unreadable.
   - Tests: Task A6, Step 1, and Task B5, Step 1 (the "429 without Retry-After" row).
3. **A source URL carrying signed-URL credentials** (presigned bucket, `token=`):
   - The Hub answers 400.
   - The viewer shows the Hub's message without Retry, and the upload result stays usable.
   - Test: Task B5, Step 1 (the "400 rejection" row is not retryable).
4. **Closing the bucket dialog during "Checking public access…":**
   - Exactly one toast appears when the link finishes.
   - Reopening shows the delete row and ends the unload warning.
   - Tests: Task B5, Step 1 (toast) and Task B7, Step 1 (`markDeleteLinkSeen` on render).
5. **Titles with markup characters and curly quotes** must be escaped in the manage page heading and in `<title>`. Test: Task A5, Step 1.

## Execution Notes

- Run the tasks in order: A1 → A8, then B1 → B11. Part B depends on Part A's contract only through tests and the contract-test commit reference, but the deploy order (Hub first) makes this the natural build order.
- Each task leaves both of its repo's gates green. A task that changes Hub browser behavior updates `e2e/hub.spec.ts` in the same task.
- The Codex plan review happens before execution. The Codex branch gate runs after B11 on both branches:
  - `codex review --base <branch-point>` with stdin redirected (`< /dev/null`) and `timeout 300`;
  - check `grep '^\[mcp_servers' ~/.codex/config.toml` first.

## File Map

**Hub (`colmapview_hub`)**

| File | Responsibility |
|---|---|
| `src/shared/model.ts` | Types and limits: `LinkAccess`, `CardRecord`, `Ownership`, `MAX_RECORD_BYTES`, `MAX_WORDLIST_BYTES` |
| `src/worker/validation.ts` | Creation input rules (access, listed, credentials, loopback viewers), `base64Bytes`, JPEG preview check |
| `src/worker/records.ts` | Tolerant R2 reads (`readCard`, `readOwnership`), memoized word lists, gallery listing that skips bad entries |
| `src/worker/crypto.ts` | HMAC IDs (`deriveShortId`, `deriveLongId`), `clientNetwork` (/64), `equalSecrets` |
| `src/worker/ids.ts` (new) | Miss fingerprints (`missKey`), letter-case resolution (`lookupTarget`) |
| `src/worker/guard.ts` (new; replaces `clientGuard.ts`) | `LookupGuard` Durable Object on sync KV |
| `src/worker/pages.ts` | HTML pages in the ColmapView frame |
| `src/worker/index.ts` | Routing, creation, lookups, deletion, abuse controls, shared headers |
| `src/worker/env.d.ts` (new) | Optional `VERIFIED_BOT_TOKEN` binding type |
| `src/client/index.ts` | Play 3D and the manage page |
| `public/hub/` (new) | `colmapview.css` (copy), `styles.css`, `fonts/`, `favicon.ico`, built `assets/client.js` |
| `public/_headers` (new) | `nosniff` on static files |
| `scripts/check-colmapview-css.mjs` (new) | Stylesheet drift check, run by `npm run check` |
| `wrangler.jsonc` | Assets routing, `LOOKUP_GUARDS` binding, migration v2, `HUB_LISTINGS_ENABLED` |
| `tests/helpers.ts` (new) | Shared Workers test helpers |
| `tests/{create,reads,guard,pages,routes,abuse}.test.ts` (new) | Per-area Workers tests |
| `e2e/hub.spec.ts` | Browser checks |
| `README.md`, `AGENTS.md` | Docs |

**Viewer (`colmap-webview`)**

| File | Responsibility |
|---|---|
| `src/features/colmapviewHub/config.ts` (new) | `getHubBaseUrl()` |
| `src/features/colmapviewHub/payload.ts` (new) | Text normalization and the Hub request payload |
| `src/features/colmapviewHub/thumbnail.ts` | Cover crop, metadata stripping, base64 |
| `src/features/colmapviewHub/hubShareLinks.ts` (new) | Ready Hub links by provider, for the Share panel |
| `src/features/colmapviewHub/publication.ts` | Hub controller: access, typed errors, retries, toasts, delete-link tracking |
| `src/features/colmapviewHub/bindHubPublication.ts` (new) | Upload-completion and unload wiring shared by three runtimes |
| `src/features/colmapviewHub/disclosure.ts` (new) | Disclosure line text |
| `src/features/bucketStorage/publicAccess.ts` | `bucketAccess()` tri-state, `isInternalHost()` |
| `src/features/datasetPublishing/publicationMetadata.ts` | License names and URLs, form text rules |
| `src/features/datasetPublishing/publicationSnapshot.ts` | `getHubSource()`, `captureCurrentView()`, `getPublicationDatasetName()` |
| `src/features/{datasetPublishing,googleDrive,bucketStorage}/publicationRuntime.ts` | Runtime wiring |
| `src/store/reconstructionStore.ts`, `src/hooks/fileDropzoneLocalSources.ts`, `src/hooks/useFileDropzone.ts` | `sourceName` recorded at local load |
| `src/components/upload/{HubLink.tsx,UploadParts.tsx,useHubLink.ts,upload.css}` | Result, Hub status and Previous upload UI |
| `src/components/modals/{PublishDatasetModal,GoogleDrivePublishModal}.tsx`, `src/components/bucket/{BucketPublishModal,BucketConnectionForm}.tsx` | Dialogs |
| `src/components/viewer3d/panels/{SharePanel.tsx,sharePanelViewModel.ts,useSharePanelStoreFacade.ts}` | Share panel |
| `public/privacy.html`, `public/terms.html`, `README.md`, `docs/*.md`, `CHANGELOG.md` | Policy and docs |
| `src/theme/policyCssCopy.test.ts` (new) | Viewer side of the stylesheet drift check |
| `e2e/hugging-face-publish.spec.ts`, `e2e/hub-upload.spec.ts` (new), `e2e/fixtures/mock-bucket.ts` (new), `playwright.config.ts` | E2E |

---

# Part A — Hub Worker (`colmapview_hub`)

### Task A1: Test helpers and the creation contract

Accept `access`, refuse listings while they're off, and widen the credential denylist (spec: Hub API contract, §1.3 credential denylist; findings H2, M5, L11).

**Files:**
- Create: `colmapview_hub/tests/helpers.ts`, `colmapview_hub/tests/create.test.ts`
- Modify:
  - `colmapview_hub/src/shared/model.ts`, `src/worker/validation.ts`, `src/worker/index.ts`;
  - `wrangler.jsonc`, `worker-configuration.d.ts` (regenerated);
  - `tests/hub.test.ts`, `e2e/hub.spec.ts`.

**Interfaces:**
- Produces:
  - `type LinkAccess = 'public' | 'private'`.
  - `CreateLinkInput.access: LinkAccess` and `LinkRecord.access?: 'private'`.
  - `parseCreateInput(value: unknown): CreateLinkInput`.
- Produces in `tests/helpers.ts`:
  - constants: `origin`, `base`, `ip`, `owner`, `words`, `assets`, `listings`;
  - types: `LinkResult`, `LinkPayload`;
  - functions: `input()`, `request(path, init?, clientIp?, overrides?)`, `post()`, `create()`, `remove()`, `guard()`, `resetState()`.
  - `request` calls the Worker module directly with `{ ...env, ...overrides }`, so tests can override bindings.

- [ ] **Step 1: Create the branch**

```bash
cd colmapview_hub && git switch -c hub-review-fixes && git status --short
```
Expected: `Switched to a new branch 'hub-review-fixes'` and no changes listed.

- [ ] **Step 2: Create `tests/helpers.ts`**

```ts
import { env } from 'cloudflare:workers';
import { listDurableObjectIds, runInDurableObject } from 'cloudflare:test';
import { expect } from 'vitest';
import worker from '../src/worker/index';
import type { AssetSummary, CreateLinkInput, LinkAccess } from '../src/shared/model';
import { clientIdentity } from '../src/worker/crypto';
import { WORDLIST_KEY } from '../src/worker/records';
import { preview } from './fixtures/preview';

export const origin = 'https://colmapview.opsiclear.com';
export const base = `${origin}/hub`;
export const ip = '192.0.2.1';
export const owner = 'A'.repeat(43);
export const words = {
  adjectives: ['happy', 'funny', 'calm', 'bright', 'brave', 'gentle', 'quiet', 'quick'],
  nouns: ['tree', 'ball', 'stone', 'cloud', 'river', 'flower', 'mountain', 'forest'],
};
export const assets: AssetSummary = { format: 'zip', imageFormat: 'jpeg', colmap: { files: 5, cameras: 83, points: 83749 },
  images: 83, masks: 82, splats: 1, viewerSettings: true, preview: false };
/** Turns gallery listings on for one request. */
export const listings: Partial<Env> = { HUB_LISTINGS_ENABLED: 'true' };
export interface LinkResult { id: string; url: string; managementPath: string }
/** What a viewer sends. Viewers before access-aware links omit `access`. */
export type LinkPayload = Omit<CreateLinkInput, 'access' | 'listed'> & { access?: LinkAccess; listed?: boolean };

export function input(overrides: Partial<LinkPayload> = {}): LinkPayload {
  return { viewerUrl: `${origin}/?url=https%3A%2F%2Fdata.example%2Fmanifest.json#camera=43`, title: 'Demo reconstruction',
    description: 'A small test scene.', thumbnailBase64: preview, managementSecret: owner, listed: false, publicAcknowledged: true, ...overrides };
}

/** Calls the Worker module directly, so a test can override bindings such as the listings flag. */
export function request(path: string, init: RequestInit = {}, clientIp = ip, overrides: Partial<Env> = {}): Promise<Response> {
  const hubOrigin = overrides.HUB_ORIGIN ?? env.HUB_ORIGIN;
  const headers = new Headers(init.headers);
  headers.set('CF-Connecting-IP', clientIp);
  if (['POST', 'DELETE', 'OPTIONS'].includes(init.method ?? 'GET') && !headers.has('Origin')) headers.set('Origin', hubOrigin);
  return worker.fetch(new Request(`${hubOrigin}${env.HUB_PATH}${path}`, { ...init, headers }), { ...env, ...overrides });
}

export function post(payload: object, clientIp = ip, overrides: Partial<Env> = {}): Promise<Response> {
  return request('/api/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, clientIp, overrides);
}

export async function create(payload: object = input(), clientIp = ip, overrides: Partial<Env> = {}): Promise<LinkResult> {
  const response = await post(payload, clientIp, overrides);
  expect(response.status, await response.clone().text()).toBe(201);
  return response.json<LinkResult>();
}

export function remove(id: string, secret = owner, clientIp = ip): Promise<Response> {
  return request(`/api/links/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${secret}` } }, clientIp);
}

export async function guard(clientIp = ip) { return env.CLIENT_GUARDS.getByName(await clientIdentity(env.HUB_KEY, clientIp)); }

/** Clears this local fixture's bucket and guards. The Workers test plugin keeps storage between tests. Never touches production. */
export async function resetState(): Promise<void> {
  for (const object of (await env.LINKS.list()).objects) await env.LINKS.delete(object.key);
  for (const id of await listDurableObjectIds(env.CLIENT_GUARDS)) {
    await runInDurableObject(env.CLIENT_GUARDS.get(id), async (_, state) => {
      state.storage.sql.exec('DELETE FROM misses');
      state.storage.sql.exec('UPDATE guard SET blockedUntil = 0, creationStarted = 0, creationCount = 0');
      await state.storage.deleteAlarm();
    });
  }
  await env.LINKS.put(WORDLIST_KEY, JSON.stringify({ version: 1, ...words }));
}
```

- [ ] **Step 3: Point `tests/hub.test.ts` at the helpers**

1. Replace lines 1–57 of `tests/hub.test.ts` (the imports through `afterEach(() => { vi.restoreAllMocks(); });`) with this block:

```ts
import { env } from 'cloudflare:workers';
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ID_PATTERN, isListedId, MAX_REQUEST_BYTES } from '../src/shared/model';
import type { LinkRecord } from '../src/shared/model';
import { base64Url, deriveLegacyId, deriveShortId } from '../src/worker/crypto';
import { recordKey, WORDLIST_KEY } from '../src/worker/records';
import { preview } from './fixtures/preview';
import { assets, base, create, guard, input, ip, listings, origin, owner, request, resetState, words } from './helpers';

beforeEach(async () => {
  await resetState();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected external request'));
});
afterEach(() => { vi.restoreAllMocks(); });
```

2. In `describe('opt-in results gallery')`, every listed creation and every gallery request now passes the listings override:
   - Each `create(input({ listed: true, … }))` becomes `create(input({ listed: true, … }), ip, listings)`.
   - Each `request('/')` and ``request(`/?cursor=${next![1]}`)`` gets `{}, ip, listings` as its extra arguments, for example `request('/', {}, ip, listings)`.

- [ ] **Step 4: Write the failing tests in `tests/create.test.ts`**

```ts
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordKey } from '../src/worker/records';
import { create, input, ip, listings, origin, post, resetState } from './helpers';

beforeEach(async () => {
  await resetState();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected external request'));
});
afterEach(() => { vi.restoreAllMocks(); });

const stored = async (id: string) => (await env.LINKS.get(recordKey(id)))!.json<Record<string, unknown>>();
const recordCount = async () => (await env.LINKS.list({ prefix: 'links/' })).objects.length
  + (await env.LINKS.list({ prefix: 'listed/' })).objects.length;

describe('creation contract', () => {
  it('treats a request without access as public and stores access only on private links', async () => {
    const legacy = await create(input());
    const explicit = await create(input({ access: 'public', managementSecret: 'B'.repeat(43) }));
    const hidden = await create(input({ access: 'private', managementSecret: 'C'.repeat(43) }));
    expect((await stored(legacy.id)).access).toBeUndefined();
    expect((await stored(explicit.id)).access).toBeUndefined();
    expect((await stored(hidden.id)).access).toBe('private');
  });

  it.each(['shared', '', null, true, 'PRIVATE'])('rejects access %j without saving a record', async access => {
    expect((await post({ ...input(), access })).status).toBe(400);
    expect(await recordCount()).toBe(0);
  });

  it('refuses a listed private link with 400, and any listing with 403 while listings are off', async () => {
    expect((await post(input({ access: 'private', listed: true }), ip, listings)).status).toBe(400);
    const off = await post(input({ listed: true }));
    expect(off.status).toBe(403);
    expect(await off.json()).toEqual({ error: 'Listings are turned off.' });
    expect(await recordCount()).toBe(0);
    expect((await create(input({ listed: true }), ip, listings)).id).toMatch(/-L[A-Za-z0-9_-]{16}$/);
  });

  it.each(['X-Amz-Signature', 'x-amz-credential', 'X-Amz-Security-Token', 'x-goog-signature', 'X-Goog-Credential',
    'sig', 'signature', 'token', 'AWSAccessKeyId'])('rejects the %s credential parameter in the viewer URL, its source, and either fragment', async name => {
    const source = 'https://data.example/scene.zip';
    for (const viewerUrl of [
      `${origin}/?url=${encodeURIComponent(`${source}?${name}=secret`)}`,
      `${origin}/?url=${encodeURIComponent(`${source}#${name}=secret`)}`,
      `${origin}/?url=${encodeURIComponent(source)}&${name}=secret`,
      `${origin}/?url=${encodeURIComponent(source)}#${name}=secret`,
    ]) expect((await post(input({ viewerUrl }))).status, viewerUrl).toBe(400);
    expect(await recordCount()).toBe(0);
  });

  it('keeps camera fragments and ordinary source parameters', async () => {
    const link = await create(input({ viewerUrl: `${origin}/?url=${encodeURIComponent('https://data.example/scene.zip?download=1')}#camera=43` }));
    expect((await stored(link.id)).viewerUrl).toContain('#camera=43');
  });
});
```

- [ ] **Step 5: Run the new tests and watch them fail**

Run: `cd colmapview_hub && npx vitest run tests/create.test.ts`

Expected: FAIL.
- The `access` tests get 400 "Invalid link request." because `access` is an unknown key.
- The listing test gets 201 instead of 403.
- The credential tests for the new names get 201.

- [ ] **Step 6: Add `access` to the model**

In `src/shared/model.ts`, add the type after `isListedId` and update the two interfaces:

```ts
export type LinkAccess = 'public' | 'private';
```
```ts
export interface CreateLinkInput extends LinkMetadata {
  managementSecret: string;
  listed: boolean;
  access: LinkAccess;
  publicAcknowledged: true;
}

export interface LinkRecord extends LinkMetadata {
  schemaVersion: 1;
  id: string;
  ownerHash: string;
  fingerprint: string;
  createdAt: string;
  listed: boolean;
  /** Present only on private links; a missing value means public. */
  access?: 'private';
}
```

- [ ] **Step 7: Update the creation rules in `src/worker/validation.ts`**

1. Replace the `CREDENTIAL_PARAMS` constant and `rejectCredentials` with:

```ts
const CREDENTIAL_PARAMS = new Set(['access_token', 'refresh_token', 'secret_access_key', 'aws_secret_access_key', 'secretkey',
  'x-amz-signature', 'x-amz-credential', 'x-amz-security-token', 'x-goog-signature', 'x-goog-credential',
  'sig', 'signature', 'token', 'awsaccesskeyid']);

/** Query and fragment parameter names: a presigned link can carry credentials in either. */
function parameterNames(url: URL): string[] {
  return [...url.searchParams.keys(), ...new URLSearchParams(url.hash.slice(1)).keys()];
}

function rejectCredentials(url: URL): void {
  if (url.username || url.password || parameterNames(url).some(key => CREDENTIAL_PARAMS.has(key.toLowerCase()))) {
    throw new InputError('Use a viewer link without access credentials.');
  }
}
```

2. Replace `parseCreateInput` with:

```ts
const CREATE_KEYS = new Set(['viewerUrl', 'title', 'description', 'thumbnailBase64', 'license', 'assets', 'managementSecret', 'listed',
  'access', 'publicAcknowledged']);

export function parseCreateInput(value: unknown): CreateLinkInput {
  if (!isObject(value) || Object.keys(value).some(key => !CREATE_KEYS.has(key))) throw new InputError('Invalid link request.');
  if (value.publicAcknowledged !== true) throw new InputError('Confirm that this link and preview will be accessible to anyone with the link.');
  if (typeof value.managementSecret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.managementSecret)) throw new InputError('Management key is invalid.');
  if (value.access !== undefined && value.access !== 'public' && value.access !== 'private') throw new InputError('Access must be public or private.');
  if (value.listed !== undefined && typeof value.listed !== 'boolean') throw new InputError('Listing choice is invalid.');
  const access = value.access === 'private' ? 'private' : 'public';
  if (value.listed === true && access === 'private') throw new InputError('Private links cannot be listed.');
  return { ...parseMetadata(value), managementSecret: value.managementSecret, listed: value.listed === true, access, publicAcknowledged: true };
}
```

- [ ] **Step 8: Refuse listings while off, and store `access`, in `src/worker/index.ts`**

1. After `const input = parseCreateInput(await readBoundedJson(request));`, add:

```ts
  if (input.listed && env.HUB_LISTINGS_ENABLED !== 'true') return json({ error: 'Listings are turned off.' }, 403);
```

2. Replace the `const record: LinkRecord = …` line inside the allocation loop with:

```ts
    const record: LinkRecord = { ...metadata, schemaVersion: 1, id, ownerHash, fingerprint, createdAt: new Date().toISOString(),
      listed: input.listed, ...(input.access === 'private' ? { access: 'private' as const } : {}) };
```

- [ ] **Step 9: Add the listings flag to `wrangler.jsonc` and regenerate types**

In `"vars"`, add `"HUB_LISTINGS_ENABLED": "false"` after `"HUB_PATH": "/hub"`. Then:

```bash
cd colmapview_hub && npm run types && grep -n "HUB_LISTINGS_ENABLED" worker-configuration.d.ts
```
Expected: `HUB_LISTINGS_ENABLED: string;` inside `Env`.

- [ ] **Step 10: Keep the browser test unlisted**

In `e2e/hub.spec.ts`, change the first test so the browser test no longer depends on listings, which are now off by default:
1. Rename it to ``shows, plays, and deletes a result at ${width}px without a submission form``.
2. Send `listed: false` at both widths.
3. Replace both `toHaveCount(width === 360 ? 1 : 0)` with `toHaveCount(0)`.
4. Delete the line starting `if (width === 360) await expect(page.locator('a.gallery-card .asset-summary'))`.

- [ ] **Step 11: Run the tests and gates**

```bash
cd colmapview_hub && npx vitest run tests/create.test.ts && npm run check && npm run test:browser
```
Expected:
- `tests/create.test.ts` passes.
- `npm run check` passes typecheck, lint, all Workers tests and the dry-run build.
- The browser tests pass.

- [ ] **Step 12: Commit**

```bash
cd colmapview_hub && git add tests/helpers.ts tests/create.test.ts tests/hub.test.ts src/shared/model.ts src/worker/validation.ts src/worker/index.ts wrangler.jsonc worker-configuration.d.ts e2e/hub.spec.ts && git commit -m "Accept link access and refuse listings while they are off

Requests may say access public or private; a missing value stays public for
deployed viewers. Listing is refused while HUB_LISTINGS_ENABLED is off and for
private links. The credential denylist adds presigned-URL parameters and checks
fragments too. Tests share helpers that call the Worker with binding overrides.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A2: Tolerant reads, one preview decode, word-list cache and size limits

Covers §1.4 (findings M2, M6 and L12) and the optimization items.

**Files:**
- Create: `colmapview_hub/tests/reads.test.ts`
- Modify:
  - `src/shared/model.ts`, `src/worker/validation.ts`, `src/worker/records.ts`;
  - `src/worker/crypto.ts`, `src/worker/index.ts`, `src/worker/pages.ts`;
  - `tests/helpers.ts`, `tests/hub.test.ts`.

**Interfaces:**
- Consumes: Task A1's helpers and `LinkAccess`.
- Produces:
  - `MAX_RECORD_BYTES = 192 * 1024` and `MAX_WORDLIST_BYTES = 1024 * 1024`.
  - `interface CardRecord { id; title; description; viewerUrl; thumbnailBase64; license?; assets?; access: LinkAccess; listed: boolean }`.
  - `interface Ownership { ownerHash: string; fingerprint: string }`.
  - `readCard(bucket, id): Promise<CardRecord | null>` and `readOwnership(bucket, id): Promise<Ownership | null>`.
  - `readWordlists(bucket): Promise<Wordlists>`, memoized per isolate, and `resetWordlistCache()`.
  - `export interface Wordlists` in `crypto.ts`.
  - `base64Bytes(value: string): Uint8Array`.
- Removes: `parseStoredRecord` and `readRecord`.

- [ ] **Step 1: Write the failing tests in `tests/reads.test.ts`**

```ts
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordKey, resetWordlistCache, WORDLIST_KEY } from '../src/worker/records';
import { base64Bytes } from '../src/worker/validation';
import { preview } from './fixtures/preview';
import { create, input, ip, listings, post, remove, request, resetState } from './helpers';

beforeEach(async () => {
  await resetState();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected external request'));
});
afterEach(() => { vi.restoreAllMocks(); });

async function rewrite(id: string, change: (record: Record<string, unknown>) => Record<string, unknown>) {
  const record = await (await env.LINKS.get(recordKey(id)))!.json<Record<string, unknown>>();
  await env.LINKS.put(recordKey(id), JSON.stringify(change(record)));
}

describe('tolerant reads', () => {
  it('renders and deletes a record that no longer meets creation rules', async () => {
    const link = await create(input());
    await rewrite(link.id, record => {
      delete record.description;
      delete record.listed;
      return { ...record, viewerUrl: 'https://old-viewer.example/?url=https%3A%2F%2Fdata.example%2Fscene.zip&token=legacy',
        license: { id: 'cc-by-4.0' }, assets: { format: 'unknown' }, futureField: { nested: true } };
    });
    const card = await request(`/${link.id}`);
    expect(card.status).toBe(200);
    const html = await card.text();
    expect(html).toContain('Demo reconstruction');
    expect(html).toContain('https://old-viewer.example/');
    expect(html).toContain('cc-by-4.0');
    expect((await request(`/${link.id}/preview.jpg`)).status).toBe(200);
    expect((await remove(link.id)).status).toBe(204);
  });

  it('answers 503 for a record it cannot render, without counting strikes', async () => {
    const link = await create(input());
    await rewrite(link.id, record => { delete record.title; return record; });
    for (let index = 0; index < 4; index++) expect((await request(`/${link.id}`)).status).toBe(503);
    expect((await request('/missing-one')).status).toBe(404);
    expect((await request('/missing-two')).status).toBe(404);
  });

  it('serves the preview with a five-minute cache and never caches cards', async () => {
    const link = await create(input());
    const image = await request(`/${link.id}/preview.jpg`);
    expect(image.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(base64Bytes(preview));
    expect((await request(`/${link.id}`)).headers.get('Cache-Control')).toBe('no-store');
  });

  // workerd freezes timers during synchronous work, so this checks the one-pass decode's result, not its speed.
  it('decodes a 64 KiB preview string in one plain pass', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(64 * 1024));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    expect(base64Bytes(btoa(binary))).toEqual(bytes);
  });

  it('keeps a record larger than the request limit readable, and refuses one past the record limit', async () => {
    const link = await create(input());
    await rewrite(link.id, record => ({ ...record, viewerUrl: `https://colmapview.opsiclear.com/?url=x${'a'.repeat(150 * 1024)}` }));
    expect((await request(`/${link.id}`)).status).toBe(200);
    await rewrite(link.id, record => ({ ...record, viewerUrl: `https://colmapview.opsiclear.com/?url=x${'a'.repeat(200 * 1024)}` }));
    expect((await request(`/${link.id}`)).status).toBe(503);
  });

  it('logs and skips an invalid gallery listing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const valid = await create(input({ listed: true, title: 'Listed result' }), ip, listings);
    await env.LINKS.put('listed/BadListing-LAAAAAAAAAAAAAAAA.json', '{}', { customMetadata: { title: '', createdAt: 'never' } });
    const page = await request('/', {}, ip, listings);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain(valid.id);
    expect(warn).toHaveBeenCalledWith('Skipping an invalid listing', 'listed/BadListing-LAAAAAAAAAAAAAAAA.json', expect.any(Error));
  });

  it('reads the word lists once per isolate and retries after a failed read', async () => {
    await create(input());
    await env.LINKS.delete(WORDLIST_KEY);
    await create(input({ managementSecret: 'B'.repeat(43) }));
    resetWordlistCache();
    expect((await post(input({ managementSecret: 'C'.repeat(43) }))).status).toBe(503);
    await env.LINKS.put(WORDLIST_KEY, JSON.stringify({ version: 1, adjectives: ['calm'], nouns: ['river'] }));
    expect((await create(input({ managementSecret: 'D'.repeat(43) }))).id).toBe('CalmRiver');
  });

  it('accepts word lists larger than the request limit', async () => {
    const letters = (value: number) => value.toString(26).split('').map(digit => String.fromCharCode(97 + Number.parseInt(digit, 26))).join('');
    const nouns = Array.from({ length: 8192 }, (_, index) => `noun${letters(index).padStart(10, 'a')}`);
    const body = JSON.stringify({ version: 1, adjectives: ['calm'], nouns });
    expect(body.length).toBeGreaterThan(128 * 1024);
    await env.LINKS.put(WORDLIST_KEY, body);
    resetWordlistCache();
    expect((await create(input())).id).toMatch(/^Calm[A-Z][a-z]+$/);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd colmapview_hub && npx vitest run tests/reads.test.ts`

Expected: FAIL.
- `resetWordlistCache` and `base64Bytes` are not exported.
- The rewritten record answers 503 because `parseStoredRecord` re-runs creation rules.

- [ ] **Step 3: Add the limits and read types to `src/shared/model.ts`**

After `MAX_REQUEST_BYTES`:

```ts
/** A stored record adds hashes, an ID and timestamps to a request; this keeps every accepted request readable. */
export const MAX_RECORD_BYTES = 192 * 1024;
export const MAX_WORDLIST_BYTES = 1024 * 1024;
```

At the end of the file:

```ts
/** The fields pages render. */
export interface CardRecord {
  id: string;
  title: string;
  description: string;
  viewerUrl: string;
  thumbnailBase64: string;
  license?: LicenseInfo;
  assets?: AssetSummary;
  access: LinkAccess;
  listed: boolean;
}

export interface Ownership { ownerHash: string; fingerprint: string }
```

- [ ] **Step 4: Decode in one pass and drop stored-record parsing in `src/worker/validation.ts`**

1. Change the first import line to:

```ts
import { MAX_PREVIEW_BYTES, MAX_REQUEST_BYTES, PREVIEW_HEIGHT, PREVIEW_WIDTH } from '../shared/model';
import type { AssetSummary, CreateLinkInput, LicenseInfo, LinkMetadata } from '../shared/model';
```

2. Above `decodePreview`, add:

```ts
/** Bytes of a binary string, in one plain pass. */
function binaryBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function base64Bytes(value: string): Uint8Array {
  return binaryBytes(atob(value));
}
```

3. In `decodePreview`, replace `const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));` with `const bytes = binaryBytes(binary);`.

4. Delete the whole `parseStoredRecord` function.

- [ ] **Step 5: Export `Wordlists` from `src/worker/crypto.ts`**

Change `interface Wordlists { adjectives: string[]; nouns: string[] }` to `export interface Wordlists { adjectives: string[]; nouns: string[] }`.

- [ ] **Step 6: Replace `src/worker/records.ts`**

```ts
import { ID_PATTERN, isListedId, MAX_RECORD_BYTES, MAX_WORDLIST_BYTES } from '../shared/model';
import type { AssetSummary, CardRecord, LicenseInfo, ListedLink, LinkMetadata, Ownership } from '../shared/model';
import type { Wordlists } from './crypto';
import { isObject, parseAssetSummary } from './validation';

export const WORDLIST_KEY = 'internal/wordlists-v1.json';
export const recordKey = (id: string) => `${isListedId(id) ? 'listed' : 'links'}/${id}.json`;

/** Listing and content are committed in the same R2 object; unlisted keys are never scanned. A bad entry is logged and skipped. */
export async function listPublicRecords(bucket: R2Bucket, cursor?: string): Promise<{ links: ListedLink[]; cursor?: string }> {
  const page = await bucket.list({ prefix: 'listed/', limit: 12, include: ['customMetadata'], ...(cursor ? { cursor } : {}) });
  const links = page.objects.flatMap(object => {
    try { return [listedLink(object)]; }
    catch (error) { console.warn('Skipping an invalid listing', object.key, error); return []; }
  });
  return { links, ...(page.truncated ? { cursor: page.cursor } : {}) };
}

function listedLink(object: R2Object): ListedLink {
  const id = object.key.slice('listed/'.length, -'.json'.length);
  const title = object.customMetadata?.title;
  const createdAt = object.customMetadata?.createdAt;
  if (!ID_PATTERN.test(id) || !isListedId(id) || !title || title.length > 120 || !createdAt || !Number.isFinite(Date.parse(createdAt))) {
    throw new Error('Invalid public listing');
  }
  const assets = object.customMetadata?.assets;
  return { id, title, createdAt, ...(assets ? { assets: parseAssetSummary(JSON.parse(assets)) } : {}) };
}

async function readStoredJson(bucket: R2Bucket, id: string): Promise<unknown> {
  const object = await bucket.get(recordKey(id));
  if (!object) return undefined;
  if (object.size > MAX_RECORD_BYTES) throw new Error('Stored record is too large');
  try { return await object.json(); }
  catch (error) { throw new Error('Invalid stored record', { cause: error }); }
}

function isHttpUrl(value: string, protocols = ['http:', 'https:']): boolean {
  try { return protocols.includes(new URL(value).protocol); } catch { return false; }
}

function storedLicense(value: unknown): LicenseInfo | undefined {
  if (!isObject(value)) return undefined;
  const license: LicenseInfo = {
    ...(typeof value.id === 'string' && value.id ? { id: value.id } : {}),
    ...(typeof value.name === 'string' && value.name ? { name: value.name } : {}),
    ...(typeof value.url === 'string' && isHttpUrl(value.url, ['https:']) ? { url: value.url } : {}),
  };
  return Object.keys(license).length ? license : undefined;
}

function storedAssets(value: unknown): AssetSummary | undefined {
  try { return value === undefined ? undefined : parseAssetSummary(value); } catch { return undefined; }
}

/** What a page needs. Unknown keys and creation-only rules are ignored, so records written by older or newer Hubs keep rendering. */
export function toCardRecord(value: unknown, id: string): CardRecord {
  if (!isObject(value) || typeof value.title !== 'string' || !value.title.trim() || typeof value.viewerUrl !== 'string'
    || !isHttpUrl(value.viewerUrl) || typeof value.thumbnailBase64 !== 'string' || !value.thumbnailBase64) throw new Error('Invalid stored record');
  const license = storedLicense(value.license);
  const assets = storedAssets(value.assets);
  return { id, title: value.title, description: typeof value.description === 'string' ? value.description : '',
    viewerUrl: value.viewerUrl, thumbnailBase64: value.thumbnailBase64,
    ...(license ? { license } : {}), ...(assets ? { assets } : {}),
    access: value.access === 'private' ? 'private' : 'public', listed: isListedId(id) };
}

export async function readCard(bucket: R2Bucket, id: string): Promise<CardRecord | null> {
  const value = await readStoredJson(bucket, id);
  return value === undefined ? null : toCardRecord(value, id);
}

/** Deletion and the creation candidate check compare only these hashes. */
export async function readOwnership(bucket: R2Bucket, id: string): Promise<Ownership | null> {
  const value = await readStoredJson(bucket, id);
  if (value === undefined) return null;
  const record = isObject(value) ? value : {};
  return { ownerHash: typeof record.ownerHash === 'string' ? record.ownerHash : '',
    fingerprint: typeof record.fingerprint === 'string' ? record.fingerprint : '' };
}

let wordlists: Promise<Wordlists> | null = null;

/** Version-1 lists never change, so each isolate reads them once; a failed read is retried by the next request. */
export function readWordlists(bucket: R2Bucket): Promise<Wordlists> {
  wordlists ??= loadWordlists(bucket).catch((error: unknown) => { wordlists = null; throw error; });
  return wordlists;
}

/** Tests replace the lists between cases. */
export function resetWordlistCache(): void {
  wordlists = null;
}

async function loadWordlists(bucket: R2Bucket): Promise<Wordlists> {
  const object = await bucket.get(WORDLIST_KEY);
  if (!object || object.size > MAX_WORDLIST_BYTES) throw new Error('Private wordlists are unavailable');
  const value: unknown = await object.json();
  if (!isObject(value) || value.version !== 1) throw new Error('Invalid private wordlists');
  const list = (items: unknown): string[] => {
    if (!Array.isArray(items) || items.length < 1 || items.length > 8192 || items.some(word => typeof word !== 'string' || !/^[a-z]{3,14}$/.test(word))
      || new Set(items).size !== items.length) throw new Error('Invalid private wordlists');
    return items;
  };
  return { adjectives: list(value.adjectives), nouns: list(value.nouns) };
}

export function metadataFingerprint(metadata: LinkMetadata): string {
  return JSON.stringify([metadata.viewerUrl, metadata.title, metadata.description, metadata.thumbnailBase64, metadata.license?.id ?? '',
    metadata.license?.name ?? '', metadata.license?.url ?? '', ...(metadata.assets ? [metadata.assets] : [])]);
}
```

- [ ] **Step 7: Use the tolerant reads in `src/worker/index.ts`**

1. Replace the imports of `../shared/model`, `./records` and `./validation` with:

```ts
import type { CardRecord, LinkRecord, Ownership } from '../shared/model';
import { listPublicRecords, metadataFingerprint, readCard, readOwnership, readWordlists, recordKey } from './records';
import { base64Bytes, InputError, parseCreateInput, readBoundedJson } from './validation';
```

   Keep `import { ID_PATTERN } from '../shared/model';`.

2. In `response()`, replace `headers.set('Cache-Control', 'no-store');` with:

```ts
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
```

3. In `createLink`, replace the `replay` definition (callers already check ownership, so its first line was unreachable):

```ts
  const replay = (id: string, record: Ownership): Response => {
    if (!equalHashes(record.fingerprint, fingerprint)) throw new InputError('This draft changed. Create a new link instead.', 409);
    return result(id);
  };
```

4. Update the three reads in `createLink`:
   - `const legacy = await readRecord(env.LINKS, legacyId);` becomes `const legacy = await readOwnership(env.LINKS, legacyId);`, and `return replay(legacy);` becomes `return replay(legacyId, legacy);`.
   - `const existing = await Promise.all(ids.map(id => readRecord(env.LINKS, id)));` uses `readOwnership`, and the following loop becomes `for (const [index, record] of existing.entries()) if (record && equalHashes(record.ownerHash, ownerHash)) return replay(ids[index], record);`.
   - `const current = await readRecord(env.LINKS, id);` uses `readOwnership`, and `return replay(current);` becomes `return replay(id, current);`.

5. In `lookup`:
   - `let record: LinkRecord | null;` becomes `let record: CardRecord | null;`.
   - `readRecord(env.LINKS, id)` becomes `readCard(env.LINKS, id)`.
   - Replace the last two lines with:

```ts
  const body = image ? base64Bytes(record.thumbnailBase64) : cardPage(location, record);
  return response(request.method === 'HEAD' ? null : body, 200, image ? 'image/jpeg' : 'text/html; charset=utf-8',
    image ? { 'Cache-Control': 'public, max-age=300' } : {});
```

6. In `deleteLink`, `readRecord(env.LINKS, id)` becomes `readOwnership(env.LINKS, id)`.

- [ ] **Step 8: Type the card page with `CardRecord` in `src/worker/pages.ts`**

- Change `import type { AssetSummary, ListedLink, LinkRecord } from '../shared/model';` to `import type { AssetSummary, CardRecord, ListedLink } from '../shared/model';`.
- Change `export function cardPage(location: HubLocation, record: LinkRecord): string` to take `record: CardRecord`.

- [ ] **Step 9: Reset the word-list cache in tests**

1. In `tests/helpers.ts`:
   - Change `import { WORDLIST_KEY } from '../src/worker/records';` to `import { resetWordlistCache, WORDLIST_KEY } from '../src/worker/records';`.
   - Add `resetWordlistCache();` as the last line of `resetState()`.
2. In `tests/hub.test.ts`:
   - Change the records import to `import { recordKey, resetWordlistCache, WORDLIST_KEY } from '../src/worker/records';`.
   - Add `resetWordlistCache();` right after each `await env.LINKS.put(WORDLIST_KEY, …)` inside a test. That covers the collision, bounded-allocation and seventeen-letter tests.

- [ ] **Step 10: Run the tests and gates**

```bash
cd colmapview_hub && npx vitest run tests/reads.test.ts && npm run check && npm run test:browser
```
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
cd colmapview_hub && git add src tests && git commit -m "Read stored records tolerantly and decode previews once

Pages check only what they render, so records from older or newer Hubs keep
working; deletion and the candidate check read only the hashes. Previews decode
in one pass and are cached for five minutes; cards no longer decode them. Word
lists are read once per isolate, and records and word lists get their own size
limits. The gallery skips and logs a bad listing.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A3: Names follow access

Covers §1.1 and L12: private and listed links get one long name; 409 replaces 503 when no name is free.

**Files:**
- Modify: `colmapview_hub/src/worker/crypto.ts`, `src/worker/index.ts`, `tests/create.test.ts`, `tests/hub.test.ts`

**Interfaces:**
- Consumes: `readOwnership` and `readWordlists` (A2); `CreateLinkInput.access` (A1).
- Produces: `deriveLongId(key, secret, words, listed = false): Promise<string>`, which replaces `deriveLegacyId`.
- Error bodies:
  - 409 `{ error: 'This link name is taken. Create a new link.' }` for long names;
  - 409 `{ error: 'No free link name. Create a new link.' }` for short names;
  - 409 `{ error: 'This draft changed. Create a new link instead.' }` for changed retries.

- [ ] **Step 1: Write the failing tests**

1. Append to `tests/create.test.ts`:

```ts
describe('names follow access', () => {
  it('gives a private link one long name from the link: derivation, replays it, and refuses changed drafts', async () => {
    const link = await create(input({ access: 'private' }));
    expect(link.id).toBe(await deriveLongId(env.HUB_KEY, owner, words, false));
    expect(link.id).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+-[A-Za-z0-9_-]{16}$/);
    expect(await create(input({ access: 'private' }))).toEqual(link);
    expect((await post(input({ access: 'private', title: 'Changed' }))).status).toBe(409);
  });

  it('no longer probes the legacy long name for public requests, which keeps resolving', async () => {
    const legacy = await create(input({ access: 'private' }));
    const record = await stored(legacy.id);
    delete record.access;
    await env.LINKS.put(recordKey(legacy.id), JSON.stringify(record));
    const short = await create(input());
    expect(short.id).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+$/);
    expect((await request(`/${legacy.id}`)).status).toBe(200);
  });

  it('refuses a private request whose long name another owner holds', async () => {
    const id = await deriveLongId(env.HUB_KEY, owner, words, false);
    const other = await create(input({ access: 'private', managementSecret: 'B'.repeat(43) }));
    await env.LINKS.put(recordKey(id), JSON.stringify({ ...await stored(other.id), id }));
    const response = await post(input({ access: 'private' }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'This link name is taken. Create a new link.' });
  });

  it('answers 409 when every short name is taken', async () => {
    await env.LINKS.put(WORDLIST_KEY, JSON.stringify({ version: 1, adjectives: ['happy'], nouns: ['tree'] }));
    resetWordlistCache();
    await create(input());
    const response = await post(input({ managementSecret: 'B'.repeat(43), title: 'Replacement' }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'No free link name. Create a new link.' });
  });
});
```

2. Extend the imports at the top of `tests/create.test.ts`:

```ts
import { deriveLongId } from '../src/worker/crypto';
import { recordKey, resetWordlistCache, WORDLIST_KEY } from '../src/worker/records';
import { create, input, ip, listings, origin, owner, post, request, resetState, words } from './helpers';
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd colmapview_hub && npx vitest run tests/create.test.ts`

Expected: FAIL.
- `deriveLongId` is not exported.
- The private link gets a short name.
- The exhaustion test gets 503.

- [ ] **Step 3: Rename the long-name derivation in `src/worker/crypto.ts`**

Replace the `deriveLegacyId` function and its comment with:

```ts
/** Private and listed links: one name with a 96-bit suffix. Also the scheme of unlisted links made before word pairs, which keep resolving. */
export async function deriveLongId(key: string, secret: string, words: Wordlists, listed = false): Promise<string> {
  const digest = await keyedHash(key, `${listed ? 'listed-link' : 'link'}:${secret}`);
  return `${wordPair(digest, words)}-${listed ? 'L' : ''}${base64Url(digest.slice(4, 16))}`;
}
```

- [ ] **Step 4: Replace `createLink` in `src/worker/index.ts`**

1. Change the crypto import to `import { clientIdentity, deriveLongId, deriveShortId, equalHashes, hash } from './crypto';`.
2. Change the model type import to `import type { CardRecord, LinkMetadata, LinkRecord, Ownership } from '../shared/model';`.
3. Replace the whole `createLink` function:

```ts
async function createLink(request: Request, env: Env, location: HubLocation): Promise<Response> {
  if (!allowedOrigin(request, location)) return json({ error: 'This origin cannot create links.' }, 403);
  const guard = await guardFor(request, env);
  const delay = await guard.check();
  if (delay) return blocked(delay);
  const quota = await guard.admitCreation();
  if (quota) return blocked(quota);
  const input = parseCreateInput(await readBoundedJson(request));
  if (input.listed && env.HUB_LISTINGS_ENABLED !== 'true') return json({ error: 'Listings are turned off.' }, 403);
  const words = await readWordlists(env.LINKS);
  const ownerHash = await hash(input.managementSecret);
  const metadata: LinkMetadata = { viewerUrl: input.viewerUrl, title: input.title, description: input.description, thumbnailBase64: input.thumbnailBase64,
    ...(input.license ? { license: input.license } : {}), ...(input.assets ? { assets: input.assets } : {}) };
  const fingerprint = await hash(metadataFingerprint(metadata));
  const created = (id: string) => json({ id, url: `${location.base}/${id}`, managementPath: `${location.path}/manage/${id}` }, 201);
  /** The same owner retrying: identical content replays, changed content is refused. */
  const replay = (id: string, record: Ownership) => equalHashes(record.fingerprint, fingerprint)
    ? created(id) : json({ error: 'This draft changed. Create a new link instead.' }, 409);
  // Private and listed links get one long name; public links try sixteen short ones.
  const long = input.access === 'private' || input.listed;
  const ids = long ? [await deriveLongId(env.HUB_KEY, input.managementSecret, words, input.listed)]
    : [...new Set(await Promise.all(Array.from({ length: 16 }, (_, attempt) => deriveShortId(env.HUB_KEY, input.managementSecret, words, attempt))))];
  // Check every candidate before using a vacancy: an earlier collision may have been deleted
  // since this owner's first request. Its existing link must still win on a retry.
  const existing = await Promise.all(ids.map(id => readOwnership(env.LINKS, id)));
  for (const [index, record] of existing.entries()) if (record && equalHashes(record.ownerHash, ownerHash)) return replay(ids[index], record);
  const finalDelay = await guard.check();
  if (finalDelay) return blocked(finalDelay);
  for (const [index, id] of ids.entries()) {
    if (existing[index]) continue;
    const record: LinkRecord = { ...metadata, schemaVersion: 1, id, ownerHash, fingerprint, createdAt: new Date().toISOString(),
      listed: input.listed, ...(input.access === 'private' ? { access: 'private' as const } : {}) };
    const stored = await env.LINKS.put(recordKey(id), JSON.stringify(record), {
      onlyIf: new Headers({ 'If-None-Match': '*' }), httpMetadata: { contentType: 'application/json' },
      ...(record.listed ? { customMetadata: { title: record.title, createdAt: record.createdAt,
        ...(record.assets ? { assets: JSON.stringify(record.assets) } : {}) } } : {}),
    });
    if (stored) return created(id);
    const current = await readOwnership(env.LINKS, id);
    if (current && equalHashes(current.ownerHash, ownerHash)) return replay(id, current);
  }
  return json({ error: long ? 'This link name is taken. Create a new link.' : 'No free link name. Create a new link.' }, 409);
}
```

- [ ] **Step 5: Update the old tests in `tests/hub.test.ts`**

1. Change the crypto import to `import { base64Url, deriveLongId, deriveShortId } from '../src/worker/crypto';`.
2. In `fails bounded allocation without replacing a link when all candidate names are occupied`, change `expect(blocked.status).toBe(503);` to `expect(blocked.status).toBe(409);`.
3. Replace the test `keeps legacy suffixed links and their original creation retries and management keys valid` with:

```ts
  it('keeps legacy suffixed links readable and deletable, and replays them for private requests', async () => {
    const link = await create();
    const record = await (await env.LINKS.get(recordKey(link.id)))!.json<LinkRecord>();
    const legacyId = await deriveLongId(env.HUB_KEY, owner, words);
    await env.LINKS.delete(recordKey(link.id));
    await env.LINKS.put(recordKey(legacyId), JSON.stringify({ ...record, id: legacyId }));
    expect((await request(`/${legacyId}`)).status).toBe(200);
    expect((await request(`/${legacyId}/preview.jpg`, { method: 'HEAD' })).status).toBe(200);
    expect(await create(input({ access: 'private' }))).toEqual({ id: legacyId, url: `${base}/${legacyId}`, managementPath: `/hub/manage/${legacyId}` });
    expect((await request(`/api/links/${legacyId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${owner}` } })).status).toBe(204);
  });
```

- [ ] **Step 6: Run the tests and gates**

```bash
cd colmapview_hub && npx vitest run tests/create.test.ts tests/hub.test.ts && npm run check && npm run test:browser
```
Expected: all pass, including the concurrency test `does not overwrite a record when concurrent drafts reuse an ownership key` with the `If-None-Match` header.

- [ ] **Step 7: Commit**

```bash
cd colmapview_hub && git add src/worker/crypto.ts src/worker/index.ts tests/create.test.ts tests/hub.test.ts && git commit -m "Give private links one unguessable name

Private requests use the long link: derivation, so retries replay and legacy
unlisted links keep resolving; public requests no longer probe it. Another
owner holding the name, or no free short name, answers 409. Create-only writes
use an If-None-Match header.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A4: `LookupGuard`: no storage when idle, one call per request, IPv6 /64

Covers §1.2 (findings H2, H3 and M1).

**Files:**
- Create: `colmapview_hub/src/worker/guard.ts`, `src/worker/ids.ts`, `tests/guard.test.ts`
- Delete: `colmapview_hub/src/worker/clientGuard.ts`
- Modify:
  - `src/worker/crypto.ts`, `src/worker/index.ts`;
  - `wrangler.jsonc`, `worker-configuration.d.ts`;
  - `tests/helpers.ts`, `tests/hub.test.ts`.

**Interfaces:**
- Consumes: `readCard` and `readOwnership` (A2).
- Produces:
  - Constants: `MISS_WINDOW_MS`, `BLOCK_MS`, `CREATE_WINDOW_MS`, `MAX_MISSES = 3`, `VERIFIED_BOT_MAX_MISSES = 30`, `MAX_CREATES = 20`.
  - `interface GuardState { misses: Record<string, number>; blockedUntil?: number; creations?: { started: number; count: number } }`.
  - `class LookupGuard` with `lookup(missFingerprint: string | null, maxMisses = MAX_MISSES): Promise<number>` and `admitCreation(): Promise<number>`, both returning the wait in seconds or 0.
  - Binding: `env.LOOKUP_GUARDS`.
  - `clientNetwork(ip): string` in `crypto.ts`.
  - `missKey(id): string` in `ids.ts`.

- [ ] **Step 1: Write the failing tests in `tests/guard.test.ts`**

```ts
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientNetwork } from '../src/worker/crypto';
import { BLOCK_MS, MISS_WINDOW_MS, type GuardState } from '../src/worker/guard';
import { create, guard, input, ip, request, resetState } from './helpers';

beforeEach(async () => {
  await resetState();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected external request'));
});
afterEach(() => { vi.restoreAllMocks(); });

const storage = async (clientIp = ip) => runInDurableObject(await guard(clientIp), async (_, state) => ({
  keys: [...state.storage.kv.list()].map(([key]) => key),
  state: state.storage.kv.get<GuardState>('state'),
  alarm: await state.storage.getAlarm(),
}));

function countingGuards() {
  const calls: string[] = [];
  const stub = {
    lookup: async (miss: string | null) => { calls.push(miss === null ? 'lookup' : 'lookup-miss'); return 0; },
    admitCreation: async () => { calls.push('admitCreation'); return 0; },
  };
  return { calls, overrides: { LOOKUP_GUARDS: { getByName: () => stub } as unknown as Env['LOOKUP_GUARDS'] } };
}

describe('lookup guard', () => {
  it('keeps no storage for a client that only finds links', async () => {
    const link = await create(input());
    for (const path of [`/${link.id}`, `/${link.id}/preview.jpg`]) {
      for (const method of ['GET', 'HEAD']) expect((await request(path, { method }, '192.0.2.9')).status).toBe(200);
    }
    expect(await storage('192.0.2.9')).toEqual({ keys: [], state: undefined, alarm: null });
  });

  it('writes each new miss once, ignores repeats, and keeps the alarm on the earliest expiry', async () => {
    await request('/missing'); await request('/missing/preview.jpg'); await request('/missing', { method: 'HEAD' });
    const first = await storage();
    expect(Object.keys(first.state!.misses)).toHaveLength(1);
    const firstExpiry = Object.values(first.state!.misses)[0] + MISS_WINDOW_MS;
    expect(first.alarm).toBe(firstExpiry);
    await request('/another');
    const second = await storage();
    expect(Object.keys(second.state!.misses)).toHaveLength(2);
    expect(second.alarm).toBe(firstExpiry);
  });

  it('blocks on the third distinct miss, drops the misses, and wakes at the block end', async () => {
    await request('/one'); await request('/two');
    expect((await request('/three')).status).toBe(429);
    const { state, alarm } = await storage();
    expect(state!.misses).toEqual({});
    expect(state!.blockedUntil! - Date.now()).toBeGreaterThan(BLOCK_MS - 60_000);
    expect(alarm).toBe(state!.blockedUntil);
  });

  it('deletes all storage when the alarm finds nothing pending', async () => {
    await request('/one');
    await runInDurableObject(await guard(), async (_, state) => {
      state.storage.kv.put('state', { misses: { stale: Date.now() - MISS_WINDOW_MS - 1 } } satisfies GuardState);
      await state.storage.setAlarm(Date.now() + 60_000);
    });
    expect(await runDurableObjectAlarm(await guard())).toBe(true);
    expect(await storage()).toEqual({ keys: [], state: undefined, alarm: null });
  });

  it('keeps pending entries through the alarm and re-arms it', async () => {
    const live = Date.now();
    await request('/one');
    await runInDurableObject(await guard(), async (_, state) => {
      state.storage.kv.put('state', { misses: { stale: live - MISS_WINDOW_MS - 1, fresh: live } } satisfies GuardState);
      await state.storage.setAlarm(Date.now() + 60_000);
    });
    expect(await runDurableObjectAlarm(await guard())).toBe(true);
    const { state, alarm } = await storage();
    expect(state).toEqual({ misses: { fresh: live } });
    expect(alarm).toBe(live + MISS_WINDOW_MS);
  });

  it('calls the guard once per request', async () => {
    const link = await create(input());
    const guards = countingGuards();
    const cases: Array<[string, RequestInit]> = [
      [`/${link.id}`, {}], [`/${link.id}/preview.jpg`, {}], ['/missing', {}],
      [`/api/links/${link.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${'B'.repeat(43)}` } }],
      ['/api/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input({ managementSecret: 'C'.repeat(43) })) }],
    ];
    for (const [path, init] of cases) {
      guards.calls.length = 0;
      await request(path, init, ip, guards.overrides);
      expect(guards.calls, path).toHaveLength(1);
    }
  });

  it('groups IPv6 clients by their /64 network and IPv4-mapped clients with IPv4', async () => {
    expect((await request('/one', {}, '2001:db8:1:2::1')).status).toBe(404);
    expect((await request('/two', {}, '2001:DB8:1:2:aaaa::2')).status).toBe(404);
    expect((await request('/three', {}, '2001:0db8:0001:0002:0000:0000:0000:0003')).status).toBe(429);
    expect((await request('/one', {}, '2001:db8:1:3::1')).status).toBe(404);
    expect((await request('/one', {}, '198.51.100.7')).status).toBe(404);
    expect((await request('/two', {}, '::ffff:198.51.100.7')).status).toBe(404);
    expect((await request('/three', {}, '::FFFF:c633:6407')).status).toBe(429);
  });

  it.each([
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['2001:0DB8:0000:0000:0000:0000:0000:0002', '2001:db8:0:0::/64'],
    ['2001:db8:1:2:aaaa::2', '2001:db8:1:2::/64'],
    ['::1', '0:0:0:0::/64'],
    ['::ffff:192.0.2.1', '192.0.2.1'],
    ['::ffff:c000:201', '192.0.2.1'],
    ['192.0.2.1', '192.0.2.1'],
    ['not-an-address', 'not-an-address'],
  ])('maps %s to the network %s', (address, network) => expect(clientNetwork(address)).toBe(network));

  it('counts letter-case variants of one guess once, but not changes inside a long suffix', async () => {
    await request('/funnyball'); await request('/FUNNYBALL'); await request('/FunnyBall');
    expect(Object.keys((await storage()).state!.misses)).toHaveLength(1);
    await request('/FunnyBall-AAAAAAAAAAAAAAAA');
    expect((await request('/FunnyBall-aaaaaaaaaaaaaaaa')).status).toBe(429);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd colmapview_hub && npx vitest run tests/guard.test.ts`

Expected: FAIL to compile: `../src/worker/guard` and `clientNetwork` don't exist.

- [ ] **Step 3: Create `src/worker/guard.ts`**

```ts
import { DurableObject } from 'cloudflare:workers';

export const MISS_WINDOW_MS = 10 * 60 * 1000;
export const BLOCK_MS = 10 * 60 * 1000;
export const CREATE_WINDOW_MS = 60 * 60 * 1000;
export const MAX_MISSES = 3;
export const VERIFIED_BOT_MAX_MISSES = 30;
export const MAX_CREATES = 20;
const STATE_KEY = 'state';

/** Distinct miss fingerprints with first-seen times, an active block, and the creation window. */
export interface GuardState {
  misses: Record<string, number>;
  blockedUntil?: number;
  creations?: { started: number; count: number };
}

/** The stored state without expired entries. */
function liveState(stored: GuardState | undefined, now: number): GuardState {
  return {
    misses: Object.fromEntries(Object.entries(stored?.misses ?? {}).filter(([, at]) => at + MISS_WINDOW_MS > now)),
    ...(stored?.blockedUntil && stored.blockedUntil > now ? { blockedUntil: stored.blockedUntil } : {}),
    ...(stored?.creations && stored.creations.started + CREATE_WINDOW_MS > now ? { creations: stored.creations } : {}),
  };
}

function nextExpiry(state: GuardState | undefined): number | null {
  if (!state) return null;
  const times = [...Object.values(state.misses).map(at => at + MISS_WINDOW_MS), ...(state.blockedUntil ? [state.blockedUntil] : []),
    ...(state.creations ? [state.creations.started + CREATE_WINDOW_MS] : [])];
  return times.length ? Math.min(...times) : null;
}

const isEmpty = (state: GuardState) => !Object.keys(state.misses).length && !state.blockedUntil && !state.creations;
const secondsUntil = (time: number, now: number) => Math.max(1, Math.ceil((time - now) / 1000));

/** Per-client lookup and creation limits. A client with nothing pending keeps no storage. */
export class LookupGuard extends DurableObject<Env> {
  /** One call per lookup, made after the record read: the wait in seconds, or 0. A hit writes nothing. */
  async lookup(missFingerprint: string | null, maxMisses: number = MAX_MISSES): Promise<number> {
    const now = Date.now();
    const stored = this.ctx.storage.kv.get<GuardState>(STATE_KEY);
    const state = liveState(stored, now);
    if (state.blockedUntil) return secondsUntil(state.blockedUntil, now);
    if (missFingerprint === null || missFingerprint in state.misses) return 0;
    const misses = { ...state.misses, [missFingerprint]: now };
    const next: GuardState = Object.keys(misses).length >= maxMisses
      ? { misses: {}, blockedUntil: now + BLOCK_MS, ...(state.creations ? { creations: state.creations } : {}) }
      : { ...state, misses };
    await this.save(stored, next);
    return next.blockedUntil ? secondsUntil(next.blockedUntil, now) : 0;
  }

  /** The creation quota; also refuses blocked clients. */
  async admitCreation(): Promise<number> {
    const now = Date.now();
    const stored = this.ctx.storage.kv.get<GuardState>(STATE_KEY);
    const state = liveState(stored, now);
    if (state.blockedUntil) return secondsUntil(state.blockedUntil, now);
    if (state.creations && state.creations.count >= MAX_CREATES) return secondsUntil(state.creations.started + CREATE_WINDOW_MS, now);
    await this.save(stored, { ...state, creations: { started: state.creations?.started ?? now, count: (state.creations?.count ?? 0) + 1 } });
    return 0;
  }

  async alarm(): Promise<void> {
    const state = liveState(this.ctx.storage.kv.get<GuardState>(STATE_KEY), Date.now());
    // At compatibility date 2026-02-24 and later, deleteAll() also removes the alarm.
    if (isEmpty(state)) { await this.ctx.storage.deleteAll(); return; }
    this.ctx.storage.kv.put(STATE_KEY, state);
    await this.ctx.storage.setAlarm(nextExpiry(state)!);
  }

  /** Callers save only changed state; the alarm moves only when the earliest expiry moves. */
  private async save(stored: GuardState | undefined, next: GuardState): Promise<void> {
    this.ctx.storage.kv.put(STATE_KEY, next);
    const expiry = nextExpiry(next);
    if (expiry !== null && expiry !== nextExpiry(stored)) await this.ctx.storage.setAlarm(expiry);
  }
}
```

- [ ] **Step 4: Create `src/worker/ids.ts`**

```ts
/** A requested name: a word pair in any letter case, with an optional long-name suffix kept as typed. */
const LOOSE_ID = /^([A-Za-z]{6,28})((?:-L?[A-Za-z0-9_-]{16})?)$/;

/** Fingerprint input for a miss: the word pair in lowercase, so letter-case variants of one guess count once. */
export function missKey(id: string): string {
  const match = LOOSE_ID.exec(id);
  return match ? match[1].toLowerCase() + match[2] : id;
}
```

- [ ] **Step 5: Key clients by network in `src/worker/crypto.ts`**

Replace `clientIdentity` with:

```ts
/** The eight hextets of an IPv6 address, or null when the text is not one. */
function ipv6Groups(value: string): number[] | null {
  let text = value.toLowerCase();
  let tail: number[] = [];
  const dotted = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (dotted) {
    const octets = dotted.slice(2, 6).map(Number);
    if (octets.some(octet => octet > 255)) return null;
    tail = [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
    text = dotted[1].endsWith('::') ? dotted[1] : dotted[1].slice(0, -1);
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => part ? part.split(':').map(group => /^[0-9a-f]{1,4}$/.test(group) ? Number.parseInt(group, 16) : Number.NaN) : [];
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const count = head.length + rest.length + tail.length;
  if ([...head, ...rest].some(Number.isNaN) || (halves.length === 1 ? count !== 8 : count > 7)) return null;
  return [...head, ...new Array<number>(8 - count).fill(0), ...rest, ...tail];
}

/** The network a guard counts together: an IPv4 address (also when IPv4-mapped) or an IPv6 /64 prefix. */
export function clientNetwork(ip: string): string {
  const value = ip.trim();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return value;
  const groups = ipv6Groups(value);
  if (!groups) return value;
  if (groups.slice(0, 5).every(group => group === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join('.');
  }
  return `${groups.slice(0, 4).map(group => group.toString(16)).join(':')}::/64`;
}

export async function clientIdentity(key: string, ip: string): Promise<string> {
  return hex(await keyedHash(key, `client:${clientNetwork(ip)}`));
}
```

- [ ] **Step 6: Use one guard call per request in `src/worker/index.ts`**

1. Replace `export { ClientGuard } from './clientGuard';` with:

```ts
import { MAX_MISSES } from './guard';
import { missKey } from './ids';
export { LookupGuard } from './guard';
```

2. In `guardFor`, use `env.LOOKUP_GUARDS.getByName(…)`.

3. In `createLink`:
   - Delete `const delay = await guard.check();` and `if (delay) return blocked(delay);`.
   - Rename `quota` to `wait`: `const wait = await guard.admitCreation(); if (wait) return blocked(wait);`.
   - Delete `const finalDelay = await guard.check();` and `if (finalDelay) return blocked(finalDelay);`.

4. Replace `lookup` with:

```ts
async function lookup(request: Request, env: Env, location: HubLocation, id: string, image: boolean, supported: boolean): Promise<Response> {
  const guard = await guardFor(request, env);
  let record: CardRecord | null;
  try { record = supported && ID_PATTERN.test(id) ? await readCard(env.LINKS, id) : null; }
  catch (error) { const wait = await guard.lookup(null, MAX_MISSES); if (wait) return blocked(wait); throw error; }
  const wait = await guard.lookup(record ? null : await hash(missKey(id)), MAX_MISSES);
  if (wait) return blocked(wait);
  if (!record) return notFound(location);
  const body = image ? base64Bytes(record.thumbnailBase64) : cardPage(location, record);
  return response(request.method === 'HEAD' ? null : body, 200, image ? 'image/jpeg' : 'text/html; charset=utf-8',
    image ? { 'Cache-Control': 'public, max-age=300' } : {});
}
```

5. Replace `deleteLink` with:

```ts
async function deleteLink(request: Request, env: Env, location: HubLocation, id: string): Promise<Response> {
  if (!allowedOrigin(request, location)) return json({ error: 'This origin cannot manage links.' }, 403);
  const guard = await guardFor(request, env);
  const secret = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  let owned = false;
  try {
    const record = secret && ID_PATTERN.test(id) ? await readOwnership(env.LINKS, id) : null;
    owned = secret ? equalHashes(record?.ownerHash ?? '0'.repeat(64), await hash(secret)) : false;
  } catch (error) { const wait = await guard.lookup(null, MAX_MISSES); if (wait) return blocked(wait); throw error; }
  // Treat both unknown IDs and incorrect ownership keys identically, including strikes.
  const wait = await guard.lookup(owned ? null : await hash(missKey(id)), MAX_MISSES);
  if (wait) return blocked(wait);
  if (!owned) return notFound(location);
  await env.LINKS.delete(recordKey(id));
  return response(null, 204);
}
```

6. In the `path === '/'` branch of `route`, replace the guard lines with one call:

```ts
    const guard = await guardFor(request, env);
    const wait = await guard.lookup(null, MAX_MISSES);
    if (wait) return blocked(wait);
```

   Then delete the two lines `const finalDelay = await guard.finishLookup(null);` and `if (finalDelay) return blocked(finalDelay);` that follow `listPublicRecords`.

- [ ] **Step 7: Replace the Durable Object class in `wrangler.jsonc`**

Replace the `durable_objects` and `migrations` blocks:

```jsonc
  "durable_objects": {
    "bindings": [
      {
        "name": "LOOKUP_GUARDS",
        "class_name": "LookupGuard"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": [
        "ClientGuard"
      ]
    },
    {
      "tag": "v2",
      "new_sqlite_classes": [
        "LookupGuard"
      ],
      "deleted_classes": [
        "ClientGuard"
      ]
    }
  ],
```

Then delete the old class and regenerate types:

```bash
cd colmapview_hub && git rm src/worker/clientGuard.ts && npm run types && grep -n "LOOKUP_GUARDS" worker-configuration.d.ts
```
Expected: `LOOKUP_GUARDS: DurableObjectNamespace<import("./src/worker/index").LookupGuard>;`

- [ ] **Step 8: Point the test helpers at the new guard**

1. In `tests/helpers.ts`, change `guard()` to use `env.LOOKUP_GUARDS`.
2. Replace the guard loop in `resetState()` with:

```ts
  for (const id of await listDurableObjectIds(env.LOOKUP_GUARDS)) {
    await runInDurableObject(env.LOOKUP_GUARDS.get(id), async (_, state) => { await state.storage.deleteAll(); });
  }
```

- [ ] **Step 9: Rewrite the guard internals in `tests/hub.test.ts`**

1. Add `import type { GuardState } from '../src/worker/guard';`.
2. Replace every `(await guard()).check()` with `(await guard()).lookup(null)`. A `lookup(null)` writes nothing and returns the current wait.
3. In `does not let concurrent misses reset the counter or evade the cooldown`, replace the two lines that read SQL rows with:

```ts
    const state = await runInDurableObject(await guard(), (_, storage) => storage.storage.kv.get<GuardState>('state'));
    expect(state!.blockedUntil).toBeGreaterThan(Date.now());
```

4. In `expires cooldowns and old guesses, and cleans up with an alarm`, replace the `runInDurableObject` block and the final assertion with:

```ts
    await runInDurableObject(stub, (_, state) => {
      state.storage.kv.put('state', { misses: {}, blockedUntil: Date.now() - 1,
        creations: { started: Date.now() - 3_600_001, count: 1 } } satisfies GuardState);
    });
    expect((await request(`/${link.id}`)).status).toBe(200);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await runInDurableObject(stub, (_, state) => [...state.storage.kv.list()].length)).toBe(0);
```

- [ ] **Step 10: Run the tests and gates**

```bash
cd colmapview_hub && npx vitest run tests/guard.test.ts tests/hub.test.ts && npm run check && npm run test:browser
```
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
cd colmapview_hub && git add -A src tests wrangler.jsonc worker-configuration.d.ts && git commit -m "Replace the client guard with LookupGuard

The guard keeps one small sync-KV value only while something is pending and
deletes it with its alarm, so idle clients leave no storage. Hits write
nothing, lookups call the guard once after the record read, and the alarm
moves only when the earliest expiry does. Clients are keyed by IPv4 or IPv6
/64, and letter-case variants of a guess count once. Migration v2 deletes the
old class's per-client storage.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A5: Pages in the ColmapView frame, static delivery and the look

Covers §1.5, §1.6 and §1.7 (findings L10, L13, L14, L15 and L16, plus the owner's design request).

**Files:**
- Create:
  - `colmapview_hub/public/hub/colmapview.css` (copy), `public/hub/fonts/ibm-plex-sans-latin-wght-normal.woff2` (copy), `public/hub/fonts/OFL.txt` (copy), `public/hub/favicon.ico` (copy);
  - `public/_headers`, `scripts/check-colmapview-css.mjs`, `tests/pages.test.ts`.
- Move and rewrite: `public/styles.css` → `public/hub/styles.css`.
- Modify:
  - `src/worker/pages.ts` (rewrite), `src/client/index.ts` (rewrite), `src/worker/index.ts`;
  - `wrangler.jsonc`, `worker-configuration.d.ts`, `scripts/build-client.mjs`, `.gitignore`, `eslint.config.js`, `package.json`;
  - `tests/hub.test.ts`, `e2e/hub.spec.ts` (rewrite).

**Interfaces:**
- Consumes: `CardRecord` (A2) and `MAX_MISSES` and `missKey` (A4).
- Produces from `pages.ts`:
  - `escapeHtml`, `assetLine(assets?)`, `HubLocation` (now with `local: boolean`), `hubLocation`;
  - `cardPage(location, record)`, `managementPage(location, record)`, `galleryPage(location, page)`, `landingPage(location)`;
  - `notFoundPage(location)`, `blockedPage(location, minutes)`, `unavailablePage(location)`, `errorPage(location, message)`.
- Produces in `index.ts`: `type View = 'card' | 'preview' | 'manage'`; `/hub/manage/<id>` now reads the record like a card lookup.
- Static paths: `/hub/colmapview.css`, `/hub/styles.css`, `/hub/fonts/…`, `/hub/favicon.ico`, `/hub/assets/client.js`.

- [ ] **Step 1: Write the failing Workers tests in `tests/pages.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assets, base, create, input, ip, listings, request, resetState } from './helpers';

beforeEach(async () => {
  await resetState();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected external request'));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('Hub pages', () => {
  it('shows the description, nonzero asset counts and the linked license, and uses the description for social cards', async () => {
    const link = await create(input({ assets: { ...assets, masks: 0 }, license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' } }));
    const html = await (await request(`/${link.id}`)).text();
    expect(html).toContain('<p class="lede">A small test scene.</p>');
    expect(html).toContain('<p class="meta">83 images · 83,749 points · 1 splat · License: <a href="https://creativecommons.org/licenses/by/4.0/" rel="noreferrer">CC BY 4.0</a></p>');
    expect(html).toContain('<meta name="twitter:description" content="A small test scene.">');
    expect(html).toContain('id="play"');
  });

  it('uses the asset line as the social description when there is none', async () => {
    const link = await create(input({ description: '', assets }));
    expect(await (await request(`/${link.id}`)).text()).toContain('<meta name="twitter:description" content="83 images · 83,749 points · 82 masks · 1 splat">');
  });

  it('shows a private card with a viewer link instead of Play 3D', async () => {
    const link = await create(input({ access: 'private' }));
    const html = await (await request(`/${link.id}`)).text();
    expect(html).not.toContain('id="play"');
    expect(html).toContain('<p class="note">Viewers need access to open this dataset.</p>');
    expect(html).toContain('Open in ColmapView<span aria-hidden="true"> ↗</span>');
  });

  it('wraps pages in the ColmapView frame and stylesheets', async () => {
    const link = await create(input());
    for (const path of [`/${link.id}`, '/missing-frame']) {
      const html = await (await request(path)).text();
      expect(html).toContain('<a class="brand" href="https://colmapview.opsiclear.com/about.html">ColmapView</a>');
      for (const [href, label] of [['/', 'Open viewer'], ['/about.html', 'About'], ['/privacy.html', 'Privacy'], ['/terms.html', 'Terms']]) {
        expect(html).toContain(`<a href="https://colmapview.opsiclear.com${href}">${label}</a>`);
      }
      expect(html).toContain('<p>ColmapView · Maintained by OpsiClear LLC</p>');
      expect(html).toContain('<a href="mailto:info@opsiclear.com">Contact</a>');
      expect(html).toContain('<p class="eyebrow">ColmapView Hub</p>');
      expect(html.indexOf('/hub/colmapview.css')).toBeLessThan(html.indexOf('/hub/styles.css'));
      expect(html).toContain('<link rel="icon" href="/hub/favicon.ico">');
      expect(html).toMatch(/<title>[^<]+ · ColmapView Hub<\/title>/);
    }
  });

  it('reads the record for the manage page and counts a missing one like a card lookup', async () => {
    const link = await create(input());
    const html = await (await request(`/manage/${link.id}`)).text();
    expect(html).toContain('<h1>Delete Hub link “Demo reconstruction”?</h1>');
    expect(html).toContain('<p class="lede">The dataset stays where it is.</p>');
    expect(html).toContain(`<img class="thumbnail" src="${base}/${link.id}/preview.jpg" width="600" height="315" alt="">`);
    expect(html).toContain('<button type="submit" class="button button-danger">Delete permanently</button>');
    expect(html).not.toContain('type="checkbox"');
    expect((await request('/manage/MissingOne')).status).toBe(404);
    expect((await request('/manage/MissingTwo')).status).toBe(404);
    expect((await request('/manage/MissingThree')).status).toBe(429);
  });

  it('escapes titles with markup and quotes in headings and the page title', async () => {
    const title = '"><script>alert(1)</script> “quoted”';
    const escaped = '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; “quoted”';
    const link = await create(input({ title }));
    for (const path of [`/${link.id}`, `/manage/${link.id}`]) {
      const html = await (await request(path)).text();
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain(escaped);
    }
    expect(await (await request(`/${link.id}`)).text()).toContain(`<title>${escaped} · ColmapView Hub</title>`);
  });

  it('allows fonts from the Hub itself', async () => {
    expect((await request('/missing-font')).headers.get('Content-Security-Policy')).toContain("font-src 'self'");
  });

  it('gives gallery images empty alt text, because the card text names the link', async () => {
    const link = await create(input({ listed: true, title: 'Listed result' }), ip, listings);
    const html = await (await request('/', {}, ip, listings)).text();
    expect(html).toContain(`<img src="/hub/${link.id}/preview.jpg" width="600" height="315" loading="lazy" alt="">`);
    expect(html).not.toContain('alt="Listed result"');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd colmapview_hub && npx vitest run tests/pages.test.ts`

Expected: FAIL. The old templates have no ColmapView frame, the manage page is static, the asset line differs and the CSP has no `font-src`.

- [ ] **Step 3: Copy ColmapView's public-page stylesheet, font and icon**

```bash
cd colmapview_hub && mkdir -p public/hub/fonts \
  && cp ../colmap-webview/public/policy.css public/hub/colmapview.css \
  && cp ../colmap-webview/public/fonts/ibm-plex-sans-latin-wght-normal.woff2 ../colmap-webview/public/fonts/OFL.txt public/hub/fonts/ \
  && cp ../colmap-webview/public/favicon.ico public/hub/favicon.ico \
  && git mv public/styles.css public/hub/styles.css && rm -rf public/assets
```

- [ ] **Step 4: Add the drift check `scripts/check-colmapview-css.mjs`**

```js
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// public/hub/colmapview.css is a byte-for-byte copy of colmap-webview/public/policy.css.
// colmap-webview/src/theme/policyCssCopy.test.ts pins the same hash: change both files and both hashes together.
const PINNED = '3f4a63e60475947785a400fc0e804ffe1b011f558beca064d127db266ed1409e';
const text = readFileSync(new URL('../public/hub/colmapview.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const actual = createHash('sha256').update(text).digest('hex');
if (actual !== PINNED) {
  console.error(`public/hub/colmapview.css changed (sha256 ${actual}). It must stay a copy of colmap-webview/public/policy.css: `
    + 'copy the viewer\'s file here, then update the pinned hash in this script and in colmap-webview/src/theme/policyCssCopy.test.ts.');
  process.exit(1);
}
```

In `package.json`, add `"check:css": "node scripts/check-colmapview-css.mjs",` and change `check` to `"npm run typecheck && npm run lint && npm run check:css && npm test && npm run build"`. Then:

```bash
cd colmapview_hub && npm run check:css && echo css-ok
```
Expected: `css-ok`.

- [ ] **Step 5: Write `public/hub/styles.css`**

Replace the moved file's contents with:

```css
/* Hub additions. colmapview.css, loaded first, is a copy of ColmapView's public-page stylesheet
   (colmap-webview/public/policy.css): fonts, tokens, light scheme, header, footer, buttons and cards. */
:root {
  --bg-void: #0a0a0a;
  --error: #b86b6b;
}

@media (prefers-color-scheme: light) {
  :root {
    --bg-void: #ffffff;
    --error: #a23c3c;
  }
}

[hidden] { display: none !important; }
.hub-content { max-width: 752px; padding-bottom: var(--sp-12); }
.meta, .note, .status { margin: 0; color: var(--text-secondary); font-size: 14px; }
.note { align-self: center; }
.status { margin-top: var(--sp-4); }
.status:empty { display: none; }
.status:focus-visible, .button:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
button.button { font: inherit; cursor: pointer; }
.button:disabled { opacity: 0.5; cursor: default; }
/* The viewer's primary and danger pairings. Danger text uses --bg-void, not white, to reach 4.5:1 in both schemes. */
.button-primary, .button-primary:hover { background: var(--accent); border-color: var(--accent); color: var(--bg-void); }
.button-danger, .button-danger:hover { background: var(--error); border-color: var(--error); color: var(--bg-void); }
.button-primary:hover:not(:disabled), .button-danger:hover:not(:disabled) { filter: brightness(1.1); }
.player { position: relative; overflow: hidden; aspect-ratio: 600 / 315; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-lg); }
.player img { display: block; width: 100%; height: 100%; object-fit: cover; }
.player .button-primary { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); }
.player.playing { aspect-ratio: auto; height: 70vh; }
.player iframe { display: block; width: 100%; height: 100%; border: 0; }
.thumbnail { display: block; width: 100%; height: auto; border: 1px solid var(--border-color); border-radius: var(--radius-lg); }
.gallery-card { display: grid; gap: var(--sp-2); padding: 0; overflow: hidden; text-decoration: none; }
.gallery-card img { display: block; width: 100%; height: auto; aspect-ratio: 600 / 315; object-fit: cover; }
.gallery-card > span { padding-inline: var(--sp-4); }
.gallery-card > span:last-child { padding-bottom: var(--sp-4); }
.gallery-title { font-weight: 600; }
```

- [ ] **Step 6: Serve static files without the Worker**

1. `public/_headers`:

```
/hub/*
  X-Content-Type-Options: nosniff
  X-Robots-Tag: noindex, nofollow, noarchive
```

2. In `wrangler.jsonc`, replace the `assets` block. The `ASSETS` binding goes away; the Worker no longer proxies static files.

```jsonc
  "assets": {
    "directory": "public",
    "run_worker_first": ["/hub", "/hub/*", "!/hub/assets/*", "!/hub/fonts/*", "!/hub/colmapview.css", "!/hub/styles.css", "!/hub/favicon.ico"]
  },
```

3. Update the build and ignore settings:
   - `scripts/build-client.mjs`: `outfile: 'public/hub/assets/client.js'`.
   - `.gitignore`: `public/assets/` becomes `public/hub/assets/`.
   - `eslint.config.js`: `'public/assets/**'` becomes `'public/hub/assets/**'`.

```bash
cd colmapview_hub && npm run types && grep -c "ASSETS" worker-configuration.d.ts
```
Expected: the count drops by the `ASSETS: Fetcher;` line. Type-library mentions inside the file may remain.

- [ ] **Step 7: Replace `src/worker/pages.ts`**

```ts
import { PREVIEW_HEIGHT, PREVIEW_WIDTH } from '../shared/model';
import type { AssetSummary, CardRecord, ListedLink } from '../shared/model';

/** ColmapView's own pages; the Hub shares their header and footer. */
const VIEWER = 'https://colmapview.opsiclear.com';

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

/** Nonzero counts only, for example "83 images · 83,749 points · 82 masks · 1 splat". */
export function assetLine(assets?: AssetSummary): string {
  if (!assets) return '';
  const count = (value: number, noun: string) => value ? `${value.toLocaleString('en-US')} ${noun}${value === 1 ? '' : 's'}` : '';
  return [count(assets.images, 'image'), count(assets.colmap.points, 'point'), count(assets.masks, 'mask'), count(assets.splats, 'splat')]
    .filter(Boolean).join(' · ');
}

export interface HubLocation {
  origin: string;
  path: string;
  base: string;
  /** True when the Hub itself runs on loopback, for local development. */
  local: boolean;
}

export function hubLocation(env: Env): HubLocation {
  const origin = new URL(env.HUB_ORIGIN);
  const local = origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname);
  if ((!local && origin.protocol !== 'https:') || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Invalid Hub origin');
  const path = env.HUB_PATH;
  if (path !== '' && (!/^\/(?:[a-z0-9-]+\/)*[a-z0-9-]+$/.test(path))) throw new Error('Invalid Hub path');
  return { origin: origin.origin, path, base: origin.origin + path, local };
}

const header = [
  '<header class="site-header">',
  `<a class="brand" href="${VIEWER}/about.html">ColmapView</a>`,
  '<nav class="site-nav" aria-label="Main navigation">',
  `<a href="${VIEWER}/">Open viewer</a>`,
  `<a href="${VIEWER}/about.html">About</a>`,
  `<a href="${VIEWER}/privacy.html">Privacy</a>`,
  `<a href="${VIEWER}/terms.html">Terms</a>`,
  '</nav></header>',
].join('');

const footer = [
  '<footer class="site-footer">',
  '<p>ColmapView · Maintained by OpsiClear LLC</p>',
  '<nav class="footer-links" aria-label="Footer navigation">',
  `<a href="${VIEWER}/about.html">About</a>`,
  `<a href="${VIEWER}/privacy.html">Privacy</a>`,
  `<a href="${VIEWER}/terms.html">Terms</a>`,
  '<a href="mailto:info@opsiclear.com">Contact</a>',
  '</nav></footer>',
].join('');

/** Every Hub page: ColmapView's public-page frame, stylesheets and icon. */
function page(location: HubLocation, title: string, body: string, metadata = ''): string {
  const asset = (file: string) => `${location.path}/${file}`;
  return [
    `<!doctype html><html lang="en" data-hub-path="${escapeHtml(location.path)}"><head>`,
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex,nofollow,noarchive">',
    `<title>${escapeHtml(title)} · ColmapView Hub</title>`,
    metadata,
    `<link rel="icon" href="${asset('favicon.ico')}">`,
    `<link rel="stylesheet" href="${asset('colmapview.css')}">`,
    `<link rel="stylesheet" href="${asset('styles.css')}">`,
    `<script type="module" src="${asset('assets/client.js')}"></script>`,
    '</head><body>',
    '<a class="skip-link" href="#main">Skip to content</a>',
    header,
    `<main id="main" tabindex="-1"><div class="hub-content">${body}</div></main>`,
    footer,
    '</body></html>',
  ].join('');
}

/** Eyebrow, heading and lede, as on ColmapView's public pages. */
function intro(heading: string, lede = '', extra = ''): string {
  return `<div class="page-intro"><p class="eyebrow">ColmapView Hub</p><h1>${escapeHtml(heading)}</h1>`
    + `${lede ? `<p class="lede">${escapeHtml(lede)}</p>` : ''}${extra}</div>`;
}

function socialMetadata(pageUrl: string, title: string, description: string): string {
  const image = `${pageUrl}/preview.jpg`;
  const [safeTitle, safeDescription] = [escapeHtml(title), escapeHtml(description)];
  return [
    `<link rel="canonical" href="${pageUrl}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:url" content="${pageUrl}">`,
    `<meta property="og:title" content="${safeTitle}">`,
    `<meta property="og:description" content="${safeDescription}">`,
    `<meta property="og:image" content="${image}">`,
    '<meta property="og:image:type" content="image/jpeg">',
    `<meta property="og:image:width" content="${PREVIEW_WIDTH}">`,
    `<meta property="og:image:height" content="${PREVIEW_HEIGHT}">`,
    `<meta property="og:image:alt" content="${safeTitle}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${safeTitle}">`,
    `<meta name="twitter:description" content="${safeDescription}">`,
    `<meta name="twitter:image" content="${image}">`,
    `<meta name="twitter:image:alt" content="${safeTitle}">`,
  ].join('');
}

export function cardPage(location: HubLocation, record: CardRecord): string {
  const pageUrl = `${location.base}/${record.id}`;
  const assets = assetLine(record.assets);
  const licenseName = record.license?.name || record.license?.id;
  const license = licenseName ? `License: ${record.license?.url
    ? `<a href="${escapeHtml(record.license.url)}" rel="noreferrer">${escapeHtml(licenseName)}</a>` : escapeHtml(licenseName)}` : '';
  const meta = [escapeHtml(assets), license].filter(Boolean).join(' · ');
  const privateLink = record.access === 'private';
  // Signing in inside an iframe is unreliable, so private cards open the viewer instead of playing inline.
  const player = `<div class="player" id="player"><img src="${pageUrl}/preview.jpg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" alt="${escapeHtml(record.title)}">`
    + (privateLink ? '' : `<button type="button" class="button button-primary" id="play" data-viewer-url="${escapeHtml(record.viewerUrl)}">Play 3D</button>`)
    + '</div>';
  const actions = '<div class="actions">'
    + `<a class="button" href="${escapeHtml(record.viewerUrl)}" target="_blank" rel="noopener noreferrer">Open in ColmapView<span aria-hidden="true"> ↗</span></a>`
    + (privateLink ? '<p class="note">Viewers need access to open this dataset.</p>' : '')
    + '</div>';
  return page(location, record.title, intro(record.title, record.description, meta ? `<p class="meta">${meta}</p>` : '') + player + actions,
    socialMetadata(pageUrl, record.title, record.description || assets || 'Explore this reconstruction in ColmapView.'));
}

export function managementPage(location: HubLocation, record: CardRecord): string {
  return page(location, 'Delete Hub link', intro(`Delete Hub link “${record.title}”?`, 'The dataset stays where it is.')
    + `<img class="thumbnail" src="${location.base}/${record.id}/preview.jpg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" alt="">`
    + '<form id="delete-link" class="actions"><button type="submit" class="button button-danger">Delete permanently</button></form>'
    + '<p id="status" class="status" role="status" tabindex="-1"></p>');
}

export function galleryPage(location: HubLocation, { links, cursor }: { links: ListedLink[]; cursor?: string }): string {
  const cards = links.map(link => {
    const assets = assetLine(link.assets);
    return `<a class="card gallery-card" href="${location.path}/${link.id}">`
      + `<img src="${location.path}/${link.id}/preview.jpg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" loading="lazy" alt="">`
      + `<span class="gallery-title">${escapeHtml(link.title)}</span>${assets ? `<span class="meta">${escapeHtml(assets)}</span>` : ''}</a>`;
  }).join('');
  const more = cursor ? `<div class="actions"><a class="button" href="${location.path}/?cursor=${encodeURIComponent(cursor)}">More results</a></div>` : '';
  return page(location, 'Shared results', intro('Shared results', 'Results listed by their creators.')
    + (cards ? `<div class="cards">${cards}</div>${more}` : '<p>No results listed yet.</p>'));
}

export function landingPage(location: HubLocation): string {
  return page(location, 'Share links', intro('Share links for ColmapView results.', 'Links are created when you publish from ColmapView.',
    `<div class="actions"><a class="button" href="${VIEWER}/">Open ColmapView</a></div>`));
}

export function notFoundPage(location: HubLocation): string {
  return page(location, 'Link not found', intro('Link not found', 'Check the address, or ask for a new link.'));
}

export function blockedPage(location: HubLocation, minutes: number): string {
  const wait = `Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  return page(location, wait, intro(wait, 'Too many missing links from your network.'));
}

export function unavailablePage(location: HubLocation): string {
  return page(location, 'ColmapView Hub is unavailable', intro('ColmapView Hub is unavailable', 'Try again in a few minutes.'));
}

export function errorPage(location: HubLocation, message: string): string {
  return page(location, 'Invalid request', intro('Invalid request', message));
}
```

- [ ] **Step 8: Replace `src/client/index.ts`**

```ts
const path = document.documentElement.dataset.hubPath ?? '';
const status = document.querySelector<HTMLElement>('#status');
const say = (text: string, focus = false) => {
  if (!status) return;
  status.textContent = text;
  if (focus) status.focus();
};

const play = document.querySelector<HTMLButtonElement>('#play');
if (play) play.onclick = () => {
  const url = new URL(play.dataset.viewerUrl!);
  url.searchParams.set('embed', '1');
  const frame = document.createElement('iframe');
  frame.src = url.href;
  frame.title = 'Interactive ColmapView viewer';
  frame.allowFullscreen = true;
  frame.setAttribute('allow', 'fullscreen');
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads');
  const player = document.querySelector<HTMLElement>('#player')!;
  player.classList.add('playing');
  player.replaceChildren(frame);
  frame.focus();
};

const deletion = document.querySelector<HTMLFormElement>('#delete-link');
if (deletion) {
  const button = deletion.querySelector<HTMLButtonElement>('button')!;
  const owner = location.hash.slice(1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(owner)) {
    button.disabled = true;
    say('This delete link is incomplete. Open the full link saved when the Hub link was created.');
  }
  deletion.addEventListener('submit', async event => {
    event.preventDefault();
    button.disabled = true;
    const id = location.pathname.split('/').at(-1)!;
    try {
      const response = await fetch(`${path}/api/links/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${owner}` } });
      if (response.status === 204) {
        history.replaceState(null, '', location.pathname);
        say('Hub link deleted.', true);
        return;
      }
      const minutes = Math.ceil(Number(response.headers.get('Retry-After') ?? 600) / 60);
      say(response.status === 429 ? `Too many missing links from your network. Try again in ${minutes} minutes.`
        : "This delete link doesn't match the Hub link.", true);
    } catch { say("Couldn't reach ColmapView Hub.", true); }
    button.disabled = false;
  });
}
```

- [ ] **Step 9: Route the manage page through a lookup in `src/worker/index.ts`**

1. Change the pages import to `import { cardPage, galleryPage, hubLocation, managementPage, notFoundPage } from './pages';`.

2. In `response()`, add `font-src 'self';` to the CSP string after `img-src 'self';`.

3. `notFound` becomes `function notFound(location: HubLocation): Response { return response(notFoundPage(location), 404); }`.

4. Replace `lookup` with:

```ts
type View = 'card' | 'preview' | 'manage';

async function lookup(request: Request, env: Env, location: HubLocation, id: string, view: View | null): Promise<Response> {
  const guard = await guardFor(request, env);
  let record: CardRecord | null;
  try { record = view && ID_PATTERN.test(id) ? await readCard(env.LINKS, id) : null; }
  catch (error) { const wait = await guard.lookup(null, MAX_MISSES); if (wait) return blocked(wait); throw error; }
  const wait = await guard.lookup(record ? null : await hash(missKey(id)), MAX_MISSES);
  if (wait) return blocked(wait);
  if (!record) return notFound(location);
  if (view === 'preview') {
    return response(request.method === 'HEAD' ? null : base64Bytes(record.thumbnailBase64), 200, 'image/jpeg', { 'Cache-Control': 'public, max-age=300' });
  }
  return response(request.method === 'HEAD' ? null : view === 'manage' ? managementPage(location, record) : cardPage(location, record));
}
```

5. In `route`, delete these three lines:
   - the `if (path === '/styles.css' || path === '/assets/client.js') { … }` block;
   - the `if (/^\/manage\/[^/]+$/.test(path)) …` line;
   - `if (path.startsWith('/api/') || path.startsWith('/assets/')) return notFound(location);`.

   Then replace the final three lines (`const parts…`, `const id…`, `return lookup(…)`) with:

```ts
  if (path.startsWith('/api/')) return notFound(location);
  const parts = path.slice(1).split('/');
  // Static files are served before the Worker runs; a request that still arrives here is a plain miss, not a strike.
  if (parts[0] === 'assets' || parts[0] === 'fonts' || parts[0].includes('.')) return notFound(location);
  if (parts[0] === 'manage') return lookup(request, env, location, decodeId(parts[1] ?? ''), parts.length === 2 ? 'manage' : null);
  const view: View | null = parts.length === 1 ? 'card' : parts.length === 2 && parts[1] === 'preview.jpg' ? 'preview' : null;
  return lookup(request, env, location, decodeId(parts[0]), view);
```

- [ ] **Step 10: Update the asset expectations in `tests/hub.test.ts`**

1. In the first test, replace the four `html` assertions with:

```ts
    expect(html).toContain('83 images · 83,749 points · 82 masks · 1 splat');
    expect(html).toContain('<meta name="twitter:description" content="A small test scene.">');
```

   Rename the test to `stores the asset summary and shows its nonzero counts`.

2. In `preserves legacy fingerprints and cards without inventing asset counts`, change `.not.toContain('aria-label="Dataset assets"')` to `.not.toContain('class="meta"')`.

3. In `has no submission form and shows only explicit listings`, change the expected text to `'83 images · 83,749 points · 82 masks · 1 splat'`.

- [ ] **Step 11: Replace `e2e/hub.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { preview } from '../tests/fixtures/preview';

const origin = 'http://localhost:5201';
interface Link { id: string; url: string; owner: string }

async function createLink(page: Page, overrides: Record<string, unknown> = {}): Promise<Link> {
  const owner = randomBytes(32).toString('base64url');
  const response = await page.request.post('/hub/api/links', { headers: { Origin: origin }, data: {
    viewerUrl: 'https://colmapview.opsiclear.com/?url=https%3A%2F%2Fdata.example%2Fmanifest.json#camera=43',
    title: 'Example reconstruction', description: 'Public metadata, private source permissions.',
    thumbnailBase64: preview, managementSecret: owner, publicAcknowledged: true,
    license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
    assets: { format: 'zip', imageFormat: 'jpeg', colmap: { files: 5, cameras: 83, points: 83749 },
      images: 83, masks: 82, splats: 1, viewerSettings: true, preview: false },
    ...overrides,
  } });
  expect(response.status()).toBe(201);
  return { ...await response.json() as { id: string; url: string }, owner };
}

const removeLink = (page: Page, link: Link) =>
  page.request.delete(`/hub/api/links/${link.id}`, { headers: { Origin: origin, Authorization: `Bearer ${link.owner}` } });

/** WCAG contrast of two computed rgb() colors. */
function contrast(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const [r, g, b] = color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
      .map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

for (const width of [1280, 360]) {
  test(`shows and plays a result at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const link = await createLink(page);
    try {
      await page.goto(link.url);
      await expect(page.getByRole('heading', { name: 'Example reconstruction', exact: true })).toBeVisible();
      await expect(page.locator('.meta')).toHaveText('83 images · 83,749 points · 82 masks · 1 splat · License: CC BY 4.0');
      await expect(page.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
      expect(await page.locator('#player img').evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])).toEqual([600, 315]);
      expect(await noHorizontalScroll(page)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`card-${width}.png`), fullPage: true });
      await page.route('https://colmapview.opsiclear.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Interactive viewer fixture</h1>' }));
      await page.getByRole('button', { name: 'Play 3D', exact: true }).click();
      const frame = page.locator('iframe');
      await expect(frame).toBeFocused();
      const [height, viewport] = await frame.evaluate(element => [element.getBoundingClientRect().height, innerHeight]);
      expect(Math.abs(height - viewport * 0.7)).toBeLessThanOrEqual(3);
      const embed = new URL((await frame.getAttribute('src'))!);
      expect(embed.searchParams.get('embed')).toBe('1');
      expect(embed.hash).toBe('#camera=43');
    } finally { await removeLink(page, link); }
  });
}

test('deletes a link from its delete link and moves focus to the result', async ({ page }) => {
  const link = await createLink(page);
  let deleted = false;
  try {
    await page.goto(`/hub/manage/${link.id}#${link.owner}`);
    await expect(page.getByRole('heading', { name: 'Delete Hub link “Example reconstruction”?' })).toBeVisible();
    await expect(page.getByText('The dataset stays where it is.')).toBeVisible();
    await expect(page.locator('img.thumbnail')).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
    const status = page.getByRole('status');
    await expect(status).toHaveText('Hub link deleted.');
    await expect(status).toBeFocused();
    deleted = true;
    expect(new URL(page.url()).hash).toBe('');
    expect((await page.request.get(link.url)).status()).toBe(404);
  } finally { if (!deleted) await removeLink(page, link); }
});

test('disables deletion when the delete link lost its key', async ({ page }) => {
  const link = await createLink(page);
  try {
    await page.goto(`/hub/manage/${link.id}`);
    await expect(page.getByRole('status')).toHaveText('This delete link is incomplete. Open the full link saved when the Hub link was created.');
    await expect(page.getByRole('button', { name: 'Delete permanently' })).toBeDisabled();
  } finally { await removeLink(page, link); }
});

test('shows a private card with a viewer link and no Play 3D', async ({ page }) => {
  const link = await createLink(page, { access: 'private' });
  try {
    await page.goto(link.url);
    await expect(page.getByRole('button', { name: 'Play 3D' })).toHaveCount(0);
    await expect(page.getByText('Viewers need access to open this dataset.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open in ColmapView' })).toHaveAttribute('target', '_blank');
  } finally { await removeLink(page, link); }
});

for (const colorScheme of ['dark', 'light'] as const) {
  test(`matches ColmapView in the ${colorScheme} color scheme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    const link = await createLink(page);
    try {
      for (const path of [new URL(link.url).pathname, `/hub/manage/${link.id}#${link.owner}`]) {
        await page.goto(path);
        const fonts = await page.evaluate(async () => {
          await document.fonts.ready;
          return [...document.fonts].filter(face => face.family.replace(/"/g, '') === 'IBM Plex Sans Variable').map(face => face.status);
        });
        expect(fonts).toContain('loaded');
        expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
          .toBe(colorScheme === 'dark' ? 'rgb(15, 15, 15)' : 'rgb(245, 245, 244)');
        const [foreground, background] = await page.locator('.button-primary, .button-danger')
          .evaluate(element => [getComputedStyle(element).color, getComputedStyle(element).backgroundColor]);
        expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
        for (const target of await page.locator('.site-nav a, .footer-links a, .brand, .button').all()) {
          expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
      }
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(link.url);
      expect(await noHorizontalScroll(page)).toBe(true);
    } finally { await removeLink(page, link); }
  });
}

test('serves static files without the Worker, with nosniff and revalidation', async ({ page }) => {
  for (const path of ['/hub/styles.css', '/hub/colmapview.css', '/hub/assets/client.js', '/hub/fonts/ibm-plex-sans-latin-wght-normal.woff2', '/hub/favicon.ico']) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()['x-content-type-options'], path).toBe('nosniff');
    expect(response.headers().etag, path).toBeTruthy();
  }
});

test('long titles stay within a narrow card and delete keys never enter public URLs', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const link = await createLink(page, { title: 'A'.repeat(120), viewerUrl: 'https://colmapview.github.io/latest/?url=https%3A%2F%2Fdata.example%2Fmanifest.json' });
  try {
    expect(new URL(link.url).hash).toBe('');
    await page.goto(link.url);
    expect(await noHorizontalScroll(page)).toBe(true);
  } finally { expect((await removeLink(page, link)).status()).toBe(204); }
});
```

- [ ] **Step 12: Run the tests and gates**

```bash
cd colmapview_hub && npx vitest run tests/pages.test.ts && npm run check && npm run test:browser
```
Expected: all pass. Look at the `card-1280.png` and `card-360.png` screenshots under `test-results/`. They should show the ColmapView header, the IBM Plex Sans text, the card, and the footer.

- [ ] **Step 13: Commit**

```bash
cd colmapview_hub && git add -A public scripts src tests e2e wrangler.jsonc worker-configuration.d.ts package.json .gitignore eslint.config.js && git commit -m "Render Hub pages in the ColmapView frame

Pages use a byte-for-byte copy of ColmapView's public-page stylesheet, its
font and icon, the same header and footer, and the viewer's primary and
danger pairings. A drift check pins the copy's hash. Cards show nonzero asset
counts and a linked license; private cards open the viewer instead of Play 3D.
The manage page reads the record like a card lookup and has one danger button.
Static files are served without the Worker, with nosniff.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A6: Routing: HTML errors, letter case, trailing slash, one place for headers

Covers §1.4's route and error rules (findings L8 and L9) and the simplification items.

**Files:**
- Create: `colmapview_hub/tests/routes.test.ts`
- Modify: `src/worker/ids.ts`, `src/worker/index.ts` (full replacement)

**Interfaces:**
- Consumes: everything from A1–A5.
- Produces:
  - `lookupTarget(id, words: () => Promise<Wordlists>): Promise<{ key: string; redirect: boolean } | null>` in `ids.ts`.
  - In `index.ts`: `finalize(request, location, result)`, `failure(location, api, status, message?)`, `blocked(location, api, seconds)`.
- API responses for allowed origins carry `Access-Control-Expose-Headers: Retry-After`.

- [ ] **Step 1: Write the failing tests in `tests/routes.test.ts`**

```ts
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordKey } from '../src/worker/records';
import { base, create, input, request, resetState } from './helpers';

beforeEach(async () => {
  await resetState();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected external request'));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('routes', () => {
  it('redirects a trailing slash with 308 before any lookup', async () => {
    const response = await request('/HappyTree/');
    expect(response.status).toBe(308);
    expect(response.headers.get('Location')).toBe(`${base}/HappyTree`);
    expect((await request('/one')).status).toBe(404);
    expect((await request('/two')).status).toBe(404);
  });

  it('resolves a short name typed in another letter case', async () => {
    const link = await create(input());
    const lower = link.id.toLowerCase();
    for (const [path, target] of [
      [`/${lower}`, `${base}/${link.id}`],
      [`/${link.id.toUpperCase()}/preview.jpg`, `${base}/${link.id}/preview.jpg`],
      [`/manage/${lower}`, `${base}/manage/${link.id}`],
    ]) {
      const response = await request(path);
      expect(response.status, path).toBe(308);
      expect(response.headers.get('Location')).toBe(target);
    }
  });

  it('answers unused and invalid word pairs identically, each as one strike', async () => {
    const unused = await request('/funnyball');
    const invalid = await request('/zzzzzzzzz');
    expect([unused.status, invalid.status]).toEqual([404, 404]);
    expect(await unused.text()).toBe(await invalid.text());
    expect((await request('/third-miss')).status).toBe(429);
  });

  it('keeps long-name suffixes case-sensitive', async () => {
    const link = await create(input({ access: 'private' }));
    const dash = link.id.indexOf('-');
    const [pair, suffix] = [link.id.slice(0, dash), link.id.slice(dash)];
    const redirected = await request(`/${pair.toLowerCase()}${suffix}`);
    expect(redirected.status).toBe(308);
    expect(redirected.headers.get('Location')).toBe(`${base}/${link.id}`);
    const flipped = suffix.replace(/[A-Za-z]/g, letter => letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase());
    expect((await request(`/${pair}${flipped}`)).status).toBe(404);
  });

  it('answers page routes with HTML pages and API routes with JSON', async () => {
    const missing = await request('/missing-page');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(await missing.text()).toContain('Check the address, or ask for a new link.');
    const apiMissing = await request('/api/links/MissingTree-AAAAAAAAAAAAAAAA', { method: 'DELETE', headers: { Authorization: `Bearer ${'B'.repeat(43)}` } });
    expect(apiMissing.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(await apiMissing.json()).toEqual({ error: 'Link not found.' });
    const blocked = await request('/missing-three');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('600');
    expect(await blocked.text()).toContain('Try again in 10 minutes');
  });

  it('shows the unavailable page for storage failures and keeps API errors in JSON', async () => {
    const link = await create(input());
    await env.LINKS.put(recordKey(link.id), 'not-json');
    const page = await request(`/${link.id}`);
    expect(page.status).toBe(503);
    expect(await page.text()).toContain('ColmapView Hub is unavailable');
    const api = await request('/api/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    expect(api.status).toBe(400);
    expect(await api.json()).toEqual({ error: 'Link request is not valid JSON.' });
  });

  it('removes the body from every HEAD response', async () => {
    const link = await create(input());
    for (const path of [`/${link.id}`, `/${link.id}/preview.jpg`, '/missing-head']) {
      expect(await (await request(path, { method: 'HEAD' })).text(), path).toBe('');
    }
  });

  it('lets allowed cross-origin callers read Retry-After', async () => {
    await request('/one'); await request('/two'); await request('/three');
    const response = await request('/api/links', { method: 'POST', headers: { Origin: 'https://colmapview.github.io', 'Content-Type': 'application/json' },
      body: JSON.stringify(input()) });
    expect(response.status).toBe(429);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://colmapview.github.io');
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe('Retry-After');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd colmapview_hub && npx vitest run tests/routes.test.ts`

Expected: FAIL. There is no 308 for slashes or letter case, page 429s are JSON, the API 404 is HTML, and no `Expose-Headers` header is sent.

- [ ] **Step 3: Add letter-case resolution to `src/worker/ids.ts`**

Append:

```ts
import { ID_PATTERN } from '../shared/model';
import type { Wordlists } from './crypto';

const titleCase = (word: string) => word[0].toUpperCase() + word.slice(1);
const wordSets = new WeakMap<Wordlists, { adjectives: Set<string>; nouns: Set<string> }>();

function setsFor(words: Wordlists) {
  let sets = wordSets.get(words);
  if (!sets) {
    sets = { adjectives: new Set(words.adjectives), nouns: new Set(words.nouns) };
    wordSets.set(words, sets);
  }
  return sets;
}

/**
 * The record key to read for a requested name, and whether a hit redirects to the canonical name.
 * A name in another letter case resolves through the private word lists. Unused and invalid word
 * pairs both still read R2 and both miss, so neither the answer nor its timing reveals the lists.
 */
export async function lookupTarget(id: string, words: () => Promise<Wordlists>): Promise<{ key: string; redirect: boolean } | null> {
  if (ID_PATTERN.test(id)) return { key: id, redirect: false };
  const match = LOOSE_ID.exec(id);
  if (!match) return null;
  const { adjectives, nouns } = setsFor(await words());
  const pair = match[1].toLowerCase();
  for (let split = 3; split <= pair.length - 3; split++) {
    const [adjective, noun] = [pair.slice(0, split), pair.slice(split)];
    if (adjectives.has(adjective) && nouns.has(noun)) return { key: titleCase(adjective) + titleCase(noun) + match[2], redirect: true };
  }
  return { key: pair + match[2], redirect: false };
}
```

Move the two import lines to the top of the file, above `LOOSE_ID`.

- [ ] **Step 4: Replace `src/worker/index.ts`**

```ts
import { ID_PATTERN } from '../shared/model';
import type { CardRecord, LinkMetadata, LinkRecord, Ownership } from '../shared/model';
import { clientIdentity, deriveLongId, deriveShortId, equalHashes, hash } from './crypto';
import { MAX_MISSES } from './guard';
import { lookupTarget, missKey } from './ids';
import { blockedPage, cardPage, errorPage, galleryPage, hubLocation, managementPage, notFoundPage, unavailablePage } from './pages';
import type { HubLocation } from './pages';
import { listPublicRecords, metadataFingerprint, readCard, readOwnership, readWordlists, recordKey } from './records';
import { base64Bytes, InputError, parseCreateInput, readBoundedJson } from './validation';
export { LookupGuard } from './guard';

const VIEWER_ORIGINS = ['https://colmapview.opsiclear.com', 'https://colmapview.github.io'];
const UNAVAILABLE = 'The Hub is temporarily unavailable. Please try again.';
type View = 'card' | 'preview' | 'manage';

function html(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers } });
}

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

const redirect = (target: string, status: 307 | 308) => new Response(null, { status, headers: { Location: target } });

/** Page routes answer with HTML pages; API routes answer with JSON. */
function failure(location: HubLocation, api: boolean, status: number, message?: string): Response {
  if (api) return json({ error: message ?? (status === 404 ? 'Link not found.' : UNAVAILABLE) }, status);
  if (status === 404) return html(notFoundPage(location), 404);
  if (status >= 500) return html(unavailablePage(location), status);
  return html(errorPage(location, message ?? 'This request is invalid.'), status);
}

function blocked(location: HubLocation, api: boolean, seconds: number): Response {
  const headers = { 'Retry-After': String(seconds) };
  return api ? json({ error: 'Too many attempts. Try again later.' }, 429, headers)
    : html(blockedPage(location, Math.ceil(seconds / 60)), 429, headers);
}

function contentSecurityPolicy(): string {
  return ["default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self'", "font-src 'self'",
    `frame-src ${VIEWER_ORIGINS.join(' ')}`, "connect-src 'self'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
}

function allowedOrigin(request: Request, location: HubLocation): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  if (origin === location.origin || VIEWER_ORIGINS.includes(origin)) return origin;
  try {
    const url = new URL(origin);
    return url.origin === origin && ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1'].includes(url.hostname) ? origin : null;
  } catch { return null; }
}

/** Shared headers, CORS for allowed API callers, and HEAD bodies removed, all in one place. */
function finalize(request: Request, location: HubLocation, result: Response): Response {
  const headers = new Headers(result.headers);
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Content-Security-Policy', contentSecurityPolicy());
  const origin = allowedOrigin(request, location);
  if (origin && new URL(request.url).pathname.startsWith(`${location.path}/api/`)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Expose-Headers', 'Retry-After');
    headers.set('Vary', 'Origin');
  }
  return new Response(request.method === 'HEAD' ? null : result.body, { status: result.status, headers });
}

async function guardFor(request: Request, env: Env) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) throw new Error('Client identity unavailable');
  return env.LOOKUP_GUARDS.getByName(await clientIdentity(env.HUB_KEY, ip));
}

async function createLink(request: Request, env: Env, location: HubLocation): Promise<Response> {
  if (!allowedOrigin(request, location)) return json({ error: 'This origin cannot create links.' }, 403);
  const guard = await guardFor(request, env);
  const wait = await guard.admitCreation();
  if (wait) return blocked(location, true, wait);
  const input = parseCreateInput(await readBoundedJson(request));
  if (input.listed && env.HUB_LISTINGS_ENABLED !== 'true') return json({ error: 'Listings are turned off.' }, 403);
  const words = await readWordlists(env.LINKS);
  const ownerHash = await hash(input.managementSecret);
  const metadata: LinkMetadata = { viewerUrl: input.viewerUrl, title: input.title, description: input.description, thumbnailBase64: input.thumbnailBase64,
    ...(input.license ? { license: input.license } : {}), ...(input.assets ? { assets: input.assets } : {}) };
  const fingerprint = await hash(metadataFingerprint(metadata));
  const created = (id: string) => json({ id, url: `${location.base}/${id}`, managementPath: `${location.path}/manage/${id}` }, 201);
  /** The same owner retrying: identical content replays, changed content is refused. */
  const replay = (id: string, record: Ownership) => equalHashes(record.fingerprint, fingerprint)
    ? created(id) : json({ error: 'This draft changed. Create a new link instead.' }, 409);
  // Private and listed links get one long name; public links try sixteen short ones.
  const long = input.access === 'private' || input.listed;
  const ids = long ? [await deriveLongId(env.HUB_KEY, input.managementSecret, words, input.listed)]
    : [...new Set(await Promise.all(Array.from({ length: 16 }, (_, attempt) => deriveShortId(env.HUB_KEY, input.managementSecret, words, attempt))))];
  // Check every candidate before using a vacancy: an earlier collision may have been deleted
  // since this owner's first request. Its existing link must still win on a retry.
  const existing = await Promise.all(ids.map(id => readOwnership(env.LINKS, id)));
  for (const [index, record] of existing.entries()) if (record && equalHashes(record.ownerHash, ownerHash)) return replay(ids[index], record);
  for (const [index, id] of ids.entries()) {
    if (existing[index]) continue;
    const record: LinkRecord = { ...metadata, schemaVersion: 1, id, ownerHash, fingerprint, createdAt: new Date().toISOString(),
      listed: input.listed, ...(input.access === 'private' ? { access: 'private' as const } : {}) };
    const stored = await env.LINKS.put(recordKey(id), JSON.stringify(record), {
      onlyIf: new Headers({ 'If-None-Match': '*' }), httpMetadata: { contentType: 'application/json' },
      ...(record.listed ? { customMetadata: { title: record.title, createdAt: record.createdAt,
        ...(record.assets ? { assets: JSON.stringify(record.assets) } : {}) } } : {}),
    });
    if (stored) return created(id);
    const current = await readOwnership(env.LINKS, id);
    if (current && equalHashes(current.ownerHash, ownerHash)) return replay(id, current);
  }
  return json({ error: long ? 'This link name is taken. Create a new link.' : 'No free link name. Create a new link.' }, 409);
}

async function lookup(request: Request, env: Env, location: HubLocation, id: string, view: View): Promise<Response> {
  const guard = await guardFor(request, env);
  let target: { key: string; redirect: boolean } | null = null;
  let record: CardRecord | null = null;
  try {
    target = await lookupTarget(id, () => readWordlists(env.LINKS));
    record = target ? await readCard(env.LINKS, target.key) : null;
  } catch (error) {
    const wait = await guard.lookup(null, MAX_MISSES);
    if (wait) return blocked(location, false, wait);
    throw error;
  }
  const wait = await guard.lookup(record ? null : await hash(missKey(id)), MAX_MISSES);
  if (wait) return blocked(location, false, wait);
  if (!record) return failure(location, false, 404);
  if (target?.redirect) return redirect(`${location.base}${view === 'manage' ? '/manage' : ''}/${record.id}${view === 'preview' ? '/preview.jpg' : ''}`, 308);
  if (view === 'preview') return new Response(base64Bytes(record.thumbnailBase64), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=300' } });
  return html(view === 'manage' ? managementPage(location, record) : cardPage(location, record));
}

/** A path no record can answer still counts as a miss, so probing sub-paths gains nothing. */
async function miss(request: Request, env: Env, location: HubLocation, id: string): Promise<Response> {
  const guard = await guardFor(request, env);
  const wait = await guard.lookup(await hash(missKey(id)), MAX_MISSES);
  return wait ? blocked(location, false, wait) : failure(location, false, 404);
}

async function deleteLink(request: Request, env: Env, location: HubLocation, id: string): Promise<Response> {
  if (!allowedOrigin(request, location)) return json({ error: 'This origin cannot manage links.' }, 403);
  const guard = await guardFor(request, env);
  const secret = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  let owned = false;
  try {
    const record = secret && ID_PATTERN.test(id) ? await readOwnership(env.LINKS, id) : null;
    owned = secret ? equalHashes(record?.ownerHash ?? '0'.repeat(64), await hash(secret)) : false;
  } catch (error) {
    const wait = await guard.lookup(null, MAX_MISSES);
    if (wait) return blocked(location, true, wait);
    throw error;
  }
  // Treat both unknown IDs and incorrect ownership keys identically, including strikes.
  const wait = await guard.lookup(owned ? null : await hash(missKey(id)), MAX_MISSES);
  if (wait) return blocked(location, true, wait);
  if (!owned) return failure(location, true, 404);
  await env.LINKS.delete(recordKey(id));
  return new Response(null, { status: 204 });
}

async function home(request: Request, env: Env, location: HubLocation, url: URL): Promise<Response> {
  const guard = await guardFor(request, env);
  const wait = await guard.lookup(null, MAX_MISSES);
  if (wait) return blocked(location, false, wait);
  const cursor = url.searchParams.get('cursor') ?? undefined;
  if (cursor && cursor.length > 2048) throw new InputError('Invalid page cursor.');
  return html(galleryPage(location, await listPublicRecords(env.LINKS, cursor)));
}

function decodeId(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

async function route(request: Request, env: Env, location: HubLocation): Promise<Response> {
  const url = new URL(request.url);
  if (url.origin !== location.origin || (url.pathname !== location.path && !url.pathname.startsWith(`${location.path}/`))) return failure(location, false, 404);
  const path = url.pathname.slice(location.path.length);
  if (path === '') return redirect(`${location.base}/`, 307);
  if (path.startsWith('/api/')) {
    if (request.method === 'OPTIONS') return allowedOrigin(request, location)
      ? new Response(null, { status: 204, headers: { 'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
      : new Response(null, { status: 403 });
    if (path === '/api/links' && request.method === 'POST') return createLink(request, env, location);
    const deletion = /^\/api\/links\/([^/]+)$/.exec(path);
    if (deletion && request.method === 'DELETE') return deleteLink(request, env, location, decodeId(deletion[1]));
    return failure(location, true, 404);
  }
  if (!['GET', 'HEAD'].includes(request.method)) return failure(location, false, 404);
  if (path === '/') return home(request, env, location, url);
  const parts = path.slice(1).split('/').map(decodeId);
  // Static files are served before the Worker runs; a request that still arrives here is a plain miss, not a strike.
  if (parts[0] === 'assets' || parts[0] === 'fonts' || parts[0].includes('.')) return failure(location, false, 404);
  if (parts[0] === 'manage') return parts.length === 2 && parts[1] ? lookup(request, env, location, parts[1], 'manage') : miss(request, env, location, path);
  if (parts.length === 2 && parts[1] === '') return redirect(`${location.base}/${encodeURIComponent(parts[0])}`, 308);
  if (parts.length === 1) return lookup(request, env, location, parts[0], 'card');
  if (parts.length === 2 && parts[1] === 'preview.jpg') return lookup(request, env, location, parts[0], 'preview');
  return miss(request, env, location, parts[0]);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let location: HubLocation;
    try { location = hubLocation(env); }
    catch { return json({ error: UNAVAILABLE }, 503, { 'Cache-Control': 'no-store' }); }
    const api = new URL(request.url).pathname.startsWith(`${location.path}/api/`);
    let result: Response;
    try { result = await route(request, env, location); }
    catch (error) {
      result = error instanceof InputError ? failure(location, api, error.status, error.message) : failure(location, api, 503);
    }
    return finalize(request, location, result);
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 5: Run the tests and gates**

```bash
cd colmapview_hub && npx vitest run && npm run check && npm run test:browser
```
Expected: all Workers tests pass. That includes `deletes the whole record only with the management key`: denied and missing deletions now both return `{"error":"Link not found."}`.

- [ ] **Step 6: Commit**

```bash
cd colmapview_hub && git add src tests && git commit -m "Answer page routes with HTML and resolve letter case

Page routes get HTML 404, 429 and 503 pages; the API keeps JSON. A trailing
slash and short names typed in another letter case redirect with 308, while
unused and invalid word pairs answer identically. Shared headers, CORS (now
exposing Retry-After) and HEAD bodies are handled once in fetch.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A7: Abuse controls: cross-site subresources, verified bots, listings and loopback

Covers §1.3 (findings M3, M4 and M5) and the loopback part of L11's context.

**Files:**
- Create: `colmapview_hub/tests/abuse.test.ts`, `src/worker/env.d.ts`
- Modify:
  - `src/worker/index.ts`, `src/worker/validation.ts`, `src/worker/crypto.ts`;
  - `tests/helpers.ts`, `e2e/hub.spec.ts`.

**Interfaces:**
- Consumes: `VERIFIED_BOT_MAX_MISSES` (A4); `landingPage` and `HubLocation.local` (A5).
- Produces:
  - `equalSecrets(left, right): boolean` in `crypto.ts`.
  - `isLoopbackOrigin(origin): boolean` in `validation.ts`.
  - `parseCreateInput(value, options?: { allowLoopback?: boolean })`.
  - `interface Env { VERIFIED_BOT_TOKEN?: string }`.

- [ ] **Step 1: Write the failing tests in `tests/abuse.test.ts`**

```ts
import { runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create, guard, input, ip, listings, origin, post, remove, request, resetState } from './helpers';

beforeEach(async () => {
  await resetState();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected external request'));
});
afterEach(() => { vi.restoreAllMocks(); });

const crossSite = (dest: string) => ({ headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Dest': dest } });
const storedKeys = async (clientIp: string) => runInDurableObject(await guard(clientIp), (_, state) => [...state.storage.kv.list()].length);

describe('cross-site subresources', () => {
  it('answer embedded lookups with 404 before any read or strike', async () => {
    const link = await create(input());
    for (let index = 0; index < 5; index++) expect((await request(`/missing-${index}/preview.jpg`, crossSite('image'), '192.0.2.7')).status).toBe(404);
    expect((await request(`/${link.id}/preview.jpg`, crossSite('image'), '192.0.2.7')).status).toBe(404);
    expect((await request(`/${link.id}`, crossSite('iframe'), '192.0.2.7')).status).toBe(404);
    expect(await storedKeys('192.0.2.7')).toBe(0);
    expect((await request(`/${link.id}`, crossSite('document'), '192.0.2.7')).status).toBe(200);
    expect((await request(`/${link.id}/preview.jpg`, { headers: { 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Dest': 'image' } }, '192.0.2.7')).status).toBe(200);
  });

  it('leave the API alone, because the GitHub Pages viewer calls it cross-site', async () => {
    const response = await request('/api/links', { method: 'POST', headers: { Origin: 'https://colmapview.github.io', 'Sec-Fetch-Site': 'cross-site',
      'Sec-Fetch-Dest': 'empty', 'Content-Type': 'application/json' }, body: JSON.stringify(input()) });
    expect(response.status).toBe(201);
  });
});

describe('verified bots', () => {
  const token = 'verified-bot-token-for-tests';
  const bot = (value: string) => ({ headers: { 'X-Hub-Verified-Bot': value } });

  it('get 30 misses instead of 3 with the Transform Rule token, still per network', async () => {
    for (let index = 1; index < 30; index++) {
      expect((await request(`/miss-${index}`, bot(token), ip, { VERIFIED_BOT_TOKEN: token })).status, String(index)).toBe(404);
    }
    expect((await request('/miss-30', bot(token), ip, { VERIFIED_BOT_TOKEN: token })).status).toBe(429);
    expect((await request('/miss-1', bot(token), '192.0.2.8', { VERIFIED_BOT_TOKEN: token })).status).toBe(404);
  });

  it('get nothing extra without the secret or with a wrong token', async () => {
    for (const [overrides, value] of [[{}, token], [{ VERIFIED_BOT_TOKEN: token }, 'guessed-token']] as const) {
      await resetState();
      await request('/one', bot(value), ip, overrides);
      await request('/two', bot(value), ip, overrides);
      expect((await request('/three', bot(value), ip, overrides)).status).toBe(429);
    }
  });
});

describe('listings flag', () => {
  it('shows the landing page and refuses listings while off', async () => {
    const page = await request('/');
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('<h1>Share links for ColmapView results.</h1>');
    expect(html).toContain('<a class="button" href="https://colmapview.opsiclear.com/">Open ColmapView</a>');
    expect((await post(input({ listed: true }))).status).toBe(403);
  });

  it('keeps listed links readable and deletable after listings are turned off', async () => {
    const listed = await create(input({ listed: true }), ip, listings);
    expect((await request(`/${listed.id}`)).status).toBe(200);
    expect((await remove(listed.id)).status).toBe(204);
  });

  it('caches the gallery for a minute while on', async () => {
    const listed = await create(input({ listed: true, title: 'Listed result' }), ip, listings);
    const page = await request('/', {}, ip, listings);
    expect(page.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(await page.text()).toContain(listed.id);
    const cached = await caches.default.match(new Request(`${origin}/hub/`));
    expect(await cached?.text()).toContain(listed.id);
  });
});

describe('loopback origins', () => {
  const local: Partial<Env> = { HUB_ORIGIN: 'http://localhost:5201' };
  const localViewer = `http://localhost:5173/?url=${encodeURIComponent('https://data.example/scene.zip')}`;

  it('are refused on the production Hub', async () => {
    expect((await request('/api/links', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } })).status).toBe(403);
    expect((await request('/api/links', { method: 'POST', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
      body: JSON.stringify(input()) })).status).toBe(403);
    expect((await post(input({ viewerUrl: localViewer }))).status).toBe(400);
    expect((await request('/missing')).headers.get('Content-Security-Policy')).not.toContain('localhost');
  });

  it('are accepted when the Hub itself runs on loopback', async () => {
    const response = await request('/api/links', { method: 'POST', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
      body: JSON.stringify(input({ viewerUrl: localViewer })) }, ip, local);
    expect(response.status).toBe(201);
    const { id } = await response.json<{ id: string }>();
    expect((await request(`/${id}`, {}, ip, local)).headers.get('Content-Security-Policy'))
      .toContain('frame-src https://colmapview.opsiclear.com https://colmapview.github.io http://localhost:* http://127.0.0.1:*');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd colmapview_hub && npx vitest run tests/abuse.test.ts`

Expected: FAIL in four places:
- cross-site requests count strikes;
- bots get 3 misses;
- `/` shows the gallery;
- production accepts loopback.

The `VERIFIED_BOT_TOKEN` override may also fail to type-check until Step 6.

- [ ] **Step 3: Compare secrets in constant time (`src/worker/crypto.ts`)**

Append:

```ts
/** Constant-time comparison of two secret strings. */
export function equalSecrets(left: string, right: string): boolean {
  const [a, b] = [new TextEncoder().encode(left), new TextEncoder().encode(right)];
  return a.length === b.length && crypto.subtle.timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Accept loopback viewers only for a local Hub (`src/worker/validation.ts`)**

1. After `VIEWER_ORIGINS`, add:

```ts
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** An http(s) origin on this machine, accepted only when the Hub itself runs locally. */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.origin === origin && ['http:', 'https:'].includes(url.protocol) && LOOPBACK_HOSTS.has(url.hostname);
  } catch { return false; }
}
```

2. Change `function viewerUrl(value: unknown): string` to `function viewerUrl(value: unknown, allowLoopback: boolean): string`, and its origin check to:

```ts
  if (!(VIEWER_ORIGINS.has(url.origin) || (allowLoopback && isLoopbackOrigin(url.origin))) || !/^\/(?:latest\/|dev\/|v\d+\.\d+\.\d+\/)?$/.test(url.pathname)) {
```

3. Make the option flow through:
   - `export function parseMetadata(value: Record<string, unknown>, allowLoopback = false): LinkMetadata`, calling `viewerUrl(value.viewerUrl, allowLoopback)`.
   - `export function parseCreateInput(value: unknown, options: { allowLoopback?: boolean } = {}): CreateLinkInput`, returning `{ ...parseMetadata(value, options.allowLoopback === true), … }`.

- [ ] **Step 5: Add the controls to `src/worker/index.ts`**

1. Update the imports:

```ts
import { clientIdentity, deriveLongId, deriveShortId, equalHashes, equalSecrets, hash } from './crypto';
import { MAX_MISSES, VERIFIED_BOT_MAX_MISSES } from './guard';
import { blockedPage, cardPage, errorPage, galleryPage, hubLocation, landingPage, managementPage, notFoundPage, unavailablePage } from './pages';
import { base64Bytes, InputError, isLoopbackOrigin, parseCreateInput, readBoundedJson } from './validation';
```

2. After `redirect`, add:

```ts
/** Another site embedding a card or preview gets a plain 404: no record read, no strike. Navigations still work. */
const crossSiteSubresource = (request: Request) => request.headers.get('Sec-Fetch-Site') === 'cross-site'
  && request.headers.get('Sec-Fetch-Dest') !== 'document';

/** Cloudflare's verified bots carry the secret token from a Transform Rule; a missing or guessed token gets the normal limit. */
function missLimit(request: Request, env: Env): number {
  const presented = request.headers.get('X-Hub-Verified-Bot');
  return env.VERIFIED_BOT_TOKEN && presented && equalSecrets(presented, env.VERIFIED_BOT_TOKEN) ? VERIFIED_BOT_MAX_MISSES : MAX_MISSES;
}

const listingsEnabled = (env: Env) => env.HUB_LISTINGS_ENABLED === 'true';
```

3. Replace `contentSecurityPolicy` and the loopback part of `allowedOrigin`:

```ts
function contentSecurityPolicy(location: HubLocation): string {
  const frames = [...VIEWER_ORIGINS, ...(location.local ? ['http://localhost:*', 'http://127.0.0.1:*'] : [])];
  return ["default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self'", "font-src 'self'",
    `frame-src ${frames.join(' ')}`, "connect-src 'self'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
}

function allowedOrigin(request: Request, location: HubLocation): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  if (origin === location.origin || VIEWER_ORIGINS.includes(origin)) return origin;
  return location.local && isLoopbackOrigin(origin) ? origin : null;
}
```

   In `finalize`, use `contentSecurityPolicy(location)`.

4. In `createLink`:
   - Parse with `parseCreateInput(await readBoundedJson(request), { allowLoopback: location.local })`.
   - Change the listing check to `if (input.listed && !listingsEnabled(env))`.

5. In `lookup` and `miss`:
   - Add `if (crossSiteSubresource(request)) return failure(location, false, 404);` as the first line.
   - Replace `MAX_MISSES` with `missLimit(request, env)` in their `guard.lookup` calls.
   - `deleteLink` keeps `MAX_MISSES`.

6. Replace `home` with:

```ts
async function home(request: Request, env: Env, location: HubLocation, url: URL): Promise<Response> {
  if (!listingsEnabled(env)) return html(landingPage(location));
  const guard = await guardFor(request, env);
  const wait = await guard.lookup(null, MAX_MISSES);
  if (wait) return blocked(location, false, wait);
  const cursor = url.searchParams.get('cursor') ?? undefined;
  if (cursor && cursor.length > 2048) throw new InputError('Invalid page cursor.');
  // Listed pages change rarely; a minute of caching spares the R2 listing.
  const key = new Request(url.href);
  const cached = await caches.default.match(key);
  if (cached) return cached;
  const page = html(galleryPage(location, await listPublicRecords(env.LINKS, cursor)), 200, { 'Cache-Control': 'public, max-age=60' });
  await caches.default.put(key, page.clone());
  return page;
}
```

- [ ] **Step 6: Declare the optional secret (`src/worker/env.d.ts`)**

```ts
/** Optional secret for verified bots; set with `wrangler secret put VERIFIED_BOT_TOKEN` (see README). */
interface Env {
  VERIFIED_BOT_TOKEN?: string;
}
```

- [ ] **Step 7: Clear the gallery cache between tests**

The Workers test runtime keeps Cache API entries across test files. In `tests/helpers.ts`, add this as the first line of `resetState()`:

```ts
  await caches.default.delete(new Request(`${env.HUB_ORIGIN}${env.HUB_PATH}/`));
```

- [ ] **Step 8: Check the landing page in the browser**

Append to `e2e/hub.spec.ts`:

```ts
test('shows the landing page in the ColmapView frame', async ({ page }) => {
  await page.goto('/hub/');
  await expect(page.getByRole('heading', { name: 'Share links for ColmapView results.' })).toBeVisible();
  await expect(page.getByText('Links are created when you publish from ColmapView.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open ColmapView' })).toHaveAttribute('href', 'https://colmapview.opsiclear.com/');
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')).toHaveText(['Open viewer', 'About', 'Privacy', 'Terms']);
  await expect(page.getByRole('navigation', { name: 'Footer navigation' }).getByRole('link')).toHaveText(['About', 'Privacy', 'Terms', 'Contact']);
  await expect(page.locator('input,textarea,form')).toHaveCount(0);
});
```

- [ ] **Step 9: Run the tests and gates**

```bash
cd colmapview_hub && npx vitest run && npm run check && npm run test:browser
```
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
cd colmapview_hub && git add src tests e2e && git commit -m "Add the cross-site, verified-bot, listings and loopback controls

Cross-site subresource lookups get a plain 404 before any read or strike; the
API is exempt. With VERIFIED_BOT_TOKEN set, requests carrying it get 30 misses,
still per network. While listings are off, /hub/ shows a landing page; when on,
the gallery is cached for a minute. Loopback origins, viewer links and frames
are accepted only when the Hub runs on loopback.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A8: Hub docs and the full Hub gate

Covers §3's Hub items and §5's owner notes.

**Files:**
- Modify: `colmapview_hub/README.md` (replace), `colmapview_hub/AGENTS.md` (replace)

- [ ] **Step 1: Replace `README.md`**

````markdown
# ColmapView Hub

A small companion to [ColmapView](https://github.com/ColmapView/Colmapview.github.io). It saves a viewer link, its metadata and a thumbnail for every upload made from ColmapView, and shows them as a card. Data anyone can open without signing in gets a short name such as `HappyTree`; everything else gets an unguessable name such as `HappyTree-q3ZfK0aB7xLmP2Ws`. There is no standalone submission or dataset upload form on the Hub.

Cards provide an X/Twitter large-image preview. Public cards have a Play 3D button that loads the viewer only on a click; private cards link to the viewer instead, because signing in inside an iframe is unreliable. The gallery of listed results is off unless `HUB_LISTINGS_ENABLED` is `true`; while it is off, `/hub/` shows a short landing page.

Target address: `https://colmapview.opsiclear.com/hub/`. A separate Cloudflare Worker owns only `/hub` and `/hub/*`; the Pages viewer and its other routes stay separate. Static files in `public/hub/` are served by Cloudflare without running the Worker, so that folder must match `HUB_PATH`.

## What is stored

One JSON object per link in a private R2 bucket:
- the viewer URL, including its camera and settings fragment;
- the title, description, optional license name and URL, and an asset summary;
- a base64 JPEG preview;
- the creation time and ownership hashes;
- `access: "private"`, on private links only.

The viewer crops its preview to fill 600 × 315 and keeps it under 64 KiB. The Hub rejects JPEGs that carry EXIF (APP1) or comment segments. `og:image` is an ordinary public HTTPS JPEG endpoint, cached for five minutes.

The asset summary counts images, points, masks and Gaussian splats; cards show the nonzero counts. Records are read tolerantly: a page needs only a title, an http(s) viewer URL and a preview, so records written by older Hubs keep rendering.

The Hub stores no dataset files, provider credentials, accounts, database, storage browser, search or sitemap. The server never fetches submitted dataset URLs. X receives a thumbnail card, not an inline WebGL player.

Anyone with a link can read its card, and publicly disclosed links can be collected. Dataset storage permissions still apply. Deletion removes the record and any listing together; external social-card caches may keep previews they already fetched.

## IDs and ownership

**Public requests** (no `access`, or `access: "public"`):
- They try sixteen deterministic HMAC word-pair candidates, with create-only R2 writes, so no write replaces another owner's record.
- Every candidate is checked for this owner's record before a vacancy is used, so retries keep the same name even after an earlier collision is deleted.
- When all sixteen are taken, the Hub answers 409.

**Private requests** get one long name from the `link:` HMAC domain. That is the scheme unlisted links used before word pairs, and those legacy links keep resolving.

**Listed links** use the `listed-link:` domain with an `-L` suffix, in the `listed/` namespace. The gallery scans only `listed/`.

**Word lists:**
- The 4,096-adjective and 8,192-noun dictionaries give 33,554,432 short names (about 25 bits).
- They are private server configuration in `internal/wordlists-v1.json`, never in Git or client assets. Each isolate reads them once.
- Short names are only for data that is public anyway, and the lookup cooldown remains essential.

**Management key:**
- The browser generates a 256-bit management key before submitting.
- Its hash is stored. The raw key stays in the browser and in the private delete link's fragment (`/hub/manage/<id>#<key>`).
- A retry with the same key and content is idempotent; changed content answers 409.
- Keep `HUB_KEY` and the version-1 dictionaries stable so retries stay deterministic.

## Lookup guard

**The three-miss rule:**
- Three different missing or malformed names in ten minutes block a client for ten minutes.
- Duplicate page, preview and HEAD misses count once, and so do letter-case variants of one name.
- Names typed in another letter case resolve through the word lists and redirect with 308. Unused and invalid word pairs behave identically.
- Every lookup surface uses the same guard, including the manage page and deletion. A known name with a wrong key fails exactly like an unknown one.
- Creation is limited to 20 per hour.

**Keying and storage:**
- Clients are keyed by an HMAC of their IPv4 address or their IPv6 /64 network. IPv4-mapped addresses count as IPv4, and no raw IP is stored.
- Shared networks share the cooldown, and changing networks bypasses it.
- The guard keeps one small value in a SQLite Durable Object's synchronous KV store, and only while something is pending.
- The guard's alarm deletes that value at most an hour after the client's last miss or creation. A client that only finds links stores nothing.

**Two exceptions to the three-miss rule, neither based on the User-Agent:**
- Another site embedding a preview or card sends `Sec-Fetch-Site: cross-site` with a `Sec-Fetch-Dest` other than `document`. Such a request gets a plain 404, with no lookup and no strike. `/api/` is exempt.
- If the optional secret `VERIFIED_BOT_TOKEN` is set, a request carrying it in `X-Hub-Verified-Bot` may make 30 misses per ten minutes, still per network. A Cloudflare Transform Rule adds that header for verified bots.

Creation and deletion accept the Hub's own origin and the two viewer origins. Loopback origins and loopback viewer URLs are accepted only when the Hub itself runs on loopback.

## Look

Hub pages use ColmapView's public-page design.
- `public/hub/colmapview.css` is a byte-for-byte copy of the viewer's `public/policy.css`. Its IBM Plex Sans font and license are in `public/hub/fonts/`.
- `public/hub/styles.css` adds only the Hub's own parts.
- `npm run check` runs `scripts/check-colmapview-css.mjs`, which compares the copy's SHA-256 with a pinned value. The viewer's `src/theme/policyCssCopy.test.ts` pins the same value.
- To update the copy, copy the viewer's file, then change the hash in both places.

## Development

```sh
npm ci
npm run dev
```

Open `http://localhost:5201/hub/`.
- Development uses local R2 and Durable Object state and public fixture word lists. Private dictionaries and production credentials are not needed.
- The dev launcher copies `.dev.vars.example` only when `.dev.vars` doesn't exist yet.
- To create links from a local viewer, run it with `VITE_HUB_BASE_URL=http://localhost:5201/hub`. A local Hub accepts loopback origins and viewer URLs.

```sh
npm run check
npx playwright install chromium
npm run test:browser
```

Workers tests run against the real Workers, R2 and SQLite Durable Object runtime. Browser checks create records through the API; display, play and delete cards; and check the look in both color schemes. The viewer frame is intercepted, so they test the integration contract rather than rendering a full dataset.

## Production setup

Authenticate Wrangler with the Cloudflare account that owns the `opsiclear.com` zone. The account ID is set in `wrangler.jsonc`. Deployments need access to Workers routes, R2 and Durable Objects.

1. Create the private R2 bucket `colmapview-hub`. Don't enable an R2 public URL or custom domain.
2. Set `HUB_KEY` with `wrangler secret put`: 32 cryptographically random bytes, encoded as unpadded base64url. Never put it in source, public assets or GitHub output.
3. Prepare and upload the immutable private dictionary configuration from its private folder:

```sh
node scripts/prepare-wordlists.mjs /absolute/private/dictionary-folder
npx wrangler r2 object put colmapview-hub/internal/wordlists-v1.json --remote --file /absolute/private/dictionary-folder/wordlists-v1.json
```

4. Optional: add a Transform Rule that sets `X-Hub-Verified-Bot` for Cloudflare's verified bots on `/hub/*`, then run `npx wrangler secret put VERIFIED_BOT_TOKEN` with the same value. Also optional: a WAF rate-limiting rule for `/hub/*`.
5. Run the checks, then `npm run deploy`.
   - Migration `v2` replaces the `ClientGuard` class with `LookupGuard` and deletes the old per-client storage, so active cooldowns reset once.
   - Check the viewer root and `/hub/` separately.
   - Deploy the Hub before releasing a viewer that sends `access`.

WordNet's source license is preserved inside the private configuration. License information attached to a dataset link comes from its creator; the Hub neither infers nor grants dataset rights.
````

- [ ] **Step 2: Replace `AGENTS.md`**

```markdown
# ColmapView Hub

This project stores ColmapView share links and small JPEG previews. Keep the Worker, browser client, and tests small and separate. Do not add a database or framework without a concrete need.

- `src/worker/` contains routing, validation, private R2 record access, and the `LookupGuard` Durable Object.
- `src/client/` contains browser-only play and delete controls. Thumbnail preparation belongs to the viewer.
- `public/hub/` contains static files served without the Worker. `colmapview.css` is a copy of the viewer's `public/policy.css`; change it only by copying the viewer's file and updating both pinned hashes (see README).
- `tests/` contains Workers runtime tests; `e2e/` contains browser checks.
- Use `.tmp/` for local reports and scratch files. Never commit private dictionaries, `.dev.vars`, credentials, or generated runtime state.
- Use Web Crypto for IDs and management secrets. Never fetch submitted dataset or image URLs on the server.
- All lookup routes must honor the same three-distinct-miss cooldown, including previews, the manage page and HEAD requests. There are two exceptions only: cross-site subresource requests get a plain 404 before any lookup, and requests carrying the secret verified-bot token get 30 misses. Do not exempt crawlers by User-Agent.
- Readable IDs are independently random, never derived from the dataset URL. Short names are only for public data. The gallery lists only explicit opt-ins and stays off unless `HUB_LISTINGS_ENABLED` is `true`; never enumerate unlisted links or expose storage browsing.
- Link creation belongs to ColmapView's upload flow. Do not add a standalone submission or dataset upload form to the Hub.
- Run `npm run check` and relevant browser tests before pushing. Preserve existing changes and use two-space TypeScript indentation.
```

- [ ] **Step 3: Run the full Hub gate**

```bash
cd colmapview_hub && npm run check && npm run test:browser && git status --short
```
Expected: both gates pass; only `README.md` and `AGENTS.md` are modified.

- [ ] **Step 4: Commit**

```bash
cd colmapview_hub && git add README.md AGENTS.md && git commit -m "Document access-based names, the new guard and the look

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git rev-parse --short HEAD
```
Record the printed commit. Task B2 cites it as the Hub contract the viewer mirrors.

---

# Part B — Viewer (`colmap-webview`)

All Part B commands run in `colmap-webview` on the existing `hub-review-fixes` branch.

### Task B1: Where the Hub runs

Covers §2.1 (finding L6): `VITE_HUB_BASE_URL`, then the two production hosts, otherwise off. The localhost rewrite goes away, and e2e uses `https://hub.invalid/hub`.

**Files:**
- Create: `colmap-webview/src/features/colmapviewHub/config.ts`, `src/features/colmapviewHub/config.test.ts`
- Modify:
  - `src/features/colmapviewHub/publication.ts`, `src/features/colmapviewHub/publication.test.ts`;
  - `src/vite-env.d.ts`, `playwright.config.ts`, `e2e/hugging-face-publish.spec.ts`.

**Interfaces:**
- Produces: `getHubBaseUrl(env?: { VITE_HUB_BASE_URL?: string }, location?: Pick<Location, 'protocol' | 'hostname'>): string | null`, with no trailing slash.
- In `publication.ts`:
  - `createHubPublication` takes `baseUrl?: () => string | null`.
  - `requestLink(baseUrl, input)` returns `{ url, managementUrl }` with both absolute.
- Removes: `HUB_BASE_URL` and `hubViewerUrl`.

- [ ] **Step 1: Write the failing tests in `src/features/colmapviewHub/config.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { getHubBaseUrl } from './config';

const production = { protocol: 'https:', hostname: 'colmapview.opsiclear.com' };

describe('getHubBaseUrl', () => {
  it('uses VITE_HUB_BASE_URL first, trimmed and without a trailing slash', () => {
    expect(getHubBaseUrl({ VITE_HUB_BASE_URL: ' http://localhost:5201/hub/ ' }, { protocol: 'http:', hostname: 'localhost' })).toBe('http://localhost:5201/hub');
  });

  it.each(['colmapview.opsiclear.com', 'colmapview.github.io'])('uses the production Hub on https://%s', hostname => {
    expect(getHubBaseUrl({}, { protocol: 'https:', hostname })).toBe('https://colmapview.opsiclear.com/hub');
  });

  it.each([['http:', 'localhost'], ['https:', 'colmapview-preview.pages.dev'], ['http:', 'colmapview.opsiclear.com']])('is off on %s//%s', (protocol, hostname) => {
    expect(getHubBaseUrl({}, { protocol, hostname })).toBeNull();
  });

  it.each(['ftp://hub.example/hub', 'https://hub.example/hub?debug=1', 'https://hub.example/hub#x', 'https://user:pw@hub.example/hub', 'not a url'])(
    'is off for an invalid VITE_HUB_BASE_URL %s, even on a production host', value => {
      expect(getHubBaseUrl({ VITE_HUB_BASE_URL: value }, production)).toBeNull();
    });
});
```

In `src/features/colmapviewHub/publication.test.ts`, make these changes:
1. Remove `hubViewerUrl` from the import and delete the test `uses the hosted viewer for local links while preserving the source URL and camera fragment`.
2. Replace the `result` constant with:

```ts
const HUB = 'https://colmapview.opsiclear.com/hub';
const result = { url: `${HUB}/HappyTree-AAAAAAAAAAAAAAAA`, managementUrl: `${HUB}/manage/HappyTree-AAAAAAAAAAAAAAAA` };
```

3. Add `baseUrl: () => HUB` to every `createHubPublication({ … })` call.
4. In `waits for the verified upload URL…`, change the expected `managementUrl` to `` `${result.managementUrl}#${payload.managementSecret}` ``.
5. Add two tests:

```ts
  it('creates nothing when the Hub is off for this host', async () => {
    const request = vi.fn();
    const controller = createHubPublication({ request, baseUrl: () => null, thumbnail: async () => 'jpeg' });
    controller.prepare({ title: 'Scene' }, { listed: false, preview });
    await controller.finish(viewer);
    expect(request).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toEqual({ phase: 'idle' });
  });

  it('sends the viewer link unchanged and accepts only links under the configured Hub', async () => {
    const local = 'http://localhost:5173/?url=https%3A%2F%2Fstorage.example%2Fscene.zip';
    const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ url: 'https://elsewhere.example/hub/X', managementPath: '/hub/manage/X' }, { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    const controller = createHubPublication({ baseUrl: () => 'https://hub.invalid/hub', thumbnail: async () => 'jpeg' });
    controller.prepare({ title: 'Scene' }, { listed: false, preview });
    await controller.finish(local);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://hub.invalid/hub/api/links');
    expect(JSON.parse(String(init.body)).viewerUrl).toBe(local);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'failed', error: 'The Hub returned an invalid link.' });
    vi.unstubAllGlobals();
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd colmap-webview && npx vitest run src/features/colmapviewHub`

Expected: FAIL. `./config` doesn't exist, and `createHubPublication` ignores `baseUrl`.

- [ ] **Step 3: Create `src/features/colmapviewHub/config.ts`**

```ts
const PRODUCTION_HUB = 'https://colmapview.opsiclear.com/hub';
const HUB_HOSTS = new Set(['colmapview.opsiclear.com', 'colmapview.github.io']);

/**
 * Where this viewer creates Hub links: VITE_HUB_BASE_URL when set (development and e2e), otherwise
 * the production Hub on the two production hosts. Anywhere else the Hub is off: no disclosure, no request, no Hub UI.
 */
export function getHubBaseUrl(env: { VITE_HUB_BASE_URL?: string } = import.meta.env,
  location: Pick<Location, 'protocol' | 'hostname'> = window.location): string | null {
  const configured = env.VITE_HUB_BASE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
      return url.href.replace(/\/+$/, '');
    } catch { return null; }
  }
  return location.protocol === 'https:' && HUB_HOSTS.has(location.hostname) ? PRODUCTION_HUB : null;
}
```

Add `readonly VITE_HUB_BASE_URL?: string;` to `ImportMetaEnv` in `src/vite-env.d.ts`.

- [ ] **Step 4: Use the configured Hub in `src/features/colmapviewHub/publication.ts`**

1. Delete the `HUB_BASE_URL` constant and the whole `hubViewerUrl` function. Add `import { getHubBaseUrl } from './config';`.

2. Change the response type and the `request` dependency:

```ts
interface LinkResponse { url: string; managementUrl: string }
interface Dependencies {
  baseUrl?: () => string | null;
  thumbnail?: typeof makeHubThumbnail;
  request?: (baseUrl: string, input: LinkInput) => Promise<LinkResponse>;
  capture?: () => Promise<Blob | null>;
  publicAccess?: (viewerUrl: string) => Promise<boolean>;
}
```

3. Replace `requestLink` with:

```ts
async function requestLink(baseUrl: string, input: LinkInput): Promise<LinkResponse> {
  const response = await fetch(`${baseUrl}/api/links`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: timeoutSignal(15000),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'The Hub could not save this link.';
    throw new Error(error);
  }
  if (!result || typeof result !== 'object' || !('url' in result) || typeof result.url !== 'string'
    || !('managementPath' in result) || typeof result.managementPath !== 'string') throw new Error('The Hub returned an invalid link.');
  const root = `${baseUrl}/`;
  const url = new URL(result.url);
  const management = new URL(result.managementPath, root);
  if (!url.href.startsWith(root) || !management.href.startsWith(`${root}manage/`)) throw new Error('The Hub returned an invalid link.');
  return { url: url.href, managementUrl: management.href };
}
```

4. In `createHubPublication`:
   - After `const request = …`, add `const baseUrl = deps.baseUrl ?? (() => getHubBaseUrl());`.
   - In `finish`, start with `const base = baseUrl();` and add `!base ||` to the early-return condition.
   - Use `viewerUrl` unchanged in `input` (no `hubViewerUrl`).
   - Call `request(base, input)`.
   - Set `managementUrl: `${result.managementUrl}#${draft.secret}``.
   - In `prepare`, change `draft = options ? {` to `draft = options && baseUrl() ? {`.

- [ ] **Step 5: Point Playwright at the reserved test origin**

1. In `playwright.config.ts`, add `VITE_HUB_BASE_URL: 'https://hub.invalid/hub',` to `webServer.env`. A missed intercept can then never reach production.
2. In `e2e/hugging-face-publish.spec.ts`:
   - `const shorteningEndpoint = 'https://hub.invalid/hub/api/links';`
   - `const shortUrl = 'https://hub.invalid/hub/HappyTree';`
   - `expect(requests[0].viewerUrl).toBe('https://colmapview.opsiclear.com/?url=https://huggingface.co/datasets/publisher/scene');` becomes `expect(requests[0].viewerUrl).toBe(viewerUrl);`.
   - The management-link expectation becomes `` `https://hub.invalid/hub/manage/HappyTree#${requests[0].managementSecret}` ``.

- [ ] **Step 6: Run the tests and gates**

```bash
cd colmap-webview && npx vitest run src/features/colmapviewHub && npm run check && npm run test:deployment && npx playwright test e2e/hugging-face-publish.spec.ts --project=chromium --reporter=list
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
cd colmap-webview && git add src/features/colmapviewHub src/vite-env.d.ts playwright.config.ts e2e/hugging-face-publish.spec.ts && git commit -m "Decide where the Hub runs and stop rewriting local viewer links

VITE_HUB_BASE_URL wins, then the production Hub on colmapview.opsiclear.com
and colmapview.github.io; elsewhere the Hub is off. Playwright uses the
reserved hub.invalid origin, so a missed intercept cannot reach production.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B2: The Hub payload, license names and URLs, form text rules, and the contract test

Covers §2.6 text and license rules and §4's contract test (findings L2, L3 and L7).

**Files:**
- Create: `colmap-webview/src/features/colmapviewHub/payload.ts`, `payload.test.ts`, `hubContract.test.ts`
- Modify:
  - `src/features/datasetPublishing/publicationMetadata.ts`, `src/features/datasetPublishing/publicationMetadata.test.ts`;
  - `src/components/modals/PublishDatasetModal.tsx`, `src/components/modals/PublishDatasetModal.test.tsx`.

**Interfaces:**
- Produces from `payload.ts`:
  - limits: `HUB_TITLE_LIMIT = 120`, `HUB_DESCRIPTION_LIMIT = 280`, `HUB_LICENSE_NAME_LIMIT = 160`, `HUB_LICENSE_URL_LIMIT = 2048`;
  - types: `HubAccess`, `HubLicense { name; url? }`, `HubMetadata { title; description?; license?; assets? }`;
  - `HubLinkPayload` with `viewerUrl`, `title`, `description`, `thumbnailBase64`, `managementSecret`, `access`, `publicAcknowledged: true`, and optional `license` and `assets`;
  - `hubText(value, limit)` and `buildHubPayload({ viewerUrl, metadata, access, thumbnailBase64, managementSecret })`.
- Produces from `publicationMetadata.ts`:
  - `PUBLICATION_LICENSES` entries gain `name` and `url`;
  - `publicationLicenseInfo(details): { name; url? } | undefined`;
  - `stripControlCharacters(value, multiline = false)`;
  - `PUBLICATION_LICENSE_NAME_LIMIT = 160` and `PUBLICATION_LICENSE_URL_LIMIT = 2048`.

- [ ] **Step 1: Write the failing payload tests in `src/features/colmapviewHub/payload.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildHubPayload, hubText } from './payload';

const graphemes = (text: string) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(part => part.segment);

describe('hubText', () => {
  it('turns control characters into spaces and collapses whitespace like the Hub', () => {
    expect(hubText('  Scene\u0007\tname\n next  ', 120)).toBe('Scene name next');
  });

  it('keeps text within the limit unchanged', () => {
    expect(hubText('x'.repeat(120), 120)).toBe('x'.repeat(120));
  });

  it('cuts at the last space when that keeps at least 60% of the limit', () => {
    const text = hubText('word '.repeat(40), 120);
    expect(text.length).toBeLessThanOrEqual(120);
    expect(text.endsWith('word…')).toBe(true);
    expect(text.length).toBeGreaterThanOrEqual(72);
  });

  it('cuts at a grapheme boundary when the last space is too early', () => {
    const text = hubText(`a ${'x'.repeat(200)}`, 120);
    expect(text).toHaveLength(120);
    expect(text.endsWith('…')).toBe(true);
  });

  it('never splits an emoji sequence or a combining mark', () => {
    const emoji = hubText('👍🏽'.repeat(70), 120);
    expect(emoji.length).toBeLessThanOrEqual(120);
    expect(graphemes(emoji.slice(0, -1)).every(part => part === '👍🏽')).toBe(true);
    const combining = hubText('é'.repeat(100), 120);
    expect(graphemes(combining.slice(0, -1)).every(part => part === 'é')).toBe(true);
  });
});

describe('buildHubPayload', () => {
  const base = { viewerUrl: 'https://colmapview.opsiclear.com/?url=https://huggingface.co/datasets/user/scene', thumbnailBase64: 'jpeg',
    managementSecret: 'S'.repeat(43) };

  it('sends access and the acknowledgment, and never a listing choice', () => {
    const payload = buildHubPayload({ ...base, access: 'private', metadata: { title: 'Scene', description: 'Reconstruction' } });
    expect(payload).toEqual({ ...base, title: 'Scene', description: 'Reconstruction', access: 'private', publicAcknowledged: true });
    expect(payload).not.toHaveProperty('listed');
  });

  it('falls back to a title when the given one is empty', () => {
    expect(buildHubPayload({ ...base, access: 'public', metadata: { title: ' \u0000 ' } }).title).toBe('ColmapView dataset');
  });

  it('sends a license name, and its URL only when it is a valid HTTPS link within the limit', () => {
    const payload = (url?: string) => buildHubPayload({ ...base, access: 'public', metadata: { title: 'Scene', license: { name: 'Custom', url } } }).license;
    expect(payload('https://example.com/license')).toEqual({ name: 'Custom', url: 'https://example.com/license' });
    expect(payload('http://example.com/license')).toEqual({ name: 'Custom' });
    expect(payload(`https://example.com/${'a'.repeat(2048)}`)).toEqual({ name: 'Custom' });
    expect(buildHubPayload({ ...base, access: 'public', metadata: { title: 'Scene', license: { name: '  ' } } })).not.toHaveProperty('license');
  });
});
```

- [ ] **Step 2: Write the failing contract test in `src/features/colmapviewHub/hubContract.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildHubPayload, type HubMetadata } from './payload';
import { PUBLICATION_LICENSES, publicationLicenseInfo } from '../datasetPublishing/publicationMetadata';

/**
 * A copy of the Hub's creation rules: colmapview_hub src/worker/validation.ts at commit HUB_COMMIT.
 * When the Hub changes them, update this copy and the commit together.
 */
const HUB_COMMIT = 'HUB_COMMIT_PLACEHOLDER';
const KEYS = new Set(['viewerUrl', 'title', 'description', 'thumbnailBase64', 'license', 'assets', 'managementSecret', 'listed', 'access', 'publicAcknowledged']);
const VIEWER_ORIGINS = new Set(['https://colmapview.opsiclear.com', 'https://colmapview.github.io']);
const VIEWER_PATH = /^\/(?:latest\/|dev\/|v\d+\.\d+\.\d+\/)?$/;
const CREDENTIAL_PARAMS = new Set(['access_token', 'refresh_token', 'secret_access_key', 'aws_secret_access_key', 'secretkey',
  'x-amz-signature', 'x-amz-credential', 'x-amz-security-token', 'x-goog-signature', 'x-goog-credential', 'sig', 'signature', 'token', 'awsaccesskeyid']);
const ASSET_KEYS = new Set(['format', 'imageFormat', 'colmap', 'images', 'masks', 'splats', 'viewerSettings', 'preview']);
const hasControls = (value: string) => [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

function textRule(value: unknown, max: number, optional: boolean): string | null {
  if (optional && (value === undefined || value === '')) return null;
  if (typeof value !== 'string') return 'not a string';
  const normalized = value.trim().replace(/\s+/g, ' ');
  return (!optional && !normalized) || normalized.length > max || hasControls(normalized) ? 'invalid or too long' : null;
}

function credentialRule(url: URL): string | null {
  const names = [...url.searchParams.keys(), ...new URLSearchParams(url.hash.slice(1)).keys()];
  return url.username || url.password || names.some(name => CREDENTIAL_PARAMS.has(name.toLowerCase())) ? 'credentials' : null;
}

/** The first Hub creation rule a payload breaks, or null when the Hub would accept it. JPEG structure is checked by the thumbnail tests and e2e. */
function hubRejection(payload: Record<string, unknown>): string | null {
  const unknown = Object.keys(payload).find(key => !KEYS.has(key));
  if (unknown) return `unknown key ${unknown}`;
  if (payload.publicAcknowledged !== true) return 'publicAcknowledged';
  if (typeof payload.managementSecret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(payload.managementSecret)) return 'managementSecret';
  if (payload.access !== undefined && payload.access !== 'public' && payload.access !== 'private') return 'access';
  if (payload.listed !== undefined && typeof payload.listed !== 'boolean') return 'listed';
  if (payload.listed === true && payload.access === 'private') return 'listed private';
  const viewer = payload.viewerUrl;
  if (typeof viewer !== 'string' || viewer.length > 32768 || /\s/.test(viewer) || hasControls(viewer)) return 'viewerUrl';
  let url: URL;
  try { url = new URL(viewer); } catch { return 'viewerUrl'; }
  if (!VIEWER_ORIGINS.has(url.origin) || !VIEWER_PATH.test(url.pathname)) return 'viewer origin';
  const credentials = credentialRule(url);
  if (credentials) return credentials;
  const source = url.searchParams.get('url');
  if (source) {
    try { const sourceRule = credentialRule(new URL(source)); if (sourceRule) return sourceRule; } catch { /* the Hub ignores an unparseable source */ }
  }
  for (const [key, max, optional] of [['title', 120, false], ['description', 280, true]] as const) {
    const rule = textRule(payload[key], max, optional);
    if (rule) return `${key} ${rule}`;
  }
  if (payload.license !== undefined) {
    const license = payload.license as Record<string, unknown> | null;
    if (typeof license !== 'object' || license === null || Object.keys(license).some(key => !['id', 'name', 'url'].includes(key))) return 'license shape';
    for (const [key, max] of [['id', 80], ['name', 160]] as const) {
      const rule = textRule(license[key], max, true);
      if (rule) return `license ${key} ${rule}`;
    }
    if (license.url !== undefined && license.url !== '') {
      if (typeof license.url !== 'string' || license.url.length > 2048) return 'license url';
      try { const parsed = new URL(license.url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return 'license url'; } catch { return 'license url'; }
    }
  }
  if (payload.assets !== undefined) {
    const assets = payload.assets as Record<string, unknown>;
    if (Object.keys(assets).some(key => !ASSET_KEYS.has(key))) return 'assets shape';
    const counts = [assets.images, assets.masks, assets.splats, ...Object.values(assets.colmap as Record<string, unknown>)];
    if (counts.some(count => typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)) return 'asset counts';
  }
  return null;
}

const secret = 'S'.repeat(43);
const viewer = (source: string, base = 'https://colmapview.opsiclear.com/') => `${base}?url=${source}`;
const build = (metadata: HubMetadata, access: 'public' | 'private' = 'public', viewerUrl = viewer('https://huggingface.co/datasets/user/scene')) =>
  buildHubPayload({ viewerUrl, metadata, access, thumbnailBase64: '/9j/AAAA', managementSecret: secret }) as unknown as Record<string, unknown>;

describe(`viewer payloads against the Hub's creation rules (colmapview_hub ${HUB_COMMIT})`, () => {
  it.each([
    ['plain text', { title: 'Scene', description: 'A reconstruction.' }],
    ['a long emoji title', { title: '👍🏽'.repeat(80) }],
    ['combining marks', { title: 'é'.repeat(300), description: 'é'.repeat(900) }],
    ['controls and line breaks', { title: 'Scene\u0007\tname', description: 'Line one\nline two\r\n\u0000end' }],
    ['a long custom license', { title: 'Scene', license: publicationLicenseInfo({ license: 'other', licenseName: 'L'.repeat(200), licenseUrl: 'https://example.com/license' }) }],
    ['an asset summary', { title: 'Scene', assets: { format: 'zip', imageFormat: 'jpeg', colmap: { files: 3, cameras: 2, points: 10 }, images: 2, masks: 0, splats: 1, viewerSettings: true, preview: true } }],
  ] satisfies Array<[string, HubMetadata]>)('accepts %s', (_name, metadata) => {
    expect(hubRejection(build(metadata))).toBeNull();
  });

  it.each(PUBLICATION_LICENSES.filter(option => option.id !== 'other').map(option => option.id))('accepts the %s license', id => {
    expect(hubRejection(build({ title: 'Scene', license: publicationLicenseInfo({ license: id }) }))).toBeNull();
  });

  it('accepts private uploads from every viewer host and path', () => {
    for (const viewerUrl of [
      viewer('https://drive.google.com/file/d/abc/view'),
      viewer('https://bucket.example/scene/manifest.json', 'https://colmapview.github.io/latest/'),
      viewer('https://bucket.example/scene.zip', 'https://colmapview.github.io/v0.16.13/'),
      viewer('https://huggingface.co/datasets/u/s', 'https://colmapview.github.io/dev/'),
    ]) expect(hubRejection(build({ title: 'Scene' }, 'private', viewerUrl)), viewerUrl).toBeNull();
  });

  it('mirrors rejections, so a passing payload means something', () => {
    expect(hubRejection({ ...build({ title: 'Scene' }), listed: 'yes' })).toBe('listed');
    expect(hubRejection({ ...build({ title: 'Scene' }), extra: true })).toBe('unknown key extra');
    expect(hubRejection(build({ title: 'Scene' }, 'public', viewer(encodeURIComponent('https://bucket.example/scene.zip?X-Amz-Signature=abc'))))).toBe('credentials');
  });
});
```

- [ ] **Step 3: Write the failing form and license tests**

1. Append to `src/features/datasetPublishing/publicationMetadata.test.ts`:

```ts
describe('license names, links and form text rules', () => {
  it('gives every known license a short name and an HTTPS link', () => {
    for (const option of PUBLICATION_LICENSES.filter(option => option.id !== 'other')) {
      expect(publicationLicenseInfo({ license: option.id })).toEqual({ name: expect.any(String), url: expect.stringMatching(/^https:\/\//) });
    }
    expect(publicationLicenseInfo({ license: 'cc-by-4.0' })).toEqual({ name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' });
  });

  it('uses the entered custom license, and nothing when there is no license', () => {
    expect(publicationLicenseInfo({ license: 'other', licenseName: ' Research only ', licenseUrl: 'https://example.com/l' }))
      .toEqual({ name: 'Research only', url: 'https://example.com/l' });
    expect(publicationLicenseInfo({ license: '' })).toBeUndefined();
  });

  it('strips control characters, keeping line breaks and tabs only in multi-line fields', () => {
    expect(stripControlCharacters('Sce\u0000ne\u0007\n')).toBe('Scene');
    expect(stripControlCharacters('Line\u0000 one\n\ttwo\r\n', true)).toBe('Line one\n\ttwo\r\n');
  });

  it('caps a custom license name at 160 characters and its URL at 2048, like the Hub', () => {
    const details = { name: 'scene', title: 'Scene', description: '', license: 'other', visibility: 'public' as const, licenseUrl: 'https://example.com/l' };
    expect(() => validatePublicationDetails({ ...details, licenseName: 'L'.repeat(160) })).not.toThrow();
    expect(() => validatePublicationDetails({ ...details, licenseName: 'L'.repeat(161) })).toThrow('Shorten the custom license name to 160 characters and its URL to 2,048.');
    expect(() => validatePublicationDetails({ ...details, licenseName: 'Custom', licenseUrl: `https://example.com/${'a'.repeat(2048)}` }))
      .toThrow('Shorten the custom license name to 160 characters and its URL to 2,048.');
  });
});
```

   Extend that file's import from `./publicationMetadata` with `PUBLICATION_LICENSES, publicationLicenseInfo, stripControlCharacters, validatePublicationDetails`. Keep the names it already imports.

2. Append to the `describe('PublishDatasetModal')` block in `src/components/modals/PublishDatasetModal.test.tsx`:

```ts
  it('strips control characters as you type and limits the custom license fields like the Hub', () => {
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Dataset title'), { target: { value: 'Sce\u0007ne' } });
    expect(screen.getByLabelText('Dataset title')).toHaveValue('Scene');
    fireEvent.change(screen.getByLabelText('Dataset license'), { target: { value: 'other' } });
    expect(screen.getByLabelText('Custom license name')).toHaveAttribute('maxLength', '160');
    expect(screen.getByLabelText('Custom license URL')).toHaveAttribute('maxLength', '2048');
  });
```

- [ ] **Step 4: Run them and watch them fail**

Run: `cd colmap-webview && npx vitest run src/features/colmapviewHub src/features/datasetPublishing/publicationMetadata.test.ts src/components/modals/PublishDatasetModal.test.tsx`

Expected: FAIL. `./payload`, `publicationLicenseInfo` and `stripControlCharacters` don't exist, and the form has no limits.

- [ ] **Step 5: Create `src/features/colmapviewHub/payload.ts`**

```ts
import type { PublicationAssetSummary } from '../datasetPublishing/types';

/** The Hub's creation limits, in UTF-16 units. */
export const HUB_TITLE_LIMIT = 120;
export const HUB_DESCRIPTION_LIMIT = 280;
export const HUB_LICENSE_NAME_LIMIT = 160;
export const HUB_LICENSE_URL_LIMIT = 2048;

export type HubAccess = 'public' | 'private';
export interface HubLicense { name: string; url?: string }
export interface HubMetadata { title: string; description?: string; license?: HubLicense; assets?: PublicationAssetSummary }
export interface HubLinkPayload {
  viewerUrl: string;
  title: string;
  description: string;
  thumbnailBase64: string;
  managementSecret: string;
  access: HubAccess;
  publicAcknowledged: true;
  license?: HubLicense;
  assets?: PublicationAssetSummary;
}

/** Control characters become spaces, then whitespace collapses the way the Hub collapses it. */
function collapse(value: string): string {
  let text = '';
  for (const character of value) {
    const code = character.charCodeAt(0);
    text += code < 32 || code === 127 ? ' ' : character;
  }
  return text.trim().replace(/\s+/g, ' ');
}

function graphemeEnds(text: string): number[] {
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(({ index, segment }) => index + segment.length);
  }
  const ends: number[] = [];
  let end = 0;
  for (const character of text) { end += character.length; ends.push(end); }
  return ends;
}

/**
 * Text the Hub accepts, within `limit` UTF-16 units. A cut ends at the last space when that keeps
 * at least 60% of the limit, otherwise at a grapheme boundary, and gets an ellipsis.
 */
export function hubText(value: string, limit: number): string {
  const text = collapse(value);
  if (text.length <= limit) return text;
  const room = limit - 1;
  const space = text.lastIndexOf(' ', room);
  let end = space;
  if (space < Math.ceil(limit * 0.6)) {
    end = 0;
    for (const boundary of graphemeEnds(text)) {
      if (boundary > room) break;
      end = boundary;
    }
  }
  return `${text.slice(0, end).trimEnd()}…`;
}

function isHttpsUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}

function hubLicense({ name, url }: HubLicense): HubLicense | undefined {
  const text = hubText(name, HUB_LICENSE_NAME_LIMIT);
  if (!text) return undefined;
  return { name: text, ...(url && url.length <= HUB_LICENSE_URL_LIMIT && isHttpsUrl(url) ? { url } : {}) };
}

/** The request body for POST /api/links. */
export function buildHubPayload({ viewerUrl, metadata, access, thumbnailBase64, managementSecret }: {
  viewerUrl: string; metadata: HubMetadata; access: HubAccess; thumbnailBase64: string; managementSecret: string;
}): HubLinkPayload {
  const license = metadata.license && hubLicense(metadata.license);
  return {
    viewerUrl,
    title: hubText(metadata.title, HUB_TITLE_LIMIT) || 'ColmapView dataset',
    description: hubText(metadata.description ?? '', HUB_DESCRIPTION_LIMIT),
    thumbnailBase64, managementSecret, access, publicAcknowledged: true,
    ...(license ? { license } : {}),
    ...(metadata.assets ? { assets: metadata.assets } : {}),
  };
}
```

- [ ] **Step 6: Add license names, URLs and form rules to `src/features/datasetPublishing/publicationMetadata.ts`**

1. Replace `PUBLICATION_LICENSES` with:

```ts
/** Hugging Face repository-card license identifiers, with labels for the publish dialog and names and links for Hub cards. */
export const PUBLICATION_LICENSES = [
  { id: 'cc-by-4.0', label: 'CC BY 4.0 (attribution)', name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  { id: 'cc-by-sa-4.0', label: 'CC BY-SA 4.0 (share alike)', name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { id: 'cc-by-nc-4.0', label: 'CC BY-NC 4.0 (non-commercial)', name: 'CC BY-NC 4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
  { id: 'cc-by-nc-sa-4.0', label: 'CC BY-NC-SA 4.0 (non-commercial, share alike)', name: 'CC BY-NC-SA 4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
  { id: 'cc-by-nd-4.0', label: 'CC BY-ND 4.0 (no derivatives)', name: 'CC BY-ND 4.0', url: 'https://creativecommons.org/licenses/by-nd/4.0/' },
  { id: 'cc-by-nc-nd-4.0', label: 'CC BY-NC-ND 4.0 (non-commercial, no derivatives)', name: 'CC BY-NC-ND 4.0', url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/' },
  { id: 'cc0-1.0', label: 'CC0 1.0 (public domain)', name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  { id: 'mit', label: 'MIT', name: 'MIT', url: 'https://opensource.org/license/mit' },
  { id: 'apache-2.0', label: 'Apache 2.0', name: 'Apache 2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
  { id: 'other', label: 'Custom license' },
] as const;
export const PUBLICATION_LICENSE_NAME_LIMIT = 160;
export const PUBLICATION_LICENSE_URL_LIMIT = 2048;

/** The license as a name and link, for the Hub card. */
export function publicationLicenseInfo(details: Pick<PublicationDetails, 'license' | 'licenseName' | 'licenseUrl'>): { name: string; url?: string } | undefined {
  if (details.license === 'other') {
    const name = details.licenseName?.trim();
    return name ? { name, ...(details.licenseUrl ? { url: details.licenseUrl } : {}) } : undefined;
  }
  const known = PUBLICATION_LICENSES.find(option => option.id === details.license);
  return known && 'url' in known ? { name: known.name, url: known.url } : undefined;
}

/** Removes control characters from a form value; multi-line fields keep tabs and line breaks. */
export function stripControlCharacters(value: string, multiline = false): string {
  let text = '';
  for (const character of value) {
    const code = character.charCodeAt(0);
    if ((code < 32 || code === 127) && !(multiline && (code === 9 || code === 10 || code === 13))) continue;
    text += character;
  }
  return text;
}
```

2. In `validatePublicationDetails`, add this inside the `if (details.license === 'other')` block, after its existing throw:

```ts
    if (details.licenseName.trim().length > PUBLICATION_LICENSE_NAME_LIMIT || (details.licenseUrl ?? '').length > PUBLICATION_LICENSE_URL_LIMIT) {
      throw new HfError('Shorten the custom license name to 160 characters and its URL to 2,048.');
    }
```

- [ ] **Step 7: Apply the rules in `src/components/modals/PublishDatasetModal.tsx`**

1. Change the metadata import to `import { PUBLICATION_LICENSE_NAME_LIMIT, PUBLICATION_LICENSE_URL_LIMIT, PUBLICATION_LICENSES, stripControlCharacters, validatePublicationDetails } from '../../features/datasetPublishing/publicationMetadata';`.
2. Update the fields:
   - Dataset title: `onChange={event => setTitle(stripControlCharacters(event.target.value))}`.
   - Custom license name: `maxLength={PUBLICATION_LICENSE_NAME_LIMIT}` and `onChange={event => setLicenseName(stripControlCharacters(event.target.value))}`.
   - Custom license URL: add `maxLength={PUBLICATION_LICENSE_URL_LIMIT}` and `onChange={event => setLicenseUrl(stripControlCharacters(event.target.value))}`.
   - Description: `onChange={event => setDescription(stripControlCharacters(event.target.value, true))}`.

- [ ] **Step 8: Cite the Hub commit in the contract test**

```bash
cd colmap-webview && HUB=$(git -C ../colmapview_hub rev-parse --short HEAD) && sed -i "s/HUB_COMMIT_PLACEHOLDER/$HUB/" src/features/colmapviewHub/hubContract.test.ts && grep -n "const HUB_COMMIT" src/features/colmapviewHub/hubContract.test.ts
```
Expected: `const HUB_COMMIT = '<Part A head>';`. It matches the commit recorded in Task A8, Step 4.

- [ ] **Step 9: Run the tests and gates**

```bash
cd colmap-webview && npx vitest run src/features/colmapviewHub src/features/datasetPublishing src/components/modals/PublishDatasetModal.test.tsx && npm run check
```
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
cd colmap-webview && git add src/features/colmapviewHub src/features/datasetPublishing src/components/modals/PublishDatasetModal.tsx src/components/modals/PublishDatasetModal.test.tsx && git commit -m "Build Hub payloads the Hub accepts, with license names and links

Text collapses like the Hub's, then cuts at a word or grapheme boundary with
an ellipsis inside the limit. Known licenses send their name and link. The
Hugging Face form strips control characters and caps custom license fields
at the Hub's limits. A contract test mirrors the Hub's creation rules.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B3: A thumbnail that fills the card and carries no metadata

Covers §2.6's thumbnail rules (finding L14).

**Files:**
- Create: `colmap-webview/src/features/colmapviewHub/thumbnail.test.ts`
- Modify: `src/features/colmapviewHub/thumbnail.ts`

**Interfaces:**
- Produces:
  - `HUB_PREVIEW_WIDTH = 600` and `HUB_PREVIEW_HEIGHT = 315`.
  - `coverCrop(width, height, targetWidth?, targetHeight?): { x; y; width; height }`.
  - `stripJpegMetadata(bytes: Uint8Array): Uint8Array` and `bytesToBase64(bytes: Uint8Array): string`.
  - `makeHubThumbnail(preview: Blob): Promise<string>`, same signature as before.

- [ ] **Step 1: Write the failing tests in `src/features/colmapviewHub/thumbnail.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { bytesToBase64, coverCrop, stripJpegMetadata } from './thumbnail';

const segment = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload];
const ascii = (text: string) => [...text].map(character => character.charCodeAt(0));
const jpeg = (...segments: number[][]) => new Uint8Array([0xff, 0xd8, ...segments.flat(), 0x12, 0x34, 0x56, 0xff, 0xd9]);
const app0 = segment(0xe0, ascii('JFIF\0'));
const exif = segment(0xe1, [...ascii('Exif\0\0'), 1, 2, 3, 4]);
const comment = segment(0xfe, ascii('camera serial 123'));
const frame = segment(0xc0, [8, 0x01, 0x3b, 0x02, 0x58, 3]);
const scan = segment(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]);

describe('coverCrop', () => {
  it('crops the sides of a wide image', () => {
    const crop = coverCrop(1200, 300);
    expect(crop.height).toBeCloseTo(300);
    expect(crop.width).toBeCloseTo(300 * 600 / 315);
    expect(crop.x).toBeCloseTo((1200 - crop.width) / 2);
    expect(crop.y).toBeCloseTo(0);
  });

  it('crops the top and bottom of a tall image', () => {
    const crop = coverCrop(300, 1200);
    expect(crop.width).toBe(300);
    expect(crop.height).toBeCloseTo(300 * 315 / 600);
    expect(crop.y).toBeCloseTo((1200 - crop.height) / 2);
  });

  it('keeps an image that already has the card shape', () => {
    expect(coverCrop(1200, 630)).toEqual({ x: 0, y: 0, width: 1200, height: 630 });
  });
});

describe('stripJpegMetadata', () => {
  it('removes EXIF and comment segments and keeps everything else in order', () => {
    expect([...stripJpegMetadata(jpeg(app0, exif, comment, frame, scan))]).toEqual([...jpeg(app0, frame, scan)]);
  });

  it('returns the same bytes when there is no metadata', () => {
    const clean = jpeg(app0, frame, scan);
    expect(stripJpegMetadata(clean)).toBe(clean);
  });

  it('leaves malformed data alone for the Hub to reject', () => {
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2]);
    expect(stripJpegMetadata(broken)).toBe(broken);
  });
});

describe('bytesToBase64', () => {
  it('encodes large buffers in chunks', () => {
    const bytes = new Uint8Array(100 * 1024).map((_, index) => index % 251);
    expect(Uint8Array.from(atob(bytesToBase64(bytes)), character => character.charCodeAt(0))).toEqual(bytes);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd colmap-webview && npx vitest run src/features/colmapviewHub/thumbnail.test.ts`

Expected: FAIL. `coverCrop`, `stripJpegMetadata` and `bytesToBase64` are not exported.

- [ ] **Step 3: Replace `src/features/colmapviewHub/thumbnail.ts`**

```ts
export const HUB_PREVIEW_WIDTH = 600;
export const HUB_PREVIEW_HEIGHT = 315;
const MAX_PREVIEW_BYTES = 64 * 1024;

/** The centered source rectangle that fills the target without letterboxing. */
export function coverCrop(width: number, height: number, targetWidth = HUB_PREVIEW_WIDTH, targetHeight = HUB_PREVIEW_HEIGHT) {
  const scale = Math.max(targetWidth / width, targetHeight / height);
  const [cropWidth, cropHeight] = [targetWidth / scale, targetHeight / scale];
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
}

/**
 * Removes APP1 (EXIF, XMP) and COM segments, which the Hub rejects. Canvas encoders normally write
 * neither, but Safari's is unverified. Anything malformed is returned unchanged for the Hub to judge.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  let removed = false;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff && bytes[offset + 1] !== 0xda) {
    const marker = bytes[offset + 1];
    const end = offset + 2 + ((bytes[offset + 2] << 8) | bytes[offset + 3]);
    if (end - offset < 4 || end > bytes.length) return bytes;
    if (marker === 0xe1 || marker === 0xfe) removed = true;
    else kept.push(bytes.subarray(offset, end));
    offset = end;
  }
  if (!removed) return bytes;
  kept.push(bytes.subarray(offset));
  const result = new Uint8Array(kept.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of kept) { result.set(part, at); at += part.length; }
  return result;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

/** The card image: the upload's preview cropped to fill 600 × 315, as a JPEG of at most 64 KiB. */
export async function makeHubThumbnail(preview: Blob): Promise<string> {
  const bitmap = await createImageBitmap(preview);
  const canvas = document.createElement('canvas');
  canvas.width = HUB_PREVIEW_WIDTH;
  canvas.height = HUB_PREVIEW_HEIGHT;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The card preview could not be created.');
    const crop = coverCrop(bitmap.width, bitmap.height);
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.7, 0.6, 0.5, 0.4, 0.3]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) continue;
      const bytes = stripJpegMetadata(new Uint8Array(await blob.arrayBuffer()));
      if (bytes.length <= MAX_PREVIEW_BYTES) return bytesToBase64(bytes);
    }
    throw new Error('The card preview could not fit the thumbnail limit.');
  } finally { bitmap.close(); canvas.width = canvas.height = 1; }
}
```

- [ ] **Step 4: Run the tests and gates**

```bash
cd colmap-webview && npx vitest run src/features/colmapviewHub/thumbnail.test.ts && npm run check
```
Expected: all pass. The HF e2e already decodes the sent thumbnail and checks 600 × 315.

- [ ] **Step 5: Commit**

```bash
cd colmap-webview && git add src/features/colmapviewHub/thumbnail.ts src/features/colmapviewHub/thumbnail.test.ts && git commit -m "Crop the card thumbnail to fill and strip JPEG metadata

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B4: Bucket access: public, private or unknown

Covers §2.2's bucket rules (findings M8 and L4).

**Files:**
- Modify:
  - `colmap-webview/src/features/bucketStorage/publicAccess.ts` (replace), `src/features/bucketStorage/publicAccess.test.ts` (replace);
  - `src/features/colmapviewHub/publication.ts` (one line).

**Interfaces:**
- Produces:
  - `type BucketAccess = 'public' | 'private' | 'unknown'`.
  - `isInternalHost(hostname): boolean`.
  - `bucketAccess(viewerUrl): Promise<BucketAccess>`, which never throws.
- Removes: `isPublishedBucketPublic`.

- [ ] **Step 1: Write the failing tests by replacing `src/features/bucketStorage/publicAccess.test.ts`**

```ts
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bucketAccess, isInternalHost } from './publicAccess';

beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
afterEach(() => vi.unstubAllGlobals());
const viewer = (source: string) => `https://colmapview.opsiclear.com/?url=${encodeURIComponent(source)}`;
const manifest = { version: 1, baseUrl: 'https://public.example/scene/', files: { cameras: 'cameras.bin', images: 'images.bin', points3D: 'points3D.bin' },
  viewerStatePath: 'colmapview.yaml', imageNameToPath: { photo: 'images/photo.jpg' } };

describe('bucketAccess', () => {
  it('confirms public access to the manifest, model, settings and a sample image without credentials', async () => {
    const request = vi.fn(async (url: string, init: RequestInit) => {
      expect(init.credentials).toBe('omit');
      expect(new Headers(init.headers).has('Authorization')).toBe(false);
      return url.endsWith('manifest.json') ? Response.json(manifest) : new Response(new Uint8Array([1, 2, 3, 4]), { status: 206 });
    });
    vi.stubGlobal('fetch', request);
    expect(await bucketAccess(viewer('https://public.example/scene/manifest.json'))).toBe('public');
    expect(request.mock.calls.map(([url]) => url)).toContain('https://public.example/scene/images/photo.jpg');
    expect(request).toHaveBeenCalledTimes(6);
  });

  it.each([
    ['a refused model file', (url: string) => url.endsWith('manifest.json') ? Response.json(manifest) : new Response('Forbidden', { status: 403 }), 'private'],
    ['a refused manifest', () => new Response('Forbidden', { status: 401 }), 'private'],
    ['a sign-in page with status 200', (url: string) => url.endsWith('manifest.json') ? Response.json(manifest) : new Response('<html>Sign in</html>', { headers: { 'Content-Type': 'text/html' } }), 'private'],
    ['a missing manifest', () => new Response('Not found', { status: 404 }), 'unknown'],
    ['a failing file', (url: string) => url.endsWith('manifest.json') ? Response.json(manifest) : new Response('Error', { status: 500 }), 'unknown'],
    ['a CORS or network failure', () => { throw new TypeError('Failed to fetch'); }, 'unknown'],
  ] as const)('answers %s with %s', async (_name, respond, expected) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => respond(url)));
    expect(await bucketAccess(viewer('https://public.example/scene/manifest.json'))).toBe(expected);
  });

  it('recognizes a public ZIP header, also split across chunks, and cancels the rest of the body', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([80, 75])); controller.enqueue(new Uint8Array([3, 4])); }, cancel });
    const request = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal('fetch', request);
    expect(await bucketAccess(viewer('https://public.example/dataset.zip'))).toBe('public');
    expect(cancel).toHaveBeenCalledOnce();
    expect(new Headers(request.mock.calls[0][1].headers).get('Range')).toBe('bytes=0-3');
  });

  it('treats internal hosts as private without any request', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    for (const host of ['localhost', '127.0.0.1', '10.1.2.3', '192.168.1.20', 'minio', 'nas.local', '[fd12:3456::1]']) {
      expect(await bucketAccess(viewer(`http://${host}:9000/bucket/scene.zip`)), host).toBe('private');
    }
    expect(request).not.toHaveBeenCalled();
  });

  it('answers unknown for a viewer link without a source', async () => {
    expect(await bucketAccess('https://colmapview.opsiclear.com/')).toBe('unknown');
  });
});

describe('isInternalHost', () => {
  it.each([
    ['localhost', true], ['127.0.0.1', true], ['10.0.0.1', true], ['172.16.0.1', true], ['172.31.255.255', true], ['192.168.0.1', true],
    ['169.254.1.1', true], ['100.64.0.1', true], ['0.0.0.0', true], ['minio', true], ['bucket.local', true], ['s3.internal', true], ['nas.lan', true],
    ['printer.home.arpa', true], ['[::1]', true], ['[fd00::1]', true], ['[fe80::1]', true], ['host.localhost', true],
    ['172.32.0.1', false], ['8.8.8.8', false], ['bucket.s3.amazonaws.com', false], ['example.com', false], ['[2001:db8::1]', false],
  ])('%s is internal: %s', (host, internal) => expect(isInternalHost(host)).toBe(internal));
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd colmap-webview && npx vitest run src/features/bucketStorage/publicAccess.test.ts`

Expected: FAIL. `bucketAccess` and `isInternalHost` are not exported.

- [ ] **Step 3: Replace `src/features/bucketStorage/publicAccess.ts`**

```ts
import { ColmapManifestSchema } from '../../types/manifest';
import { timeoutSignal } from '../../utils/abortSignals';
import { readBoundedResponse } from '../../utils/publishedViewerState';

export type BucketAccess = 'public' | 'private' | 'unknown';

const LOCAL_SUFFIXES = ['.local', '.internal', '.lan', '.home.arpa', '.localhost'];

/** Hosts nobody elsewhere can reach: loopback, private and link-local ranges, local names, and single-label names. */
export function isInternalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || host === 'home.arpa' || LOCAL_SUFFIXES.some(suffix => host.endsWith(suffix))) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (host.includes(':')) return host === '::1' || host === '::' || /^f[cd][0-9a-f]{0,2}:/.test(host) || /^fe[89ab][0-9a-f]?:/.test(host);
  return !host.includes('.');
}

const refused = (response: Response) => response.status === 401 || response.status === 403
  || Boolean(response.headers.get('Content-Type')?.includes('text/html'));

/**
 * Whether a recipient without the bucket session, signatures or cookies can open the upload.
 * Refusals and sign-in pages mean private; anything inconclusive (CORS, network, other errors) means unknown.
 */
export async function bucketAccess(viewerUrl: string): Promise<BucketAccess> {
  try {
    const source = new URL(new URL(viewerUrl).searchParams.get('url') ?? '');
    if (isInternalHost(source.hostname)) return 'private';
    return await probe(source.href);
  } catch { return 'unknown'; }
}

async function probe(source: string): Promise<BucketAccess> {
  const signal = timeoutSignal(10000);
  const request = (url: string, headers?: HeadersInit) => fetch(url, { credentials: 'omit', signal, headers });
  const sample = async (url: string, zip = false): Promise<BucketAccess> => {
    const response = await request(url, { Range: 'bytes=0-3' });
    const reader = response.body?.getReader();
    try {
      if (refused(response)) return 'private';
      if (!response.ok || !reader) return 'unknown';
      const header = new Uint8Array(4);
      let length = 0;
      while (length < header.length) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!zip && value.length) return 'public';
        const bytes = value.subarray(0, header.length - length);
        header.set(bytes, length);
        length += bytes.length;
      }
      return zip && length === 4 && header[0] === 0x50 && header[1] === 0x4b && header[2] === 3 && header[3] === 4 ? 'public' : 'unknown';
    } finally { if (reader) { await reader.cancel(); reader.releaseLock(); } }
  };
  if (new URL(source).pathname.toLowerCase().endsWith('.zip')) return sample(source, true);
  const response = await request(source);
  if (refused(response)) { await response.body?.cancel(); return 'private'; }
  const manifest = ColmapManifestSchema.parse(JSON.parse(await (await readBoundedResponse(response, 8 * 1024 * 1024)).text()));
  const files = [...Object.values(manifest.files), manifest.viewerStatePath, manifest.splats?.[0],
    Object.values(manifest.imageNameToPath ?? {})[0] ?? manifest.images?.[0]].filter((file): file is string => Boolean(file));
  const results = await Promise.all(files.map(file => sample(new URL(file, manifest.baseUrl).href)));
  return results.includes('private') ? 'private' : results.every(result => result === 'public') ? 'public' : 'unknown';
}
```

- [ ] **Step 4: Keep the current controller compiling**

In `src/features/colmapviewHub/publication.ts`:
- Change the import to `import { bucketAccess } from '../bucketStorage/publicAccess';`.
- Change the bucket controller to `bucket: createHubPublication({ publicAccess: async viewerUrl => await bucketAccess(viewerUrl) === 'public' }),`.

Task B5 replaces this with the three-outcome flow.

- [ ] **Step 5: Run the tests and gates**

```bash
cd colmap-webview && npx vitest run src/features/bucketStorage src/features/colmapviewHub && npm run check
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd colmap-webview && git add src/features/bucketStorage/publicAccess.ts src/features/bucketStorage/publicAccess.test.ts src/features/colmapviewHub/publication.ts && git commit -m "Tell public, private and unconfirmed bucket uploads apart

Refusals and sign-in pages mean private, inconclusive checks mean unknown,
and internal hosts are private without a request.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B5: The Hub controller, and runtime wiring for every upload

Covers:
- §2.2–§2.5 controller behavior (findings H4, H5, M7, M8, L5 and L17);
- §2.6's preview release;
- §2.8 `bindHubPublication`, the `prepare` shape and capture injection.

**Files:**
- Create: `colmap-webview/src/features/colmapviewHub/hubShareLinks.ts`, `hubShareLinks.test.ts`, `bindHubPublication.ts`, `bindHubPublication.test.ts`
- Replace: `src/features/colmapviewHub/publication.ts`, `src/features/colmapviewHub/publication.test.ts`
- Modify:
  - `src/features/datasetPublishing/publicationSnapshot.ts`;
  - `src/features/datasetPublishing/publicationRuntime.ts`, `src/features/googleDrive/publicationRuntime.ts`, `src/features/googleDrive/publicationRuntime.test.ts`, `src/features/bucketStorage/publicationRuntime.ts`;
  - `src/components/upload/useHubLink.ts`;
  - `src/components/modals/GoogleDrivePublishModal.tsx`, `src/components/modals/GoogleDrivePublishModal.test.tsx`, `src/components/bucket/BucketPublishModal.tsx`, `src/components/bucket/BucketPublishModal.test.tsx`;
  - `e2e/hugging-face-publish.spec.ts`.

**Interfaces:**
- Consumes:
  - `getHubBaseUrl` (B1);
  - `buildHubPayload`, `HubAccess`, `HubMetadata`, `HubLinkPayload` (B2);
  - `makeHubThumbnail` (B3);
  - `bucketAccess` and `BucketAccess` (B4);
  - `publicationLicenseInfo` (B2).
- Produces from `hubShareLinks.ts`:
  - `interface HubSource { key: string; revision: number }`;
  - `hubShareLinks.{ set(provider, link | null), subscribe, getVersion, match(source, pendingDeletions): string | null }`.
- Produces from `publication.ts`:
  - `type HubProvider = 'huggingFace' | 'googleDrive' | 'bucket'`;
  - `interface HubPrepareOptions { access: HubAccess | 'check'; source: HubSource; preview?: File | null; capture?: HubCapture | null }`;
  - `interface HubLinkState { phase: 'idle' | 'checking' | 'creating' | 'ready' | 'failed'; viewerUrl?; bucketAccess?; url?; managementUrl?; error?; retryable?; retryAfter?; deleteLinkSeen? }`;
  - `class HubRequestError(message, kind: HubFailureKind, retryAfterMs = 0)`;
  - `requestHubLink(baseUrl, payload)`;
  - `createHubPublication(provider, deps?)`, which returns `{ getSnapshot, subscribe, isEnabled, isBusy, blocksUnload, prepare, finish, retry, markDeleteLinkSeen, setDialogOpen }`;
  - `hubPublications.{ huggingFace, googleDrive, bucket }` and `type HubPublication`.
- Produces from `bindHubPublication.ts`: `bindHubPublication(controller, hub, select: (snapshot) => { uploading: boolean; completed?: { viewerUrl; assets? } }): () => void`.
- Produces from `publicationSnapshot.ts`: `getHubSource(state?)` and `captureCurrentView()`.
- New runtime signatures:
  - `publishCurrentDataset(username, details, preview: File)`;
  - `publishCurrentDatasetToDrive(name, shared, imageFormat = 'original', preview: File | null = null)`;
  - `publishCurrentDatasetToBucket(folder, format = 'folder', imageFormat = 'original', preview: File | null = null)`.
- `useHubLink(provider)` returns `{ state, controller }`; `options` is gone.

- [ ] **Step 1: Write the failing tests**

1. `src/features/colmapviewHub/hubShareLinks.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { hubShareLinks } from './hubShareLinks';

const source = { key: '1:url:https://example.test/a/:', revision: 2 };
beforeEach(() => { for (const provider of ['huggingFace', 'googleDrive', 'bucket']) hubShareLinks.set(provider, null); });

describe('hubShareLinks', () => {
  it('offers the newest ready link made from exactly this dataset state', () => {
    hubShareLinks.set('huggingFace', { url: 'https://hub.invalid/hub/Older', source, readyAt: 1 });
    hubShareLinks.set('googleDrive', { url: 'https://hub.invalid/hub/Newer', source, readyAt: 2 });
    hubShareLinks.set('bucket', { url: 'https://hub.invalid/hub/Other', source: { ...source, revision: 3 }, readyAt: 3 });
    expect(hubShareLinks.match(source, 0)).toBe('https://hub.invalid/hub/Newer');
    expect(hubShareLinks.match({ ...source, key: 'other' }, 0)).toBeNull();
  });

  it('offers nothing while deletions are pending, and forgets a provider\'s link', () => {
    hubShareLinks.set('huggingFace', { url: 'https://hub.invalid/hub/One', source, readyAt: 1 });
    expect(hubShareLinks.match(source, 1)).toBeNull();
    const version = hubShareLinks.getVersion();
    hubShareLinks.set('huggingFace', null);
    expect(hubShareLinks.getVersion()).toBe(version + 1);
    expect(hubShareLinks.match(source, 0)).toBeNull();
  });
});
```

2. `src/features/colmapviewHub/bindHubPublication.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindHubPublication } from './bindHubPublication';
import type { HubPublication } from './publication';

interface Snapshot { phase: string; viewerUrl?: string }
function fakeController() {
  const listeners = new Set<() => void>();
  let snapshot: Snapshot = { phase: 'idle' };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    emit(next: Snapshot) { snapshot = next; listeners.forEach(listener => listener()); },
    listenerCount: () => listeners.size,
  };
}
const unloading = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};
const select = (snapshot: Snapshot) => ({ uploading: snapshot.phase === 'uploading',
  completed: snapshot.phase === 'completed' && snapshot.viewerUrl ? { viewerUrl: snapshot.viewerUrl } : undefined });

describe('bindHubPublication', () => {
  let unbind = () => {};
  afterEach(() => unbind());

  it('finishes the Hub link when an upload completes', () => {
    const controller = fakeController();
    const hub = { finish: vi.fn(), blocksUnload: vi.fn(() => false) };
    unbind = bindHubPublication(controller, hub as unknown as HubPublication, select);
    controller.emit({ phase: 'uploading' });
    expect(hub.finish).not.toHaveBeenCalled();
    controller.emit({ phase: 'completed', viewerUrl: 'https://viewer.example/?url=x' });
    expect(hub.finish).toHaveBeenCalledWith('https://viewer.example/?url=x', undefined);
  });

  it('warns before leaving while uploading or while the Hub asks, and stops once unbound', () => {
    const controller = fakeController();
    const hub = { finish: vi.fn(), blocksUnload: vi.fn(() => false) };
    unbind = bindHubPublication(controller, hub as unknown as HubPublication, select);
    expect(unloading()).toBe(false);
    controller.emit({ phase: 'uploading' });
    expect(unloading()).toBe(true);
    controller.emit({ phase: 'idle' });
    hub.blocksUnload.mockReturnValue(true);
    expect(unloading()).toBe(true);
    unbind();
    expect(unloading()).toBe(false);
    expect(controller.listenerCount()).toBe(0);
  });
});
```

3. Replace `src/features/colmapviewHub/publication.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHubPublication, HubRequestError, requestHubLink } from './publication';
import { hubShareLinks } from './hubShareLinks';
import type { PublicationAssetSummary } from '../datasetPublishing/types';

const HUB = 'https://hub.invalid/hub';
const preview = new File(['normalized preview'], 'preview.png', { type: 'image/png' });
const viewer = 'https://colmapview.opsiclear.com/?url=https://storage.example/manifest.json';
const link = { url: `${HUB}/HappyTree`, managementUrl: `${HUB}/manage/HappyTree` };
const source = { key: '1:url:https://storage.example/manifest.json:', revision: 0 };

/** A controller with mock dependencies; tests that override one keep their own reference to it. */
function controller(overrides: NonNullable<Parameters<typeof createHubPublication>[1]> = {}) {
  const request = vi.fn().mockResolvedValue(link);
  const thumbnail = vi.fn().mockResolvedValue('small-jpeg');
  const hub = createHubPublication('huggingFace', { baseUrl: () => HUB, thumbnail, request, notify: vi.fn(), ...overrides });
  return { hub, request, thumbnail };
}

beforeEach(() => { for (const provider of ['huggingFace', 'googleDrive', 'bucket']) hubShareLinks.set(provider, null); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Hub controller', () => {
  it('does nothing when the Hub is off for this host', async () => {
    const { hub, request } = controller({ baseUrl: () => null });
    expect(hub.isEnabled()).toBe(false);
    hub.prepare({ title: 'Scene' }, { access: 'public', preview, source });
    await hub.finish(viewer);
    expect(request).not.toHaveBeenCalled();
    expect(hub.getSnapshot()).toEqual({ phase: 'idle' });
  });

  it('creates a public link once the upload is verified, and ignores repeated completions', async () => {
    const { hub, request, thumbnail } = controller();
    const license = { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };
    hub.prepare({ title: 'Scene', description: 'Reconstruction', license }, { access: 'public', preview, source });
    expect(request).not.toHaveBeenCalled();
    await hub.finish(viewer);
    const [base, payload] = request.mock.calls[0];
    expect(base).toBe(HUB);
    expect(payload).toEqual({ viewerUrl: viewer, title: 'Scene', description: 'Reconstruction', license, access: 'public',
      thumbnailBase64: 'small-jpeg', managementSecret: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), publicAcknowledged: true });
    expect(thumbnail).toHaveBeenCalledWith(preview);
    expect(hub.getSnapshot()).toEqual({ phase: 'ready', viewerUrl: viewer, url: link.url,
      managementUrl: `${link.managementUrl}#${payload.managementSecret}`, deleteLinkSeen: false });
    await hub.finish(viewer);
    expect(request).toHaveBeenCalledOnce();
  });

  it('creates an unguessable link for a private upload', async () => {
    const { hub, request } = controller();
    hub.prepare({ title: 'Private scene' }, { access: 'private', preview, source });
    await hub.finish(viewer);
    expect(request.mock.calls[0][1].access).toBe('private');
  });

  it.each([['public', 'public'], ['private', 'private'], ['unknown', 'private']] as const)('sends a %s bucket as %s, checking once', async (result, access) => {
    const checkBucket = vi.fn().mockResolvedValue(result);
    const request = vi.fn().mockRejectedValueOnce(new HubRequestError("Couldn't reach ColmapView Hub.", 'network')).mockResolvedValue(link);
    const { hub } = controller({ checkBucket, request });
    const phases: string[] = [];
    hub.subscribe(() => phases.push(hub.getSnapshot().phase));
    hub.prepare({ title: 'Bucket scene' }, { access: 'check', preview, source });
    await hub.finish(viewer);
    await hub.retry();
    expect(phases).toEqual(['idle', 'checking', 'creating', 'failed', 'creating', 'ready']);
    expect(checkBucket).toHaveBeenCalledOnce();
    expect(request.mock.calls[1][1].access).toBe(access);
    expect(hub.getSnapshot().bucketAccess).toBe(result);
  });

  it('retries a network failure with the same payload and key, and offers no Retry for a rejection', async () => {
    const request = vi.fn().mockRejectedValueOnce(new HubRequestError("Couldn't reach ColmapView Hub.", 'network'))
      .mockRejectedValueOnce(new HubRequestError('Use a viewer link without access credentials.', 'rejected'));
    const { hub, thumbnail } = controller({ request });
    hub.prepare({ title: 'Scene' }, { access: 'public', preview, source });
    await hub.finish(viewer);
    expect(hub.getSnapshot()).toMatchObject({ phase: 'failed', error: "Couldn't reach ColmapView Hub.", retryable: true });
    await hub.retry();
    expect(request.mock.calls[1][1]).toBe(request.mock.calls[0][1]);
    expect(thumbnail).toHaveBeenCalledOnce();
    expect(hub.getSnapshot()).toMatchObject({ phase: 'failed', error: 'Use a viewer link without access credentials.', retryable: false });
    await hub.retry();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('enables Retry after a 429 only once Retry-After passes', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockRejectedValueOnce(new HubRequestError('Too many requests from your network; try again in 2 min.', 'rate-limited', 120_000))
      .mockResolvedValue(link);
    const { hub } = controller({ request });
    hub.prepare({ title: 'Scene' }, { access: 'public', preview, source });
    await hub.finish(viewer);
    expect(hub.getSnapshot().retryAfter).toBeGreaterThan(Date.now());
    await hub.retry();
    expect(request).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(120_000);
    expect(hub.getSnapshot().retryAfter).toBeUndefined();
    await hub.retry();
    expect(hub.getSnapshot().phase).toBe('ready');
  });

  it('captures a missing preview again on Retry, and offers no Retry when it cannot', async () => {
    const capture = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(preview);
    const { hub, thumbnail } = controller();
    hub.prepare({ title: 'Scene' }, { access: 'public', source, capture });
    await hub.finish(viewer);
    expect(hub.getSnapshot()).toMatchObject({ phase: 'failed', error: 'The upload preview is unavailable.', retryable: true });
    await hub.retry();
    expect(capture).toHaveBeenCalledTimes(2);
    expect(thumbnail).toHaveBeenCalledWith(preview);
    expect(hub.getSnapshot().phase).toBe('ready');
    const without = controller();
    without.hub.prepare({ title: 'Scene' }, { access: 'public', source });
    await without.hub.finish(viewer);
    expect(without.hub.getSnapshot()).toMatchObject({ phase: 'failed', retryable: false });
  });

  it('shows one toast when a link finishes while its dialog is closed, and none while it is open', async () => {
    const notify = vi.fn();
    const request = vi.fn().mockResolvedValueOnce(link).mockRejectedValueOnce(new HubRequestError('ColmapView Hub is unavailable.', 'unavailable')).mockResolvedValue(link);
    const { hub } = controller({ notify, request });
    hub.prepare({ title: 'Scene' }, { access: 'public', preview, source });
    await hub.finish(viewer);
    expect(notify).toHaveBeenCalledExactlyOnceWith('info', 'Hub link ready. Reopen the upload dialog to copy it and its delete link.');
    hub.prepare({ title: 'Scene' }, { access: 'public', preview, source });
    await hub.finish(viewer);
    expect(notify).toHaveBeenLastCalledWith('warning', 'Hub link not created. Reopen the upload dialog to retry.');
    hub.setDialogOpen(true);
    await hub.retry();
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('shows exactly one toast when the bucket dialog closes during the access check', async () => {
    let finishCheck!: (value: 'public') => void;
    const notify = vi.fn();
    const { hub } = controller({ notify, checkBucket: vi.fn(() => new Promise<'public'>(resolve => { finishCheck = resolve; })) });
    hub.setDialogOpen(true);
    hub.prepare({ title: 'Bucket scene' }, { access: 'check', preview, source });
    const finishing = hub.finish(viewer);
    expect(hub.getSnapshot().phase).toBe('checking');
    hub.setDialogOpen(false);
    finishCheck('public');
    await finishing;
    expect(notify).toHaveBeenCalledExactlyOnceWith('info', 'Hub link ready. Reopen the upload dialog to copy it and its delete link.');
  });

  it('asks to stay on the page while busy and until the delete link has been shown', async () => {
    let answer!: (value: typeof link) => void;
    const request = vi.fn(() => new Promise<typeof link>(resolve => { answer = resolve; }));
    const { hub } = controller({ request });
    hub.prepare({ title: 'Scene' }, { access: 'public', preview, source });
    expect(hub.blocksUnload()).toBe(false);
    const finishing = hub.finish(viewer);
    expect(hub.isBusy()).toBe(true);
    expect(hub.blocksUnload()).toBe(true);
    expect(() => hub.prepare({ title: 'Changed' }, { access: 'public', preview, source })).toThrow('Wait for the current Hub link');
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    answer(link);
    await finishing;
    expect(hub.blocksUnload()).toBe(true);
    hub.markDeleteLinkSeen();
    expect(hub.blocksUnload()).toBe(false);
    expect(hub.getSnapshot().deleteLinkSeen).toBe(true);
  });

  it('offers the ready link to the Share panel for the dataset it was made from', async () => {
    const { hub } = controller();
    hub.prepare({ title: 'Scene' }, { access: 'public', preview, source });
    await hub.finish(viewer);
    expect(hubShareLinks.match(source, 0)).toBe(link.url);
    expect(hubShareLinks.match({ ...source, revision: 1 }, 0)).toBeNull();
    hub.prepare({ title: 'Next' }, { access: 'public', preview, source });
    expect(hubShareLinks.match(source, 0)).toBeNull();
  });

  it('keeps the verified asset inventory snapshot through a failure and retry', async () => {
    const assets: PublicationAssetSummary = { format: 'zip', imageFormat: 'jpeg', colmap: { files: 3, cameras: 2, points: 1000 },
      images: 2, masks: 1, splats: 1, viewerSettings: true, preview: false };
    const original = structuredClone(assets);
    const thumbnail = vi.fn().mockRejectedValueOnce(new Error('Preview decode failed')).mockResolvedValue('jpeg');
    const capture = vi.fn().mockResolvedValue(preview);
    const { hub, request } = controller({ thumbnail });
    hub.prepare({ title: 'Scene' }, { access: 'public', preview, source, capture });
    await hub.finish(viewer, assets);
    expect(hub.getSnapshot()).toMatchObject({ phase: 'failed', error: 'The card preview could not be created.', retryable: true });
    assets.masks = 99;
    await hub.retry();
    expect(request.mock.calls[0][1].assets).toEqual(original);
  });
});

describe('requestHubLink', () => {
  const payload = { viewerUrl: viewer, title: 'Scene', description: '', thumbnailBase64: 'x', managementSecret: 'S'.repeat(43),
    access: 'public' as const, publicAcknowledged: true as const };

  it.each([
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch')), "Couldn't reach ColmapView Hub.", 'network', 0],
    ['a timeout', () => Promise.reject(new DOMException('The operation timed out.', 'TimeoutError')), "ColmapView Hub didn't respond.", 'timeout', 0],
    ['a 503', () => Promise.resolve(new Response('Temporary failure', { status: 503 })), 'ColmapView Hub is unavailable.', 'unavailable', 0],
    ['a 429 with Retry-After', () => Promise.resolve(Response.json({ error: 'Too many attempts. Try again later.' }, { status: 429, headers: { 'Retry-After': '120' } })),
      'Too many requests from your network; try again in 2 min.', 'rate-limited', 120_000],
    ['a 429 without a readable Retry-After', () => Promise.resolve(Response.json({}, { status: 429 })),
      'Too many requests from your network; try again in 1 min.', 'rate-limited', 60_000],
    ['a 400 rejection', () => Promise.resolve(Response.json({ error: 'Use a viewer link without access credentials.' }, { status: 400 })),
      'Use a viewer link without access credentials.', 'rejected', 0],
    ['a 409', () => Promise.resolve(Response.json({ error: 'No free link name. Create a new link.' }, { status: 409 })), 'No free link name. Create a new link.', 'rejected', 0],
    ['a link on another host', () => Promise.resolve(Response.json({ url: 'https://evil.example/hub/X', managementPath: '/hub/manage/X' }, { status: 201 })),
      'ColmapView Hub returned an invalid link.', 'rejected', 0],
  ] as const)('maps %s', async (_name, respond, message, kind, retryAfterMs) => {
    vi.stubGlobal('fetch', vi.fn(respond));
    await expect(requestHubLink(HUB, payload)).rejects.toMatchObject({ message, kind, retryAfterMs });
  });

  it('returns absolute links under the configured Hub', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 'HappyTree', url: `${HUB}/HappyTree`, managementPath: '/hub/manage/HappyTree' }, { status: 201 })));
    await expect(requestHubLink(HUB, payload)).resolves.toEqual(link);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd colmap-webview && npx vitest run src/features/colmapviewHub`

Expected: FAIL to compile, because `./hubShareLinks`, `./bindHubPublication`, `HubRequestError` and `requestHubLink` don't exist.

- [ ] **Step 3: Create `src/features/colmapviewHub/hubShareLinks.ts`**

```ts
/** What a Hub link was made from: the dataset's source key and edit revision at upload. */
export interface HubSource { key: string; revision: number }
export interface HubShareLink { url: string; source: HubSource; readyAt: number }

const links = new Map<string, HubShareLink>();
const listeners = new Set<() => void>();
let version = 0;

/** Ready Hub links by provider, so the Share panel can offer the newest one for the dataset on screen. */
export const hubShareLinks = {
  set(provider: string, link: HubShareLink | null): void {
    if (link) links.set(provider, link);
    else if (!links.delete(provider)) return;
    version++;
    listeners.forEach(listener => listener());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  getVersion: () => version,
  /** The newest ready link made from exactly this dataset state; none while deletions are pending. */
  match(source: HubSource, pendingDeletions: number): string | null {
    if (pendingDeletions) return null;
    let newest: HubShareLink | null = null;
    for (const link of links.values()) {
      if (link.source.key === source.key && link.source.revision === source.revision && (!newest || link.readyAt > newest.readyAt)) newest = link;
    }
    return newest?.url ?? null;
  },
};
```

- [ ] **Step 4: Replace `src/features/colmapviewHub/publication.ts`**

```ts
import { makeHubThumbnail } from './thumbnail';
import { getHubBaseUrl } from './config';
import { buildHubPayload, type HubAccess, type HubLinkPayload, type HubMetadata } from './payload';
import { hubShareLinks, type HubSource } from './hubShareLinks';
import { timeoutSignal } from '../../utils/abortSignals';
import { useNotificationStore } from '../../store';
import { bucketAccess, type BucketAccess } from '../bucketStorage/publicAccess';
import type { PublicationAssetSummary } from '../datasetPublishing/types';

export type { HubAccess, HubMetadata } from './payload';
export type { BucketAccess } from '../bucketStorage/publicAccess';
export type HubCapture = () => Promise<Blob | null>;
export type HubProvider = 'huggingFace' | 'googleDrive' | 'bucket';
export interface HubPrepareOptions {
  /** 'check' decides after the upload, from the anonymous bucket check. */
  access: HubAccess | 'check';
  source: HubSource;
  preview?: File | null;
  /** Captures the current view when there is no preview, and again on Retry after a preview failure. */
  capture?: HubCapture | null;
}
export type HubFailureKind = 'network' | 'timeout' | 'rate-limited' | 'unavailable' | 'rejected' | 'preview';
export interface HubLinkState {
  phase: 'idle' | 'checking' | 'creating' | 'ready' | 'failed';
  viewerUrl?: string;
  bucketAccess?: BucketAccess;
  url?: string;
  managementUrl?: string;
  error?: string;
  retryable?: boolean;
  /** Set until a 429's Retry-After passes; the controller clears it then. */
  retryAfter?: number;
  deleteLinkSeen?: boolean;
}

export class HubRequestError extends Error {
  constructor(message: string, readonly kind: HubFailureKind, readonly retryAfterMs = 0) {
    super(message);
  }
}

const RETRYABLE = new Set<HubFailureKind>(['network', 'timeout', 'rate-limited', 'unavailable', 'preview']);
const READY_TOAST = 'Hub link ready. Reopen the upload dialog to copy it and its delete link.';
const FAILED_TOAST = 'Hub link not created. Reopen the upload dialog to retry.';
const INVALID_LINK = 'ColmapView Hub returned an invalid link.';

/** POST /api/links with typed failures. The returned links must lie under the configured Hub. */
export async function requestHubLink(baseUrl: string, payload: HubLinkPayload): Promise<{ url: string; managementUrl: string }> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/links`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: timeoutSignal(15000) });
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw timedOut ? new HubRequestError("ColmapView Hub didn't respond.", 'timeout') : new HubRequestError("Couldn't reach ColmapView Hub.", 'network');
  }
  const result: unknown = await response.json().catch(() => null);
  const field = (key: string): unknown => (result && typeof result === 'object' ? (result as Record<string, unknown>)[key] : undefined);
  if (response.status === 429) {
    // Cross-origin callers can read Retry-After only because the Hub exposes it; otherwise wait a minute.
    const seconds = Math.max(1, Number(response.headers.get('Retry-After')) || 60);
    throw new HubRequestError(`Too many requests from your network; try again in ${Math.ceil(seconds / 60)} min.`, 'rate-limited', seconds * 1000);
  }
  if (response.status >= 500) throw new HubRequestError('ColmapView Hub is unavailable.', 'unavailable');
  if (!response.ok) {
    const message = field('error');
    throw new HubRequestError(typeof message === 'string' && message ? message : 'ColmapView Hub rejected this link.', 'rejected');
  }
  const [url, managementPath] = [field('url'), field('managementPath')];
  if (typeof url !== 'string' || typeof managementPath !== 'string') throw new HubRequestError(INVALID_LINK, 'rejected');
  const root = `${baseUrl}/`;
  let link: URL;
  let management: URL;
  try { link = new URL(url); management = new URL(managementPath, root); }
  catch { throw new HubRequestError(INVALID_LINK, 'rejected'); }
  if (!link.href.startsWith(root) || !management.href.startsWith(`${root}manage/`)) throw new HubRequestError(INVALID_LINK, 'rejected');
  return { url: link.href, managementUrl: management.href };
}

interface Draft {
  metadata: HubMetadata;
  access: HubAccess | 'check';
  source: HubSource;
  secret: string;
  capture: HubCapture | null;
  preview: Promise<Blob | null> | null;
  bucketAccess?: BucketAccess;
}

interface Dependencies {
  baseUrl?: () => string | null;
  thumbnail?: (preview: Blob) => Promise<string>;
  request?: typeof requestHubLink;
  checkBucket?: (viewerUrl: string) => Promise<BucketAccess>;
  notify?: (type: 'info' | 'warning', message: string) => void;
  now?: () => number;
}

const newSecret = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const startCapture = (capture: HubCapture) => Promise.resolve().then(capture).catch(() => null);

/** The Hub step after an upload. Its state outlives the upload receipt; retries keep the ownership key and payload. */
export function createHubPublication(provider: HubProvider, deps: Dependencies = {}) {
  const baseUrl = deps.baseUrl ?? (() => getHubBaseUrl());
  const thumbnail = deps.thumbnail ?? makeHubThumbnail;
  const request = deps.request ?? requestHubLink;
  const checkBucket = deps.checkBucket ?? bucketAccess;
  const notify = deps.notify ?? ((type, message) => { useNotificationStore.getState().addNotification(type, message, 10_000); });
  const now = deps.now ?? Date.now;
  let state: HubLinkState = { phase: 'idle' };
  let draft: Draft | null = null;
  let payload: HubLinkPayload | null = null;
  let dialogOpen = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const set = (next: HubLinkState) => {
    const finished = state.phase === 'creating' && (next.phase === 'ready' || next.phase === 'failed');
    state = next;
    listeners.forEach(listener => listener());
    if (finished && !dialogOpen) notify(next.phase === 'ready' ? 'info' : 'warning', next.phase === 'ready' ? READY_TOAST : FAILED_TOAST);
  };
  const busy = () => state.phase === 'checking' || state.phase === 'creating';

  const run = async (viewerUrl: string): Promise<void> => {
    const base = baseUrl();
    const current = draft;
    if (!base || !current) return;
    try {
      let access: HubAccess;
      if (current.access === 'check') {
        if (!current.bucketAccess) {
          set({ phase: 'checking', viewerUrl });
          current.bucketAccess = await checkBucket(viewerUrl);
        }
        access = current.bucketAccess === 'public' ? 'public' : 'private';
      } else access = current.access;
      set({ phase: 'creating', viewerUrl, bucketAccess: current.bucketAccess });
      if (!payload) {
        const preview = await current.preview;
        // The payload replaces the full-size preview; Retry captures a new one if building fails.
        current.preview = null;
        if (!preview) throw new HubRequestError('The upload preview is unavailable.', 'preview');
        let thumbnailBase64: string;
        try { thumbnailBase64 = await thumbnail(preview); }
        catch { throw new HubRequestError('The card preview could not be created.', 'preview'); }
        payload = buildHubPayload({ viewerUrl, metadata: current.metadata, access, thumbnailBase64, managementSecret: current.secret });
      }
      const link = await request(base, payload);
      set({ phase: 'ready', viewerUrl, bucketAccess: current.bucketAccess, url: link.url,
        managementUrl: `${link.managementUrl}#${current.secret}`, deleteLinkSeen: false });
      hubShareLinks.set(provider, { url: link.url, source: current.source, readyAt: now() });
    } catch (error) {
      const failure = error instanceof HubRequestError ? error
        : new HubRequestError(error instanceof Error && error.message ? error.message : 'ColmapView Hub could not save this link.', 'rejected');
      const retryable = RETRYABLE.has(failure.kind) && (failure.kind !== 'preview' || Boolean(current.capture));
      set({ phase: 'failed', viewerUrl, bucketAccess: current.bucketAccess, error: failure.message, retryable,
        ...(failure.retryAfterMs ? { retryAfter: now() + failure.retryAfterMs } : {}) });
      if (failure.retryAfterMs) {
        clearTimeout(retryTimer);
        const failed = state;
        retryTimer = setTimeout(() => { if (state === failed) set({ ...failed, retryAfter: undefined }); }, failure.retryAfterMs);
      }
    }
  };

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    isEnabled: () => baseUrl() !== null,
    isBusy: busy,
    /** Busy, or a link exists whose delete row has not been shown yet. */
    blocksUnload: () => busy() || (state.phase === 'ready' && !state.deleteLinkSeen),
    /**
     * Starts a draft for the next upload. The disclosure line renders exactly when the Hub is enabled
     * (hubDisclosure), so a draft always follows a shown disclosure; that is what publicAcknowledged confirms.
     */
    prepare(metadata: HubMetadata, options: HubPrepareOptions) {
      if (busy()) throw new Error('Wait for the current Hub link to finish.');
      clearTimeout(retryTimer);
      payload = null;
      hubShareLinks.set(provider, null);
      draft = baseUrl() ? {
        metadata: structuredClone(metadata), access: options.access, source: options.source, secret: newSecret(), capture: options.capture ?? null,
        preview: options.preview ? Promise.resolve(options.preview) : options.capture ? startCapture(options.capture) : null,
      } : null;
      set({ phase: 'idle' });
    },
    /** Called when the upload is verified. Later notifications for the same draft are ignored. */
    finish(viewerUrl: string, assets?: PublicationAssetSummary): Promise<void> {
      if (!draft || state.phase !== 'idle') return Promise.resolve();
      if (assets) draft.metadata.assets = structuredClone(assets);
      return run(viewerUrl);
    },
    retry(): Promise<void> {
      if (state.phase !== 'failed' || !state.retryable || state.retryAfter !== undefined || !state.viewerUrl || !draft) return Promise.resolve();
      if (!payload && !draft.preview && draft.capture) draft.preview = startCapture(draft.capture);
      return run(state.viewerUrl);
    },
    markDeleteLinkSeen() {
      if (state.phase !== 'ready' || state.deleteLinkSeen) return;
      state = { ...state, deleteLinkSeen: true };
      listeners.forEach(listener => listener());
    },
    setDialogOpen(open: boolean) {
      dialogOpen = open;
    },
  };
}

export const hubPublications = {
  huggingFace: createHubPublication('huggingFace'),
  googleDrive: createHubPublication('googleDrive'),
  bucket: createHubPublication('bucket'),
};
export type HubPublication = ReturnType<typeof createHubPublication>;
```

- [ ] **Step 5: Create `src/features/colmapviewHub/bindHubPublication.ts`**

```ts
import type { PublicationAssetSummary } from '../datasetPublishing/types';
import type { HubPublication } from './publication';

export interface CompletedUpload { viewerUrl: string; assets?: PublicationAssetSummary }
interface UploadController<S> { getSnapshot(): S; subscribe(listener: () => void): () => void }

/** Finishes the Hub link when an upload completes, and warns before leaving while the upload or its Hub link still needs the tab. */
export function bindHubPublication<S>(controller: UploadController<S>, hub: HubPublication,
  select: (snapshot: S) => { uploading: boolean; completed?: CompletedUpload }): () => void {
  const unsubscribe = controller.subscribe(() => {
    const { completed } = select(controller.getSnapshot());
    if (completed) void hub.finish(completed.viewerUrl, completed.assets);
  });
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!select(controller.getSnapshot()).uploading && !hub.blocksUnload()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', beforeUnload);
  return () => { unsubscribe(); window.removeEventListener('beforeunload', beforeUnload); };
}
```

- [ ] **Step 6: Add the Hub source and capture helpers to `src/features/datasetPublishing/publicationSnapshot.ts`**

Add `useExportStore` to the `../../store` import, then append:

```ts
/** What a Hub link records as its dataset state. */
export function getHubSource(state = useReconstructionStore.getState()): { key: string; revision: number } {
  return { key: getPublicationSourceKey(state), revision: state.reconstructionEditRevision };
}

/** The view capture the Hub uses when an upload has no preview. */
export function captureCurrentView(): Promise<Blob | null> {
  return useExportStore.getState().getScreenshotBlob?.() ?? Promise.resolve(null);
}
```

- [ ] **Step 7: Wire the three runtimes**

These rewrites delete the dead HMR teardown, since `vite.config.ts` sets `hmr: false`.

1. Replace `src/features/datasetPublishing/publicationRuntime.ts`:

```ts
import { useReconstructionStore, usePublicationStatusStore } from '../../store';
import { hfAuth } from '../huggingface/auth';
import { createHubClient } from '../huggingface/hubClient';
import { HfError } from '../huggingface/http';
import { prepareTransferPublication } from './prepareTransferPublication';
import { assertPublicationInputCurrent, captureCurrentView, capturePublicationInput, getHubSource, getPublicationSourceKey } from './publicationSnapshot';
export { getPublicationSourceKey } from './publicationSnapshot';
import { createPublicationController, isPublishing } from './publishDataset';
import type { PublicationDetails } from './types';
import { createPublicationVerifier } from './publicationVerification';
import { publicationLicenseInfo } from './publicationMetadata';
import { hubPublications } from '../colmapviewHub/publication';
import { bindHubPublication } from '../colmapviewHub/bindHubPublication';

const client = createHubClient(username => hfAuth.getAccessToken(username));
export const publication = createPublicationController(client, createPublicationVerifier(client));
publication.subscribe(() => usePublicationStatusStore.setState({ phase: publication.getSnapshot().phase }));
bindHubPublication(publication, hubPublications.huggingFace, current => ({
  uploading: isPublishing(current.phase),
  completed: current.phase === 'completed' && current.receipt ? { viewerUrl: current.receipt.viewerUrl, assets: current.receipt.assets } : undefined,
}));
let activeSourceKey = getPublicationSourceKey();
useReconstructionStore.subscribe(() => {
  const sourceKey = getPublicationSourceKey();
  if (sourceKey !== activeSourceKey) { activeSourceKey = sourceKey; publication.invalidate(); }
});

export function publishCurrentDataset(username: string, details: PublicationDetails, preview: File): Promise<void> {
  hubPublications.huggingFace.prepare({ title: details.title, description: details.description, license: publicationLicenseInfo(details) },
    { access: details.visibility === 'public' ? 'public' : 'private', preview, capture: captureCurrentView, source: getHubSource() });
  return publication.publish(username, details, async (signal, progress) => {
    const input = capturePublicationInput();
    if (!preview) throw new HfError('Choose a preview image before publishing.');
    input.preview = preview;
    const assertCurrent = () => assertPublicationInputCurrent(input);
    return prepareTransferPublication(input, signal, progress, assertCurrent,
      { format: details.format, repositorySidecars: true, imageFormat: details.imageFormat });
  });
}
```

2. Replace `src/features/googleDrive/publicationRuntime.ts`:

```ts
import { useReconstructionStore, useDeletionStore, useDrivePublicationStatus } from '../../store';
import { assertPublicationInputCurrent, captureCurrentView, capturePublicationInput, getHubSource, getPublicationSourceKey } from '../datasetPublishing/publicationSnapshot';
import { googleDriveAuth } from './auth';
import { createDriveUploadClient } from './upload';
import { createDrivePublicationController, isDrivePublishing } from './publishDataset';
import { prepareDriveArchive } from './prepareArchive';
import { ARCHIVE_SIZE_LIMIT } from '../../utils/zipValidation';
import type { PublicationImageFormat } from '../datasetPublishing/types';
import { hubPublications } from '../colmapviewHub/publication';
import { bindHubPublication } from '../colmapviewHub/bindHubPublication';

export const drivePublication = createDrivePublicationController(createDriveUploadClient({
  getAccessToken: googleDriveAuth.getAccessToken, expireSession: googleDriveAuth.expire,
}));
drivePublication.subscribe(() => useDrivePublicationStatus.setState({ active: drivePublication.getSnapshot().phase !== 'idle' }));
bindHubPublication(drivePublication, hubPublications.googleDrive, current => ({
  uploading: isDrivePublishing(current.phase),
  completed: current.phase === 'completed' && current.receipt ? { viewerUrl: current.receipt.viewerUrl, assets: current.receipt.assets } : undefined,
}));
let sourceKey = getPublicationSourceKey();
let modelRevision = useReconstructionStore.getState().reconstructionEditRevision;
useReconstructionStore.subscribe(state => {
  const nextKey = getPublicationSourceKey(state);
  if (nextKey !== sourceKey || state.reconstructionEditRevision !== modelRevision) {
    const change = nextKey !== sourceKey ? 'dataset' : 'edit';
    sourceKey = nextKey; modelRevision = state.reconstructionEditRevision; drivePublication.invalidate(change);
  }
});
useDeletionStore.subscribe(state => { if (state.pendingDeletions.size) drivePublication.invalidate('edit'); });

export function publishCurrentDatasetToDrive(name: string, shared: boolean, imageFormat: PublicationImageFormat = 'original', preview: File | null = null): Promise<void> {
  const input = capturePublicationInput();
  hubPublications.googleDrive.prepare({ title: name.trim().replace(/\.zip$/i, '') || 'Dataset' },
    { access: shared ? 'public' : 'private', preview, capture: captureCurrentView, source: getHubSource() });
  const assertCurrent = () => assertPublicationInputCurrent(input);
  return drivePublication.publish(name, shared,
    (signal, progress) => prepareDriveArchive(input, signal, progress, assertCurrent, ARCHIVE_SIZE_LIMIT, imageFormat), assertCurrent);
}
```

3. Replace `src/features/bucketStorage/publicationRuntime.ts`:

```ts
import { useReconstructionStore, useDeletionStore } from '../../store';
import { assertPublicationInputCurrent, captureCurrentView, capturePublicationInput, getHubSource, getPublicationSourceKey } from '../datasetPublishing/publicationSnapshot';
import { prepareTransferPublication } from '../datasetPublishing/prepareTransferPublication';
import type { PublicationFormat, PublicationImageFormat } from '../datasetPublishing/types';
import { bucketConnection } from './connection';
import { createBucketPublicationController, isBucketPublishing } from './publishDataset';
import { BucketError } from './types';
import { hubPublications } from '../colmapviewHub/publication';
import { bindHubPublication } from '../colmapviewHub/bindHubPublication';

export const bucketPublication = createBucketPublicationController();
bindHubPublication(bucketPublication, hubPublications.bucket, current => ({
  uploading: isBucketPublishing(current.phase),
  completed: current.phase === 'completed' && current.viewerUrl ? { viewerUrl: current.viewerUrl, assets: current.assets } : undefined,
}));
let sourceKey = getPublicationSourceKey();
let modelRevision = useReconstructionStore.getState().reconstructionEditRevision;
useReconstructionStore.subscribe(state => {
  const key = getPublicationSourceKey(state);
  if (key !== sourceKey || state.reconstructionEditRevision !== modelRevision) {
    sourceKey = key; modelRevision = state.reconstructionEditRevision; bucketPublication.invalidate();
  }
});
useDeletionStore.subscribe(state => { if (state.pendingDeletions.size) bucketPublication.invalidate(); });

export function publishCurrentDatasetToBucket(folder: string, format: PublicationFormat = 'folder', imageFormat: PublicationImageFormat = 'original',
  preview: File | null = null): Promise<void> {
  if (imageFormat === 'jpeg' && format !== 'zip') throw new BucketError('JPEG image conversion requires ZIP archive format.');
  const session = bucketConnection.getSession();
  if (!session) throw new BucketError('Connect to a bucket before uploading.');
  const input = capturePublicationInput();
  hubPublications.bucket.prepare({ title: folder.split('/').filter(Boolean).at(-1) || 'Dataset' },
    { access: 'check', preview, capture: captureCurrentView, source: getHubSource() });
  const assertCurrent = () => assertPublicationInputCurrent(input);
  return bucketPublication.publish(session, folder,
    (signal, progress) => prepareTransferPublication(input, signal, progress, assertCurrent, { format, imageFormat }), assertCurrent);
}
```

- [ ] **Step 8: Update the callers of the old option tuple**

1. Replace `src/components/upload/useHubLink.ts`:

```ts
import { useSyncExternalStore } from 'react';
import { hubPublications } from '../../features/colmapviewHub/publication';

export function useHubLink(provider: keyof typeof hubPublications) {
  const controller = hubPublications[provider];
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return { state, controller };
}
export type HubLink = ReturnType<typeof useHubLink>;
```

2. `GoogleDrivePublishModal.tsx`: in `publishNow`, call `await facade.publishDataset(name, shared, imageFormat, preview.file ?? null);`.

3. `BucketPublishModal.tsx`: in `publish`, call `await facade.publishDataset(folder, format, selectedImageFormat, preview.file ?? null);`.

4. In `GoogleDrivePublishModal.test.tsx`, add `null` as the fourth expected argument of every `publishDataset` call expectation, for example `toHaveBeenLastCalledWith('dataset.zip', true, 'original', null)`. That is six places.

5. In `BucketPublishModal.test.tsx`, do the same for the three `publication.publish` expectations, for example `toHaveBeenLastCalledWith('dataset', 'folder', 'original', null)`.

6. In `src/features/googleDrive/publicationRuntime.test.ts`:
   - Change the hub mock to `const hub = vi.hoisted(() => ({ finish: vi.fn(), prepare: vi.fn(), blocksUnload: vi.fn(() => false) }));`.
   - Add `publish: vi.fn(),` to the hoisted `controller` object.
   - Change `import './publicationRuntime';` to `import { publishCurrentDatasetToDrive } from './publicationRuntime';`.
   - Add `buildCamera` to the builders import.
   - In `beforeEach`, replace `hub.getSnapshot.mockReturnValue({ phase: 'idle' })` with `hub.blocksUnload.mockReturnValue(false)`.
   - Add this test:

```ts
  it('prepares a public Hub link for shared uploads and a private one otherwise, recording the dataset state', () => {
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }), sourceType: 'url', sourceUrl: 'https://example.test/a/' });
    void publishCurrentDatasetToDrive('scene.zip', true);
    expect(hub.prepare).toHaveBeenLastCalledWith({ title: 'scene' },
      expect.objectContaining({ access: 'public', preview: null, source: { key: expect.stringContaining('https://example.test/a/'), revision: 0 } }));
    void publishCurrentDatasetToDrive('scene.zip', false);
    expect(hub.prepare).toHaveBeenLastCalledWith({ title: 'scene' }, expect.objectContaining({ access: 'private' }));
  });
```

   - Replace the first two tests with:

```ts
  it('finishes the Hub link after every completed upload, shared or private', () => {
    const viewerUrl = 'https://colmapview.opsiclear.com/?url=https://drive.google.com/file/d/file-id/view';
    const assets: PublicationAssetSummary = { format: 'zip', imageFormat: 'original', colmap: { files: 3, cameras: 1, points: 0 },
      images: 1, masks: 0, splats: 0, viewerSettings: true, preview: false };
    controller.emit('uploading', { shared: true, viewerUrl, assets });
    expect(hub.finish).not.toHaveBeenCalled();
    controller.emit('completed', { shared: false, viewerUrl, assets });
    expect(hub.finish).toHaveBeenCalledExactlyOnceWith(viewerUrl, assets);
  });

  it('keeps the tab-close warning while the Hub link still needs the tab', () => {
    controller.emit('completed');
    hub.blocksUnload.mockReturnValue(true);
    expect(unloading()).toBe(true);
    hub.blocksUnload.mockReturnValue(false);
    expect(unloading()).toBe(false);
  });
```

- [ ] **Step 9: Send `access` and the license name in the HF e2e**

In `e2e/hugging-face-publish.spec.ts`:

1. Replace the `ShorteningRequest` interface and the `beforeEach` route:

```ts
const longId = 'HappyTree-AAAAAAAAAAAAAAAA';
const longUrl = `https://hub.invalid/hub/${longId}`;
interface ShorteningRequest {
  viewerUrl: string; title: string; thumbnailBase64: string; access: 'public' | 'private'; managementSecret: string;
  license?: { name: string; url?: string };
  assets?: PublicationAssetSummary;
}
```

```ts
  await page.route(shorteningEndpoint, async route => {
    const request = route.request().postDataJSON() as ShorteningRequest;
    requests.push(request);
    const id = request.access === 'private' ? longId : 'HappyTree';
    await route.fulfill({ json: { id, url: `https://hub.invalid/hub/${id}`, managementPath: `/hub/manage/${id}` } });
  });
```

2. In the public test:
   - Change `expect(requests[0]).toMatchObject({ title: 'Browser test scene', listed: false, license: { id: 'cc-by-4.0' } });` to:

```ts
    expect(requests[0]).toMatchObject({ title: 'Browser test scene', access: 'public',
      license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' } });
    expect(requests[0]).not.toHaveProperty('listed');
```

3. In the private test:
   - Replace `expect(shorteningRequests.get(page)).toHaveLength(0);` with:

```ts
    const requests = shorteningRequests.get(page)!;
    expect(requests).toHaveLength(1);
    expect(requests[0].access).toBe('private');
```

   - Replace `const viewerUrl = await dialog.getByLabel('Viewer link', { exact: true }).inputValue();` with:

```ts
    await expect(dialog.getByLabel('Viewer link', { exact: true })).toHaveValue(longUrl);
    const viewerUrl = `${new URL('/', baseURL).href}?url=https://huggingface.co/datasets/publisher/scene`;
```

4. In the retry test, change `expect(requests[0].listed).toBe(false);` to `expect(requests[0].access).toBe('public');`.

- [ ] **Step 10: Run the tests and gates**

```bash
cd colmap-webview && npx vitest run src/features src/components && npm run check && npm run test:deployment && npx playwright test e2e/hugging-face-publish.spec.ts --project=chromium --reporter=list
```
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
cd colmap-webview && git add src/features src/components e2e/hugging-face-publish.spec.ts && git commit -m "Create a Hub card for every upload, with typed errors and retries

The controller sends access (bucket uploads decide after the anonymous check),
maps failures to short reasons, offers Retry only where it can help (after
Retry-After for a 429, re-capturing a missing preview), shows a toast when a
link finishes with its dialog closed, and keeps the tab while the delete link
is unseen. One helper wires completion and unload for all three providers;
the dead HMR teardown is gone and the screenshot capture is injected.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B6: Dataset names for upload defaults

Covers §2.6's dataset name helper and the removed synthetic description (finding L1).

**Files:**
- Create: `colmap-webview/src/features/datasetPublishing/publicationDatasetName.test.ts`
- Modify:
  - `src/store/reconstructionStore.ts`, `src/hooks/fileDropzoneLocalSources.ts`, `src/hooks/fileDropzoneLocalSources.test.ts`, `src/hooks/useFileDropzone.ts`;
  - `src/features/datasetPublishing/publicationSnapshot.ts`;
  - `src/components/modals/useGoogleDrivePublishStoreFacade.ts`, `src/components/bucket/useBucketPublishStoreFacade.ts`;
  - `src/components/modals/GoogleDrivePublishModal.tsx`, `src/components/modals/GoogleDrivePublishModal.test.tsx`;
  - `src/components/bucket/BucketPublishModal.tsx`, `src/components/bucket/BucketPublishModal.test.tsx`.

**Interfaces:**
- Produces:
  - store field `sourceName: string | null` and action `setSourceName(name)`; `setSourceInfo` resets `sourceName` to null;
  - `archiveName(name): string | null`, exported from `fileDropzoneLocalSources.ts`;
  - `getPublicationDatasetName(state?): string`;
  - facades for Drive and bucket expose `datasetName: string`.

- [ ] **Step 1: Write the failing tests**

1. `src/features/datasetPublishing/publicationDatasetName.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { useReconstructionStore } from '../../store';
import { getPublicationDatasetName } from './publicationSnapshot';
import type { ColmapManifest } from '../../types/manifest';

const state = (patch: Partial<ReturnType<typeof useReconstructionStore.getState>>) => ({ ...useReconstructionStore.getInitialState(), ...patch });

describe('getPublicationDatasetName', () => {
  it('prefers the manifest name', () => {
    expect(getPublicationDatasetName(state({ sourceManifest: { name: 'Garden scan' } as ColmapManifest, sourceUrl: 'https://data.example/x/scene.zip' }))).toBe('Garden scan');
  });

  it('uses the source URL\'s last segment without its extension, skipping generic names', () => {
    expect(getPublicationDatasetName(state({ sourceUrl: 'https://data.example/sets/garden.zip' }))).toBe('garden');
    expect(getPublicationDatasetName(state({ sourceUrl: 'https://huggingface.co/datasets/user/my%20scene' }))).toBe('my scene');
    expect(getPublicationDatasetName(state({ sourceUrl: 'https://drive.google.com/file/d/abc/view', sourceName: 'from-drop' }))).toBe('from-drop');
    expect(getPublicationDatasetName(state({ sourceUrl: 'https://bucket.example/d/1/manifest.json' }))).toBe('colmap-dataset');
  });

  it('falls back to the recorded local name, then colmap-dataset', () => {
    expect(getPublicationDatasetName(state({ sourceName: 'garden' }))).toBe('garden');
    expect(getPublicationDatasetName(state({}))).toBe('colmap-dataset');
  });

  it('removes path separators', () => {
    expect(getPublicationDatasetName(state({ sourceManifest: { name: 'a/b\\c' } as ColmapManifest }))).toBe('a-b-c');
  });
});
```

2. Append to `src/hooks/fileDropzoneLocalSources.test.ts`, inside the `describe` block. Add `archiveName` to the import from `./fileDropzoneLocalSources`.

```ts
  it('records a single dropped folder name for upload defaults, and none for several entries', async () => {
    const files = new Map([['sparse/0/cameras.bin', buildFile('cameras.bin')]]);
    const make = () => {
      const deps = { ...makeBaseDeps(), setSourceName: vi.fn(), collectDroppedFiles: vi.fn(async () => files), isArchiveFile: () => false,
        processZipFile: vi.fn(), scanEntry: vi.fn() };
      deps.processFiles.mockImplementation(async (_files, _progress, options) => { options?.onSceneReplaced?.(); return true; });
      return deps;
    };
    const folder = (name: string) => ({ name, isDirectory: true, isFile: false }) as FileSystemEntry;
    const single = make();
    await loadDropPayload({ singleFile: null, entries: [folder('garden')], fallbackFiles: [] }, single);
    expect(single.setSourceInfo).toHaveBeenLastCalledWith('local', null);
    expect(single.setSourceName).toHaveBeenLastCalledWith('garden');
    const several = make();
    await loadDropPayload({ singleFile: null, entries: [folder('garden'), folder('more')], fallbackFiles: [] }, several);
    expect(several.setSourceName).toHaveBeenLastCalledWith(null);
  });

  it('records a picked folder name and a local archive name', async () => {
    const browse = { ...makeBaseDeps(), setSourceName: vi.fn(), pickDirectory: vi.fn(async () => buildFileSystemDirectoryHandle({ name: 'garden' })),
      scanDirectoryHandle: vi.fn(async (_handle: FileSystemDirectoryHandle, _path: string, found: Map<string, File>) => { found.set('cameras.bin', buildFile('cameras.bin')); }) };
    browse.processFiles.mockImplementation(async (_files, _progress, options) => { options?.onSceneReplaced?.(); return true; });
    await loadBrowsedDirectory(browse);
    expect(browse.setSourceName).toHaveBeenLastCalledWith('garden');
    const zip = { ...makeBaseDeps(), setSourceName: vi.fn(), setActiveZipArchive: vi.fn(),
      loadZipFromFile: vi.fn(async () => ({ colmapFiles: new Map([['cameras.bin', buildFile('cameras.bin')]]), imageIndex: new Map(), archive: buildArchiveReader(), fileSize: 1, imageCount: 0 })) };
    zip.processFiles.mockImplementation(async (_files, _progress, options) => { options?.onSceneReplaced?.(); return true; });
    await loadLocalZipFile(buildFile('garden.v2.zip'), zip);
    expect(zip.setSourceName).toHaveBeenLastCalledWith('garden.v2');
  });

  it.each([['scene.zip', 'scene'], ['Garden.TAR.GZ', 'Garden'], ['scene.tgz', 'scene'], ['scene.7z', 'scene'], ['.zip', null]])('names the archive %s as %j', (name, expected) => {
    expect(archiveName(name)).toBe(expected);
  });
```

3. In `GoogleDrivePublishModal.test.tsx`:
   - Add `datasetName: 'garden'` to the facade mock object.
   - Change the default-name expectations from `'dataset.zip'` to `'garden.zip'`: `toHaveValue('dataset.zip')` and the four `publishDataset` expectations that use `'dataset.zip'`.

4. In `BucketPublishModal.test.tsx`, the facade is real, so the dataset name comes from the store: add `sourceName: 'garden'` to the two `useReconstructionStore.setState({ reconstruction: … })` calls in the first two tests. Change their expected folder from `'dataset'` to `'garden'`.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd colmap-webview && npx vitest run src/features/datasetPublishing/publicationDatasetName.test.ts src/hooks/fileDropzoneLocalSources.test.ts src/components/modals/GoogleDrivePublishModal.test.tsx src/components/bucket/BucketPublishModal.test.tsx`

Expected: FAIL. `getPublicationDatasetName`, `archiveName` and `setSourceName` don't exist, and the defaults are still `dataset.zip` and `dataset`.

- [ ] **Step 3: Record the local name in the store (`src/store/reconstructionStore.ts`)**

1. In the state interface, after `sourceManifest: ColmapManifest | null;`, add:

```ts
  /** A dropped or picked folder's name, or a local archive's name without its extension, for upload defaults; null for other sources. */
  sourceName: string | null;
```

2. After the `setSourceInfo` declaration, add `setSourceName: (name: string | null) => void;`.

3. In the initial state and in `clear()`'s `set({ … })`, add `sourceName: null,` next to `sourceManifest: null,`.

4. Change `setSourceInfo` so every source change forgets the old name, and add the setter:

```ts
  setSourceInfo: (sourceType, sourceUrl = null, imageUrlBase = null, maskUrlBase = null, sourceManifest = null, imageNameToUrl = null) =>
    set({ sourceType, sourceUrl, imageUrlBase, maskUrlBase, sourceManifest, imageNameToUrl, sourceName: null }),
  setSourceName: (sourceName) => set({ sourceName }),
```

- [ ] **Step 4: Pass the name from the local loaders (`src/hooks/fileDropzoneLocalSources.ts`)**

1. Add `setSourceName?: (name: string | null) => void;` to `LocalSourceBaseDeps`.

2. Replace `commitLocalSceneSource` and add two helpers:

```ts
function commitLocalSceneSource(deps: Pick<LocalSourceBaseDeps, 'clearCaches' | 'setSourceInfo' | 'setSourceName'>, name: string | null): void {
  deps.clearCaches();
  deps.setSourceInfo('local', null);
  deps.setSourceName?.(name);
}

/** A single dropped folder's name; several dropped entries share no name. */
function droppedFolderName(payload: FileDropPayload): string | null {
  return payload.entries.length === 1 && payload.entries[0].isDirectory ? payload.entries[0].name || null : null;
}

/** An archive's file name without its archive extension. */
export function archiveName(name: string): string | null {
  return name.replace(/\.(?:tar\.(?:gz|bz2|xz|zst)|tgz|zip|tar|7z)$/i, '') || null;
}
```

3. Pass the names through:
   - In `loadLocalZipFile`'s install callback, after `deps.setSourceInfo('zip', null);`, add `deps.setSourceName?.(archiveName(zipFile.name));`.
   - In `loadDropPayload`: `commitLocalSceneSource(deps, droppedFolderName(payload))`.
   - In `loadBrowsedDirectory`: `commitLocalSceneSource(deps, dirHandle.name || null)`.

4. In `src/hooks/useFileDropzone.ts`:
   - Add `const setSourceName = useReconstructionStore((s) => s.setSourceName);` next to `setSourceInfo`.
   - Add `setSourceName,` to the deps objects of `processZipFile`, `handleDrop` and `handleBrowse`.
   - Add `setSourceName` to those three `useCallback` dependency arrays.

- [ ] **Step 5: Add the name helper (`src/features/datasetPublishing/publicationSnapshot.ts`)**

```ts
/** URL segments that name a file format rather than a dataset. */
const GENERIC_SEGMENTS = new Set(['view', 'manifest', 'colmapview', 'download', 'index', 'resolve', 'main']);

function urlName(value: string | null): string | null {
  if (!value) return null;
  try {
    const segment = decodeURIComponent(new URL(value).pathname.split('/').filter(Boolean).at(-1) ?? '').replace(/\.[^.]+$/, '');
    return segment && !GENERIC_SEGMENTS.has(segment.toLowerCase()) ? segment : null;
  } catch { return null; }
}

/** A default name for uploads: the manifest name, the source URL's last segment, the recorded local name, or "colmap-dataset". */
export function getPublicationDatasetName(state = useReconstructionStore.getState()): string {
  for (const candidate of [state.sourceManifest?.name, urlName(state.sourceUrl), state.sourceName]) {
    const name = candidate?.replace(/[\\/]+/g, '-').trim();
    if (name) return name;
  }
  return 'colmap-dataset';
}
```

- [ ] **Step 6: Use the name as the Drive and bucket defaults**

1. In both facades (`useGoogleDrivePublishStoreFacade.ts` and `useBucketPublishStoreFacade.ts`):
   - Import `getPublicationDatasetName` from `../../features/datasetPublishing/publicationSnapshot`.
   - Add `const datasetName = useReconstructionStore(getPublicationDatasetName);` and return `datasetName`.

2. In `GoogleDrivePublishModal.tsx`:
   - Replace `const [name, setName] = useState('dataset.zip');` with:

```ts
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const name = nameEdit ?? `${facade.datasetName}.zip`;
```

   - The input's `onChange` becomes `onChange={event => setNameEdit(event.target.value)}`.

3. In `BucketPublishModal.tsx`:
   - Replace `const [folder, setFolder] = useState('dataset');` with:

```ts
  const [folderEdit, setFolderEdit] = useState<string | null>(null);
  const folder = folderEdit ?? facade.datasetName;
```

   - The folder input's `onChange` becomes `onChange={event => setFolderEdit(event.target.value)}`.

The card titles follow from these names through the runtimes (§2.6). The runtimes no longer send a synthetic "N images" description; Task B5 removed it.

- [ ] **Step 7: Run the tests and gates**

```bash
cd colmap-webview && npx vitest run src/features/datasetPublishing src/hooks src/components && npm run check
```
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
cd colmap-webview && git add src/store/reconstructionStore.ts src/hooks src/features/datasetPublishing src/components && git commit -m "Name uploads after the dataset

The manifest name, the source URL's last segment, or the dropped folder or
archive name recorded at load sets the Drive file name and bucket folder
defaults, and through them the Hub card titles.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B7: The upload result: share link, delete row, failures and Previous upload

Covers §2.4's result and lifecycle UI, §2.7 focus (progress and result) and consistency, and §2.8 `onRetry` and `hub.busy` (findings H5, M7, L5 and L15).

**Files:**
- Create: `colmap-webview/src/components/upload/HubLink.test.tsx`, `src/components/upload/UploadParts.test.tsx` (the first tests in this folder)
- Modify:
  - `src/components/upload/HubLink.tsx` (replace), `src/components/upload/UploadParts.tsx`, `src/components/upload/useHubLink.ts`, `src/components/upload/upload.css`;
  - `src/components/modals/PublishDatasetModal.tsx`, `src/components/modals/GoogleDrivePublishModal.tsx`, `src/components/bucket/BucketPublishModal.tsx`;
  - `e2e/hugging-face-publish.spec.ts`.

**Interfaces:**
- Consumes: `HubLinkState` and the controller methods (B5).
- Produces:
  - `useHubLink(provider, dialogOpen: boolean)` returns `{ state, enabled, busy, retry, markDeleteLinkSeen }`.
  - `HubLinkResult({ state, onRetry, onDeleteLinkShown })`.
  - `UploadResult({ label, title, notice?, viewerUrl, providerLink?, hub? })`; the `linkLabel` prop is gone.
  - `PreviousUpload({ hub })`.

- [ ] **Step 1: Write the failing component tests**

1. `src/components/upload/HubLink.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HubLinkResult } from './HubLink';
import type { HubLinkState } from '../../features/colmapviewHub/publication';

afterEach(cleanup);
const viewerUrl = 'https://colmapview.opsiclear.com/?url=x';
function renderResult(state: HubLinkState) {
  const props = { onRetry: vi.fn(), onDeleteLinkShown: vi.fn() };
  render(<HubLinkResult state={state} {...props} />);
  return props;
}

describe('HubLinkResult', () => {
  it.each([['checking', 'Checking public access…'], ['creating', 'Creating Hub link…']] as const)('shows the %s status', (phase, text) => {
    renderResult({ phase, viewerUrl });
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });

  it('shows the private delete link with a link to the delete page, and reports it shown', () => {
    const managementUrl = 'https://hub.invalid/hub/manage/HappyTree#secret';
    const props = renderResult({ phase: 'ready', viewerUrl, url: 'https://hub.invalid/hub/HappyTree', managementUrl });
    expect(screen.getByText("Private delete link (don't share)")).toBeVisible();
    expect(screen.getByLabelText('Private delete link')).toHaveValue(managementUrl);
    expect(screen.getByRole('link', { name: 'Delete Hub link' })).toHaveAttribute('href', managementUrl);
    expect(screen.getByRole('link', { name: 'Delete Hub link' })).toHaveAttribute('target', '_blank');
    expect(props.onDeleteLinkShown).toHaveBeenCalledOnce();
  });

  it('explains a failure, says the upload link still works, and offers Retry only when it can help', () => {
    const props = renderResult({ phase: 'failed', viewerUrl, error: "Couldn't reach ColmapView Hub.", retryable: true });
    expect(screen.getByRole('alert')).toHaveTextContent("Hub link not created: Couldn't reach ColmapView Hub. The link above still works.");
    fireEvent.click(screen.getByRole('button', { name: 'Retry Hub link' }));
    expect(props.onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert').parentElement).toHaveFocus();
    cleanup();
    renderResult({ phase: 'failed', viewerUrl, error: 'Use a viewer link without access credentials.', retryable: false });
    expect(screen.queryByRole('button', { name: 'Retry Hub link' })).toBeNull();
  });

  it('keeps Retry disabled until Retry-After passes', () => {
    renderResult({ phase: 'failed', viewerUrl, error: 'Too many requests from your network; try again in 2 min.', retryable: true, retryAfter: Date.now() + 120_000 });
    expect(screen.getByRole('button', { name: 'Retry Hub link' })).toBeDisabled();
  });
});
```

2. `src/components/upload/UploadParts.test.tsx`:

```tsx
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviousUpload, UploadProgress, UploadResult } from './UploadParts';
import type { HubLink } from './useHubLink';
import type { HubLinkState } from '../../features/colmapviewHub/publication';

afterEach(cleanup);
const viewerUrl = 'https://colmapview.opsiclear.com/?url=https://huggingface.co/datasets/u/scene';
const ready: HubLinkState = { phase: 'ready', viewerUrl, url: 'https://hub.invalid/hub/HappyTree', managementUrl: 'https://hub.invalid/hub/manage/HappyTree#k' };
const hub = (state: HubLinkState, enabled = true): HubLink => ({ state, enabled, busy: state.phase === 'checking' || state.phase === 'creating',
  retry: vi.fn(async () => {}), markDeleteLinkSeen: vi.fn() });
const provider = { url: 'https://huggingface.co/datasets/u/scene', label: 'Hugging Face page' };

describe('UploadResult', () => {
  it('shares the viewer link until the Hub link is ready, then the Hub link', () => {
    const { rerender } = render(<UploadResult label="Published dataset" title="Published u/scene" notice="Anyone can open this link."
      viewerUrl={viewerUrl} providerLink={provider} hub={hub({ phase: 'creating', viewerUrl })} />);
    expect(screen.getByLabelText('Share link')).toHaveValue(viewerUrl);
    expect(screen.getByText('Creating Hub link…')).toBeVisible();
    rerender(<UploadResult label="Published dataset" title="Published u/scene" notice="Anyone can open this link." viewerUrl={viewerUrl} providerLink={provider} hub={hub(ready)} />);
    expect(screen.getByLabelText('Share link')).toHaveValue(ready.url);
    expect(screen.getByRole('link', { name: 'Open link' })).toHaveAttribute('href', ready.url);
    expect(screen.getByRole('link', { name: 'Hugging Face page' })).toHaveAttribute('href', provider.url);
    expect(screen.getByLabelText('Private delete link')).toHaveValue(ready.managementUrl);
  });

  it('moves focus to the result title', () => {
    render(<UploadResult label="Published dataset" title="Saved u/scene privately" viewerUrl={viewerUrl} />);
    expect(screen.getByText('Saved u/scene privately').closest('p')).toHaveFocus();
  });

  it('shows no Hub part when the Hub is off or its state belongs to another upload', () => {
    render(<UploadResult label="Published dataset" title="Published" viewerUrl={viewerUrl} hub={hub(ready, false)} />);
    expect(screen.queryByLabelText('Private delete link')).toBeNull();
    cleanup();
    render(<UploadResult label="Published dataset" title="Published" viewerUrl={viewerUrl} hub={hub({ phase: 'creating', viewerUrl: 'https://other.example/' })} />);
    expect(screen.queryByText('Creating Hub link…')).toBeNull();
  });
});

describe('UploadProgress', () => {
  it('moves focus to the progress status', () => {
    render(<UploadProgress label="Publication progress" message="Uploading images…" progressLabel="Files" max={2} value={1} onCancel={vi.fn()} />);
    expect(screen.getByText('Uploading images…')).toHaveFocus();
  });
});

describe('PreviousUpload', () => {
  it('keeps the last Hub link and its delete row after the upload result resets', () => {
    render(<PreviousUpload hub={hub(ready)} />);
    const block = screen.getByRole('region', { name: 'Previous upload' });
    expect(within(block).getByRole('heading', { name: 'Previous upload' })).toBeVisible();
    expect(within(block).getByLabelText('Share link')).toHaveValue(ready.url);
    expect(within(block).getByLabelText('Private delete link')).toHaveValue(ready.managementUrl);
  });

  it('keeps a failure with Retry, and shows nothing before any upload or when the Hub is off', () => {
    render(<PreviousUpload hub={hub({ phase: 'failed', viewerUrl, error: 'ColmapView Hub is unavailable.', retryable: true })} />);
    expect(screen.getByRole('button', { name: 'Retry Hub link' })).toBeVisible();
    expect(screen.getByLabelText('Share link')).toHaveValue(viewerUrl);
    cleanup();
    expect(render(<PreviousUpload hub={hub({ phase: 'idle' })} />).container).toBeEmptyDOMElement();
    cleanup();
    expect(render(<PreviousUpload hub={hub(ready, false)} />).container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd colmap-webview && npx vitest run src/components/upload`

Expected: FAIL. `PreviousUpload` doesn't exist, `HubLinkResult` takes a controller, the label is still "Viewer link", and nothing moves focus.

- [ ] **Step 3: Replace `src/components/upload/HubLink.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import type { HubLinkState } from '../../features/colmapviewHub/publication';
import { CopyableField } from '../ui/CopyableField';
import { getButtonClass } from '../../theme';

const secondary = getButtonClass('secondary', 'sm');

/** The Hub's part of an upload result: progress, the private delete link, or the failure with Retry where Retry can help. */
export function HubLinkResult({ state, onRetry, onDeleteLinkShown }: {
  state: HubLinkState; onRetry: () => void; onDeleteLinkShown: () => void;
}) {
  const statusRef = useRef<HTMLDivElement>(null);
  const deleteRow = state.phase === 'ready' && Boolean(state.managementUrl);
  useEffect(() => { if (deleteRow) onDeleteLinkShown(); }, [deleteRow, onDeleteLinkShown]);
  const reason = state.error && /[.!?]$/.test(state.error) ? state.error : `${state.error ?? ''}.`;
  return <div ref={statusRef} tabIndex={-1} className="publication-access">
    {state.phase === 'checking' && <p role="status" className="publication-note">Checking public access…</p>}
    {state.phase === 'creating' && <p role="status" className="publication-note">Creating Hub link…</p>}
    {deleteRow && <>
      <p className="publication-note">{"Private delete link (don't share)"}</p>
      <CopyableField label="Private delete link" value={state.managementUrl!} />
      <div className="publication-actions">
        <a className={`${secondary} publication-button-link`} href={state.managementUrl} target="_blank" rel="noopener noreferrer">
          Delete Hub link<span aria-hidden="true"> ↗</span>
        </a>
      </div>
    </>}
    {state.phase === 'failed' && <>
      <p role="alert" className="text-ds-error">Hub link not created: {reason} The link above still works.</p>
      {state.retryable && <div className="publication-actions">
        <button type="button" className={secondary} disabled={state.retryAfter !== undefined}
          onClick={() => { onRetry(); statusRef.current?.focus(); }}>Retry Hub link</button>
      </div>}
    </>}
  </div>;
}
```

- [ ] **Step 4: Update the result parts in `src/components/upload/UploadParts.tsx`**

1. Change the first import to `import { useEffect, useId, useRef, type ReactNode } from 'react';`.

2. In `UploadProgress`, focus the status on mount:

```tsx
export function UploadProgress({ label, message, progressLabel, max, value, detail, onCancel, cancelDisabled, children }: {
  label: string; message: string; progressLabel: string; max: number; value: number; detail?: string;
  onCancel: () => void; cancelDisabled?: boolean; children?: ReactNode;
}) {
  const statusRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { statusRef.current?.focus(); }, []);
  return <section className="publication-section" aria-label={label}>
    {children}
    <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite">{message}</p>
    <progress max={Math.max(1, max)} value={value} aria-label={progressLabel} />
    {detail && <p className="publication-note">{detail}</p>}
    <div className="publication-actions"><button type="button" className={secondary} disabled={cancelDisabled} onClick={onCancel}>Cancel upload</button></div>
    <p className="publication-note">Keep this tab open. Reopen this dialog from Share.</p>
  </section>;
}
```

3. Replace `UploadResult` with three components:

```tsx
/** The link to share: the Hub link once it is ready, otherwise the viewer link; then the Hub status. */
function ShareLink({ viewerUrl, hub, providerLink }: { viewerUrl: string; hub?: HubLink; providerLink?: { url: string; label: string } }) {
  const hubState = hub?.enabled && hub.state.viewerUrl === viewerUrl ? hub.state : undefined;
  const link = hubState?.phase === 'ready' && hubState.url ? hubState.url : viewerUrl;
  return <>
    <CopyableField label="Share link" value={link} />
    <div className="publication-result-actions">
      <a className={`${secondary} publication-button-link`} href={link} target="_blank" rel="noopener noreferrer">Open link<span aria-hidden="true"> ↗</span></a>
      {providerLink && <a className={`${secondary} publication-button-link`} href={providerLink.url} target="_blank" rel="noopener noreferrer">
        {providerLink.label}<span aria-hidden="true"> ↗</span>
      </a>}
    </div>
    {hub && hubState && <HubLinkResult state={hubState} onRetry={hub.retry} onDeleteLinkShown={hub.markDeleteLinkSeen} />}
  </>;
}

export function UploadResult({ label, title, notice, viewerUrl, providerLink, hub }: {
  label: string; title: ReactNode; notice?: string; viewerUrl: string;
  providerLink?: { url: string; label: string };
  hub?: HubLink;
}) {
  const titleRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  return <section className="publication-section" aria-label={label}>
    <p ref={titleRef} tabIndex={-1} role="status" className="publication-result-title">
      <span className="publication-result-check" aria-hidden="true">✓ </span>{title}
    </p>
    {notice && <p className="publication-note">{notice}</p>}
    <ShareLink viewerUrl={viewerUrl} hub={hub} providerLink={providerLink} />
  </section>;
}

/** After an edit, a deletion mark or a new dataset resets the result, the last Hub link stays here until the next upload. */
export function PreviousUpload({ hub }: { hub: HubLink }) {
  const { state } = hub;
  if (!hub.enabled || state.phase === 'idle' || !state.viewerUrl) return null;
  return <section className="publication-section" aria-label="Previous upload">
    <h3 className="publication-result-title">Previous upload</h3>
    <ShareLink viewerUrl={state.viewerUrl} hub={hub} />
  </section>;
}
```

- [ ] **Step 5: Give the hook the dialog's open state (`src/components/upload/useHubLink.ts`)**

```ts
import { useEffect, useSyncExternalStore } from 'react';
import { hubPublications } from '../../features/colmapviewHub/publication';

/** One provider's Hub link for an upload dialog. Whether the dialog is open decides if a finished link shows a toast. */
export function useHubLink(provider: keyof typeof hubPublications, dialogOpen: boolean) {
  const controller = hubPublications[provider];
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => {
    controller.setDialogOpen(dialogOpen);
    return () => controller.setDialogOpen(false);
  }, [controller, dialogOpen]);
  return { state, enabled: controller.isEnabled(), busy: controller.isBusy(), retry: controller.retry, markDeleteLinkSeen: controller.markDeleteLinkSeen };
}
export type HubLink = ReturnType<typeof useHubLink>;
```

- [ ] **Step 6: Add the two CSS rules to `src/components/upload/upload.css`**

1. Change `.publication-section h3 { font-weight: 600; }` to `.publication-section h3 { font-weight: 600; margin: 0; }`.
2. After `.publication-submit-row { … }`, add:

```css
/* The Hub disclosure sits beside the publish button and wraps above it on narrow dialogs. */
.publication-disclosure { flex: 1 1 16rem; min-width: 0; }
```

- [ ] **Step 7: Update the three dialogs' calls**

In `PublishDatasetModal.tsx`, `GoogleDrivePublishModal.tsx` and `BucketPublishModal.tsx`:
- Change `useHubLink('<provider>')` to `useHubLink('<provider>', isOpen)`.
- Replace `hub.state.phase === 'creating'` in each publish button's `disabled` with `hub.busy`.

In `BucketPublishModal.tsx`, also remove the `linkLabel="Bucket viewer link"` prop.

- [ ] **Step 8: Use the new labels in the HF e2e**

In `e2e/hugging-face-publish.spec.ts`:

1. Every `getByLabel('Viewer link', { exact: true })` becomes `getByLabel('Share link', { exact: true })`, and every `'Retry shortening'` becomes `'Retry Hub link'`.

2. In the retry test, right after the first `Retry Hub link` button becomes visible, add:

```ts
    await expect(dialog.getByRole('alert')).toHaveText('Hub link not created: ColmapView Hub is unavailable. The link above still works.');
```

3. Replace the last two lines of the retry test, the `Manage Hub link` click and its expectation, with:

```ts
    const deleteLink = `https://hub.invalid/hub/manage/HappyTree#${requests[0].managementSecret}`;
    await expect(dialog.getByLabel('Private delete link', { exact: true })).toHaveValue(deleteLink);
    await expect(dialog.getByRole('link', { name: 'Delete Hub link' })).toHaveAttribute('href', deleteLink);
```

- [ ] **Step 9: Run the tests and gates**

```bash
cd colmap-webview && npx vitest run src/components && npm run check && npx playwright test e2e/hugging-face-publish.spec.ts --project=chromium --reporter=list
```
Expected: all pass. `npm run check` includes `classContract.test.ts`, and the new classes live in `upload.css`.

- [ ] **Step 10: Commit**

```bash
cd colmap-webview && git add src/components e2e/hugging-face-publish.spec.ts && git commit -m "Show the share link, a visible delete link and clear Hub failures

Results share the Hub link once ready, with Open link and the provider link.
A visible private delete row replaces the collapsed management link, failures
say why and that the upload link still works, and a Previous upload block keeps
the last Hub link after the result resets. Focus moves to the progress status
and the result title.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B8: The dialogs: disclosure, titles, Previous upload, bucket cleanup and focus

Covers §2.2's bucket notices, §2.3 disclosure, §2.4 titles, and §2.7's bucket dialog and focus (findings H4, M9, L4 and L15).

**Files:**
- Create: `colmap-webview/src/features/colmapviewHub/disclosure.ts`, `disclosure.test.ts`
- Modify:
  - `src/components/modals/PublishDatasetModal.tsx`, `src/components/modals/PublishDatasetModal.test.tsx`;
  - `src/components/modals/GoogleDrivePublishModal.tsx`, `src/components/modals/GoogleDrivePublishModal.test.tsx`;
  - `src/components/bucket/BucketPublishModal.tsx`, `src/components/bucket/BucketPublishModal.test.tsx`, `src/components/bucket/BucketConnectionForm.tsx`;
  - `src/components/bucket/BucketStorageModal.test.tsx`, `src/components/dropzone/StorageAccessPrompt.test.tsx`;
  - `e2e/drop-zone.spec.ts`.

**Interfaces:**
- Consumes: `useHubLink(provider, isOpen)`, `PreviousUpload` and `UploadResult` (B7); `BucketAccess` (B4, re-exported by `publication.ts`).
- Produces: `type HubDisclosureKind = 'public' | 'private' | 'bucket'` and `hubDisclosure(enabled: boolean, kind: HubDisclosureKind, originalImages: boolean): string | null`.

- [ ] **Step 1: Write the failing tests**

1. `src/features/colmapviewHub/disclosure.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hubDisclosure } from './disclosure';

const PUBLIC = 'Also creates a short ColmapView Hub link. Anyone with it sees the title, description and preview.';
const PRIVATE = 'Also creates an unguessable ColmapView Hub link. Anyone with it sees the title, description and preview; the data still needs access.';
const BUCKET = 'Also creates a ColmapView Hub link (short if the bucket is public). Anyone with it sees the title, description and preview.';
const ORIGINALS = 'Original images keep their metadata, such as location.';

describe('hubDisclosure', () => {
  it.each([['public', PUBLIC], ['private', PRIVATE], ['bucket', BUCKET]] as const)('states what a %s upload creates', (kind, line) => {
    expect(hubDisclosure(true, kind, false)).toBe(line);
  });

  it('adds the metadata sentence for original images unless access is private', () => {
    expect(hubDisclosure(true, 'public', true)).toBe(`${PUBLIC} ${ORIGINALS}`);
    expect(hubDisclosure(true, 'bucket', true)).toBe(`${BUCKET} ${ORIGINALS}`);
    expect(hubDisclosure(true, 'private', true)).toBe(PRIVATE);
  });

  it('is absent where the Hub is off', () => {
    expect(hubDisclosure(false, 'public', true)).toBeNull();
  });
});
```

2. In `src/components/modals/PublishDatasetModal.test.tsx`, add this mock after the existing `vi.mock` calls:

```ts
const hubLink = vi.hoisted(() => ({ value: { state: { phase: 'idle' }, enabled: true, busy: false, retry: vi.fn(), markDeleteLinkSeen: vi.fn() } as Record<string, unknown> }));
vi.mock('../upload/useHubLink', () => ({ useHubLink: () => hubLink.value }));
```

   Add `hubLink.value = { state: { phase: 'idle' }, enabled: true, busy: false, retry: vi.fn(), markDeleteLinkSeen: vi.fn() };` to `beforeEach`. Then append to the `describe` block:

```ts
  it('shows the disclosure for the chosen access beside the publish button', () => {
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    const row = screen.getByRole('button', { name: 'Publish public dataset' }).parentElement!;
    expect(within(row).getByText('Also creates a short ColmapView Hub link. Anyone with it sees the title, description and preview. Original images keep their metadata, such as location.')).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: 'Access' }), { target: { value: 'private' } });
    expect(screen.getByText('Also creates an unguessable ColmapView Hub link. Anyone with it sees the title, description and preview; the data still needs access.')).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: 'Access' }), { target: { value: 'public' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Format' }), { target: { value: 'zip' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Images' }), { target: { value: 'jpeg' } });
    expect(screen.getByText('Also creates a short ColmapView Hub link. Anyone with it sees the title, description and preview.')).toBeVisible();
  });

  it('shows no disclosure where the Hub is off, and waits while a Hub link is being made', () => {
    hubLink.value = { ...hubLink.value, enabled: false };
    const { unmount } = render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(screen.queryByText(/ColmapView Hub link/)).toBeNull();
    unmount();
    hubLink.value = { ...hubLink.value, enabled: true, busy: true };
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Publish public dataset' })).toBeDisabled();
  });

  it('titles a private result "Saved … privately" and a public one "Published …"', () => {
    const receipt = { repoId: 'publisher/scene', repoUrl: 'https://huggingface.co/datasets/publisher/scene', dataCommit: 'a', metadataCommit: 'b',
      viewerUrl: 'https://colmapview.opsiclear.com/?url=https://huggingface.co/datasets/publisher/scene' };
    actions.publish = { phase: 'completed', receipt: { ...receipt, visibility: 'private' } };
    const { unmount } = render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Published dataset' })).toHaveTextContent('Saved publisher/scene privately');
    unmount();
    actions.publish = { phase: 'completed', receipt: { ...receipt, visibility: 'public' } };
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Published dataset' })).toHaveTextContent('Published publisher/scene');
  });

  it('keeps the previous Hub link above the form after the result resets', () => {
    hubLink.value = { ...hubLink.value, state: { phase: 'ready', viewerUrl: 'https://colmapview.opsiclear.com/?url=x', url: 'https://hub.invalid/hub/HappyTree',
      managementUrl: 'https://hub.invalid/hub/manage/HappyTree#k' } };
    render(<PublishDatasetModal isOpen onClose={vi.fn()} />);
    expect(within(screen.getByRole('region', { name: 'Previous upload' })).getByLabelText('Share link')).toHaveValue('https://hub.invalid/hub/HappyTree');
  });

  it('moves focus to the first field after sign-in', () => {
    actions.auth = { status: 'disconnected', identity: null };
    const onClose = vi.fn();
    const { rerender } = render(<PublishDatasetModal isOpen onClose={onClose} />);
    actions.auth = { status: 'connected', identity: { username: 'publisher' } };
    rerender(<PublishDatasetModal isOpen onClose={onClose} />);
    expect(screen.getByRole('combobox', { name: 'Access' })).toHaveFocus();
  });
```

3. In `src/components/modals/GoogleDrivePublishModal.test.tsx`, add the same `hubLink` mock and `beforeEach` reset as in item 2 (use the path `'../upload/useHubLink'`). Then append:

```ts
  it('discloses the Hub link for the sharing choice and titles results by access', async () => {
    await renderOpenDialog();
    expect(screen.getByText('Also creates a short ColmapView Hub link. Anyone with it sees the title, description and preview. Original images keep their metadata, such as location.')).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: 'Access' }), { target: { value: 'private' } });
    expect(screen.getByText('Also creates an unguessable ColmapView Hub link. Anyone with it sees the title, description and preview; the data still needs access.')).toBeVisible();
    cleanup();
    const receipt = { fileId: 'f', driveUrl: 'https://drive.google.com/file/d/f/view', viewerUrl: 'https://colmapview.opsiclear.com/?url=x' };
    actions.publish = { phase: 'completed', receipt: { ...receipt, shared: false } };
    await renderOpenDialog();
    expect(screen.getByRole('region', { name: 'Published Drive dataset' })).toHaveTextContent('Saved privately to Google Drive');
    cleanup();
    actions.publish = { phase: 'completed', receipt: { ...receipt, shared: true } };
    await renderOpenDialog();
    expect(screen.getByRole('region', { name: 'Published Drive dataset' })).toHaveTextContent('Published to Google Drive');
  });

  it('moves focus to the first field after sign-in', async () => {
    actions.auth = { status: 'disconnected', error: null };
    const onClose = vi.fn();
    const { rerender } = await renderOpenDialog(onClose);
    actions.auth = { status: 'connected', error: null };
    rerender(<GoogleDrivePublishModal isOpen onClose={onClose} />);
    expect(screen.getByRole('combobox', { name: 'Access' })).toHaveFocus();
  });
```

4. In `src/components/bucket/BucketPublishModal.test.tsx`:
   - Add the same `hubLink` mock with path `'../upload/useHubLink'`, and reset it in `beforeEach`.
   - Change every `getByLabelText('Secret access key')` to `getByLabelText('Secret key')`.
   - Append:

```ts
  it('drops the read-only Access row, discloses the bucket Hub link, and names fields as they read', () => {
    open();
    expect(screen.getByLabelText('Secret key')).toBeVisible();
    fireEvent.click(screen.getByText('More options'));
    expect(screen.getByLabelText('Public URL (optional)')).toBeVisible();
    expect(screen.getByLabelText('Session token (optional)')).toBeVisible();
    bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' });
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }) });
    cleanup();
    open();
    expect(screen.queryByLabelText('Access', { exact: true })).toBeNull();
    expect(screen.getByText('Also creates a ColmapView Hub link (short if the bucket is public). Anyone with it sees the title, description and preview. Original images keep their metadata, such as location.')).toBeVisible();
  });

  it.each([
    ['public', 'Anyone can open this link.'],
    ['private', 'Private. Viewers need bucket access.'],
    ['unknown', 'Public access unconfirmed, so the Hub link is unguessable.'],
  ] as const)('states a %s bucket outcome in the result', (bucketAccess, notice) => {
    const viewerUrl = 'https://colmapview.opsiclear.com/?url=https://bucket.example/scene/manifest.json';
    publication.state = { phase: 'completed', message: 'Dataset uploaded.', filesDone: 1, filesTotal: 1, bytesDone: 1, viewerUrl };
    hubLink.value = { ...hubLink.value, state: { phase: 'ready', viewerUrl, bucketAccess, url: 'https://hub.invalid/hub/X', managementUrl: 'https://hub.invalid/hub/manage/X#k' } };
    open();
    expect(screen.getByText(notice)).toBeVisible();
  });

  it('says it is checking public access while the check runs, and moves focus to the first field after connecting', () => {
    const viewerUrl = 'https://colmapview.opsiclear.com/?url=https://bucket.example/scene/manifest.json';
    publication.state = { phase: 'completed', message: 'Dataset uploaded.', filesDone: 1, filesTotal: 1, bytesDone: 1, viewerUrl };
    hubLink.value = { ...hubLink.value, state: { phase: 'checking', viewerUrl } };
    open();
    expect(screen.getByText('Checking public access…')).toBeVisible();
    cleanup();
    publication.state = { phase: 'idle', message: '', filesDone: 0, filesTotal: 0, bytesDone: 0 };
    hubLink.value = { ...hubLink.value, state: { phase: 'idle' } };
    useReconstructionStore.setState({ reconstruction: buildReconstruction({ cameras: [buildCamera()] }) });
    open();
    act(() => { bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' }); });
    expect(screen.getByRole('combobox', { name: 'Format' })).toHaveFocus();
  });
```

5. Change `'Secret access key'` to `'Secret key'` in `BucketStorageModal.test.tsx` (three places), `StorageAccessPrompt.test.tsx` (one place) and `e2e/drop-zone.spec.ts` (one place).

- [ ] **Step 2: Run them and watch them fail**

Run: `cd colmap-webview && npx vitest run src/features/colmapviewHub/disclosure.test.ts src/components/modals src/components/bucket src/components/dropzone`

Expected: FAIL. There is no disclosure, the titles are old, there is no Previous upload block, the Access row is present, the aria-labels differ from the visible labels, and nothing moves focus.

- [ ] **Step 3: Create `src/features/colmapviewHub/disclosure.ts`**

```ts
export type HubDisclosureKind = 'public' | 'private' | 'bucket';

const LINES: Record<HubDisclosureKind, string> = {
  public: 'Also creates a short ColmapView Hub link. Anyone with it sees the title, description and preview.',
  private: 'Also creates an unguessable ColmapView Hub link. Anyone with it sees the title, description and preview; the data still needs access.',
  bucket: 'Also creates a ColmapView Hub link (short if the bucket is public). Anyone with it sees the title, description and preview.',
};
const ORIGINAL_IMAGES = 'Original images keep their metadata, such as location.';

/**
 * The line beside the publish button, or null where the Hub is off. A Hub draft exists exactly when
 * this line shows (the controller's prepare checks the same enabled state), so publicAcknowledged confirms it.
 */
export function hubDisclosure(enabled: boolean, kind: HubDisclosureKind, originalImages: boolean): string | null {
  if (!enabled) return null;
  return originalImages && kind !== 'private' ? `${LINES[kind]} ${ORIGINAL_IMAGES}` : LINES[kind];
}
```

- [ ] **Step 4: Update `src/components/modals/PublishDatasetModal.tsx`**

1. Add imports:
   - `import { useEffect, useId, useRef, useState } from 'react';` (adds `useEffect`);
   - `import { hubDisclosure } from '../../features/colmapviewHub/disclosure';`;
   - `PreviousUpload` in the `../upload/UploadParts` import.

2. After `const hub = useHubLink('huggingFace', isOpen);`, add:

```tsx
  const disclosure = hubDisclosure(hub.enabled, visibility, selectedImageFormat === 'original');
  const connected = auth.status === 'connected';
  const wasConnected = useRef(connected);
  useEffect(() => {
    if (connected && !wasConnected.current) document.getElementById(`${id}-access`)?.focus();
    wasConnected.current = connected;
  }, [connected, id]);
```

   `selectedImageFormat` must be declared before this line. Move `const selectedImageFormat = …` above it if needed.

3. Make the first child of `<div className="publication-main">` this line:

```tsx
          {selecting && <PreviousUpload hub={hub} />}
```

4. Change the result title prop to:

```tsx
title={publish.receipt.visibility === 'public' ? <>Published <strong>{publish.receipt.repoId}</strong></> : <>Saved <strong>{publish.receipt.repoId}</strong> privately</>}
```

5. In `.publication-submit-row`, between the "Sign in to publish." note and the button, add:

```tsx
          {disclosure && <p className="publication-note publication-disclosure">{disclosure}</p>}
```

- [ ] **Step 5: Update `src/components/modals/GoogleDrivePublishModal.tsx`**

1. Add imports: `useRef` from React (it already imports `useEffect`), `hubDisclosure`, and `PreviousUpload`.

2. After `const hub = useHubLink('googleDrive', isOpen);`, add:

```tsx
  const disclosure = hubDisclosure(hub.enabled, shared ? 'public' : 'private', imageFormat === 'original');
  const connected = auth.status === 'connected';
  const wasConnected = useRef(connected);
  useEffect(() => {
    if (connected && !wasConnected.current) document.getElementById(`${id}-access`)?.focus();
    wasConnected.current = connected;
  }, [connected, id]);
```

3. Add `{selecting && <PreviousUpload hub={hub} />}` as the first child of `.publication-main`.

4. Change the result title to `title={publish.receipt.shared ? 'Published to Google Drive' : 'Saved privately to Google Drive'}`.

5. Add the same disclosure paragraph before the publish button in `.publication-submit-row`.

- [ ] **Step 6: Update `src/components/bucket/BucketPublishModal.tsx`**

1. Add imports:
   - `import { useEffect, useId, useRef, useState } from 'react';`;
   - `import { hubDisclosure } from '../../features/colmapviewHub/disclosure';`;
   - `import type { BucketAccess } from '../../features/colmapviewHub/publication';`;
   - `PreviousUpload` in the `../upload/UploadParts` import.

2. Above the component, add:

```tsx
const BUCKET_NOTICES: Record<BucketAccess, string> = {
  public: 'Anyone can open this link.',
  private: 'Private. Viewers need bucket access.',
  unknown: 'Public access unconfirmed, so the Hub link is unguessable.',
};
```

3. After `const hub = useHubLink('bucket', isOpen);`, add:

```tsx
  const disclosure = hubDisclosure(hub.enabled, 'bucket', selectedImageFormat === 'original');
  // Where the Hub is off nothing checks access, so the notice stays general; otherwise it states the check's outcome.
  const notice = !hub.enabled ? 'Access follows your bucket permissions. Viewers need bucket access for private files.'
    : hub.state.viewerUrl === publication.viewerUrl && hub.state.bucketAccess ? BUCKET_NOTICES[hub.state.bucketAccess] : undefined;
  const wasWritable = useRef(connection.canWrite);
  useEffect(() => {
    if (connection.canWrite && !wasWritable.current) document.getElementById(`${id}-format`)?.focus();
    wasWritable.current = connection.canWrite;
  }, [connection.canWrite, id]);
```

4. Delete the read-only Access row: the `<label htmlFor={`${id}-access`}>Access</label>` and the `<div className="publication-access">` holding the read-only input and its hint.

5. Add `{selecting && <PreviousUpload hub={hub} />}` as the first child of `.publication-main`.

6. In the result, replace the fixed `notice="Access follows your bucket permissions. Viewers need bucket access for private files."` with `notice={notice}`.

7. Add the disclosure paragraph before the "Upload dataset" button in `.publication-submit-row`.

- [ ] **Step 7: Make accessible names match labels (`src/components/bucket/BucketConnectionForm.tsx`)**

1. Remove `aria-label="Secret access key"` from the secret input.
2. Change the label text `Public URL` to `Public URL (optional)`, and remove `aria-label="Public bucket URL (optional)"` from its input.
3. Change the label text `Session token` to `Session token (optional)`, and remove `aria-label="Session token (optional)"` from its input.

- [ ] **Step 8: Run the tests and gates**

```bash
cd colmap-webview && npx vitest run src && npm run check && npx playwright test e2e/drop-zone.spec.ts e2e/hugging-face-publish.spec.ts --project=chromium --reporter=list
```
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
cd colmap-webview && git add src e2e/drop-zone.spec.ts && git commit -m "Disclose the Hub link beside every publish button

The line states what each upload creates and, for public original images,
that their metadata stays. Results are titled by access, a Previous upload
block keeps the last Hub link above the form, bucket results state the access
check's outcome, the read-only Access row is gone, field names match their
labels, and focus moves to the first field after sign-in.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B9: The Share panel shares the Hub link

Covers §2.5 (finding M10).

**Files:**
- Modify:
  - `colmap-webview/src/components/viewer3d/panels/useSharePanelStoreFacade.ts`, `useSharePanelStoreFacade.test.ts`;
  - `sharePanelViewModel.ts`, `sharePanelViewModel.test.ts`;
  - `SharePanel.tsx`, `SharePanel.test.tsx`.

**Interfaces:**
- Consumes: `hubShareLinks` (B5); `getPublicationSourceKey`.
- Produces:
  - `SharePanelDataFacade.hubLink: string | null`.
  - `buildSocialSharePayload({ …, hubUrl?: string | null })`.

- [ ] **Step 1: Write the failing tests**

1. Append to `sharePanelViewModel.test.ts`, extending its imports as needed:

```ts
describe('buildSocialSharePayload with a Hub link', () => {
  it('shares the Hub link instead of a generated viewer link', () => {
    const generate = vi.fn(() => 'https://viewer.example/shared');
    const payload = buildSocialSharePayload({ currentViewState: null, generateShareableUrl: generate, includeShareLink: true,
      reconstruction: null, shareSource: null, hubUrl: 'https://colmapview.opsiclear.com/hub/HappyTree' });
    expect(payload.url).toBe('https://colmapview.opsiclear.com/hub/HappyTree');
    expect(payload.text).toContain('Made with ColmapView by @opsiclear');
    expect(generate).not.toHaveBeenCalled();
  });
});
```

2. Append to `useSharePanelStoreFacade.test.ts`, extending its imports with `renderHook`, `act`, `hubShareLinks`, `getPublicationSourceKey`, `useReconstructionStore`, `useDeletionStore` and `buildReconstruction` as needed:

```ts
describe('Hub link for the Share panel', () => {
  it('offers the Hub link made from this dataset state, and none after an edit or with pending deletions', () => {
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), sourceType: 'url', sourceUrl: 'https://example.test/a/', reconstructionEditRevision: 0 });
    hubShareLinks.set('huggingFace', { url: 'https://hub.invalid/hub/HappyTree', source: { key: getPublicationSourceKey(), revision: 0 }, readyAt: 1 });
    const { result } = renderHook(() => useSharePanelStoreFacade());
    expect(result.current.data.hubLink).toBe('https://hub.invalid/hub/HappyTree');
    act(() => { useDeletionStore.setState({ pendingDeletions: new Set([1]) }); });
    expect(result.current.data.hubLink).toBeNull();
    act(() => { useDeletionStore.setState({ pendingDeletions: new Set() }); useReconstructionStore.setState({ reconstructionEditRevision: 1 }); });
    expect(result.current.data.hubLink).toBeNull();
    hubShareLinks.set('huggingFace', null);
  });
});
```

3. In `SharePanel.test.tsx`, add `hubLink: null as string | null,` to `facade.data`, and reset it to `null` in `beforeEach`. Then append:

```ts
  it('copies and shares the Hub link, also for local data without a source link', async () => {
    facade.data.reconstruction = buildReconstruction();
    facade.data.hubLink = 'https://hub.invalid/hub/HappyTree';
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<ShareHarness />);
    expect(screen.queryByRole('button', { name: 'Embed URL' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(urlActions.copyWithFeedback).toHaveBeenCalledWith('https://hub.invalid/hub/HappyTree', expect.any(Function)));
    fireEvent.click(screen.getByRole('button', { name: 'Share to X' }));
    expect(String(open.mock.calls[0][0])).toContain(encodeURIComponent('https://hub.invalid/hub/HappyTree'));
  });

  it('calls the Hub link of an edited upload a plain link, without the original-dataset note', () => {
    facade.data.reconstruction = buildReconstruction();
    facade.data.sourceUrl = 'https://data.example/scene/';
    facade.data.hasEdits = true;
    facade.data.hubLink = 'https://hub.invalid/hub/HappyTree';
    render(<ShareHarness />);
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeVisible();
    expect(screen.queryByText('This link opens the original dataset. Upload to share edits.')).toBeNull();
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd colmap-webview && npx vitest run src/components/viewer3d/panels`

Expected: FAIL. There is no `hubUrl` option and no `hubLink` in the facade, and the panel hides Copy link for local data.

- [ ] **Step 3: Add the Hub link to the facade (`useSharePanelStoreFacade.ts`)**

1. Add the imports and the field:

```ts
import { useSyncExternalStore } from 'react';
import { hubShareLinks } from '../../../features/colmapviewHub/hubShareLinks';
import { getPublicationSourceKey } from '../../../features/datasetPublishing/publicationSnapshot';
```

   Add `hubLink: string | null;` to `SharePanelDataFacade`.

2. In the hook body, before `return`:

```ts
  const sourceKey = useReconstructionStore(getPublicationSourceKey);
  useSyncExternalStore(hubShareLinks.subscribe, hubShareLinks.getVersion);
  // The Hub link opens the view saved at upload, so it is offered only for that exact dataset state.
  const hubLink = hubShareLinks.match({ key: sourceKey, revision }, pending);
```

3. Add `hubLink,` to the returned `data`.

- [ ] **Step 4: Accept a Hub link in `sharePanelViewModel.ts`**

1. Add `hubUrl?: string | null;` to `BuildSocialSharePayloadOptions`.
2. In `buildSocialSharePayload`, destructure `hubUrl` and replace the first line of the body with:

```ts
  const url = hubUrl ?? (shareSource ? generateShareableUrl(shareSource, currentViewState) : null);
```

- [ ] **Step 5: Use it in `SharePanel.tsx`**

1. Destructure `hubLink` from the facade data, and after `const canShare = …` add `const canCopyLink = canShare || Boolean(hubLink);`.

2. Replace `handleCopyShareLink` with:

```tsx
  const handleCopyShareLink = useCallback(async () => {
    const url = hubLink ?? (shareSource ? generateShareableUrl(shareSource, sourceViewState, sourceConfig) : null);
    if (url) await copyWithFeedback(url, setCopiedShareLink);
  }, [hubLink, shareSource, sourceViewState, sourceConfig]);
```

3. In both `handleShareToX` and `handleShareToLinkedIn`, pass `hubUrl: hubLink` to `buildSocialSharePayload` and add `hubLink` to the dependency arrays.

4. In the JSX:
   - Change the outer `{canShare && (` to `{canCopyLink && (`.
   - Show the note only as `{hasEdits && !hubLink && <p …>This link opens the original dataset. Upload to share edits.</p>}`.
   - The copy label becomes `hasEdits && !hubLink ? 'Copy original dataset link' : 'Copy link'`.
   - Wrap the Embed URL and Embed HTML buttons in `{canShare && <>…</>}`.
   - Change `{canShare && <ToggleRow label="Include link" …/>}` to `{canCopyLink && <ToggleRow label="Include link" …/>}`.

- [ ] **Step 6: Run the tests and gates**

```bash
cd colmap-webview && npx vitest run src/components/viewer3d/panels && npm run check
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
cd colmap-webview && git add src/components/viewer3d/panels && git commit -m "Share the newest matching Hub link from the Share panel

Copy link, X and LinkedIn use the Hub link made from the dataset on screen,
including edits and local data; Embed stays on the source link.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B10: Policy, docs and the stylesheet drift test

Covers §3 (findings H1 and L16) and the viewer side of the §1.6 drift check. The effective dates stay unchanged; the owner sets them in the release commit (§5).

**Files:**
- Create: `colmap-webview/src/theme/policyCssCopy.test.ts`
- Modify:
  - `public/privacy.html`, `public/terms.html`, `public/about.html`;
  - `README.md`, `docs/hugging-face-publishing.md`, `docs/google-drive-publishing.md`, `docs/google-oauth-verification.md`, `docs/oauth-review-demo-script.md`;
  - `CHANGELOG.md`.

- [ ] **Step 1: Write the drift test, which passes now and fails on any later change to `policy.css`**

`src/theme/policyCssCopy.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The ColmapView Hub serves a byte-for-byte copy of public/policy.css (colmapview_hub/public/hub/colmapview.css)
// and pins the same hash in colmapview_hub/scripts/check-colmapview-css.mjs. Change both files and both hashes together.
const PINNED = '3f4a63e60475947785a400fc0e804ffe1b011f558beca064d127db266ed1409e';

describe('public/policy.css', () => {
  it('matches the copy the ColmapView Hub pins', () => {
    const text = readFileSync(resolve(__dirname, '../../public/policy.css'), 'utf8').replace(/\r\n/g, '\n');
    expect(createHash('sha256').update(text).digest('hex'),
      'Copy public/policy.css to colmapview_hub/public/hub/colmapview.css, then update this hash and the Hub script\'s hash.').toBe(PINNED);
  });
});
```

Run: `cd colmap-webview && npx vitest run src/theme/policyCssCopy.test.ts`

Expected: PASS.

- [ ] **Step 2: Update `public/privacy.html`**

1. **At a glance:** replace the third bullet (`<li>Publishing sends dataset files to your selected provider. Hugging Face datasets and Drive ZIPs start private; …</li>`) with these two bullets:

```html
              <li>Publishing sends dataset files to your selected provider. Hugging Face datasets are public and Drive ZIPs are shared with anyone with the link by default; you can choose Private before uploading. Bucket uploads use the bucket's existing permissions.</li>
              <li>Where ColmapView Hub is enabled, every upload also creates a Hub link with a public card showing its title, description and preview. OpsiClear LLC stores the card on Cloudflare until you delete it with the private delete link.</li>
```

2. **§5:** replace the Hugging Face paragraph (it starts `<p>The Hugging Face publisher creates a <strong>new private dataset repository by default</strong>.`) with:

```html
            <p>The Hugging Face publisher creates a new dataset repository that is <strong>public by default</strong>. You can choose Private before uploading. The dataset includes a card containing the title, description, and any license you select; public publication requires a license. Public files and previews can be accessed or copied by others, including while uploading. Private viewer links require a Hugging Face connection with repository access and do not contain authorization tokens.</p>
```

3. **§5:** replace the Drive paragraph (it starts `<p>The current Google Drive publisher creates a <strong>private dataset ZIP</strong>.`) with this paragraph and the new Hub paragraph after it:

```html
            <p>The current Google Drive publisher creates a dataset ZIP and, <strong>by default, shares it with anyone with the link</strong> after upload verification. Choose Private to keep the ZIP private. A viewer link to a private file does not grant access; recipients need provider permission and must authorize that ZIP for ColmapView through Google Picker unless it is already available to the app.</p>
            <p><strong>ColmapView Hub links.</strong> Where the Hub is enabled (on colmapview.opsiclear.com and colmapview.github.io), every completed upload also sends the viewer link, title, description, a 600 × 315 JPEG preview made in your browser, any license you chose, and asset counts to ColmapView Hub, a service OpsiClear LLC runs on Cloudflare. The Hub stores them until the link is deleted. Data anyone can open without signing in gets a short, readable link; private or unconfirmed data gets an unguessable link. Anyone with a Hub link can see its card, including the title, description and preview, even when the dataset itself needs permission. Dataset files and provider tokens are never sent to the Hub. The upload dialog shows a private delete link; keep it to remove the card later.</p>
```

4. **§5:** in the next paragraph, change `These transfers go directly from your browser to the selected provider` to `Dataset files go directly from your browser to the selected provider`.

5. **§7:** after its first paragraph, which ends with the Cloudflare privacy policy link, add:

```html
            <p>ColmapView Hub runs on Cloudflare Workers and stores Hub links in Cloudflare R2. Cloudflare keeps a sample of request logs, including connection information. To slow the guessing of Hub links, the Hub counts missing links per network using a keyed hash of your IP address (for IPv6, of its /64 network) rather than the address itself, and deletes that state at most an hour after your last missing link or link creation.</p>
```

6. **§8:** after the `Remove published copies` item, add:

```html
              <li><strong>Delete a Hub link:</strong> open the private delete link shown after the upload and choose Delete permanently. The dataset stays where it is; social networks may keep previews they already fetched. If you lost the delete link, email <a href="mailto:info@opsiclear.com">info@opsiclear.com</a> with the Hub link.</li>
```

- [ ] **Step 3: Update `public/terms.html` §4 and `public/about.html`**

1. In `terms.html`, replace the second paragraph of §4 (it starts `<p>Hugging Face publication creates a private dataset repository by default`) with:

```html
            <p>Hugging Face publication creates a public dataset repository by default, with a Private option. Google Drive publication creates a ZIP shared with anyone with the link by default, with a Private option. Bucket uploads follow the bucket's existing permissions. Review the destination, license, and sharing choice before starting.</p>
            <p>Where ColmapView Hub is enabled, each upload also creates a Hub link whose card shows the title, description and preview to anyone with the link. Hub cards are content you publish and are your responsibility. OpsiClear LLC may remove cards that break these terms or the law. Send removal requests to <a href="mailto:info@opsiclear.com">info@opsiclear.com</a>.</p>
```

2. In `about.html`, the "Publish the current dataset" card carries the same stale default. Replace its paragraph with:

```html
            <p>Where publishing is enabled, publish a Hugging Face dataset or Google Drive ZIP, or upload to an S3-compatible bucket. Hugging Face datasets are public and Drive ZIPs are shared with anyone with the link by default, with a Private choice; bucket access follows its existing permissions. Uploads can include original images, masks, splats, viewer settings, and a preview, and each gets a ColmapView Hub link where the Hub is enabled.</p>
```

- [ ] **Step 4: Update the README and publishing docs**

1. In `README.md`, replace line 44 (`- **Dataset uploads** - …`) and line 45 (`- **ColmapView Hub** - …`) with:

```markdown
- **Dataset uploads** - Open **Share** to upload to Hugging Face, Google Drive, or an S3-compatible bucket. Hugging Face datasets are public and Drive ZIPs are shared with anyone with the link by default, with a Private choice; bucket uploads use the bucket's existing permissions. See [Hugging Face publication](docs/hugging-face-publishing.md).
- **ColmapView Hub** - Every upload also gets a Hub link with a preview card: a short name when anyone can open the data, an unguessable one otherwise. The upload dialog shows the link and a private delete link. Local and preview builds have no Hub unless `VITE_HUB_BASE_URL` is set.
```

2. In `docs/hugging-face-publishing.md`:
   - In line 5, replace the last two sentences (from `Public uploads automatically receive a ColmapView Hub short link` to the end of the line) with `Every verified upload receives a ColmapView Hub link where the Hub is enabled (see below).`
   - Replace line 9 with:

```markdown
Every verified upload receives a [ColmapView Hub](https://colmapview.opsiclear.com/hub/) link where the Hub is enabled: a short name for public datasets and an unguessable one for private datasets. The card (title, description, license, asset counts and a 600 × 315 JPEG preview) is visible to anyone with the link; a private dataset still needs access. The line beside the publish button says so. The result shows the Share link and a private delete link that opens the Hub's delete page. If the Hub request fails, the upload keeps its direct viewer link, and **Retry Hub link** appears for network errors, timeouts, rate limits and outages. Local and preview builds have no Hub unless `VITE_HUB_BASE_URL` is set.
```

3. In `docs/google-drive-publishing.md`, replace line 12 with:

```markdown
After the upload is verified, ColmapView creates a ColmapView Hub link with the current-view thumbnail and metadata where the Hub is enabled: a short name when the ZIP is shared with anyone with the link, an unguessable one when it is private. The result shows the Share link and a private delete link. If the Hub request fails, **Retry Hub link** retries only that step; it never repeats the Drive upload. Reopening the dialog keeps the completed result, and after a new dataset or an edit resets it, the Previous upload block keeps the Hub link.
```

- [ ] **Step 5: Update the OAuth verification documents**

1. In `docs/google-oauth-verification.md`:
   - In the app description paragraph (line 82), after the sentence ending `or choose Private before starting the upload.`, add: `After an upload, the viewer link, title, a preview image and asset counts go to ColmapView Hub, OpsiClear's link service on Cloudflare, which shows them as a card; no Google tokens or file contents are sent.`
   - In the `Drive publication` row of the data-flow table (line 127), append to the description cell: `After completion, the viewer link (with the Drive file URL), title, preview and asset counts go to ColmapView Hub; Drive tokens and file contents do not.`

2. In `docs/oauth-review-demo-script.md`, replace row `7. Shared output` with:

```markdown
| 7. Shared output | Reload the synthetic dataset and reopen Publish to Google Drive. Use a distinct file name and Access → Anyone with the link. Point out the line beside Publish shared dataset ("Also creates a short ColmapView Hub link…"), click it, show the receipt with its Share link and private delete link, the Hub card, and the actual Drive permissions, then open the resulting viewer link while signed out. | "Here I use link sharing. It is enabled after upload verification. The line beside the button says this also creates a ColmapView Hub card with the title, description and preview. This synthetic output can be opened anonymously with the public Drive configuration." |
```

- [ ] **Step 6: Add the Unreleased entries to `CHANGELOG.md`**

Under `## [Unreleased]`:

```markdown
### Added

- Create a ColmapView Hub card for every upload where the Hub is enabled: a short name when anyone can open the data (Hugging Face Public, Drive "Anyone with the link", or a bucket that passes the anonymous check), an unguessable name otherwise. A line beside the publish button discloses it.
- Show a visible private delete link with each Hub link, keep the last Hub link in a "Previous upload" block after the upload result resets, and show a toast when a Hub link finishes while its dialog is closed.
- Use the newest matching Hub link for Share → Copy link, X and LinkedIn.

### Changed

- Name Drive files and bucket folders after the dataset, crop Hub thumbnails to fill the card, and send license names with links.
- Explain Hub failures briefly and offer Retry only for network errors, timeouts, rate limits and outages.
- Title results by access ("Published …" or "Saved … privately"), remove the bucket dialog's read-only Access row, and move focus through sign-in, progress and results.
- Create Hub links only on colmapview.opsiclear.com and colmapview.github.io unless `VITE_HUB_BASE_URL` is set.

### Fixed

- Bucket uploads on internal hosts, or whose public access cannot be confirmed, no longer get short names.
- Cut Hub titles and descriptions at a word or character boundary within the Hub's limits.
- Describe the current public defaults and the Hub in the privacy policy, terms, About page and OAuth documentation.
```

- [ ] **Step 7: Run the gates**

```bash
cd colmap-webview && npm run check && npm run test:deployment
```
Expected: both pass. `test:deployment` serves `privacy.html`, `terms.html` and `about.html` from the built profiles.

- [ ] **Step 8: Commit**

```bash
cd colmap-webview && git add public/privacy.html public/terms.html public/about.html README.md docs CHANGELOG.md src/theme/policyCssCopy.test.ts && git commit -m "Describe the Hub and the public defaults in the policy and docs

The privacy policy, terms and About page state the public defaults and what
the Hub receives, stores and shows, how its guard hashes IPs, and how to delete
a card. OAuth documents include the Hub in the Drive data flow. A test pins
policy.css to the Hub's copy.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B11: End-to-end checks and the full gate

Covers §4's E2E list: Hugging Face public and private, a private bucket upload, the Previous upload block, and the Share panel copying the Hub link.

The spec lists "the Previous upload block after an edit". The browser test resets the result by loading a new dataset, which the spec also names as a reset trigger (§2.4). Edits and deletion marks are covered by the runtime unit tests, because the app has no scripted way to mark deletions from e2e.

**Files:**
- Create: `colmap-webview/e2e/fixtures/mock-bucket.ts`, `e2e/hub-upload.spec.ts`
- Modify: `colmap-webview/e2e/hugging-face-publish.spec.ts`

- [ ] **Step 1: Create the loopback bucket fixture `e2e/fixtures/mock-bucket.ts`**

```ts
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** An in-memory S3-style bucket on loopback: signed writes and reads work, anonymous reads are refused. */
export async function startMockBucket(viewerOrigin: string) {
  const objects = new Map<string, Buffer>();
  const anonymousReads: string[] = [];
  const server = createServer(async (request, response) => {
    response.setHeader('access-control-allow-origin', viewerOrigin);
    response.setHeader('access-control-allow-methods', 'GET, HEAD, PUT, POST, DELETE, OPTIONS');
    response.setHeader('access-control-allow-headers', 'authorization, content-type, range, x-amz-date, x-amz-content-sha256, x-amz-security-token, x-amz-user-agent');
    response.setHeader('access-control-expose-headers', 'etag');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    const key = decodeURIComponent(new URL(request.url ?? '/', 'http://bucket.test').pathname);
    if (request.method === 'PUT') {
      objects.set(key, await readBody(request));
      response.writeHead(200, { etag: `"${objects.size}"` });
      response.end();
      return;
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      if (!request.headers.authorization) { anonymousReads.push(key); response.writeHead(403); response.end('AccessDenied'); return; }
      const object = objects.get(key);
      if (!object) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { 'content-length': object.length });
      response.end(request.method === 'HEAD' ? undefined : object);
      return;
    }
    response.writeHead(405);
    response.end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/bucket/`,
    objects,
    anonymousReads,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}
```

- [ ] **Step 2: Write the private bucket test `e2e/hub-upload.spec.ts`**

```ts
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/test-fixtures';
import { loadTestDataset } from './fixtures/load-test-data';
import { startMockBucket } from './fixtures/mock-bucket';

const hubEndpoint = 'https://hub.invalid/hub/api/links';
const longId = 'CalmRiver-AAAAAAAAAAAAAAAA';
const longUrl = `https://hub.invalid/hub/${longId}`;
const image = readFileSync(new URL('./fixtures/test-data/masks/photo.jpg.png', import.meta.url)).toString('base64');
const dataset = ['photo.jpg', 'photo-2.jpg'].map(name => ({ relativePath: `images/${name}`, name, base64: image }));

async function openBucketPublisher(page: Page) {
  const toolbar = (await page.getByTestId('viewer-controls').boundingBox())!;
  await page.mouse.move(toolbar.x + toolbar.width / 2, toolbar.y + 16);
  await page.getByRole('button', { name: 'Share', exact: true }).hover();
  await page.getByRole('region', { name: 'Share', exact: true }).getByRole('button', { name: 'Bucket storage', exact: true }).click();
  return page.getByRole('dialog', { name: 'Publish to bucket' });
}

test('gives a private bucket upload an unguessable Hub link and keeps it after the result resets', async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const bucket = await startMockBucket(new URL(baseURL!).origin);
  const requests: Array<Record<string, unknown>> = [];
  await page.route(hubEndpoint, async route => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: { id: longId, url: longUrl, managementPath: `/hub/manage/${longId}` } });
  });
  try {
    await page.goto('/');
    await loadTestDataset(page, dataset);
    await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45000 });
    const dialog = await openBucketPublisher(page);
    await dialog.getByLabel('Bucket URL', { exact: true }).fill(bucket.baseUrl);
    await dialog.getByLabel('Access key ID', { exact: true }).fill('e2e-access');
    await dialog.getByLabel('Secret key', { exact: true }).fill('e2e-secret');
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(dialog.getByRole('combobox', { name: 'Format' })).toBeFocused();
    await expect(dialog.getByLabel('Access', { exact: true })).toHaveCount(0);
    await expect(dialog.getByText('Also creates a ColmapView Hub link (short if the bucket is public). Anyone with it sees the title, description and preview. Original images keep their metadata, such as location.')).toBeVisible();
    await expect(dialog.getByLabel('Upload folder', { exact: true })).toHaveValue('colmap-dataset');
    await dialog.getByRole('button', { name: 'Upload dataset', exact: true }).click();
    const result = dialog.getByRole('region', { name: 'Published bucket dataset' });
    await expect(result).toBeVisible({ timeout: 45000 });
    await expect(result.getByText('Private. Viewers need bucket access.')).toBeVisible();
    await expect(result.getByLabel('Share link', { exact: true })).toHaveValue(longUrl);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ access: 'private', title: 'colmap-dataset', publicAcknowledged: true });
    expect(String(requests[0].viewerUrl)).toContain('127.0.0.1');
    expect(bucket.anonymousReads).toEqual([]);
    const deleteLink = await result.getByLabel('Private delete link', { exact: true }).inputValue();
    expect(deleteLink).toMatch(new RegExp(`^https://hub\\.invalid/hub/manage/${longId}#[A-Za-z0-9_-]{43}$`));
    await dialog.getByRole('button', { name: 'Close bucket publication' }).click();
    // A new dataset resets the upload result; the Hub link stays in Previous upload until the next upload.
    await loadTestDataset(page, dataset);
    await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45000 });
    await openBucketPublisher(page);
    // The dialog stays mounted, so it switches from the old result to the form once the new scene replaces the old one.
    const previous = dialog.getByRole('region', { name: 'Previous upload' });
    await expect(previous.getByLabel('Share link', { exact: true })).toHaveValue(longUrl, { timeout: 45000 });
    await expect(previous.getByLabel('Private delete link', { exact: true })).toHaveValue(deleteLink);
    await expect(dialog.getByRole('button', { name: 'Upload dataset', exact: true })).toBeVisible();
  } finally { await bucket.close(); }
});
```

- [ ] **Step 3: Add the disclosure, the Share panel copy and the private title to the HF e2e**

In `e2e/hugging-face-publish.spec.ts`:

1. In the public test:
   - Before clicking `Publish public dataset`, add:

```ts
    await expect(dialog.getByText('Also creates a short ColmapView Hub link. Anyone with it sees the title, description and preview. Original images keep their metadata, such as location.')).toBeVisible();
```

   - After `expect(dimensions).toEqual([600, 315]);`, add:

```ts
    await expect(dialog.getByRole('region', { name: 'Published dataset' })).toContainText('Published publisher/scene');
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL!).origin });
    await dialog.getByRole('button', { name: 'Close publish dataset' }).click();
    const toolbar = (await page.getByTestId('viewer-controls').boundingBox())!;
    await page.mouse.move(toolbar.x + toolbar.width / 2, toolbar.y + 16);
    await page.getByRole('button', { name: 'Share', exact: true }).hover();
    // Local data has no source link, so Copy link exists here only because of the Hub link.
    await page.getByRole('region', { name: 'Share', exact: true }).getByRole('button', { name: 'Copy link', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(shortUrl);
```

2. In the private test:
   - Before clicking `Save private dataset`, add:

```ts
    await expect(dialog.getByText('Also creates an unguessable ColmapView Hub link. Anyone with it sees the title, description and preview; the data still needs access.')).toBeVisible();
```

   - After the `toHaveValue(longUrl)` check, add:

```ts
    await expect(dialog.getByRole('region', { name: 'Published dataset' })).toContainText('Saved publisher/scene privately');
```

- [ ] **Step 4: Run the new and changed e2e tests**

```bash
cd colmap-webview && npx playwright test e2e/hub-upload.spec.ts e2e/hugging-face-publish.spec.ts --project=chromium --reporter=list
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd colmap-webview && git add e2e && git commit -m "Check Hub links end to end for private buckets, Previous upload and Share

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Run the full gates in both repos**

```bash
cd colmapview_hub && npm run check && npm run test:browser
cd ../colmap-webview && npm run check && npm run test:deployment && npx playwright test --project=chromium --reporter=list
```
Expected: every command passes. Record the counts and durations for the final report.

---

## Final Gates (after B11)

1. **Branch reviews:** run an Opus whole-branch review of `hub-review-fixes` in each repo, against the spec and this plan.
2. **Codex gate:**
   - Check `grep '^\[mcp_servers' ~/.codex/config.toml` first.
   - Then run `cd <repo> && timeout 300 codex review --base <branch point> < /dev/null`. The viewer's branch point is `main`; the Hub's is `4bb7d36`.
   - Fix every confirmed P1 or P2 finding, with a test.
3. **Gates again:** after any fix, rerun both repos' full gates.
4. **Report to the owner:**
   - the branch heads and gate results;
   - the §5 owner actions:
     1. Deploy the Hub first and check `/hub/`, a card, a preview and the manage page; then tag the viewer.
     2. Optional: the Transform Rule plus `wrangler secret put VERIFIED_BOT_TOKEN`.
     3. Optional: the WAF rule.
     4. Set the privacy and terms effective dates in the release commit.
     5. Decide whether the Google OAuth submission needs the updated data flow.
   - No push, tag or deploy is done by this work.

