# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/ColmapView/colmapview.github.io/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ColmapView/colmapview.github.io/releases/tag/v0.1.0
