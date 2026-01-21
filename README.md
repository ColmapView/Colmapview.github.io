# ColmapView

The easiest way to view COLMAP reconstruction data. Open the page, drag and drop your files, done.

View point clouds, camera frustums, and image matches directly in your browser. No installation required. More visualization features than the original COLMAP GUI.

**[Live Demo](https://colmapview.github.io/)** | **[Releases](https://github.com/ColmapView/colmapview.github.io/releases)**

## Features

- **3D Point Cloud Visualization** - Color modes: RGB, reprojection error, track length. Filter by track length and error.
- **Camera Frustums** - Multiple display modes (frustum, arrow, image plane). Color by camera or rig frame.
- **Multi-Camera Rig Support** - Visualize rig connections and color cameras by synchronized frame.
- **Sim3D Transform Tools** - Scale, rotate, translate. 1-point origin, 2-point scale, 3-point plane alignment.
- **Lens Undistortion** - Real-time undistortion preview for all COLMAP camera models.
- **Image Gallery** - Grid/list view with camera filtering and thumbnail size control.
- **Match Visualization** - Side-by-side matched images with feature point connections.
- **URL Sharing & Embed** - Share reconstructions via URL. Embed viewer in external pages.
- **Export** - COLMAP binary/text, PLY point clouds, configuration presets.

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

### Image Gallery
| Action | Control |
|--------|---------|
| Select image | Click |
| Open details | Double-click |
| Fly to camera | Right-click |
| Adjust thumbnail size | Shift + Scroll |

### Keyboard
| Action | Key |
|--------|-----|
| Reset view | R |
| Toggle axes/grid | G |
| Toggle background | B |
| Cycle camera mode | C |
| Cycle frustum display | F |
| Cycle point color mode | P |
| Toggle matches | M |
| Toggle undistortion | U |
| Transform gizmo | T |
| Axis views | 1, 2, 3 |
| Close modal | Escape |
| Navigate images | ← → |

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
