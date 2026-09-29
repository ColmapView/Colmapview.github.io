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
- **1-Point Origin** - Click one point to move the world origin to it.
- **2-Point Scale** - Click two points and type the real-world distance between them.
- **3-Point Align** - Click three points clockwise to level that plane with Y-up.
- **Interactive Gizmo** - Visual rotation/translation/scale controls.

The toolbar's **Align** button holds everything that works out *where the scene should sit*, grouped by goal — *Set the origin* (Center at Origin, or 1-Point Origin), *Set the scale* (2-Point Scale), *Level the scene* (Floor Detection, or 3-Point Align) — so the automatic route and the pick-points route to the same result sit together. **Transform** (`T`) is the other half: the gizmo and the scale/rotate/translate sliders, for a transform you dial in by hand. Results stack onto one pending transform, and both panels offer the **Reset** / **Apply** that commits it. The viewport's right-click menu offers the same operations (the sliders stay in the panel).

### Image Viewing
- **Gallery View** - Grid or list layout with virtual scrolling for large datasets.
- **Image Detail Modal** - Full camera intrinsics, pose data, and matched image browsing.
- **Match Visualization** - Animated feature connections between images.
- **Lens Undistortion** - Real-time preview for COLMAP's projective and fisheye camera models.

### Export & Sharing
- **Multiple Export Formats** - COLMAP binary/text, PLY point clouds, config YAML, ZIP archives.
- **Screenshot & Recording** - PNG/JPEG/WebP screenshots, GIF/WebM/MP4 video export with quality controls.
- **URL Sharing** - Share reconstructions with encoded camera view state. Embeddable iframes.
- **Social Sharing** - One-click share to X/LinkedIn with auto-generated stats.
- **Self-Contained Assets** - The interface typefaces (IBM Plex Sans, JetBrains Mono) ship with the app, so a page load makes no Google Fonts request — embeds and offline use stay self-contained.

### Data Loading
- **Drag & Drop** - COLMAP folders, ZIP archives, or image-only galleries.
- **URL Loading** - Load remote reconstructions with **Load URL**, or with a **Load manifest** file that points at one. The reconstruction is discovered wherever it lives in a Hugging Face repo or directory listing.
- **Images-Only Mode** - View image galleries without COLMAP reconstruction data.
- **Profile System** - Save and switch between different configuration presets.

### Point Filtering & Analysis
- **Track Length Filter** - Hide points with few observations.
- **Reprojection Error Filter** - Remove high-error outliers.
- **Statistics Display** - Point count, error distribution, co-visibility metrics.
- **Floor Plane Detection** - Automatic ground plane identification with RANSAC, aligned to the axis you choose.

### Navigation & Controls
- **Orbit & Fly Modes** - Trackball rotation or first-person flight navigation.
- **Perspective/Orthographic** - Toggle projection modes with FOV control.
- **Fly-to-Camera** - Right-click any frustum to animate the view into it.
- **Auto Orbit** - Continuous orbiting for presentations, cycling off / clockwise / counter-clockwise.
- **Keyboard Shortcuts** - Full hotkey support for all major actions, listed in the in-app Help panel.

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
   - Optionally: an `images/` subfolder with the source images, a `masks/` folder, splats (`.spz`, `.ply`, or PlayCanvas `.sog`), and a config `.yaml`
3. Or use the buttons on the landing panel: **Try a Toy!** loads the built-in sample, **Load URL** takes a remote reconstruction, and **Load manifest** takes a manifest file that points at one. The **Open example dataset** and **Download example manifest** links below them show what a real one looks like.

Subfolders are scanned automatically (`sparse/0/`, `sparse/`, or any subfolder). A ZIP archive works in place of a folder, and a folder of images alone loads as a gallery with no reconstruction.

## Interface Tour

**Viewer toolbar** (right edge) - four clusters separated by hairlines:

| Cluster | Contains |
|---------|----------|
| View | View options, axes/grid, camera mode, background, Transform, Align |
| Data | Point cloud, camera display, matches, selection highlight, rigs |
| Capture | Screenshot, Share, Export |
| App | Settings, gallery toggle |

The matches and selection-highlight buttons appear only while cameras are shown.

**Settings > Tools** lists the app's tool windows in one place: *Delete Images from Model*, *Convert Camera Model*, *Floor Detection*, and *Auto-hide 3D Elements* (the last appears once the idle-hide timeout is on). Each keeps its original entry point too — deletion and camera conversion also live in Export, floor detection also in Align.

**Help panel** - titled *Help*, with **Essentials**, **Camera Controls**, and **About** tabs. Open it with `I` or `?`, or from the status bar's `⌨ Shortcuts` entry (on a phone, the touch status bar's `? Help`).

**Gallery** - the divider between the viewport and the gallery is draggable to resize it, and carries a chevron handle that collapses the gallery and brings it back. The toolbar's gallery button does the same from the far side.

**Background** - a fresh session opens on a dark viewport that matches the interface surface. `B` toggles between white and black; a saved profile keeps whatever background it had.

## Controls

### 3D Viewer
| Action | Control |
|--------|---------|
| Rotate | Left mouse drag |
| Pan | Right mouse drag |
| Zoom | Scroll wheel |
| Select camera | Click on camera |
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
| Show help | I or ? |
| Reset view | R |
| Axis views | 1-6 |
| Toggle grid | G |
| Toggle background | B |
| Toggle orbit/fly mode | C |
| Cycle horizon lock | H |
| Cycle auto orbit | O |
| Cycle point cloud color mode | P |
| Cycle frustum display | F |
| Cycle matches display | M |
| Toggle undistorted view | U |
| Switch to next splat file | N |
| Toggle transform gizmo | T |
| Fly (in fly mode) | W A S D, Q down, E or Space up, Shift to boost |
| Adjust point cloud size | Ctrl + Scroll |
| Adjust camera frustum size | Alt + Scroll |
| Previous / next image | ← → |
| Fly to previous / next image | Shift + ← → |
| Close modal, or cancel an armed Align tool | Escape |
| Reset guide tips | Shift + 0 |
| Random COLMAP joke | Shift + Z |

Axes are hidden on a fresh load and toggle from the toolbar's axes/grid button or the right-click menu, not from `G`.

## Supported Camera Models

ColmapView supports all 18 COLMAP camera models (ids 0-17), with real-time undistortion for the projective and fisheye models:

- SIMPLE_PINHOLE, PINHOLE
- SIMPLE_RADIAL, RADIAL
- OPENCV, OPENCV_FISHEYE, FULL_OPENCV
- FOV
- SIMPLE_RADIAL_FISHEYE, RADIAL_FISHEYE
- THIN_PRISM_FISHEYE
- RAD_TAN_THIN_PRISM_FISHEYE
- SIMPLE_DIVISION, DIVISION
- SIMPLE_FISHEYE, FISHEYE
- EUCM
- EQUIRECTANGULAR

Notes:

- Models 11-16 (RAD_TAN_THIN_PRISM_FISHEYE, SIMPLE_DIVISION, DIVISION, SIMPLE_FISHEYE, FISHEYE, EUCM) render image previews in cropped mode.
- EQUIRECTANGULAR (id 17) is a spherical (360°) model with no planar undistortion. These cameras render as lat/long grid spheres; selecting one shows its panorama as a photosphere. With `U` on, the view steps inside the sphere at the capture center and shows the photo through a viewport-centered circle, with the live reconstruction around it — hover the circle to fade the photo, scroll inside it to zoom, and scroll outward with the pointer outside it to leave.

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
