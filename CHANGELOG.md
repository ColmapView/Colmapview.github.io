# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.14.3] - 2026-09-09

### Fixed

- Respect explicit COLMAP frame metadata when drawing rig connections, preventing persistent false lines for repeated filenames in different folders, including extensionless video frame names.
- Share frame grouping between rig rendering and controls so visibility and availability agree, while preserving filename inference for legacy models without rig metadata.

## [0.14.2] - 2026-09-06

### Changed

- Made standard desktop buttons more compact at 32px while preserving touch targets.
- Unified image viewer button styling and aligned the image number field with navigation buttons.
- Moved Theme into Settings > Customization with consistent label and field alignment.

### Fixed

- Aligned context-menu and auto-hide switch rows and improved switch contrast in both themes.
- Made switch labels clickable and ensured keyboard activation works consistently.
- Connected shared slider, select, color, and profile labels to their controls.
- Added accessible numeric editing, slider edit focus restoration, and labels for image navigation and opacity inputs.

## [0.14.1] - 2026-09-06

### Fixed

- Restored the original Load Dataset header layout and mobile dismiss row by removing the startup theme selector.
- Kept Dark, Light, and System appearance controls in Settings, with existing saved preferences preserved.

## [0.14.0] - 2026-09-06

### Added

- Light interface mode, with Dark, Light, and System choices in Load Dataset and Settings.
- Persistent appearance preferences, cross-tab synchronization, and automatic response to system theme changes. Scene backgrounds and image colors remain independent.

### Changed

- Unified panel presets and startup actions with standard button sizing: 40px on desktop and 44px on touch. Selected and disabled states retain consistent geometry.
- Reorganized startup header controls to keep the title readable alongside the theme selector.
- Excluded scratch prototypes and browser artifacts from linting.

### Documentation

- Documented native Three.js splat migration feasibility tests. The production rendering backend remains unchanged.

## [0.13.0] - 2026-09-06

### Changed

- Simplified the Load Dataset panel, moved setup guidance into contextual help, and consolidated sample dataset and manifest actions.
- Centralized panel surfaces, buttons, form controls, selection states, and feedback styles around the Load Dataset design.
- Refined viewer and menu icons, simplified the gallery divider, and removed redundant arrows from image navigation.
- Standardized panel actions, including Reload, Reset, and Apply, with consistent sizing and recognizable disabled states.
- Made the version number open About directly.

### Fixed

- Corrected inconsistent panel borders, heading margins, and spacing across floating tools and dialogs.
- Added keyboard access and Escape dismissal to viewer panels, tooltips, and inline color editors, including focus restoration.
- Kept tooltip placement within the viewport and improved narrow-screen panel layout.

### Development

- Added a design-system guide and regression coverage for panel borders, unsupported CSS utilities, keyboard interactions, and mobile layouts.

## [0.12.0] - 2026-08-31

### Changed

- **Align and Transform are split by what they do, not by how old they are.** Align now holds every operation that works out where the scene should sit — **Center at Origin** and **Floor Detection** moved there from Transform — and groups them by goal, so the automatic way and the pick-points way of doing the same thing finally sit next to each other: *Set the origin* offers Center at Origin or 1-Point Origin, *Set the scale* offers 2-Point Scale, *Level the scene* offers Floor Detection or 3-Point Align. Transform keeps the gizmo and the sliders — the transform you dial in by hand. Both panels now show the same **Reset** and **Apply**, because there is one pending transform underneath and it should be committable from wherever you changed it; **Reload** is unchanged and stays in Transform, since re-reading the dropped files is not an alignment.

### Fixed

