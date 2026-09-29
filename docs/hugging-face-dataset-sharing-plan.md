# Hugging Face dataset sharing implementation plan

Date: 2026-09-27

Code baseline: ColmapView v0.14.5, commit `6217434`

Status (2026-09-28): implemented locally behind a disabled-by-default build flag. Public OAuth registration, configuration, and a real public publication with a 168 MB PLY passed, including anonymous reopening. Hosted deployment and production enablement remain pending. This document records the original design; [setup and usage](hugging-face-publishing.md) describes the current behavior, including automatic inclusion of all loaded assets, one YAML settings file, and no app size cap for splats.

## 1. Outcome and scope

Add a dedicated **🤗 Publish to Hugging Face** button to the main viewer toolbar. A user with a local or edited reconstruction connects their Hugging Face account, reviews the dataset, publishes it to a new dataset repository in their own account, and receives a ColmapView link. A recipient opens that link without signing in and sees the published reconstruction, selected assets, and saved view.

The primary deliverable is a reusable dataset with a convenient viewer link. Upload ordinary COLMAP files and original assets, together with a dataset card and ColmapView metadata. Avoid making a ZIP the only published artifact: individual files support lazy image loading and reuse outside ColmapView.

### First release decisions

| Area | Decision |
| --- | --- |
| Hosting | Keep the GitHub Pages application; browser communicates directly with Hugging Face. |
| Identity | Public OAuth application using authorization code with PKCE; no client secret in the application. |
| Destination | A new dataset repository under the authenticated user's personal namespace. |
| Access | Public, ungated datasets. The review screen explicitly identifies publication as public. |
| Input | COLMAP reconstruction from local files, an archive, or a public Hugging Face source whose asset revisions can be pinned. |
| Assets | Original images, available masks, and selected original Gaussian splat files; explicit geometry-only option. |
| Edits | Publish current applied edits; resolve pending deletions explicitly; bake the reviewed pending transform into exported COLMAP data. |
| Result | A viewer link pinned to dataset commits and a compatible ColmapView release; secondary link to the repository. |
| Recovery | Same-tab retry with confirmed batch receipts; no promise of continuing after the tab closes. |

