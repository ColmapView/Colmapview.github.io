# ColmapView: shared human and agent operation

Status: implementation in progress, 2026-09-07. See [current interfaces and remaining coverage](agent-control.md).

Detailed execution packets, ownership, schemas, acceptance tests and agent/effort
recommendations are in [the implementation specification](agent-native-implementation-spec.md).

## Product outcome

A user opens ColmapView, loads a dataset, and connects a compatible agent to that
same tab. The agent can inspect the scene, change appearance, move the camera,
select geometry, and propose alignment. Changes appear in the normal interface.
The user can intervene, stop agent actions, or undo supported changes.

Human operation remains complete without an agent, server, account, or API key.
There is no separate agent-only viewer and no mandatory chat sidebar. Continue
using the compact design system, light/dark themes, and existing mobile layouts.

## Architecture decision

**Mandatory product rule: every feature has one contract and two interfaces—human
and agent.** The command examples below are an implementation starting point,
not the final coverage boundary. See [feature contract specification](feature-contracts.md)
for the required registry, coverage inventory, and completion gates.

```text
Human panels / shortcuts / menus       External agent
              |                             |
              |                   WebMCP or browser bridge
              |                             |
              +------ Command services -----+
                            |
                 Existing coordinated actions
                  Zustand + scene controllers
                            |
                   Same visible scene
```

Use a repo-owned typed command layer. Human controls call the internal services;
agent adapters call a validated dispatcher with session permissions. Both paths
share validation, effects, history, and results. Do not expose arbitrary store
mutation, JavaScript evaluation, filesystem paths, or raw Three.js objects.

Transport adapters are optional, lazy-loaded modules. WebMCP is the preferred
browser-native adapter where supported. A separately packaged local MCP/browser
bridge supports external clients operating an explicitly selected existing tab.
Keep the static GitHub Pages deployment; no public control server is required.

WebMCP remains experimental. Chrome documents an origin trial and a development
flag; feature-detect and verify the actual browser/agent combination. Opening the
site alone does not connect an arbitrary agent. A bridge must be installed and
paired, or the browser agent must support WebMCP. Keep experimental API calls
isolated rather than making core services depend on their spelling or lifecycle.

Sources checked September 7, 2026:
- https://developer.chrome.com/docs/ai/webmcp
- https://developer.chrome.com/docs/ai/agents
- https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session

## Existing foundations and gaps

| Area | Reuse | Required work |
| --- | --- | --- |
| Appearance | `src/store/stores/cameraStore.ts`, point-cloud store, panel facades | Typed setters with explicit allowed fields and shared validation |
| Camera | CameraViewState, trackball controller, fly-to behavior | Imperative controller interface, animation completion/cancellation, coordinate contract |
| Alignment | `src/store/actions/transformActions.ts`, transformStore, AlignPanel, point picking | Preview transaction and validated numeric/stable-ID inputs independent of mouse picking |
| History | Camera navigation history | General bounded command history; existing navigation history is not full undo |
| Capture | ScreenshotCapture and capture hooks | Return an artifact after the requested scene revision renders; do not force a download |
| Dataset access | DatasetManager and existing loading/parsing flows | Async operation status and dataset generation checks |
| Approval | ConfirmationHost and `src/utils/confirmation.ts` | Agent proposals bound to exact operation and scene revision |

## Human experience

1. Add an Agent entry under Settings, below existing customization controls.
   Show supported connection methods and honest unavailable/not-connected states.
2. Connecting identifies the agent and selected tab, and lets the user grant
   inspection, reversible edits, and artifact-sharing scopes for this session.
3. Once connected, show a compact status indicator and accessible Stop control.
   An expandable activity list shows readable actions and outcomes, not protocol JSON.
4. Camera/color changes execute directly within the granted scope. Geometry
   changes show a preview with Apply and Cancel; retain normal human workflows.
5. User camera dragging cancels an agent camera animation. Human edits to the
   same resource invalidate queued conflicting commands and pending previews.
6. Stop revokes the agent lease, cancels queued/abortable work, and prevents stale
   completions from changing state. It does not erase completed user-visible work.
7. Pointer lock, fullscreen, local file selection, and downloads retain browser
   user-activation requirements; tools report when a user gesture is needed.

For mobile, use the existing responsive panel/dialog recipes and touch targets.
No new permanent toolbar clutter while disconnected. Keyboard and screen-reader
users must be able to connect, inspect actions, stop, apply, cancel, and undo.

## Command contract

