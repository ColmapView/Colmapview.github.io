# ColmapView

The easiest way to view COLMAP reconstruction data. Open the page, drag and drop your files, done.

View point clouds, camera frustums, and image matches directly in your browser. No installation required. More visualization features than the original COLMAP GUI.

**[Live Demo](https://colmapview.github.io/)** | **[Releases](https://github.com/ColmapView/colmapview.github.io/releases)**

## Highlight Features

### 3D Visualization
- **Point Cloud Rendering** - GPU-accelerated with WASM. Color by RGB, reprojection error, or track length. Adjustable size, opacity, and thinning.
- **Camera Frustums** - Display as frustum pyramids, arrows, or textured image planes. Color by camera ID or rig frame.
- **Multi-Camera Rig Support** - Visualize synchronized camera connections with animated highlighting.
- **9 Coordinate Systems** - COLMAP, OpenCV, Three.js, OpenGL, Vulkan, Blender, Houdini, Unity, Unreal.

### Transform & Alignment Tools
- **1-Point Origin** - Set world origin at any selected 3D point.
- **2-Point Scale** - Define real-world scale between two points with distance input.
- **3-Point Plane Alignment** - RANSAC floor detection with normal alignment to any axis.
- **Interactive Gizmo** - Visual rotation/translation/scale controls.

### Image Viewing
- **Gallery View** - Grid or list layout with virtual scrolling for large datasets.
- **Image Detail Modal** - Full camera intrinsics, pose data, and matched image browsing.
- **Match Visualization** - Animated feature connections between images.
- **Lens Undistortion** - Real-time preview for all 11 COLMAP camera models.

### Export & Sharing
- **Multiple Export Formats** - COLMAP binary/text, PLY point clouds, config YAML, ZIP archives.
- **Screenshot & Recording** - PNG/JPEG/WebP screenshots, GIF/WebM/MP4 video export with quality controls.
- **URL Sharing** - Share reconstructions with encoded camera view state. Embeddable iframes.
- **Social Sharing** - One-click share to X/LinkedIn with auto-generated stats.

### Data Loading
- **Drag & Drop** - COLMAP folders, ZIP archives, or image-only galleries.
- **URL Loading** - Load remote reconstructions via URL or JSON manifest.
- **Images-Only Mode** - View image galleries without COLMAP reconstruction data.
- **Profile System** - Save and switch between different configuration presets.

### Point Filtering & Analysis
- **Track Length Filter** - Hide points with few observations.
- **Reprojection Error Filter** - Remove high-error outliers.
- **Statistics Display** - Point count, error distribution, co-visibility metrics.
- **Floor Plane Detection** - Automatic ground plane identification with RANSAC.

### Navigation & Controls
- **Orbit & Fly Modes** - Trackball rotation or first-person flight navigation.
- **Perspective/Orthographic** - Toggle projection modes with FOV control.
- **Fly-to-Camera** - Click any frustum to animate camera view.
- **Auto-Rotate** - Continuous rotation for presentations.
- **Keyboard Shortcuts** - Full hotkey support for all major actions.

### Performance
- **WASM Acceleration** - Memory-efficient parsing for large reconstructions (1M+ points).
- **Lazy Loading** - 2D points loaded on-demand to handle 1.9GB+ images.bin files.
- **GPU Instancing** - Efficient rendering of thousands of cameras.
- **Virtual Scrolling** - Smooth gallery navigation with 10,000+ images.

## Usage

1. Open https://colmapview.github.io/ in your browser
2. Drag and drop a COLMAP reconstruction folder containing:
   - `cameras.bin` or `cameras.txt`
   - `images.bin` or `images.txt`
   - `points3D.bin` or `points3D.txt`
   - Optionally: an `images/` subfolder with the source images
3. Or load a COLMAP database file (`.db`)

## Controls

### 3D Viewer
| Action | Control |
|--------|---------|
| Rotate | Left mouse drag |
| Pan | Right mouse drag |
| Zoom | Scroll wheel |
| Fly to camera | Right-click on camera |
| Open image details | Double-click on camera |
| Point size | Ctrl + Scroll |
| Frustum size | Alt + Scroll |

### Image Gallery
| Action | Control |
|--------|---------|
| Select image | Click |
| Open details | Double-click |
| Fly to camera | Right-click |
| Adjust thumbnail size | Shift + Scroll |

### Keyboard Shortcuts
| Action | Key |
|--------|-----|
| Reset view | R |
| Axis views | 1-6 |
| Toggle axes/grid | G |
| Toggle background | B |
| Cycle camera mode | C |
| Cycle frustum display | F |
| Cycle point color mode | P |
| Toggle matches | M |
| Toggle undistortion | U |
| Transform gizmo | T |
| Close modal | Escape |
| Navigate images | ← → |

## Supported Camera Models

ColmapView supports all 11 COLMAP camera models with real-time undistortion:

- SIMPLE_PINHOLE, PINHOLE
- SIMPLE_RADIAL, RADIAL
- OPENCV, OPENCV_FISHEYE, FULL_OPENCV
- FOV
- SIMPLE_RADIAL_FISHEYE, RADIAL_FISHEYE
- THIN_PRISM_FISHEYE

## Links

- [COLMAP Documentation](https://colmap.github.io/)
- [GitHub Repository](https://github.com/ColmapView/colmapview.github.io)
- [Report Issues](https://github.com/ColmapView/colmapview.github.io/issues)

## Acknowledgements

This project is built to visualize reconstructions from [COLMAP](https://colmap.github.io/), a general-purpose Structure-from-Motion (SfM) and Multi-View Stereo (MVS) pipeline developed by Johannes L. Schönberger and contributors.

If you use COLMAP in your research, please cite their papers:

> Schönberger, J.L., and Frahm, J.M. (2016). Structure-from-Motion Revisited. *Conference on Computer Vision and Pattern Recognition (CVPR)*.

> Schönberger, J.L., Zheng, E., Pollefeys, M., and Frahm, J.M. (2016). Pixelwise View Selection for Unstructured Multi-View Stereo. *European Conference on Computer Vision (ECCV)*.

## License

[AGPL-3.0](LICENSE) with attribution requirement per Section 7(b).

**If you deploy this software**, you must display visible attribution (e.g., "Powered by ColmapView") with a link to this repository. See [NOTICE](NOTICE) for full details.
