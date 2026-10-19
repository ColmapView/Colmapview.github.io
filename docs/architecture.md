# Architecture Guide

This project is a Vite, React, TypeScript viewer for COLMAP reconstructions. Keep changes aligned with these module boundaries so future work stays easy to locate, test, and review.

## Dependency Direction

UI should depend on application boundaries, not low-level implementation helpers. The preferred flow is:

`components/` -> `hooks/` or `nodes/` -> `store/`, `dataset/`, `parsers/`, `utils/`

Core modules should not import from `components/`. Parser and dataset code should stay UI-free.

## Module Ownership

- `components/`: render UI, wire events, and compose hooks. Avoid source-specific file loading, storage policies, parser details, and direct browser globals when a shared helper exists.
- `dataset/`: own image and mask access across local, URL, manifest, and ZIP sources. Components should use `useDataset()` instead of importing image-file utilities.
- `archive/`: one worker per active archive, indexed ZIP/TAR readers, compatibility codecs, temporary storage, and image previews. All upload, drop, URL, Hugging Face, and Google Drive archive inputs use this boundary.
- `splat/`: splat decoding, renderer backends, and shared loading policy. Device budgets, automatic loading, and eligibility for loading without retained file bytes belong in `splat/loadingPolicy.ts`; stores, URL loaders, and the picker import that policy directly.
- `store/`: own shared app state, persistence, and user actions. Keep UI rendering out of store actions.
- `nodes/`: expose derived viewer state for camera, selection, navigation, and matches. Use nodes when multiple components need the same derived state.
- `hooks/`: own reusable React behavior, subscriptions, and component-facing view models.
- `features/`: provider authentication and transport, shared publication workflows, and the optional account-session client.
- `parsers/`: read and write COLMAP data. Keep this layer deterministic and independent of React.
- `utils/`: framework-light helpers and shared policies such as confirmation, cursor ownership, and storage key handling.
- `theme/` and `icons/`: design tokens, reusable class names, and visual primitives.

## Facades And Controllers

When a component or hook needs many store selectors, node selectors, and actions, introduce a feature-local facade or controller instead of spreading those subscriptions across render code. Use names that describe the boundary, such as `useViewerControlsController` or `useGlobalContextMenuActionDeps`.

Facades should adapt stores and nodes into typed dependencies. Pure executors and policies should receive those dependencies as parameters and avoid importing stores directly. This keeps behavior testable with plain objects while limiting store wiring to one feature-owned hook.

URL manifest loading keeps its existing entry point in `hooks/urlLoaderManifestFetch.ts`, which validates documents and transfers model files. `urlLoaderColmapDiscovery.ts` owns remote model/media layout discovery; `urlLoaderSplatDiscovery.ts` returns selectable splat catalogs without activating them. `urlLoaderHuggingFaceListing.ts` owns pagination with separate contracts for best-effort discovery and complete, scene-scoped media indexing. `urlLoaderManifestSource.ts` coordinates parsing, optional settings, and the final splat activation decision after saved settings settle.

Shared reconstruction calculations live in `utils/floorPlaneAlignment.ts` and `utils/histogram.ts`. The reconstruction worker and UI use these same calculations and data types. Modal styles, labels, and chart layout stay in the component policies; computation modules must not depend on those UI modules.

## Storage Providers

Storage providers own authentication and transport under `features/`. `bucketStorage/connection.ts` keeps ordinary S3 credentials in a tab-local closure and exposes a redacted render snapshot. With an explicitly remembered connection, the encrypted Worker record owns the saved secret and the browser receives short-lived presigned URLs instead. `features/accountSessions/` restores supported connections before remote startup loads; Google/HF access tokens remain in tab memory while renewable credentials stay encrypted on the server for at most 30 days. GitHub Pages retains browser-only authentication. See [account sessions](account-sessions.md) for ownership, expiry and disconnection.

`fetchDatasetResource` composes bucket and Hugging Face request policies for discovery, lazy media, ranges, and re-publication; authenticated bucket requests stay within the configured bucket root. Provider credentials never enter reconstruction state or published manifests.

Upload dialogs share access, progress, and result controls under `components/upload/`. The provider controllers retain their own transport and permission rules. All three use `prepareTransferPublication` to pin source revisions and copy original assets, including authorized private sources. Hugging Face captures the chosen visibility with the upload job and receipt, checks it before each commit, verifies private destinations with repository-scoped authentication, and verifies public files anonymously. Bucket uploads preserve existing bucket permissions.

Bucket listing, multipart transfers, and manifest-last publication have independent, dependency-injected boundaries. Store subscriptions and scene invalidation live in `bucketStorage/publicationRuntime.ts`; the dialog consumes component facades. `datasetPublishing/prepareTransferPublication.ts` shares original-media preparation between Drive ZIP packaging and bucket object uploads. See [bucket storage](bucket-storage.md) for connection formats, permissions, and CORS.

## Archive Processing

