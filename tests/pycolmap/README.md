# pycolmap round-trip tests

Validates that production importers and COLMAP writers produce files readable
by the upstream `pycolmap` package. This complements the TypeScript action tests
and real-worker browser checks; the Python fixtures do not invoke UI store actions.

## What's covered

`test_camera_dataset_import.py` generates small original-schema fixtures on every
run. It checks binary and text exports for Blender, Nerfstudio, Instant-NGP,
fisheye, OpenSfM, OpenMVG, Bundler, Gaussian Splatting, LLFF and DTU, comparing
camera geometry and projected points through PyCOLMAP. No external dataset is
required for these cases.

`test_roundtrip.py` optionally checks the larger bicycle reconstruction using
these writer/math fixtures:

| Scenario | Contract |
|---|---|
| `untransformed` | baseline — writer output is self-consistent |
| `transform_baked` | transformed camera/point records retain materialized observations |
| `deletions_applied` | filtered records retain only surviving image tracks |
| `bug_empty_points2D` | negative control — the pre-fix state produces dangling track refs |

Each scenario is a COLMAP `sparse/0/` directory containing `cameras.bin`,
`images.bin`, `points3D.bin`.

## Running

Requires `uv`; it installs the Python dependencies declared in `pyproject.toml`.
Run commands from the viewer repository root. For the optional bicycle checks,
the default input is `../360_v2/bicycle/sparse/0/` relative to that root.
Set `COLMAP_BICYCLE_FIXTURE_DIR` to use another path.

```bash
# Generate camera-dataset fixtures and run all available cases
npm run test:pycolmap

# Regenerate optional bicycle fixtures too, when their source is available
npm run test:pycolmap:regen
```

Pytest invokes `npx vite-node tests/pycolmap/generate_camera_dataset_fixtures.ts`
for the synthetic cases. The optional bicycle generator is
`npx vite-node tests/pycolmap/generate_fixtures.ts`, invoked when its output is
missing or regeneration is requested. Previously generated bicycle fixtures can
also be checked without regenerating them.

If bicycle input and generated fixtures are absent, only the bicycle cases skip.
The synthetic camera-dataset checks still run.

## Why vite-node

The generators use the repository's Vite resolution for production TypeScript
imports. Pure filtering imports its `utils/filterReconstruction` owner directly,
without loading store actions just to reach a re-export.

The always-running [edit/export integrity tests](../../src/store/actions/editExportIntegrity.test.ts)
call the actual transform and deletion actions for service snapshots and the
legacy WASM compatibility path using a small generated binary fixture. The
[reconstruction-worker browser tests](../../e2e/reconstruction-worker.spec.ts)
exercise the real worker transport. These cover action wiring separately from
the optional Python writer fixtures.