Proposed modules: `src/commands/{schemas,registry,dispatcher,operations,history}.ts`,
domain services below `src/commands/`, adapters below `src/agent/`, and a small
Agent settings/activity component. Reuse the existing Zod dependency.

Every external command includes a protocol version, request ID, session ID,
dataset generation when relevant, and optional expected resource revision.
Return structured success/error with affected revisions, operation ID, and an
accurate completion state. Stable errors include INVALID_ARGUMENT, NOT_READY,
STALE_STATE, CANCELLED, PERMISSION_REQUIRED, UNSUPPORTED, and RESOURCE_MISSING.

- Prefer `set_visibility(true)` and explicit values over toggles/cycles.
- Deduplicate request IDs within a bounded session window. Same ID/different
  arguments is an error. Relative camera rotations require this protection.
- Maintain semantic revisions separately from FPS/frame counters. Continuous
  pointer movement updates camera revision at interaction boundaries.
- Serialize conflicting mutations; allow read-only inspection concurrently.
  Load/reload invalidates commands and references from the previous dataset.
- Long work returns an operation handle with progress, cancellation, and terminal
  status. UI state applied is distinct from animation complete or frame rendered.
- Events have sequence numbers and bounded buffering; clients can resynchronize
  through a snapshot after a gap. Provide polling when transport events are absent.
- Paginate images/points; never return the whole point cloud in a tool result.

### Initial tool surface

| Tool | Contract and result |
| --- | --- |
| get_capabilities | Version, available tools, backend limits, granted scopes |
| get_state | Dataset summary, camera, selection, appearance, transform and revisions |
| list_images / query_points | Bounded results with stable dataset-scoped IDs |
| set_appearance | Explicit fields/enums drawn from current stores; validate colors/ranges |
| set_camera | Absolute position, quaternion, target, projection, duration; return operation |
| orbit_camera | Explicit pivot, axis, degrees and reference frame; idempotency required |
| select_entities | Replace/add/remove stable image/point IDs; reject unavailable IDs |
| capture_view | Bounded image artifact, actual render revision, camera metadata |
| get_operation / cancel_operation | Inspect/cancel owned asynchronous work |
| preview_alignment | Proposed transform, residuals, affected resources, preview ID |
| apply_alignment / cancel_alignment | Consume matching preview and revision; enforce approval |
| undo / redo | Restore supported transactions without crossing a reload/history barrier |

Later: load_dataset, export_dataset, deletion tools and longer multi-step recipes.
Use existing URL/manifest validation. Local files require user-granted handles.
No new agent command may bypass parser validation or existing data protections.

## Geometry and visual feedback

Publish a convention document before exposing geometry tools: dataset coordinates
versus displayed scene coordinates versus camera coordinates; handedness; axis
directions; quaternion component order; angle units; transform multiplication
order; and pivot semantics. Distances use dataset units unless a scale has been
established. Provide explicit conversions through existing helpers.

Expose camera movement separately from geometry rotation: “rotate the view” must
never silently modify the reconstruction. Camera requests should target the live
controller, not just the store snapshot used for sharing URLs.

Alignment accepts stable point IDs, validated coordinates in a named frame, or
existing floor/centering operations. Reject degenerate/coincident/collinear inputs,
non-finite matrices, invalid scale, and incompatible dataset generations. Screen
picking, if added, must specify viewport dimensions and captured scene revision.

Preview uses the existing visual transform mechanism without baking data. Report
matrix/Sim3 parameters, constraints, residuals where meaningful, and before/after
captures. Changing selection or geometry invalidates a dependent preview.

`applyTransformToData()` currently bakes reconstruction changes and resets the
visual transform while maintaining splat transform state. Do not promise undo by
simply negating Euler angles. Use tested inverse operations or bounded snapshots
covering all affected state. If a safe history entry cannot fit, expose a clear
history barrier and require confirmation; agent geometry Apply stays unavailable
until its recovery behavior is implemented and tested.

Capture returns pixels from the actual supported render composition, including
the separate splat canvas when needed. Bound resolution and memory. Report tainted
canvas/unavailable capture as errors. Revoke artifact URLs on expiry/disconnect.
Do not claim a frame contains changes until renderer completion is observed.

## Session and control boundaries

- Pair a bridge to a specific tab, origin, and ephemeral session. Navigation,
  reload, disconnect, and Stop invalidate authorization and pending approvals.
- Browser permission and app permission both apply. A page token cannot protect
  against arbitrary same-origin script; rely on the browser/extension trust boundary.
