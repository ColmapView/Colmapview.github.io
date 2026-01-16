# ColmapView

The easiest way to view COLMAP reconstruction data. Open the page, drag and drop your files, done.

View point clouds, camera frustums, and image matches directly in your browser. No installation required. More visualization features than the original COLMAP GUI.

**[Live Demo](https://colmapview.github.io/)** | **[Releases](https://github.com/ColmapView/colmapview.github.io/releases)**

## Features

- **3D Point Cloud Visualization** - View colored point clouds with adjustable point size and color modes (RGB, reprojection error, track length)
- **Camera Frustums** - Display camera positions and orientations with optional image plane textures
- **Image Gallery** - Browse reconstruction images in grid or list view with camera filtering
- **Match Visualization** - Side-by-side view of matched images with green connecting lines
- **Interactive Controls** - Smooth trackball navigation with zoom, pan, and fly-to-camera
- **Rainbow Mode** - Animated color cycling for selected points and cameras

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
| Close modal | Escape |
| Previous image | Left Arrow |
| Next image | Right Arrow |

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

[AGPL-3.0](LICENSE)
