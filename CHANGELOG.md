# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/ColmapView/colmapview.github.io/compare/v0.3.0...HEAD
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
