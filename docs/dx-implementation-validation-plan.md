# DX Implementation and Validation Plan

## Objective

Improve developer experience by making behavior easier to locate, test, and change without broad rewrites. The target shape is a codebase where React components render and adapt events, hooks own lifecycle, stores own shared state and actions, and pure view-model or policy modules own reusable decisions.

## Baseline

This is a Vite, React, and TypeScript COLMAP viewer. The main app code is under `src/`:

- `components/`: UI, modal, gallery, and 3D viewer surfaces.
- `hooks/`: React lifecycle, subscriptions, and browser integration.
- `store/`: Zustand state, persistence, and user actions.
- `dataset/`: image, mask, manifest, ZIP, and URL source access.
- `parsers/`: COLMAP import/export readers and writers.
- `utils/`: shared domain helpers, policies, math, URL, file, and ZIP code.
- `e2e/`: Playwright browser workflow tests.

Keep `AGENTS.md` focused on contributor commands and `docs/architecture.md` focused on stable ownership boundaries.

## Implementation Strategy

### 1. Work In Small Slices

Each slice should target one workflow or responsibility cluster, such as image-detail controls, gallery keyboard behavior, export orchestration, URL loading, frustum interaction, or parser output. Avoid line-count-driven rewrites. A good slice is small enough to review independently and has a clear validation command.

### 2. Preserve Module Ownership

Use these boundaries as the default:

- Components render UI, read state, and dispatch callbacks.
- Hooks own React effects, refs, subscriptions, timers, and browser APIs.
- `*ViewModel.ts` modules format labels, derive button state, build option lists, and decide visible UI state.
- `*Policy.ts` modules make domain or interaction decisions without React.
- Store actions express user intent and call dataset, parser, or utility APIs.
- Dataset and parser modules must not import UI components.

Keep existing facade exports when splitting modules if many callers depend on the current import path.

### 3. Extract Pure Decisions First

For each target file:

1. Identify inline decisions: labels, disabled states, visibility, option lists, clamps, formatters, cache decisions, or action plans.
2. Move the decision into a named `*ViewModel.ts`, `*Policy.ts`, or focused helper near the caller.
3. Add colocated Vitest coverage for the extracted behavior.
4. Update the component or hook to call the helper.
5. Extract presentational subcomponents only when they reduce repeated markup or prop branching.

Do not hide ordinary React dependencies inside helper refs. Use `useLatestRef` only for stable native listener registration that must read current values.

### 4. Improve Test Ergonomics

Expand `src/test/builders/` when tests need COLMAP cameras, images, points, datasets, masks, or loaded files. Prefer builders and page objects over repeated large literals. Keep tests close to the module under test:

- Pure helpers: `*.test.ts` with Vitest.
- Hooks: render-hook or small integration tests with mocked browser APIs.
- Components: jsdom tests for labels, states, and callbacks.
- Viewer workflows: Playwright specs in `e2e/`.

### 5. Tighten Boundaries Gradually

Use documentation and review first. Add ESLint boundary rules only when the same violation repeats or the dependency direction is high risk. Existing useful rules should protect UI-free parser/dataset/store modules and prevent components from bypassing dataset APIs.

### 6. Document Stable Conventions

Update docs only for conventions that should guide future changes:

- `AGENTS.md`: setup, build, test, and contribution commands.
- `docs/architecture.md`: dependency direction and module ownership.
- This file: implementation process and validation requirements.

Avoid turning this plan into a detailed change log. Put slice-specific evidence in PR descriptions or commit notes.

## Near-Term Sequence

1. Finish modal cleanup by keeping image-detail controls, modal sizing, deletion flows, and distance input behavior behind tested view-model or policy modules.
2. Continue viewer-panel cleanup by keeping panel copy, options, and button states in panel view models while panels remain layout and callback surfaces.
3. Consolidate 3D interaction rules around frustums, context menus, trackball controls, transform gizmos, and screenshots into pure policies with focused tests.
4. Strengthen gallery and loading flows by separating keyboard, hover, scroll-settle, manifest, ZIP, and URL decisions from hooks.
5. Improve test builders and Playwright page objects where repeated setup appears in three or more tests.

## Current Hotspot Status

Completed style-decision extraction slices:

- URL loading progress fill style in `src/components/dropzone/DropZone.tsx`.
- Gallery item, hover-card, and virtualized-row dynamic styles in `src/components/gallery/`.
- Footer logo sizing in `src/components/viewer3d/FooterBranding.tsx`.

Completed policy extraction slices:

- App startup embed, touch-mode, share-load precedence, legacy URL fallback, and selected-image restoration decisions now live in tested policy helpers in `src/appStartupPolicy.ts`.
- Shared viewer `SelectRow` controls now preserve option value types and validate raw DOM select values before calling typed handlers, keeping panel components free of option-union casts.
- Color-row hue text and range inputs now share strict parsing helpers in `src/components/viewer3d/controlRows/colorRowsPolicy.ts`, rejecting partial numeric strings before updating color state.
- URL loader normalization, manifest, archive, and inline-manifest log messages now live in tested policy helpers in `src/hooks/urlLoaderPolicy.ts`.
- URL loader error handling now validates typed error objects with explicit record, type, and optional-string guards, and manifest fetches rethrow only well-formed URL load errors.
- Camera, UI, and rig persisted-store version migrations now live in tested policy helpers in `src/store/persistedStoreMigrations.ts`, keeping Zustand store files focused on state and actions.
- Point-cloud persisted-state merge behavior now uses guarded policy helpers in `src/store/persistedStoreMigrations.ts`, including the JSON `Infinity` to `null` restoration rule.
- Camera-conversion target-model select values now use the shared `CameraModelId` guard before updating typed modal state, preserving model id `0` while rejecting unsupported raw values.
- Settings profile persistence now parses and serializes `localStorage` data through `src/hooks/profilesStorage.ts`, validating saved configurations, dropping invalid profiles, and normalizing stale active-profile names before `useProfiles` applies them.
- Legacy settings migration now parses persisted JSON through an explicit object guard before splitting data into domain stores, rejecting malformed or non-object legacy payloads without deleting the old key.
- COLMAP manifest validation now runs through `src/utils/manifestValidation.ts`, giving drop-zone manifest uploads, URL manifest fetches, and inline share-data manifests one schema boundary and one validation-details formatter.
- File and directory scanning now narrows drag/drop `FileSystemEntry` values and File System Access handles with local discriminant guards in `src/utils/fileScanning.ts`, removing repeated file/directory handle assertions from import traversal.
- Gallery toolbar camera-filter select values now pass through `src/components/gallery/imageGalleryToolbarViewModel.ts`, preserving `all` and known camera ids while ignoring unsupported raw DOM values.
- UI integer string boundaries now share `src/utils/numberParsing.ts`, giving gallery filters, hue controls, camera conversion, and image-jump controls one strict safe-integer parser instead of partial `parseInt` behavior.
- UI finite-number boundaries now share `parseFiniteNumberString`, so slider edits, match opacity, distance input, and legacy URL camera state reject partial values like `4px` instead of preserving `parseFloat` truncation.
- Camera frustum scale-factor conversion now uses a typed scale-factor map in `src/components/viewer3d/cameraFrustumViewModel.ts` instead of parsing the option value at render time.
- ZIP URL validation and download progress now parse `content-length` through the shared strict integer parser, treating malformed headers as unknown size instead of trusting partial numbers.
- ZIP archive loading and mask extraction now rely on the declared `ArchiveEntry.extract()` boundary instead of repeating local archive-entry assertions in `src/utils/zipLoader.ts` and `src/utils/zipImageFiles.ts`.
- CSS hex color validation and conversion now share `src/utils/hexColor.ts`, so UI color rows, theme integer colors, HSL conversion, and persisted config color schemas reject malformed hex strings without raw `parseInt` calls.
- Mouse-tooltip marker parsing now narrows regex captures through a local marker guard in `src/components/ui/mouseTooltipPolicy.ts` instead of asserting capture values as tooltip marker unions.
- Coordinate-system axis lookup now uses typed axis-key mapping in `src/utils/coordinateSystems.ts`, so floor alignment and distance-input target-up vectors no longer rely on case-conversion assertions.
- Floor-plane and point-picking store defaults now use typed default constants instead of repeating target-axis and color-mode assertions.
- Selected-image texture cache bitmap ownership now lives in a `WeakMap` in `src/hooks/selectedImageTextureCache.ts`, avoiding custom `THREE.Texture` mutation and selected-texture assertions while preserving bitmap cleanup.
- Canvas and OffscreenCanvas boundaries now share `src/utils/canvasTypeGuards.ts`, so async image canvases, thumbnail/frustum JPEG conversion, image compression, and WebCodecs frame recording use typed guards or narrowed refs instead of local canvas assertions.
- Gallery view-model dataset returns now preserve the typed `DatasetManager` from `useDataset()` directly, and screenshot recording quality flows from the export store without redundant literal-union assertions.
- Frustum selection-border material ownership now uses a typed `THREE.LineLoop` and shared `disposeMaterial` helper in `src/components/viewer3d/threeMaterialMutations.ts`, removing selected-border material assertions while preserving cleanup.
- Batched frustum and rig line render loops now read `color` and `alpha` attributes through `src/components/viewer3d/threeBufferAttributes.ts`, replacing repeated `BufferAttribute` and `Float32Array` assertions with a tested Three boundary guard.
- DOM event-target containment now uses `src/utils/domTargetGuards.ts`, so drop-zone drag-leave handling, touch outside dismissal, and click-outside policy share one tested `EventTarget` to `Node` boundary instead of local `as Node` casts.
- Modal drag and image-detail resize pointer capture now share `src/utils/capturedPointerDrag.ts`, replacing repeated listener setup and local `currentTarget as HTMLElement` casts with one tested drag-boundary helper.
- Custom-size screenshot rendering now clones cameras through `src/components/viewer3d/screenshotCameraPolicy.ts`, updating aspect only for perspective-camera clones and removing the screenshot download `PerspectiveCamera` assertion.
- Frustum plane hover intersections now pass through guarded marker checks in `src/components/viewer3d/frustumPlaneHoverPolicy.ts`, removing the React Three Fiber intersection-array assertion from hover interactions.
- Idle-timer hideable-target checks now narrow event targets through an `Element` guard in `src/hooks/idleTimerPolicy.ts`, removing the local closest-capable target assertion while preserving overlay hover behavior.
- Trackball controls now register an actual `THREE.EventDispatcher` controls object through `src/components/viewer3d/trackballControlsApi.ts`, allowing `src/components/viewer3d/TrackballControls.tsx` to pass React Three Fiber's store setter directly without a `TrackballStateSetter` assertion.

Completed parser-boundary cleanup slices:

- Configuration key conversion in `src/config/configuration/converter.ts` now uses a typed record guard, and YAML parsing in `src/config/configuration/serializer.ts` validates converted unknown data without a pre-validation configuration assertion.
- Configuration schema validation now exports the generated schema as the `PartialAppConfiguration` boundary in `src/config/configuration/schema.ts`, so successful parses return typed config data without a post-parse assertion; section-key checks in `src/config/registry/generators/configurationRecord.ts` use a string-backed set instead of an includes cast.
- Generated configuration section types in `src/config/configuration/types.ts` now model required sections with optional known registry fields plus extension keys, allowing `src/config/registry/generators/configurationRecord.ts` to assemble generated records without a section-value assertion.
- Configuration registry enum values in `src/config/registry/types.ts` are now typed as non-empty tuples, allowing `src/config/registry/generators/schema.ts` to generate Zod schemas without property or enum tuple assertions.
- Configuration store adapter extraction, apply, and reset paths in `src/config/registry/generators/adapter.ts` now use record, section-key, and setter guards instead of unchecked configuration-boundary assertions.
- COLMAP camera model IDs now pass through an explicit `CameraModelId` guard before binary or WASM parser conversion code trusts them, and unsupported WASM model IDs trigger cleanup plus JS-parser fallback.
- COLMAP rig and frame sensor types now pass through an explicit `SensorType` guard before binary, text, or WASM parser conversion code trusts them; unsupported WASM rig/frame sensor types are isolated to non-fatal rig-data fallback.
- COLMAP text parser numeric tokens for cameras, images, points3D, rigs, and frames now pass through `src/parsers/colmapTextTokens.ts`, rejecting partial numeric tokens and malformed track or sensor mappings without storing `NaN` values.
- Inline shared manifests in `src/utils/shareDataCodec.ts` now use the shared manifest validation helper instead of a trusted type assertion, with malformed-manifest coverage.
- ZIP export compression-level normalization and application ZIP Blob construction now live in `src/parsers/zipExportPolicy.ts`, so reconstruction, image, and mask exporters share the same typed boundary without per-export Blob casts.

Completed test-fixture cleanup slices:

