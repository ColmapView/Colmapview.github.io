# Agent controls

Implementation status, 2026-09-07: the contract/settings foundation and local MCP
pairing transport are implemented.
This is **partial coverage of the agent-native plan**, not completion of packets A–J.

## Using an existing browser tab

For MCP, ask the agent to call `colmap_pair`, then paste its code in
Settings → Agent controls → MCP pairing code → Connect MCP. Connecting enables
control and does not require a separate Enable click. For browser-native WebMCP,
use Enable agent control. The persistent Stop agent
button revokes access. Closing the dialog keeps the session running. Stop,
reload/navigation, or 30 minutes of elapsed time revokes it. Access is off by
default and is not persisted. Enabling does not automatically connect an agent.

Three adapters use the same implementation:

- A local stdio MCP server connects to the paired tab over a loopback WebSocket.
  See [MCP setup and tools](mcp-bridge.md). No browser debugging connection or
  computer-use tool is needed.

- Browsers with `document.modelContext.registerTool` receive
  `colmap_list_features`, `colmap_read_state`, and `colmap_execute` tools.
- A browser agent already connected to this tab can evaluate the session-bound
  `window.colmapAgent` bridge. A retained bridge cannot access a later session.

WebMCP follows the [Chrome imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api).
Native registration/cancellation is covered by mock-adapter tests. Native WebMCP
was unavailable in the local browser; the ordinary bridge was tested live.
The stdio MCP server and pairing relay ship in `scripts/mcp/`. No extension is required.
The bridge is a cooperation interface, not a sandbox against scripts or a browser
debugger that already have full access to the page.

## Implemented contracts

Discovery returns 81 contracts: 68 persisted properties from the existing
point-cloud, camera, UI, export-settings and rig registry, the UI theme, and
`scene.transform.preview`, `dataset.loadUrl`, seven camera operations, image
selection, image viewing and transform presets.

Camera operations (`camera.lookAt`, `camera.orbit`, `camera.pan`, `camera.zoom`,
`camera.preset`, `camera.image`, `camera.stop`) use a controller registered by the
mounted TrackballControls. It updates the actual Three.js camera and its pivot,
distance and motion refs; it shares pointer rotation, fitted-view and image-pose
calculations with human controls. Commands apply immediately and stop old motion;
they clear command undo history. `readState.camera` samples the live camera.
Projection and FOV remain settings contracts. Human gestures remain enabled.

`colmap_query_images` exposes bounded pages of image IDs and names, with dataset
generation checks across pages. `selection.image` selects/deselects, `image.open`
opens/closes the normal image viewer, and `scene.transform.preset` applies the
existing reset/center/normalize actions. These three contracts support shared undo.
No new automated screen interaction or arbitrary JavaScript tool is involved.

`dataset.loadUrl` accepts `{url}` with an HTTP(S) manifest, ZIP, splat or COLMAP
base URL. The mounted DropZone registers its existing `useUrlLoader` callback;
human and agent loading therefore share validation, parsing and load guards.
The command's success means `job_accepted`, not completed. Poll
`values['dataset.loadUrl']` for the returned job ID and terminal status, and wait
for `dataset.loading` to be false before navigation. Errors appear in the job.
Loads replace data, clear command history, cannot be undone/cancelled and continue
after session revocation. A failed load may leave changed data or caches. Local
file picking remains human-only. No arbitrary filesystem path access was added.

Each has an input schema, description, availability, state read, a shared validated
handler, a schema-driven human control in the Agent controls dialog, an agent
binding, and focused tests. Existing Theme selection also uses the dispatcher.
Other original panels retain their coordinated store setters; changes are
detected and invalidate stale commands/history. Migrating every original panel,
shortcut and gesture to the dispatcher is pending.

Settings cover point appearance/filtering, frustum appearance, navigation
preferences/auto-orbit, background, axes/grid, matches, masks, gallery settings,
rig appearance, and export preferences. An export preference does not perform
an export. Success means store state was applied, not that animation or rendering
has finished.

Transform preview requires a loaded reconstruction and accepts the full numeric
display transform without modifying reconstruction coordinates:

```
x_scene = scale * R_XYZ * x_dataset + translation
```

`rotationX/Y/Z` are XYZ Euler radians; `translationX/Y/Z` use dataset units.
Scale must be positive and at most 1,000,000. Every number must be finite.
This is numeric preview, not landmark solving, floor detection or permanent Apply.

## Browser-agent example

After the human enables control, execute in the already-open tab:

```js
const api = window.colmapAgent;
const catalog = api.listFeatures(); // Schemas and explicit unsupported list.
const state = api.readState();
const result = api.execute({
  protocolVersion: 1,
  sessionId: state.sessionId,
  requestId: crypto.randomUUID(),
  feature: 'settings.pointCloud.colorMode',
  operation: 'set',
  expectedRevision: state.revision,
  datasetGeneration: state.datasetGeneration,
  input: { value: 'trackLength' },
});
```

Read state before every new mutation. On stale revision/dataset errors, inspect
the new state and issue a new request ID if the operation is still appropriate.
For a transport retry, reuse the identical envelope. Reusing an ID with different
arguments fails. A session accepts at most 1,000 distinct request IDs; then the
user must start a new session. Old IDs are never evicted and re-executed. Requests
are limited to 16,384 serialized characters; these tools do not transfer assets.

Undo uses the same envelope with `feature: 'history'`, `operation: 'undo'`, and
`input: {}`. Up to 100 transactions are retained. Undo restores coupled setter
effects together. Ordinary UI setting changes or changes to the reconstruction,
WASM reconstruction or loaded files clear history. Undo also checks affected
fields immediately before restoration. It does not overwrite conflicting changes.
Activity retains the latest 500 operations. There is no persistent audit log.

## Remaining implementation work

| Packet | Current boundary / remaining work |
| --- | --- |
| A: Inventory | Settings inventory exists; exhaustive operation/gesture inventory remains. |
| B: Contracts | Synchronous setting/preview execution exists; output/event schemas and async lifecycle remain. |
| C: History | Conflict-aware setting/preview undo exists; async transactions, redo and gesture coalescing remain. |
| D: Settings | Registered settings have both interfaces; most original panels need dispatcher bindings. |
| E: Camera/selection | Live pose, look-at, orbit, pan, zoom, fitted views, image-camera navigation, stop and image selection exist. Animated paths, point picking and multiselection remain. |
| F: Transport | Stdio MCP server, local one-use pairing, browser bridge and WebMCP adapter exist; finer scopes and published installation package remain. |
| G: Alignment | Numeric preview exists; proposals, solving, bake and rollback remain. |
| H: Dataset/editing | URL load jobs and generation invalidation exist; local file picking, cancellation, deletion and conversion remain. |
| I: Media/inspection | Display/preferences exist; paginated inspection, capture, recording, export and artifact transfer remain. |
| J: Rollout | Foundation tests exist; whole-application parity and native-browser interoperability remain. |

Unsupported operations are reported by discovery and cannot be invoked through
the adapter. A related setting is not support for the whole workflow. New
workflows require contracts, human bindings, completion/cancellation semantics,
resource policies and parity tests.

## Validation

Tests cover every registered setting mutation and undo, input validation,
human/agent parity, stale-state rejection, coupled restoration, session lifecycle,
idempotency limits, retained bridges, registration failure/cancellation, and the
human dialog. After adding the MCP transport, the full suite passes 3,429 tests
across 491 files. Two additional Node relay tests pass via `npm run test:mcp`.
Lint, TypeScript and production build pass.

The 13 existing Chromium UI-polish regressions pass against both the production
bundle and the repaired development server. Live checks verified theme mutation,
numeric transform preview/undo with a loaded local fixture, Stop/revocation, and
dialog geometry at desktop, 390×844 and 640×360. These do not establish native WebMCP
interoperability or parity for pending workflows.

The dev-server check uncovered Vite scanning HTML fixtures inside the local
Emscripten SDK. Dependency discovery now starts at `index.html`, and native SDK
and scratch/test-output directories are excluded from the development watcher.