- Choosing a splat no longer flashes a "no splat renderer is available" warning while the compatibility renderer is still downloading — that window now shows a brief "Preparing splat renderer..." note, and the warning is reserved for the case where the download actually failed.
- When WebGPU is hidden because the page was loaded over plain HTTP, the app now says so and suggests HTTPS, instead of wrongly advising a "WebGPU-capable browser".
- The compatibility-renderer notice is informational (auto-dismissing) and appears once per session, instead of a persistent warning re-raised for every splat file.
- A compatibility-renderer download that never arrives — offline, blocked CDN, ad-blocker — now settles: the "Preparing splat renderer..." note clears and the honest "no renderer available" warning appears. It previously stayed "preparing" for the rest of the session, with the warning suppressed behind it. Note that the failure is final for the page: dropping another splat will not retry the download, so reload once the network is back.
- Asking for the compatibility renderer with `?splatBackend=spark` and then not getting it no longer leaves you without an explanation. The app now warns that the renderer could not be loaded and offers the way out — remove the setting and let the app choose a renderer, or reload. Forcing WebGPU and failing already said why; forcing the compatibility renderer said nothing about the cause, and on a dropped file could say nothing at all.
- On a browser the app already knows cannot run WebGPU, the app no longer tells the user to reload over HTTPS — advice that could not have helped there. (Over plain HTTP the browser hides WebGPU entirely, so a browser we have no other reason to rule out is still given the HTTPS advice; that case is indistinguishable from the outside.)
- The "Preparing splat renderer..." line is shown once, not simultaneously by the loading overlay and a notification.
- Retrying a splat that failed to render warns again instead of failing silently over a blank viewport, while the once-per-session compatibility notice stays once per session.
- When the WebGPU renderer fails at runtime, the message reports what the driver said without appending "Enable WebGPU in your browser" — on a machine whose browser is perfectly capable, that advice pointed at the wrong thing.
- The Align panel's hint says what is actually useful now: results stack onto one pending transform, so several operations can be combined before a single Apply.

## [0.11.0] - 2026-08-29

### Added

- An **Align** button in the viewer toolbar, exposing the gizmo toggle and the 1-point origin / 2-point scale / 3-point align tools that were previously buried in the Transform panel or the right-click menu. While a picking mode is armed the button becomes its cancel affordance — the right-click menu is taken over by picking, so there was no mouse-reachable way out. The instructional "right-click anywhere" toast is retired now that the actions are visible.
- A collapse handle on the gallery's own edge, so the panel can be hidden and restored where it lives instead of only from the far side of the toolbar.
- A Tools section in Settings listing the deletion, camera-conversion, floor-detection, and auto-hide windows, so the app's tool windows can be found by reading rather than by hunting.
- Continuous integration now runs the browser end-to-end suite on every push and pull request; it previously existed but nothing executed it.

### Changed

- **The 3D viewport opens dark by default** (the same surface tone as the interface), so the canvas and the chrome read as one instrument instead of a dark frame around a white hole. The grid is a neutral ink that recedes instead of the old orange, which was chosen for a white canvas. Pressing **B** still returns the white background, and existing profiles keep whatever background they had saved.
- Status colours are consolidated onto one palette. Success, warning, error, and info each had two to five different renderings depending on which vocabulary the code reached for; there is now a single calm tone per meaning. Eighteen leftover colour rules were deleted.
- Muted text meets the AA contrast minimum (it was 2.4:1), and the secondary tier was raised alongside it so the three text weights stay visually distinct rather than collapsing into two.
- Tool panels and hover panels reflow at the compact breakpoint instead of being shrunk with a transform, so their text renders sharp rather than scaled. Footprints are unchanged: panel widths are identical and heights land within a few pixels.
- Toolbar clusters are announced as labelled groups to assistive tech, pressing Tab wakes chrome that has faded out, the idle fade is slower, and the shortcuts panel is titled "Help" now that it also carries the About tab.
- The floating ⓘ button in the top-left corner of the viewport is gone. It opened the same Help panel as the status bar's "Shortcuts" entry and appeared in exactly the same situations, so it was redundant; the panel is still one click away there, and the `I` / `?` hotkey is unchanged.
- The gizmo toggle and the alignment tools each have one home now: the gizmo stays in Transform (whose toolbar button toggles it, and which owns the `T` shortcut), and 1-Point Origin / 2-Point Scale / 3-Point Align live in Align. They were showing in both panels, in adjacent toolbar buttons. The right-click menu still offers all four.
- The viewer↔gallery divider has a proper grab handle: a small rectangular grip fades in as you reach it — on the divider itself, or approaching from the gallery side, since the hit strip deliberately stays off the canvas — and stays lit for the whole drag, instead of a hairline that flashed a full-height bar on hover. It sits clear of the collapse chevron, and the collapsed divider shows no grip, since there is nothing to drag.

### Fixed

