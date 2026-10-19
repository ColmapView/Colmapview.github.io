# Contributing to ColmapView

Use Node.js 22.12 or later and npm. CI uses Node 22; `.nvmrc` selects that major version for version managers. The committed `package-lock.json` is the dependency source of truth.

## Start developing

```sh
git clone https://github.com/ColmapView/colmapview.github.io.git
cd colmapview.github.io
npm ci
npm run dev
```

Open `http://localhost:5173`. Run commands from this repository's root. The viewer works with the built-in sample and committed WASM assets; provider credentials and a WASM toolchain are optional.

The app uses Vite, React, TypeScript, Three.js and Zustand. Start with the [architecture guide](docs/architecture.md) for module ownership, [design system](docs/design-system.md) for UI work, or [dataset manifests](docs/dataset-manifests.md) for loading behavior. Keep scratch work and generated reports under ignored `.tmp/`.

## Get feedback while editing

| Command | Checks |
| --- | --- |
| `npm run check:code` | Lint and all TypeScript projects: app, tooling, browser tests and unit tests |
| `npm test -- src/hooks/urlLoaderManifestFetch.test.ts` | Watch one Vitest file; omit the path to watch the full suite |
| `npm run test:run -- src/hooks/urlLoaderManifestFetch.test.ts` | Run one Vitest file once |
| `npm run typecheck:tests` | Check unit tests and their imports without lint or a build |
| `npm run check` | Code checks, unit tests and production build; the same core check as CI |
| `npm run test:deployment:config` | Hosting configuration and artifact policy tests without browsers |

Run a focused command while editing, then `npm run check` before handoff. Type checking happens before the full unit suite so type errors surface early. `npm run build` also checks types when run independently. For coverage, use `npm run test:coverage`.

## Browser workflows

Install Chromium once for the locked Playwright version:

```sh
npx playwright install chromium
npm run test:e2e -- e2e/drop-zone.spec.ts
```

`npm run test:e2e` runs the Chromium project with one worker, matching the normal CI project. Add a spec path or `--grep` to focus a run. The suite starts an isolated Vite server at `http://localhost:5187`; set `COLMAP_WEBVIEW_E2E_PORT` to change that port. Install browsers again after upgrading Playwright.

Use `npm run test:e2e:ui`, `npm run test:e2e:headed`, or `npm run test:e2e:debug` for interactive debugging of the same project. Other browser/GPU projects stay available explicitly:

```sh
npx playwright install firefox
npx playwright test --project=firefox --workers=1 e2e/drop-zone.spec.ts
```

See `playwright.config.ts` for the WebGPU projects. Hardware and bicycle tests require their documented GPU or local dataset fixtures. Production artifact checks use `npm run test:deployment` and build synthetic hosting profiles without account credentials.

## Optional tools and troubleshooting

- **WASM:** normal development uses `public/wasm/`. `npm run build:wasm` requires the separate local `colmap-wasm/` source and Emscripten/CMake toolchain.
- **COLMAP round trips:** `npm run test:pycolmap` needs `uv` and the optional dataset described in the [pycolmap test guide](tests/pycolmap/README.md).
- **Local providers:** follow the relevant [Drive](docs/google-drive-loading.md), [Hugging Face](docs/hugging-face-loading.md), or [bucket](docs/bucket-storage.md) guide. The [Hub development guide](https://github.com/ColmapView/colmapview_hub/blob/main/docs/development.md) covers the separate service.
- **Worktrees:** install dependencies in each checkout. A shared or junctioned `node_modules` can cause Vite to report font assets outside its serving allow list; use checkout-local dependencies to resolve that error.
- **Port in use:** stop the old test server or choose another `COLMAP_WEBVIEW_E2E_PORT`. Browser tests intentionally refuse to reuse an unrelated development server.

## Releases

Update `CHANGELOG.md` and set both package versions with `npm version X.Y.Z --no-git-tag-version`. Run the checks, commit the release, then create a matching `vX.Y.Z` tag. The [dual-host deployment guide](docs/dual-hosting.md) owns host configuration, publication and verification details.

Pushes to `main` publish `/dev/`. Version tags publish `/vX.Y.Z/`, update `/latest/`, and publish the configured custom viewer after validation. A tag that disagrees with `package.json` is rejected.