Hugging Face datasets have public/private visibility. Public sharing is discoverable public publication; it is not an unlisted-link mechanism. Private repositories do not give anonymous recipients access. [Repository visibility documentation](https://huggingface.co/docs/hub/repositories-settings)

Defer organization destinations, updating arbitrary existing repositories, private/gated recipient access, background publication after closing the page, raw token entry, and splat-only datasets. For arbitrary remote asset hosts without stable revisions, retain existing link sharing and require a local copy for publication in the first release. Do not silently publish a mixture of changing remote assets.

### Completion criteria

1. A local dataset can be published and opened in a fresh browser context without publisher credentials.
2. The published COLMAP model includes camera edits, approved deletions, rigs/frames when present, and the reviewed transform exactly once.
3. Original selected assets retain their bytes and association with COLMAP image names; missing required assets prevent success.
4. Opening the saved link later reads the same dataset commits, even if the repository's default branch changes.
5. Cancelled or ambiguous uploads never display a false success or overwrite an unrelated repository.
6. Existing remote sharing, ordinary exports, and previously generated viewer links continue to work.

## 2. Existing code to reuse

| Existing code | Relevant behavior | Planned integration |
| --- | --- | --- |
| `src/components/viewer3d/panels/SharePanel.tsx` | Share links, embeds, screenshots, and social actions. | Add the publication entry point and completed publication result. |
| `src/components/viewer3d/HuggingFacePublishButton.tsx` | Dedicated publishing entry in the main toolbar. | Open the lazy publication dialog and retain access to progress and the completed link. |
| `src/components/viewer3d/panels/sharePanelViewModel.ts` | A source URL/manifest plus reconstruction currently enables link sharing. | Distinguish sharing the source from publishing in-memory edits. |
| `src/hooks/useUrlState.ts`, `src/utils/shareUrl.ts` | Capture settings and camera state; generate versioned links with URL or inline manifests. | Reuse encoding with explicitly captured publication state. |
| `src/utils/shareDataCodec.ts`, `src/hooks/urlStateShareConfigPolicy.ts` | Encode config; currently combine pending and splat transforms into one shared transform. | Preserve legacy decoding and add separate splat alignment for new links. |
| `src/components/viewer3d/panels/exportPanelReconstructionExport.ts` | Resolve pending deletion/transform decisions before export. | Reuse preparation rules without triggering downloads or swallowing publication errors. |
| `src/parsers/reconstructionSnapshotExport.ts`, `src/parsers/reconstructionExportData.ts`, `src/parsers/writers.ts` | Worker snapshot export and existing COLMAP writers. | Produce immutable named files for both publishing and downloading. |
| `src/wasm/reconstructionService.ts` | Snapshot export is tied to the service's current revision. | Export before upload; an old snapshot object is not a retained historical model. |
| `src/dataset/DatasetManager.ts` | `getOriginalImage` and `getMask` support local, URL, manifest, and ZIP sources. | Resolve selected original media with cancellation and bounded retention. |
| `src/utils/splatFileSourcePolicy.ts`, `src/types/colmap.ts` | Splat catalogs can contain files, URLs, and zero-byte placeholders. | Publish real original bytes and remap selected source identifiers. |
| `src/types/manifest.ts`, `src/hooks/urlLoaderManifestSource.ts`, `src/hooks/urlLoaderManifestFetch.ts` | Version 1 manifests, lazy images, and Hugging Face file discovery. | Generate a compatible manifest and restore optional published viewer state. |
| `src/components/ui/ModalDialogShell.tsx` | Dialog focus, keyboard handling, and backdrop behavior. | Reuse for the publication dialog. |
| `.github/workflows/deploy.yml` | Builds version directories, `/latest/`, and `/dev/`. | Deploy a stable OAuth callback and inject public build configuration. |

Two existing behaviors need particular care. `reconstructionEditRevision` identifies committed in-memory changes, but current share eligibility does not check it. Also, `useCancellableExport` clears a cancelled operation immediately; remote publication needs a longer-lived operation record while a possibly completed commit is reconciled.

## 3. User flow

### Entry and existing links

- An unchanged, anonymously readable remote dataset keeps **Copy viewer link** as the primary action. Include current view settings without uploading another copy.
- A local dataset offers **Publish dataset**.
- Applied reconstruction edits or pending deletions offer **Publish edited dataset**. If the original source link remains available, label it **Copy original dataset link** so it does not imply those edits are included.
- Camera navigation and display settings alone do not require publication. Do not use the reload-warning predicate wholesale: a view transform can already be represented in an ordinary viewer link.
- A source URL by itself does not prove public access. Avoid promising anonymous access for credential-bearing, expiring, private, or gated sources.

### Dialog sequence

1. **Connect account.** Open Hugging Face sign-in in a popup and retain the loaded dataset in the main tab. Display the authenticated username after connection.
2. **Describe dataset.** Choose a repository name, title, description, and license. Show the personal namespace as read-only. Suggest a name, but do not silently rename or adopt an existing repository on conflict. Require an explicit license choice, including an appropriate custom-license path; never invent ownership or assign a license automatically.
3. **Select contents.** Show reconstruction counts, images, masks, splat choices, file count, and known byte totals. Images default on when available; masks follow availability; the active splat is selected by default and other catalog entries are selectable. Clearly identify excluded assets. Unknown remote sizes remain marked unknown until measured.
4. **Resolve edits.** Explain pending deletions and transform handling. Use the existing deletion action only after the user chooses **Apply deletions and continue**; this changes the current dataset as existing export does. Baking the pending transform applies to exported files, without modifying the live transform.
5. **Review publication.** Show account/repository, public visibility, selected contents, size estimate, and edit summary. State that original images include embedded metadata. The final **Publish public dataset** action authorizes creation and upload; connecting alone does not publish.
6. **Publish.** Show preparation, asset retrieval/hashing, upload, metadata publication, and verification separately. Provide Cancel. If the dialog closes, keep an accessible progress entry in Share so closing a dialog does not silently abandon the operation.
7. **Share.** On verified completion, show **Copy viewer link**, **Open viewer**, and **Open on Hugging Face**. Attempt clipboard copy only when browser permissions permit; keep a selectable URL and explicit copy button because the original click's clipboard activation may have expired.

Do not replace the user's loaded dataset or original source with the uploaded copy. Keep the publication receipt separately, with the captured model revision and view. Editing afterward produces a new snapshot on the next publication; copying the completed result still refers to the completed snapshot.

## 4. Authentication and deployment

### Proposed authentication contract

Register a public Hugging Face OAuth application and request `openid profile contribute-repos`. The last scope is designed for repositories created by the application; it avoids requiring access to arbitrary existing repositories for this workflow. Redirect URIs must match the registered values. A provider session can simplify sign-in, but does not replace authorization of ColmapView. [Hugging Face OAuth documentation](https://huggingface.co/docs/hub/oauth)

Use the official `@huggingface/hub` package behind a small adapter. Select and lock the tested package version during the feasibility step, then lazy-load it when publishing is opened. The SDK exposes browser upload and OAuth helpers. Its OAuth helpers support an explicit in-memory verifier/nonce object, avoiding their default local-storage behavior. [Hub JavaScript API](https://huggingface.co/docs/huggingface.js/hub/modules)

Implementation sequence:

1. On the connect button's synchronous click handler, open a blank popup before awaiting SDK loading or network work.
2. Create a cryptographically random, one-use state and PKCE transaction. Keep its verifier, nonce, expected callback URL, popup reference, and deadline in the main tab's memory.
3. Navigate the popup to the generated authorization URL.
4. A minimal static callback page sends only the authorization response to the main tab using an exact target origin. Validate callback origin, popup source, transaction state, callback path, and nonce before accepting/exchanging it. Reject unsolicited and repeated responses.
5. Exchange the code through the SDK in the main tab. Keep the access token and expiry in a private service closure; expose only identity/status to React. Clear the transaction and callback query string immediately after use.
6. Handle denied consent, popup blocking/closure, expiry, and timeout with a recoverable connection error. Disconnect clears credentials and stops further publication writes. A 401 can prompt reconnection; a 403 must not silently broaden scopes.

The callback page loads only its local script, has no analytics or third-party resources, and sets a no-referrer policy. Do not put tokens or the PKCE verifier in share links, dataset files, notifications, logs, or persisted stores. Concurrent tabs have independent transactions.

The feasibility step must test popup opener behavior and browser token/upload CORS on the actual deployment origin. If the provider severs the opener, validate a same-origin `BroadcastChannel` callback bridge with a one-use transaction identifier. Do not fall back to full-tab navigation that discards local files. If neither bridge works reliably, revise this architecture before enabling publication.

### Build configuration and callback paths

| Setting | Purpose |
| --- | --- |
| `VITE_HF_PUBLISH_ENABLED` | Explicit rollout flag; default off until acceptance checks pass. |
| `VITE_HF_OAUTH_CLIENT_ID` | Public application identifier, not a secret. |
| `VITE_HF_OAUTH_REDIRECT_URI` | Validated same-origin, registered callback URL. |

Add `public/hf-callback.html` and `public/hf-callback.js`; use relative script loading so the files work under Vite base paths. Production versioned pages use the stable `https://colmapview.github.io/latest/hf-callback.html` callback. Development uses a separately configured `/dev/hf-callback.html` or localhost callback. Preserve callback message compatibility across releases so an older versioned page can use the current stable callback.

Inject configuration into both deployment builds, including the `/latest/` rebuild, and declare its types in `src/vite-env.d.ts`. Missing configuration disables publication cleanly without breaking existing sharing. Never place a client secret or publisher access token in GitHub Pages assets.

## 5. Freeze the dataset before uploading

### Preparation boundary

Create a publication preparation service that returns named immutable COLMAP files, selected asset descriptors, a validated viewer-state document, and an inventory. It performs no repository writes and no browser downloads.

Use the existing snapshot `export({ format: 'binary', transform }, signal)` path and the existing binary writers for supported fallback paths. Factor only the necessary file-producing logic into `src/parsers/prepareReconstructionFiles.ts`; keep existing download behavior in its current callers. Preserve 2D observations, tracks, camera models, rigs, and frames instead of reconstructing exports from rendering buffers.

Capture source identity, reconstruction/service revision, image records, selected assets, transforms, and camera/config state together after approved deletions. During preparation, recheck identity and revision; if they change before capture completes, discard the result and ask the user to review again. Once exported bytes are owned by the publication job, do not reread the live model to finish the upload.

Local `File` references and archive contents are fixed inputs. Clone mutable lookup maps and retain an explicit source context for media access. For remote Hugging Face sources, resolve branch references to commit IDs before constructing asset descriptors, including per-image overrides and splat URLs. If all selected remote assets cannot be pinned, require a local copy for this release.

Keep archive/media source resources alive until their last selected asset is prepared. A source change or session reset cancels publication rather than letting a resolver access a different archive or live store. Ordinary model/view changes after the export is frozen do not alter already captured publication data.

### Transforms and splats

Let `T` be the pending scene transform and `S` the accumulated alignment transform for original splat bytes. Published COLMAP bytes include `T`; their restored global transform must therefore be identity. Original splat bytes retain their source coordinates, so their restored alignment must be `T composed with S`, using existing `composeSim3d` order and helpers.

Extend `ShareConfig.splat` with an optional `transform: Sim3dEuler`. For newly generated links, capture the global transform and splat transform separately. Continue accepting old links that contain only `config.transform`, with their existing interpretation. Apply absolute values rather than composing during restoration, since startup can apply config before and after loading.

The published config explicitly sets the global transform to identity and sets the splat transform to the computed alignment. Remap active splat identifiers to the uploaded paths, and remove selected image IDs that no longer exist. Validate finite transform components and a supported scale. Add regression coverage for noncommuting rotations/translations: identity-only examples will not catch composition mistakes.

For a reusable dataset, preserve this state in `colmapview-state.json`, not just the copied URL. Add optional `viewerStatePath` to the existing version 1 manifest and schema. The loader resolves it relative to the manifest's pinned `baseUrl`, validates a small versioned document, and restores it after model loading. Explicit URL state overrides document defaults. Absence retains current behavior; invalid state gives an actionable load error rather than silently displaying misaligned splats. Keep the new field optional so older manifests continue to load.

The implemented extension also publishes `colmapview.yaml` at the project root, using the existing exported configuration field names plus saved camera and alignment metadata. All dataset loaders recognize it: local folders, supported local/remote archives, and URLs on any HTTP(S) host. Direct file URLs look beside the file; archives prefer embedded settings. Plain Hugging Face paths additionally check ancestors through the repository root at the same revision. Missing or invalid optional YAML is skipped; explicit manifest state remains required when referenced. Incoming viewer-link settings keep precedence, while manual loads do not inherit the previous scene's URL state. The README includes a direct `?url=` viewer link to the D-pinned dataset directory, and publishing controls use 🤗.

The state document contains `version`, `viewerVersion`, `viewState`, and allowlisted `config`; it cannot contain functions, credentials, arbitrary store methods, or source access URLs. Apply a modest size limit, proposed at 256 KiB, and use a shared validator rather than passing untrusted objects directly into unrestricted store setters. The URL and document paths use the same validated state representation.

### Asset and path rules

- Enumerate canonical names from the captured reconstruction's image records; `loadedFiles.imageFiles` can contain aliases for the same file.
- Use `getOriginalImage`, not display previews or thumbnail APIs. Preserve full subpaths and original bytes. Only include images retained by the published model.
- Use `getMask` for selected masks. Distinguish known absence from request failure; a failed required fetch must not become a silently omitted asset. Discover uncertain mask availability with bounded requests and present the final selection before repository creation where feasible.
- Preserve splat originals. A zero-byte placeholder is not publishable content: resolve the real source or show an exclusion/error decision. Do not substitute a rendered or converted approximation automatically.
- Normalize output paths once; reject traversal, absolute paths, controls, duplicate output paths, and collisions after normalization. Preserve Unicode and image-name associations. Encode URL path segments when constructing URLs without changing stored COLMAP names.
- If images are excluded, set `skipImages: true`. If selected images cannot be retrieved, offer an explicit return to review/geometry-only choice; do not complete a partial image dataset as if complete.
- Use descriptors and bounded batches, not `Promise.all` over every image. Release temporary remote/ZIP asset buffers after each committed batch. Account separately for generated COLMAP buffers that current export necessarily materializes.

## 6. Repository layout and immutable links

Proposed repository contents:

```text
README.md
colmapview.json
colmapview-state.json
colmapview.yaml
colmapview-inventory.json
sparse/0/cameras.bin
sparse/0/images.bin
sparse/0/points3D.bin
sparse/0/rigs.bin                  # when present
sparse/0/frames.bin                # when present
images/<original relative name>    # when selected
masks/<original relative name>.png # when selected
splats/<selected source name>      # when selected
```

The dataset card includes a description, author-selected license, counts, format/layout, exclusions, coordinate/transform notes, ColmapView version, and an **Open in ColmapView** link. Serialize YAML with the existing `js-yaml` dependency and escape user-provided Markdown fields appropriately. Keep provenance free of local absolute paths and credential-bearing URLs. A dataset card is the Hub's standard place for dataset documentation and metadata. [Dataset card documentation](https://huggingface.co/docs/hub/datasets-cards)

Use two publication stages to avoid a manifest pointing to its own not-yet-known commit hash:

1. Create the repository and upload data in sequential bounded batches. Include `colmapview-state.json` and `colmapview.yaml` with these files. Let **D** be the last data commit.
2. Generate `colmapview.json` with `baseUrl` set to `https://huggingface.co/datasets/<owner>/<repo>/resolve/<D>/`. Its files, images, masks, splats, and `viewerStatePath` are relative to that base.
3. Generate README and inventory using the known data commit D. The README's viewer link uses the existing inline-manifest encoding, with the same D-pinned base and captured state. Also add a direct viewer URL for the D-pinned dataset directory, which automatically discovers its YAML settings. Neither link depends on its own metadata commit.
4. Commit README, manifest, and inventory together, requiring the expected parent D. Let **M** be this metadata commit.
5. Return a versioned ColmapView link whose manifest URL is `https://huggingface.co/datasets/<owner>/<repo>/resolve/<M>/colmapview.json`. Both metadata and asset references are now fixed. Use `generateShareableUrl` with explicit frozen config rather than recollecting current stores.

The inventory records schema/app versions, operation ID, data commit, selected file paths, actual sizes, and reconstruction counts. Reuse content identifiers supplied by the transport when available; do not add a second whole-dataset hashing pass just to generate this document. Do not include M inside a file committed in M.

The existing app-version pin should select the release containing the new state support. Development links must target the actual preview build, not an unreleased `/v<package-version>/` directory. Pinning does not prevent the owner from deleting the repository or changing access later; avoid promises of permanent availability.

## 7. Publication service and recovery

### Responsibilities and data contracts

Use `src/features/huggingface/` for provider-specific code and `src/features/datasetPublishing/` for preparation/orchestration. Keep React components thin. Proposed contracts, finalized during implementation:

```ts
type PublishAsset = {
  path: string;
  kind: 'colmap' | 'image' | 'mask' | 'splat' | 'viewer-state';
  size: number | null;
  open: (signal: AbortSignal) => Promise<Blob>;
};

type PreparedPublication = {
  operationId: string;
  sourceKey: string;
  modelRevision: number;
  assets: readonly PublishAsset[];
  viewerState: PublishedViewerState;
  inventory: PublicationInventory;
};

type PublicationReceipt = {
  operationId: string;
  repoId: string;
  repoUrl: string;
  dataCommit: string;
  metadataCommit: string;
  viewerUrl: string;
};
```

`PublishedViewerState` and `PublicationInventory` are proposed validated application types, not SDK types. An asset resolver owns captured inputs, never a callback that consults whichever dataset happens to be live later. Authenticated SDK calls receive credentials through the auth service; credentials are absent from these contracts and UI state.

Implement a single active publication controller with explicit phases:

```text
review → preparing → creating-repo → uploading → publishing-metadata
       → verifying → completed

active phase → cancelling → cancelled
write uncertainty → reconciling → resume / failed / cancelled
auth expiry → reconnect-required → reconcile / resume
```

Keep operation IDs on callbacks so stale progress cannot update a later job. Store small progress/receipt metadata outside the modal; keep tokens, blobs, resolvers, and abort controllers in the service. A new start is disabled until an active or uncertain write has been resolved.

### Upload transport

- Wrap `createRepo` and `uploadFilesWithProgress`; pass an `AbortSignal` and expected `parentCommit` for commits. Explicitly request a public dataset repository. Do not implement Git/LFS/Xet protocols inside ColmapView. [Official Hub client](https://huggingface.co/docs/huggingface.js/hub/README)
- The progress API is an async generator whose return value carries commit information. Explicitly consume the generator's final `.next()` result; `for await` alone discards that return value. The documented commit ID is `result.commit.oid`. Handle an absent result explicitly rather than assuming success. [Commit output contract](https://huggingface.co/docs/huggingface.js/hub/interfaces/CommitOutput)
- Start with sequential commits of at most 50 files and at most two concurrent asset retrievals. A proposed 128 MiB budget bounds newly materialized remote/ZIP batch bytes; measure and adjust during feasibility. A single file larger than that budget requires an individually tested path or an upfront unsupported-size message. Local disk-backed Files and generated model buffers have different memory costs; this budget is not a universal browser memory guarantee.
- Use SDK hashing workers if verified with the deployed bundle. Prefer the SDK's supported default storage transport; do not enable an experimental transport solely for this feature.
- Report preparation/hash/upload/commit progress honestly. Show bytes where the SDK exposes them and file counts/indeterminate stages otherwise. Reaching uploaded bytes is not equivalent to a committed, verified dataset.

Hugging Face recommends roughly 50–100 files per HTTP commit and documents cases where a timed-out commit still completes server-side. Repository/storage constraints are separate from browser limits. Preflight file/folder counts and show actionable quota errors; do not present free storage as unlimited. [Storage and commit guidance](https://huggingface.co/docs/hub/storage-limits)

### Retry and cancellation rules

| Situation | Behavior |
| --- | --- |
| Repository name exists | Return to name review; no overwrite, deletion, or automatic adoption. |
| Repository creation response is lost | Look for this operation's creation marker/initial metadata and authenticated ownership; adopt only if both are proven. Otherwise require a different name and explain the uncertainty. |
| Asset fetch fails before creation | Stay in preparation/review; no repository side effect. |
| Asset fetch fails after earlier batches | Keep confirmed batch receipts and repository link; allow same-session retry of the same captured selection. |
| 429 or transient read/transfer error | Honor `Retry-After` when available; bounded exponential backoff with jitter. |
| Commit times out or aborts | Reconcile branch head, operation/batch marker, parent, and expected file inventory before retrying. Never infer failure from the client timeout alone. |
| Parent commit changes unexpectedly | Stop with a conflict; do not overwrite external edits or rebase automatically. |
| Access token expires | Retain nonsecret operation state, reconnect the same account, reconcile, then resume. A different account cannot resume the job. |
| User cancels | Stop further batches and abort supported work; reconcile an in-flight commit. Show the partial repository link if any public data was committed. |
| Metadata upload fails | Retry the metadata stage against the confirmed data commit; do not reupload confirmed data. |
| Verification fails | Keep receipt/candidate link as unverified and offer verification retry; do not claim completed sharing. |
| Tab closes/reloads | No automatic resume in v1. Previously committed data remains on Hugging Face; the user manages it there. |

Use a small initial README with an operation marker when repository creation supports initial files, and include operation/batch IDs in commit descriptions. Phase 0 verifies the available create/read APIs and the precise reconciliation strategy. Inventory checks must use SDK/provider content identifiers where necessary; matching only filenames and byte lengths is insufficient proof that an ambiguous commit is this operation's write.

This is a public, multi-commit upload. Files can be visible before the final viewer link is ready, and Cancel does not undo already committed batches. Keep this consequence concise in the review/cancel UI. Do not add automatic repository deletion or request broader delete permissions for cleanup.

### Completion verification

After M is confirmed, perform requests without authorization headers or cookies (`credentials: 'omit'`): validate the pinned manifest/state, confirm core file metadata and inventory against D, and fetch representative selected media with a small GET/range request where supported. Bound polling for newly available files. Do not redownload every large asset merely to verify completion. Full reconstruction reopening belongs in end-to-end acceptance tests.

Never forward the publisher token to arbitrary source-asset hosts. Keep authenticated Hub operations separate from anonymous source retrieval and recipient verification. Upload credentials/signed URLs used internally by the SDK stay inside that adapter.

## 8. Implementation milestones

Each milestone should be independently reviewable. The first working vertical slice is a tiny local COLMAP dataset with no optional media; enabling the public feature waits for the remaining correctness and recovery checks.

### Milestone 0 — Prove provider/browser integration

- [x] Select a stable `@huggingface/hub` version and verify its actual installed signatures (`2.17.5`).
- [x] Register the public ColmapView OAuth app and local, development, and production callbacks; configure GitHub Actions and local public settings.
- [x] Verify real popup/PKCE and identity on localhost in Chrome on Windows.
- [ ] Prove deployed popup/PKCE, `contribute-repos` creation, a small file commit, a file using the SDK's large-file path, abort behavior, and anonymous retrieval.
- [x] Verify generator return/commit IDs, initial creation markers, expected-parent conflicts, content metadata, and timeout reconciliation APIs against installed code and automated fixtures.
- [ ] Measure Vite bundle impact and worker/transport support; measure export and asset memory on representative local/ZIP datasets.
- [ ] Record tested browser/platform coverage and measured file-size limits before enabling large inputs.

**Exit:** browser-only feasibility is evidenced on the deployed origin. If real app registration/test publication is not yet available, build the adapter and mocks, but leave the release gate incomplete. No secret or production dataset is needed for ordinary implementation work.

### Milestone 1 — Authentication and callback

**Create:** `src/features/huggingface/config.ts`, `auth.ts`, `hubClient.ts`, colocated tests, `public/hf-callback.html`, `public/hf-callback.js`.

**Modify:** `package.json`, lockfile, `src/vite-env.d.ts`, deployment configuration.

- [x] Implement the memory-only auth lifecycle, lazy SDK boundary, popup callback protocol, and typed failure results.
- [ ] Test denied/expired/replayed state, wrong origin/source, blocked/closed popup, concurrent tabs, and disconnect cleanup.
- [ ] Verify callback operation under local, `/dev/`, `/latest/`, and versioned viewer paths.

**Exit:** connection retains local dataset state and supplies only the intended account/scopes to the upload adapter.

### Milestone 2 — Dataset preparation and share eligibility

**Create:** `src/features/datasetPublishing/types.ts`, `preparePublication.ts`, `publicationPaths.ts`, `src/parsers/prepareReconstructionFiles.ts`, colocated tests.

**Modify:** export preparation callers, share view model/facade, and dataset access helpers only where capture needs an explicit source context.

- [x] Factor named-file export without changing ordinary download semantics.
- [x] Capture revisions and media descriptors; resolve pending edits; pin supported remote sources.
- [x] Implement asset selection, size/count inventory, filename validation, missing-file decisions, and memory-bounded resolution.
- [x] Distinguish source links from publication of edited data.

**Exit:** a fixture containing camera edits, deletion, transform, nested image names, masks, rigs, and frames produces a consistent package without network writes.

### Milestone 3 — Published state and package metadata

**Create:** `src/features/datasetPublishing/publicationMetadata.ts`, a shared published-viewer-state validator, colocated tests.

**Modify:** `src/utils/shareDataCodec.ts`, `src/hooks/urlStateShareConfigPolicy.ts`, `src/hooks/useUrlState.ts`, `src/types/manifest.ts`, manifest loading/startup state coordination and their tests.

- [x] Add separate splat transform encoding with legacy-link compatibility.
- [x] Add optional manifest `viewerStatePath` and validated, bounded state loading with explicit URL precedence.
- [x] Generate manifest, state, README, inventory, and safe paths with stable ordering for the captured inputs.
- [x] Implement D/M pinning and both README inline-manifest and final manifest-URL links.
- [x] Publish root YAML settings, restore them across local folders, archives and remote URLs, add direct README viewer URLs, and mark publishing controls with 🤗.

**Exit:** the generated package opens with the same geometry/splat alignment and saved view; moving a simulated default branch cannot change its assets.

### Milestone 4 — Publication controller and recovery

**Create:** `src/features/datasetPublishing/publishDataset.ts`, `publicationRuntime.ts`, `publicationStatus.ts`, `publicationVerification.ts`, colocated tests.

**Extend:** the Hub adapter from milestone 1.

- [x] Create repositories only after final user review; upload bounded batches and retain commit receipts.
- [x] Implement cancellation, progress ownership, reconnect, rate-limit handling, reconciliation, and parent conflict behavior.
- [x] Finish metadata publication, anonymous verification, and immutable result creation.
- [x] Bound batch memory and release job resources on completion/reset. Cancellation retains the captured job for same-tab retry until reset or reconciliation.

**Exit:** injected failures at every write boundary either recover to one verified result or show an accurate partial/uncertain state.

### Milestone 5 — Publishing UI

**Create:** `src/components/modals/PublishDatasetModal.tsx`, a publication store facade/hook, and focused component tests.

**Modify:** Main viewer toolbar, modal wiring, and existing shared styles as needed. Keep publishing in the dedicated 🤗 button beside Share.

- [x] Implement connection, repository details, contents, edit resolution, review, progress, and result views.
- [x] Reuse dialog focus management and confirmation patterns; provide stable accessible labels and keyboard controls.
- [x] Preserve progress across dialog close/reopen; prevent duplicate starts and stop in-progress work after source changes.
- [x] Add a selectable viewer-link copy fallback and keep completed viewer-link actions tied to the captured receipt.

**Exit:** the complete local-dataset workflow is understandable without exposing commit/PKCE implementation details to the user.

### Milestone 6 — Integration, documentation, and rollout

**Create:** `e2e/hugging-face-publish.spec.ts`, deterministic Hub/OAuth fixtures, and `docs/hugging-face-publishing.md`.

**Modify:** release notes and relevant deployment documentation when the feature ships.

- [ ] Complete the automated and live acceptance matrix below.
- [x] Document supported inputs/sizes, public visibility, original metadata, cancellation, reconnection, and repository management.
- [ ] Enable on `/dev/`, verify the stable callback and anonymous reopening, then enable in a release containing the new loader/state support.
- [ ] Confirm the versioned build and `/latest/` use the same intended public configuration.
- [x] Keep separate development/release build flags to disable new publication while preserving existing exported links and read support.

**Exit:** the feature is release-ready; deployment or a release is a separate action from completing this plan.

Dependency order: `0 → 1 → 2 → 3 → 4 → 5 → 6`. Preparation and state-format work can proceed against mocks while external OAuth registration is arranged, but production enablement depends on the real integration proof.

## 9. Validation matrix

| Layer | Required evidence |
| --- | --- |
| Export/package unit tests | Binary round trip; current camera edits/deletions; 2D observations/tracks; optional rigs/frames; snapshot invalidation; no accidental download. |
| Media/path unit tests | Original-byte preservation; aliases deduplicated; Unicode/nested names; traversal/collisions rejected; masks absent versus failed; remote revision pinning; zero-byte splat placeholder rejected. |
| State/loader unit tests | Old links/manifests; new separate transforms; noncommuting transform example; URL overrides defaults; malformed/oversized state rejected; active splat remapping; deleted selection cleared. |
| Auth tests | Public config; state/nonce/verifier handling; exact origin/source; replay/expiry; disconnect; no credential persistence or logging. |
| Controller tests | Duplicate start; cancellation at preparation/create/batch/metadata/verification; commit completed after timeout; 401/403/409/429; changed parent; lost create response; different-account retry; source switch; late progress. |
| Component tests | Correct source-versus-edited link labels; public review action; license/name validation; file exclusions; unknown sizes; focus/keyboard handling; close/reopen progress; copy fallback. |
| Browser tests with mocked provider | Local load → connect popup → review → upload → copy/open; fresh recipient context; originals load lazily; geometry-only; selected splat alignment; failed/retried metadata; no full-tab auth redirect. |
| Live smoke, explicitly configured | Disposable dataset in a test account, real public OAuth and Hub transport, callback paths, file upload, anonymous reopening, and same-session reconnect. Keep credentials out of normal CI. |
| Performance | Model export time/peak memory, remote/ZIP batch memory, hashing responsiveness, cancellation responsiveness, and bundle split; test many small files and a large selected asset. |

Run focused tests as each milestone lands. Before release run `npm run lint`, `npm run test:run`, `npm run build`, and `npx playwright test --workers=1`. Run `npm run test:pycolmap` if shared COLMAP serialization changes. Add browser coverage for Firefox/WebKit where publication will be advertised; retain existing Chromium coverage. CI uses mock Hub responses and never creates public repositories as part of ordinary pull-request validation.

## 10. Setup dependencies and boundaries

The plan can be implemented locally with fake provider responses. Live enablement additionally needs a maintainer-owned public OAuth application, registered callback URLs, public client configuration in deployment, and a disposable test dataset/account with publication authorization. These are concrete setup dependencies, not reasons to block preparation or UI implementation.

Key limits to keep visible during implementation: browser memory is not the Hub's storage quota; public commits can survive cancellation; source assets must remain available during preparation; immutable links still depend on the owner's repository remaining accessible; and legacy viewer versions cannot interpret newly added alignment metadata. Each has an explicit mitigation or release check above.

Start with the tiny COLMAP vertical slice, then complete asset fidelity, transform restoration, and interrupted-write recovery before enabling **Publish public dataset** for users.