- Image bitmap and image-cache canvas fakes in `src/hooks/asyncImage*.test.ts` now use shared builders from `src/test/builders/`.
- Screenshot GIF, WebM, WebCodecs, canvas, and recording-stop tests now use shared media and browser fakes from `src/test/builders/`.
- Viewer pointer, mouse, keyboard, wheel, and React Three Fiber event tests now use shared event fakes from `src/test/builders/`.
- File, archive, drag/drop, and readable-file tests now use shared file-system fakes from `src/test/builders/`.
- Point-cloud WASM tests now use a shared WASM wrapper fake from `src/test/builders/`.
- File scanning tests now use shared File System API entry and handle fakes from `src/test/builders/`.
- Download and ZIP export tests now use shared anchor and timeout fakes from `src/test/builders/`.
- Parser writer, image-stat, and integrity tests now use shared WASM wrapper fakes or typed runtime injection from `src/test/builders/`.
- URL image, ZIP image, ZIP download, and image compression tests now use shared response, archive, file, and image-bitmap fakes from `src/test/builders/`.
- Node navigation action tests now use typed `CameraViewState` and `NavigationHistoryEntry` fixtures instead of partial casted objects.
- Playwright dataset loading now uses narrow browser-side drop-entry fixture types instead of casted `FileSystemEntry` objects.
- Share-data malformed-config coverage now builds a raw incoming payload instead of forcing invalid data through the typed encoder API.
- COLMAP parser helper tests now use shared camera, image, point, rig-data, and WASM builders instead of casted placeholder objects.
- File-dropzone rig-data, local-source, and reconstruction tests now use shared rig-data, directory-handle, and WASM wrapper builders instead of local placeholder assertions.
- Frustum and selected-image texture tests now use the shared image-bitmap builder instead of local `ImageBitmap` assertions.
- Trackball projection-camera tests now narrow created cameras with explicit `instanceof` guards before reading perspective or orthographic fields, avoiding local camera subtype assertions.
- Parser ZIP/export tests now share readable binary Blob/File builders, guarded Blob-to-ArrayBuffer reads, and a typed timeout implementation builder instead of repeated FileReader, BlobPart, and setTimeout assertions.
- Gallery item and trackball touch tests now use shared React mouse/pointer/touch and native touch-event builders instead of local event object assertions.
- Async image canvas, canvas-type guard, and screenshot clipboard tests now use shared canvas-context and clipboard-item builders instead of local DOM API placeholder assertions.
- Screenshot recording canvas and frame-tick tests now pass real Three scene and camera instances instead of placeholder Three object assertions.
- Screenshot GIF and WebCodecs start tests now use shared GIF-handler and encoded-chunk builders instead of local media callback and chunk assertions.
- Async image cache scheduler and visible image fetch tests now use shared idle-deadline and reconstruction builders instead of local browser/domain placeholder assertions.
- ZIP archive state tests now use shared archive reader and entry builders instead of a local archive placeholder assertion.
- Parser transform and integrity tests now use a shared byte-copy helper instead of local Node Buffer to ArrayBuffer assertions.
- ZIP URL validation tests now use typed fetch mocks and the shared response builder instead of local fetch implementation assertions.
- Click-outside hook tests now rely on Vitest's inferred spy type instead of a `MockInstance` assertion.
- Keyboard shortcut e2e tests now read scene background color through `getComputedStyle` instead of browser-side `HTMLElement` assertions.
- Export-panel and image-detail camera view models now accept the numeric camera shape they render, letting unknown-model fallback tests avoid invalid `CameraModelId` assertions.
- Distance and image-jump modal input tests now use matcher-based value assertions instead of reading input `.value` through `HTMLInputElement` casts.
- Image-detail view and match-opacity tests now use explicit HTMLElement guards for rendered roots and event containers instead of inline DOM assertions.
- WASM integrity tests and pycolmap fixture generation now share typed Node WASM factory resolution plus camera/image map builders, replacing repeated factory, ArrayBuffer, and camera-model assertions.
- File-system entry builders now use typed test classes for drag/drop file and directory entries instead of object-literal entry assertions.
- File System Access handle, data-transfer, and archive-list builders now use typed test fakes or generic promise results instead of local browser API assertions.
- Clipboard item, blob-event, and video-frame builders now use typed browser fakes instead of object assertions while preserving existing spy ergonomics.
- Media stream, media recorder, and video encoder builders now use `EventTarget`-backed typed fakes instead of object assertions while preserving injectable spy methods.
- GIF encoder builders now use a concrete `EventEmitter` fake with typed tuple-narrowed handler registration instead of object and listener assertions.
- Native keyboard, pointer, mouse, wheel, touch, and touch-event builders now use real DOM events or typed pointer/touch fakes instead of object assertions.
- Canvas helpers now expose a narrow 2D context surface for drawing and smoothing, letting the shared canvas builder return a small structural fake instead of asserting a full `CanvasRenderingContext2D`.
- Gallery, long-press, and batched-frustum interaction hooks now expose the minimal event fields they consume, letting React and R3F test builders return structural event fixtures without wrapper assertions.
- Modal drag, image-detail resizing, and image-detail navigation handlers now depend on minimal event contracts instead of React event alias imports, with captured pointer drag behavior covered by focused hook tests.

Remaining hotspot backlog:

- Completed direct-store facade slices now cover `src/components/gallery/useImageGalleryViewModel.ts`, `src/components/gallery/ImageGalleryItems.tsx`, `src/components/viewer3d/Scene3D.tsx`, `src/components/viewer3d/ScreenshotCapture.tsx`, `src/components/viewer3d/CameraFrustums.tsx`, `src/components/viewer3d/FrustumPlane.tsx`, `src/components/viewer3d/PointCloud/PointCloud.tsx`, `src/components/viewer3d/SelectedPointMarkers.tsx`, `src/components/viewer3d/TransformGizmo.tsx`, `src/components/viewer3d/BatchedArrowMeshes.tsx`, `src/components/viewer3d/BatchedPlaneHitTargets.tsx`, `src/components/viewer3d/contextMenu/GlobalContextMenu.tsx`, `src/components/viewer3d/contextMenu/useGlobalContextMenuActionDeps.ts`, `src/components/viewer3d/PickingCursor.tsx`, `src/components/viewer3d/CameraMatches.tsx`, `src/components/viewer3d/RigConnections.tsx`, `src/components/viewer3d/panels/GalleryToggleButton.tsx`, `src/components/viewer3d/ControlComponents.tsx`, `src/components/viewer3d/FpsTracker.tsx`, `src/components/viewer3d/FooterBranding.tsx`, `src/components/viewer3d/TrackballControls.tsx`, `src/components/viewer3d/Scene3DE2EProbe.tsx`, `src/components/viewer3d/useViewerToolModalState.ts`, `src/components/viewer3d/useViewerControlHotkeys.ts`, `src/components/viewer3d/useSceneContextMenuController.ts`, `src/components/modals/useImageDetailDeletionActions.ts`, `src/components/layout/AppLayout.tsx`, `src/components/layout/StatusBar.tsx`, `src/components/layout/TouchStatusBar.tsx`, `src/components/layout/CacheStatsIndicator.tsx`, `src/components/dropzone/DropZone.tsx`, `src/components/dropzone/ProfileSelector.tsx`, `src/components/database/DataPanel.tsx`, `src/components/ui/MouseTooltip.tsx`, and `src/components/ui/NotificationContainer.tsx`.
- Completed type-boundary cleanup remains stable: no `as unknown as`, `as any`, ignore comments, or eslint-disable comments remain in the scanned `src`, `tests`, and `e2e` trees.
- Continue reducing direct store wiring only when new component/controller hotspots appear. The current scan shows no remaining direct Zustand store hooks in production components outside feature-local facade modules; `useSyncExternalStore` hits in cache/lifecycle hooks are intentional subscription surfaces.
- Keep popup layer behavior fixed during organization work. Do not change `theme/zIndex.ts` values; update `components/ui/popupLayerInventory.ts` only when popup ownership paths move.
- Boundary regression coverage now lives in `src/components/componentStoreBoundary.test.ts`, enforcing that production component store hooks stay behind facade modules while allowing intentional `useSyncExternalStore` subscription hooks.

Latest focused validation evidence:

