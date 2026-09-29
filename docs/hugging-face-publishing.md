# Publish a dataset to Hugging Face

ColmapView can publish the currently loaded COLMAP reconstruction, original images, available masks, and splats to a new public dataset in the connected user's personal Hugging Face account. The resulting viewer link opens without a Hugging Face login and refers to fixed dataset revisions.

**Status:** implemented behind a build flag. Real localhost sign-in, public repository creation, a 168 MB PLY upload, dataset-card rendering, and anonymous reopening passed against the live Hugging Face service on 2026-09-28. Development and production publishing remain disabled in GitHub Actions pending deployment. Local publishing currently generates localhost viewer links; public sharing still needs a compatible hosted viewer and a public publication base URL.

## User workflow

1. Load a COLMAP reconstruction, then click the **🤗 Publish to Hugging Face** button in the main viewer toolbar, beside Share. This publishes the current reconstruction, including applied edits; existing source links in Share remain labeled as the original dataset.
2. Select **Sign in** in the dialog header, next to the close button, and connect your Hugging Face account in the sign-in popup. The header then shows your account and **Sign out**. The reconstruction stays open in its original tab.
3. Inspect **Dataset preview**, shown beside the details (above them on narrow screens) and captured from the current view each time the dialog opens. Click the image to choose a custom PNG, JPEG, or WebP instead; a custom image stays until you choose another or load a different dataset. The preview will appear in the dataset card.
4. Enter a new repository name, dataset title, description, and a license you can grant: Creative Commons 4.0 (BY, BY-SA, BY-NC, BY-NC-SA, BY-ND, BY-NC-ND), CC0 1.0, MIT, Apache 2.0, or a custom license. Original images, available masks, and all loaded splats are included automatically; there are no content checkboxes.
5. Apply or clear any pending image deletions. Applying them here changes the current reconstruction.
6. Select **Publish public dataset**; the notice beside it explains that the dataset is public and that cancelling does not remove committed files. Publishing first captures a fixed snapshot of the current dataset (**Preparing dataset…**), then uploads it. Missing originals or files above the supported size limit stop publishing with an error before anything is uploaded; they are not silently omitted. If the repository name is taken, the dialog returns to the form so you can choose another name. Files become public during upload. Keep the tab open; closing only the dialog preserves progress.
7. Once anonymous verification succeeds, **Copy** the viewer link, or use **Open viewer** or **Hugging Face page**. The link is the viewer followed by the dataset page (for example `https://colmapview.github.io/latest/?url=https://huggingface.co/datasets/you/scene`), restores the saved settings from `colmapview.yaml`, and follows the repository's latest revision. If clipboard access fails, select and copy the displayed link manually.

The publication retains the snapshot captured when you selected Publish. Later edits do not change an already published link. Use **Publish another dataset** to capture a new snapshot under a new name.

The preview is saved as **`colmapview-preview.png`** at the dataset root. Custom inputs may be up to 32 MiB and 64 megapixels. Previews are re-encoded as PNG without source image metadata and resized proportionally to at most 1600 pixels on the longest side. Reopening the form refreshes a screenshot; a custom image stays selected until replaced or another dataset is loaded. Uploads and retries retain the exact preview captured when you selected Publish. The README embeds its public URL pinned to the data revision. WebGPU captures copy a freshly submitted splat frame before presentation clears its canvas, then render and composite the WebGL overlays.

### Dataset viewer settings

Publishing writes **`colmapview.yaml` at the dataset root**, alongside the COLMAP files and metadata. It stores the saved camera view, display settings, and separate scene/splat alignment. The Hugging Face controls use the 🤗 emoji.

All dataset loaders recognize `colmapview.yaml`: local folders, supported local or remote archives, and dataset URLs on any HTTP(S) host. Local folders and archives use the settings file closest to the project root, including archives wrapped in a top-level directory. Settings are applied after the dataset loads so camera resets do not overwrite them.

For URLs, ColmapView checks the dataset directory, or beside a direct splat/archive file. Embedded archive settings take priority over a sidecar beside the archive. Hugging Face repository and revision-tree URLs are normalized automatically; their search also checks ancestors through the repository root on the same revision. Settings found in an ancestor apply only display settings (no camera view, alignment, active splat, or selected image), because they may describe a different project in the same repository; the exception is an ancestor file that saves the opened splat file as its active splat. Absent, unavailable, invalid, or oversized optional settings are skipped without preventing dataset loading. Within a readable settings file, an invalid or outdated display value is dropped on its own; a malformed structure, camera view, or transform rejects the file so splats are never shown misaligned. Settings files are limited to 256 KiB.

Settings use the same snake_case field names as exported ColmapView configuration files. Existing partial configurations work too:

