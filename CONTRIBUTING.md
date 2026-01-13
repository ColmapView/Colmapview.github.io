# Contributing to ColmapView

## Prerequisites

- [Deno](https://deno.land/) 2.0+ (recommended)
- Or [Node.js](https://nodejs.org/) 22+

## Installation

```bash
git clone https://github.com/ColmapView/colmapview.github.io.git
cd colmapview.github.io
npm install
```

## Development

```bash
# Using Deno (recommended)
deno task dev

# Or using npm
npm run dev
```

Open http://localhost:5173 in your browser.

## Build

```bash
# Using Deno
deno task build

# Or using npm
npm run build
```

## Testing

```bash
# Run tests
deno task test

# Watch mode
deno task test:watch

# With coverage
deno task test:coverage
```

## Project Structure

```
src/
├── components/
│   ├── gallery/        # Image gallery components
│   ├── layout/         # App layout (header, sidebar, status bar)
│   ├── modals/         # Modal dialogs
│   └── viewer3d/       # 3D viewer (PointCloud, CameraFrustums, etc.)
├── hooks/              # Custom React hooks
├── parsers/            # COLMAP file parsers (binary & text)
├── store/              # Zustand state management
└── types/              # TypeScript type definitions
```

## Tech Stack

- **Runtime**: Deno 2.0 / Node.js 22
- **Build**: Vite 7
- **Framework**: React 19
- **3D**: Three.js + React Three Fiber + Drei
- **State**: Zustand
- **Styling**: Tailwind CSS 4
- **Testing**: Deno Test

## Release Process

1. Update `CHANGELOG.md` - move items from `[Unreleased]` to new version
2. Update version in `package.json` and `deno.json`
3. Commit: `git commit -m "Release vX.Y.Z"`
4. Tag: `git tag -a vX.Y.Z -m "ColmapView vX.Y.Z"`
5. Push: `git push origin main && git push origin vX.Y.Z`
6. Create release: `gh release create vX.Y.Z --title "ColmapView vX.Y.Z" --notes "..."`

## Deployment

The application automatically deploys to GitHub Pages on push to `main` via GitHub Actions.
