# Feature contracts: one behavior, two interfaces

Proposed architecture requirement, 2026-09-07. This document extends the
[agent-native plan](agent-native-plan.md); it does not claim these contracts exist yet.

Use [the implementation specification](agent-native-implementation-spec.md) for
packet assignments, detailed execution behavior and validation requirements.

## Core rule

Every user-facing capability has a versioned feature contract, a human interface,
and an agent interface. Both execute the same domain operations. Neither interface
owns separate validation, geometry logic, state mutation, or recovery behavior.

Human interface means the appropriate panel, shortcut, pointer gesture, dialog,
or accessible command entry. Agent interface means discoverable typed operations
and observable results, not a recipe for clicking the human interface.

Parity means the same semantic outcome and consistent constraints. A continuous
human drag may become a single agent set-camera operation; an agent need not
imitate pointer movement. A feature can expose several operations, and a tool can
group related operations with explicit schemas. Avoid one enormous arbitrary
execute-action tool and avoid a separate tool for every decorative UI element.

## Contract definition

Use a typed registry under `src/features/` (proposed). Features own contracts;
`src/commands/` implements the shared execution lifecycle and `src/agent/` supplies
transport adapters. Existing stores remain state owners during incremental migration.

Each operation specifies:

| Field | Required meaning |
| --- | --- |
| Identity | Stable feature and operation IDs, schema version, owner |
| Purpose | Human-readable label and precise agent description |
| Input | Validated schema, defaults, ranges, units, coordinate frame, references |
| Observation | Relevant state schema, queries, pagination, revisions and events |
| Availability | Dataset/backend/device prerequisites and structured unavailability reason |
| Execution | Shared handler, synchronous/async lifecycle, cancellation and completion definition |
| Output | Typed result, actual resulting state/revision, bounded artifacts |
| Failure | Stable error codes; whether any changes occurred and available recovery |
| Concurrency | Conflict domain, stale-state policy, deduplication and retry semantics |
| Effects | Read-only/reversible/destructive classification; affected resources |
| Permission | Required scope and user-gesture/approval handoff when applicable |
| History | Undo/redo implementation or explicit barrier; transaction boundaries |
| Human binding | Component/gesture/shortcut IDs, label association and accessibility coverage |
| Agent binding | Tool mapping and transport-neutral request/result conversion |
| Tests | Contract, parity, lifecycle, permission and relevant visual/data assertions |

Use existing Zod schemas/enums where possible and derive JSON schemas and tool
metadata from the same definitions. Do not independently maintain agent enums
and panel options. Keep UI layout handcrafted; sharing contracts does not require
generating every panel from a schema.

Example: `appearance.point_color.set` accepts a supported color mode and optional
mode-specific parameters; both the Point Cloud panel and the agent invoke it.
`camera.orbit` operates on view pose, while `geometry.transform.preview` operates
on the reconstruction preview. Their contracts make that distinction explicit.

## Coverage inventory

This is the initial domain inventory, not a claim of exhaustive operation coverage.
Phase 0 expands every row into operation-level entries by inspecting panels,
modals, menus, hotkeys, dataset adapters, store actions and hidden/contextual tools.