`zipLoader` opens an archive session, extracts reconstruction/settings/splat files, and keeps image entries lazy. Readers expose entry listing and closing; every entry supports original extraction and worker previews. Repeated close callers wait for the same cleanup and receive the same failure. The session worker runs one operation at a time and selects waiting work by current consumer priority: selected, visible, metrics, then prefetch. Cancelling a consumer removes its queued work or cancels its current read; replacing or closing the archive terminates its worker. Failed incoming loads leave the installed dataset intact.

Application reader and entry contracts belong to `archive/types.ts`. They describe the session API shared by loaders, lazy image access, and test builders; vendor codec declarations stay separate from this public boundary.

ZIP uses the central directory, including ZIP64 offsets, with stored/deflate extraction and size/CRC checks. TAR indexes headers and skips file bodies, distinguishing POSIX filename prefixes from GNU timestamp fields. These containers do not require a whole-archive WASM allocation. Gzip TAR streams to temporary origin-private browser storage (OPFS) before indexing when storage access is usable; unavailable storage or quota failures use the bounded compatibility codec. xz/bzip2 TAR, 7z, and uncommon ZIP/TAR features use that WASM codec inside the same worker. Compatibility archives must fit below 2 GiB. Indexed extraction limits each file to 2 GiB and bounds index size/count; available memory and disk quota still govern usable dataset size.

Known-size remote ZIP/TAR files of at least 32 MiB use validated HTTP byte ranges, with a 4 MiB range cache and provider authentication on the main thread. Servers that cannot expose valid ranges fall back to a complete download. Large or unknown-size downloads probe OPFS access before streaming to disk. Failed storage setup cancels its response and retries once in memory; the memory fallback retains the 2 GiB download limit even when the container supports larger files. Setup failures and cancellation release temporary-file leases and stream readers. Closing a session removes its temporary files. Browser locks protect active temporary files across tabs/workers and allow later disk-backed loads to remove files abandoned by reloads or crashes. Files returned from temporary storage own their extracted bytes so they remain readable after cleanup.

Display requests check image headers before decoding, refusing unreadable dimensions and sources above 64 megapixels. Worker previews request resized bitmaps where safe, preserve the browser decoder's aspect ratio/orientation, and fit the existing screen/2048-pixel bounds. Extreme aspect ratios use a source decode bounded by the same pixel limit rather than risk upscaling. Opaque previews use JPEG quality 0.75, suitable JPEGs are reused without decoding, and transparency stays PNG. Display images and masks share a 128 MiB byte-budget LRU cache. Raw originals remain available without resizing, recompression, or preview pixel limits for export and image metrics; masks stay lossless. This cache budget covers retained encoded files, not browser decode/GPU memory.

`useUIStore` remains a shared domain store, so treat workflow-local facades as the documented selector boundary for UI state. A facade can be small when it is the explicit store boundary for a component, but it must stay feature-local, return only the fields the caller needs, and have a colocated test. Do not add a facade as a pass-through for non-store helpers; use direct imports for pure helpers and controllers for workflows that need orchestration.

Non-component store hook calls are allowed only in documented boundary modules: dataset public hooks, node selector hooks, and application/controller hooks that translate store state into workflow dependencies. Those callers are recorded in `src/components/componentStoreBoundary.test.ts` so new direct store subscriptions outside a boundary fail review instead of becoming invisible coupling.

The boundary regression test in `src/components/componentStoreBoundary.test.ts` enforces two rules:

- Production component files must not call Zustand store hooks outside `*StoreFacade` modules.
- Every production store facade must have a colocated test.
- Direct store hook calls outside component facades must stay in the documented boundary caller list.

## Popup Layering

Popup z-index behavior is centralized in `theme/zIndex.ts`, CSS variables, and the popup inventory tests. New modal, context-menu, hover-card, or tooltip surfaces should use the existing layer constants and update `components/ui/popupLayerInventory.ts` when ownership paths move. Do not change z-index values as part of organization-only refactors.

## Testing Strategy

Use colocated Vitest files for pure helpers, store actions, hooks, and parser behavior. Use builders in `src/test/builders/` for cameras, images, reconstructions, loaded files, and dataset state instead of hand-assembling large object graphs in each test.

Use Playwright in `e2e/` for browser behavior and real workflow coverage. Prefer locator assertions and app state signals over fixed sleeps.

## Validation Commands

- `npm run check`: JavaScript/TypeScript lint, test type checks, unit tests, and production build.
- `npm run test:deployment:config`: deployment configuration and artifact policy checks without a browser.
- `npx playwright test --workers=1`: browser workflow validation.
- `npm run test:pycolmap`: Python compatibility checks for parser/export changes.

Run the narrowest relevant command while editing, then `npm run check` before handoff. Run Playwright when changing viewer, modal, loading, export, or keyboard/mouse behavior.

## Boundary Enforcement

ESLint guards the first high-risk boundaries:

- `src/components/**` must not import `utils/imageFileUtils` directly.
- `src/archive/**`, `src/dataset/**`, `src/parsers/**`, `src/splat/**`, `src/store/**`, and `src/wasm/**` must not import UI components.

If a future change needs to cross these boundaries, add a small public API in the owning module instead of importing through the boundary.
