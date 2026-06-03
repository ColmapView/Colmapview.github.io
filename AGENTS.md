# Repository Guidelines

## Project Structure & Module Organization

This is a Vite + React 19 TypeScript app for viewing COLMAP reconstructions. Core app code lives in `src/`: `components/` contains UI and viewer surfaces, `hooks/` contains React hooks, `store/` holds Zustand stores/actions, `dataset/` abstracts image and mask access, `parsers/` handles COLMAP formats, and `utils/` contains shared helpers. End-to-end tests live in `e2e/`, unit tests are colocated as `*.test.ts` or `*.test.tsx`, Python round-trip tests live in `tests/pycolmap/`, static assets and WASM files live in `public/`, and documentation lives in `docs/`.

## Build, Test, and Development Commands

- `npm install`: install project dependencies.
- `npm run dev`: start the Vite dev server at `http://localhost:5173`.
- `npm run build`: run TypeScript project build and create the production Vite bundle.
- `npm run lint`: run ESLint across source and tests.
- `npm run test:run`: run Vitest unit tests once.
- `npx playwright test --workers=1`: run Playwright E2E tests serially for stable local validation.
- `npm run build:wasm`: rebuild the COLMAP WASM package from `colmap-wasm/`.
- `npm run test:pycolmap`: run Python fixture compatibility tests.

## Coding Style & Naming Conventions

Use TypeScript, React function components, and existing local patterns before introducing new abstractions. Keep shared policies in helpers or stores rather than duplicating behavior in components. Use two-space indentation where files already do, `PascalCase` for components, `useCamelCase` for hooks, and descriptive `camelCase` for functions and variables. Prefer accessible controls with stable labels over brittle DOM selectors. Run `npm run lint` before handoff.

## Testing Guidelines

Use Vitest with jsdom for unit and component behavior. Keep tests close to the code under test and name them `*.test.ts` or `*.test.tsx`. Use Playwright for browser behavior in `e2e/`; prefer locator expectations over fixed sleeps. Add focused tests when changing shared helpers, parsing, store actions, dataset access, or viewer workflows.

## Commit & Pull Request Guidelines

Git history uses concise, scope-oriented summaries such as `v0.6.1: share buttons...` and `Mobile touch UX: ...`. Keep commits focused and explain user-visible or architectural impact. Pull requests should include a short description, linked issue when available, validation commands run, and screenshots or recordings for UI changes.

## Security & Configuration Tips

Do not commit generated reports, `dist/`, or local Playwright artifacts. Use `.tmp/` for agent scratch files instead of adding root-level temporary files. Treat dropped files and URL-loaded data as untrusted; validate manifests and parser inputs before use. Keep persistent storage changes routed through `STORAGE_KEYS` and migration helpers.
