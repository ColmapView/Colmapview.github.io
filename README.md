# ColmapView

A web-based 3D viewer for COLMAP reconstruction data. View point clouds, camera frustums, and image matches directly in your browser.

**[Live Demo](https://colmapview.github.io/)**

## Features

- **3D Point Cloud Visualization**: View colored point clouds with adjustable point size and color modes (RGB, reprojection error, track length)
- **Camera Frustums**: Display camera positions and orientations with optional image plane textures
- **Image Gallery**: Browse reconstruction images in grid or list view with camera filtering
- **Image Detail Modal**: View image metadata, 2D/3D keypoints, and feature matches
- **Match Visualization**: Side-by-side view of matched images with green connecting lines (COLMAP style)
- **Interactive Controls**: Smooth trackball navigation with zoom, pan, and fly-to-camera
- **Filtering**: Filter points by minimum track length, filter images by camera
- **Rainbow Mode**: Animated CMY color cycling for selected points and cameras

## Getting Started

### Prerequisites

- [Deno](https://deno.land/) 2.0+ (recommended)
- Or [Node.js](https://nodejs.org/) 20.19+

### Installation

```bash
# Clone the repository
git clone https://github.com/ColmapView/colmapview.github.io.git
cd colmapview.github.io

# Install dependencies
npm install
```

### Development

```bash
# Using Deno (recommended)
deno task dev

# Or using npm
npm run dev
```

### Build

```bash
# Using Deno
deno task build

# Or using npm
npm run build
```

### Testing

```bash
# Using Deno's native test runner
deno task test

# Watch mode
deno task test:watch

# With coverage
deno task test:coverage
```

## Usage

1. Open the application in your browser (default: http://localhost:5173)
2. Drag and drop a COLMAP reconstruction folder containing:
   - `cameras.bin` or `cameras.txt`
   - `images.bin` or `images.txt`
   - `points3D.bin` or `points3D.txt`
   - Optionally: an `images/` subfolder with the source images
3. Or load a COLMAP database file (`.db`)

## Controls

### 3D Viewer
- **Left Mouse**: Rotate view
- **Right Mouse**: Pan view
- **Scroll**: Zoom in/out
- **Shift+Scroll**: Adjust gallery thumbnail size
- **Double-click camera**: Fly to camera view
- **Right-click camera**: Open image detail modal

### Image Gallery
- **Click**: Select image (highlights 3D points)
- **Double-click**: Open image detail modal
- **Right-click**: Fly to camera view

### Keyboard Shortcuts
- **Escape**: Close modal
- **Arrow Left/Right**: Navigate images in modal

## Project Structure

```
src/
├── components/
│   ├── gallery/        # Image gallery components
│   ├── layout/         # App layout (header, sidebar, status bar)
│   ├── modals/         # Modal dialogs
│   └── viewer3d/       # 3D viewer components (PointCloud, CameraFrustums, etc.)
├── hooks/              # Custom React hooks
├── parsers/            # COLMAP file parsers (binary & text formats)
├── store/              # Zustand state management
└── types/              # TypeScript type definitions
```

## Tech Stack

- **Runtime**: Deno 2.0 / Node.js 22
- **Build**: Vite 7
- **Framework**: React 19
- **3D Rendering**: Three.js + React Three Fiber + Drei
- **State Management**: Zustand
- **Styling**: Tailwind CSS 4
- **Testing**: Deno Test

## Deployment

The application is automatically deployed to GitHub Pages on push to the `main` branch via GitHub Actions.

## License

[AGPL-3.0](LICENSE)

## Links

- [Live Demo](https://colmapview.github.io/)
- [GitHub Repository](https://github.com/ColmapView/colmapview.github.io)
- [COLMAP Documentation](https://colmap.github.io/)
