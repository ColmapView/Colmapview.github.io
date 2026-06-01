# Architecture Guide

This project is a Vite, React, TypeScript viewer for COLMAP reconstructions. Keep changes aligned with these module boundaries so future work stays easy to locate, test, and review.

## Dependency Direction

UI should depend on application boundaries, not low-level implementation helpers. The preferred flow is:

`components/` -> `hooks/` or `nodes/` -> `store/`, `dataset/`, `parsers/`, `utils/`

Core modules should not import from `components/`. Parser and dataset code should stay UI-free.

## Module Ownership

- `components/`: render UI, wire events, and compose hooks. Avoid source-specific file loading, storage policies, parser details, and direct browser globals when a shared helper exists.
- `dataset/`: own image and mask access across local, URL, manifest, and ZIP sources. Components should use `useDataset()` instead of importing image-file utilities.
- `store/`: own shared app state, persistence, and user actions. Keep UI rendering out of store actions.
- `nodes/`: expose derived viewer state for camera, selection, navigation, and matches. Use nodes when multiple components need the same derived state.
- `hooks/`: own reusable React behavior, subscriptions, and component-facing view models.
- `parsers/`: read and write COLMAP data. Keep this layer deterministic and independent of React.
- `utils/`: framework-light helpers and shared policies such as confirmation, cursor ownership, and storage key handling.
- `theme/` and `icons/`: design tokens, reusable class names, and visual primitives.

## Facades And Controllers

When a component or hook needs many store selectors, node selectors, and actions, introduce a feature-local facade or controller instead of spreading those subscriptions across render code. Use names that describe the boundary, such as `useViewerControlsController` or `useGlobalContextMenuActionDeps`.

Facades should adapt stores and nodes into typed dependencies. Pure executors and policies should receive those dependencies as parameters and avoid importing stores directly. This keeps behavior testable with plain objects while limiting store wiring to one feature-owned hook.

`useUIStore` remains a shared domain store, so treat workflow-local facades as the documented selector boundary for UI state. A facade can be small when it is the explicit store boundary for a component, but it must stay feature-local, return only the fields the caller needs, and have a colocated test. Do not add a facade as a pass-through for non-store helpers; use direct imports for pure helpers and controllers for workflows that need orchestration.

Non-component store hook calls are allowed only in documented boundary modules: dataset public hooks, node selector hooks, and application/controller hooks that translate store state into workflow dependencies. Those callers are recorded in `src/components/componentStoreBoundary.test.ts` so new direct store subscriptions outside a boundary fail review instead of becoming invisible coupling.

The boundary regression test in `src/components/componentStoreBoundary.test.ts` enforces two rules:

- Production component files must not call Zustand store hooks outside `*StoreFacade` modules.
- Every production store facade must have a colocated test.
- Direct store hook calls outside component facades must stay in the documented boundary caller list.

## Popup Layering

Popup z-index behavior is centralized in `theme/zIndex.ts`, CSS variables, and the popup inventory tests. New modal, context-menu, hover-card, or tooltip surfaces should use the existing layer constants and update `components/ui/popupLayerInventory.ts` when ownership paths move. Do not change z-index values as part of organization-only refactors.

## Testing Strategy

Use colocated Vitest files for pure helpers, store actions, hooks, and parser behavior. Use builders in `src/test/builders/` for cameras, images, reconstructions, loaded files, and dataset state instead of hand-assembling large object graphs in each test.

Use Playwright in `e2e/` for browser behavior and real workflow coverage. Prefer locator assertions and app state signals over fixed sleeps.

## Validation Commands

- `npm run check`: lint, unit tests, and production build.
- `npx playwright test --workers=1`: browser workflow validation.
- `npm run test:pycolmap`: Python compatibility checks for parser/export changes.

Run the narrowest relevant command while editing, then `npm run check` before handoff. Run Playwright when changing viewer, modal, loading, export, or keyboard/mouse behavior.

## Boundary Enforcement

ESLint guards the first high-risk boundaries:

- `src/components/**` must not import `utils/imageFileUtils` directly.
- `src/dataset/**`, `src/parsers/**`, and `src/store/**` must not import UI components.

If a future change needs to cross these boundaries, add a small public API in the owning module instead of importing through the boundary.