- A local bridge uses authenticated loopback communication with origin checks,
  no wildcard cross-origin policy, and no unauthenticated public socket.
- Scope screenshots, filenames, and dataset metadata as data shared with the
  connected agent. Exclude local paths, credentials, and URL secrets from logs.
- Treat dataset labels and metadata as untrusted data, never instructions.
- Approval is tied to the exact proposed action and revision. The agent cannot
  approve itself or reuse approval after parameters/state change.
- Bound tool payloads, queues, runtime, history and artifact storage. No automatic
  reconnection with silent control after a new page session.

## Delivery phases and execution estimates

Effort is relative implementation complexity, not guaranteed elapsed time.
Use one primary implementation agent; review independently at phase boundaries.
No concurrent edits to shared command/history contracts.

| Phase | Deliverable | Suggested agent responsibility / reasoning | Effort |
| --- | --- | --- | --- |
| 0 | Inventory all relevant UI actions; versioned contracts; baseline tests and geometry conventions | Repository architecture / high | Medium |
| 1 | Shared appearance, camera and selection services; migrate corresponding human UI callers | Implementation / high | Large |
| 2 | Read tools, camera commands, actual viewport capture, cancellable operation registry | Viewer integration / high | Large |
| 3 | WebMCP adapter plus tested existing-tab bridge path; pairing, Stop, activity and scope UI | Browser integration / high | Large |
| 4 | Alignment preview/apply/cancel; transactional history and conflict handling | Geometry implementation / highest available effort | Large |
| 5 | Dataset loading, export and optional destructive tools with explicit recovery policies | Workflow implementation / high | Medium–large |
| 6 | Cross-client/browser evaluation, documentation, measured overhead and gradual rollout | Validation / high | Medium |

Phase 0 must inventory every existing feature and sub-operation, including read,
configure, execute, cancel, and recovery behavior where applicable. Each later
phase delivers both interfaces for its migrated features. Legacy features remain
explicitly pending in the coverage registry until migrated; they cannot silently
count as agent-supported. New features require both interfaces from introduction.

MVP completion is phases 0–3: human and agent can change colors, orbit/set camera,
select an image, and inspect the result in the same tab. The full requested
alignment workflow requires phase 4; do not present the MVP as covering alignment.
Full agent-native completion additionally requires all feature contracts in the
inventory to pass human/agent parity gates, including the phase 5 workflows.

## Acceptance gates

- Equivalent human and agent actions produce equivalent state and rendered output.
- “Color by reprojection error, show top view, capture” succeeds through a real
  connected agent without DOM-coordinate clicks or private store access.
- User interruption wins over agent animation and queued conflicting edits.
- Duplicate relative actions execute once; stale dataset/selection IDs are rejected.
- Agent disconnect/Stop during load, animation, capture, or preview leaves a
  consistent scene and never permits a late mutation.
- Alignment tests cover COLMAP cameras, points, splats, units, compositions,
  preview cancellation, apply, undo/redo, and export round-trip correctness.
- Test missing WebMCP support and adapter failures: human UI still works fully.
- Verify desktop/touch, keyboard focus, light/dark appearance, backend-specific
  capture and file/download restrictions. Publish only verified client support.
- Establish production-bundle and idle-frame baselines. No agent polling/render
  loop while disconnected, no per-frame React updates for command progress,
  and lazy-load adapters so ordinary startup does not pay their full cost.
- Run focused unit tests per change, controlled browser integration tests, full
  lint/unit/build gates, and existing E2E/render/geometry tests before release.

## Rollout and exclusions

Keep each phase independently reviewable. Ship agent access as opt-in initially;
document one verified end-to-end connection setup before broader compatibility.
Feature-disable adapters without disabling human command services. No changes to
rendering engines, no hosted model/chat service, and no unrestricted macro/eval
tool in this project. The performance-improvement plan remains a separate workstream;
coordinate dataset-generation/cancellation contracts before implementing both.
# Feature branch status

This work is retained on `codex/agent-control` without a release. The current
implementation provides the local MCP bridge, explicit tab pairing, shared
feature contracts and the startup Agent prompt button.

The requested next experience is: open ColmapView, copy the Agent prompt, paste
it into an agent, and approve control of that same tab. A hosted connection
service with MCP and documented HTTP access was proposed to remove local setup
and pairing-code copying. That hosted service and connection-link flow are not
implemented yet. They must preserve explicit tab approval, revocation and the
existing feature contracts.