- Splat previews no longer download the 5 MB compatibility renderer when WebGPU will draw them — including on the first drop of a fresh session, which previously slipped through because the WebGPU renderer only reports ready after a splat canvas mounts.
- The divider's grab strip no longer overhangs the 3D viewport, where a drag that started in the canvas's rightmost 4 pixels silently resized the gallery instead of orbiting.
- The gallery's collapse tab stays fully on-screen while the gallery is collapsed; it previously lost half its width to the window edge, leaving a ~6px sliver as the reopen affordance.
- The Help panel can now be opened on touch devices, from the status bar.
- On touch devices, a tap anywhere — including the bare canvas — now wakes chrome hidden by the idle fade. Previously the only touch wake surface was the invisible box of a faded control, which nothing on screen hinted at, so idle chrome was effectively unrecoverable in practice.
- The touch status bar is 44px tall and its Help entry fills the bar, so the tap target is the visible control itself; the previous invisible tap box was centered on a 24px bar and swallowed orbit gestures that began in the strip of canvas above it.
- Idle auto-hide no longer switches itself off for the rest of the session after a click on a control that closes with the click — the load buttons, the splat chooser. The hover pause now notices its element is gone instead of waiting for a mouseout that can never arrive.
- Text labels drawn inside the 3D scene now use the interface typeface once fonts finish loading, instead of staying on a system fallback.
- Floating tool windows no longer drift upward in the stacking order across a long session; the counter resets once the last window closes.
- The "unavailable" marker in the cache-statistics tooltip is visible again.
- COLMAP's `database.db` is no longer picked up when a folder is dropped. Nothing ever read it — the viewer works from the sparse model files — but the memory tooltip listed it as a loaded "Database" resource and added its size to the JS memory total, which overstated the figure by the whole file (routinely hundreds of megabytes). The unused SQLite reader that went with it, and the 644 KB WebAssembly binary it shipped in every build, are gone too.

### Notes

- The splat renderer (5 MB) is loaded on demand and is not part of the initial page load; a test now enforces that, so it cannot regress silently.
- If WebGPU fails after successfully initializing (device loss), the compatibility renderer now starts its 5 MB download at failure time instead of having a head start — an accepted tradeoff, since prefetching it while WebGPU is healthy would re-create the download the gate exists to avoid.
- On machines whose WebGPU adapter fails intermittently, the viewer now waits out up to ~21 seconds of adapter retries (three attempts, backing off) before declaring WebGPU failed and downloading the compatibility renderer — previously the renderer was already warm on such machines. Bounded and self-healing, accepted for the same reason as above.

## [0.10.0] - 2026-08-12

### Added

- An About tab in the keyboard-shortcuts panel, collecting the brand, project links, license, and COLMAP credit that used to crowd the status bar. The status bar now carries status plus a visible "⌨ Shortcuts" entry that opens the panel — the ⓘ button and the (I) hotkey still work as before.
- Visible "Open example dataset" and "Download example manifest" links on the landing panel, for actions that were previously reachable only by right-clicking a button.
- A contract test that fails the build when the code asks for a styling class the stylesheet doesn't define. This project has no Tailwind, so an undefined class was a silent no-op; auditing every one of them restored a batch of styling that had been declared but never painted (see Fixed).

### Changed

- The viewer toolbar is grouped into four clusters — view, data, capture, app — separated by hairlines, instead of one undifferentiated column of 15 buttons. Button order is unchanged.
- Toolbar hover labels read as words instead of codes (Both, Axes, Grid, Orbit, Fly, Track, Frust, Arrow, Image, Rig, Blink, Error, Splat); true initialisms (RGB, RNB, S+P) are kept, and the disabled rig chip no longer shouts "N/A".
- The landing panel's toy-dataset button is now styled as the primary action, and "Load JSON" is renamed "Load manifest" — a manifest is what it loads.
- Loading gallery tiles show the image name once, in the caption strip, instead of repeating it in the placeholder.
- New typography: IBM Plex Sans for the interface, JetBrains Mono for hex values, hotkey chips, and numeric readouts. The mono face was named in the stylesheet but never loaded, so those readouts silently fell back to a system font. Both faces ship with the app, so a page load makes no Google Fonts request — required for GitHub Pages and the offline-capable embed mode.
- Removed the unused floating-action-button components and the style rules left orphaned by earlier cleanups. No visible change.

### Fixed