- `npm run check` (360 files, 1890 tests, production build)
- `npx playwright test e2e/canvas-interactions.spec.ts e2e/object-context-menu.spec.ts e2e/viewer-controls.spec.ts e2e/gallery.spec.ts e2e/drop-zone.spec.ts e2e/modals.spec.ts --reporter=line --workers=1` (82 tests across Chromium and Firefox)
- `npx eslint src/components/componentStoreBoundary.test.ts`
- `npx vitest run src/components/componentStoreBoundary.test.ts` (1 test)
- `npx eslint src/components/viewer3d/Scene3DE2EProbe.tsx src/components/viewer3d/useScene3DE2EProbeStoreFacade.ts src/components/viewer3d/useScene3DE2EProbeStoreFacade.test.ts src/components/viewer3d/TrackballControls.tsx src/components/viewer3d/useTrackballControlsStoreFacade.ts src/components/viewer3d/useTrackballControlsStoreFacade.test.ts`
- `npx vitest run src/components/viewer3d/useScene3DE2EProbeStoreFacade.test.ts src/components/viewer3d/useTrackballControlsStoreFacade.test.ts src/components/viewer3d/useTrackballCameraLifecycle.test.ts src/components/viewer3d/useTrackballPointerHandlers.test.ts src/components/viewer3d/useTrackballWheelHandlers.test.ts src/components/viewer3d/useTrackballKeyboardHandlers.test.ts src/components/viewer3d/useTrackballTouchHandlers.test.ts src/components/viewer3d/trackballControlsViewModel.test.ts src/components/viewer3d/trackballControlsApi.test.ts` (49 tests)
- `npx eslint src/components/viewer3d/useSceneContextMenuController.ts src/components/viewer3d/useSceneContextMenuStoreFacade.ts src/components/viewer3d/useSceneContextMenuStoreFacade.test.ts src/components/viewer3d/scene3dViewModel.test.ts src/store/stores/pointPickingStore.ts src/store/stores/pointPickingStore.test.ts`
- `npx vitest run src/components/viewer3d/useSceneContextMenuStoreFacade.test.ts src/components/viewer3d/scene3dViewModel.test.ts src/components/viewer3d/sceneContextMenuGuard.test.ts src/store/stores/pointPickingStore.test.ts` (22 tests)
- `npx eslint src/components/viewer3d/useViewerControlHotkeys.ts src/components/viewer3d/useViewerControlHotkeyStoreFacade.ts src/components/viewer3d/useViewerControlHotkeyStoreFacade.test.ts src/components/viewer3d/useViewerControlHotkeys.test.ts`
- `npx vitest run src/components/viewer3d/useViewerControlHotkeyStoreFacade.test.ts src/components/viewer3d/useViewerControlHotkeys.test.ts src/components/viewer3d/viewerControlsViewModel.test.ts src/components/viewer3d/controlButtonPolicy.test.ts` (17 tests)
- `npx eslint src/components/viewer3d/useViewerToolModalState.ts src/components/viewer3d/useViewerToolModalStoreFacade.ts src/components/viewer3d/useViewerToolModalStoreFacade.test.ts src/components/viewer3d/ViewerToolModals.tsx src/components/viewer3d/ViewerToolModals.test.tsx src/components/modals/useImageDetailDeletionActions.ts src/components/modals/useImageDetailDeletionStoreFacade.ts src/components/modals/useImageDetailDeletionStoreFacade.test.ts src/components/modals/imageDetailDeletionViewModel.ts src/components/modals/imageDetailViewModel.test.ts`
- `npx vitest run src/components/viewer3d/useViewerToolModalStoreFacade.test.ts src/components/viewer3d/ViewerToolModals.test.tsx src/components/modals/useImageDetailDeletionStoreFacade.test.ts src/components/modals/imageDetailViewModel.test.ts src/components/modals/deletionModalViewModel.test.ts src/components/modals/useDeletionModalStoreFacade.test.ts src/components/modals/ImageDetailModalFrames.test.tsx` (28 tests)
- `npx eslint src/components/viewer3d/FrustumPlane.tsx src/components/viewer3d/useFrustumPlaneStoreFacade.ts src/components/viewer3d/useFrustumPlaneStoreFacade.test.ts src/components/viewer3d/FrustumPlaneHoverCard.tsx src/components/viewer3d/FrustumPlaneHoverCard.test.tsx src/components/viewer3d/useSelectedFrustumFovWheel.ts src/components/viewer3d/useSelectedFrustumImageFile.ts`
- `npx vitest run src/components/viewer3d/useFrustumPlaneStoreFacade.test.ts src/components/viewer3d/FrustumPlaneHoverCard.test.tsx src/components/viewer3d/frustumPlaneHoverPolicy.test.ts src/components/viewer3d/frustumPlaneClickPolicy.test.ts src/components/viewer3d/frustumPlaneTouchPolicy.test.ts src/components/viewer3d/frustumPlaneSelectionBorderPolicy.test.ts src/components/viewer3d/useFrustumPlaneClickInteractions.test.ts src/components/viewer3d/useFrustumPlaneDisplayTexture.test.ts src/components/viewer3d/useSelectedFrustumImageCacheRefresh.test.ts src/components/viewer3d/useFrustumTextureCachePause.test.ts` (38 tests)
- `npx eslint src/components/viewer3d/BatchedArrowMeshes.tsx src/components/viewer3d/BatchedPlaneHitTargets.tsx src/components/viewer3d/useFrustumHoverCardStoreFacade.ts src/components/viewer3d/useFrustumHoverCardStoreFacade.test.ts src/components/gallery/ImageGalleryItems.tsx src/components/gallery/useImageGalleryItemStoreFacade.ts src/components/gallery/useImageGalleryItemStoreFacade.test.ts`
- `npx vitest run src/components/viewer3d/useFrustumHoverCardStoreFacade.test.ts src/components/gallery/useImageGalleryItemStoreFacade.test.ts src/components/gallery/ImageGalleryItemHoverCard.test.tsx src/components/viewer3d/FrustumPlaneHoverCard.test.tsx src/components/gallery/ImageGalleryVirtualizedContent.test.tsx src/components/viewer3d/batchedPlaneHitTargetPolicy.test.ts src/components/viewer3d/batchedFrustumInteractionPolicy.test.ts` (19 tests)
- `npx eslint src/components/viewer3d/contextMenu/GlobalContextMenu.tsx src/components/viewer3d/contextMenu/useGlobalContextMenuStoreFacade.ts src/components/viewer3d/contextMenu/useGlobalContextMenuStoreFacade.test.ts src/components/viewer3d/contextMenu/useGlobalContextMenuActionDeps.ts src/components/viewer3d/contextMenu/useGlobalContextMenuActionStoreFacade.ts src/components/viewer3d/contextMenu/useGlobalContextMenuActionStoreFacade.test.ts src/components/viewer3d/contextMenu/useGlobalContextMenuActionExecutor.ts src/components/viewer3d/contextMenu/useGlobalContextMenuActionExecutor.test.ts src/components/viewer3d/contextMenu/globalContextMenuActionExecutor.ts src/components/viewer3d/contextMenu/globalContextMenuActionExecutor.test.ts`
- `npx vitest run src/components/viewer3d/contextMenu/useGlobalContextMenuStoreFacade.test.ts src/components/viewer3d/contextMenu/useGlobalContextMenuActionStoreFacade.test.ts src/components/viewer3d/contextMenu/useGlobalContextMenuActionExecutor.test.ts src/components/viewer3d/contextMenu/globalContextMenuActionExecutor.test.ts src/components/viewer3d/contextMenu/globalContextMenuViewModel.test.ts src/components/viewer3d/contextMenu/globalContextMenuActionPolicy.test.ts src/components/viewer3d/contextMenu/globalContextMenuDismissPolicy.test.ts` (33 tests)
- `npx eslint src/components/layout/AppLayout.tsx src/components/layout/useAppLayoutStoreFacade.ts src/components/layout/useAppLayoutStoreFacade.test.ts src/components/layout/StatusBar.tsx src/components/layout/useStatusBarStoreFacade.ts src/components/layout/useStatusBarStoreFacade.test.ts src/components/layout/CacheStatsIndicator.tsx src/components/layout/useCacheStatsIndicatorStoreFacade.ts src/components/layout/useCacheStatsIndicatorStoreFacade.test.ts src/components/layout/TouchStatusBar.tsx src/components/layout/useTouchStatusBarStoreFacade.ts src/components/layout/useTouchStatusBarStoreFacade.test.ts src/components/dropzone/DropZone.tsx src/components/dropzone/useDropZoneStoreFacade.ts src/components/dropzone/useDropZoneStoreFacade.test.ts src/components/dropzone/ProfileSelector.tsx src/components/dropzone/useProfileSelectorStoreFacade.ts src/components/dropzone/useProfileSelectorStoreFacade.test.ts`
- `npx vitest run src/components/layout/useAppLayoutStoreFacade.test.ts src/components/layout/useStatusBarStoreFacade.test.ts src/components/layout/useCacheStatsIndicatorStoreFacade.test.ts src/components/layout/useTouchStatusBarStoreFacade.test.ts src/components/dropzone/useDropZoneStoreFacade.test.ts src/components/dropzone/useProfileSelectorStoreFacade.test.ts src/components/layout/appLayoutPolicy.test.ts src/components/layout/statusBarViewModel.test.ts src/components/layout/cacheStatsIndicatorViewModel.test.ts src/components/dropzone/DropZonePanels.test.tsx src/components/dropzone/dropZoneLoadingViewModel.test.ts src/components/dropzone/dropZoneManifestPolicy.test.ts src/components/dropzone/profileSelectorViewModel.test.ts` (45 tests)
- `npx eslint src/components/database/DataPanel.tsx src/components/database/useDataPanelStoreFacade.ts src/components/database/useDataPanelStoreFacade.test.ts src/components/database/dataPanelViewModel.ts src/components/database/dataPanelViewModel.test.ts src/components/viewer3d/PickingCursor.tsx src/components/viewer3d/usePickingCursorStoreFacade.ts src/components/viewer3d/usePickingCursorStoreFacade.test.ts src/components/viewer3d/pickingCursorViewModel.ts src/components/viewer3d/pickingCursorViewModel.test.ts src/components/viewer3d/panels/GalleryToggleButton.tsx src/components/viewer3d/panels/useGalleryToggleButtonStoreFacade.ts src/components/viewer3d/panels/useGalleryToggleButtonStoreFacade.test.ts src/components/viewer3d/panels/galleryToggleButtonViewModel.ts src/components/viewer3d/panels/galleryToggleButtonViewModel.test.ts src/components/viewer3d/CameraMatches.tsx src/components/viewer3d/useCameraMatchesStoreFacade.ts src/components/viewer3d/useCameraMatchesStoreFacade.test.ts src/components/viewer3d/cameraMatchesViewModel.ts src/components/viewer3d/cameraMatchesViewModel.test.ts src/components/viewer3d/RigConnections.tsx src/components/viewer3d/useRigConnectionsStoreFacade.ts src/components/viewer3d/useRigConnectionsStoreFacade.test.ts src/components/viewer3d/rigConnectionsViewModel.ts src/components/viewer3d/rigConnectionsViewModel.test.ts src/components/ui/MouseTooltip.tsx src/components/ui/useMouseTooltipStoreFacade.ts src/components/ui/useMouseTooltipStoreFacade.test.ts src/components/ui/mouseTooltipPolicy.ts src/components/ui/mouseTooltipPolicy.test.ts`
- `npx vitest run src/components/database/useDataPanelStoreFacade.test.ts src/components/database/dataPanelViewModel.test.ts src/components/viewer3d/usePickingCursorStoreFacade.test.ts src/components/viewer3d/pickingCursorViewModel.test.ts src/components/viewer3d/panels/useGalleryToggleButtonStoreFacade.test.ts src/components/viewer3d/panels/galleryToggleButtonViewModel.test.ts src/components/viewer3d/useCameraMatchesStoreFacade.test.ts src/components/viewer3d/cameraMatchesViewModel.test.ts src/components/viewer3d/useRigConnectionsStoreFacade.test.ts src/components/viewer3d/rigConnectionsViewModel.test.ts src/components/ui/useMouseTooltipStoreFacade.test.ts src/components/ui/mouseTooltipPolicy.test.ts` (38 tests)
- `npx eslint src/components/ui/NotificationContainer.tsx src/components/ui/useNotificationContainerStoreFacade.ts src/components/ui/useNotificationContainerStoreFacade.test.ts src/components/ui/NotificationToast.tsx src/components/ui/notificationToastPolicy.ts src/components/ui/notificationToastPolicy.test.ts src/components/viewer3d/FpsTracker.tsx src/components/viewer3d/useFpsTrackerStoreFacade.ts src/components/viewer3d/useFpsTrackerStoreFacade.test.ts src/components/viewer3d/fpsTrackerViewModel.ts src/components/viewer3d/fpsTrackerViewModel.test.ts src/components/viewer3d/FooterBranding.tsx src/components/viewer3d/useFooterBrandingStoreFacade.ts src/components/viewer3d/useFooterBrandingStoreFacade.test.ts src/components/viewer3d/footerBrandingViewModel.ts src/components/viewer3d/footerBrandingViewModel.test.ts src/components/viewer3d/ControlComponents.tsx src/components/viewer3d/useControlButtonStoreFacade.ts src/components/viewer3d/useControlButtonStoreFacade.test.ts src/components/viewer3d/controlButtonPolicy.ts src/components/viewer3d/controlButtonPolicy.test.ts`
- `npx vitest run src/components/ui/useNotificationContainerStoreFacade.test.ts src/components/ui/notificationToastPolicy.test.ts src/components/viewer3d/useFpsTrackerStoreFacade.test.ts src/components/viewer3d/fpsTrackerViewModel.test.ts src/components/viewer3d/useFooterBrandingStoreFacade.test.ts src/components/viewer3d/footerBrandingViewModel.test.ts src/components/viewer3d/useControlButtonStoreFacade.test.ts src/components/viewer3d/controlButtonPolicy.test.ts` (24 tests)
- `npx eslint src/components/viewer3d/CameraFrustums.tsx src/components/viewer3d/useCameraFrustumsStoreFacade.ts src/components/viewer3d/useCameraFrustumsStoreFacade.test.ts src/components/viewer3d/useCameraFrustumNavigationHandlers.ts src/components/viewer3d/cameraFrustumViewModel.ts src/components/viewer3d/cameraFrustumViewModel.test.ts`
- `npx vitest run src/components/viewer3d/useCameraFrustumsStoreFacade.test.ts src/components/viewer3d/cameraFrustumViewModel.test.ts src/components/viewer3d/useCameraFrustumNavigationHandlers.test.ts src/components/viewer3d/CameraFrustumPlaneLayer.test.ts` (16 tests)
- `npx eslint src/components/viewer3d/PointCloud/PointCloud.tsx src/components/viewer3d/PointCloud/usePointCloudStoreFacade.ts src/components/viewer3d/PointCloud/usePointCloudStoreFacade.test.ts src/hooks/pointCloud/usePointCloudData.ts src/hooks/pointCloud/usePointPicking.ts`
- `npx vitest run src/components/viewer3d/PointCloud/usePointCloudStoreFacade.test.ts src/hooks/pointCloud/pointCloudDataPolicy.test.ts src/hooks/pointCloud/pointCloudMapData.test.ts src/hooks/pointCloud/pointCloudWasmData.test.ts src/hooks/pointCloud/pointCloudSelectionOverlay.test.ts` (19 tests)
- `npx eslint src/components/viewer3d/SelectedPointMarkers.tsx src/components/viewer3d/useSelectedPointMarkersStoreFacade.ts src/components/viewer3d/useSelectedPointMarkersStoreFacade.test.ts src/components/viewer3d/selectedPointMarkersViewModel.ts src/components/viewer3d/selectedPointMarkersViewModel.test.ts`
- `npx vitest run src/components/viewer3d/useSelectedPointMarkersStoreFacade.test.ts src/components/viewer3d/selectedPointMarkersViewModel.test.ts src/store/stores/pointPickingStore.test.ts src/store/pointPickingPolicy.test.ts` (18 tests)
- `npx eslint src/components/viewer3d/TransformGizmo.tsx src/components/viewer3d/useTransformGizmoStoreFacade.ts src/components/viewer3d/useTransformGizmoStoreFacade.test.ts src/components/viewer3d/transformGizmoContextMenuExecutor.ts src/components/viewer3d/transformGizmoContextMenuExecutor.test.ts src/components/viewer3d/transformGizmoDragPolicy.ts src/components/viewer3d/transformGizmoDragPolicy.test.ts`
- `npx vitest run src/components/viewer3d/useTransformGizmoStoreFacade.test.ts src/components/viewer3d/transformGizmoContextMenuExecutor.test.ts src/components/viewer3d/transformGizmoDragPolicy.test.ts` (14 tests)
- `npm run typecheck`
- `rg -n "use(Reconstruction|Camera|UI|Deletion)Store|use(Cameras|Selection|Matches|Navigation)Node|use(Is)?AlignmentMode|useDataset" src/components/viewer3d/CameraFrustums.tsx`
- `rg -n "use(Reconstruction|PointPicking|Deletion|FloorPlane)Store|use(Points|Selection)Node" src/components/viewer3d/PointCloud/PointCloud.tsx`
- `rg -n "use(PointPicking|PointCloud|UI)Store|getDefaultUpAxis" src/components/viewer3d/SelectedPointMarkers.tsx`
- `rg -n "use(Transform|Reconstruction|UI)Store|useFileDropzone" src/components/viewer3d/TransformGizmo.tsx`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src/components/viewer3d/CameraFrustums.tsx src/components/viewer3d/useCameraFrustumsStoreFacade.ts src/components/viewer3d/useCameraFrustumsStoreFacade.test.ts`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src/components/viewer3d/PointCloud/PointCloud.tsx src/components/viewer3d/PointCloud/usePointCloudStoreFacade.ts src/components/viewer3d/PointCloud/usePointCloudStoreFacade.test.ts`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src/components/viewer3d/SelectedPointMarkers.tsx src/components/viewer3d/useSelectedPointMarkersStoreFacade.ts src/components/viewer3d/useSelectedPointMarkersStoreFacade.test.ts src/components/viewer3d/TransformGizmo.tsx src/components/viewer3d/useTransformGizmoStoreFacade.ts src/components/viewer3d/useTransformGizmoStoreFacade.test.ts`
- `npx eslint src/App.tsx src/appStartupPolicy.ts src/appStartupPolicy.test.ts`
- `npx vitest run src/appStartupPolicy.test.ts` (8 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src/App.tsx src/appStartupPolicy.ts src/appStartupPolicy.test.ts`
- `npx eslint src/utils/shareDataCodec.ts src/utils/shareDataCodec.test.ts`
- `npx vitest run src/utils/shareDataCodec.test.ts src/appStartupPolicy.test.ts` (14 tests)
- `npx eslint src/config/configuration/converter.ts src/config/configuration/serializer.ts src/config/configuration/serializer.test.ts`
- `npx vitest run src/config/configuration/serializer.test.ts src/config/configuration/fileImport.test.ts src/config/registry/registry.test.ts` (22 tests)
- `npx eslint src/config/registry/types.ts src/config/registry/generators/schema.ts src/config/registry/generators/schema.test.ts`
- `npx vitest run src/config/registry/generators/schema.test.ts src/config/registry/registry.test.ts src/config/configuration/serializer.test.ts` (23 tests)
- `npx eslint src/test/builders/colmapBuilders.ts src/test/builders/builders.test.ts src/hooks/fileDropzoneColmapParser.test.ts`
- `npx vitest run src/test/builders/builders.test.ts src/hooks/fileDropzoneColmapParser.test.ts` (13 tests)
- `npx eslint src/store/persistedStoreMigrations.ts src/store/persistedStoreMigrations.test.ts src/store/stores/cameraStore.ts src/store/stores/uiStore.ts src/store/stores/rigStore.ts`
- `npx vitest run src/store/persistedStoreMigrations.test.ts` (10 tests)
- `npx vitest run src/store/persistedStoreMigrations.test.ts src/store/stores/pointPickingStore.test.ts src/store/actions/sessionActions.test.ts src/config/configuration/serializer.test.ts` (22 tests)
- `npx eslint src/config/registry/generators/adapter.ts src/config/registry/generators/adapter.test.ts`
- `npx vitest run src/config/registry/generators/adapter.test.ts src/config/registry/registry.test.ts src/config/configuration/serializer.test.ts` (22 tests)
- `npx eslint src/store/persistedStoreMigrations.ts src/store/persistedStoreMigrations.test.ts src/store/stores/pointCloudStore.ts`
- `npx vitest run src/store/persistedStoreMigrations.test.ts src/store/stores/pointPickingStore.test.ts src/config/registry/generators/adapter.test.ts` (17 tests)
- `npx eslint src/hooks/urlLoaderErrorHandling.ts src/hooks/urlLoaderErrorHandling.test.ts src/hooks/urlLoaderManifestFetch.ts src/hooks/urlLoaderManifestFetch.test.ts`
- `npx vitest run src/hooks/urlLoaderErrorHandling.test.ts src/hooks/urlLoaderManifestFetch.test.ts src/hooks/urlLoaderPolicy.test.ts` (22 tests)
- `npx eslint src/hooks/fileDropzoneRigData.test.ts src/hooks/fileDropzoneLocalSources.test.ts src/hooks/fileDropzoneReconstruction.test.ts`
- `npx vitest run src/hooks/fileDropzoneRigData.test.ts src/hooks/fileDropzoneLocalSources.test.ts src/hooks/fileDropzoneReconstruction.test.ts src/test/builders/builders.test.ts` (28 tests)
- `npm run check` (286 files, 1668 tests, production build)
- `npx eslint src/hooks/frustumTextureCache.test.ts src/hooks/frustumTextureResources.test.ts src/hooks/selectedImageTextureCache.test.ts src/hooks/useFrustumTexture.test.ts`
- `npx vitest run src/hooks/frustumTextureCache.test.ts src/hooks/frustumTextureResources.test.ts src/hooks/selectedImageTextureCache.test.ts src/hooks/useFrustumTexture.test.ts src/test/builders/builders.test.ts` (33 tests)
- `npx eslint src/components/viewer3d/controlRows/BasicRows.tsx src/components/viewer3d/controlRows/basicRowsPolicy.ts src/components/viewer3d/controlRows/basicRowsPolicy.test.ts src/components/viewer3d/panels/AxesGridPanel.tsx src/components/viewer3d/panels/CameraDisplayPanel.tsx src/components/viewer3d/panels/CameraModePanel.tsx src/components/viewer3d/panels/MatchesPanel.tsx src/components/viewer3d/panels/PointCloudPanel.tsx src/components/viewer3d/panels/RigPanel.tsx src/components/viewer3d/panels/ScreenshotPanel.tsx src/components/viewer3d/panels/SelectionHighlightPanel.tsx src/components/viewer3d/panels/ExportPanelSections.tsx src/components/modals/FloorDetectionModal.tsx src/components/gallery/ImageGalleryToolbar.tsx src/components/gallery/imageGalleryToolbarViewModel.ts src/components/gallery/imageGalleryToolbarViewModel.test.ts`
- `npx vitest run src/components/viewer3d/controlRows/basicRowsPolicy.test.ts src/components/viewer3d/panels/axesGridPanelViewModel.test.ts src/components/viewer3d/panels/cameraDisplayPanelViewModel.test.ts src/components/viewer3d/panels/cameraModePanelViewModel.test.ts src/components/viewer3d/panels/matchesPanelViewModel.test.ts src/components/viewer3d/panels/pointCloudPanelViewModel.test.ts src/components/viewer3d/panels/rigPanelViewModel.test.ts src/components/viewer3d/panels/screenshotPanelRecording.test.ts src/components/viewer3d/panels/selectionHighlightPanelViewModel.test.ts src/components/viewer3d/panels/ExportPanelSections.test.tsx src/components/gallery/ImageGalleryToolbar.test.tsx src/components/gallery/imageGalleryToolbarViewModel.test.ts src/components/modals/floorPlaneAlignmentPolicy.test.ts` (66 tests)
- `npx eslint src/utils/cameraModelPolicy.ts src/utils/cameraModelPolicy.test.ts src/parsers/cameras.ts src/parsers/cameras.test.ts src/parsers/wasmParser.ts src/parsers/wasmParser.test.ts`
- `npx vitest run src/utils/cameraModelPolicy.test.ts src/parsers/cameras.test.ts src/parsers/wasmParser.test.ts src/parsers/colmapBinaryWriters.test.ts` (26 tests)
- `npx eslint src/utils/sensorTypePolicy.ts src/utils/sensorTypePolicy.test.ts src/parsers/frames.ts src/parsers/frames.test.ts src/parsers/rigs.ts src/parsers/rigs.test.ts src/parsers/wasmParser.ts src/parsers/wasmParser.test.ts`
- `npx vitest run src/utils/sensorTypePolicy.test.ts src/parsers/rigs.test.ts src/parsers/frames.test.ts src/parsers/wasmParser.test.ts src/parsers/rig_integrity.test.ts` (20 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `git diff --check`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `rg -n "readInt32\(\) as SensorType|parseInt\([^\r\n]+\) as SensorType|\.type as SensorType" src/parsers src/utils`
- `npm run check` (289 files, 1682 tests, production build)
- `npx eslint src/components/modals/cameraConversionModalViewModel.ts src/components/modals/cameraConversionModalViewModel.test.ts src/utils/cameraModelPolicy.ts src/utils/cameraModelPolicy.test.ts`
- `npx vitest run src/components/modals/cameraConversionModalViewModel.test.ts src/utils/cameraModelPolicy.test.ts` (15 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "Number\.parseInt\([^\r\n]+\) as CameraModelId|parseInt\([^\r\n]+\) as CameraModelId|as CameraModelId" src --glob "!**/*.test.ts" --glob "!**/*.test.tsx"`
- `npx eslint src/hooks/profilesStorage.ts src/hooks/profilesStorage.test.ts src/hooks/useProfiles.ts src/store/profileTypes.ts`
- `npx vitest run src/hooks/profilesStorage.test.ts src/config/configuration/serializer.test.ts src/config/registry/generators/schema.test.ts` (15 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "JSON\.parse|localStorage|getItem\(" src/hooks/useProfiles.ts src/hooks/profilesStorage.ts src/hooks/profilesStorage.test.ts src/store/profileTypes.ts`
- `npx eslint src/store/migration.ts src/store/migration.test.ts`
- `npx vitest run src/store/migration.test.ts src/store/persistedStoreMigrations.test.ts` (20 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "JSON\.parse|parsed\.state|as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src/store/migration.ts src/store/migration.test.ts src/store/persistedStoreMigrations.ts`
- `npx eslint src/parsers/zipExportPolicy.ts src/parsers/zipExportPolicy.test.ts src/parsers/reconstructionZipExport.ts src/parsers/reconstructionZipExport.test.ts src/parsers/imageZipExport.ts src/parsers/imageZipExport.test.ts src/parsers/maskZipExport.ts src/parsers/maskZipExport.test.ts`
- `npx vitest run src/parsers/zipExportPolicy.test.ts src/parsers/reconstructionZipExport.test.ts src/parsers/imageZipExport.test.ts src/parsers/maskZipExport.test.ts` (16 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable|zipped as BlobPart|as ZipCompressionLevel" src/parsers/zipExportPolicy.ts src/parsers/reconstructionZipExport.ts src/parsers/imageZipExport.ts src/parsers/maskZipExport.ts`
- `npm run check` (292 files, 1699 tests, production build)
- `git diff --check`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `npx eslint src/components/gallery/ImageGalleryToolbar.tsx src/components/gallery/ImageGalleryToolbar.test.tsx src/components/gallery/imageGalleryToolbarViewModel.ts src/components/gallery/imageGalleryToolbarViewModel.test.ts`
- `npx vitest run src/components/gallery/ImageGalleryToolbar.test.tsx src/components/gallery/imageGalleryToolbarViewModel.test.ts` (7 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "parseInt\(|Number\.parseInt\(|as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src/components/gallery/ImageGalleryToolbar.tsx src/components/gallery/imageGalleryToolbarViewModel.ts src/components/gallery/ImageGalleryToolbar.test.tsx src/components/gallery/imageGalleryToolbarViewModel.test.ts`
- `npx eslint src/components/viewer3d/controlRows/ColorRows.tsx src/components/viewer3d/controlRows/colorRowsPolicy.ts src/components/viewer3d/controlRows/colorRowsPolicy.test.ts`
- `npx vitest run src/components/viewer3d/controlRows/colorRowsPolicy.test.ts` (7 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "parseInt\(|Number\.parseInt\(|as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src/components/viewer3d/controlRows/ColorRows.tsx src/components/viewer3d/controlRows/colorRowsPolicy.ts src/components/viewer3d/controlRows/colorRowsPolicy.test.ts`
- `npx eslint src/utils/numberParsing.ts src/utils/numberParsing.test.ts src/components/gallery/ImageGalleryToolbar.tsx src/components/gallery/imageGalleryToolbarViewModel.ts src/components/gallery/imageGalleryToolbarViewModel.test.ts src/components/viewer3d/controlRows/ColorRows.tsx src/components/viewer3d/controlRows/colorRowsPolicy.ts src/components/viewer3d/controlRows/colorRowsPolicy.test.ts src/components/modals/CameraConversionModal.tsx src/components/modals/cameraConversionModalViewModel.ts src/components/modals/cameraConversionModalViewModel.test.ts src/components/modals/imageDetailControlsViewModel.ts src/components/modals/imageDetailControlsViewModel.test.ts`
- `npx vitest run src/utils/numberParsing.test.ts src/components/gallery/ImageGalleryToolbar.test.tsx src/components/gallery/imageGalleryToolbarViewModel.test.ts src/components/viewer3d/controlRows/colorRowsPolicy.test.ts src/components/modals/cameraConversionModalViewModel.test.ts src/components/modals/imageDetailControlsViewModel.test.ts` (37 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "parseInt\(|Number\.parseInt\(|as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src/utils/numberParsing.ts src/components/gallery/ImageGalleryToolbar.tsx src/components/gallery/imageGalleryToolbarViewModel.ts src/components/viewer3d/controlRows/ColorRows.tsx src/components/viewer3d/controlRows/colorRowsPolicy.ts src/components/modals/CameraConversionModal.tsx src/components/modals/cameraConversionModalViewModel.ts src/components/modals/imageDetailControlsViewModel.ts`
- `npx eslint src/utils/numberParsing.ts src/utils/numberParsing.test.ts src/utils/zipDownload.ts src/utils/zipDownload.test.ts src/utils/zipValidation.ts src/utils/zipValidation.test.ts`
- `npx vitest run src/utils/numberParsing.test.ts src/utils/zipDownload.test.ts src/utils/zipValidation.test.ts` (14 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "parseInt\(|Number\.parseInt\(|as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src/utils/numberParsing.ts src/utils/zipDownload.ts src/utils/zipValidation.ts src/utils/zipDownload.test.ts src/utils/zipValidation.test.ts`
- `npm run check` (293 files, 1706 tests, production build)
- `git diff --check -- docs/dx-implementation-validation-plan.md src/utils/numberParsing.ts src/utils/numberParsing.test.ts src/utils/zipDownload.ts src/utils/zipDownload.test.ts src/utils/zipValidation.ts src/utils/zipValidation.test.ts src/components/gallery/ImageGalleryToolbar.tsx src/components/gallery/ImageGalleryToolbar.test.tsx src/components/gallery/imageGalleryToolbarViewModel.ts src/components/gallery/imageGalleryToolbarViewModel.test.ts src/components/viewer3d/controlRows/ColorRows.tsx src/components/viewer3d/controlRows/colorRowsPolicy.ts src/components/viewer3d/controlRows/colorRowsPolicy.test.ts src/components/modals/CameraConversionModal.tsx src/components/modals/cameraConversionModalViewModel.ts src/components/modals/cameraConversionModalViewModel.test.ts src/components/modals/imageDetailControlsViewModel.ts src/components/modals/imageDetailControlsViewModel.test.ts`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `rg -n "parseInt\(|Number\.parseInt\(" src/components src/hooks src/store src/utils src/theme`
- `npx eslint src/parsers/colmapTextTokens.ts src/parsers/colmapTextTokens.test.ts src/parsers/cameras.ts src/parsers/cameras.test.ts src/parsers/images.ts src/parsers/images.test.ts src/parsers/points3d.ts src/parsers/points3d.test.ts src/parsers/frames.ts src/parsers/frames.test.ts src/parsers/rigs.ts src/parsers/rigs.test.ts src/utils/numberParsing.ts`
- `npx vitest run src/parsers/colmapTextTokens.test.ts src/parsers/cameras.test.ts src/parsers/images.test.ts src/parsers/points3d.test.ts src/parsers/frames.test.ts src/parsers/rigs.test.ts src/parsers/rig_integrity.test.ts src/utils/numberParsing.test.ts` (62 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(|as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src/parsers/colmapTextTokens.ts src/parsers/cameras.ts src/parsers/images.ts src/parsers/points3d.ts src/parsers/frames.ts src/parsers/rigs.ts src/parsers/colmapTextTokens.test.ts src/parsers/cameras.test.ts src/parsers/images.test.ts src/parsers/points3d.test.ts src/parsers/frames.test.ts src/parsers/rigs.test.ts`
- `npx eslint src/utils/numberParsing.ts src/utils/numberParsing.test.ts src/components/viewer3d/controlRows/SliderRow.tsx src/components/viewer3d/controlRows/sliderRowPolicy.ts src/components/viewer3d/controlRows/sliderRowPolicy.test.ts src/components/modals/distanceInputModalViewModel.ts src/components/modals/distanceInputModalViewModel.test.ts src/components/modals/imageDetailOpacityViewModel.ts src/components/modals/imageDetailControlsViewModel.ts src/components/modals/ImageDetailMatchOpacityControl.tsx src/components/modals/imageDetailControlsViewModel.test.ts src/components/modals/imageDetailViewModel.test.ts src/utils/urlCameraStateCodec.ts src/utils/urlCameraStateCodec.test.ts`
- `npx vitest run src/utils/numberParsing.test.ts src/components/viewer3d/controlRows/sliderRowPolicy.test.ts src/components/modals/distanceInputModalViewModel.test.ts src/components/modals/imageDetailControlsViewModel.test.ts src/components/modals/imageDetailViewModel.test.ts src/components/modals/ImageDetailMatchOpacityControl.test.tsx src/utils/urlCameraStateCodec.test.ts` (50 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(|as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src/utils/numberParsing.ts src/components/viewer3d/controlRows/SliderRow.tsx src/components/viewer3d/controlRows/sliderRowPolicy.ts src/components/modals/distanceInputModalViewModel.ts src/components/modals/imageDetailOpacityViewModel.ts src/components/modals/imageDetailControlsViewModel.ts src/components/modals/ImageDetailMatchOpacityControl.tsx src/utils/urlCameraStateCodec.ts`
- `npx eslint src/components/viewer3d/CameraFrustums.tsx src/components/viewer3d/cameraFrustumViewModel.ts src/components/viewer3d/cameraFrustumViewModel.test.ts`
- `npx vitest run src/components/viewer3d/cameraFrustumViewModel.test.ts` (7 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(|as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src/components/viewer3d/CameraFrustums.tsx src/components/viewer3d/cameraFrustumViewModel.ts src/components/viewer3d/cameraFrustumViewModel.test.ts`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme` (pre-hex-color cleanup: remaining hits were radix-16 color parsing)
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- <current-slice touched files>` (line-ending warnings only)
- `npm run check` (294 files, 1723 tests, production build)
- `npx eslint src/utils/hexColor.ts src/utils/hexColor.test.ts src/theme/colors.ts src/utils/colorUtils.ts src/utils/colorUtils.test.ts src/components/viewer3d/controlRows/colorRowsPolicy.ts src/components/viewer3d/controlRows/colorRowsPolicy.test.ts src/config/registry/definitions/ui.ts src/config/registry/definitions/camera.ts src/config/registry/definitions/rig.ts src/config/registry/generators/schema.test.ts`
- `npx vitest run src/utils/hexColor.test.ts src/utils/colorUtils.test.ts src/components/viewer3d/controlRows/colorRowsPolicy.test.ts src/config/registry/generators/schema.test.ts src/config/registry/registry.test.ts src/config/configuration/serializer.test.ts` (51 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/utils/hexColor.ts src/utils/hexColor.test.ts src/theme/colors.ts src/utils/colorUtils.ts src/utils/colorUtils.test.ts src/components/viewer3d/controlRows/colorRowsPolicy.ts src/components/viewer3d/controlRows/colorRowsPolicy.test.ts src/config/registry/definitions/ui.ts src/config/registry/definitions/camera.ts src/config/registry/definitions/rig.ts src/config/registry/generators/schema.test.ts` (line-ending warnings only)
- `npm run check` (295 files, 1730 tests, production build)
- `npx eslint src/utils/manifestValidation.ts src/utils/manifestValidation.test.ts src/components/dropzone/dropZoneManifestPolicy.ts src/components/dropzone/dropZoneManifestPolicy.test.ts src/hooks/urlLoaderManifestFetch.ts src/hooks/urlLoaderManifestFetch.test.ts src/utils/shareDataCodec.ts src/utils/shareDataCodec.test.ts`
- `npx vitest run src/utils/manifestValidation.test.ts src/components/dropzone/dropZoneManifestPolicy.test.ts src/hooks/urlLoaderManifestFetch.test.ts src/utils/shareDataCodec.test.ts src/hooks/urlLoaderErrorHandling.test.ts` (25 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "ColmapManifestSchema\.safeParse|formatManifestValidationIssues|validateColmapManifest" src`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/utils/manifestValidation.ts src/utils/manifestValidation.test.ts src/components/dropzone/dropZoneManifestPolicy.ts src/components/dropzone/dropZoneManifestPolicy.test.ts src/hooks/urlLoaderManifestFetch.ts src/hooks/urlLoaderManifestFetch.test.ts src/utils/shareDataCodec.ts src/utils/shareDataCodec.test.ts`
- `npm run check` (296 files, 1733 tests, production build)
- `npx eslint src/utils/zipLoader.ts src/utils/zipImageFiles.ts src/utils/zipArchiveState.ts src/utils/zipImageFiles.test.ts src/utils/zipArchiveState.test.ts src/hooks/fileDropzoneLocalSources.test.ts src/hooks/urlLoaderZipSource.test.ts`
- `npx vitest run src/utils/zipImageFiles.test.ts src/utils/zipArchiveState.test.ts src/hooks/fileDropzoneLocalSources.test.ts src/hooks/urlLoaderZipSource.test.ts src/utils/imageFileUtils.test.ts` (30 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "\bas\s+ArchiveEntry|extract:\s*\(\)\s*=>\s*Promise<File>" src/utils src/hooks src/components src/store`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/utils/zipLoader.ts src/utils/zipImageFiles.ts` (line-ending warnings only)
- `npm run check` (296 files, 1733 tests, production build)
- `npx eslint src/utils/fileScanning.ts src/utils/fileScanning.test.ts src/test/builders/fileFakes.ts src/test/builders/builders.test.ts src/hooks/fileDropzoneDropPayload.test.ts src/hooks/fileDropzoneLocalSources.test.ts`
- `npx vitest run src/utils/fileScanning.test.ts src/test/builders/builders.test.ts src/hooks/fileDropzoneDropPayload.test.ts src/hooks/fileDropzoneLocalSources.test.ts` (28 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "as FileSystem(File|Directory)(Entry|Handle)|\bas\s+FileSystem" src/utils/fileScanning.ts src/utils src/hooks src/components src/store`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/utils/fileScanning.ts`
- `npm run check` (296 files, 1733 tests, production build)
- `npx eslint src/components/ui/mouseTooltipPolicy.ts src/components/ui/mouseTooltipPolicy.test.ts src/components/ui/MouseTooltip.tsx`
- `npx vitest run src/components/ui/mouseTooltipPolicy.test.ts` (6 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "marker:\s*match\[1\]\s+as|as MouseTooltipIconMarker" src/components/ui/mouseTooltipPolicy.ts src/components/ui`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/components/ui/mouseTooltipPolicy.ts`
- `npm run check` (296 files, 1733 tests, production build)
- `npx eslint src/utils/coordinateSystems.ts src/utils/coordinateSystems.test.ts src/components/modals/floorPlaneAlignmentPolicy.ts src/components/modals/floorPlaneAlignmentPolicy.test.ts src/components/modals/distanceInputModalViewModel.ts src/components/modals/distanceInputModalViewModel.test.ts src/store/stores/floorPlaneStore.ts src/store/stores/pointPickingStore.ts src/store/stores/pointPickingStore.test.ts`
- `npx vitest run src/utils/coordinateSystems.test.ts src/components/modals/floorPlaneAlignmentPolicy.test.ts src/components/modals/distanceInputModalViewModel.test.ts src/store/stores/pointPickingStore.test.ts` (17 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "toLowerCase\(\) as|as TargetAxis|as FloorTargetAxis|as FloorColorMode" src/components/modals src/store/stores src/utils/coordinateSystems.ts`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/utils/coordinateSystems.ts src/utils/coordinateSystems.test.ts src/components/modals/floorPlaneAlignmentPolicy.ts src/components/modals/distanceInputModalViewModel.ts src/store/stores/floorPlaneStore.ts src/store/stores/pointPickingStore.ts` (line-ending warnings only)
- `npm run check` (297 files, 1736 tests, production build)
- `npx eslint src/hooks/selectedImageTextureCache.ts src/hooks/selectedImageTextureCache.test.ts src/hooks/useFrustumTexture.ts src/hooks/useFrustumTexture.test.ts`
- `npx vitest run src/hooks/selectedImageTextureCache.test.ts src/hooks/useFrustumTexture.test.ts src/hooks/frustumTextureCache.test.ts src/hooks/frustumTextureResources.test.ts` (23 tests)
- `rg -n "SelectedImageTextureWithBitmap|_bitmap|as SelectedImageTexture" src/hooks src/components src/test`
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/hooks/selectedImageTextureCache.ts src/hooks/selectedImageTextureCache.test.ts`
- `npm run check` (297 files, 1736 tests, production build)
- `npx eslint src/utils/canvasTypeGuards.ts src/utils/canvasTypeGuards.test.ts src/hooks/asyncImageCanvas.ts src/hooks/asyncImageCanvas.test.ts src/utils/imageFileCompression.ts src/utils/imageFileCompression.test.ts src/hooks/useFrustumTexture.ts src/hooks/useFrustumTexture.test.ts src/hooks/useThumbnail.ts src/components/viewer3d/ScreenshotCapture.tsx src/components/viewer3d/screenshotRecordingFrameTicks.ts src/components/viewer3d/screenshotRecordingFrameTicks.test.ts src/components/viewer3d/screenshotWebCodecsStart.ts src/components/viewer3d/screenshotWebCodecsStart.test.ts src/components/viewer3d/screenshotWebCodecsFinish.ts src/components/viewer3d/screenshotWebCodecsFinish.test.ts`
- `npx vitest run src/utils/canvasTypeGuards.test.ts src/hooks/asyncImageCanvas.test.ts src/utils/imageFileCompression.test.ts src/hooks/useFrustumTexture.test.ts src/hooks/frustumTextureCache.test.ts src/hooks/frustumTextureResources.test.ts src/components/gallery/useImageGalleryThumbnailSettling.test.ts src/components/gallery/useImageGalleryScrollSettle.test.ts src/components/viewer3d/screenshotRecordingFrameTicks.test.ts src/components/viewer3d/screenshotWebCodecsStart.test.ts src/components/viewer3d/screenshotWebCodecsFinish.test.ts` (50 tests)
- `rg -n "as HTMLCanvasElement|instanceof OffscreenCanvas|function isOffscreenCanvas" src/hooks/asyncImageCanvas.ts src/utils/imageFileCompression.ts src/hooks/useFrustumTexture.ts src/hooks/useThumbnail.ts src/components/viewer3d/screenshotRecordingFrameTicks.ts src/components/viewer3d/screenshotWebCodecsStart.ts src/components/viewer3d/screenshotWebCodecsFinish.ts src/components/viewer3d/ScreenshotCapture.tsx`
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/utils/canvasTypeGuards.ts src/utils/canvasTypeGuards.test.ts src/hooks/asyncImageCanvas.ts src/utils/imageFileCompression.ts src/hooks/useFrustumTexture.ts src/hooks/useThumbnail.ts src/components/viewer3d/ScreenshotCapture.tsx src/components/viewer3d/screenshotRecordingFrameTicks.ts src/components/viewer3d/screenshotRecordingFrameTicks.test.ts src/components/viewer3d/screenshotWebCodecsStart.ts src/components/viewer3d/screenshotWebCodecsStart.test.ts src/components/viewer3d/screenshotWebCodecsFinish.ts src/components/viewer3d/screenshotWebCodecsFinish.test.ts` (line-ending warnings only)
- `npm run check` (298 files, 1739 tests, production build)
- `npx eslint src/components/gallery/useImageGalleryViewModel.ts src/components/gallery/useImageGalleryViewModel.test.ts src/components/gallery/useImageGalleryVisibleImageFetch.ts src/components/gallery/useImageGalleryVisibleImageFetch.test.ts src/components/viewer3d/ScreenshotCapture.tsx src/components/viewer3d/screenshotGifRecordingStart.ts src/components/viewer3d/screenshotGifRecordingStart.test.ts src/components/viewer3d/screenshotMediaRecorderStart.ts src/components/viewer3d/screenshotMediaRecorderStart.test.ts src/components/viewer3d/screenshotWebCodecsStart.ts src/components/viewer3d/screenshotWebCodecsStart.test.ts`
- `npx vitest run src/components/gallery/useImageGalleryViewModel.test.ts src/components/gallery/useImageGalleryVisibleImageFetch.test.ts src/components/gallery/imageGalleryDataViewModel.test.ts src/components/gallery/imageGalleryFetchPolicy.test.ts src/components/viewer3d/screenshotGifRecordingStart.test.ts src/components/viewer3d/screenshotMediaRecorderStart.test.ts src/components/viewer3d/screenshotWebCodecsStart.test.ts src/components/viewer3d/screenshotRecordingPolicy.test.ts` (36 tests)
- `rg -n "as DatasetManager|type DatasetManager|recordingQuality\) as RecordingQuality|as RecordingQuality" src/components/gallery src/components/viewer3d src/hooks src/store`
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/components/gallery/useImageGalleryViewModel.ts src/components/viewer3d/ScreenshotCapture.tsx` (line-ending warning only)
- `npm run check` (298 files, 1739 tests, production build)
- `npx eslint src/components/viewer3d/FrustumPlaneSelectionBorder.tsx src/components/viewer3d/frustumPlaneSelectionBorderPolicy.ts src/components/viewer3d/frustumPlaneSelectionBorderPolicy.test.ts src/components/viewer3d/threeMaterialMutations.ts src/components/viewer3d/threeMaterialMutations.test.ts`
- `npx vitest run src/components/viewer3d/threeMaterialMutations.test.ts src/components/viewer3d/frustumPlaneSelectionBorderPolicy.test.ts` (7 tests)
- `rg -n "as THREE\.Material|as THREE\.LineBasicMaterial" src/components/viewer3d/FrustumPlaneSelectionBorder.tsx src/components/viewer3d src/hooks src/utils`
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/components/viewer3d/FrustumPlaneSelectionBorder.tsx src/components/viewer3d/threeMaterialMutations.ts src/components/viewer3d/threeMaterialMutations.test.ts`
- `npm run check` (298 files, 1740 tests, production build)
- `npx eslint src/components/viewer3d/threeBufferAttributes.ts src/components/viewer3d/threeBufferAttributes.test.ts src/components/viewer3d/BatchedFrustumLines.tsx src/components/viewer3d/RigConnections.tsx`
- `npx vitest run src/components/viewer3d/threeBufferAttributes.test.ts src/components/viewer3d/cameraFrustumStylePolicy.test.ts src/components/viewer3d/rigConnectionsViewModel.test.ts` (16 tests)
- `rg -n "as THREE\.BufferAttribute|as Float32Array" src/components/viewer3d/BatchedFrustumLines.tsx src/components/viewer3d/RigConnections.tsx src/components/viewer3d/threeBufferAttributes.ts`
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/components/viewer3d/BatchedFrustumLines.tsx src/components/viewer3d/RigConnections.tsx src/components/viewer3d/threeBufferAttributes.ts src/components/viewer3d/threeBufferAttributes.test.ts` (line-ending warning only)
- `npm run check` (299 files, 1742 tests, production build)
- `npx eslint src/utils/domTargetGuards.ts src/utils/domTargetGuards.test.ts src/hooks/clickOutsidePolicy.ts src/hooks/clickOutsidePolicy.test.ts src/components/dropzone/DropZone.tsx src/components/viewer3d/ControlComponents.tsx`
- `npx vitest run src/utils/domTargetGuards.test.ts src/hooks/clickOutsidePolicy.test.ts src/components/dropzone/DropZonePanels.test.tsx src/components/viewer3d/controlButtonPolicy.test.ts` (18 tests)
- `rg -n "as Node" src/components/dropzone/DropZone.tsx src/components/viewer3d/ControlComponents.tsx src/hooks/clickOutsidePolicy.ts src/utils/domTargetGuards.ts`
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/utils/domTargetGuards.ts src/utils/domTargetGuards.test.ts src/hooks/clickOutsidePolicy.ts src/components/dropzone/DropZone.tsx src/components/viewer3d/ControlComponents.tsx` (line-ending warnings only)
- `npm run check` (300 files, 1745 tests, production build)
- `npx eslint src/utils/capturedPointerDrag.ts src/utils/capturedPointerDrag.test.ts src/hooks/useModalDrag.ts src/hooks/useModalDrag.test.ts src/components/modals/useImageDetailModalLayout.ts src/components/modals/useImageDetailModalLayout.test.ts`
- `npx vitest run src/utils/capturedPointerDrag.test.ts src/hooks/useModalDrag.test.ts src/components/modals/useImageDetailModalLayout.test.ts` (14 tests)
- `rg -n "as HTMLElement" src/hooks/useModalDrag.ts src/components/modals/useImageDetailModalLayout.ts src/utils/capturedPointerDrag.ts`
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/utils/capturedPointerDrag.ts src/utils/capturedPointerDrag.test.ts src/hooks/useModalDrag.ts src/components/modals/useImageDetailModalLayout.ts` (line-ending warning only)
- `npx vitest run src/parsers/integrity.test.ts` (4 tests; reran after one transient full-suite timeout)
- `npm run check` (301 files, 1747 tests, production build)
- `npx eslint src/components/viewer3d/screenshotCameraPolicy.ts src/components/viewer3d/screenshotCameraPolicy.test.ts src/components/viewer3d/useScreenshotDownloadTrigger.ts src/components/viewer3d/screenshotCaptureViewModel.ts src/components/viewer3d/screenshotCaptureViewModel.test.ts`
- `npx vitest run src/components/viewer3d/screenshotCameraPolicy.test.ts src/components/viewer3d/screenshotCaptureViewModel.test.ts` (5 tests)
- `rg -n "as THREE\.PerspectiveCamera|clone\(\) as THREE" src/components src/hooks src/utils -g "!*.test.ts" -g "!*.test.tsx"`
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/components/viewer3d/screenshotCameraPolicy.ts src/components/viewer3d/screenshotCameraPolicy.test.ts src/components/viewer3d/useScreenshotDownloadTrigger.ts`
- `npm run check` (302 files, 1749 tests, production build)
- `npx eslint src/components/viewer3d/useFrustumPlaneHoverInteractions.ts src/components/viewer3d/frustumPlaneHoverPolicy.ts src/components/viewer3d/frustumPlaneHoverPolicy.test.ts`
- `npx vitest run src/components/viewer3d/frustumPlaneHoverPolicy.test.ts` (10 tests)
- `rg -n "as FrustumPlaneHoverIntersection\[\]|FrustumPlaneHoverIntersection\[\]" src/components/viewer3d/useFrustumPlaneHoverInteractions.ts src/components/viewer3d/frustumPlaneHoverPolicy.ts src/components/viewer3d src/hooks src/utils`
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "as FrustumPlaneHoverIntersection\[\]|as THREE\.PerspectiveCamera|as HTMLElement|as Node|as HTMLInputElement|as HTMLSelectElement|as HTMLDivElement|as THREE\.BufferAttribute|as Float32Array" src/components src/hooks src/utils src/store -g "!*.test.ts" -g "!*.test.tsx"`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/components/viewer3d/useFrustumPlaneHoverInteractions.ts src/components/viewer3d/frustumPlaneHoverPolicy.ts src/components/viewer3d/frustumPlaneHoverPolicy.test.ts`
- `npm run check` (302 files, 1750 tests, production build)
- `npx eslint src/hooks/idleTimerPolicy.ts src/hooks/idleTimerPolicy.test.ts src/hooks/useIdleTimer.ts`
- `npx vitest run src/hooks/idleTimerPolicy.test.ts` (5 tests)
- `rg -n "as ClosableTarget|closest\?\." src/hooks/idleTimerPolicy.ts src/hooks/useIdleTimer.ts`
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/hooks/idleTimerPolicy.ts src/hooks/idleTimerPolicy.test.ts`
- `npm run check` (302 files, 1750 tests, production build)
- `npx eslint src/config/configuration/schema.ts src/config/configuration/schema.test.ts src/config/registry/generators/configurationRecord.ts src/config/registry/generators/configurationRecord.test.ts`
- `npx vitest run src/config/configuration/schema.test.ts src/config/registry/generators/configurationRecord.test.ts src/config/configuration/serializer.test.ts` (10 tests)
- `rg -n "result\.data as PartialAppConfiguration|key as ConfigurationSectionKey|CONFIGURATION_SECTION_KEYS\.includes" src/config`
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/config/configuration/schema.ts src/config/configuration/schema.test.ts src/config/registry/generators/configurationRecord.ts src/config/registry/generators/configurationRecord.test.ts` (line-ending warning only)
- `npm run check` (303 files, 1752 tests, production build)
- `npx tsc -b tsconfig.app.json --pretty false`
- `npx eslint src/config/configuration/types.ts src/config/registry/generators/configurationRecord.ts src/config/registry/generators/configurationRecord.test.ts src/config/registry/generators/defaults.ts src/config/registry/generators/adapter.ts src/config/configuration/schema.ts src/config/configuration/schema.test.ts`
- `npx vitest run src/config/registry/generators/configurationRecord.test.ts src/config/configuration/schema.test.ts src/config/configuration/serializer.test.ts src/config/registry/generators/adapter.test.ts src/config/registry/generators/schema.test.ts` (18 tests)
- `rg -n "value as AppConfiguration\[K\]|as AppConfiguration\[|as PartialAppConfiguration|key as ConfigurationSectionKey|CONFIGURATION_SECTION_KEYS\.includes" src/config`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/config/configuration/types.ts src/config/registry/generators/configurationRecord.ts src/config/registry/generators/configurationRecord.test.ts src/config/configuration/schema.ts src/config/configuration/schema.test.ts docs/dx-implementation-validation-plan.md` (line-ending warnings only)
- `npm run check` (303 files, 1752 tests, production build)
- `npx tsc -b tsconfig.app.json --pretty false`
- `npx eslint src/components/viewer3d/TrackballControls.tsx src/components/viewer3d/trackballControlsApi.ts src/components/viewer3d/trackballControlsApi.test.ts src/components/viewer3d/trackballCameraLifecycleTypes.ts src/components/viewer3d/trackballCameraLifecyclePolicy.ts src/components/viewer3d/trackballCameraLifecyclePolicy.test.ts src/components/viewer3d/useTrackballCameraLifecycle.ts src/components/viewer3d/useTrackballProjectionSync.ts`
- `npx vitest run src/components/viewer3d/trackballControlsApi.test.ts src/components/viewer3d/useTrackballCameraLifecycle.test.ts src/components/viewer3d/trackballControlsViewModel.test.ts src/components/viewer3d/trackballCameraLifecyclePolicy.test.ts` (26 tests)
- `rg -n "set as TrackballStateSetter|controls: undefined|as THREE\.EventDispatcher|as TrackballControlsApi|as THREE\.PerspectiveCamera" src/components src/hooks src/utils src/store -g "!*.test.ts" -g "!*.test.tsx"`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/components/viewer3d/TrackballControls.tsx src/components/viewer3d/trackballControlsApi.ts src/components/viewer3d/trackballControlsApi.test.ts src/components/viewer3d/trackballCameraLifecycleTypes.ts src/components/viewer3d/trackballCameraLifecyclePolicy.ts src/components/viewer3d/trackballCameraLifecyclePolicy.test.ts src/components/viewer3d/useTrackballCameraLifecycle.ts src/components/viewer3d/useTrackballProjectionSync.ts docs/dx-implementation-validation-plan.md` (line-ending warning only)
- `npm run check` (303 files, 1753 tests, production build)
- `npx eslint src/components/viewer3d/trackballCameraLifecyclePolicy.test.ts src/components/viewer3d/trackballCameraLifecyclePolicy.ts`
- `npx vitest run src/components/viewer3d/trackballCameraLifecyclePolicy.test.ts src/components/viewer3d/trackballControlsApi.test.ts` (13 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "as THREE\.PerspectiveCamera|as THREE\.OrthographicCamera" src/components/viewer3d/trackballCameraLifecyclePolicy.test.ts src/components/viewer3d/trackballCameraLifecyclePolicy.ts`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/components/viewer3d/trackballCameraLifecyclePolicy.test.ts docs/dx-implementation-validation-plan.md`
- `npm run check` (303 files, 1753 tests, production build)
- `npx eslint src/test/builders/browserFakes.ts src/test/builders/fileFakes.ts src/test/builders/builders.test.ts src/parsers/zipExportPolicy.test.ts src/parsers/imageZipExport.test.ts src/parsers/maskZipExport.test.ts src/parsers/reconstructionZipExport.test.ts src/parsers/writers.test.ts`
- `npx vitest run src/test/builders/builders.test.ts src/parsers/zipExportPolicy.test.ts src/parsers/imageZipExport.test.ts src/parsers/maskZipExport.test.ts src/parsers/reconstructionZipExport.test.ts src/parsers/writers.test.ts` (38 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "blobToArrayBuffer|reader\.result as ArrayBuffer|as BlobPart|as typeof setTimeout" src/parsers src/test/builders`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/test/builders/browserFakes.ts src/test/builders/fileFakes.ts src/test/builders/builders.test.ts src/parsers/zipExportPolicy.test.ts src/parsers/imageZipExport.test.ts src/parsers/maskZipExport.test.ts src/parsers/reconstructionZipExport.test.ts src/parsers/writers.test.ts` (line-ending warning only)
- `npm run check` (303 files, 1754 tests, production build)
- `npx eslint src/test/builders/eventFakes.ts src/test/builders/builders.test.ts src/components/gallery/useImageGalleryItemInteractions.test.ts src/components/viewer3d/trackballTouchHandlers.test.ts src/components/viewer3d/useTrackballTouchHandlers.test.ts`
- `npx vitest run src/test/builders/builders.test.ts src/components/gallery/useImageGalleryItemInteractions.test.ts src/components/viewer3d/trackballTouchHandlers.test.ts src/components/viewer3d/useTrackballTouchHandlers.test.ts` (22 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "as PointerEvent|as MouseEvent|as TouchEvent|return event as TouchEvent|function touch\(|function touchEvent\(" src/components/gallery/useImageGalleryItemInteractions.test.ts src/components/viewer3d/trackballTouchHandlers.test.ts src/components/viewer3d/useTrackballTouchHandlers.test.ts`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/test/builders/eventFakes.ts src/test/builders/builders.test.ts src/components/gallery/useImageGalleryItemInteractions.test.ts src/components/viewer3d/trackballTouchHandlers.test.ts src/components/viewer3d/useTrackballTouchHandlers.test.ts`
- `npm run check` (303 files, 1754 tests, production build)
- `npx eslint src/test/builders/browserFakes.ts src/test/builders/builders.test.ts src/hooks/asyncImageCanvas.test.ts src/utils/canvasTypeGuards.test.ts src/utils/clipboard.test.ts`
- `npx vitest run src/test/builders/builders.test.ts src/hooks/asyncImageCanvas.test.ts src/utils/canvasTypeGuards.test.ts src/utils/clipboard.test.ts` (27 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "as ClipboardItem|as CanvasRenderingContext2D" src/hooks/asyncImageCanvas.test.ts src/utils/canvasTypeGuards.test.ts src/utils/clipboard.test.ts`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/test/builders/browserFakes.ts src/test/builders/builders.test.ts src/hooks/asyncImageCanvas.test.ts src/utils/canvasTypeGuards.test.ts src/utils/clipboard.test.ts`
- `npm run check` (303 files, 1755 tests, production build)
- `npx eslint src/components/viewer3d/screenshotRecordingCanvas.test.ts src/components/viewer3d/screenshotRecordingFrameTicks.test.ts src/components/viewer3d/screenshotRecordingCanvas.ts src/components/viewer3d/screenshotRecordingFrameTicks.ts`
- `npx vitest run src/components/viewer3d/screenshotRecordingCanvas.test.ts src/components/viewer3d/screenshotRecordingFrameTicks.test.ts` (10 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "\{\}\s*as THREE\.(Scene|Camera)|scene:\s*\{\}\s*as THREE\.Scene|camera:\s*\{\}\s*as THREE\.Camera" src/components src/hooks src/utils src/parsers -g "*.test.ts" -g "*.test.tsx"`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/components/viewer3d/screenshotRecordingCanvas.test.ts src/components/viewer3d/screenshotRecordingFrameTicks.test.ts`
- `npm run check` (303 files, 1755 tests, production build)
- `npx eslint src/test/builders/browserFakes.ts src/test/builders/builders.test.ts src/components/viewer3d/screenshotGifRecordingStart.test.ts src/components/viewer3d/screenshotWebCodecsStart.test.ts src/components/viewer3d/screenshotGifRecordingStart.ts src/components/viewer3d/screenshotWebCodecsStart.ts`
- `npx vitest run src/test/builders/builders.test.ts src/components/viewer3d/screenshotGifRecordingStart.test.ts src/components/viewer3d/screenshotWebCodecsStart.test.ts` (21 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "\{\}\s*as EncodedVideoChunk|\{\}\s*as EncodedVideoChunkMetadata|as FinishedHandler|as ProgressHandler|as AbortHandler|buildGifEncoder\(" src/components/viewer3d/screenshotGifRecordingStart.test.ts src/components/viewer3d/screenshotWebCodecsStart.test.ts`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/test/builders/browserFakes.ts src/test/builders/builders.test.ts src/components/viewer3d/screenshotGifRecordingStart.test.ts src/components/viewer3d/screenshotWebCodecsStart.test.ts`
- `npm run check` (303 files, 1756 tests, production build)
- `npx eslint src/test/builders/browserFakes.ts src/test/builders/builders.test.ts src/hooks/asyncImageCacheScheduler.test.ts src/hooks/asyncImageCacheScheduler.ts src/components/gallery/useImageGalleryVisibleImageFetch.test.ts src/components/gallery/useImageGalleryVisibleImageFetch.ts`
- `npx vitest run src/test/builders/builders.test.ts src/hooks/asyncImageCacheScheduler.test.ts src/components/gallery/useImageGalleryVisibleImageFetch.test.ts` (26 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "\{\s*timeRemaining:\s*\(\)\s*=>\s*12\s*\}\s*as IdleDeadline|\{\}\s*as Reconstruction|type \{ Reconstruction \}" src/hooks/asyncImageCacheScheduler.test.ts src/components/gallery/useImageGalleryVisibleImageFetch.test.ts src/test/builders`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/test/builders/browserFakes.ts src/test/builders/builders.test.ts src/hooks/asyncImageCacheScheduler.test.ts src/components/gallery/useImageGalleryVisibleImageFetch.test.ts`
- `npm run check` (303 files, 1757 tests, production build)
- `npx eslint src/utils/zipArchiveState.test.ts src/utils/zipArchiveState.ts src/test/builders/fileFakes.ts src/test/builders/builders.test.ts`
- `npx vitest run src/utils/zipArchiveState.test.ts src/test/builders/builders.test.ts` (19 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "\{\}\s*as ArchiveReader|makeArchive|type \{ ArchiveEntry, ArchiveReader \}" src/utils/zipArchiveState.test.ts src/test/builders`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/utils/zipArchiveState.test.ts`
- `npm run check` (303 files, 1757 tests, production build)
- `npx eslint src/test/builders/fileFakes.ts src/test/builders/builders.test.ts src/parsers/transform_export.test.ts src/parsers/integrity.test.ts`
- `npx vitest run src/test/builders/builders.test.ts src/parsers/transform_export.test.ts src/parsers/integrity.test.ts` (20 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "buffer\.slice\([^\r\n]+\) as ArrayBuffer|as ArrayBuffer" src/parsers/transform_export.test.ts src/parsers/integrity.test.ts src/test/builders/fileFakes.ts src/test/builders/builders.test.ts`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `git diff --check -- src/test/builders/fileFakes.ts src/test/builders/builders.test.ts src/parsers/transform_export.test.ts src/parsers/integrity.test.ts` (line-ending warnings only)
- `npm run check` (303 files, 1758 tests, production build)
- `npx eslint src/utils/zipValidation.test.ts`
- `npx vitest run src/utils/zipValidation.test.ts` (6 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "as ZipUrlValidationOptions\['fetchImpl'\]" src/utils/zipValidation.test.ts src/utils`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `npm run check` (303 files, 1758 tests, production build)
- `npx eslint src/hooks/useClickOutside.test.ts src/hooks/useClickOutside.ts src/hooks/clickOutsidePolicy.ts src/hooks/clickOutsidePolicy.test.ts`
- `npx vitest run src/hooks/useClickOutside.test.ts src/hooks/clickOutsidePolicy.test.ts` (7 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "MockInstance|as MockInstance|spyOn\(document, 'removeEventListener'\) as" src/hooks/useClickOutside.test.ts src/hooks`
- `npm run check` (303 files, 1758 tests, production build)
- `npx eslint e2e/keyboard-shortcuts.spec.ts`
- `rg -n "as HTMLElement|style\.backgroundColor|getSceneBackgroundColor" e2e/keyboard-shortcuts.spec.ts`
- `npx playwright test e2e/keyboard-shortcuts.spec.ts --workers=1 --reporter=line` (18 tests across Chromium and Firefox)
- `rg -n "as HTMLElement|as ZipUrlValidationOptions\['fetchImpl'\]|MockInstance|as MockInstance|spyOn\(document, 'removeEventListener'\) as" e2e/keyboard-shortcuts.spec.ts src/utils/zipValidation.test.ts src/hooks/useClickOutside.test.ts src/hooks src/utils`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `npm run check` (303 files, 1758 tests, production build)
- `npx eslint src/components/viewer3d/panels/exportPanelViewModel.ts src/components/viewer3d/panels/exportPanelViewModel.test.ts src/components/modals/imageDetailCameraPoseViewModel.ts src/components/modals/imageDetailCameraPoseViewModel.test.ts src/components/modals/ImageDetailMedia.tsx src/components/viewer3d/panels/ExportPanel.tsx`
- `npx vitest run src/components/viewer3d/panels/exportPanelViewModel.test.ts src/components/modals/imageDetailCameraPoseViewModel.test.ts` (8 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "as CameraModelId|as CameraModelIdType|type CameraModelId as CameraModelIdType|Pick<Camera, 'modelId'>|camera: Camera" src/components/viewer3d/panels/exportPanelViewModel.ts src/components/viewer3d/panels/exportPanelViewModel.test.ts src/components/modals/imageDetailCameraPoseViewModel.ts src/components/modals/imageDetailCameraPoseViewModel.test.ts`
- `rg -n "as CameraModelId|as CameraModelIdType" src/components/viewer3d/panels/exportPanelViewModel.test.ts src/components/modals/imageDetailCameraPoseViewModel.test.ts src/components/viewer3d/panels/exportPanelViewModel.ts src/components/modals/imageDetailCameraPoseViewModel.ts`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `npm run check` (303 files, 1758 tests, production build)
- `npx eslint src/components/modals/DistanceInputModal.test.tsx src/components/modals/ImageDetailImageJumpInput.test.tsx`
- `npx vitest run src/components/modals/DistanceInputModal.test.tsx src/components/modals/ImageDetailImageJumpInput.test.tsx` (4 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "as HTMLInputElement|\.value\)\.toBe|\.value\).toBe|input\.value" src/components/modals/DistanceInputModal.test.tsx src/components/modals/ImageDetailImageJumpInput.test.tsx`
- `rg -n "as HTMLInputElement" src/components/modals/DistanceInputModal.test.tsx src/components/modals/ImageDetailImageJumpInput.test.tsx src/components/modals`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `npm run check` (303 files, 1758 tests, production build)
- `npx eslint src/components/modals/ImageDetailViews.test.tsx src/components/modals/ImageDetailMatchOpacityControl.test.tsx`
- `npx vitest run src/components/modals/ImageDetailViews.test.tsx src/components/modals/ImageDetailMatchOpacityControl.test.tsx` (7 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "as HTMLElement|parentElement as|firstElementChild as|getRenderedRoot|getOpacityControlContainer" src/components/modals/ImageDetailViews.test.tsx src/components/modals/ImageDetailMatchOpacityControl.test.tsx`
- `rg -n "as HTMLElement|parentElement as|firstElementChild as" src/components/modals`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `npm run check` (303 files, 1758 tests, production build)
- `npx eslint src/test/builders/wasmFakes.ts src/test/builders/builders.test.ts src/parsers/integrity.test.ts tests/pycolmap/generate_fixtures.ts`
- `npx vitest run src/test/builders/builders.test.ts src/parsers/integrity.test.ts` (20 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "as Factory|as ArrayBuffer|as CameraModelId" tests/pycolmap/generate_fixtures.ts src/parsers/integrity.test.ts src/test/builders/wasmFakes.ts src/test/builders/builders.test.ts`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `npm run check` (303 files, 1759 tests, production build)
- `npx eslint src/test/builders/fileFakes.ts src/test/builders/builders.test.ts src/utils/fileScanning.test.ts src/hooks/fileDropzoneDropPayload.test.ts`
- `npx vitest run src/test/builders/builders.test.ts src/utils/fileScanning.test.ts src/hooks/fileDropzoneDropPayload.test.ts` (25 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "as FileSystemEntry|as FileSystemFileEntry|as FileSystemDirectoryEntry|error as DOMException" src/test/builders/fileFakes.ts src/utils/fileScanning.test.ts src/hooks/fileDropzoneDropPayload.test.ts`
- `rg -n "\bas\s+(HTMLElement|HTMLInputElement|CameraModelId|FileSystemEntry|ArrayBuffer|Factory)(;|,|\)|\])" src tests e2e`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `npm run check` (303 files, 1759 tests, production build)
- `npx eslint src/test/builders/fileFakes.ts src/test/builders/builders.test.ts src/utils/fileScanning.test.ts src/hooks/fileDropzoneDropPayload.test.ts`
- `npx vitest run src/test/builders/builders.test.ts src/utils/fileScanning.test.ts src/hooks/fileDropzoneDropPayload.test.ts` (25 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "\bas\s+(FileSystemFileHandle|FileSystemDirectoryHandle|DataTransferItem|DataTransfer|FileSystemEntry|FileSystemFileEntry|FileSystemDirectoryEntry)|as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src/test/builders/fileFakes.ts src/test/builders/builders.test.ts src/utils/fileScanning.test.ts src/hooks/fileDropzoneDropPayload.test.ts`
- `rg -n "\bas\s+(HTMLElement|HTMLInputElement|CameraModelId|FileSystemEntry|FileSystemFileEntry|FileSystemDirectoryEntry|FileSystemFileHandle|FileSystemDirectoryHandle|DataTransferItem|DataTransfer|ArrayBuffer|Factory)(;|,|\)|\])" src tests e2e`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `npm run check` (303 files, 1759 tests, production build)
- `npx eslint src/test/builders/browserFakes.ts src/test/builders/builders.test.ts src/utils/clipboard.test.ts src/components/viewer3d/screenshotMediaRecorderStart.test.ts src/components/viewer3d/screenshotRecordingFrameTicks.test.ts`
- `npx vitest run src/test/builders/builders.test.ts src/utils/clipboard.test.ts src/components/viewer3d/screenshotMediaRecorderStart.test.ts src/components/viewer3d/screenshotRecordingFrameTicks.test.ts` (33 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "as ClipboardItem|as BlobEvent|as VideoFrame|TestClipboardItem|TestBlobEvent|TestVideoFrame|buildVideoFrame" src/test/builders/browserFakes.ts src/test/builders/builders.test.ts src/utils/clipboard.test.ts src/components/viewer3d/screenshotMediaRecorderStart.test.ts src/components/viewer3d/screenshotRecordingFrameTicks.test.ts`
- `rg -n "\bas\s+(ClipboardItem|BlobEvent|VideoFrame|FileSystemEntry|FileSystemFileEntry|FileSystemDirectoryEntry|FileSystemFileHandle|FileSystemDirectoryHandle|DataTransferItem|DataTransfer|ArrayBuffer|Factory)(;|,|\)|\])" src tests e2e`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `npm run check` (303 files, 1759 tests, production build)
- `npx eslint src/test/builders/browserFakes.ts src/test/builders/builders.test.ts src/components/viewer3d/screenshotMediaRecorderStart.test.ts src/components/viewer3d/screenshotRecordingFrameTicks.test.ts src/components/viewer3d/screenshotWebCodecsFinish.test.ts src/components/viewer3d/screenshotWebCodecsStart.test.ts src/components/viewer3d/useScreenshotRecordingStop.test.ts`
- `npx vitest run src/test/builders/builders.test.ts src/components/viewer3d/screenshotMediaRecorderStart.test.ts src/components/viewer3d/screenshotRecordingFrameTicks.test.ts src/components/viewer3d/screenshotWebCodecsFinish.test.ts src/components/viewer3d/screenshotWebCodecsStart.test.ts src/components/viewer3d/useScreenshotRecordingStop.test.ts` (36 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "\bas\s+(MediaStream|MediaRecorder|TestVideoEncoder|ClipboardItem|BlobEvent|VideoFrame|FileSystemEntry|FileSystemFileEntry|FileSystemDirectoryEntry|FileSystemFileHandle|FileSystemDirectoryHandle|DataTransferItem|DataTransfer|ArrayBuffer|Factory)(;|,|\)|\])" src tests e2e`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `npm run check` (303 files, 1759 tests, production build)
- `npx eslint src/test/builders/eventFakes.ts src/test/builders/builders.test.ts src/components/gallery/useImageGalleryItemInteractions.test.ts src/components/viewer3d/trackballTouchHandlers.test.ts src/components/viewer3d/useBatchedFrustumInteractions.test.ts src/components/viewer3d/useTrackballKeyboardHandlers.test.ts src/components/viewer3d/useTrackballPointerHandlers.test.ts src/components/viewer3d/useTrackballTouchHandlers.test.ts src/components/viewer3d/useTrackballWheelHandlers.test.ts`
- `npx vitest run src/test/builders/builders.test.ts src/components/gallery/useImageGalleryItemInteractions.test.ts src/components/viewer3d/trackballTouchHandlers.test.ts src/components/viewer3d/useBatchedFrustumInteractions.test.ts src/components/viewer3d/useTrackballKeyboardHandlers.test.ts src/components/viewer3d/useTrackballPointerHandlers.test.ts src/components/viewer3d/useTrackballTouchHandlers.test.ts src/components/viewer3d/useTrackballWheelHandlers.test.ts` (58 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `npx eslint src/test/builders/browserFakes.ts src/test/builders/builders.test.ts src/components/viewer3d/screenshotGifRecordingStart.test.ts src/components/viewer3d/screenshotRecordingFrameTicks.test.ts src/components/viewer3d/useScreenshotRecordingStop.test.ts`
- `npx vitest run src/test/builders/builders.test.ts src/components/viewer3d/screenshotGifRecordingStart.test.ts src/components/viewer3d/screenshotRecordingFrameTicks.test.ts src/components/viewer3d/useScreenshotRecordingStop.test.ts` (30 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "\bas\s+(GifEncoder|KeyboardEvent|PointerEvent|MouseEvent|WheelEvent|Touch|TouchEvent|MediaStream|MediaRecorder|TestVideoEncoder|ClipboardItem|BlobEvent|VideoFrame|FileSystemEntry|FileSystemFileEntry|FileSystemDirectoryEntry|FileSystemFileHandle|FileSystemDirectoryHandle|DataTransferItem|DataTransfer|ArrayBuffer|Factory)(;|,|\)|\])" src tests e2e`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `npm run check` (303 files, 1759 tests, production build)
- `npx eslint src/utils/canvasTypeGuards.ts src/utils/canvasTypeGuards.test.ts src/test/builders/browserFakes.ts src/test/builders/builders.test.ts src/hooks/asyncImageCanvas.test.ts src/components/viewer3d/screenshotRecordingCanvas.test.ts`
- `npx vitest run src/test/builders/builders.test.ts src/utils/canvasTypeGuards.test.ts src/hooks/asyncImageCanvas.test.ts src/components/viewer3d/screenshotRecordingCanvas.test.ts` (27 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "\bas\s+(CanvasRenderingContext2D|GifEncoder|KeyboardEvent|PointerEvent|MouseEvent|WheelEvent|Touch|TouchEvent|MediaStream|MediaRecorder|TestVideoEncoder|ClipboardItem|BlobEvent|VideoFrame|FileSystemEntry|FileSystemFileEntry|FileSystemDirectoryEntry|FileSystemFileHandle|FileSystemDirectoryHandle|DataTransferItem|DataTransfer|ArrayBuffer|Factory)(;|,|\)|\])" src tests e2e`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `npm run check` (303 files, 1759 tests, production build)
- `npx eslint src/test/builders/eventFakes.ts src/test/builders/builders.test.ts src/hooks/useLongPress.ts src/components/gallery/useImageGalleryItemInteractions.ts src/components/gallery/useImageGalleryItemInteractions.test.ts src/components/viewer3d/useBatchedFrustumInteractions.ts src/components/viewer3d/useBatchedFrustumInteractions.test.ts src/components/gallery/ImageGalleryItems.tsx src/components/viewer3d/BatchedPlaneHitTargets.tsx src/components/viewer3d/BatchedArrowMeshes.tsx`
- `npx vitest run src/test/builders/builders.test.ts src/components/gallery/useImageGalleryItemInteractions.test.ts src/components/viewer3d/useBatchedFrustumInteractions.test.ts` (26 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "\bas\s+|as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src/test/builders/eventFakes.ts src/test/builders/browserFakes.ts src/test/builders/builders.test.ts`
- `rg -n "\bas\s+(ReactMouseEvent|ReactPointerEvent|ReactTouchEvent|ThreeEvent|CanvasRenderingContext2D|GifEncoder|KeyboardEvent|PointerEvent|MouseEvent|WheelEvent|Touch|TouchEvent|MediaStream|MediaRecorder|TestVideoEncoder|ClipboardItem|BlobEvent|VideoFrame|FileSystemEntry|FileSystemFileEntry|FileSystemDirectoryEntry|FileSystemFileHandle|FileSystemDirectoryHandle|DataTransferItem|DataTransfer|ArrayBuffer|Factory)(;|,|\)|\])" src tests e2e` (remaining hits were unrelated React type import aliases outside the builder cleanup)
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `npm run check` (303 files, 1759 tests, production build)
- `npx eslint src/hooks/useModalDrag.ts src/hooks/useModalDrag.test.ts src/components/modals/useImageDetailModalLayout.ts src/components/modals/useImageDetailModalLayout.test.ts src/components/modals/useImageDetailNavigationHandlers.ts`
- `npx vitest run src/hooks/useModalDrag.test.ts src/components/modals/useImageDetailModalLayout.test.ts src/utils/capturedPointerDrag.test.ts` (17 tests)
- `npx tsc -b tsconfig.app.json --pretty false`
- `rg -n "type PointerEvent as ReactPointerEvent|type TouchEvent as ReactTouchEvent|type WheelEvent as ReactWheelEvent" src tests e2e`
- `rg -n "as unknown as|\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable" src tests e2e`
- `rg -n "parseInt\(|parseFloat\(|Number\.parseInt\(|Number\.parseFloat\(" src/parsers src/components src/hooks src/store src/utils src/theme`
- `npm run check` (361 files, 1889 tests, production build)

## Review Checklist Closure

Status captured on 2026-06-01. Items marked closed have code, configuration, or documentation changes plus a validation command.

### Closed Items

- [x] CI runs the project quality gate before publishing GitHub Pages.
  - Evidence: `.github/workflows/deploy.yml` runs `npm run check` after `npm ci`.
  - Verification: `npm run check`.
- [x] Local pycolmap commands are cross-platform.
  - Evidence: `package.json` delegates to `scripts/run-pycolmap-tests.mjs` instead of shell-specific directory changes and POSIX env-prefix syntax.
  - Verification: `npm run test:pycolmap` and `npm run test:pycolmap:regen`.
- [x] WASM asset copying is cross-platform.
  - Evidence: `package.json` delegates the copy step to `scripts/copy-wasm-assets.mjs` instead of `cp`.
  - Verification: `node scripts/copy-wasm-assets.mjs` copies `colmap_wasm.js` and `colmap_wasm.wasm` into `public/wasm/`. Full `npm run build:wasm` remains Emscripten-gated; this workstation reports no `emcmake`.
- [x] Parser regression fixtures no longer depend on a user-specific absolute path.
  - Evidence: `tests/colmapFixturePaths.ts` resolves `COLMAP_BICYCLE_FIXTURE_DIR` or the portable workspace-relative default.
  - Verification: scan `src`, `tests`, and `package.json` for user-specific absolute paths.
- [x] Transform export regression tests no longer emit debug logs during normal runs.
  - Evidence: removed pose and point `console.log` calls from `src/parsers/transform_export.test.ts`.
  - Verification: `rg -n "console\\.log\\('original|console\\.log\\('transformed" src/parsers/transform_export.test.ts`.
- [x] Rig availability prefers parsed COLMAP rig/frame data over filename inference.
  - Evidence: `buildRigInfo` reads `reconstruction.rigData.frames` first and only falls back to filename grouping when rig data is absent.
  - Tests: `npx vitest run src/components/viewer3d/viewerControlsViewModel.test.ts src/components/viewer3d/panels/rigPanelViewModel.test.ts`.
- [x] `DatasetManager` diagnostics and cache reporting are split from image/mask access.
  - Evidence: `src/dataset/DatasetManager.ts` now owns dataset source and image/mask operations only; `src/dataset/DatasetDiagnostics.ts` owns cache and memory reporting.
  - Tests: `npx vitest run src/dataset/DatasetManager.test.ts src/dataset/DatasetDiagnostics.test.ts`.
  - Verification: `rg -n "useReconstructionStore|getThumbnailCacheStats|getFrustumTextureCacheStats|getMemoryStats|CacheStats" src/dataset/DatasetManager.ts` returns no hits.
- [x] Broad UI-store access is documented behind workflow-local selectors and facades.
  - Evidence: `docs/architecture.md` documents `useUIStore` access through workflow-local facades, and production components have no direct Zustand store hook calls outside facade modules.
  - Tests: `npx vitest run src/components/componentStoreBoundary.test.ts`.
- [x] Store facades are rationalized as explicit tested boundaries.
  - Evidence: `src/components/componentStoreBoundary.test.ts` now verifies production store hooks stay behind facades and every production store facade has a colocated test.
  - Verification: `rg -n "use[A-Z][A-Za-z0-9]*Store\\(" src/components -g "*.ts" -g "*.tsx" | rg -v "StoreFacade|\\.test\\."` only returns intentional `useSyncExternalStore` subscriptions.
- [x] Mode cycling metadata is centralized for point, camera, match, selection, and rig controls.
  - Evidence: typed `*_MODE_CONTROL` descriptors in `src/components/viewer3d/viewerControlsViewModel.ts` drive next-state behavior and button state labels/icons.
  - Tests: `npx vitest run src/components/viewer3d/viewerControlsViewModel.test.ts`.
- [x] Duplicate Three.js versions introduced by `stats-gl` are resolved.
  - Evidence: `package.json` overrides `stats-gl@2.4.2` to use `three@^0.182.0`, and `package-lock.json` resolves `stats-gl` through the root Three.js package.
  - Verification: `npm ls three --depth=3` shows `stats-gl@2.4.2 overridden` with `three@0.182.0 deduped`; `src/test/setup.ts` clears Vitest's source-vs-optimized Three browser marker so `npm run check` no longer emits false duplicate-instance warnings.
- [x] Expected console output in tests is silenced and asserted.
  - Evidence: mask/image export tests, WASM parser tests, ZIP mask utility tests, and legacy migration tests spy on expected console output instead of printing during passing runs.
  - Tests: `npx vitest run src/parsers/writers.test.ts src/parsers/imageZipExport.test.ts src/parsers/maskZipExport.test.ts src/parsers/wasmParser.test.ts src/utils/imageFileUtils.test.ts src/store/migration.test.ts`.
- [x] Build-time Browserslist advisory noise is cleared.
  - Evidence: `package-lock.json` refreshes `caniuse-lite` via `npx update-browserslist-db@latest`.
  - Verification: `npm run check` completes without the stale Browserslist database advisory.

## Validation Plan

Run the narrowest useful checks while editing, then run the appropriate full gate before handoff.

### Static Checks

```powershell
npm run lint
npx tsc -b tsconfig.app.json --pretty false
git diff --check
```

For touched files with whitespace churn:

```powershell
rg -n "[ \t]+$" <touched-files>
```

Also scan source changes for accidental escape hatches:

```powershell
rg -n "eslint-disable|@ts-ignore|@ts-expect-error|as unknown as|\bas any\b" <touched-files>
```

### Unit And Component Tests

Run focused Vitest files first:

```powershell
npx vitest run src/path/to/changed.test.ts
```

Run the full unit suite when shared helpers, stores, dataset access, parser output, or viewer behavior changed:

```powershell
npm run test:run
```

### Browser Workflow Tests

Run targeted Playwright specs for browser-visible workflows:

```powershell
npx playwright test modals.spec.ts --workers=1 --reporter=line
npx playwright test gallery.spec.ts --workers=1 --reporter=line
npx playwright test viewer-controls.spec.ts --workers=1 --reporter=line
npx playwright test canvas-interactions.spec.ts --workers=1 --reporter=line
npx playwright test mask-export.spec.ts --workers=1 --reporter=line
```

Use `--workers=1` locally for stability.

### Parser, Export, And WASM Checks

For parser or reconstruction export changes, include:

```powershell
npm run test:pycolmap
```

For WASM changes, include:

```powershell
npm run build:wasm
npm run check
```

### Full Gate

For substantial slices, shared behavior, or pre-handoff validation:

```powershell
npm run check
```

`npm run check` covers lint, Vitest, and production build. Add targeted Playwright tests when the change affects real browser workflows because Playwright is not guaranteed by that gate.

## Slice Exit Criteria

A slice is complete when:

- Behavior is preserved, or the intentional behavior change is documented.
- New modules have narrow, descriptive names and clear owners.
- Pure logic has focused tests.
- Relevant component, hook, store, parser, or Playwright coverage has passed.
- No new dependency direction violation, broad utility bag, or unnecessary facade churn was introduced.
- Final notes list the changed files and validation commands.