| Feature family | Human interface | Agent interface must cover |
| --- | --- | --- |
| Dataset lifecycle | Drop zone, folder/file picker, URL/manifest dialogs, toy loader | Load supported sources, select splat, progress, cancel, reload, source summary, user file-pick handoff |
| Camera navigation | Orbit/fly gestures, view controls, shortcuts | Pose, orbit pivot, presets, projection, FOV, speed, auto-rotation, horizon lock, stop animation, navigation history |
| Scene presentation | Background, Axes/Grid panels | Background, transparency, grid, axes, coordinate display and all configurable parameters |
| Point cloud and splats | Point Cloud panel, backend/status controls | Visibility, colors, size, filters, available splat/backend settings and diagnostics |
| Camera/frustum display | Camera Display and Selection Highlight panels | Modes, scale, opacity, colors, image planes, undistortion, auto-FOV and highlighting |
| Selection and picking | Gallery, viewport picking, selection tools | Query/select/deselect entities, stable IDs, picked coordinates and applicable multiselection |
| Gallery | Gallery toolbar and list/grid interactions | View mode, sorting, filtering, column/layout settings, reveal/open image, visible range query |
| Image viewer | Image detail popup and controls | Navigate/jump, 2D/3D overlays, masks, match selection/opacity, image metadata and capture |
| Matches and rigs | Matches and Rig panels | Modes, visibility, filtering, highlighting, rig/frame inspection and associated settings |
| Transform and alignment | Transform/Align panels, gizmo, scale/floor dialogs | Preview/set/reset, point constraints, scale, centering, floor detection, apply/cancel, recovery |
| Data editing/conversion | Deletion and Camera Conversion dialogs | Inspect candidates, propose/preview, apply, cancel, progress and supported undo/barriers |
| Capture and recording | Screenshot panel and recording controls | Capture settings, viewport artifacts, start/stop/cancel recording, progress and browser limitations |
| Export and sharing | Export/Share panels | Formats/options, artifact generation, progress, URL/config generation, explicit delivery handoff |
| Profiles/configuration | Profile selectors, import/export/reset controls | List/read/create/apply/save/delete profiles, config import/export/reset, persistence semantics |
| UI customization | Settings, auto-hide and context-menu editors | Theme, idle timeout, element visibility, menu composition and layout capabilities |
| Help and diagnostics | About/help/status/error/cache surfaces | Version, shortcuts, feature descriptions, supported capabilities, relevant bounded diagnostics |
| Browser operations | Fullscreen/pointer-lock/file/download controls | Request operation, report actual state, request user interaction where required |
| Agent session/history | Connection, activity, Stop and undo controls | Capabilities, operation status/cancel, history queries and scoped undo; agents cannot grant their own permissions |

Unsupported combinations are represented in both interfaces using the same
availability reason. Browser-required user actions use a typed
`requires_user_action` result with an operation handle; resumption must verify the
actual user action. Returning that result alone does not count as completing the task.
Do not bypass browser permissions to achieve nominal parity.

## Human and agent coexistence

- Queries expose the same authoritative values displayed by the UI.
- Mutations update the same state and normal UI; no invisible shadow session.
- Human input takes precedence over conflicting queued agent actions.
- Group continuous pointer/slider input into one history transaction, not one
  entry per frame. Do not add JSON serialization/transport overhead to every frame.
- Shared permission policy accounts for provenance: a user's Apply click may
  itself confirm an operation; an agent request may need a pending approval.
- Only the human/browser may grant control and data-sharing scopes. Read-only
  permission inspection is available to the agent, not self-authorization.

## Enforcement and migration

Maintain a registry-backed coverage report with states `legacy`, `contracted`,
`human-bound`, `agent-bound`, and `parity-verified`, plus missing prerequisites.
Generate documentation and the agent tool catalog from the registry.

CI gates for each migrated/new feature:

1. Stable IDs are unique; schemas and referenced human/agent bindings resolve.
2. Both adapters invoke the same handler and pass invalid-input/error cases.
3. Paired tests compare final state, side effects and geometry/artifact results.
   Screenshots supplement assertions; they are not the only correctness oracle.
4. Applicable cancel, retry, stale-state, approval and recovery tests pass.
5. Loading, unavailable, error and success outcomes are observable in both interfaces.
6. Existing human workflows, keyboard/touch behavior and performance budgets pass.

Registry checks alone cannot discover an unregistered feature. Require a feature
checklist in PR review, compare new user-facing actions/menus/hotkeys with the
inventory, and prohibit new direct business mutations in migrated UI modules
through targeted dependency/lint rules. Exempt rendering internals and ephemeral
presentation state; do not wrap every internal setter in a public command.

Migration order: inventory all features first, then migrate vertical slices with
both interfaces together. Start with appearance, camera and selection; follow with
alignment/history, dataset lifecycle, capture/export, and remaining features.
Audit the inventory at each milestone. A partial tool demo is not full completion.

Definition of done: every inventoried operation is parity-verified or explicitly
represented as unavailable for the same capability reason on both paths. No
permanent human-only or agent-only business features, undocumented exceptions,
duplicate implementations, or agent success responses for uncompleted handoffs.