- Hover, press, and focus styling that the code declared but the stylesheet never defined now actually renders: highlight states across menus, toggles, and buttons; drop-zone hover cards sit above their trigger instead of dropping below it; the confirmation-dialog scrim dims the page behind it; the drop-zone header divider is a visible hairline; the image-detail jump input squares off against its button; caution-status text takes its intended amber.
- Panels, menus, and dialogs stack in a real layer scale instead of arbitrary class names that set no z-index at all, so a floating tool window can no longer paint over a dialog that is blocking it.
- Floating tool windows are proper dialogs for assistive tech: each carries a dialog role and an accessible name, takes focus when it opens, and returns focus to whatever opened it when it closes.
- Compact controls in touch mode get an invisible 44px tap target, so small buttons are reliably hittable on a phone without looking any different — and the expansion sits beneath its neighbors, so it can't steal their taps.
- The drop zone's controls are operable by keyboard and announced to screen readers.
- Chrome that fades out while the viewer is idle now also leaves the tab order, so Tab no longer lands on invisible controls; it stays hover-revealable as before.
- Focus rings on dropdowns and editable values appear for keyboard focus only, instead of boxing the control on a mouse click.
- The example-dataset link opens its new tab without handing that tab a handle back to the app.

## [0.9.3] - 2026-07-04

### Changed

- Scrolling out of a spherical panorama's lens now detaches immediately: with a 360° camera selected and (U) undistortion on, flicking the wheel outward with the cursor outside the circular lens deselects the camera and closes the photosphere, leaving the view where it is. (U) stays on, so the next selected camera comes straight up undistorted. Previously the wheel slowly dollied the eye out from the panorama center.

### Fixed

- Zooming out with the mouse wheel no longer crawls when the camera is close to its orbit target: the near-range step is floored to a sensible fraction of the scene so the start isn't sluggish, while the mid- and far-range zoom speed is unchanged.

## [0.9.2] - 2026-07-04

### Added

- Circular ground-truth lens for spherical (360°) panoramas: with (U) undistortion on, the viewer steps inside the photosphere and shows the panorama photo through a viewport-centered circle while the live reconstruction (points and splats) shows around it — a direct photo-vs-reconstruction comparison that stays aligned at every depth. Hover the circle to fade the photo and see the reconstruction underneath; scroll inside it to zoom the field of view with the photo staying locked to the points, like scrolling a pinhole camera's image plane.

### Changed

- (U) undistortion for spherical cameras now enters the panorama at its capture center instead of projecting a portal disk from outside the sphere. The earlier portal overlaid correctly only near one anchored depth and drifted elsewhere; from the center the photo overlays the point cloud exactly at all depths.
- Flying to a spherical camera no longer changes the field of view — a field of view you set (for example by zooming the lens) now persists as you move between panoramas — and no longer briefly shows the full panorama texture mid-flight; only the circular lens appears, once the view arrives inside the sphere.
- Origin axes are hidden by default on a fresh load (the grid still shows); toggle axes from the context menu or the View panel. Saved settings are unaffected.
- PSNR/SSIM splat metrics now apply only to the camera models the metric renderer supports (undistorted pinhole: SIMPLE_PINHOLE and PINHOLE). The PSNR/SSIM color modes and gallery border modes appear only for datasets containing at least one such camera; a compute skips unsupported images up front with a notice; and spherical, fisheye, and distorted-pinhole cameras render in their normal per-camera color under a metric mode instead of a gray "no data" color.

### Fixed

- Point size no longer stays small after viewing a Gaussian-splat dataset: the splat display preset (small, faint points) persisted into later splat-less sessions; loading a dataset without a splat now restores the normal point size and opacity.
- Scrolling a side panel or modal no longer gets captured into a camera field-of-view change while a spherical camera's lens is active.
- Zooming out from inside a panorama is smooth — the zoom no longer snaps at a floor distance.
- The (O) auto-orbit shortcut is now shown in the Camera Mode panel ("Auto Orbit (O)").
- On datasets with only spherical cameras, the camera-display button, hotkey, and context-menu entry toggle camera visibility instead of cycling through arrow/image/frustum modes that have no effect on grid spheres.

## [0.9.1] - 2026-07-03

### Added

- Hotkey (O) cycles auto orbit (off / clockwise / counter-clockwise), matching the context-menu action; listed in the hotkey help.

### Changed

- "Auto Rotate" is now called "Auto Orbit" across the UI (context menu, camera panel, settings description; the speed slider reads "Orbit Speed"). Saved settings are unaffected.

### Fixed

- Loading a dataset without any splat no longer leaves the point cloud stuck in a splat color mode from a previous session (which hid the points behind a nonexistent splat): the mode drops to RGB on load, the splat options disappear from the point panel, and the color-mode cycle (hotkey/menu) skips them too. Datasets with pickable splat tiles keep the splat modes.
- Go-to animations no longer roll the horizon mid-flight when horizon lock is on: every interpolated frame stays level instead of tilting through the shortest 3D arc and re-leveling at the end.
- Flying to a spherical (360°) camera now honors horizon lock — previously it always preserved the current roll, which could land the view sideways or upside down with the lock enabled. With the lock off, the current roll is still preserved.

