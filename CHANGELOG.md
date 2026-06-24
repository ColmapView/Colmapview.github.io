# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/ColmapView/colmapview.github.io/compare/v0.8.0...HEAD
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