```yaml
version: 1
point_cloud:
  point_size: 2
  max_reprojection_error: null # unlimited
camera:
  projection: perspective
  scale: 0.4
ui:
  background_color: "#123456"
  show_grid: false
```

Published files also include `viewer_version`, `view_state`, `transform`, and `splat` metadata. Only validated presentation fields are applied. A saved splat selection loads automatically on desktop, including files above the ordinary discovery download budget. Touch devices retain the large-file selection prompt. Explicit camera/settings values in an incoming viewer link override dataset defaults. Manually opening a dataset uses its saved settings without inheriting the previous scene's URL state. A manifest with an explicit `viewerStatePath` uses that document instead of automatic discovery; an invalid explicitly required document still produces a load error.

The dataset README links **Open in ColmapView** and shows the same **Viewer link** the dialog copies: `https://colmapview.github.io/latest/?url=https://huggingface.co/datasets/<owner>/<name>`. It opens the current viewer (not the version that published it) on the repository's latest revision and restores `colmapview.yaml`. The published `colmapview.json` manifest still pins every file to the data revision, for loading exactly what was published.

### Supported inputs and limits

- Local COLMAP files, supported local archives, and public, ungated Hugging Face source assets whose revisions can be pinned. Download assets from other remote hosts locally before including them.
- Current applied model edits, COLMAP observations and tracks, and optional rigs and frames. The pending scene transform is baked into the published COLMAP files once.
- Original image, mask, and splat bytes. Image metadata, including any embedded location information, is retained. Original splat alignment is stored separately in the viewer state.
- **No ColmapView size cap for PLY/splat files.** Local files are passed directly to the Hub SDK for incremental hashing and native Blob uploads. Remote splats are downloaded into browser-managed Blob storage before upload. Large splats get their own batch. Other files retain a **128 MiB per-file limit** and batches target **128 MiB**, with at most 49 data files plus a small batch receipt per commit. Remote files with unknown sizes are batched by their downloaded size; a remote splat of unknown size gets its own batch. Remote downloads time out only after 15 minutes without progress.
- SOG bundles are published and reopened like other splats. ColmapView does not convert splats; to publish a smaller SOG, convert beforehand with `npx @playcanvas/splat-transform scene.ply scene.sog`.
- Actual capacity still depends on browser memory/disk, the connection, and [Hugging Face storage limits](https://huggingface.co/docs/hub/storage-limits), including the account quota and Hub's 500 GB single-file ceiling. Removing the upload cap does not change the viewer's GPU/memory requirements.
- Fewer than 100,000 files and fewer than 10,000 direct entries in any output folder. Browser export still requires enough memory for the model and current batch.
- New personal public repositories only. Existing repositories, organization destinations, private/gated sharing, splat-only publication, and resuming after tab closure are outside this version's scope.

Public publication is discoverable and downloadable. Cancel stops further work and checks any uncertain commit; it does not delete files already committed. Same-tab retry checks the previous batch before sending it again. If the connection expires, reconnect the account that started the publication. Active uploads have no total time limit; 15 minutes without hashing or transfer progress triggers a recoverable timeout. Hashing and uploads display per-file percentages. After an outside repository change, start a new publication under another name. Manage any partial repository from Hugging Face directly.

## Maintainer setup

### Register a public OAuth application

Create a maintainer-owned app from [Hugging Face application registration](https://huggingface.co/settings/applications/new). Choose a **public app without a client secret**. The integration uses authorization-code PKCE and requests `openid profile contribute-repos`; the last scope permits creating repositories and accessing repositories created by the app. Register the intended callback URLs. See the [official OAuth documentation](https://huggingface.co/docs/hub/oauth) for registration and scope details.

Register the app once for ColmapView. Users then sign in with their own Hugging Face accounts and authorize publication into their personal namespace. Dataset recipients can use the public viewer links without signing in.

| Environment | Callback |
| --- | --- |
| Production releases and `/latest/` | `https://colmapview.github.io/latest/hf-callback.html` |
| Development deployment | `https://colmapview.github.io/dev/hf-callback.html` |
| Local development example | `http://localhost:5173/hf-callback.html` |

Use the actual origin if hosting elsewhere. The configured callback must have the same origin as the viewer, end in `/hf-callback.html`, and have no query or fragment. Production requires HTTPS; loopback HTTP is accepted for local development. A stable `/latest/` callback serves both the latest and versioned release viewers. Keep the version-1 callback message protocol compatible when updating that static page.

For local development, open `http://localhost:5173/` when using the callback above. `127.0.0.1` is a different origin. When publishing is enabled but the address does not match, the **🤗 toolbar button** opens an explanation and a link to the configured viewer. Reload the dataset in that tab. Restart Vite after changing `.env.local` so it picks up the public OAuth settings.

Only a public client ID and callback URL enter the build. Never add a client secret or an access token to a `VITE_` variable. Access tokens and PKCE state remain in tab memory and are discarded by disconnect or page reload.

### Configured application and live sign-in check

On 2026-09-27, the maintainer registered [ColmapView](https://huggingface.co/settings/applications/6ab992584abcf4acddced01e) under `opsiclear-admin` as a public app without a client secret. All three callback URLs above are registered, with default scopes `openid profile contribute-repos` and an eight-hour token lifetime.

The same public client ID is saved in `HF_OAUTH_CLIENT_ID` and `HF_DEV_OAUTH_CLIENT_ID`. Both deployment callback variables are configured; `HF_PUBLISH_ENABLED` and `HF_DEV_PUBLISH_ENABLED` remain `false`. The ignored `.env.local` enables the local integration with the registered `localhost:5173` callback.

Real sign-in passed in Chrome on Windows using an isolated Vite server at `http://localhost:5186/`: the viewer opened the Hugging Face consent screen, requested no organization access, completed PKCE through the static callback, and displayed **Connected as opsiclear-admin** while retaining the loaded synthetic reconstruction. Hugging Face accepts a different port for an otherwise matching HTTP loopback callback. The test server overrides the local callback to port 5186; the saved development default remains 5173.

At the 2026-09-27 check, both deployed callback URLs returned HTTP 404 because the implementation had not been deployed. Deploy the callback and feature code before testing the hosted flow. Live publication was subsequently verified as described below.

### Live publication verification (2026-09-28)

The [public integration-test dataset](https://huggingface.co/datasets/opsiclear-admin/colmapview-e2e-large-ply-20260928) was created through the local viewer UI with real OAuth and the real Hub SDK. The generated CC0 fixture contains one camera, two original images, one mask, 256 COLMAP points, and three million Gaussian splats. Its PLY is **168,000,363 bytes**, above the former 128 MiB upload cap.

Verified automatic preview capture, custom image replacement and retake, review, upload, metadata publication, and the app's anonymous verification. An independent unauthenticated download matched the PLY SHA-256 (`0ab1dfbcd87452df1dd404c16f1cbc842f6c36dc97f42cc44b3119187c7be034`) and the exact reviewed preview bytes. The dataset card displayed the embedded preview. Both README links reopened the live dataset in a fresh signed-out Chrome context, restored the camera/background/grid/splat settings, decoded both images, and initialized the WebGPU splat renderer without page errors.

This exposed and fixed a desktop restoration issue: a saved splat above the 150 MB discovery budget still opened the picker. Saved desktop selections now load automatically; touch devices retain their existing large-download prompt. Focused loader tests, lint, and the production build passed after the fix.

Data revision: `bb9ee9e1ef4b0496f695ec6ab21feea49dadfb20`. Metadata revision: `b630b92b6bbabd5697b9eb08c108340d33fad3cd`.

The test used the localhost development viewer for publication and recipient rendering. Its README explicitly notes that its viewer links target localhost. This does **not** validate a deployed viewer or make those links usable on another person's computer; hosted rollout and public-link configuration remain outstanding.

### Local configuration

After registration, put the public settings in the ignored `.env.local` file:

```dotenv
VITE_HF_PUBLISH_ENABLED=true
VITE_HF_OAUTH_CLIENT_ID=your-public-client-id
VITE_HF_OAUTH_REDIRECT_URI=http://localhost:5173/hf-callback.html
```

Restart Vite after changing environment variables. Leave the flag unset or `false` when testing unrelated work. An incomplete or wrong-origin configuration hides the publication entry point. Loading existing published datasets works with the flag disabled.

### GitHub Pages configuration

Configure these **repository variables** in GitHub Actions. They are public build settings, not secrets.

| Variable | Value |
| --- | --- |
| `HF_PUBLISH_ENABLED` | `false` until release rollout is approved; then `true` |
| `HF_OAUTH_CLIENT_ID` | Registered production public client ID |
| `HF_OAUTH_REDIRECT_URI` | Production `/latest/hf-callback.html` URL |
| `HF_DEV_PUBLISH_ENABLED` | `true` only when the development deployment is ready for testing |
| `HF_DEV_OAUTH_CLIENT_ID` | Public client ID registered for the development callback |
| `HF_DEV_OAUTH_REDIRECT_URI` | Development `/dev/hf-callback.html` URL |

The deployment workflow selects production settings for release tags and development settings for branch builds. Versioned releases and `/latest/` use the same production configuration. Settings take effect on the next build. Before enabling a release, bump the application version through the normal release process so generated links target a release containing the new manifest-state loader.

### Live acceptance before enabling publication

Use an authorized test account and a disposable, explicitly public dataset:

1. Verify popup sign-in from `/dev/`, then a versioned release using the stable `/latest/` callback. Test both successful and declined consent without losing the loaded model.
2. Publish a small complete dataset, then one with a file larger than 10 MB to exercise worker hashing and large-file storage. Check original bytes, images/masks, and saved splat alignment.
3. Open the copied link in a separate signed-out browser and from the dataset README. Confirm lazy images, saved view, and the fixed revisions.
4. Exercise cancellation, a temporary network failure, reconnection to the same account, and retry. Check that committed data are retained and no unrelated repository is overwritten.
5. Record browser/platform results and export/upload memory on representative local and archive datasets. Test each browser to be advertised before enabling it publicly.

Real OAuth consent, deployed callback headers, storage CORS, account permissions, quotas, and real large-file transport are not proven by the mock suite. Keep `HF_PUBLISH_ENABLED=false` until this live check passes. Disabling new publication does not disable the manifest loader or invalidate existing published links; those links still depend on the owner keeping the dataset accessible.

## Published package

```text
sparse/0/cameras.bin
sparse/0/images.bin
sparse/0/points3D.bin
sparse/0/rigs.bin                 # if present
sparse/0/frames.bin               # if present
images/...                       # original images
masks/...                        # available masks
splats/...                       # all loaded splat originals
colmapview-preview.png           # preview screenshot or custom image
colmapview.yaml                  # settings for both direct and manifest links
colmapview.json
colmapview-inventory.json
colmapview-publication.json
colmapview-upload.json
README.md
```

The final data revision **D** includes COLMAP files, original assets, the preview image, and bounded, validated viewer settings in `colmapview.yaml`. A later metadata revision **M** adds the dataset card, inventory, and manifest. That manifest points to D and uses the same YAML document; the copied viewer link points to the dataset page, which follows the latest revision. The README embeds the preview image pinned to D and links the viewer to the dataset page, avoiding a reference to its own unknown commit ID.

The viewer-state document restores display settings, the camera view, and separate scene/splat transforms. Explicit URL settings override document defaults. Earlier publications referencing `colmapview-state.json` remain readable. Manifests without `viewerStatePath` discover optional YAML settings at their dataset base URL. Tokens and source credentials never enter the package.

Saved splat paths resolve relative to the folder containing `colmapview.yaml`, including a downloaded project inside an enclosing folder or archive. Desktop viewers restore explicitly saved selections regardless of size; touch devices retain the large-file prompt and saved alignment. Ordinary discovery without a saved selection retains its download budget. Starting a local load cancels pending URL settings. Image and mask requests encode literal filename characters, and published manifests map original image names to their uploaded paths.

`src/features/huggingface/` owns public configuration, memory-only authentication, and the lazy `@huggingface/hub` adapter. `src/features/datasetPublishing/` owns snapshot preparation, metadata, upload lifecycle, recovery, and anonymous verification. The controller outlives its dialog; large blobs stay out of React/Zustand UI state. Unique operation markers, expected parents, and atomic batch receipts distinguish a recovered upload from unrelated repository changes.

The initial upload adapter explicitly selects the SDK's LFS/basic and multipart transports (`useXet: false`). Browser tests verify both direct binary uploads and multipart completion with content hashes and part receipts. Native Xet transport remains outside the validated initial path.

## Automated checks

The publication tests cover anonymous reopening through the shared link (which the README also uses) and manual entry of the pinned manifest directory. Dataset-settings checks cover local folders, local archives, remote manifests, and remote archives on a host other than Hugging Face. Unit tests cover camera and splat transforms, URL precedence, legacy JSON compatibility, invalid settings, preview replacement and cancellation, source changes, and conflict recovery.

The browser fixture includes an 11 MiB original image to exercise worker hashing, LFS binary upload, and multipart completion. This is functional coverage, not a representative peak-memory benchmark; that measurement remains part of rollout testing.

```powershell
npm run lint
npm run test:run
npm run build
npx playwright test e2e/dataset-viewer-settings.spec.ts e2e/hugging-face-publish.spec.ts --project=chromium --project=firefox --workers=1
```

Playwright always starts its own test server on port 5187 (override with `COLMAP_WEBVIEW_E2E_PORT`) and never reuses an existing one, so a developer's `npm run dev` server with different feature settings cannot be picked up by mistake. The mock browser fixture intercepts Hugging Face requests and receives binary uploads on a temporary loopback endpoint; it uses fake OAuth credentials and creates no real repositories. It also verifies that metadata retries preserve committed assets and that declining consent preserves the loaded dataset. Live service validation is recorded separately above.

For the original design and outstanding rollout gates, see the [implementation plan](hugging-face-dataset-sharing-plan.md).