## [0.9.0] - 2026-07-02

### Added

- Support all 18 COLMAP camera models (ids 0-17), including the models new in COLMAP 4.1: RAD_TAN_THIN_PRISM_FISHEYE, SIMPLE_DIVISION, DIVISION, SIMPLE_FISHEYE, FISHEYE, EUCM, and the spherical EQUIRECTANGULAR panorama model. A single camera-model registry drives parsing, display names, parameter labels, and distortion dispatch; the WASM fast-path parser accepts the new models too.
- Spherical (360°) camera rendering: EQUIRECTANGULAR cameras draw as lat/long grid spheres alongside pinhole frustums; selecting one shows its panorama as a photosphere (look-through inspection view) aligned to COLMAP's convention (image center = camera forward, validated against real spherical SfM reconstructions).
- (U) undistortion for spherical cameras: a view-tracking portal disk cropped to the sphere's silhouette, sampled by viewer ray so the panorama content overlays the point cloud from any viewpoint — the spherical equivalent of the pinhole undistorted image planes.
- Fly-to for spherical cameras stops outside the sphere and orbits its center (auto-FOV frames the sphere), and fly-to no longer re-orients the view to an assumed world-up — the current roll is preserved (COLMAP gravity is often +Y, which used to flip the scene on go-to).
- Distortion support for the new models on both CPU and GPU: EUCM, DIVISION/SIMPLE_DIVISION, SIMPLE_FISHEYE/FISHEYE, and the previously-broken RAD_TAN_THIN_PRISM_FISHEYE now render undistorted image previews correctly, guarded by a structural-exhaustiveness + CPU/GLSL numerical parity contract and independent COLMAP-derived oracle tests.
- Notify when cameras are skipped or excluded: loading a cameras.txt with unknown model names now shows an aggregate warning (previously silent console-only), and splat-PSNR computes report how many spherical images were excluded (PSNR is pinhole-only).
- Selecting a spherical camera shows a one-time "Press U to toggle the panorama overlay" tip, so the portal view is discoverable (the pinhole undistortion tip is gated on distortion coefficients, which spherical cameras don't have).

### Changed

- Camera parameter labels in the image-detail modal come from the model registry (EUCM shows alpha/beta, all COLMAP 4.1 models labeled; FOV's fifth parameter now displays as ω).
- The Data panel no longer shows a spherical camera's panorama width as its "Focal" value.
- Spherical grid spheres dim with the same standby/unselected opacity rules as pinhole frustums — and brighten on hover like them; their invisible hit targets are instanced (the camera-size slider no longer rebuilds per-camera geometry).
- The image-detail modal shows a spherical camera's entry as `panorama=WxH` instead of an empty parameter list, and the (U) hotkey description now reads "Toggle undistorted view (panorama overlay for 360 cameras)".
- The Camera Display panel hides its pinhole-only controls (display Mode, Selection α) when a reconstruction contains only spherical cameras — those controls have no effect on grid spheres; mixed datasets keep them.

### Fixed

- Text export corrupted values in scientific notation and large integers (e.g. a 5e-10 distortion coefficient exported as 0.5, 1e16 as "1") — camera params, quaternions, and point coordinates now round-trip exactly through cameras/images/points3D .txt.
- Model 11 (RAD_TAN_THIN_PRISM_FISHEYE) reconstructions rendered with no distortion applied at all.
- Division-model undistortion returned invalid results past the model's horizon for strong barrel coefficients, and EUCM had a NaN hole at an exact FOV boundary — both now report invalid samples like their sibling models.

## [0.8.2] - 2026-06-24

### Fixed

- Stop flooding the console and network when a dataset's ground-truth images don't match the sparse model (e.g. raw frames vs the undistorted set COLMAP was solved on): WebGPU PSNR now detects the systematic metric-image/camera size mismatch once, logs a single summary, and skips the remaining images instead of failing every one. Mask probing also stops after repeated misses on a maskless dataset rather than firing two 404s per image.

## [0.8.1] - 2026-06-23

### Added

- Resolve images for datasets that renamed them to sequential placeholders (e.g. `0.jpg`) before running COLMAP and ship an `image_mapping.csv` mapping those names back to the original files (such as wildflow coral datasets). A pluggable image-source resolver maps each COLMAP image name to its real path — including images split across multiple folders — and falls back to the discovered images directory for any unmapped names.

## [0.8.0] - 2026-06-23

### Added

- Lazy on-demand loading for remote datasets with many splats: discover every splat tile, pick one in a new Splat Picker (or stay on the COLMAP scene), and download the selected tile on demand while previous tiles are offloaded to bound memory.
- COLMAP model discovery for Hugging Face and direct URLs that finds the reconstruction wherever it lives (`colmap/`, repo root, `sparse/0/`, …) and locates the images directory, instead of requiring `sparse/0/`.
- Byte-level download progress (e.g. "45 MB / 120 MB") for COLMAP files and splats in the loading overlay.
- Automatically switch to a splat display mode when a splat is selected or loaded.

### Changed

- Replace the deprecated mp4-muxer library with Mediabunny for WebCodecs MP4 recording.
- Default fisheye cameras to cropped undistortion mode.
- Update GitHub Actions runtime actions (checkout/setup-node to v6).

### Fixed

- Fix OpenCV-fisheye and OpenCV camera undistortion (≥90°/FOV-singularity guard, Newton inverse with Jacobian, degenerate-parameter guards, and full-frame validity culling).
- Load splat tiles whose filenames contain `#`, spaces, or other special characters instead of failing with 404 (URL path segments are encoded once, and double-encoding on directory-listing hosts is avoided).
- Fix MP4 recordings dropping frames at 2×/3×/4× playback speeds.
- Fix lazy splat-selection race conditions, a stuck loading overlay, and unbounded reads while classifying remote splats.

## [0.7.8] - 2026-06-13

### Added

- Add Spark splat rendering fallback for browsers without reliable WebGPU support.
- Add WebGPU unsupported warnings that point users toward WebGPU-capable browsers for full features.
- Detect generic PLY point clouds separately from Gaussian-splat PLY files and load them as 3D points.

### Changed

- Keep WebGPU PSNR/SSIM computation on the WebGPU path only, avoiding Spark/frontend renderer crosstalk.
- Hide PSNR/SSIM camera-frustum and gallery visualization paths while Spark is the active splat backend.

### Fixed

- Fix WebGPU PSNR/SSIM startup regressions and stale metric UI after Spark fallback.
- Avoid Spark teardown errors during renderer disposal and backend switching.
- Fix Three shader include resolution for Spark splat rendering.

## [0.7.7] - 2026-06-09

### Fixed

- Load all discovered remote `.spz` and `.ply` splat files from Hugging Face and directory URLs instead of only the preferred candidate.

## [0.7.6] - 2026-06-09

### Added

- Add gallery/list thumbnail display options for image, masked image, inverse masked image, mask, and hover mask.

### Changed

- Include gallery view, sort, border, thumbnail, column, and camera-filter settings in copied share and embed URLs.
- Treat mask files as alpha masks for gallery masked-image thumbnails and splat PSNR/SSIM metrics.
- Include WebGPU splat loading in the initial loading progress flow with calibrated read, decode, upload, and first-frame phases.
- Reduce image-plane thumbnail and frustum texture main-thread spikes by processing decode/resize/cache work in smaller batches.

### Fixed

- Fix WebGPU splat loading notification cleanup causing recursive React updates.
- Fix WebGPU splat overlay sizing to use the actual Three canvas backing buffer, avoiding subpixel image-frustum/splat misalignment at fractional viewport sizes.
- Avoid smooth virtual-gallery scroll warnings when selecting cameras in dynamically sized list layouts.

## [0.7.5] - 2026-06-08

### Added

- Add `H` hotkey support for cycling horizon lock modes.
- Add gallery/list border coloring options for none, camera, PSNR, and SSIM.
- Add splat-aware transform persistence for applied transforms, share URLs, reload prompts, and export warnings.

### Changed

- Default splat datasets to Splats + Points mode with smaller, translucent points.
- Default floor detection down direction toward the side with fewer cameras.
- Hide the gallery header unless the pointer is over the top of the gallery.
- Combine PSNR and SSIM into one PSNR/SSIM column in gallery list view.
- Include axes, grid, and gizmo in the default idle auto-hide set.

### Fixed

- Fix image plane thumbnails rendering as white rectangles by aligning local texture loading with the published release behavior.
- Apply transforms correctly to splat rendering and PSNR evaluation paths.
- Preserve splat state while switching active splat files in the same dataset.
- Switch point-picking transform tools to a point-visible display mode when the current display lacks points.

## [0.7.1] - 2026-06-04

### Fixed

- Propagate parse failures from URL and ZIP loaders so failed imports no longer report success.
- Support large inline share manifests without 16-bit length overflows or Base64 stack overflows.
- Clear pending touch long-press timers when scene controls unmount or touch mode is disabled.

## [0.7.0] - 2026-06-03

### Added

- Splat point-cloud rendering support with dedicated runtime store facades and render-policy tests.
- Browser and Python validation coverage for export, archive loading, gallery, modals, viewer controls, and COLMAP round trips.
- Typed helpers for camera-model conversion, URL/share state, ZIP/archive handling, DOM targets, canvas guards, and numeric/color parsing.

### Changed

- Decomposed the gallery, image-detail modal, viewer controls, camera frustums, origin axes, trackball controls, and export panels into focused components, view models, policy helpers, and store facades.
- Hardened persisted-store migrations, configuration import/export, URL-loaded datasets, and file-drop workflows around explicit validation boundaries.
- Updated release deployment to run the full project check before publishing versioned builds.

### Fixed

- Prevented generated Playwright CLI snapshots from appearing as release artifacts.
- Improved cleanup for object URLs, ZIP archives, WASM fallbacks, screenshot recording resources, and texture/cache lifecycles.
- Tightened parser and writer behavior for COLMAP text/binary exports, masks, image paths, camera models, rigs, and point filtering.

## [0.3.0] - 2026-01-20

### Added

- **WASM Reconstruction Module**: In-browser WASM-based reconstruction processing
  - Parse and manipulate reconstruction data directly in WebAssembly
  - Improved performance for large datasets
- **Image Statistics Parser**: New parser for computing image-level statistics
  - Track coverage, reprojection errors, and observation counts per image
- **Enhanced Point Cloud Visualization**:
  - Improved GPU-instanced rendering performance
  - Better color mode transitions
- **Camera Frustum Tooltips**: Hover tooltips showing image info and statistics
- **Mobile Layout Improvements**: Better responsive design for mobile devices
- **Stat Histograms**: Visual distribution histograms for numerical statistics
- **Reset/Upload Config Buttons**: Quick actions in startup panel

### Changed

- Enhanced writers module with more export format options
- Improved TrackballControls with smoother navigation
- Better image detail modal with enhanced metadata display
- Refactored camera intrinsics utilities for cleaner code
- Updated ESLint config to exclude WASM build artifacts

### Fixed

- Fixed match data not reloading correctly when opening new dataset with existing dataset open
- Fixed lazy-loaded 2D points cache not clearing when loading new dataset
- Fixed state declaration order in CameraFrustums component
- Fixed ESLint warnings for React hooks patterns

## [0.2.5] - 2026-01-19

### Added

- **Rig Blink Mode**: Toggle between rig camera views for multi-camera setups
- Dotted line icon indicator for rig mode

### Changed

- Consolidated CSS styling
- Fixed loading panel behavior

## [0.2.4] - 2026-01-18

### Added

- **WASM Module**: WebAssembly support for reconstruction processing
- **Rig Detection**: Automatic detection of multi-camera rig setups
- **Axis System Improvements**: Better coordinate system visualization

## [0.2.3] - 2026-01-17

### Added

- **Lite Parser**: Optimized parser for handling large datasets efficiently

## [0.2.2] - 2026-01-16

### Changed

- Version bump with stability improvements

## [0.2.1] - 2026-01-15

### Added

- Major feature update with multiple enhancements

## [0.2.0] - 2026-01-14

### Added

- **Context Menu**: Right-click context menu for 3D viewer actions
- **Config Registry**: Centralized configuration management system
- **Point Picking Tools**: Interactive point selection for measurements
- **Transform Gizmo**: Visual transform manipulation controls
- **Export Functionality**: Export reconstructions to various formats
- **Keyboard Shortcuts**: Comprehensive hotkey support
- **Settings Persistence**: LocalStorage-based settings save/restore
- **Version Display**: Version number in status bar

### Changed

- Improved camera controls and gizmo UX
- Enhanced gallery with better tooltips and labels
- Better design system consistency
- Improved computational efficiency across codebase

### Fixed

- Image panel reset on new dataset load
- Gallery text truncation and wrapping
- Shift+Scroll zoom behavior in gallery
- Point cloud color saturation issues
- Hover transparency on selected frustums
- COLMAP file detection robustness

## [0.1.2] - 2026-01-13

### Added

- **Mask Overlay Support**: Load mask images from `/masks` folder mirroring the images folder structure
  - Supports exact filename match (`masks/photo.jpg`) and `.png` suffix (`masks/photo.jpg.png`)
  - Toggle mask overlay in Image Detail Modal with adjustable opacity slider
  - Press 'M' keyboard shortcut to toggle mask on/off
  - Robust path matching handles various folder structures

### Changed

- Improved file finding logic for COLMAP files (better handling of nested directories)
- Refactored frustum texture loading into dedicated hook for better code organization
- Updated README with clearer project description

## [0.1.1] - 2026-01-13

### Changed

- Simplified README to focus on user documentation
- Moved development documentation to CONTRIBUTING.md

## [0.1.0] - 2026-01-13

### Added

- **3D Point Cloud Visualization**: View colored point clouds with adjustable point size
- **Color Modes**: RGB, reprojection error, and track length coloring options
- **Camera Frustums**: Display camera positions and orientations in 3D space
- **Image Plane Textures**: Optional texture display on camera frustums
- **Image Gallery**: Browse reconstruction images in grid or list view
- **Camera Filtering**: Filter images by camera ID in the gallery
- **Image Detail Modal**: View detailed image metadata, camera parameters, and statistics
- **2D/3D Keypoint Visualization**: Toggle display of keypoints in image detail view
- **Match Visualization**: Side-by-side view of matched images with green connecting lines (COLMAP style)
- **Interactive 3D Controls**: Smooth trackball navigation with zoom, pan, and rotation
- **Fly-to-Camera**: Right-click camera to animate view to that camera's perspective
- **Point Filtering**: Filter point cloud by minimum track length
- **Rainbow Mode**: Animated CMY color cycling for selected points and cameras
- **Auto-Rotate**: Optional automatic rotation of the 3D view
- **Background Color**: Customizable viewer background color
- **Axes Display**: Optional coordinate axes overlay with adjustable opacity
- **COLMAP File Support**: Parse binary and text formats for cameras, images, and points3D
- **Database Support**: Load COLMAP SQLite database files (.db)
- **Drag-and-Drop Loading**: Drop COLMAP folders or files directly into the browser
- **Responsive Layout**: Resizable panels for gallery and 3D viewer
- **Status Bar**: Display loading status and statistics
- **GitHub Pages Deployment**: Automatic CI/CD deployment via GitHub Actions

### Technical

- Built with React 19, Three.js, React Three Fiber, and Zustand
- Vite 7 build system with optimized chunking
- Tailwind CSS 4 for styling
- Deno 2.0 / Node.js 22 runtime support
- TypeScript for type safety
- Deno native test runner for testing

[Unreleased]: https://github.com/ColmapView/colmapview.github.io/compare/v0.12.0...HEAD
[0.12.0]: https://github.com/ColmapView/colmapview.github.io/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/ColmapView/colmapview.github.io/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/ColmapView/colmapview.github.io/compare/v0.9.3...v0.10.0
[0.9.3]: https://github.com/ColmapView/colmapview.github.io/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/ColmapView/colmapview.github.io/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/ColmapView/colmapview.github.io/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/ColmapView/colmapview.github.io/compare/v0.8.2...v0.9.0
[0.8.2]: https://github.com/ColmapView/colmapview.github.io/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/ColmapView/colmapview.github.io/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/ColmapView/colmapview.github.io/compare/v0.7.8...v0.8.0
[0.7.8]: https://github.com/ColmapView/colmapview.github.io/compare/v0.7.7...v0.7.8
[0.7.7]: https://github.com/ColmapView/colmapview.github.io/compare/v0.7.6...v0.7.7
[0.7.6]: https://github.com/ColmapView/colmapview.github.io/compare/v0.7.5...v0.7.6
[0.7.5]: https://github.com/ColmapView/colmapview.github.io/compare/v0.7.1...v0.7.5
[0.7.1]: https://github.com/ColmapView/colmapview.github.io/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/ColmapView/colmapview.github.io/compare/v0.6.1...v0.7.0
[0.3.0]: https://github.com/ColmapView/colmapview.github.io/compare/v0.2.5...v0.3.0
[0.2.5]: https://github.com/ColmapView/colmapview.github.io/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/ColmapView/colmapview.github.io/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/ColmapView/colmapview.github.io/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/ColmapView/colmapview.github.io/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/ColmapView/colmapview.github.io/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/ColmapView/colmapview.github.io/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/ColmapView/colmapview.github.io/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/ColmapView/colmapview.github.io/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ColmapView/colmapview.github.io/releases/tag/v0.1.0
